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


async def test_ask_premium_exact_int_math(pricer: Pricer) -> None:
    # 2.5 option units (18 dec) at ask $105 → 262.5 premium = 262_500_000 (6 dec)
    amount = 25 * 10**17
    premium = await pricer.ask_premium(OPTION, amount, USDC_DECIMALS)
    assert premium == amount * 105_000_000 // 10**18
    assert premium == 262_500_000


async def test_bid_premium_exact_int_math(pricer: Pricer) -> None:
    amount = 10**18
    premium = await pricer.bid_premium(OPTION, amount, USDC_DECIMALS)
    assert premium == 95_000_000


async def test_price_passes_full_option_to_source(pricer: Pricer) -> None:
    # The whole option object reaches the PriceSource, even though the flat
    # source ignores it — a real pricer gets everything it needs.
    source: StubSource = pricer.source  # type: ignore[assignment]
    await pricer.price(OPTION)
    passed = source.calls[0]
    assert passed is pricer.get_option(OPTION)
    assert passed.strike == 3000.0
    assert passed.expiry == 4_000_000_000
    assert passed.is_put is False
    assert passed.collateral_address == "0x4200000000000000000000000000000000000006"
    assert passed.consideration_address == "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    assert passed.window_seconds == 28800


async def test_get_price_levels_format(pricer: Pricer) -> None:
    levels = await pricer.get_price(OPTION)
    assert levels == {"bids": [[95.0, 1000]], "asks": [[105.0, 1000]]}


async def test_put_and_call_both_pass_through(pricer: Pricer) -> None:
    # The price is per token, flat — calls and puts both get the source
    # price unchanged (no strike normalization).
    put = "0x" + "99" * 20
    pricer.register_option(make_option(put, is_put=True, strike=3000.0))
    call_result = await pricer.price(OPTION)
    put_result = await pricer.price(put)
    assert call_result is not None and put_result is not None
    assert call_result.bid == put_result.bid == 95.0
    assert call_result.ask == put_result.ask == 105.0


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
