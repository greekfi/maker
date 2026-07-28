// modes/bebop.ts
import { BebopClient } from "../bebop/client";
import { PricingStream } from "../bebop/pricingStream";
import type { RFQRequest, QuoteResponse, DeclineResponse, Chain } from "../bebop/types";
import type { PricingSource } from "../pricing/types";
import { getToken } from "../config/tokens";

interface BebopPricer extends PricingSource {
  handleRfq(rfq: RFQRequest): Promise<QuoteResponse | DeclineResponse>;
}

export async function startBebopMode(pricer: BebopPricer) {
  const chainId = parseInt(process.env.CHAIN_ID || "1");
  const chain = (process.env.CHAIN || "ethereum") as Chain;
  const makerAddress = process.env.MAKER_ADDRESS || "0x0000000000000000000000000000000000000000";

  // Get USDC address from config, fallback to Ethereum if chain not configured
  let usdcAddress: string;
  try {
    usdcAddress = getToken(chainId, "USDC").address;
  } catch {
    console.warn(`USDC not configured for chain ${chainId}, using Ethereum USDC`);
    usdcAddress = getToken(1, "USDC").address;
  }

  // Connect to Bebop RFQ
  const bebopClient = new BebopClient({
    chain,
    chainId,
    marketmaker: process.env.BEBOP_MARKETMAKER!,
    authorization: process.env.BEBOP_AUTHORIZATION!,
    makerAddress,
    privateKey: process.env.PRIVATE_KEY,
  });

  // Set up RFQ handler
  bebopClient.onRFQ(async (rfq: RFQRequest) => {
    return await pricer.handleRfq(rfq);
  });

  await bebopClient.connect();
  console.log("Connected to Bebop RFQ");

  // Start pricing stream
  const pricingStream = new PricingStream(
    {
      chain,
      chainId,
      marketmaker: process.env.BEBOP_MARKETMAKER!,
      authorization: process.env.BEBOP_AUTHORIZATION!,
      makerAddress,
      usdcAddress,
    },
    pricer
  );

  pricingStream.connect();
  console.log("Connected to Bebop Pricing Stream");

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down Bebop connections...");
    pricingStream.disconnect();
    bebopClient.disconnect();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
