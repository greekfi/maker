"""Bebop options market maker — streams prices and signs RFQ quotes.

Run:  uv run maker.py        (needs a filled-in .env)
Show: uv run maker.py show   (print discovered options + prices, no connect)

One price function, the Bebop wiring, and on-chain discovery (options.py).
To use real pricing, edit price().
"""

import asyncio
import json
import logging
import os
import struct
import sys
import time

import websockets
from dotenv import load_dotenv
from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import AsyncHTTPProvider, AsyncWeb3

from options import Option, fetch_options

log = logging.getLogger("maker")


# ─────────────────────────────── the price ───────────────────────────────


def price(option: Option) -> tuple[float, float]:
    """(bid, ask) in USD per option token. Flat $10 placeholder — edit me."""
    p = float(os.environ.get("PRICE_PER_TOKEN", "10"))
    return p, p


# ─────────────────────────────── config ──────────────────────────────────

BEBOP_WS = "wss://api.bebop.xyz/pmm"
# BebopBlend PMM RFQ contract (same address every chain).
BEBOP_BLEND = "0xbbbbbBB520d69a9775E85b458C58c648259FAD5F"
USDC = {
    1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
}


def cfg() -> dict:
    return {
        "chain_id": int(os.environ.get("CHAIN_ID", "8453")),
        "chain": os.environ.get("CHAIN", "base"),
        "rpc": os.environ.get("RPC_URL", "https://mainnet.base.org"),
        "factory": os.environ["FACTORY"],
        "from_block": int(os.environ.get("FROM_BLOCK", "0")),
        "maker": os.environ.get("MAKER_ADDRESS", ""),
        "private_key": os.environ.get("PRIVATE_KEY", ""),
        "marketmaker": os.environ.get("BEBOP_MARKETMAKER", ""),
        "authorization": os.environ.get("BEBOP_AUTHORIZATION", ""),
        "only": {a.strip().lower() for a in os.environ.get("OPTION_ONLY", "").split(",") if a.strip()},
    }


# ──────────────────── protobuf (Bebop maker pricing) ──────────────────────
# Hand-encoded LevelsSchema (proto/pricing.proto). Verified byte-identical to
# the protobufjs/protoc output Bebop accepts — see verify_protobuf().


def _varint(n: int) -> bytes:
    out = b""
    while True:
        b, n = n & 0x7F, n >> 7
        out += bytes([b | 0x80]) if n else bytes([b])
        if not n:
            return out


def _lf(field: int, payload: bytes) -> bytes:  # length-delimited (wire type 2)
    return _varint(field << 3 | 2) + _varint(len(payload)) + payload


def _uf(field: int, n: int) -> bytes:  # uint (wire type 0)
    return _varint(field << 3) + _varint(n)


def _doubles(field: int, vals: list[float]) -> bytes:  # packed repeated double
    return _lf(field, b"".join(struct.pack("<d", v) for v in vals))


def _hexb(addr: str) -> bytes:
    return bytes.fromhex(addr.removeprefix("0x"))


def encode_levels(chain_id: int, maker: str, usdc: str, levels: list[tuple]) -> bytes:
    """levels: list of (option_addr, bid, ask, option_decimals)."""
    infos = b"".join(
        _lf(1, (
            _lf(1, _hexb(addr)) + _uf(2, dec) + _lf(3, _hexb(usdc)) + _uf(4, 6)
            + _doubles(5, [bid, 1000.0]) + _doubles(6, [ask, 1000.0])
        ))
        for addr, bid, ask, dec in levels
    )
    msg = infos + _lf(2, _hexb(maker))
    return _uf(1, chain_id) + _lf(2, b"pricing") + _lf(3, b"update") + _lf(4, msg)


# ────────────────────────── EIP-712 signing ──────────────────────────────

