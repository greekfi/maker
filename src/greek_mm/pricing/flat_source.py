"""Flat price source: every option quotes at the same price per token.

Placeholder until real pricing lands. Swap this for a PriceSource that
actually uses the option info (strike, expiry, is_put, ...) that gets
passed to price().
"""

from greek_mm.pricing.source import PriceResult


class FlatPriceSource:
    def __init__(self, price_per_token: float = 10.0) -> None:
        self._price = price_per_token

    async def price(
        self,
        *,
        underlying: str,  # noqa: ARG002 — option info is part of the seam, ignored here
        strike: float,  # noqa: ARG002
        expiry: int,  # noqa: ARG002
        is_put: bool,  # noqa: ARG002
        chain_id: int,  # noqa: ARG002
        option_address: str,  # noqa: ARG002
    ) -> PriceResult:
        return PriceResult(bid=self._price, ask=self._price, mid=self._price)
