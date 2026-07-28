#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["websockets>=13", "httpx>=0.27", "eth-account>=0.13"]
# ///
"""
Bebop options market maker — a single-file Python example.

  1. Discover the option instruments it can quote (HTTP, two upstreams).
  2. Answer options RFQs with a firm EIP-712 signed quote (JSON WebSocket).
  3. Optionally stream levels to Bebop's generic PMM book (protobuf WebSocket).

(2) and (3) are *different Bebop services* with different credentials, and
option instruments only route through (2) — see the table in README.md. The PMM
service accepts option levels and acks them `success`, but its taker router
returns `TokenNotSupported` for those same tokens, so no RFQ ever comes back.

Prices come from Black-Scholes over a parametric IV smile, with spot pulled
from CoinGecko/Binance. That is deliberately the least interesting part —
swap `Pricer.price()` for your own model.

Usage
-----
    ./mm.py instruments          # fetch + print the tradable instruments
    ./mm.py price                # price every instrument, print bid/ask
    ./mm.py quote <addr> sell 1  # simulate one options RFQ, sign it, verify it
    ./mm.py run                  # live: pricing stream + RFQ responder

Config comes from the environment or a `.env` file next to this script.
See .env.example.
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import struct
import sys
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

import httpx
import websockets
from eth_account import Account
from eth_account.messages import encode_typed_data

# ---------------------------------------------------------------------------
# config
# ---------------------------------------------------------------------------

# Bebop's PMM WebSocket root. Chain name is a path segment, not a query param.
BEBOP_WS = "wss://api.bebop.xyz/pmm"

# The options service — a separate product with its own maker socket, its own
# credential (a partner token, not the PMM marketmaker/authorization pair) and
# its own JSON protocol. Option instruments route here, not through the PMM.
BEBOP_OPTIONS_WS = "wss://api.bebop.xyz/options"

# BebopBlend PMM RFQ settlement — same address on every supported chain.
# NOT the JAM settlement at 0xbEbEbEb…, which signs under a different domain.
BEBOP_BLEND = "0xbbbbbBB520d69a9775E85b458C58c648259FAD5F"

CHAIN_IDS = {"ethereum": 1, "base": 8453, "arbitrum": 42161, "unichain": 130}

SECONDS_PER_YEAR = 365 * 24 * 60 * 60


def load_dotenv(path: str = ".env") -> None:
    """Minimal .env loader — existing environment always wins."""
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), path)
    if not os.path.exists(here):
        return
    with open(here) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def envf(key: str, default: float) -> float:
    raw = os.environ.get(key, "").strip()
    return float(raw) if raw else default


@dataclass
class Config:
    chain: str = "ethereum"
    maker_address: str = ""
    private_key: str = ""
    marketmaker: str = ""  # PMM service
    authorization: str = ""  # PMM service
    options_token: str = ""  # options service partner token (Bearer)

    # instrument discovery — primary first, then fallbacks
    instrument_urls: list[str] = field(default_factory=list)

    # pricing
    default_iv: float = 0.80
    risk_free_rate: float = 0.05
    bid_spread: float = 0.02
    ask_spread: float = 0.02
    min_spread: float = 0.001

    # stream behaviour
    level_size: float = 1000.0  # size shown on each side, in base units
    pricing_interval: float = 10.0
    spot_interval: float = 30.0
    quote_ttl: int = 60  # seconds a signed quote stays valid
    max_spread_bps: float = 500.0  # Bebop rejects wide books; skip them instead

    @property
    def chain_id(self) -> int:
        override = env("CHAIN_ID")
        if override:
            return int(override)
        return CHAIN_IDS.get(self.chain, 1)

    @classmethod
    def from_env(cls) -> Config:
        load_dotenv()
        chain = env("CHAIN", "ethereum")
        urls = [u.strip() for u in env("INSTRUMENT_URLS").split(",") if u.strip()]
        if not urls:
            urls = [
                f"https://api.bebop.xyz/options/{chain}/v1/instruments",
                f"https://options.greek.finance/{CHAIN_IDS.get(chain, 1)}/options.json",
            ]
        return cls(
            chain=chain,
            maker_address=env("MAKER_ADDRESS"),
            private_key=env("PRIVATE_KEY"),
            marketmaker=env("BEBOP_MARKETMAKER"),
            authorization=env("BEBOP_AUTHORIZATION"),
            options_token=env("BEBOP_OPTIONS_TOKEN"),
            instrument_urls=urls,
            default_iv=envf("DEFAULT_IV", 0.80),
            risk_free_rate=envf("RISK_FREE_RATE", 0.05),
            bid_spread=envf("BID_SPREAD", 0.02),
            ask_spread=envf("ASK_SPREAD", 0.02),
            level_size=envf("LEVEL_SIZE", 1000.0),
            pricing_interval=envf("PRICING_INTERVAL", 10.0),
            spot_interval=envf("SPOT_POLL_INTERVAL", 30.0),
            quote_ttl=int(envf("QUOTE_TTL", 60)),
        )


def log(*args: object) -> None:
    print(time.strftime("%H:%M:%S"), *args, flush=True)


# ---------------------------------------------------------------------------
# instruments
#
# Two upstreams publish the same options with different field names. Both are
# normalised into `Instrument`, which uses the protocol's own convention:
# `strike` is always consideration-per-collateral in human units (e.g. 2100
# USDC per WETH) for calls *and* puts. The chain stores put strikes inverted
# (1e36 / strike); both feeds already un-invert it in their `strike` field, so
# only `strikeRaw` carries the inverted form.
# ---------------------------------------------------------------------------


@dataclass
class Instrument:
    address: str  # option ERC20 — the base token of the pair
    symbol: str
    strike: float  # consideration per collateral, human units
    expiry: int  # unix seconds
    is_put: bool
    decimals: int  # option token decimals (== collateral decimals)
    underlying: str  # spot symbol, e.g. "ETH"
    quote_address: str  # the stable side of the pair (USDC)
    quote_decimals: int
    source: str = ""

    @property
    def key(self) -> str:
        return self.address.lower()


def _spot_symbol(token_symbol: str) -> str:
    """WETH -> ETH, WBTC -> BTC. Good enough for the pairs we quote."""
    s = token_symbol.upper()
    return s[1:] if s.startswith("W") and len(s) > 2 else s


def parse_bebop_instruments(payload: object) -> list[Instrument]:
    """https://api.bebop.xyz/options/<chain>/v1/instruments"""
    rows = payload["instruments"] if isinstance(payload, dict) else payload
    out = []
    for r in rows:
        is_put = r["optionType"].lower() == "put"
        # Puts are collateralised in USDC, calls in WETH. The stable side is
        # whichever leg is the collateral for a put and the settlement for a call.
        quote_addr = r["collateral"] if is_put else r["settlement"]
        quote_dec = r["collateralDecimals"] if is_put else r["settlementDecimals"]
        underlying = r["settlementSymbol"] if is_put else r["collateralSymbol"]
        out.append(
            Instrument(
                address=r["instrument"],
                symbol=r.get("symbol") or r.get("name", ""),
                # `strike` arrives as a long decimal string for puts (an
                # artifact of inverting 1e36/K); float() truncates it back.
                strike=float(r["strike"]),
                expiry=int(r["expiration"]),
                is_put=is_put,
                decimals=int(r.get("decimals", r["collateralDecimals"])),
                underlying=_spot_symbol(underlying),
                quote_address=quote_addr,
                quote_decimals=int(quote_dec),
                source="bebop",
            )
        )
    return out


