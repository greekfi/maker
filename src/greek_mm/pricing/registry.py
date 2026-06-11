"""Register options from OptionCreated events into a Pricer.

Pulls the option's terms straight off the event (strike, expiry, is_put,
collateral/consideration) and reads the token symbol + decimals on-chain
(cached). Every option is registered — nothing is skipped — so the flat
price applies to all of them.
"""

import asyncio
import logging

from greek_mm.config.clients import get_w3
from greek_mm.config.tokens import get_token_by_address
from greek_mm.events import store
from greek_mm.pricing.pricer import OptionParams, Pricer

log = logging.getLogger(__name__)

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


async def register_from_event(pricer: Pricer, chain_id: int, event: dict) -> str:
    """Register one event's option if unknown. Returns its option address."""
    args = event["args"]
    option_address = args["option"]
    if pricer.is_option(option_address):
        return option_address

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

    pricer.register_option(
        OptionParams(
            option_address=option_address,
            underlying=underlying,
            strike=strike,
            expiry=args["expirationDate"],
            is_put=args["isPut"],
            decimals=decimals,
            chain_id=chain_id,
            collateral_address=args["collateral"],
        )
    )
    return option_address


async def register_from_events(pricer: Pricer, chain_id: int, events: list[dict]) -> None:
    """Register a batch; on-chain reads run 16 at a time to stay RPC-polite."""
    batch = 16
    for i in range(0, len(events), batch):
        await asyncio.gather(
            *(register_from_event(pricer, chain_id, e) for e in events[i : i + batch])
        )


async def ensure_registered(pricer: Pricer, chain_id: int, option_address: str) -> bool:
    if pricer.is_option(option_address):
        return True
    event = store.find_by_option(chain_id, option_address)
    if event is None:
        return False
    await register_from_event(pricer, chain_id, event)
    return True
