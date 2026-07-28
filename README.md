# bebop-mm

A Bebop options market maker in one Python file, as an example.

```
mm.py           the market maker — everything is here
pricing.proto   wire schema for the PMM pricing stream
.env.example    configuration
node/           the original TypeScript maker, for reference
```

`node/` is the Node maker this was ported from, copied as-is from
`greekfi/protocol`. It does more than `mm.py` (quote server, price relay,
Deribit IV feed, deploy tooling) but talks only the PMM service and signs with
a bare-string signature — see `node/README.md`.

## Two Bebop services, two protocols

This is the thing to get right before anything else. Bebop runs **two separate
maker products**, and option instruments only route through one of them:

| | options | PMM |
|---|---|---|
| maker socket | `wss://api.bebop.xyz/options/<chain>/v1/maker/ws` | `wss://api.bebop.xyz/pmm/<chain>/v3/maker/{pricing,quote}` |
| auth | `Authorization: Bearer <partner token>` | `marketmaker` + `authorization` headers |
| encoding | JSON | protobuf levels, JSON RFQs |
| envelope | `msg_topic: "options_quote"` | `msg_topic: "taker_quote"` |
| pricing stream | none — pure RFQ | continuous levels |
| carries options? | **yes** | no — its router returns `TokenNotSupported` |

The PMM service will happily accept levels for option tokens and ack them
`success`, which makes it look like it's working. It isn't: its taker router
doesn't know those tokens, so no RFQ ever comes back. Option flow arrives on
the options socket, which has a different credential you have to be onboarded
for. `mm.py` implements both and connects to whichever is configured.

## Run it

Needs [uv](https://docs.astral.sh/uv/). Dependencies are declared inline in
`mm.py` (PEP 723), so there is no install step.

```bash
cp .env.example .env && $EDITOR .env
chmod 600 .env

./mm.py instruments                      # what's quotable
./mm.py price                            # price everything, print the book
./mm.py quote <address|symbol> sell 2    # simulate one RFQ, sign it, verify it
./mm.py run                              # live
```

`instruments` and `price` need no credentials. `quote` needs `PRIVATE_KEY` and
`MAKER_ADDRESS`; it builds an RFQ shaped exactly as Bebop sends one, answers it,
then recovers the signer from its own signature and checks it against
`MAKER_ADDRESS`. If those don't match, Bebop can't settle against you — the
check exists because that failure is otherwise silent.

## The options RFQ flow

Bebop sends a `signable_message` with two fields punched out. You fill them,
sign the completed message, and answer with the total USDC `premium`:

| taker side | meaning | we quote | given | we fill |
|---|---|---|---|---|
| `sell` | sell to open | **bid** | `taker_amount` (options) | `maker_address`, `maker_amount` |
| `buy` | buy to close | **ask** | `maker_amount` (options) | `taker_amount` (`maker_address` prefilled) |

Closes route only to the maker that opened the position, so a `buy` arrives
with `maker_address` already set; `mm.py` refuses it if it isn't us.

Every response is a **firm signed order**. The response schema is strict —
exactly `quote_id`, `maker_address`, `premium`, `signature`, `sign_scheme`,
`iv`, `delta`, `spot_price`, no extra keys. Declines use the documented enum
(`unsupported_instrument`, `size_exceeds_capacity`, `instrument_expired`,
`no_inventory`, `pricing_unavailable`, `rejected`).

## Instruments

Two upstreams publish the same options under different field names. They are
tried in order and normalised into one `Instrument`:

| | Bebop (primary) | greek.finance (fallback) |
|---|---|---|
| URL | `api.bebop.xyz/options/<chain>/v1/instruments` | `options.greek.finance/<chainId>/options.json` |
| shape | `{"instruments": [...]}` | `[...]` |
| address | `instrument` | `option` |
| side | `optionType: "call"\|"put"` | `isPut: bool` |
| stable leg | `settlement` (call) / `collateral` (put) | `consideration` (call) / `collateral` (put) |
| expiry | `expiration` | `expirationDate` |
| strike | `strike` (string) | `strikeNorm` |
| casing | lowercase | checksummed |

Override with `INSTRUMENT_URLS` (comma-separated, tried in order). A URL
containing `greek.finance` uses the second parser; anything else uses the first.

Options RFQs also carry their own `instrument` block, so `mm.py` can price a
series it hasn't discovered yet and falls back to the registry by address.

## Strike inversion

A put here is a swap: deposit WETH, receive USDC. The chain stores its strike
as WETH-per-USDC in WAD — `strikeRaw = 1e18/2100` for a 2100 put — and
`1e36/strikeRaw` recovers the tradfi 2100 USDC/WETH. Both feeds publish that
un-inverted value in `strike`, which is what `Instrument.strike` holds, for
calls and puts alike.

The same inversion is why put prices are divided by the strike: one put token
is a claim on 1 USDC of collateral, not 1 WETH. Black-Scholes gives ~226
USDC/WETH for the 2100 put at 1877 spot; `226/2100 = 0.1077` per token, against
an intrinsic of `(2100-1877)/2100 = 0.106`. Get this wrong and puts are off by
~2000x. `delta` is *not* rescaled — it's reported per contract, tradfi sense.

## Pricing

Black-Scholes over a parametric IV smile:

```
sigma(K, T) = DEFAULT_IV + (IV_SKEW*k + IV_CURVATURE*k^2) * sqrt(IV_TERM_REF_DAYS/365 / T)
k = log(K / S)
```

The `sqrt` term lifts short-dated wings. Spot comes from CoinGecko with Binance
as fallback, repolled every `SPOT_POLL_INTERVAL` seconds. Bid/ask are
`mid ∓ BID_SPREAD/ASK_SPREAD`.

Swap `Pricer.price()` for your own model; nothing else depends on Black-Scholes.

## Protobuf

Only the PMM pricing stream uses protobuf — the options protocol is pure JSON.
`pricing.proto` is the schema of record; `mm.py` encodes and decodes it directly
(~60 lines) so the example stays one file with no codegen step. Field numbers in
the code are commented with the message they belong to and must match the
`.proto`. Verified byte-identical to `protobuf`'s own serializer.

To use generated code instead:

```bash
uv run --with grpcio-tools python -m grpc_tools.protoc -I. --python_out=. pricing.proto
```

## Signing

EIP-712 `SingleOrder` under domain `BebopSettlement` v2, verifying contract
`0xbbbbbBB520d69a9775E85b458C58c648259FAD5F` (BebopBlend PMM RFQ — *not* the JAM
settlement at `0xbEbEbEb…`, which uses a different domain). The options
`signable_message` has exactly the 11 `SingleOrder` fields, so both protocols
sign through the same path. Verified byte-identical to a viem signer.

The two services carry the signature differently, and the PMM one fails
silently if you get it wrong:

```
options   "signature": "0x…", "sign_scheme": "EIP712"      # two sibling fields
pmm       "signature": {"signature": "0x…", "sign_scheme": "EIP712"}
```

A bare string on the PMM path makes Bebop drop the response with no error back
to the maker — the taker just sees `TimedOut`. `reference_price` there is the
quoted unit price, not `maker_amount/taker_amount`.

## Not included

Deliberately out of scope for an example: inventory and risk limits (quotes are
unbounded), on-chain balance/allowance checks — note Bebop requires USDC and
option-token approvals to the settlement contract before you can quote —
position tracking across open/close, order confirmation handling, multi-chain
operation, and persistence. State is in memory; instruments refresh hourly.
