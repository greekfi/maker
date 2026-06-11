from helpers import make_option, stub_price

from greek_mm.bebop.rfq import build_quote
from greek_mm.pricing.registry import OptionRegistry

OPTION = "0x" + "ab" * 20
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
MAKER = "0x" + "11" * 20


def _registry() -> OptionRegistry:
    reg = OptionRegistry()
    reg.add(make_option(OPTION))
    return reg


async def test_taker_buys_option_pays_ask_premium() -> None:
    rfq = {
        "rfq_id": "r1",
        "buy_tokens": [{"token": OPTION, "amount": str(10**18)}],
        "sell_tokens": [{"token": USDC, "amount": "0"}],
    }
    quote = await build_quote(rfq, _registry(), stub_price(bid=95.0, ask=105.0), MAKER)
    assert quote["type"] == "quote"
    assert quote["maker_address"] == MAKER
    # 1 option at ask $105 -> taker pays 105 USDC.
    assert quote["buy_tokens"][0] == {"token": USDC, "amount": "105000000"}
    assert quote["sell_tokens"][0] == {"token": OPTION, "amount": str(10**18)}


async def test_taker_sells_option_receives_bid_premium() -> None:
    rfq = {
        "rfq_id": "r2",
        "buy_tokens": [{"token": USDC, "amount": "0"}],
        "sell_tokens": [{"token": OPTION, "amount": str(2 * 10**18)}],
    }
    quote = await build_quote(rfq, _registry(), stub_price(bid=95.0, ask=105.0), MAKER)
    # 2 options at bid $95 -> maker pays 190 USDC.
    assert quote["sell_tokens"][0] == {"token": USDC, "amount": "190000000"}
    assert quote["buy_tokens"][0] == {"token": OPTION, "amount": str(2 * 10**18)}


async def test_declines_when_no_option() -> None:
    rfq = {
        "rfq_id": "r3",
        "buy_tokens": [{"token": "0x" + "cc" * 20, "amount": "1"}],
        "sell_tokens": [{"token": "0x" + "dd" * 20, "amount": "1"}],
    }
    quote = await build_quote(rfq, _registry(), stub_price(), MAKER)
    assert quote == {"type": "decline", "rfq_id": "r3", "reason": "No option token in request"}


async def test_declines_option_for_option() -> None:
    reg = _registry()
    reg.add(make_option("0x" + "ee" * 20))
    rfq = {
        "rfq_id": "r4",
        "buy_tokens": [{"token": OPTION, "amount": "1"}],
        "sell_tokens": [{"token": "0x" + "ee" * 20, "amount": "1"}],
    }
    quote = await build_quote(rfq, reg, stub_price(), MAKER)
    assert quote["type"] == "decline"
    assert quote["reason"] == "Cannot trade option for option"
