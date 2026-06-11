"""Relay-mode HTTP server: GET /prices → cached option prices by address.

Filters to option tokens via the in-memory event store (populated by the
sync loop the relay mode runs). The node version filtered against a static
options list that is always empty post-factories.json, so its /prices
always returned {} — this is the intended behaviour restored.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from greek_mm.bebop.relay import PricingRelay
from greek_mm.events import store

log = logging.getLogger(__name__)


def _is_option_token(chain_id: int, address: str) -> bool:
    return store.find_by_option(chain_id, address) is not None


def create_relay_app(relay: PricingRelay) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
    )

    @app.get("/prices")
    async def prices() -> dict:
        result: dict[str, dict] = {}
        for cache_key, data in relay.all_prices().items():
            chain_str, pair = cache_key.split(":", 1)
            chain_id = int(chain_str)
            base, quote = pair.lower().split("/", 1)

            is_base = _is_option_token(chain_id, base)
            is_quote = _is_option_token(chain_id, quote)
            if not is_base and not is_quote:
                continue

            option_addr = base if is_base else quote
            result[option_addr] = {
                "chainId": chain_id,
                "base": data.base,
                "quote": data.quote,
                "bids": data.bids,
                "asks": data.asks,
                "lastUpdateTs": data.last_update_ts,
            }
        return result

    return app