_TYPES = {
    "EIP712Domain": [
        {"name": "name", "type": "string"},
        {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ],
    "SingleOrder": [
        {"name": "partner_id", "type": "uint64"},
        {"name": "expiry", "type": "uint256"},
        {"name": "taker_address", "type": "address"},
        {"name": "maker_address", "type": "address"},
        {"name": "maker_nonce", "type": "uint256"},
        {"name": "taker_token", "type": "address"},
        {"name": "maker_token", "type": "address"},
        {"name": "taker_amount", "type": "uint256"},
        {"name": "maker_amount", "type": "uint256"},
        {"name": "receiver", "type": "address"},
        {"name": "packed_commands", "type": "uint256"},
    ],
}


def sign_order(order: dict, chain_id: int, private_key: str) -> str:
    typed = {
        "types": _TYPES,
        "primaryType": "SingleOrder",
        "domain": {"name": "BebopSettlement", "version": "2",
                   "chainId": chain_id, "verifyingContract": BEBOP_BLEND},
        "message": order,
    }
    signed = Account.sign_message(encode_typed_data(full_message=typed), private_key=private_key)
    return signed.signature.to_0x_hex()


# ──────────────────────────── RFQ → quote ────────────────────────────────


def _premium_for_options(unit_price: float, option_amount: int, option_decimals: int) -> int:
    """USDC (6dp) owed for `option_amount` option base units."""
    return option_amount * int(unit_price * 10**6) // 10**option_decimals


def _options_for_premium(unit_price: float, premium_usdc: int, option_decimals: int) -> int:
    """Option base units that `premium_usdc` (6dp) buys at `unit_price`."""
    scaled = int(unit_price * 10**6)
    return premium_usdc * 10**option_decimals // scaled if scaled else 0


def _amt(v) -> int | None:
    return int(v) if v not in (None, "") else None


def build_quote(rfq: dict, options: dict[str, Option], c: dict) -> dict | None:
    """Build a signed Bebop quote for an RFQ, or None to decline.

    The RFQ fixes one leg (taker_amount or maker_amount) and leaves the other
    null for us to fill — handle both exact-in and exact-out.
    """
    q = rfq["quotes"][0]
    taker_token, maker_token = q["taker_token"], q["maker_token"]
    ta, ma = _amt(q.get("taker_amount")), _amt(q.get("maker_amount"))

    if maker_token.lower() in options:  # taker buys the option from us -> ask
        opt = options[maker_token.lower()]
        _bid, ask = price(opt)
        if ma is not None:  # exact option amount out
            option_amount, prem = ma, _premium_for_options(ask, ma, opt.decimals)
        elif ta is not None:  # exact USDC in
            prem, option_amount = ta, _options_for_premium(ask, ta, opt.decimals)
        else:
            return None
        taker_amount, maker_amount = prem, option_amount
    elif taker_token.lower() in options:  # taker sells the option to us -> bid
        opt = options[taker_token.lower()]
        bid, _ask = price(opt)
        if ta is not None:  # exact option amount in
            option_amount, prem = ta, _premium_for_options(bid, ta, opt.decimals)
        elif ma is not None:  # exact USDC out
            prem, option_amount = ma, _options_for_premium(bid, ma, opt.decimals)
        else:
            return None
        taker_amount, maker_amount = option_amount, prem
    else:
        return None

    if taker_amount <= 0 or maker_amount <= 0:
        return None

    # Honor the RFQ's nonce/expiry so the signed order matches what Bebop submits.
    expiry = int(rfq.get("expiry") or time.time() + 60)
    nonce = int(rfq.get("maker_nonce") or int(time.time() * 1000))
    order = {
        "partner_id": int(rfq.get("onchain_partner_id") or 0),
        "expiry": expiry,
        "taker_address": rfq["taker_address"],
        "maker_address": c["maker"],
        "maker_nonce": nonce,
        "taker_token": taker_token,
        "maker_token": maker_token,
        "taker_amount": taker_amount,
        "maker_amount": maker_amount,
        "receiver": rfq.get("receiver") or rfq["taker_address"],
        "packed_commands": int(rfq.get("packed_commands") or 0),
    }
    signature = sign_order(order, c["chain_id"], c["private_key"]) if c["private_key"] else None

    return {
        "chain_id": c["chain_id"],
        "msg_topic": "taker_quote",
        "msg_type": "response",
        "msg": {
            "quote_id": rfq["quote_id"],
            "event_id": rfq.get("event_id"),
            "order_signing_type": rfq.get("order_signing_type", "SingleOrder"),
            "order_type": rfq.get("order_type", "Single"),
            "onchain_partner_id": order["partner_id"],
            "expiry": expiry,
            "taker_address": order["taker_address"],
            "maker_address": order["maker_address"],
            "maker_nonce": str(nonce),
            "quotes": [{
                "taker_token": taker_token, "maker_token": maker_token,
                "taker_amount": str(taker_amount), "maker_amount": str(maker_amount),
                "reference_price": (taker_amount / maker_amount) if maker_amount else 0,
            }],
            "receiver": order["receiver"],
            "commands": rfq.get("commands", "0x"),
            "packed_commands": str(rfq.get("packed_commands") or "0"),
            "fee_native": rfq.get("fee_native"),
            "is_aggregate_order": rfq.get("is_aggregate_order", False),
            "expiry_type": rfq.get("expiry_type", "standard"),
            "signature": signature,
        },
    }


# ───────────────────────────── Bebop loops ───────────────────────────────


async def stream_prices(options: dict[str, Option], c: dict) -> None:
    url = f"{BEBOP_WS}/{c['chain']}/v3/maker/pricing?format=protobuf"
    usdc = USDC[c["chain_id"]]
    headers = {"marketmaker": c["marketmaker"], "authorization": c["authorization"]}
    delay = 5
    while True:
        try:
            async with websockets.connect(url, additional_headers=headers, ping_interval=30) as ws:
                log.info("pricing stream connected")
                delay = 5
                while True:
                    levels = []
                    for opt in options.values():
                        bid, ask = price(opt)
                        if bid > 0 and ask > 0:
                            levels.append((opt.address, bid, ask, opt.decimals))
                    if levels:
                        await ws.send(encode_levels(c["chain_id"], c["maker"], usdc, levels))
                        log.info("pushed %d levels", len(levels))
                    await asyncio.sleep(10)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("pricing stream: %s — reconnecting in %ds", e, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 300)


async def run_rfq(options: dict[str, Option], c: dict) -> None:
    url = f"{BEBOP_WS}/{c['chain']}/v3/maker/quote"
    headers = {"marketmaker": c["marketmaker"], "authorization": c["authorization"]}
    delay = 1
    while True:
        try:
            async with websockets.connect(url, additional_headers=headers, ping_interval=30) as ws:
                log.info("rfq client connected")
                delay = 1
                async for raw in ws:
                    msg = json.loads(raw)
                    if msg.get("msg_topic") != "taker_quote" or msg.get("msg_type") != "request":
                        continue
                    rfq = msg["msg"]
                    log.info("RFQ %s", rfq.get("quote_id", "")[:8])
                    quote = build_quote(rfq, options, c)
                    if quote:
                        await ws.send(json.dumps(quote))
                        log.info("quoted %s (signed=%s)", rfq["quote_id"][:8],
                                 bool(quote["msg"]["signature"]))
                    else:
                        await ws.send(json.dumps({"msg_topic": "taker_quote", "msg_type": "decline",
                                                  "msg": {"quote_id": rfq["quote_id"], "reason": "no quote"}}))
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("rfq client: %s — reconnecting in %ds", e, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 300)


async def discover(c: dict) -> dict[str, Option]:
    w3 = AsyncWeb3(AsyncHTTPProvider(c["rpc"]))
    opts = await fetch_options(w3, c["factory"], c["from_block"])
    if c["only"]:
        opts = [o for o in opts if o.address.lower() in c["only"]]
    return {o.address.lower(): o for o in opts}


async def refresh_loop(options: dict[str, Option], c: dict) -> None:
    while True:
        await asyncio.sleep(60)
        try:
            fresh = await discover(c)
            options.clear()
            options.update(fresh)
        except Exception as e:  # noqa: BLE001
            log.warning("refresh failed: %s", e)


def check_signer(c: dict) -> None:
    """Bebop rejects a quote whose signature doesn't match maker_address."""
    if not c["private_key"]:
        log.warning("no PRIVATE_KEY — quotes will be unsigned and rejected")
        return
    signer = Account.from_key(c["private_key"]).address
    if signer.lower() != c["maker"].lower():
        log.warning("PRIVATE_KEY signs as %s but MAKER_ADDRESS is %s — Bebop will reject "
                    "quotes; set MAKER_ADDRESS to the signer (and register it with Bebop)",
                    signer, c["maker"])


async def main() -> None:
    c = cfg()
    check_signer(c)
    log.info("discovering options on chain %d...", c["chain_id"])
    options = await discover(c)
    log.info("%d options", len(options))
    await asyncio.gather(stream_prices(options, c), run_rfq(options, c), refresh_loop(options, c))


async def show() -> None:
    c = cfg()
    options = await discover(c)
    print(f"\n{len(options)} options on chain {c['chain_id']}:")
    for o in options.values():
        bid, ask = price(o)
        kind = "put " if o.is_put else "call"
        print(f"  {o.address}  {kind} K={o.strike:<10g} dec={o.decimals}  bid=${bid} ask=${ask}")


if __name__ == "__main__":
    load_dotenv()
    logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(show() if len(sys.argv) > 1 and sys.argv[1] == "show" else main())
