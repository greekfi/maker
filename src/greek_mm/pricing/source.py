"""The pricing seam.

PriceSource.price(...) takes every parameter needed to price an option and
returns a two-sided market. The signature is the contract: a remote pricing
service replaces SviPriceSource by implementing this protocol — no hidden
state (spot, surface, spreads) crosses the boundary.

Unit contract: prices are USD per 1 unit of underlying notional. `strike`
is always consideration-per-collateral (puts arrive already un-inverted
from their on-chain 1e36/K storage — see registry.py).
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PriceResult:
    bid: float
    ask: float
    mid: float
    iv: float
    spot: float
    delta: float
    gamma: float
    theta: float
    vega: float
    time_to_expiry: float


class PriceSource(Protocol):
    async def price(
        self,
        *,
        underlying: str,
        strike: float,
        expiry: int,
        is_put: bool,
        chain_id: int,
        option_address: str,
    ) -> PriceResult | None: ...
