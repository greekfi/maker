from greek_mm.pricing.flat_source import FlatPriceSource
from greek_mm.pricing.source import OptionParams


def _option(*, is_put: bool = False, strike: float = 3000.0) -> OptionParams:
    return OptionParams(
        option_address="0x" + "ab" * 20,
        underlying="ETH",
        strike=strike,
        expiry=9_999_999_999,
        is_put=is_put,
        is_euro=False,
        decimals=18,
        chain_id=8453,
        collateral_address="0x" + "01" * 20,
        consideration_address="0x" + "02" * 20,
        window_seconds=28800,
        receipt_address="0x" + "03" * 20,
    )


async def test_default_is_ten() -> None:
    result = await FlatPriceSource().price(_option())
    assert result.bid == result.ask == result.mid == 10.0


async def test_custom_price() -> None:
    result = await FlatPriceSource(42.5).price(_option())
    assert result.bid == result.ask == result.mid == 42.5


async def test_ignores_option_info() -> None:
    src = FlatPriceSource(10.0)
    call = await src.price(_option(is_put=False, strike=3000.0))
    put = await src.price(_option(is_put=True, strike=0.0003))
    assert call.mid == put.mid == 10.0
