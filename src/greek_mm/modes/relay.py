"""RELAY mode: Bebop taker pricing fan-in + /prices HTTP (:3004).

Also runs the event sync so /prices can filter pairs down to known option
tokens (the node version's static option list was always empty, so its
filter dropped everything).
"""

import asyncio
import logging
import os

from greek_mm.bebop.relay import PricingRelay
from greek_mm.events.sync_loop import run_sync_loop
from greek_mm.modes._runtime import bootstrap, load_chain_ids, run, serve_http
from greek_mm.servers.ws_relay import create_relay_app

log = logging.getLogger(__name__)


async def _main() -> None:
    log.info("Starting market-maker in RELAY mode")

    chains = [s.strip() for s in os.environ.get("BEBOP_CHAINS", "ethereum").split(",") if s.strip()]
    name = os.environ.get("BEBOP_MARKETMAKER", "market-maker")
    authorization = os.environ.get("BEBOP_AUTHORIZATION", "")
    port = int(os.environ.get("RELAY_PORT") or os.environ.get("PORT") or "3004")

    relay = PricingRelay(chains, name, authorization)
    app = create_relay_app(relay)

    await asyncio.gather(
        relay.run(),
        serve_http(app, port),
        run_sync_loop(chain_ids=load_chain_ids()),
    )


def main() -> None:
    bootstrap()
    run(_main)


if __name__ == "__main__":
    main()
