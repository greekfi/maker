"""HTTP quote API — route and response shapes mirror the node Express app
byte-for-byte so the frontend can switch hosts without changes.
"""

import contextlib
import logging
import os
import random
import time
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from greek_mm.bebop.signing import sign_quote
from greek_mm.events import store
from greek_mm.pricing.pricer import Pricer
from greek_mm.pricing.registry import ensure_registered, register_from_events

log = logging.getLogger(__name__)

Signer = Callable[[dict], Awaitable[dict]] | Callable[[dict], dict]

_ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


def _error(status: int, message: str, code: str = "BAD_REQUEST") -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": message, "code": code})


def _filtered_events(
    chain_id: int, collateral: str | None, consideration: str | None
) -> list[dict]:
    events = store.get_events(chain_id)
    coll = collateral.lower() if collateral else None
    cons = consideration.lower() if consideration else None
    if not coll and not cons:
        return events
    return [
        e
        for e in events
        if (not coll or e["args"]["collateral"].lower() == coll)
        and (not cons or e["args"]["consideration"].lower() == cons)
    ]


def create_app(
    pricers: dict[int, Pricer],
    maker_address: str | None = None,
    signer: Callable[[dict], dict] | None = None,
) -> FastAPI:
    maker = maker_address or os.environ.get("MAKER_ADDRESS", _ZERO_ADDRESS)

    # Capture the key in a closure at construction time so it never lives on
    # the app object.
    if signer is None:
        pk = os.environ.get("PRIVATE_KEY")
        if pk:
            signer = lambda data: sign_quote(data, pk)  # noqa: E731

    app = FastAPI()
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
    )

    def pricer_for_request(request: Request) -> tuple[int, Pricer]:
        raw = (
            request.query_params.get("chainId")
            or request.query_params.get("chain_id")
            or request.query_params.get("chain")
        )
        if raw is None:
            msg = "chainId query parameter is required"
            raise ValueError(msg)
        try:
            chain_id = int(raw)
        except ValueError:
            msg = f"Invalid chainId: {raw}"
            raise ValueError(msg) from None
        pricer = pricers.get(chain_id)
        if pricer is None:
            supported = ", ".join(str(c) for c in pricers)
            msg = f"Unsupported chainId {chain_id} (server runs {supported})"
            raise ValueError(msg)
        return chain_id, pricer

    @app.get("/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "chains": [
                {"chainId": chain_id, "optionsCount": len(pricer.all_options())}
                for chain_id, pricer in pricers.items()
            ],
            "sync": store.summary(),
            "makerAddress": maker,
        }

    @app.get("/events")
    async def events(chainId: str | None = Query(default=None)) -> JSONResponse:
        if chainId is not None:
            try:
                chain_filter = int(chainId)
            except ValueError:
                return _error(400, f"Invalid chainId: {chainId}")
            chains = [chain_filter]
        else:
            chains = list(pricers.keys())

        out: list[dict] = []
        for chain_id in chains:
            out.extend(store.get_events(chain_id))
        # Latest first within a chain, matching greek-events' behaviour.
        out.sort(key=lambda e: (int(e["blockNumber"]), e["logIndex"]), reverse=True)
        return JSONResponse(content={"count": len(out), "events": out})

    @app.get("/options")
    async def options(
        chainId: str | None = Query(default=None),
        collateral: str | None = Query(default=None),
        consideration: str | None = Query(default=None),
    ) -> JSONResponse:
        if chainId is None:
            return _error(400, "chainId query parameter is required")
        try:
            chain_id = int(chainId)
        except ValueError:
            return _error(400, f"Invalid chainId: {chainId}")
        pricer = pricers.get(chain_id)
        if pricer is None:
            supported = ", ".join(str(c) for c in pricers)
            return _error(400, f"Unsupported chainId {chain_id} (server runs {supported})")

        try:
            chain_events = _filtered_events(chain_id, collateral, consideration)
            await register_from_events(pricer, chain_id, chain_events)

            now = int(time.time())
            out: list[dict] = []
            for event in chain_events:
                opt = pricer.get_option(event["args"]["option"])
                if opt is None:
                    continue  # unknown underlying — skipped during register
                if opt.expiry <= now:
                    continue  # expired options aren't quotable
                price = await pricer.price(opt.option_address)
                out.append(
                    {
                        "chainId": chain_id,
                        "address": opt.option_address,
                        "underlying": opt.underlying,
                        "strike": opt.strike,
                        "expiry": opt.expiry,
                        "isPut": opt.is_put,
                        "decimals": opt.decimals,
                        "bid": price.bid if price else None,
                        "ask": price.ask if price else None,
                        "mid": price.mid if price else None,
                        "delta": price.delta if price else None,
                        "gamma": price.gamma if price else None,
                        "theta": price.theta if price else None,
                        "vega": price.vega if price else None,
                        "iv": price.iv if price else None,
                        "spotPrice": price.spot if price else None,
                    }
                )
            return JSONResponse(content={"options": out})
        except Exception as err:
            log.error("/options error: %s", err)
            return _error(500, str(err), "OPTIONS_ERROR")

    @app.get("/quote")
    async def quote(request: Request) -> JSONResponse:
        try:
            chain_id, pricer = pricer_for_request(request)
            params = dict(request.query_params)
            buy_token = params.get("buyToken") or params.get("buy_tokens")
            sell_token = params.get("sellToken") or params.get("sell_tokens")
            # Lazy-register either side; a failed lookup just means the
            # token isn't an option and the quote path will reject it.
            for token in (buy_token, sell_token):
                if token:
                    with contextlib.suppress(Exception):
                        await ensure_registered(pricer, chain_id, token)
            response = await _handle_quote(pricer, chain_id, params, maker, signer)
            return JSONResponse(content=response)
        except Exception as err:
            log.error("Quote error: %s", err)
            return JSONResponse(status_code=400, content={"error": str(err), "code": "QUOTE_ERROR"})

    @app.get("/price/{option_address}")
    async def price_endpoint(option_address: str, request: Request) -> JSONResponse:
        try:
            chain_id, pricer = pricer_for_request(request)
        except ValueError as err:
            return _error(400, str(err))
        ok = await ensure_registered(pricer, chain_id, option_address)
        if not ok:
            return JSONResponse(
                status_code=404, content={"error": "Option not found on this chain"}
            )
        price = await pricer.price(option_address)
        if price is None:
            return JSONResponse(
                status_code=404, content={"error": "Option not priced (spot unavailable?)"}
            )
        option = pricer.get_option(option_address)
        return JSONResponse(
            content={
                "optionAddress": option_address,
                "chainId": chain_id,
                "underlying": option.underlying if option else None,
                "strike": option.strike if option else None,
                "expiry": option.expiry if option else None,
                "isPut": option.is_put if option else None,
                "bid": price.bid,
                "ask": price.ask,
                "mid": price.mid,
                "delta": price.delta,
                "gamma": price.gamma,
                "theta": price.theta,
                "vega": price.vega,
                "iv": price.iv,
                "spotPrice": price.spot,
                "timeToExpiry": price.time_to_expiry,
            }
        )

    return app