def parse_greek_instruments(payload: object) -> list[Instrument]:
    """https://options.greek.finance/<chainId>/options.json"""
    rows = payload["options"] if isinstance(payload, dict) else payload
    out = []
    for r in rows:
        is_put = bool(r["isPut"])
        quote_addr = r["collateral"] if is_put else r["consideration"]
        quote_dec = r["collateralDecimals"] if is_put else r["considerationDecimals"]
        underlying = r["considerationSymbol"] if is_put else r["collateralSymbol"]
        out.append(
            Instrument(
                address=r["option"],
                symbol=r.get("symbol") or r.get("name", ""),
                # strikeNorm is the rounded human strike; strike carries the
                # inversion residue for puts (1200.0000000000005).
                strike=float(r.get("strikeNorm") or r["strike"]),
                expiry=int(r["expirationDate"]),
                is_put=is_put,
                decimals=int(r["collateralDecimals"]),
                underlying=_spot_symbol(underlying),
                quote_address=quote_addr,
                quote_decimals=int(quote_dec),
                source="greek",
            )
        )
    return out


def fetch_instruments(cfg: Config) -> list[Instrument]:
    """Try each configured URL in order; first one that parses wins."""
    errors = []
    for url in cfg.instrument_urls:
        parse = parse_greek_instruments if "greek.finance" in url else parse_bebop_instruments
        try:
            resp = httpx.get(url, timeout=15.0)
            resp.raise_for_status()
            insts = parse(resp.json())
            if not insts:
                raise ValueError("empty instrument list")
            log(f"instruments: {len(insts)} from {url}")
            return insts
        except Exception as exc:  # noqa: BLE001 — any failure means try the next source
            errors.append(f"{url}: {exc}")
            log(f"instruments: {url} failed ({exc})")
    raise RuntimeError("no instrument source reachable:\n  " + "\n  ".join(errors))


# ---------------------------------------------------------------------------
# spot
# ---------------------------------------------------------------------------


COINGECKO_IDS = {"ETH": "ethereum", "BTC": "bitcoin"}


def fetch_spot(symbol: str) -> float | None:
    """CoinGecko primary, Binance fallback (Binance 451s from some regions)."""
    cg_id = COINGECKO_IDS.get(symbol, symbol.lower())
    sources = [
        (
            f"https://api.coingecko.com/api/v3/simple/price?ids={cg_id}&vs_currencies=usd",
            lambda d: float(next(iter(d.values()))["usd"]),
        ),
        (
            f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}USDT",
            lambda d: float(d["price"]),
        ),
    ]
    for url, extract in sources:
        try:
            resp = httpx.get(url, timeout=10.0)
            resp.raise_for_status()
            return extract(resp.json())
        except Exception as exc:  # noqa: BLE001
            log(f"spot: {symbol} lookup failed on {url.split('/')[2]} ({exc})")
    return None


# ---------------------------------------------------------------------------
# pricing
# ---------------------------------------------------------------------------


def norm_cdf(x: float) -> float:
    return 0.5 * math.erfc(-x / math.sqrt(2.0))


def black_scholes(
    S: float, K: float, T: float, r: float, sigma: float
) -> tuple[float, float, float, float]:
    """European call/put price and delta, per unit of collateral.

    Returns (call, put, call_delta, put_delta). Deltas are from the long-option
    perspective, which is what the options RFQ response reports.
    """
    if T <= 0:
        call, put = max(0.0, S - K), max(0.0, K - S)
        return call, put, (1.0 if S > K else 0.0), (-1.0 if K > S else 0.0)
    if sigma <= 0:
        pv = K * math.exp(-r * T)
        call, put = max(0.0, S - pv), max(0.0, pv - S)
        return call, put, (1.0 if S > pv else 0.0), (-1.0 if pv > S else 0.0)

    sqrt_t = math.sqrt(T)
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrt_t)
    d2 = d1 - sigma * sqrt_t
    disc = math.exp(-r * T)
    call = S * norm_cdf(d1) - K * disc * norm_cdf(d2)
    put = K * disc * norm_cdf(-d2) - S * norm_cdf(-d1)
    return call, put, norm_cdf(d1), norm_cdf(d1) - 1.0


