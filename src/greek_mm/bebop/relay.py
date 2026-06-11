"""Bebop taker pricing fan-in: one WS per chain, in-memory level cache.

Emits [relay-stats] every 30s so silent upstream failures stay observable.
"""

import asyncio
import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

import websockets

from greek_mm.bebop.proto import taker_pricing_pb2

log = logging.getLogger(__name__)

TAKER_CHAINS: dict[str, int] = {
    "ethereum": 1,
    "arbitrum": 42161,
    "avalanche": 43114,
    "base": 8453,
    "bsc": 56,
    "optimism": 10,
    "polygon": 137,
}

_MAX_RECONNECT_DELAY = 60.0
_STATS_INTERVAL = 30.0


@dataclass
class PriceData:
    base: str
    quote: str
    last_update_ts: float
    bids: list[list[float]]
    asks: list[list[float]]


@dataclass
class _Stats:
    messages_received: int = 0
    pairs_updated: int = 0
    last_message_at: float = 0.0


def _bytes_to_address(raw: bytes) -> str:
    return "0x" + raw.hex() if raw else ""


def _to_levels(flat: list[float]) -> list[list[float]]:
    return [[flat[i], flat[i + 1]] for i in range(0, len(flat) - 1, 2)]


OnPrice = Callable[[int, str, str, PriceData], None]


class PricingRelay:
    def __init__(self, chains: list[str], name: str, authorization: str) -> None:
        self._chains = [c for c in chains if c in TAKER_CHAINS]
        for chain in chains:
            if chain not in TAKER_CHAINS:
                log.warning("Unknown chain: %s, skipping", chain)
        self._name = name
        self._authorization = authorization
        self._prices: dict[str, PriceData] = {}  # "chainId:base/quote"
        self._connected: dict[str, bool] = dict.fromkeys(self._chains, False)
        self._callbacks: list[OnPrice] = []
        self._stats = _Stats()

    def on_price(self, callback: OnPrice) -> None:
        self._callbacks.append(callback)

    async def run(self) -> None:
        log.info("Starting Pricing Relay for %d chains: %s", len(self._chains), self._chains)
        await asyncio.gather(
            *(self._run_chain(chain) for chain in self._chains),
            self._stats_loop(),
        )

    async def _run_chain(self, chain: str) -> None:
        chain_id = TAKER_CHAINS[chain]
        url = f"wss://api.bebop.xyz/pmm/{chain}/v3/pricing?format=protobuf"
        attempt = 0
        while True:
            try:
                log.info("Connecting to %s pricing feed", chain)
                async with websockets.connect(
                    url,
                    additional_headers={"name": self._name, "Authorization": self._authorization},
                    ping_interval=30,
                    max_size=16 * 1024 * 1024,
                ) as ws:
                    attempt = 0
                    self._connected[chain] = True
                    log.info("Connected to %s pricing feed", chain)
                    async for raw in ws:
                        self._handle_message(chain, chain_id, raw)
            except asyncio.CancelledError:
                raise
            except Exception as err:
                log.warning("%s pricing feed error: %s", chain, err)
            finally:
                self._connected[chain] = False

            delay = min(1.0 * 2**attempt, _MAX_RECONNECT_DELAY)
            attempt += 1
            log.info("Reconnecting to %s in %.0fs (attempt %d)", chain, delay, attempt)
            await asyncio.sleep(delay)

    def _handle_message(self, chain: str, chain_id: int, raw: str | bytes) -> None:
        self._stats.messages_received += 1
        self._stats.last_message_at = time.time()

        if isinstance(raw, bytes):
            try:
                update = taker_pricing_pb2.BebopPricingUpdate.FromString(raw)
            except Exception as err:
                log.error("Failed to parse %s message: %s", chain, err)
                return
            for pair in update.pairs:
                base = _bytes_to_address(pair.base)
                quote = _bytes_to_address(pair.quote)
                if not base or not quote:
                    continue
                self._store(
                    chain_id,
                    base,
                    quote,
                    PriceData(
                        base=base,
                        quote=quote,
                        last_update_ts=float(pair.last_update_ts),
                        bids=_to_levels(list(pair.bids)),
                        asks=_to_levels(list(pair.asks)),
                    ),
                )
            return

        # JSON fallback (less frequent, 3s intervals)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as err:
            log.error("Failed to parse %s message: %s", chain, err)
            return
        for pair_key, pair_data in data.items():
            parts = pair_key.split("/")
            if len(parts) != 2 or not parts[0] or not parts[1]:
                continue
            self._store(
                chain_id,
                parts[0],
                parts[1],
                PriceData(
                    base=parts[0],
                    quote=parts[1],
                    last_update_ts=pair_data.get("last_update_ts") or time.time(),
                    bids=pair_data.get("bids") or [],
                    asks=pair_data.get("asks") or [],
                ),
            )

    def _store(self, chain_id: int, base: str, quote: str, data: PriceData) -> None:
        self._stats.pairs_updated += 1
        self._prices[f"{chain_id}:{base}/{quote}"] = data
        for callback in self._callbacks:
            callback(chain_id, base, quote, data)

    async def _stats_loop(self) -> None:
        while True:
            await asyncio.sleep(_STATS_INTERVAL)
            status = ", ".join(
                f"{chain}:{'UP' if up else 'DOWN'}" for chain, up in self._connected.items()
            )
            elapsed = (
                f"{time.time() - self._stats.last_message_at:.0f}s ago"
                if self._stats.last_message_at
                else "never"
            )
            log.info(
                "[relay-stats] connections=[%s] cache=%d pairs | msgs=%d | pairs_updated=%d | last_msg=%s",
                status,
                len(self._prices),
                self._stats.messages_received,
                self._stats.pairs_updated,
                elapsed,
            )

    # === cache reads ===

    def get_price(self, chain_id: int, base: str, quote: str) -> PriceData | None:
        return self._prices.get(f"{chain_id}:{base}/{quote}")

    def all_prices(self) -> dict[str, PriceData]:
        return dict(self._prices)

    def status(self) -> dict[str, bool]:
        return dict(self._connected)
