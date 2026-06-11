"""Spot price feed: Binance primary, CoinGecko fallback, 5s cache."""

import asyncio
import logging
import time
from collections.abc import Callable
from typing import Protocol

import httpx

log = logging.getLogger(__name__)

_COINGECKO_IDS = {
    "ETH": "ethereum",
    "WETH": "ethereum",
    "BTC": "bitcoin",
    "WBTC": "wrapped-bitcoin",
    "CBBTC": "bitcoin",
    "SOL": "solana",
    "AVAX": "avalanche-2",
    "MATIC": "matic-network",
    "ARB": "arbitrum",
    "OP": "optimism",
    "LINK": "chainlink",
    "UNI": "uniswap",
}

_BINANCE_TICKERS = {
    "ETH": "ETHUSDT",
    "WETH": "ETHUSDT",
    "BTC": "BTCUSDT",
    "WBTC": "BTCUSDT",
    "CBBTC": "BTCUSDT",
    "SOL": "SOLUSDT",
    "AVAX": "AVAXUSDT",
    "MATIC": "MATICUSDT",
    "ARB": "ARBUSDT",
    "OP": "OPUSDT",
    "LINK": "LINKUSDT",
    "UNI": "UNIUSDT",
}


class SpotPriceProvider(Protocol):
    name: str

    async def get_price(self, symbol: str) -> float | None: ...


class BinanceProvider:
    name = "binance"

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def get_price(self, symbol: str) -> float | None:
        ticker = _BINANCE_TICKERS.get(symbol.upper())
        if ticker is None:
            return None
        try:
            resp = await self._client.get(
                "https://api.binance.com/api/v3/ticker/price", params={"symbol": ticker}
            )
            price = resp.json().get("price")
            return float(price) if price is not None else None
        except Exception as err:
            log.warning("Binance price fetch failed for %s: %s", symbol, err)
            return None


class CoinGeckoProvider:
    name = "coingecko"

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def get_price(self, symbol: str) -> float | None:
        coin_id = _COINGECKO_IDS.get(symbol.upper())
        if coin_id is None:
            return None
        try:
            resp = await self._client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": coin_id, "vs_currencies": "usd"},
            )
            return resp.json().get(coin_id, {}).get("usd")
        except Exception as err:
            log.warning("CoinGecko price fetch failed for %s: %s", symbol, err)
            return None


class StaticProvider:
    """Manual prices for tests."""

    name = "static"

    def __init__(self) -> None:
        self._prices: dict[str, float] = {}

    def set_price(self, symbol: str, price: float) -> None:
        self._prices[symbol.upper()] = price

    async def get_price(self, symbol: str) -> float | None:
        return self._prices.get(symbol.upper())


class SpotFeed:
    def __init__(self, cache_ttl: float = 5.0) -> None:
        self._providers: list[SpotPriceProvider] = []
        self._cache: dict[str, tuple[float, float]] = {}  # symbol -> (price, fetched_at)
        self._cache_ttl = cache_ttl
        self._callbacks: list[Callable[[str, float], None]] = []
        self._client = httpx.AsyncClient(timeout=10.0)

    def add_provider(self, provider: SpotPriceProvider) -> None:
        self._providers.append(provider)

    def use_default_providers(self) -> None:
        if not self._providers:
            self.add_provider(BinanceProvider(self._client))
            self.add_provider(CoinGeckoProvider(self._client))

    def on_price_update(self, callback: Callable[[str, float], None]) -> None:
        self._callbacks.append(callback)

    async def get_price(self, symbol: str) -> float | None:
        upper = symbol.upper()
        cached = self._cache.get(upper)
        if cached is not None and time.monotonic() - cached[1] < self._cache_ttl:
            return cached[0]

        for provider in self._providers:
            price = await provider.get_price(upper)
            if price is not None:
                self._cache[upper] = (price, time.monotonic())
                for callback in self._callbacks:
                    callback(upper, price)
                return price
        return None

    async def get_prices(self, symbols: list[str]) -> dict[str, float]:
        results = await asyncio.gather(*(self.get_price(s) for s in symbols))
        return {s.upper(): p for s, p in zip(symbols, results, strict=True) if p is not None}

    def start_polling(self, symbols: list[str], interval: float = 30.0) -> asyncio.Task:
        async def poll() -> None:
            while True:
                await self.get_prices(symbols)
                await asyncio.sleep(interval)

        return asyncio.get_running_loop().create_task(poll(), name="spot-feed-poll")

    def clear_cache(self) -> None:
        self._cache.clear()

    async def close(self) -> None:
        await self._client.aclose()
