import pytest
from helpers import StubSource, make_option, make_result

from greek_mm.pricing.pricer import Pricer

OPTION = "0x" + "ab" * 20
USDC_DECIMALS = 6


@pytest.fixture
def pricer() -> Pricer:
    p = Pricer(StubSource(make_result(bid=95.0, ask=105.0)), chain_id=8453)
    p.register_option(make_option(OPTION))
    return p


def test_registry_case_insensitive(pricer: Pricer) -> None:
    assert pricer.is_option(OPTION.upper().replace("0X", "0x"))
    assert pricer.get_option(OPTION) is not None
    assert pricer.option_addresses() == [OPTION.lower()]


async def test_ask_quote_exact_int_math(pricer: Pricer) -> None:
    # 2.5 option units (18 dec) at ask $105 → 262.5 USDC = 262_500_000 (6 dec)
    amount = 25 * 10**17
    cost = await pricer.ask_quote(OPTION, amount, USDC_DECIMALS)
    assert cost == amount * 105_000_000 // 10**18
    assert cost == 262_500_000


async def test_bid_quote_exact_int_math(pricer: Pricer) -> None:
    amount = 10**18
    payout = await pricer.bid_quote(OPTION, amount, USDC_DECIMALS)
    assert payout == 95_000_000


async def test_price_passes_seam_params(pricer: Pricer) -> None:
    source: StubSource = pricer.source  # type: ignore[assignment]
    await pricer.price(OPTION)
    call = source.calls[0]
    assert call == {
        "underlying": "ETH",
        "strike": 3000.0,
        "expiry": 4_000_000_000,
        "is_put": False,
        "chain_id": 8453,
        "option_address": OPTION,
    }


async def test_get_price_levels_format(pricer: Pricer) -> None:
    levels = await pricer.get_price(OPTION)
    assert levels == {"bids": [[95.0, 1000]], "asks": [[105.0, 1000]]}


async def test_put_price_is_per_token(pricer: Pricer) -> None:
    # A put token is denominated in consideration collateral: exercising
    # `strike` tokens covers 1 unit of underlying, so per-token price is
    # the source's notional price divided by strike. Greeks scale too.
    put = "0x" + "99" * 20
    pricer.register_option(make_option(put, is_put=True, strike=3000.0))
    result = await pricer.price(put)
    assert result is not None
    source_result = make_result(bid=95.0, ask=105.0)
    assert result.bid == pytest.approx(95.0 / 3000.0, rel=1e-12)
    assert result.ask == pytest.approx(105.0 / 3000.0, rel=1e-12)
    assert result.mid == pytest.approx(100.0 / 3000.0, rel=1e-12)
    assert result.delta == pytest.approx(source_result.delta / 3000.0, rel=1e-12)
    # IV and spot are surface/market facts, not per-token quantities.
    assert result.iv == source_result.iv
    assert result.spot == source_result.spot


async def test_put_quote_scaling_uses_per_token_price(pricer: Pricer) -> None:
    put = "0x" + "99" * 20
    pricer.register_option(make_option(put, is_put=True, strike=3000.0))
    # Selling 3000 put tokens (one underlying unit of coverage) at source
    # bid $95 → 3000 * (95/3000) = $95 worth of USDC, minus int flooring.
    payout = await pricer.bid_quote(put, 3000 * 10**18, USDC_DECIMALS)
    assert payout == 3000 * 10**18 * int(95.0 / 3000.0 * 10**6) // 10**18
    assert payout == 94_998_000  # floor(95/3000 * 1e6) = 31666 per token


async def test_call_price_unscaled(pricer: Pricer) -> None:
    result = await pricer.price(OPTION)
    assert result is not None
    assert result.bid == 95.0
    assert result.ask == 105.0


async def test_rfq_buy_option(pricer: Pricer, monkeypatch: pytest.MonkeyPatch) -> None:
    maker = "0x" + "11" * 20
    monkeypatch.setenv("MAKER_ADDRESS", maker)
    monkeypatch.delenv("PRIVATE_KEY", raising=False)
    rfq = {
        "rfq_id": "rfq-1",
        "buy_tokens": [{"token": OPTION, "amount": str(10**18)}],
        "sell_tokens": [{"token": "0x" + "cc" * 20, "amount": "0"}],
        "_originalRequest": {},
    }
    response = await pricer.handle_rfq(rfq)
    assert response["type"] == "quote"
    assert response["maker_address"] == maker
    # Maker sells 1 option at ask $105 → taker pays 105 USDC.
    assert response["buy_tokens"][0]["amount"] == "105000000"
    assert response["sell_tokens"][0]["amount"] == str(10**18)


async def test_rfq_declines_non_option(pricer: Pricer) -> None:
    rfq = {
        "rfq_id": "rfq-2",
        "buy_tokens": [{"token": "0x" + "cc" * 20, "amount": "1"}],
        "sell_tokens": [{"token": "0x" + "dd" * 20, "amount": "1"}],
    }
    response = await pricer.handle_rfq(rfq)
    assert response == {
        "type": "decline",
        "rfq_id": "rfq-2",
        "reason": "No option token in request",
    }


async def test_rfq_declines_option_for_option(pricer: Pricer) -> None:
    pricer.register_option(make_option("0x" + "ee" * 20))
    rfq = {
        "rfq_id": "rfq-3",
        "buy_tokens": [{"token": OPTION, "amount": "1"}],
        "sell_tokens": [{"token": "0x" + "ee" * 20, "amount": "1"}],
    }
    response = await pricer.handle_rfq(rfq)
    assert response["type"] == "decline"
    assert response["reason"] == "Cannot trade option for option"
