#!/usr/bin/env node
import "dotenv/config";
import { startRelayMode } from "./modes/relay";

async function main() {
  console.log("Starting market-maker in RELAY mode");

  // Start relay mode (doesn't need pricer)
  await startRelayMode();

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
