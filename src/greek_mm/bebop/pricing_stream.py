"""Bebop maker pricing stream: protobuf level pushes every 10 seconds."""

import asyncio
import logging
import os
from dataclasses import dataclass

import websockets

from greek_mm.bebop.proto import pricing_pb2
from greek_mm.pricing.pricer import Pricer

log = logging.getLogger(__name__)

BEBOP_WS_BASE = "wss://api.bebop.xyz/pmm"
_MAX_RECONNECT_DELAY = 300.0
_SEND_INTERVAL = 10.0
_MAX_SPREAD_BPS = 500  # Bebop rejects abnormally wide spreads


@dataclass(frozen=True)
class PricingStreamConfig:
    chain: str
    chain_id: int
    marketmaker: str
    authorization: str
    maker_address: str
    usdc_address: str


def _hex_to_bytes(hex_str: str) -> bytes:
    return bytes.fromhex(hex_str.removeprefix("0x"))


class MakerPricingStream:
    def __init__(self, config: PricingStreamConfig, pricer: Pricer) -> None:
        self._config = config
        self._pricer = pricer

    @property
    def ws_url(self) -> str:
        return f"{BEBOP_WS_BASE}/{self._config.chain}/v3/maker/pricing?format=protobuf"

    async def run(self) -> None:
        attempt = 0
        while True:
            try:
                log.info("Connecting to pricing stream: %s", self.ws_url)
                async with websockets.connect(
                    self.ws_url,
                    additional_headers={
                        "marketmaker": self._config.marketmaker,
                        "authorization": self._config.authorization,
                    },
                    ping_interval=30,
                ) as ws:
                    attempt = 0
                    log.info("Connected to Bebop Pricing Stream")
                    await self._send_loop(ws)
            except asyncio.CancelledError:
                raise
            except Exception as err:
                log.warning("Pricing stream error: %s", err)

            delay = min(5.0 * 2**attempt, _MAX_RECONNECT_DELAY)
            attempt += 1
            log.info("Reconnecting pricing stream in %.0fs... (attempt %d)", delay, attempt)
            await asyncio.sleep(delay)

    async def _send_loop(self, ws: websockets.ClientConnection) -> None:
        await asyncio.sleep(1.0)
        while True:
            buffer = await self._build_update()
            if buffer is not None:
                await ws.send(buffer)
            await asyncio.sleep(_SEND_INTERVAL)

    async def _build_update(self) -> bytes | None:
        schema = pricing_pb2.LevelsSchema()
        schema.chain_id = self._config.chain_id
        schema.msg_topic = "pricing"
        schema.msg_type = "update"
        schema.msg.maker_address = _hex_to_bytes(self._config.maker_address)

        # Debug override: PRICE_OVERRIDE_USD=<mid> forces every option's
        # bid/ask to (mid - 1%, mid + 1%) regardless of pricer output.
        override_raw = os.environ.get("PRICE_OVERRIDE_USD", "")
        override_mid = float(override_raw) if override_raw else 0.0

        valid = 0
        skipped = 0
        for addr in self._pricer.option_addresses():
            if override_mid > 0:
                bid_price, ask_price = override_mid * 0.99, override_mid * 1.01
            else:
                pricing = await self._pricer.get_price(addr)
                if not pricing or not pricing["bids"] or not pricing["asks"]:
                    skipped += 1
                    continue
                bid_price = pricing["bids"][0][0]
                ask_price = pricing["asks"][0][0]

            # Bebop rejects zero/negative prices and wide spreads.
            if bid_price <= 0 or ask_price <= 0:
                skipped += 1
                continue
            mid = (bid_price + ask_price) / 2
            spread_bps = (ask_price - bid_price) / mid * 10000
            if spread_bps > _MAX_SPREAD_BPS:
                log.info(
                    "   %s... SKIPPED (spread %.0f bps, bid=$%.2f ask=$%.2f)",
                    addr[:10],
                    spread_bps,
                    bid_price,
                    ask_price,
                )
                skipped += 1
                continue

            level = schema.msg.levels.add()
            level.base_address = _hex_to_bytes(addr)
            level.base_decimals = 18  # Option ERC20s are 18-decimal
            level.quote_address = _hex_to_bytes(self._config.usdc_address)
            level.quote_decimals = 6
            level.bids.extend([bid_price, 1000.0])  # flat [price, amount, ...]
            level.asks.extend([ask_price, 1000.0])
            valid += 1

        if valid == 0:
            log.info("No valid options to price (skipped %d)", skipped)
            return None

        buffer = schema.SerializeToString()
        log.info(
            "Sending pricing update (%d bytes, %d options, %d skipped)", len(buffer), valid, skipped
        )
        return buffer
