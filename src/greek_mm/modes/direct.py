"""DIRECT mode: HTTP quote API (:3010) + WS broadcast (:3011) + event sync."""

import asyncio
import logging
import os

from greek_mm.events.sync_loop import run_sync_loop
from greek_mm.modes._runtime import bootstrap, load_chain_ids, run, serve_http
from greek_mm.pricing.pricer import Pricer
from greek_mm.pricing.registry import register_from_events
from greek_mm.pricing.spot_feed import SpotFeed
from greek_mm.pricing.svi import SviParams
from greek_mm.pricing.svi_source import SviPriceSource
from greek_mm.servers.http_api import create_app
from greek_mm.servers.ws_stream import PricingStreamServer

log = logging.getLogger(__name__)

# The protocol only supports BTC and ETH variants today; keep both polled.
ALWAYS_POLL = ["ETH", "BTC"]


async def _prime_spot(spot_feed: SpotFeed, symbol: str) -> None:
    for attempt in range(1, 6):
        price = await spot_feed.get_price(symbol)
        if price is not None:
            log.info("Initial %s spot price: $%.2f", symbol, price)
            return
        log.warning(
            "Spot %s fetch attempt %d/5 failed, retrying in %ds...", symbol, attempt, attempt * 2
        )
        await asyncio.sleep(attempt * 2)
        spot_feed.clear_cache()
    log.warning(
        "Failed to fetch %s spot after retries; %s-quoted options may fail until it recovers",
        symbol,
        symbol,
    )


async def _main() -> None:
    log.info("Starting market-maker in DIRECT mode")

    spot_feed = SpotFeed()
    spot_feed.use_default_providers()

    source = SviPriceSource(
        spot_feed,
        params=SviParams.from_env(),
        risk_free_rate=float(os.environ.get("RISK_FREE_RATE", "0.05")),
    )

    chain_ids = load_chain_ids()
    log.info("Configured chains: %s", ", ".join(str(c) for c in chain_ids))
    pricers = {chain_id: Pricer(source, chain_id) for chain_id in chain_ids}
    if not pricers:
        msg = "No chains configured"
        raise RuntimeError(msg)

    for symbol in ALWAYS_POLL:
        await _prime_spot(spot_feed, symbol)
    spot_feed.start_polling(ALWAYS_POLL, float(os.environ.get("SPOT_POLL_INTERVAL", "30")))

    async def on_new_events(chain_id: int, events: list[dict]) -> None:
        pricer = pricers.get(chain_id)
        if pricer is not None:
            await register_from_events(pricer, chain_id, events)

    http_port = int(os.environ.get("HTTP_PORT") or os.environ.get("PORT") or "3010")
    ws_port = int(os.environ.get("WS_PORT") or os.environ.get("PORT") or "3011")
    ws_interval = int(os.environ.get("WS_UPDATE_INTERVAL", "5000")) / 1000

    app = create_app(pricers)
    ws_server = PricingStreamServer(pricers, ws_port, ws_interval)

    log.info("HTTP API on :%d, WS stream on :%d", http_port, ws_port)
    try:
        await asyncio.gather(
            run_sync_loop(chain_ids=chain_ids, on_new_events=on_new_events),
            serve_http(app, http_port),
            ws_server.run(),
        )
    finally:
        await spot_feed.close()


def main() -> None:
    bootstrap()
    run(_main)


if __name__ == "__main__":
    main()
