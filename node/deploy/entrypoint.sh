#!/usr/bin/env sh
# Container entrypoint for the market-maker on Fly.io.
#
# Starts Caddy in the background (path-routes :8080 to the PM2 services)
# then exec's pm2-runtime in the foreground so the container lifecycle
# tracks PM2 — if PM2 dies, Fly restarts the machine.

set -e

# Caddy listens on :8080, routes /pricing → :3004, /rfq → :3011, * → :3010.
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &

# `pm2-runtime` is the foreground / Docker-friendly variant of pm2.
# It hands SIGTERM through to children so Fly can graceful-stop us.
exec pm2-runtime ecosystem.config.cjs
