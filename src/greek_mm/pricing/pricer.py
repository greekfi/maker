"""Per-chain option registry + quote scaling + Bebop RFQ handling.

Pricing itself is delegated to the injected PriceSource (the seam) — the
Pricer only owns what is genuinely stateful: which options exist on this
chain and how to convert per-unit USD prices into on-chain token amounts.

Put normalization happens here, not behind the seam: the source quotes USD
per 1 unit of underlying notional, but a put option token is denominated in
consideration collateral — exercising `strike` tokens covers one unit of
underlying. So price_per_token = source_price / strike for puts (equivalent
to multiplying by the contract-stored inverted strike). Only the price is
normalized; greeks stay standard option greeks, matching the node MM and
the frontend. Calls pass through unchanged.
"""

import dataclasses
import logging
import os
import time
from dataclasses import dataclass

from greek_mm.pricing.source import PriceResult, PriceSource

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class OptionParams:
    option_address: str
    underlying: str
    strike: float  # consideration per collateral, puts already un-inverted
    expiry: int  # unix seconds
    is_put: bool
    decimals: int
    chain_id: int
    collateral_address: str | None = None


class Pricer:
    def __init__(self, source: PriceSource, chain_id: int) -> None:
        self.source = source
        self.chain_id = chain_id
        self._options: dict[str, OptionParams] = {}

    # === registry ===

    def register_option(self, option: OptionParams) -> None:
        self._options[option.option_address.lower()] = option

    def get_option(self, address: str) -> OptionParams | None:
        return self._options.get(address.lower())

    def all_options(self) -> list[OptionParams]:
        return list(self._options.values())

    def option_addresses(self) -> list[str]:
        return list(self._options.keys())

    def is_option(self, address: str) -> bool:
        return address.lower() in self._options

    # === pricing ===

    async def price(self, option_address: str) -> PriceResult | None:
        """Two-sided market in USD per 1 option token."""
        option = self.get_option(option_address)
        if option is None:
            return None
        result = await self.source.price(
            underlying=option.underlying,
            strike=option.strike,
            expiry=option.expiry,
            is_put=option.is_put,
            chain_id=self.chain_id,
            option_address=option.option_address,
        )
        if result is None:
            return None
        if option.is_put and option.strike > 0:
            result = dataclasses.replace(
                result,
                bid=result.bid / option.strike,
                ask=result.ask / option.strike,
                mid=result.mid / option.strike,
            )
        return result

    async def get_price(self, option_address: str) -> dict | None:
        """[price, size] levels format for the Bebop pricing stream."""
        result = await self.price(option_address)
        if result is None:
            return None
        return {"bids": [[result.bid, 1000]], "asks": [[result.ask, 1000]]}

    # === quote scaling (exact integer math) ===

    async def ask_quote(self, option_address: str, amount: int, decimals: int) -> int | None:
        """Cost in consideration token units for buying `amount` option units."""
        result = await self.price(option_address)
        option = self.get_option(option_address)
        if result is None or option is None:
            return None
        ask_scaled = int(result.ask * 10**decimals)
        return amount * ask_scaled // 10**option.decimals

    async def bid_quote(self, option_address: str, amount: int, decimals: int) -> int | None:
        """Payout in consideration token units for selling `amount` option units."""
        result = await self.price(option_address)
        option = self.get_option(option_address)
        if result is None or option is None:
            return None
        bid_scaled = int(result.bid * 10**decimals)
        return amount * bid_scaled // 10**option.decimals

    # === Bebop RFQ ===

    async def handle_rfq(self, rfq: dict) -> dict:
        """Port of node Pricer.handleRfq: quote or decline an incoming RFQ."""
        rfq_id = rfq["rfq_id"]
        buy_tokens = rfq.get("buy_tokens") or []
        sell_tokens = rfq.get("sell_tokens") or []
        original = rfq.get("_originalRequest") or {}

        buy = buy_tokens[0] if buy_tokens else None
        sell = sell_tokens[0] if sell_tokens else None
        if not buy or not sell:
            return {"type": "decline", "rfq_id": rfq_id, "reason": "Invalid tokens"}

        is_buying_option = self.is_option(buy["token"])
        is_selling_option = self.is_option(sell["token"])
        if not is_buying_option and not is_selling_option:
            return {"type": "decline", "rfq_id": rfq_id, "reason": "No option token in request"}
        if is_buying_option and is_selling_option:
            return {"type": "decline", "rfq_id": rfq_id, "reason": "Cannot trade option for option"}

        try:
            maker_address = os.environ.get("MAKER_ADDRESS")
            if not maker_address:
                msg = "MAKER_ADDRESS not set"
                raise ValueError(msg)

            if is_buying_option:
                # Taker buys options: maker sells at ask, taker pays consideration.
                option_address = buy["token"]
                option_amount = int(buy["amount"])
                consideration = await self.ask_quote(option_address, option_amount, 6)
                if consideration is None:
                    msg = "Failed to calculate quote"
                    raise ValueError(msg)
                quote = {
                    "type": "quote",
                    "rfq_id": rfq_id,
                    "maker_address": maker_address,
                    "buy_tokens": [{"token": sell["token"], "amount": str(consideration)}],
                    "sell_tokens": [{"token": buy["token"], "amount": str(option_amount)}],
                    "expiry": int(time.time()) + 60,
                    "_originalRequest": original,
                }
            else:
                # Taker sells options: maker buys at bid, pays consideration.
                option_address = sell["token"]
                option_amount = int(sell["amount"])
                consideration = await self.bid_quote(option_address, option_amount, 6)
                if consideration is None:
                    msg = "Failed to calculate quote"
                    raise ValueError(msg)
                quote = {
                    "type": "quote",
                    "rfq_id": rfq_id,
                    "maker_address": maker_address,
                    "buy_tokens": [{"token": sell["token"], "amount": str(option_amount)}],
                    "sell_tokens": [{"token": buy["token"], "amount": str(consideration)}],
                    "expiry": int(time.time()) + 60,
                    "_originalRequest": original,
                }

            log.info("RFQ %s quoted", rfq_id[:8])
        except Exception as err:
            log.error("RFQ %s error: %s", rfq_id[:8], err)
            return {"type": "decline", "rfq_id": rfq_id, "reason": f"Error: {err}"}
        else:
            return quote
