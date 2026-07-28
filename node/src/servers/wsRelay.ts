import express from "express";
import cors from "cors";
import { PricingRelay } from "../bebop/relay";
import { isOptionToken } from "../config/options";

// Price data keyed by option token address
export interface PriceEntry {
  chainId: number;
  base: string;
  quote: string;
  bids: [number, number][];
  asks: [number, number][];
  lastUpdateTs: number;
}

export type PricesResponse = Record<string, PriceEntry>;

/**
 * Start a simple HTTP server that serves cached option prices.
 * GET /prices → all option prices keyed by token address
 */
export function startPricingServer(relay: PricingRelay, port: number = 3004) {
  const app = express();
  app.use(cors());

  app.get("/prices", (_req, res) => {
    const allPrices = relay.getAllPrices();
    const result: PricesResponse = {};

    for (const [cacheKey, priceData] of allPrices) {
      const [chainIdStr, pair] = cacheKey.split(":");
      const chainId = parseInt(chainIdStr);
      const [base, quote] = pair.toLowerCase().split("/");

      // Only include option tokens
      const isBase = isOptionToken(chainId, base);
      const isQuote = isOptionToken(chainId, quote);
      if (!isBase && !isQuote) continue;

      // Key by the option token address
      const optionAddr = isBase ? base : quote;

      result[optionAddr] = {
        chainId,
        base: priceData.base,
        quote: priceData.quote,
        bids: priceData.bids,
        asks: priceData.asks,
        lastUpdateTs: priceData.lastUpdateTs,
      };
    }

    res.json(result);
  });

  app.listen(port, "0.0.0.0", () => {
    console.log(`📡 Pricing HTTP server listening on port ${port}`);
  });
}
