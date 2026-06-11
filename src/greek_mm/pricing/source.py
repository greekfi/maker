"""The pricing seam.

`PriceSource.price(option)` is handed the full option information and returns
a two-sided market (bid/ask). This is the one thing to replace with real
pricing — implement this protocol and inject it into the Pricer. The default
implementation (FlatPriceSource) ignores the option and returns a flat price.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class OptionParams:
    """Everything known about an option, straight from its OptionCreated event."""

    option_address: str
    underlying: str  # symbol of the collateral (call) / consideration (put) token
    strike: float  # human-readable, consideration-per-collateral
    expiry: int  # unix seconds
    is_put: bool
    is_euro: bool
    decimals: int  # option token decimals
    chain_id: int
    collateral_address: str
    consideration_address: str
    window_seconds: int
    receipt_address: str


@dataclass(frozen=True)
class PriceResult:
    bid: float
    ask: float
    mid: float


class PriceSource(Protocol):
    async def price(self, option: OptionParams) -> PriceResult | None: ...
