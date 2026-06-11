"""Flat price source: every option quotes at the same price per token.

Placeholder until real pricing lands. The full option info is handed in via
`option` (strike, expiry, is_put, collateral/consideration, ...) — this
implementation ignores it and returns a flat price. Replace it with a
PriceSource that actually uses the option.
"""

from greek_mm.pricing.source import OptionParams, PriceResult


class FlatPriceSource:
    def __init__(self, price_per_token: float = 10.0) -> None:
        self._price = price_per_token

    async def price(self, option: OptionParams) -> PriceResult:  # noqa: ARG002 — info passed, unused
        return PriceResult(bid=self._price, ask=self._price, mid=self._price)
