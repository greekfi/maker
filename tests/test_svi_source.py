import math
import time

import pytest

from greek_mm.pricing.spot_feed import SpotFeed, StaticProvider
from greek_mm.pricing.svi_source import SviPriceSource


@pytest.fixture
def source() -> SviPriceSource:
    feed = SpotFeed()
    static = StaticProvider()
    static.set_price("ETH", 3000.0)
    feed.add_provider(static)
    return SviPriceSource(feed)


async def test_atm_call(source: SviPriceSource) -> None:
    result = await source.price(
        underlying="ETH",
        strike=3000.0,
        expiry=int(time.time()) + 30 * 86400,
        is_put=False,
        chain_id=8453,
        option_address="0x" + "ab" * 20,
    )
    assert result is not None
    assert 0 < result.bid < result.mid < result.ask
    assert result.spot == 3000.0
    # 30d ATM ETH call at ~80% vol is worth roughly 9% of spot.
    assert 150 < result.mid < 450
    assert 0.4 < result.delta < 0.7


async def test_put_call_relationship(source: SviPriceSource) -> None:
    expiry = int(time.time()) + 30 * 86400
    common = {
        "underlying": "ETH",
        "strike": 3000.0,
        "expiry": expiry,
        "chain_id": 8453,
        "option_address": "0x0",
    }
    call = await source.price(is_put=False, **common)
    put = await source.price(is_put=True, **common)
    assert call is not None and put is not None
    assert put.delta < 0 < call.delta
    # Same strike, same surface: identical IV for both sides (up to the
    # wall-clock drift between the two price() calls).
    assert math.isclose(put.iv, call.iv, rel_tol=1e-6)


async def test_expired_returns_none(source: SviPriceSource) -> None:
    result = await source.price(
        underlying="ETH",
        strike=3000.0,
        expiry=int(time.time()) - 60,
        is_put=False,
        chain_id=8453,
        option_address="0x0",
    )
    assert result is None


async def test_missing_spot_returns_none(source: SviPriceSource) -> None:
    result = await source.price(
        underlying="DOGE",
        strike=0.5,
        expiry=int(time.time()) + 86400,
        is_put=False,
        chain_id=8453,
        option_address="0x0",
    )
    assert result is None


async def test_min_spread_floor(source: SviPriceSource) -> None:
    # A deep-OTM short-dated call is nearly worthless: each side gets the
    # min_spread/2 floor, with the bid clamped at zero (same as node).
    result = await source.price(
        underlying="ETH",
        strike=30000.0,
        expiry=int(time.time()) + 86400,
        is_put=False,
        chain_id=8453,
        option_address="0x0",
    )
    assert result is not None
    assert result.bid == 0
    assert result.ask >= result.mid + 0.0005 - 1e-12
