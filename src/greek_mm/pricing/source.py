"""The pricing seam.

`PriceSource.price(...)` takes all the option information and returns a
two-sided market (bid/ask). This is the one thing to replace with real
pricing — implement this protocol and inject it into the Pricer. The
default implementation (FlatPriceSource) just returns a flat price.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PriceResult:
    bid: float
    ask: float
    mid: float


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
