# Market-maker Deployment

Deployed to **[Fly.io](https://fly.io)** as a single Docker container running
all four PM2 processes (`direct`, `relay`, `bebop`, `deribit`). Caddy inside
the container path-routes the public ports to the right service.

```
Browser
   │  https/wss://api.greek.finance
   ▼
Fly edge ──TLS terminate──▶ VM port 8080 ──Caddy──▶ /pricing  → :3004 (relay WS)
                                                     /rfq      → :3011 (direct WS)
                                                     *         → :3010 (direct HTTP)
                                                     ▲
                                                     │  PM2 manages 4 procs
                                                     │  inside the same VM:
                                                     │   • direct  — HTTP+WS quotes
                                                     │   • relay   — Bebop fan-out
                                                     │   • bebop   — Bebop maker
                                                     │   • deribit — IV source
```

App: **`greek-protocol`** at `https://greek-protocol.fly.dev`. Custom domain
`api.greek.finance` is added as a Fly cert (see `Custom domain` below).

## Files

- `Dockerfile` — multi-stage build (yarn install + tsup → caddy + pm2 runtime)
- `.dockerignore` — excludes node_modules, .env, build artifacts
- `fly.toml` — Fly app config
- `deploy/Caddyfile` — internal path routing (no TLS, Fly handles edge)
- `deploy/entrypoint.sh` — starts caddy + pm2-runtime
- `ecosystem.config.cjs` — PM2 process definitions

## Deploy

**Automatic:** push to `main` triggers `.github/workflows/deploy.yml` →
`flyctl deploy --remote-only`. Concurrency-guarded.

**Manual:**

```
fly deploy
```

`fly deploy` builds remotely on Fly's builder by default (no local Docker
required), pushes the image to Fly's registry, then rolls the machine.

## Required GitHub secret

| Secret | How to get it |
|---|---|
| `FLY_API_TOKEN` | `fly tokens create deploy --app greek-protocol` and paste the value |

## Secrets (runtime env vars)

Set sensitive vars with `fly secrets`. To avoid CLI exposure, use stdin:

```
fly secrets import --app greek-protocol < secrets.env
```

…where `secrets.env` is a chmod 600 file with `KEY=value` lines.

Non-sensitive vars live in `[env]` of `fly.toml` — committed to the repo.

To see what's set: `fly secrets list --app greek-protocol` (digest-only, never values).

To rotate: `fly secrets set KEY=newvalue` then `fly deploy`.

## Custom domain (api.greek.finance)

```
fly certs add api.greek.finance --app greek-protocol
```

Fly will print which DNS records to set. Typically:

| Type | Value |
|---|---|
| A | (Fly v4 IP) |
| AAAA | (Fly v6 IP) |

Cloudflare: **gray-cloud** (DNS only — Fly issues its own cert via Let's Encrypt).

Verify (~30s after DNS propagates):

```
fly certs check api.greek.finance --app greek-protocol
```

## Switching pricing modes (bebop ↔ deribit)

Both share Bebop's WebSocket — only one can run at a time. The default
`ecosystem.config.cjs` has `bebop` set to `autostart: false`. To switch on the
fly machine:

```
fly ssh console --app greek-protocol --command 'pm2 stop deribit && pm2 start bebop'
fly ssh console --app greek-protocol --command 'pm2 stop bebop && pm2 start deribit'
```

The change persists for the lifetime of the machine — a redeploy resets to
the `ecosystem.config.cjs` defaults.

## Operations

```
fly status --app greek-protocol               # app status
fly logs --app greek-protocol                  # tail all logs
fly ssh console --app greek-protocol           # shell into the VM
  pm2 list                                     #   → status of 4 procs
  pm2 logs --lines 50                          #   → tail
  pm2 logs direct --lines 30                   #   → one proc
fly machine restart --app greek-protocol       # bounce the VM
fly releases --app greek-protocol              # release history
```

## Frontend wiring

The frontend (`greekfi/protocol`) reads these env vars:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_DIRECT_API_URL` | `https://api.greek.finance` |
| `NEXT_PUBLIC_RFQ_API_URL` | `https://api.greek.finance` |
| `NEXT_PUBLIC_PRICING_WS_URL` | `wss://api.greek.finance/pricing` |
| `NEXT_PUBLIC_RFQ_WS_URL` | `wss://api.greek.finance/rfq` |

Set in Vercel → Settings → Environment Variables (Production + Preview).
`NEXT_PUBLIC_*` vars bake at build time — **redeploy** Vercel after changing.

## Troubleshooting

**`/health` check fails after deploy**
`pm2 list` from `fly ssh console` shows which process crashed. Most common:
missing secret. `fly secrets list` to verify.

**Bebop disconnects after 5min idle**
The Bebop client reconnects with exponential backoff. If you see this with no
recovery, check the `bebop` process logs — usually a stale auth token.
