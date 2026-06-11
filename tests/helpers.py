"""Shared test stubs."""

from greek_mm.pricing.source import OptionParams, PriceResult


class StubSource:
    """PriceSource returning a fixed result (or None)."""

    def __init__(self, result: PriceResult | None) -> None:
        self.result = result
        self.calls: list[OptionParams] = []

    async def price(self, option: OptionParams) -> PriceResult | None:
        self.calls.append(option)
        return self.result


def make_result(bid: float = 95.0, ask: float = 105.0, mid: float = 100.0) -> PriceResult:
    return PriceResult(bid=bid, ask=ask, mid=mid)


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
        is_euro=False,
        decimals=decimals,
        chain_id=chain_id,
        collateral_address="0x4200000000000000000000000000000000000006",
        consideration_address="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        window_seconds=28800,
        receipt_address="0x" + "cd" * 20,
    )
