"""The pricer: a function from an option to its (bid, ask), USD per token.

That's the whole job. To add real pricing, write a function with the same
shape (option in, `(bid, ask)` out) and pass it where `flat_price` is used.
"""

import os
from collections.abc import Callable
from dataclasses import dataclass


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


# A pricer is a function: option -> (bid, ask) in USD per option token.
Pricer = Callable[[OptionParams], tuple[float, float]]


def flat_price(option: OptionParams) -> tuple[float, float]:  # noqa: ARG001 — info passed, unused
    """Flat price per token (PRICE_PER_TOKEN, default $10). Ignores the option."""
    price = float(os.environ.get("PRICE_PER_TOKEN", "10"))
    return price, price
