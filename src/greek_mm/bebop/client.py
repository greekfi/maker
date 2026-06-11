"""Bebop maker RFQ WebSocket client.

Receives taker_quote requests, hands them to an async RFQ handler (the
Pricer), signs the response, and replies in Bebop's v3 message format.
Reconnects forever with exponential backoff capped at 5 minutes.
"""

import asyncio
import json
import logging
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import websockets

from greek_mm.bebop.signing import sign_quote

log = logging.getLogger(__name__)

BEBOP_WS_BASE = "wss://api.bebop.xyz/pmm"
_MAX_RECONNECT_DELAY = 300.0

RfqHandler = Callable[[dict], Awaitable[dict]]


@dataclass(frozen=True)
class BebopConfig:
    chain: str  # bebop chain name, e.g. "ethereum"
    chain_id: int
    marketmaker: str
    authorization: str
    maker_address: str
    private_key: str | None = None


class BebopClient:
    def __init__(self, config: BebopConfig, rfq_handler: RfqHandler) -> None:
        self._config = config
        self._rfq_handler = rfq_handler
        self._ws: websockets.ClientConnection | None = None

    @property
    def ws_url(self) -> str:
        return f"{BEBOP_WS_BASE}/{self._config.chain}/v3/maker/quote"

    async def run(self) -> None:
        """Connect and process messages forever. Cancel the task to stop."""
        attempt = 0
        while True:
            try:
                log.info("Connecting to %s...", self.ws_url)
                async with websockets.connect(
                    self.ws_url,
                    additional_headers={
                        "marketmaker": self._config.marketmaker,
                        "authorization": self._config.authorization,
                    },
                    ping_interval=30,
                ) as ws:
                    self._ws = ws
                    attempt = 0
                    log.info("Connected to Bebop")
                    async for raw in ws:
                        await self._handle_message(raw)
            except asyncio.CancelledError:
                raise
            except Exception as err:
                log.warning("Bebop connection error: %s", err)
            finally:
                self._ws = None

            delay = min(1.0 * 2**attempt, _MAX_RECONNECT_DELAY)
            attempt += 1
            log.info("Reconnecting in %.0fs... (attempt %d)", delay, attempt)
            await asyncio.sleep(delay)

    async def _handle_message(self, raw: str | bytes) -> None:
        text = raw.decode() if isinstance(raw, bytes) else raw
        try:
            message = json.loads(text)
        except json.JSONDecodeError:
            log.error("Failed to parse message: %s", text[:200])
            return

        if message.get("msg_topic") == "taker_quote" and message.get("msg_type") == "request":
            rfq_data = message["msg"]
            quotes = rfq_data.get("quotes") or []
            rfq = {
                "type": "rfq",
                "rfq_id": rfq_data["quote_id"],
                "chain_id": message.get("chain_id"),
                "taker_address": rfq_data.get("taker_address"),
                "buy_tokens": [
                    {"token": q["maker_token"], "amount": q.get("maker_amount") or "0"}
                    for q in quotes
                ],
                "sell_tokens": [
                    {"token": q["taker_token"], "amount": q.get("taker_amount") or "0"}
                    for q in quotes
                ],
                "receiver_address": rfq_data.get("receiver"),
                "expiry": rfq_data.get("expiry"),
                "_originalRequest": {
                    key: rfq_data.get(key)
                    for key in (
                        "event_id",
                        "order_signing_type",
                        "order_type",
                        "onchain_partner_id",
                        "maker_nonce",
                        "commands",
                        "packed_commands",
                        "fee_native",
                        "is_aggregate_order",
                        "origin_address",
                        "expiry_type",
                        "receiver",
                        "taker_address",
                    )
                },
            }
            await self._handle_rfq(rfq)
            return

        if message.get("type") == "heartbeat":
            return
        log.debug("Unhandled message: %s", text[:200])

    async def _handle_rfq(self, rfq: dict) -> None:
        log.info("RFQ received: %s", rfq["rfq_id"])
        try:
            response = await self._rfq_handler(rfq)
        except Exception as err:
            log.error("RFQ handler error: %s", err)
            await self.decline(rfq["rfq_id"], "Handler error")
            return
        if response:
            await self._send(response)

    async def decline(self, rfq_id: str, reason: str | None = None) -> None:
        await self._send({"type": "decline", "rfq_id": rfq_id, "reason": reason})

    async def _send(self, message: dict) -> None:
        if self._ws is None:
            log.error("Not connected, cannot send message")
            return

        if message["type"] == "quote":
            bebop_message = self._build_quote_message(message)
            if bebop_message is None:
                return
        elif message["type"] == "decline":
            bebop_message = {
                "msg_topic": "taker_quote",
                "msg_type": "decline",
                "msg": {
                    "quote_id": message["rfq_id"],
                    "reason": message.get("reason") or "Declined",
                },
            }
        else:
            bebop_message = message

        await self._ws.send(json.dumps(bebop_message))

    def _build_quote_message(self, message: dict) -> dict | None:
        if any(t["amount"] == "0" for t in message["buy_tokens"] + message["sell_tokens"]):
            log.error("Cannot send quote with zero amounts")
            return None

        original = message.get("_originalRequest") or {}

        quotes = []
        for idx, buy_token in enumerate(message["buy_tokens"]):
            sell_token = message["sell_tokens"][idx]
            taker_amount = float(sell_token["amount"])
            maker_amount = float(buy_token["amount"])
            quotes.append(
                {
                    "taker_token": sell_token["token"],
                    "maker_token": buy_token["token"],
                    "taker_amount": sell_token["amount"],
                    "maker_amount": buy_token["amount"],
                    "reference_price": taker_amount / maker_amount if maker_amount > 0 else 0,
                }
            )

        msg = {
            "quote_id": message["rfq_id"],
            "event_id": original.get("event_id"),
            "order_signing_type": original.get("order_signing_type"),
            "order_type": original.get("order_type"),
            "onchain_partner_id": original.get("onchain_partner_id"),
            "expiry": message["expiry"],
            "taker_address": original.get("taker_address"),
            "maker_address": message["maker_address"],
            "maker_nonce": original.get("maker_nonce"),
            "quotes": quotes,
            "receiver": original.get("receiver"),
            "commands": original.get("commands"),
            "packed_commands": original.get("packed_commands"),
            "fee_native": original.get("fee_native"),
            "is_aggregate_order": original.get("is_aggregate_order"),
            "expiry_type": original.get("expiry_type") or "standard",
        }
        if original.get("origin_address"):
            msg["origin_address"] = original["origin_address"]

        private_key = self._config.private_key or os.environ.get("PRIVATE_KEY")
        if private_key:
            try:
                signed = sign_quote(
                    {
                        "chain_id": self._config.chain_id,
                        "order_signing_type": msg["order_signing_type"] or "SingleOrder",
                        "order_type": msg["order_type"] or "Single",
                        "onchain_partner_id": msg["onchain_partner_id"] or 0,
                        "expiry": msg["expiry"],
                        "taker_address": msg["taker_address"] or "",
                        "maker_address": msg["maker_address"],
                        "maker_nonce": msg["maker_nonce"] or "0",
                        "receiver": msg["receiver"] or "",
                        "packed_commands": msg["packed_commands"] or "0",
                        "quotes": msg["quotes"],
                    },
                    private_key,
                )
                msg["signature"] = signed["signature"]
            except Exception as err:
                log.error("Failed to sign quote: %s", err)
        else:
            log.warning("No private key configured - sending unsigned quote")

        return {
            "chain_id": self._config.chain_id,
            "msg_topic": "taker_quote",
            "msg_type": "response",
            "msg": msg,
        }
