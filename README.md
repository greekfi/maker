# maker

A Bebop RFQ market maker for the Greek.fi options protocol. It discovers
options on-chain and quotes them on Bebop at a **flat price** ($10/token by
default). Real pricing is left as a single function to implement.

## How it works

1. **Discover** — watches the factory for `OptionCreated` events, so it
   always knows the live set of options (and their strike, expiry, put/call).
2. **Price** — asks `PriceSource.price(...)` for a price. The default
   `FlatPriceSource` returns $10 for everything.
3. **Quote** — streams those prices to Bebop and signs RFQ responses
   (EIP-712) when takers ask to trade.

## The one thing to replace: pricing

All pricing goes through one async function — the seam in
`src/greek_mm/pricing/source.py`:

```python
class PriceSource(Protocol):
    async def price(
        self, *, underlying, strike, expiry, is_put, chain_id, option_address
    ) -> PriceResult | None: ...   # PriceResult(bid, ask, mid)
```

The option info is handed to you; return a price. The default is
`FlatPriceSource` (`pricing/flat_source.py`) — ~10 lines that ignore the
inputs and return $10. To add real pricing, implement this protocol and pass
it to `Pricer(...)` instead.

## Quick start

```bash
uv sync                       # install
uv run pytest                 # 22 tests

# see what it would quote (no Bebop connection, no credentials needed):
uv run greek-mm-show 8453

# run the live Bebop maker (needs credentials, see below):
cp .env.example .env && chmod 600 .env   # fill in BEBOP_* / PRIVATE_KEY
uv run greek-mm-bebop
```

`greek-mm-show` scans a chain and prints every option with the price it
would push to Bebop — the quickest way to sanity-check before going live.

## Configuration

Everything is env (`.env` or real env vars). The essentials:

| Var | What |
|---|---|
| `BEBOP_MARKETMAKER`, `BEBOP_AUTHORIZATION` | Bebop maker credentials (from the Bebop team) |
| `PRIVATE_KEY`, `MAKER_ADDRESS` | signing key + address for quotes |
| `CHAIN_ID`, `CHAIN` | which chain to make markets on (e.g. `8453` / `base`) |
| `PRICE_PER_TOKEN` | the flat price (default `10`) |
| `OPTION_ONLY` | optional: comma-separated option addresses to limit to |

See `.env.example` for the full list.

## factories.json

Per-chain factory address + deployment block (where discovery starts). The
canonical copy lives in `greekfi/protocol` (`market-maker/factories.json`);
this repo vendors a snapshot at the root. Point `FACTORIES_JSON` at a
protocol checkout to use a fresher one.

## Protobuf

Bebop's pricing stream is protobuf. Bindings are committed
(`src/greek_mm/bebop/proto/pricing_pb2.py`); regenerate after editing
`proto/pricing.proto`:

```bash
uv run --no-project --python 3.12 --with grpcio-tools \
  python -m grpc_tools.protoc -Iproto --python_out=src/greek_mm/bebop/proto \
  proto/pricing.proto
```

## Notes

- EIP-712 quote signatures are byte-identical to the node maker's viem
  output — pinned in `tests/test_signing.py`.
- This is a port of the Bebop path from the node market maker in
  `greekfi/protocol` (`market-maker/`), minus the pricing engine.