@dataclass
class Quote:
    bid: float
    ask: float
    mid: float
    iv: float
    spot: float
    tte: float  # years
    delta: float  # long-option delta, per contract (tradfi convention)


class Pricer:
    """Black-Scholes over a parametric smile, plus a flat spread.

    Smile:  sigma(K, T) = atm_iv + (skew*k + curvature*k^2) * sqrt(term_ref / T)
    with k = log(K/S). The sqrt term lifts short-dated wings, matching the
    observed term structure. All coefficients are env-tunable.
    """

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.spot: dict[str, float] = {}
        self.instruments: dict[str, Instrument] = {}
        self.skew = envf("IV_SKEW", -0.3)
        self.curvature = envf("IV_CURVATURE", 3.0)
        self.term_ref = envf("IV_TERM_REF_DAYS", 30.0) / 365.0
        self.put_offset = envf("IV_PUT_OFFSET", 0.0)
        self.max_term_boost = 6.0
        self.min_iv, self.max_iv = 0.10, 3.0

    def load(self, instruments: list[Instrument]) -> None:
        self.instruments = {i.key: i for i in instruments}

    def get(self, address: str) -> Instrument | None:
        return self.instruments.get(address.lower())

    def refresh_spot(self) -> None:
        for symbol in sorted({i.underlying for i in self.instruments.values()}):
            price = fetch_spot(symbol)
            if price:
                self.spot[symbol] = price
                log(f"spot: {symbol} = ${price:,.2f}")

    def iv(self, inst: Instrument, S: float, T: float) -> float:
        if S <= 0 or inst.strike <= 0 or T <= 0:
            return self.cfg.default_iv
        k = math.log(inst.strike / S)
        boost = min(self.max_term_boost, math.sqrt(self.term_ref / max(T, 1 / 365)))
        raw = self.cfg.default_iv + (self.skew * k + self.curvature * k * k) * boost
        if inst.is_put:
            raw += self.put_offset
        return min(self.max_iv, max(self.min_iv, raw))

    def price(self, address: str, inst: Instrument | None = None) -> Quote | None:
        """Price a registered instrument, or one supplied inline (options RFQs
        carry their own instrument terms, which may predate our last refresh)."""
        inst = inst or self.get(address)
        if inst is None:
            return None
        S = self.spot.get(inst.underlying)
        if not S:
            return None

        T = max(0.0, inst.expiry - time.time()) / SECONDS_PER_YEAR
        sigma = self.iv(inst, S, T)
        call, put, call_delta, put_delta = black_scholes(
            S, inst.strike, T, self.cfg.risk_free_rate, sigma
        )

        # A put token is a claim on 1 unit of *consideration-denominated*
        # collateral (1 USDC), so the BS price — quoted per collateral unit,
        # i.e. per WETH — has to be divided by the strike to get the per-token
        # price. Calls are already per collateral token.
        mid = put / inst.strike if inst.is_put else call

        bid_off = max(mid * self.cfg.bid_spread, self.cfg.min_spread / 2)
        ask_off = max(mid * self.cfg.ask_spread, self.cfg.min_spread / 2)
        return Quote(
            bid=max(0.0, mid - bid_off),
            ask=mid + ask_off,
            mid=mid,
            iv=sigma,
            spot=S,
            tte=T,
            # Reported per contract in the tradfi sense (strike un-inverted),
            # not per option token — the price is scaled, the delta is not.
            delta=put_delta if inst.is_put else call_delta,
        )

    def quotable(self) -> list[tuple[Instrument, Quote]]:
        """Instruments with a sane, streamable two-sided market."""
        out = []
        for inst in self.instruments.values():
            q = self.price(inst.address)
            if q is None or q.bid <= 0 or q.ask <= 0:
                continue
            mid = (q.bid + q.ask) / 2
            if mid <= 0 or ((q.ask - q.bid) / mid) * 10_000 > self.cfg.max_spread_bps:
                continue
            out.append((inst, q))
        return out


# ---------------------------------------------------------------------------
# protobuf — hand-rolled codec for pricing.proto (see that file for the schema)
#
# The schema is small and closed, so encoding it directly keeps this example to
# one file with no protoc step. Field numbers below must match pricing.proto.
# ---------------------------------------------------------------------------

WIRE_VARINT, WIRE_64BIT, WIRE_LEN = 0, 1, 2


