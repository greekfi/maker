"""The option book: which options exist, and building them from events.

`OptionRegistry` is a plain container of `OptionParams`. The `register_*`
helpers turn OptionCreated events into options (reading token symbol +
decimals on-chain, cached) and add them to a registry. Every option is
registered — nothing is skipped.
"""

import asyncio
import logging

from greek_mm.config.clients import get_w3
from greek_mm.config.tokens import get_token_by_address
from greek_mm.events import store
from greek_mm.pricing.pricer import OptionParams

log = logging.getLogger(__name__)


class OptionRegistry:
    """A book of known options, keyed by lowercased address."""

    def __init__(self) -> None:
        self._options: dict[str, OptionParams] = {}

    def add(self, option: OptionParams) -> None:
        self._options[option.option_address.lower()] = option

    def get(self, address: str) -> OptionParams | None:
        return self._options.get(address.lower())

    def all(self) -> list[OptionParams]:
        return list(self._options.values())

    def addresses(self) -> list[str]:
        return list(self._options.keys())

    def __contains__(self, address: str) -> bool:
        return address.lower() in self._options


_DECIMALS_ABI = [
    {
        "name": "decimals",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "uint8"}],
    }
]
_SYMBOL_ABI = [
    {
        "name": "symbol",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "string"}],
    }
]

# Per-process caches: a token's symbol/decimals never change.
_symbol_cache: dict[str, str | None] = {}
_decimals_cache: dict[str, int] = {}


async def _resolve_symbol(chain_id: int, address: str) -> str | None:
    """Token symbol: static registry first, then on-chain symbol() (cached)."""
    token = get_token_by_address(chain_id, address)
    if token is not None:
        return token.symbol
    key = f"{chain_id}:{address.lower()}"
    if key in _symbol_cache:
        return _symbol_cache[key]
    try:
        w3 = get_w3(chain_id)
        contract = w3.eth.contract(address=w3.to_checksum_address(address), abi=_SYMBOL_ABI)
        symbol = str(await contract.functions.symbol().call())
    except Exception as err:  # unknown token stays unknown
        log.warning("symbol() failed for %s on chain %s: %s", address, chain_id, err)
        symbol = None
    _symbol_cache[key] = symbol
    return symbol


async def _read_decimals(chain_id: int, address: str) -> int:
    key = f"{chain_id}:{address.lower()}"
    cached = _decimals_cache.get(key)
    if cached is not None:
        return cached
    try:
        w3 = get_w3(chain_id)
        contract = w3.eth.contract(address=w3.to_checksum_address(address), abi=_DECIMALS_ABI)
        decimals = int(await contract.functions.decimals().call())
    except Exception as err:
        log.warning("decimals() failed for %s on chain %s: %s", address, chain_id, err)
        decimals = 18
    _decimals_cache[key] = decimals
    return decimals


async def register_from_event(registry: OptionRegistry, chain_id: int, event: dict) -> None:
    """Build an option from one event and add it to the registry (if new)."""
    args = event["args"]
    option_address = args["option"]
    if option_address in registry:
        return

    # The underlying label is the collateral for calls, consideration for
    # puts — purely informational (the flat price ignores it).
    ref_address = args["consideration"] if args["isPut"] else args["collateral"]
    underlying = await _resolve_symbol(chain_id, ref_address) or ref_address
    decimals = await _read_decimals(chain_id, option_address)

    # Strike is 18-decimal fixed-point on chain; puts store 1/strike, so
    # un-invert to keep `strike` human-readable (consideration-per-collateral).
    strike = int(args["strike"]) / 10**18
    if args["isPut"] and strike > 0:
        strike = 1 / strike

    registry.add(
        OptionParams(
            option_address=option_address,
            underlying=underlying,
            strike=strike,
            expiry=args["expirationDate"],
            is_put=args["isPut"],
            is_euro=args["isEuro"],
            decimals=decimals,
            chain_id=chain_id,
            collateral_address=args["collateral"],
            consideration_address=args["consideration"],
            window_seconds=args["windowSeconds"],
            receipt_address=args["receipt"],
        )
    )


async def register_from_events(
    registry: OptionRegistry, chain_id: int, events: list[dict]
) -> None:
    """Register a batch; on-chain reads run 16 at a time to stay RPC-polite."""
    batch = 16
    for i in range(0, len(events), batch):
        await asyncio.gather(
            *(register_from_event(registry, chain_id, e) for e in events[i : i + batch])
        )


async def ensure_registered(registry: OptionRegistry, chain_id: int, option_address: str) -> bool:
    if option_address in registry:
        return True
    event = store.find_by_option(chain_id, option_address)
    if event is None:
        return False
    await register_from_event(registry, chain_id, event)
    return True
