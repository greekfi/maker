from greek_mm.pricing.flat_source import FlatPriceSource

PARAMS = {
    "underlying": "ETH",
    "strike": 3000.0,
    "expiry": 9_999_999_999,
    "is_put": False,
    "chain_id": 8453,
    "option_address": "0x" + "ab" * 20,
}


async def test_default_is_ten() -> None:
    result = await FlatPriceSource().price(**PARAMS)
    assert result.bid == result.ask == result.mid == 10.0


async def test_custom_price() -> None:
    result = await FlatPriceSource(42.5).price(**PARAMS)
    assert result.bid == result.ask == result.mid == 42.5


async def test_ignores_option_info() -> None:
    src = FlatPriceSource(10.0)
    call = await src.price(**{**PARAMS, "is_put": False, "strike": 3000.0})
    put = await src.price(**{**PARAMS, "is_put": True, "strike": 0.0003, "underlying": "BTC"})
    assert call.mid == put.mid == 10.0
