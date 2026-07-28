# syntax=docker/dockerfile:1.7

# Build for the standalone market-maker repo, deployed to Fly.io.
#
#   stage 1 (builder): yarn install + tsup build
#   stage 2 (runtime): node + caddy + pm2 + dist + pruned node_modules

ARG NODE_VERSION=25-alpine

# ─── builder ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ git

# node:25-alpine ships an old yarn 1.x but no corepack. Install corepack and
# let it resolve the project-pinned yarn version (yarn@4.x via packageManager).
RUN npm install -g --force corepack@latest && corepack enable

# Lock + manifest first for layer cache.
COPY package.json yarn.lock .yarnrc.yml ./

RUN yarn install

# Sources.
COPY . .

RUN yarn build --no-dts

# ─── runtime ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime

# Caddy for internal path routing; tini for proper PID 1 signal handling.
RUN apk add --no-cache caddy tini ca-certificates curl && \
    npm install -g pm2@latest

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/ecosystem.config.cjs ./ecosystem.config.cjs
COPY --from=builder /app/node_modules ./node_modules

# Caddy + entrypoint.
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# PM2 logs dir.
RUN mkdir -p /app/logs

# Caddy serves the public port; PM2 services listen on internal-only ports.
EXPOSE 8080

ENV NODE_ENV=production \
    PM2_HOME=/root/.pm2

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/entrypoint.sh"]
