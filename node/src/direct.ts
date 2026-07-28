#!/usr/bin/env node
import "dotenv/config";
import { Pricer } from "./pricing/pricer";
import { SpotFeed } from "./pricing/spotFeed";
import { startDirectMode } from "./modes/direct";
import { OPTIONS } from "./config/options";
import { startSyncLoop } from "./events/syncLoop";
import { registerFromEvents } from "./pricing/registry";

/**
 * Default to every chain declared in factories.json — the canonical list of
 * where the protocol is deployed. CHAIN_IDS env still works as an optional
 * restriction (canary deploys, staging) but is no longer required.
 */
function loadChainIds(): number[] {
  const raw = process.env.CHAIN_IDS ?? process.env.CHAIN_ID;
  if (raw) {
    return raw
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        const n = parseInt(s, 10);
        if (!Number.isFinite(n)) throw new Error(`Invalid chainId in CHAIN_IDS: ${s}`);
        return n;
      });
  }
  return Object.keys(OPTIONS).map(k => parseInt(k, 10));
}

/**
 * Underlyings whose spot we keep polled at boot. The protocol only supports
 * BTC and ETH variants today; both are quoted by the spot feed regardless of
 * which chain or token wrapper an option uses. If new underlyings ship later,
 * extend this list (or wire `registerFromEvents` to call `startPolling`
 * incrementally).
 */
const ALWAYS_POLL = ["ETH", "BTC"];

async function main() {
  console.log("Starting market-maker in DIRECT mode");

  const spotFeed = new SpotFeed();
  const smileEnv = {
    skew: process.env.IV_SKEW !== undefined ? parseFloat(process.env.IV_SKEW) : undefined,
    curvature: process.env.IV_CURVATURE !== undefined ? parseFloat(process.env.IV_CURVATURE) : undefined,
    termRef:
      process.env.IV_TERM_REF_DAYS !== undefined
        ? parseFloat(process.env.IV_TERM_REF_DAYS) / 365
        : undefined,
    putOffset:
      process.env.IV_PUT_OFFSET !== undefined ? parseFloat(process.env.IV_PUT_OFFSET) : undefined,
  };
  const smile: Record<string, number> = {};
  for (const [k, v] of Object.entries(smileEnv)) {
    if (v !== undefined) smile[k] = v;
  }

  spotFeed.start();

  // Empty Pricer per chain. Options are registered on-demand via
  // src/pricing/registry.ts as `/options`, `/quote`, and `/price/:addr`
  // requests come in — see the lazy path used in src/servers/httpApi.ts.
  // Old behaviour was a full factory-events scan + decimals batch per chain
  // at boot, which duplicated what greek-events already does and made cold
  // starts slow. Phase 1: drop the scan entirely.
  const chainIds = loadChainIds();
  console.log(`Configured chains: ${chainIds.join(", ")}`);

  const pricers = new Map<number, Pricer>();
  for (const chainId of chainIds) {
    pricers.set(
      chainId,
      new Pricer({
        spotFeed,
        defaultIV: parseFloat(process.env.DEFAULT_IV || "0.8"),
        riskFreeRate: parseFloat(process.env.RISK_FREE_RATE || "0.05"),
        smile,
      }),
    );
  }

  if (pricers.size === 0) {
    console.error("No chains configured — aborting.");
    process.exit(1);
  }

  // One spot-price callback that pushes into every pricer.
  spotFeed.onPriceUpdate((symbol, price) => {
    for (const p of pricers.values()) p.setSpotPrice(symbol, price);
  });

  // Prime + start polling the always-on underlyings. Failures here are
  // non-fatal — pricing requests will retry through SpotFeed.getPrice when
  // they hit Pricer.price.
  for (const sym of ALWAYS_POLL) {
    let price: number | null = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      price = await spotFeed.getPrice(sym);
      if (price) break;
      console.warn(`⚠️  Spot ${sym} fetch attempt ${attempt}/5 failed, retrying in ${attempt * 2}s...`);
      await new Promise(r => setTimeout(r, attempt * 2000));
      spotFeed.clearCache();
    }
    if (price) {
      for (const p of pricers.values()) p.setSpotPrice(sym, price);
      console.log(`💲 Initial ${sym} spot price: $${price.toFixed(2)}`);
    } else {
      console.warn(`⚠️  Failed to fetch ${sym} spot after retries, ${sym}-quoted options may fail until it recovers`);
    }
  }

  spotFeed.startPolling(ALWAYS_POLL, 30000);

  // Start the in-process event sync. Each tick walks the factory's getLogs
  // from lastBlock+1 → head; new events are piped into the per-chain Pricer
  // so subsequent /options requests see them without an extra HTTP call.
  // First tick fires immediately so the store is populated before the HTTP
  // server starts taking traffic for /events.
  const sync = startSyncLoop({
    chainIds: chainIds.filter(id => pricers.has(id)),
    onNewEvents: async (chainId, events) => {
      const pricer = pricers.get(chainId);
      if (pricer) await registerFromEvents(pricer, chainId, events);
    },
  });

  await startDirectMode(pricers);

  const shutdown = async () => {
    console.log("\nShutting down...");
    sync.stop();
    spotFeed.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
