# node — the TypeScript market maker

The original Node/TypeScript maker, copied from `greekfi/protocol`
(`market-maker/`) for reference. `mm.py` in the repo root is a single-file
Python port of the Bebop parts of this.

This is kept as-is, not maintained here. Copied without `node_modules/`,
`.yarn/cache/`, `dist/`, or `.env`.

## What it does that mm.py doesn't

| | node | mm.py |
|---|---|---|
| Bebop maker | yes (PMM only) | yes (options + PMM) |
| standalone quote server (`/quote`, `/options`, `/price/:addr`) | yes | no |
| multi-chain price relay | yes | no |
| Deribit IV feed | yes | no |
| on-chain option metadata via RPC | yes | no — uses the instruments HTTP feeds |
| deploy tooling (Docker, Fly, PM2, Caddy) | yes | no |

Four modes, each its own PM2 process — see `CLAUDE.md` and `ARCHITECTURE.md`:

| Mode | Entry | Purpose |
|---|---|---|
| `direct` | `src/direct.ts` | standalone HTTP + WS quote server |
| `relay` | `src/relay.ts` | fans Bebop's taker pricing feed out to local clients |
| `bebop` | `src/bebop.ts` | Bebop PMM maker |
| `deribit` | `src/deribit.ts` | sources IV from Deribit |

```bash
corepack enable && yarn install
cp .env.example .env && chmod 600 .env
yarn direct    # or: yarn relay / yarn bebop / yarn deribit
```

## Two known issues

Both were found while porting, and both are fixed in `mm.py`. They are left
in place here so this stays a faithful copy of what was deployed.

**1. It only talks the PMM service, so it never sees option RFQs.**
`src/bebop/client.ts` connects to `wss://api.bebop.xyz/pmm/<chain>/v3/maker/quote`
and `src/bebop/pricingStream.ts` streams protobuf levels to the matching
pricing socket. Bebop acks those levels `success`, but its PMM taker router
answers `TokenNotSupported` for option ERC20s — verified across all 36 live
ETH instruments, both directions. Option flow arrives on a different service
(`wss://api.bebop.xyz/options/<chain>/v1/maker/ws`, JSON, `options_quote`,
Bearer partner token). See the root README.

**2. It signs quotes with a bare-string `signature`.**
`src/bebop/client.ts` sets `msg.signature = signature` and
`src/pricing/pricer.ts` does the same in `handleRfq`. The PMM service wants an
object — `{"signature": "0x…", "sign_scheme": "EIP712"}` — and silently drops
the response otherwise, with the taker seeing `TimedOut` and no error back to
the maker.

Separately, `PRIVATE_KEY` and `MAKER_ADDRESS` must be the same key. If they
aren't, every quote is signed by an address Bebop won't settle against, and
nothing tells you.

## Pricing notes worth keeping

`src/pricing/pricer.ts` carries the strike convention the Python port also
implements: `strike` is consideration-per-collateral for calls and puts alike,
and put prices are divided by the strike because one put token is a claim on
1 USDC of collateral rather than 1 WETH. `src/config/metadata.ts` un-inverts
the contract-stored put strike (`1e36 / strike`) before it reaches the pricer.

## ABIs

Inlined as small `as const` arrays rather than imported — `DECIMALS_ABI`
(`src/direct.ts`), `OPTION_ABI` and `REDEMPTION_ABI` (`src/config/metadata.ts`).
If the on-chain interface changes, these need updating by hand.