async def _handle_quote(
    pricer: Pricer,
    chain_id: int,
    params: dict[str, str],
    maker_address: str,
    signer: Callable[[dict], dict] | None,
) -> dict:
    buy_token = params.get("buyToken") or params.get("buy_tokens")
    sell_token = params.get("sellToken") or params.get("sell_tokens")
    sell_amount = params.get("sellAmount") or params.get("sell_amounts")
    buy_amount = params.get("buyAmount") or params.get("buy_amounts")
    taker = params.get("takerAddress") or params.get("taker_address") or _ZERO_ADDRESS

    if not buy_token or not sell_token:
        msg = "buyToken and sellToken are required"
        raise ValueError(msg)
    if not sell_amount and not buy_amount:
        msg = "Either sellAmount or buyAmount is required"
        raise ValueError(msg)

    is_buying_option = pricer.is_option(buy_token)
    is_selling_option = pricer.is_option(sell_token)
    if not is_buying_option and not is_selling_option:
        msg = "Neither token is a registered option"
        raise ValueError(msg)

    option_address = buy_token if is_buying_option else sell_token
    option = pricer.get_option(option_address)
    if option is None:
        msg = "Option not found"
        raise ValueError(msg)
    result = await pricer.price(option_address)
    if result is None:
        msg = "Unable to price option - check spot price"
        raise ValueError(msg)

    if is_buying_option:
        # User buys options (pays sellToken, receives options) — maker's ask.
        price = result.ask
        if buy_amount:
            buy_amount_int = int(buy_amount)
            cost = await pricer.ask_quote(option_address, buy_amount_int, 6)
            if cost is None:
                msg = "Unable to calculate cost"
                raise ValueError(msg)
            sell_amount_int = cost
        else:
            sell_amount_int = int(sell_amount)  # type: ignore[arg-type]
            ask_scaled = int(price * 10**6)
            buy_amount_int = sell_amount_int * 10**option.decimals // ask_scaled
    else:
        # User sells options (pays options, receives buyToken) — maker's bid.
        price = result.bid
        if sell_amount:
            sell_amount_int = int(sell_amount)
            payout = await pricer.bid_quote(option_address, sell_amount_int, 6)
            if payout is None:
                msg = "Unable to calculate payout"
                raise ValueError(msg)
            buy_amount_int = payout
        else:
            buy_amount_int = int(buy_amount)  # type: ignore[arg-type]
            bid_scaled = int(price * 10**6)
            sell_amount_int = buy_amount_int * 10**option.decimals // bid_scaled

    now_ms = int(time.time() * 1000)
    quote_id = f"{now_ms}-{random.randbytes(5).hex()}"
    # 5-minute quote TTL leaves room for wallet confirmation + tx propagation
    # without tripping Bebop's OrderExpired() on settlement.
    expiry = int(time.time()) + 300

    response: dict = {
        "quoteId": quote_id,
        "buyToken": buy_token,
        "sellToken": sell_token,
        "buyAmount": str(buy_amount_int),
        "sellAmount": str(sell_amount_int),
        "price": f"{price:.6f}",
        "expiry": expiry,
        "makerAddress": maker_address,
        "greeks": {
            "delta": result.delta,
            "gamma": result.gamma,
            "theta": result.theta,
            "vega": result.vega,
        },
        "spotPrice": result.spot,
        "iv": result.iv,
        "routes": ["RFQ"],
        "estimatedGas": "150000",
    }

    if signer is not None:
        # 256-bit nonce from timestamp + random — unique per quote without a DB.
        nonce = (now_ms << 128) | random.getrandbits(64)
        order = {
            "partner_id": "0",
            "expiry": str(expiry),
            "taker_address": taker,
            "maker_address": maker_address,
            "maker_nonce": str(nonce),
            "taker_token": sell_token,
            "maker_token": buy_token,
            "taker_amount": str(sell_amount_int),
            "maker_amount": str(buy_amount_int),
            "receiver": taker,
            "packed_commands": "0",
        }
        signed = signer(
            {
                "chain_id": chain_id,
                "order_signing_type": "SingleOrder",
                "order_type": "Single",
                "onchain_partner_id": 0,
                "expiry": expiry,
                "taker_address": order["taker_address"],
                "maker_address": order["maker_address"],
                "maker_nonce": order["maker_nonce"],
                "receiver": order["receiver"],
                "packed_commands": order["packed_commands"],
                "quotes": [
                    {
                        "taker_token": order["taker_token"],
                        "maker_token": order["maker_token"],
                        "taker_amount": order["taker_amount"],
                        "maker_amount": order["maker_amount"],
                    }
                ],
            }
        )
        response["signature"] = signed["signature"]
        response["signScheme"] = "EIP712"
        response["order"] = order

    return response
