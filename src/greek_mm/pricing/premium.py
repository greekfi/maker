"""Premium scaling: per-token USD price -> on-chain premium-token base units.

Pure integer math (Python ints are arbitrary precision, so this is exact).
"""


def premium_amount(
    unit_price: float, option_amount: int, option_decimals: int, premium_decimals: int
) -> int:
    """Premium owed for `option_amount` option base units at `unit_price`/token."""
    scaled = int(unit_price * 10**premium_decimals)
    return option_amount * scaled // 10**option_decimals
