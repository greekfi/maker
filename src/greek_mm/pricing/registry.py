"""Lazy option registration from OptionCreated events.

Decimals are read on-chain once per option and cached for the process
lifetime; put strikes are un-inverted from the contract's 1e36/K storage so
the PriceSource always sees consideration-per-collateral.
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

# Per-process decimals cache. Options inherit collateral decimals and can't
# change them, so one read per address is enough for ever.
_decimals_cache: dict[str, int] = {}


def feed_symbol_for(token_symbol: str | None) -> str | None:
    """Map a token symbol to the spot-feed key. ETH/BTC wrappers collapse."""
    if not token_symbol:
        return None
    s = token_symbol.upper()
    if s in ("WETH", "ETH") or s.endswith("ETH"):
        return "ETH"
    if s in ("WBTC", "BTC", "CBBTC") or s.endswith("BTC"):
        return "BTC"
    return None


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


async def register_from_event(pricer: Pricer, chain_id: int, event: dict) -> str | None:
    """Register one event's option if unknown. Returns the feed symbol or None."""
    args = event["args"]
    option_address = args["option"]
    existing = pricer.get_option(option_address)
    if existing is not None:
        return existing.underlying

    # Calls reference collateral; puts reference consideration.
    ref_address = args["consideration"] if args["isPut"] else args["collateral"]
    token = get_token_by_address(chain_id, ref_address)
    underlying = feed_symbol_for(token.symbol if token else None)
    if underlying is None:
        log.warning(
            "[registry] chain %s: unknown %s %s on option %s; not registering",
            chain_id,
            "consideration" if args["isPut"] else "collateral",
            ref_address,
            option_address,
        )
        return None

    decimals = await _read_decimals(chain_id, option_address)

    # Strike is 18-decimal fixed-point on chain; puts store 1/strike.
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
    return underlying


async def register_from_events(pricer: Pricer, chain_id: int, events: list[dict]) -> set[str]:
    """Register a batch; decimals reads run 16 at a time to stay RPC-polite."""
    underlyings: set[str] = set()
    batch = 16
    for i in range(0, len(events), batch):
        results = await asyncio.gather(
            *(register_from_event(pricer, chain_id, e) for e in events[i : i + batch])
        )
        underlyings.update(u for u in results if u)
    return underlyings


async def ensure_registered(pricer: Pricer, chain_id: int, option_address: str) -> bool:
    if pricer.is_option(option_address):
        return True
    event = store.find_by_option(chain_id, option_address)
    if event is None:
        return False
    return await register_from_event(pricer, chain_id, event) is not None
