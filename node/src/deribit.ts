#!/usr/bin/env node
/**
 * Deribit + Bebop Market Maker
 *
 * Uses Deribit's live options market data as the pricing source,
 * then serves quotes through Bebop's RFQ infrastructure.
 */

import "dotenv/config";
import { DeribitFeed } from "./pricing/deribitFeed";
import { DeribitPricer } from "./pricing/deribitPricer";
import { startBebopMode } from "./modes/bebop";
import { getCurrentChainId } from "./config/client";

async function main() {
  console.log("Starting market-maker in DERIBIT+BEBOP mode");

  // Initialize Deribit feed
  const deribitFeed = new DeribitFeed({
    underlying: "ETH",
    testnet: process.env.DERIBIT_TESTNET === "true",
  });

  // Fetch available Deribit instruments
  await deribitFeed.fetchInstruments();

  // Load option metadata from chain/cache
  console.log("Loading option metadata...");
  const { fetchAllOptionMetadata } = await import("./config/metadata");
  const optionsMap = await fetchAllOptionMetadata(getCurrentChainId());

  // Create pricer
  const pricer = new DeribitPricer({
    deribitFeed,
    spreadMarkup: parseFloat(process.env.DERIBIT_SPREAD_MARKUP || "0"),
  });

  // Register options and establish Deribit mappings
  let matched = 0;
  let unmatched = 0;
  for (const [address, metadata] of optionsMap.entries()) {
    pricer.registerOption({
      optionAddress: address,
      underlying: "ETH",
      strike: metadata.strike,
      expiry: metadata.expirationTimestamp,
      isPut: metadata.isPut,
      decimals: 18,
      collateralAddress: metadata.collateralAddress,
    });

    if (pricer.hasDeribitMapping(address)) {
      matched++;
    } else {
      unmatched++;
      const expDate = new Date(metadata.expirationTimestamp * 1000).toISOString().split("T")[0];
      console.warn(
        `  ⚠️  No Deribit match: ${address.slice(0, 10)}... ` +
          `strike=$${metadata.strike} exp=${expDate} ${metadata.isPut ? "PUT" : "CALL"}`
      );
    }
  }

  console.log(`\nMatched ${matched}/${matched + unmatched} options to Deribit instruments`);

  if (matched === 0) {
    console.error("No options matched to Deribit instruments. Check strikes/expirations.");
    process.exit(1);
  }

  // Connect to Deribit WebSocket and subscribe to matched instruments
  await deribitFeed.connect();
  deribitFeed.subscribe(pricer.getDeribitInstruments());

  // Log price updates
  deribitFeed.onPriceUpdate((instrument, price) => {
    if (price.bestBidPrice > 0) {
      const bidUsd = (price.bestBidPrice * price.indexPrice).toFixed(2);
      const askUsd = (price.bestAskPrice * price.indexPrice).toFixed(2);
      console.log(`📊 ${instrument}: bid=$${bidUsd} ask=$${askUsd} iv=${price.markIv.toFixed(1)}%`);
    }
  });

  // Wait for initial price data
  console.log("Waiting for initial Deribit prices...");
  await deribitFeed.waitForPrices(5000);

  const spotPrice = deribitFeed.getSpotPrice();
  if (spotPrice) {
    console.log(`💲 ETH index price: $${spotPrice.toFixed(2)}`);
  }

  // Start Bebop mode with Deribit-backed pricer
  await startBebopMode(pricer);

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    deribitFeed.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
