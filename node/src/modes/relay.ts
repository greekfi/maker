// modes/relay.ts
import { BebopRelay } from "../bebop/relay";
import { startPricingServer } from "../servers/wsRelay";

export async function startRelayMode() {
  const chains = (process.env.BEBOP_CHAINS || "ethereum").split(",");
  const name = process.env.BEBOP_MARKETMAKER || "market-maker";
  const authorization = process.env.BEBOP_AUTHORIZATION || "";
  const port = parseInt(process.env.RELAY_PORT || process.env.PORT || "3004");

  // Connect to Bebop pricing feeds
  const relay = new BebopRelay({ chains, name, authorization });
  await relay.start();

  // Start HTTP server for price queries
  startPricingServer(relay, port);
}