def _varint(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        out.append(byte | (0x80 if value else 0))
        if not value:
            return bytes(out)


def _tag(field_no: int, wire: int) -> bytes:
    return _varint((field_no << 3) | wire)


def pb_uint32(field_no: int, value: int) -> bytes:
    return _tag(field_no, WIRE_VARINT) + _varint(value)


def pb_bytes(field_no: int, value: bytes) -> bytes:
    return _tag(field_no, WIRE_LEN) + _varint(len(value)) + value


def pb_string(field_no: int, value: str) -> bytes:
    return pb_bytes(field_no, value.encode())


def pb_packed_doubles(field_no: int, values: list[float]) -> bytes:
    return pb_bytes(field_no, struct.pack(f"<{len(values)}d", *values))


def hex_to_bytes(addr: str) -> bytes:
    return bytes.fromhex(addr.removeprefix("0x"))


def encode_levels(
    chain_id: int,
    maker_address: str,
    levels: list[tuple[Instrument, Quote]],
    size: float,
) -> bytes:
    """LevelsSchema{chain_id, "pricing", "update", LevelMsg{levels, maker}}."""
    level_msgs = []
    for inst, q in levels:
        level_msgs.append(
            pb_bytes(1, hex_to_bytes(inst.address))  # LevelInfo.base_address
            + pb_uint32(2, inst.decimals)  # base_decimals
            + pb_bytes(3, hex_to_bytes(inst.quote_address))  # quote_address
            + pb_uint32(4, inst.quote_decimals)  # quote_decimals
            + pb_packed_doubles(5, [q.bid, size])  # bids  [price, amount]
            + pb_packed_doubles(6, [q.ask, size])  # asks  [price, amount]
        )

    msg = b"".join(pb_bytes(1, lvl) for lvl in level_msgs)  # LevelMsg.levels
    msg += pb_bytes(2, hex_to_bytes(maker_address))  # LevelMsg.maker_address

    return (
        pb_uint32(1, chain_id)  # LevelsSchema.chain_id
        + pb_string(2, "pricing")  # msg_topic
        + pb_string(3, "update")  # msg_type
        + pb_bytes(4, msg)  # msg
    )


def pb_read(buf: bytes) -> dict[int, list]:
    """Schema-less decode into {field_number: [values]}.

    Varints come back as ints, length-delimited fields as bytes. Enough to read
    Bebop's acks (see AckSchema in pricing.proto) without a second generated type.
    """
    out: dict[int, list] = {}
    pos = 0
    while pos < len(buf):
        tag, pos = _read_varint(buf, pos)
        field_no, wire = tag >> 3, tag & 0x07
        if wire == WIRE_VARINT:
            value, pos = _read_varint(buf, pos)
        elif wire == WIRE_LEN:
            length, pos = _read_varint(buf, pos)
            value, pos = buf[pos : pos + length], pos + length
        elif wire == WIRE_64BIT:
            value, pos = struct.unpack_from("<d", buf, pos)[0], pos + 8
        else:
            raise ValueError(f"unsupported wire type {wire}")
        out.setdefault(field_no, []).append(value)
    return out


def _read_varint(buf: bytes, pos: int) -> tuple[int, int]:
    value = shift = 0
    while True:
        byte = buf[pos]
        pos += 1
        value |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return value, pos
        shift += 7


def describe_ack(raw: bytes) -> str:
    """Render a pricing-stream ack, e.g. 'success: Message processed successfully'."""
    try:
        top = pb_read(raw)
        kind = top[3][0].decode()
        inner = pb_read(top[4][0])
        return f"{kind}: {inner[2][0].decode()}"
    except Exception:  # noqa: BLE001 — never let a log line kill the stream
        return repr(raw)


# ---------------------------------------------------------------------------
# EIP-712 quote signing
# ---------------------------------------------------------------------------

SINGLE_ORDER_TYPE = [
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
]


def build_typed_data(chain_id: int, order: dict) -> dict:
    return {
        "domain": {
            "name": "BebopSettlement",
            "version": "2",
            "chainId": chain_id,
            "verifyingContract": BEBOP_BLEND,
        },
        "types": {"SingleOrder": SINGLE_ORDER_TYPE},
        "primaryType": "SingleOrder",
        "message": order,
    }


def sign_order(chain_id: int, order: dict, private_key: str) -> str:
    """EIP-712 sign a SingleOrder. Returns a 65-byte hex signature."""
    key = private_key if private_key.startswith("0x") else "0x" + private_key
    signable = encode_typed_data(full_message=build_typed_data(chain_id, order))
    return Account.sign_message(signable, private_key=key).signature.hex()


def recover_signer(chain_id: int, order: dict, signature: str) -> str:
    signable = encode_typed_data(full_message=build_typed_data(chain_id, order))
    return Account.recover_message(signable, signature=signature)


# ---------------------------------------------------------------------------
# RFQ handling
#
# Two different Bebop services, two different maker protocols:
#
#   options  wss://api.bebop.xyz/options/<chain>/v1/maker/ws
#            JSON, envelope msg_topic "options_quote". Pure RFQ — there is no
#            pricing stream. Bebop hands you a `signable_message` with nulls
#            punched out; you fill them, sign, and answer with a `premium`.
#            THIS is the path option instruments actually route through.
#
#   pmm      wss://api.bebop.xyz/pmm/<chain>/v3/maker/{pricing,quote}
#            protobuf levels + JSON `taker_quote` RFQs. The generic Bebop PMM
#            service. It accepts option levels but its router does not carry
#            option tokens (`TokenNotSupported`), so RFQs never arrive here.
#
# Both are implemented below; `run` connects to whichever is configured.
# ---------------------------------------------------------------------------


class NoQuote(Exception):
    """Raised when we cannot or will not make a market on this RFQ.

    `error_type` must be one of the options API's documented enum values;
    it is ignored by the PMM path, which takes free text.
    """

    def __init__(self, message: str, error_type: str = "rejected"):
        super().__init__(message)
        self.error_type = error_type


def build_pmm_quote(cfg: Config, pricer: Pricer, req: dict) -> dict:
    """Turn one PMM `taker_quote` request into a signed response `msg`."""
    legs = req.get("quotes") or []
    if len(legs) != 1:
        raise NoQuote(f"expected a single leg, got {len(legs)}")
    leg = legs[0]

    # maker_token: what the taker receives from us. taker_token: what they give.
    maker_token, taker_token = leg["maker_token"], leg["taker_token"]
    maker_inst = pricer.get(maker_token)
    taker_inst = pricer.get(taker_token)

    if maker_inst and taker_inst:
        raise NoQuote("option-for-option is not supported")
    if not maker_inst and not taker_inst:
        raise NoQuote("neither leg is a known option")

    if maker_inst:
        # Taker is buying options from us — we sell at the ask.
        inst, side = maker_inst, "ask"
        option_raw = int(leg.get("maker_amount") or 0)
    else:
        # Taker is selling options to us — we buy at the bid.
        inst, side = taker_inst, "bid"
        option_raw = int(leg.get("taker_amount") or 0)

    if option_raw <= 0:
        raise NoQuote("taker did not specify an option amount")

    quote = pricer.price(inst.address)
    if quote is None:
        raise NoQuote(f"no price for {inst.symbol} (spot missing?)")

    price = quote.ask if side == "ask" else quote.bid
    if price <= 0:
        raise NoQuote(f"non-positive {side} for {inst.symbol}")

    # Convert to raw stable-token units:  options * price, rescaled by decimals.
    stable_raw = int((option_raw * price * 10**inst.quote_decimals) / 10**inst.decimals)
    if stable_raw <= 0:
        raise NoQuote("quote rounds to zero")

    if side == "ask":
        maker_amount, taker_amount = option_raw, stable_raw
    else:
        maker_amount, taker_amount = stable_raw, option_raw

    # The quoted unit price, per the docs — NOT maker_amount/taker_amount.
    # (The TS maker divides the raw amounts, which on an 18/6-decimal pair
    # yields a meaningless ~1e-11.)
    reference_price = price

    expiry = int(time.time()) + cfg.quote_ttl
    taker_address = req.get("taker_address", "")
    receiver = req.get("receiver") or taker_address

    msg = {
        "quote_id": req["quote_id"],
        "event_id": req.get("event_id"),
        "order_signing_type": req.get("order_signing_type", "SingleOrder"),
        "order_type": req.get("order_type", "Single"),
        "onchain_partner_id": req.get("onchain_partner_id", 0),
        "expiry": expiry,
        "taker_address": taker_address,
        "maker_address": cfg.maker_address,
        "maker_nonce": req.get("maker_nonce", "0"),
        "quotes": [
            {
                "taker_token": taker_token,
                "maker_token": maker_token,
                "taker_amount": str(taker_amount),
                "maker_amount": str(maker_amount),
                "reference_price": reference_price,
            }
        ],
        "receiver": receiver,
        "commands": req.get("commands"),
        "packed_commands": req.get("packed_commands"),
        "fee_native": req.get("fee_native"),
        "is_aggregate_order": req.get("is_aggregate_order"),
        "expiry_type": req.get("expiry_type", "standard"),
    }
    if req.get("origin_address"):
        msg["origin_address"] = req["origin_address"]

    if msg["order_signing_type"] != "SingleOrder":
        raise NoQuote(f"unsupported signing type {msg['order_signing_type']}")

    if cfg.private_key:
        order = {
            "partner_id": int(msg["onchain_partner_id"] or 0),
            "expiry": expiry,
            "taker_address": taker_address,
            "maker_address": cfg.maker_address,
            "maker_nonce": int(msg["maker_nonce"] or 0),
            "taker_token": taker_token,
            "maker_token": maker_token,
            "taker_amount": taker_amount,
            "maker_amount": maker_amount,
            "receiver": receiver,
            "packed_commands": int(msg["packed_commands"] or 0),
        }
        sig = sign_order(cfg.chain_id, order, cfg.private_key)
        # The PMM service wants signature as an OBJECT. A bare string makes
        # Bebop silently drop the response — the taker just sees TimedOut,
        # with no error back to the maker. (The options service is the other
        # way round: bare string plus a sibling `sign_scheme` field.)
        msg["signature"] = {
            "signature": sig if sig.startswith("0x") else "0x" + sig,
            "sign_scheme": "EIP712",
        }
    else:
        log("warning: no PRIVATE_KEY — sending an unsigned quote")

    log(
        f"quote {req['quote_id'][:8]}: {side} {inst.symbol} "
        f"{option_raw / 10**inst.decimals:.6g} @ {price:.6g} "
        f"= {stable_raw / 10**inst.quote_decimals:.6f}"
    )
    return msg


# ---------------------------------------------------------------------------
# options maker protocol
#
# Bebop sends {chain_id, msg_topic: "options_quote", msg_type: "request", msg}
# where msg carries `side`, the `instrument` terms, and a `signable_message`
# with two fields nulled out for us to fill:
#
#   side="sell"  taker sells the option to open  -> we BUY  (bid)
#                taker_token=option, maker_token=USDC
#                taker_amount given; maker_address + maker_amount are null
#
#   side="buy"   taker buys the option to close  -> we SELL (ask)
#                taker_token=USDC, maker_token=option
#                maker_amount given; taker_amount is null, maker_address
#                arrives prefilled (closes route only to the opening maker)
#
# The response is a firm signed order: echo quote_id, report the total USDC
# `premium`, sign the completed message. The schema is strict — no extra keys.
# ---------------------------------------------------------------------------

OPTIONS_ERRORS = frozenset(
    {
        "unsupported_instrument",
        "size_exceeds_capacity",
        "instrument_expired",
        "no_inventory",
        "pricing_unavailable",
        "rejected",
    }
)


def instrument_from_rfq(payload: dict) -> Instrument | None:
    """Parse the `instrument` block carried inside an options RFQ.

    It uses the same schema as the instruments endpoint, so quoting does not
    depend on our discovery having seen this series yet.
    """
    try:
        return parse_bebop_instruments([payload])[0]
    except (KeyError, TypeError, ValueError):
        return None


def build_options_quote(cfg: Config, pricer: Pricer, req: dict) -> dict:
    """Turn one options_quote request into a signed response `msg`."""
    quote_id = req.get("quote_id")
    side = (req.get("side") or "").lower()
    if side not in ("buy", "sell"):
        raise NoQuote(f"unknown side {side!r}", "rejected")

    signable = dict(req.get("signable_message") or {})
    if not signable:
        raise NoQuote("request carried no signable_message", "rejected")

    # Prefer the terms Bebop sent; fall back to our own discovery by address.
    option_token = signable["taker_token"] if side == "sell" else signable["maker_token"]
    inst = instrument_from_rfq(req.get("instrument") or {}) or pricer.get(option_token)
    if inst is None:
        raise NoQuote(f"unknown instrument {option_token}", "unsupported_instrument")
    if inst.expiry <= time.time():
        raise NoQuote(f"{inst.symbol} expired", "instrument_expired")

    if side == "sell":
        option_raw = int(signable.get("taker_amount") or 0)
    else:
        option_raw = int(signable.get("maker_amount") or 0)
    if option_raw <= 0:
        raise NoQuote("no option amount in signable_message", "rejected")

    quote = pricer.price(inst.address, inst)
    if quote is None:
        raise NoQuote(f"no spot for {inst.underlying}", "pricing_unavailable")

    # sell-to-open: taker sells to us, we pay our bid. buy-to-close: we sell at ask.
    price = quote.bid if side == "sell" else quote.ask
    if price <= 0:
        raise NoQuote(f"non-positive price for {inst.symbol}", "pricing_unavailable")

    # `premium` is the total USDC for the whole requested size, raw units.
    premium = int(option_raw * price * 10**inst.quote_decimals / 10**inst.decimals)
    if premium <= 0:
        raise NoQuote("premium rounds to zero", "rejected")

    # Fill the nulls. Everything else is echoed exactly as received — the
    # signature has to cover Bebop's own nonce, expiry and receiver.
    order = dict(signable)
    order["maker_address"] = cfg.maker_address
    if side == "sell":
        order["maker_amount"] = str(premium)
    else:
        order["taker_amount"] = str(premium)

    prefilled = (signable.get("maker_address") or "").lower()
    if prefilled and prefilled != cfg.maker_address.lower():
        raise NoQuote(f"close routed to another maker ({prefilled})", "rejected")

    if any(v is None for v in order.values()):
        missing = [k for k, v in order.items() if v is None]
        raise NoQuote(f"unfilled fields in signable_message: {missing}", "rejected")

    if not cfg.private_key:
        raise NoQuote("no PRIVATE_KEY configured — cannot sign a firm order", "rejected")

    sig = sign_order(cfg.chain_id, typed_order(order), cfg.private_key)

    log(
        f"options {str(quote_id)[:12]}: {side} {inst.symbol} "
        f"{option_raw / 10**inst.decimals:.6g} @ {price:.6g} "
        f"premium={premium / 10**inst.quote_decimals:.6f} USDC "
        f"iv={quote.iv:.1%} delta={quote.delta:+.3f}"
    )

    return {
        "quote_id": quote_id,
        "maker_address": cfg.maker_address,
        "premium": str(premium),
        "signature": sig if sig.startswith("0x") else "0x" + sig,
        "sign_scheme": "EIP712",
        "iv": round(quote.iv, 6),
        "delta": round(quote.delta, 6),
        "spot_price": round(quote.spot, 6),
    }


def typed_order(signable: dict) -> dict:
    """Coerce a filled signable_message into EIP-712 SingleOrder field types.

    The wire carries every numeric as a decimal string; eth-account needs ints
    for uint fields and checksum-agnostic hex for addresses.
    """
    return {
        "partner_id": int(signable["partner_id"] or 0),
        "expiry": int(signable["expiry"]),
        "taker_address": signable["taker_address"],
        "maker_address": signable["maker_address"],
        "maker_nonce": int(signable["maker_nonce"] or 0),
        "taker_token": signable["taker_token"],
        "maker_token": signable["maker_token"],
        "taker_amount": int(signable["taker_amount"]),
        "maker_amount": int(signable["maker_amount"]),
        "receiver": signable["receiver"],
        "packed_commands": int(signable["packed_commands"] or 0),
    }


# ---------------------------------------------------------------------------
# websocket loops
# ---------------------------------------------------------------------------


def ws_headers(cfg: Config) -> dict[str, str]:
    return {"marketmaker": cfg.marketmaker, "authorization": cfg.authorization}


async def reconnect_forever(name: str, run: Callable[[], Awaitable[None]]) -> None:
    """Run a coroutine factory, reconnecting with capped exponential backoff."""
    attempt = 0
    while True:
        try:
            await run()
            attempt = 0  # clean return means the connection was up
        except Exception as exc:  # noqa: BLE001 — the whole point is to survive
            log(f"{name}: {type(exc).__name__}: {exc}")
        delay = min(5 * 2**attempt, 300)
        attempt += 1
        log(f"{name}: reconnecting in {delay}s")
        await asyncio.sleep(delay)


async def pricing_stream(cfg: Config, pricer: Pricer) -> None:
    url = f"{BEBOP_WS}/{cfg.chain}/v3/maker/pricing?format=protobuf"
    log(f"pricing: connecting {url}")
    async with websockets.connect(url, additional_headers=ws_headers(cfg)) as ws:
        log("pricing: connected")

        async def reader() -> None:
            async for raw in ws:
                if isinstance(raw, bytes):
                    log(f"pricing <- {describe_ack(raw)}")
                else:
                    log(f"pricing <- {raw}")

        async def writer() -> None:
            while True:
                levels = pricer.quotable()
                if levels:
                    payload = encode_levels(cfg.chain_id, cfg.maker_address, levels, cfg.level_size)
                    await ws.send(payload)
                    log(f"pricing -> {len(levels)} levels, {len(payload)} bytes")
                else:
                    log("pricing: nothing quotable this tick")
                await asyncio.sleep(cfg.pricing_interval)

        await asyncio.gather(reader(), writer())


async def pmm_rfq_stream(cfg: Config, pricer: Pricer) -> None:
    url = f"{BEBOP_WS}/{cfg.chain}/v3/maker/quote"
    log(f"pmm-rfq: connecting {url}")
    async with websockets.connect(url, additional_headers=ws_headers(cfg)) as ws:
        log("pmm-rfq: connected")
        async for raw in ws:
            try:
                envelope = json.loads(raw)
            except json.JSONDecodeError:
                log(f"pmm-rfq <- unparseable {raw!r}")
                continue

            topic, kind = envelope.get("msg_topic"), envelope.get("msg_type")
            if topic != "taker_quote" or kind != "request":
                log(f"pmm-rfq <- {topic}/{kind}")
                continue

            req = envelope.get("msg") or {}
            try:
                msg = build_pmm_quote(cfg, pricer, req)
                reply = {
                    "chain_id": cfg.chain_id,
                    "msg_topic": "taker_quote",
                    "msg_type": "response",
                    "msg": msg,
                }
            except NoQuote as exc:
                log(f"pmm-rfq: declining {req.get('quote_id', '?')[:8]} — {exc}")
                reply = {
                    "chain_id": cfg.chain_id,
                    "msg_topic": "taker_quote",
                    "msg_type": "decline",
                    "msg": {"quote_id": req.get("quote_id"), "reason": str(exc)},
                }
            await ws.send(json.dumps(reply))


async def options_rfq_stream(cfg: Config, pricer: Pricer) -> None:
    """The options maker socket. JSON frames, `options_quote` envelope."""
    url = f"{BEBOP_OPTIONS_WS}/{cfg.chain}/v1/maker/ws"
    log(f"options: connecting {url}")
    headers = {"Authorization": f"Bearer {cfg.options_token}"}
    async with websockets.connect(url, additional_headers=headers) as ws:
        log("options: connected")
        async for raw in ws:
            try:
                envelope = json.loads(raw)
            except json.JSONDecodeError:
                log(f"options <- unparseable {raw!r}")
                continue

            topic, kind = envelope.get("msg_topic"), envelope.get("msg_type")
            if topic != "options_quote" or kind != "request":
                log(f"options <- {topic}/{kind}: {envelope.get('msg')}")
                continue

            req = envelope.get("msg") or {}
            try:
                reply = {
                    "chain_id": cfg.chain_id,
                    "msg_topic": "options_quote",
                    "msg_type": "response",
                    "msg": build_options_quote(cfg, pricer, req),
                }
            except NoQuote as exc:
                kind = exc.error_type if exc.error_type in OPTIONS_ERRORS else "rejected"
                log(f"options: declining {req.get('quote_id', '?')} — {kind}: {exc}")
                reply = {
                    "chain_id": cfg.chain_id,
                    "msg_topic": "options_quote",
                    "msg_type": "error",
                    "msg": {
                        "quote_id": req.get("quote_id"),
                        "error_type": kind,
                        "error_msg": str(exc)[:512],
                    },
                }
            await ws.send(json.dumps(reply))


async def spot_loop(cfg: Config, pricer: Pricer) -> None:
    while True:
        await asyncio.to_thread(pricer.refresh_spot)
        await asyncio.sleep(cfg.spot_interval)


async def instrument_loop(cfg: Config, pricer: Pricer) -> None:
    """Re-discover instruments hourly so new expiries appear without a restart."""
    while True:
        await asyncio.sleep(3600)
        try:
            pricer.load(await asyncio.to_thread(fetch_instruments, cfg))
        except Exception as exc:  # noqa: BLE001
            log(f"instruments: refresh failed ({exc}) — keeping previous set")


# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------


def cmd_instruments(cfg: Config) -> int:
    insts = fetch_instruments(cfg)
    print(f"\n{'symbol':<40} {'type':<5} {'strike':>10} {'expiry':<12} {'dec':>4}  address")
    for i in sorted(insts, key=lambda x: (x.expiry, x.is_put, x.strike)):
        exp = time.strftime("%Y-%m-%d", time.gmtime(i.expiry))
        kind = "put" if i.is_put else "call"
        print(f"{i.symbol:<40} {kind:<5} {i.strike:>10,.0f} {exp:<12} {i.decimals:>4}  {i.address}")
    print(f"\n{len(insts)} instruments from {insts[0].source}")
    return 0


def cmd_price(cfg: Config) -> int:
    pricer = Pricer(cfg)
    pricer.load(fetch_instruments(cfg))
    pricer.refresh_spot()
    if not pricer.spot:
        print("no spot price available — cannot price", file=sys.stderr)
        return 1

    rows = pricer.quotable()
    print(f"\n{'symbol':<40} {'bid':>12} {'ask':>12} {'mid':>12} {'iv':>7} {'days':>7}  quoted in")
    for inst, q in sorted(rows, key=lambda r: (r[0].expiry, r[0].is_put, r[0].strike)):
        print(
            f"{inst.symbol:<40} {q.bid:>12.6f} {q.ask:>12.6f} {q.mid:>12.6f} "
            f"{q.iv * 100:>6.1f}% {q.tte * 365:>7.2f}  {inst.quote_address[:10]}…"
        )
    skipped = len(pricer.instruments) - len(rows)
    print(f"\n{len(rows)} quotable, {skipped} skipped (no price / spread too wide)")

    # Show exactly what would go on the wire.
    if rows:
        payload = encode_levels(
            cfg.chain_id, cfg.maker_address or BEBOP_BLEND, rows, cfg.level_size
        )
        print(f"protobuf LevelsSchema: {len(payload)} bytes for {len(rows)} levels")
    return 0


def simulate_options_rfq(inst: Instrument, side: str, amount: float) -> dict:
    """Build an options RFQ shaped exactly as Bebop sends one.

    `side` is from the taker's perspective: "sell" opens (they sell to us),
    "buy" closes (they buy back from us). Nulls are the fields we must fill.
    """
    option_raw = str(int(amount * 10**inst.decimals))
    taker = "0x1111111111111111111111111111111111111111"
    signable = {
        "partner_id": "0",
        "expiry": str(int(time.time()) + 60),
        "taker_address": taker,
        "maker_address": None,
        "maker_nonce": str(int(time.time())),
        "taker_token": None,
        "maker_token": None,
        "taker_amount": None,
        "maker_amount": None,
        "receiver": taker,
        "packed_commands": "0",
    }
    if side == "sell":  # sell-to-open
        signable |= {
            "taker_token": inst.address,
            "maker_token": inst.quote_address,
            "taker_amount": option_raw,
        }
    else:  # buy-to-close — maker_address arrives prefilled on real closes
        signable |= {
            "taker_token": inst.quote_address,
            "maker_token": inst.address,
            "maker_amount": option_raw,
        }
    return {
        "request_id": "00000000-0000-0000-0000-000000000000",
        "quote_id": "opt-simulated",
        "side": side,
        "fee_usd": 0,
        "signable_message": signable,
    }


def cmd_quote(cfg: Config, argv: list[str]) -> int:
    """Build + sign one options quote offline against a synthetic RFQ."""
    if len(argv) < 2:
        print("usage: mm.py quote <option-address|symbol> <buy|sell> [amount]", file=sys.stderr)
        print("  sell = taker sells to open (we bid);  buy = taker buys to close (we ask)")
        return 2
    target, side = argv[0], argv[1].lower()
    amount = float(argv[2]) if len(argv) > 2 else 1.0
    if side not in ("buy", "sell"):
        print("side must be 'buy' (taker closes) or 'sell' (taker opens)", file=sys.stderr)
        return 2

    pricer = Pricer(cfg)
    pricer.load(fetch_instruments(cfg))
    pricer.refresh_spot()

    inst = pricer.get(target) or next(
        (i for i in pricer.instruments.values() if i.symbol.lower() == target.lower()), None
    )
    if inst is None:
        print(f"unknown instrument: {target}", file=sys.stderr)
        return 1

    req = simulate_options_rfq(inst, side, amount)
    print("--- request (as Bebop would send it) ---")
    print(json.dumps({"msg_topic": "options_quote", "msg_type": "request", "msg": req}, indent=2))

    try:
        msg = build_options_quote(cfg, pricer, req)
    except NoQuote as exc:
        print(f"\ndeclined [{exc.error_type}]: {exc}", file=sys.stderr)
        return 1

    print("\n--- response ---")
    print(
        json.dumps(
            {
                "chain_id": cfg.chain_id,
                "msg_topic": "options_quote",
                "msg_type": "response",
                "msg": msg,
            },
            indent=2,
        )
    )

    # Rebuild the order exactly as we signed it and recover. This is the check
    # Bebop runs before it will honour a firm quote.
    signable = dict(req["signable_message"])
    signable["maker_address"] = msg["maker_address"]
    if side == "sell":
        signable["maker_amount"] = msg["premium"]
    else:
        signable["taker_amount"] = msg["premium"]
    signer = recover_signer(cfg.chain_id, typed_order(signable), msg["signature"])
    ok = signer.lower() == cfg.maker_address.lower()
    print(
        f"\nsignature recovers to {signer} — {'matches' if ok else 'DOES NOT MATCH'} "
        f"MAKER_ADDRESS {cfg.maker_address}"
    )
    return 0 if ok else 1


async def cmd_run(cfg: Config) -> int:
    if not cfg.maker_address:
        print("missing config: MAKER_ADDRESS", file=sys.stderr)
        return 2

    pricer = Pricer(cfg)
    pricer.load(await asyncio.to_thread(fetch_instruments, cfg))
    await asyncio.to_thread(pricer.refresh_spot)

    log(f"maker {cfg.maker_address} on {cfg.chain} (chain id {cfg.chain_id})")
    tasks = [spot_loop(cfg, pricer), instrument_loop(cfg, pricer)]

    # The options socket is where option RFQs actually arrive.
    if cfg.options_token:
        tasks.append(reconnect_forever("options", lambda: options_rfq_stream(cfg, pricer)))
    else:
        log("BEBOP_OPTIONS_TOKEN not set — skipping the options maker socket")

    # The PMM service takes our levels but its router does not carry option
    # tokens, so this streams prices without ever receiving an option RFQ.
    if cfg.marketmaker and cfg.authorization:
        tasks.append(reconnect_forever("pricing", lambda: pricing_stream(cfg, pricer)))
        tasks.append(reconnect_forever("pmm-rfq", lambda: pmm_rfq_stream(cfg, pricer)))
    else:
        log("BEBOP_MARKETMAKER/AUTHORIZATION not set — skipping the PMM sockets")

    if len(tasks) == 2:
        print("no Bebop credentials configured — nothing to connect to", file=sys.stderr)
        return 2

    await asyncio.gather(*tasks)
    return 0


def main(argv: list[str]) -> int:
    cfg = Config.from_env()
    cmd = argv[0] if argv else "run"
    rest = argv[1:]

    if cmd == "instruments":
        return cmd_instruments(cfg)
    if cmd == "price":
        return cmd_price(cfg)
    if cmd == "quote":
        return cmd_quote(cfg, rest)
    if cmd == "run":
        return asyncio.run(cmd_run(cfg))
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        sys.exit(130)
