"""Shared test stubs."""

from greek_mm.pricing.pricer import OptionParams
from greek_mm.pricing.source import PriceResult


class StubSource:
    """PriceSource returning a fixed result (or None)."""

    def __init__(self, result: PriceResult | None) -> None:
        self.result = result
        self.calls: list[dict] = []

    async def price(self, **kwargs) -> PriceResult | None:
        self.calls.append(kwargs)
        return self.result


def make_result(bid: float = 95.0, ask: float = 105.0, mid: float = 100.0) -> PriceResult:
    return PriceResult(
        bid=bid,
        ask=ask,
        mid=mid,
        iv=0.8,
        spot=3000.0,
        delta=0.5,
        gamma=0.001,
        theta=-1.2,
        vega=3.4,
        time_to_expiry=0.08,
    )


def make_option(
    address: str = "0x" + "ab" * 20,
    *,
    strike: float = 3000.0,
    expiry: int = 4_000_000_000,
    is_put: bool = False,
    decimals: int = 18,
    chain_id: int = 8453,
) -> OptionParams:
    return OptionParams(
        option_address=address,
        underlying="ETH",
        strike=strike,
        expiry=expiry,
        is_put=is_put,
        decimals=decimals,
        chain_id=chain_id,
        collateral_address="0x4200000000000000000000000000000000000006",
    )
