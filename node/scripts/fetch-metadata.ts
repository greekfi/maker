#!/usr/bin/env node
import "dotenv/config";
import { writeFileSync } from "fs";
import { join } from "path";
import { fetchAllOptionMetadata } from "../src/config/metadata";
import { getCurrentChainId } from "../src/config/client";

/**
 * Standalone script to fetch option metadata from chain and save to JSON file
 *
 * Usage:
 *   yarn fetch-metadata              # Uses CHAIN_ID from .env
 *   CHAIN_ID=8453 yarn fetch-metadata  # Override chain
 *
 * Output: market-maker/data/metadata-{chainId}.json
 */

async function main() {
  const chainId = getCurrentChainId();

  console.log(`\n🔍 Fetching option metadata for chain ${chainId}...\n`);

  try {
    // Force refresh to bypass cache and merge old + new
    const metadataMap = await fetchAllOptionMetadata(true);

    if (metadataMap.size === 0) {
      console.warn("⚠️  No options found on this chain");
      return;
    }

    // Convert Map to array for JSON serialization
    const metadataArray = Array.from(metadataMap.entries()).map(([address, metadata]) => ({
      ...metadata,
      address, // Ensure address is included
    }));

    // Create data directory if it doesn't exist
    const dataDir = join(__dirname, "..", "data");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Write to file
    const outputPath = join(dataDir, `metadata-${chainId}.json`);
    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          chainId,
          timestamp: Date.now(),
          count: metadataArray.length,
          options: metadataArray,
        },
        null,
        2
      )
    );

    console.log(`\n✅ Successfully saved metadata for ${metadataArray.length} options`);
    console.log(`📁 Output: ${outputPath}`);
    console.log(`\nSummary:`);

    // Print summary
    const calls = metadataArray.filter((m) => !m.isPut);
    const puts = metadataArray.filter((m) => m.isPut);
    console.log(`  • ${calls.length} call options`);
    console.log(`  • ${puts.length} put options`);

    // Group by expiration
    const expirations = new Map<number, number>();
    metadataArray.forEach((m) => {
      const count = expirations.get(m.expirationTimestamp) || 0;
      expirations.set(m.expirationTimestamp, count + 1);
    });

    console.log(`  • ${expirations.size} unique expiration dates`);

    // Show expiration dates
    console.log(`\nExpirations:`);
    Array.from(expirations.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([timestamp, count]) => {
        const date = new Date(timestamp * 1000).toLocaleDateString();
        console.log(`  • ${date}: ${count} options`);
      });

  } catch (error) {
    console.error("\n❌ Error fetching metadata:", error);
    process.exit(1);
  }
}

main();
