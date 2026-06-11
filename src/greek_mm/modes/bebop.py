"""BEBOP mode: RFQ maker + protobuf pricing stream on one chain.

Option discovery runs through the same event sync + registry as direct mode
(the node version's separate metadata.ts RPC scan is redundant — the
OptionCreated event carries every field the registry needs).
"""

import asyncio
import logging
import os
import time

from greek_mm.bebop.client import BebopClient, BebopConfig
from greek_mm.bebop.pricing_stream import MakerPricingStream, PricingStreamConfig
from greek_mm.config.tokens import get_token
from greek_mm.events.sync_loop import run_sync_loop
from greek_mm.modes._runtime import bootstrap, run
from greek_mm.pricing.pricer import OptionParams, Pricer
from greek_mm.pricing.registry import register_from_events
from greek_mm.pricing.spot_feed import SpotFeed
from greek_mm.pricing.svi import SviParams
from greek_mm.pricing.svi_source import SviPriceSource

log = logging.getLogger(__name__)


async def _main() -> None:
    log.info("Starting market-maker in BEBOP mode")

    chain_id = int(os.environ.get("CHAIN_ID", "1"))
    chain = os.environ.get("CHAIN", "ethereum")
    maker_address = os.environ.get("MAKER_ADDRESS", "0x0000000000000000000000000000000000000000")

    try:
        usdc_address = get_token(chain_id, "USDC").address
    except KeyError:
        log.warning("USDC not configured for chain %d, using Ethereum USDC", chain_id)
        usdc_address = get_token(1, "USDC").address

    spot_feed = SpotFeed()
    spot_feed.use_default_providers()
    source = SviPriceSource(
        spot_feed,
        params=SviParams.from_env(),
        risk_free_rate=float(os.environ.get("RISK_FREE_RATE", "0.05")),
    )
    pricer = Pricer(source, chain_id)

    spot_feed.start_polling(["ETH", "BTC"], float(os.environ.get("SPOT_POLL_INTERVAL", "30")))

    # Optional filter: only quote the addresses in OPTION_ONLY (comma-separated).
    only_env = os.environ.get("OPTION_ONLY", "").strip()
    only_filter = (
        {s.strip().lower() for s in only_env.split(",") if s.strip()} if only_env else None
    )

    async def on_new_events(event_chain_id: int, events: list[dict]) -> None:
        if only_filter is not None:
            events = [e for e in events if e["args"]["option"].lower() in only_filter]
        await register_from_events(pricer, event_chain_id, events)

    # If a filter is set but discovery misses those addresses, register
    # synthetic entries so pricing still flows. Only safe when paired with
    # PRICE_OVERRIDE_USD, which bypasses the pricer.
    if only_filter and os.environ.get("PRICE_OVERRIDE_USD"):
        synthetic_expiry = int(time.time()) + 7 * 86400
        for addr in only_filter:
            if pricer.is_option(addr):
                continue
            pricer.register_option(
                OptionParams(
                    option_address=addr,
                    underlying="ETH",
                    strike=1.0,
                    expiry=synthetic_expiry,
                    is_put=False,
                    decimals=18,
                    chain_id=chain_id,
                    collateral_address="0x0000000000000000000000000000000000000000",
                )
            )
            log.info("  (synthetic) %s", addr)

    bebop_client = BebopClient(
        BebopConfig(
            chain=chain,
            chain_id=chain_id,
            marketmaker=os.environ["BEBOP_MARKETMAKER"],
            authorization=os.environ["BEBOP_AUTHORIZATION"],
            maker_address=maker_address,
            private_key=os.environ.get("PRIVATE_KEY"),
        ),
        pricer.handle_rfq,
    )
    pricing_stream = MakerPricingStream(
        PricingStreamConfig(
            chain=chain,
            chain_id=chain_id,
            marketmaker=os.environ["BEBOP_MARKETMAKER"],
            authorization=os.environ["BEBOP_AUTHORIZATION"],
            maker_address=maker_address,
            usdc_address=usdc_address,
        ),
        pricer,
    )

    try:
        await asyncio.gather(
            run_sync_loop(chain_ids=[chain_id], on_new_events=on_new_events),
            bebop_client.run(),
            pricing_stream.run(),
        )
    finally:
        await spot_feed.close()


def main() -> None:
    bootstrap()
    run(_main)


if __name__ == "__main__":
    main()
