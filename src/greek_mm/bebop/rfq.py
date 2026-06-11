"""Turn an incoming Bebop RFQ into a quote (or a decline).

This is Bebop protocol glue: look up the option in the registry, ask the
price source for bid/ask, scale to a premium, and shape the response. It is
not pricing and it is not discovery — it just wires those together.
"""

import logging
import time

from greek_mm.pricing.premium import premium_amount
from greek_mm.pricing.pricer import Pricer
from greek_mm.pricing.registry import OptionRegistry

log = logging.getLogger(__name__)

# Premium is quoted in the consideration token (USDC, 6 decimals).
_PREMIUM_DECIMALS = 6
_QUOTE_TTL_SECONDS = 60


def _decline(rfq_id: str, reason: str) -> dict:
    return {"type": "decline", "rfq_id": rfq_id, "reason": reason}


async def build_quote(
    rfq: dict,
    registry: OptionRegistry,
    price: Pricer,
    maker_address: str,
) -> dict:
    """Quote or decline an RFQ. The maker quotes the premium per option token."""
    rfq_id = rfq["rfq_id"]
    buy = (rfq.get("buy_tokens") or [None])[0]
    sell = (rfq.get("sell_tokens") or [None])[0]
    original = rfq.get("_originalRequest") or {}

    if not buy or not sell:
        return _decline(rfq_id, "Invalid tokens")
    buying_option = buy["token"] in registry
    selling_option = sell["token"] in registry
    if not buying_option and not selling_option:
        return _decline(rfq_id, "No option token in request")
    if buying_option and selling_option:
        return _decline(rfq_id, "Cannot trade option for option")
    if not maker_address:
        return _decline(rfq_id, "MAKER_ADDRESS not set")

    try:
        if buying_option:
            # Taker buys the option: maker quotes the ask premium, taker pays it.
            option = registry.get(buy["token"])
            amount = int(buy["amount"])
            _bid, ask = price(option)
            premium = premium_amount(ask, amount, option.decimals, _PREMIUM_DECIMALS)
            buy_tokens = [{"token": sell["token"], "amount": str(premium)}]
            sell_tokens = [{"token": buy["token"], "amount": str(amount)}]
        else:
            # Taker sells the option: maker quotes the bid premium, taker receives it.
            option = registry.get(sell["token"])
            amount = int(sell["amount"])
            bid, _ask = price(option)
            premium = premium_amount(bid, amount, option.decimals, _PREMIUM_DECIMALS)
            buy_tokens = [{"token": sell["token"], "amount": str(amount)}]
            sell_tokens = [{"token": buy["token"], "amount": str(premium)}]
    except Exception as err:  # any failure becomes a decline
        log.error("RFQ %s error: %s", rfq_id[:8], err)
        return _decline(rfq_id, f"Error: {err}")

    log.info("RFQ %s quoted", rfq_id[:8])
    return {
        "type": "quote",
        "rfq_id": rfq_id,
        "maker_address": maker_address,
        "buy_tokens": buy_tokens,
        "sell_tokens": sell_tokens,
        "expiry": int(time.time()) + _QUOTE_TTL_SECONDS,
        "_originalRequest": original,
    }
