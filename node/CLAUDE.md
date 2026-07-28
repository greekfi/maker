# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Quote server / market-maker for the Greek options protocol. Prices European-
and American-style options, exposes them via HTTP + WebSocket, and runs as
a Bebop RFQ maker on Ethereum / Base / Arbitrum.

Extracted from the [`greekfi/protocol`](https://github.com/greekfi/protocol)
monorepo (PR #65) — that repo still has the frontend (`core/`) and the
Solidity contracts (`foundry/`). This repo is fully standalone: no workspace
deps, no shared types pulled from `protocol`. The only coupling left is the
contract addresses, hard-coded in `src/config/`.

## Modes

The same codebase runs in four modes, each is its own PM2 process:

| Mode | Entry | Listens on | Purpose |
|---|---|---|---|
| `direct` | `src/direct.ts` | `:3010` HTTP, `:3011` WS | Standalone quote server. `/quote`, `/options`, `/price/:addr`, `/health`. WS broadcasts option-level bid/ask. |
| `relay` | `src/relay.ts` | `:3004` WS | Subscribes to Bebop's taker pricing feed across chains, fans prices out to local clients. |
| `bebop` | `src/bebop.ts` | none (outbound WS) | Connects to Bebop as a maker, signs quotes for incoming RFQ requests. |
| `deribit` | `src/deribit.ts` | none (outbound WS) | Sources implied volatility from Deribit instruments — feeds the pricer. |

`bebop` and `deribit` share Bebop's WS connection (one per maker), so only
one runs at a time. `relay` and `direct` run alongside either.

## Repo Structure

```
.
├── src/
│   ├── direct.ts / bebop.ts / relay.ts / deribit.ts   # mode entrypoints
│   ├── pricing/
│   │   ├── pricer.ts          # Black-Scholes + smile + spread
│   │   ├── spotFeed.ts        # CoinGecko + Binance fallback, 30s polling
│   │   └── deribitFeed.ts     # IV from Deribit option instruments
│   ├── bebop/
│   │   ├── client.ts          # Bebop maker WS client
│   │   ├── pricingStream.ts   # Bebop taker pricing feed
│   │   └── relay.ts           # multi-chain relay logic
│   ├── servers/
│   │   ├── httpApi.ts         # /quote /options /health (port 3010)
│   │   ├── wsStream.ts        # option-level bid/ask broadcast (port 3011)
│   │   └── wsRelay.ts         # /prices REST (port 3004)
│   ├── config/
│   │   ├── client.ts          # viem clients per chain
│   │   ├── tokens.ts          # token registry + decimals
│   │   ├── registry.ts        # per-chain factory + supported pairs
│   │   ├── metadata.ts        # on-chain option metadata cache
│   │   └── ports.ts           # HTTP_PORT / WS_PORT / RELAY_WS_PORT (env-overridable)
│   ├── modes/
│   │   └── direct.ts          # orchestrates http + ws for direct mode
│   └── constants.ts           # addresses, defaults
├── deploy/
│   ├── Caddyfile              # internal path routing on Fly :8080
│   └── entrypoint.sh          # caddy &; exec pm2-runtime
├── scripts/
│   └── fetch-metadata.ts      # one-shot: cache option metadata from chain
├── test/                       # vitest specs
├── Dockerfile                  # multi-stage build (yarn install + tsup → caddy + pm2)
├── fly.toml                    # Fly config (app: greek-protocol, region: iad)
├── ecosystem.config.cjs        # PM2 process list
├── tsup.config.ts              # esm build, target es2022, banner injects createRequire
├── DEPLOY.md                   # full deploy guide
├── ARCHITECTURE.md             # pricing model, message flows
└── .env.example                # all runtime vars
```

## Quick Commands

### Setup (one-time)

```bash
corepack enable               # Yarn 4 via packageManager pin
yarn install
cp .env.example .env          # fill in PRIVATE_KEY, MAKER_ADDRESS, BEBOP_*
chmod 600 .env
```

### Run a mode locally

```bash
yarn direct                   # standalone HTTP + WS quote server
yarn relay                    # Bebop price relay (port 3004)
yarn bebop                    # Bebop RFQ maker
yarn deribit                  # Deribit IV feed

yarn dev:direct               # watch mode (tsx watch)
```

### Build & test

```bash
yarn build                    # tsup → dist/*.mjs
yarn lint
yarn fetch-metadata           # cache option metadata for current chain
```

### Deploy

```bash
fly deploy                    # builds remotely on Fly, atomic machine swap
fly logs --app greek-protocol
fly ssh console --app greek-protocol
```

Push to `main` triggers `.github/workflows/deploy.yml` → `flyctl deploy`.
See `DEPLOY.md` for the full operations guide.

## ABIs (inline, not imported)

This repo does **not** depend on `greekfi/protocol`'s ABI package. The bits
of ABI it needs are inlined as small `as const` arrays. **If the matching
on-chain interface changes, update these manually.** None of them are full
contract ABIs — only the function signatures the MM actually calls.

| ABI | Where | What |
|---|---|---|
| `DECIMALS_ABI` | `src/direct.ts:110` | ERC20 `decimals()` only |
| `OPTION_ABI` | `src/config/metadata.ts:127` | `Option.collateral()` (used to resolve the paired Collateral contract) |
| `REDEMPTION_ABI` | `src/config/metadata.ts:138` | Collateral reads: `strike`, `expirationDate`, `isPut`, `collateral`, `consideration` |

When syncing with a Solidity change in `greekfi/protocol`, grep for these
names and update each in place. There is intentionally no codegen step —
the surface area is small enough that drift is easy to notice in PR review.

## Key Pricing Details

**Black-Scholes** runs in `src/pricing/pricer.ts`. WAD fixed-point math, int256
internals. Inputs: spot, strike, time-to-expiry, IV, risk-free rate.

**Strike convention** (matches the on-chain protocol):
- Calls: `strike` is consideration-per-collateral in 18 decimals (e.g. `2000e18` USDC/WETH)
- Puts: stored inverted (`1e36 / 2000e18`). The pricer **must invert puts back** before plugging into BS: `1 / putStrike`.
- Put price normalization: emitted price is `BS_price / strike` so per-token quoting matches the on-chain economics.

**IV smile**: skew + curvature + term-ref-days + put-offset. All env-tunable
via `IV_SKEW`, `IV_CURVATURE`, `IV_TERM_REF_DAYS`, `IV_PUT_OFFSET`. Defaults
in `pricer.ts`.

**Inventory spread**: not implemented in this repo (lives in the on-chain
HookVault on `greekfi/protocol`).

## Spot & IV Sources

- **Spot**: CoinGecko primary, Binance fallback, 30s poll (`SPOT_POLL_INTERVAL`)
- **IV** (deribit mode): Deribit WebSocket subscription per instrument
- **Pricing input** (relay/bebop modes): Bebop's taker pricing feed (multi-chain)

A single DNS failure on startup left pricing permanently broken once — the
fix was adding `spotFeed.startPolling(["ETH"], 30000)`. WebSocket reconnect
uses exponential backoff, no max-attempts cap (was 10, removed).

## Logging

The relay emits `[relay-stats]` and `[ws-stats]` every 30 seconds to make
silent failures observable:
- `[relay-stats]` — upstream connections, cache size, message count, last-message-at
- `[ws-stats]` — connected clients, prices forwarded vs filtered

If `forwarded=0` for an extended period, no clients are connected. If
`connections=[ethereum:DOWN, ...]`, an upstream is failing.

## Environment

Runtime config is via `.env` (gitignored) or Fly secrets. Required:
`PRIVATE_KEY`, `MAKER_ADDRESS`. Recommended: `BEBOP_MARKETMAKER`,
`BEBOP_AUTHORIZATION`. See `.env.example` for the full list.

On Fly, `--env-file-if-exists=.env` is used by PM2 (vs `--env-file=.env` on
local) so missing-file isn't fatal — Fly injects env vars directly.

## Naming

- TypeScript: camelCase functions, PascalCase classes (`Pricer`, `SpotFeed`)
- Files: camelCase (`spotFeed.ts`, `httpApi.ts`)
- Modes: lowercase (`direct`, `bebop`, `relay`, `deribit`) — match PM2 names
- Mode entries live at `src/<mode>.ts`; mode bootstraps live at `src/modes/<mode>.ts`

## Security

- `.env` is gitignored, chmod 600 locally, never echoed in logs or CLI args
- Fly secrets via `fly secrets import` (stdin, never `fly secrets set KEY=...`)
- Bebop maker key is the *only* signing key here; treat it as production-critical
- viem clients use the RPC URLs in `RPC_*` env vars (drpc.org defaults work,
  but a paid Alchemy/Infura key gives better tail latency)
