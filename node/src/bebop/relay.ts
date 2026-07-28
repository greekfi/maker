import WebSocket from "ws";
import { EventEmitter } from "events";
import { bebop } from "./proto/takerPricing_pb";

// Chain configurations for Bebop taker pricing
export const TAKER_CHAINS: Record<string, { chainId: number; name: string }> = {
  ethereum: { chainId: 1, name: "ethereum" },
  arbitrum: { chainId: 42161, name: "arbitrum" },
  avalanche: { chainId: 43114, name: "avalanche" },
  base: { chainId: 8453, name: "base" },
  bsc: { chainId: 56, name: "bsc" },
  optimism: { chainId: 10, name: "optimism" },
  polygon: { chainId: 137, name: "polygon" },
};

// Price level: [price, quantity]
export type PriceLevel = [number, number];

// Price data for a trading pair
export interface PriceData {
  base: string; // Base token address
  quote: string; // Quote token address
  lastUpdateTs: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
}

// Price update event
export interface PriceUpdateEvent {
  chainId: number;
  chain: string;
  pair: string; // "base/quote"
  data: PriceData;
}

export interface PricingRelayConfig {
  chains: string[]; // Chain names to connect to
  name: string; // Bebop pricing name header
  authorization: string; // Bebop authorization header
}

// Convert bytes to hex address string
function bytesToAddress(bytes: Uint8Array | null | undefined): string {
  if (!bytes || bytes.length === 0) return "";
  return "0x" + Buffer.from(bytes).toString("hex");
}

// Convert flat array to price levels: [p1, q1, p2, q2, ...] -> [[p1, q1], [p2, q2], ...]
function toPriceLevels(array: number[]): PriceLevel[] {
  const levels: PriceLevel[] = [];
  for (let i = 0; i < array.length; i += 2) {
    levels.push([array[i], array[i + 1]]);
  }
  return levels;
}

// Export as BebopRelay for compatibility with modes/relay.ts
export class PricingRelay extends EventEmitter {
  private connections: Map<string, WebSocket> = new Map();
  private prices: Map<string, PriceData> = new Map(); // "chainId:base/quote" -> PriceData
  private config: PricingRelayConfig;
  private reconnectAttempts: Map<string, number> = new Map();
  private baseReconnectDelay = 1000;
  private maxReconnectDelay = 60000; // Cap backoff at 60s

  // Stats tracking
  private stats = {
    messagesReceived: 0,
    pairsUpdated: 0,
    lastMessageAt: 0,
  };
  private statsInterval: NodeJS.Timeout | null = null;

  constructor(config: PricingRelayConfig) {
    super();
    this.config = config;
  }

  // Start connecting to all configured chains
  async start(): Promise<void> {
    console.log(`🚀 Starting Pricing Relay for ${this.config.chains.length} chains: [${this.config.chains.join(", ")}]`);

    for (const chain of this.config.chains) {
      if (!TAKER_CHAINS[chain]) {
        console.warn(`⚠️  Unknown chain: ${chain}, skipping`);
        continue;
      }
      this.connectToChain(chain);
    }

    // Log stats every 30s
    this.statsInterval = setInterval(() => this.logStats(), 30000);
  }

  private logStats(): void {
    const connStatus = Object.entries(this.getStatus())
      .map(([chain, connected]) => `${chain}:${connected ? "UP" : "DOWN"}`)
      .join(", ");
    const elapsed = this.stats.lastMessageAt
      ? `${((Date.now() - this.stats.lastMessageAt) / 1000).toFixed(0)}s ago`
      : "never";
    console.log(
      `[relay-stats] connections=[${connStatus}] cache=${this.prices.size} pairs | msgs=${this.stats.messagesReceived} | pairs_updated=${this.stats.pairsUpdated} | last_msg=${elapsed}`
    );
  }

  // Connect to a single chain's pricing feed
  private connectToChain(chain: string): void {
    const chainConfig = TAKER_CHAINS[chain];
    if (!chainConfig) return;

    const wsUrl = `wss://api.bebop.xyz/pmm/${chain}/v3/pricing?format=protobuf`;
    console.log(`🔌 Connecting to ${chain} pricing feed: ${wsUrl}`);

    const ws = new WebSocket(wsUrl, [], {
      headers: {
        name: this.config.name,
        Authorization: this.config.authorization,
      },
    });

    ws.on("open", () => {
      console.log(`✅ Connected to ${chain} pricing feed`);
      this.reconnectAttempts.set(chain, 0);
      this.emit("connected", { chain, chainId: chainConfig.chainId });
    });

    ws.on("message", (data: Buffer) => {
      this.handleMessage(chain, chainConfig.chainId, data);
    });

    ws.on("close", (code, reason) => {
      console.log(`❌ ${chain} pricing feed closed: ${code} - ${reason.toString()}`);
      this.connections.delete(chain);
      this.emit("disconnected", { chain, chainId: chainConfig.chainId });
      this.scheduleReconnect(chain);
    });

    ws.on("error", (error) => {
      console.error(`❌ ${chain} pricing feed error:`, error.message);
    });

    this.connections.set(chain, ws);
  }

  // Handle incoming protobuf message
  private handleMessage(chain: string, chainId: number, data: Buffer): void {
    this.stats.messagesReceived++;
    this.stats.lastMessageAt = Date.now();

    try {
      const update = bebop.BebopPricingUpdate.decode(data);

      // Log first message from each chain to confirm data is flowing
      if (this.stats.messagesReceived <= this.config.chains.length) {
        console.log(`[relay] First message from ${chain}: ${update.pairs.length} pairs, ${data.length} bytes`);
      }

      for (const pair of update.pairs) {
        const base = bytesToAddress(pair.base);
        const quote = bytesToAddress(pair.quote);

        if (!base || !quote) continue;

        this.stats.pairsUpdated++;
        const pairKey = `${base}/${quote}`;
        const cacheKey = `${chainId}:${pairKey}`;

        const bids = toPriceLevels(pair.bids || []);
        const asks = toPriceLevels(pair.asks || []);

        const priceData: PriceData = {
          base,
          quote,
          lastUpdateTs: Number(pair.lastUpdateTs || 0),
          bids,
          asks,
        };

        // Update cache
        this.prices.set(cacheKey, priceData);

        // Emit update event
        const event: PriceUpdateEvent = {
          chainId,
          chain,
          pair: pairKey,
          data: priceData,
        };
        this.emit("price", event);
      }
    } catch (error) {
      // Try parsing as JSON (fallback for JSON format)
      try {
        const json = JSON.parse(data.toString());
        this.handleJsonMessage(chain, chainId, json);
      } catch {
        console.error(`❌ Failed to parse ${chain} message:`, (error as Error).message);
      }
    }
  }

  // Handle JSON format message (less frequent, 3s intervals)
  private handleJsonMessage(chain: string, chainId: number, json: Record<string, { last_update_ts?: number; bids?: PriceLevel[]; asks?: PriceLevel[] }>): void {
    for (const [pairKey, pairData] of Object.entries(json)) {
      const [base, quote] = pairKey.split("/");
      if (!base || !quote) continue;

      const cacheKey = `${chainId}:${pairKey}`;

      const priceData: PriceData = {
        base,
        quote,
        lastUpdateTs: pairData.last_update_ts || Date.now() / 1000,
        bids: (pairData.bids || []) as PriceLevel[],
        asks: (pairData.asks || []) as PriceLevel[],
      };

      this.prices.set(cacheKey, priceData);

      const event: PriceUpdateEvent = {
        chainId,
        chain,
        pair: pairKey,
        data: priceData,
      };
      this.emit("price", event);
    }
  }

  // Schedule reconnection with exponential backoff (no limit, caps at 60s)
  private scheduleReconnect(chain: string): void {
    const attempts = this.reconnectAttempts.get(chain) || 0;
    const delay = Math.min(this.baseReconnectDelay * Math.pow(2, attempts), this.maxReconnectDelay);

    console.log(`🔄 Reconnecting to ${chain} in ${delay}ms (attempt ${attempts + 1})`);
    this.reconnectAttempts.set(chain, attempts + 1);

    setTimeout(() => {
      this.connectToChain(chain);
    }, delay);
  }

  // Get cached price for a pair
  getPrice(chainId: number, base: string, quote: string): PriceData | undefined {
    const cacheKey = `${chainId}:${base}/${quote}`;
    return this.prices.get(cacheKey);
  }

  // Get all cached prices
  getAllPrices(): Map<string, PriceData> {
    return new Map(this.prices);
  }

  // Get all cached prices for a specific chain
  getPricesForChain(chainId: number): Map<string, PriceData> {
    const chainPrices = new Map<string, PriceData>();
    for (const [key, value] of this.prices) {
      if (key.startsWith(`${chainId}:`)) {
        chainPrices.set(key, value);
      }
    }
    return chainPrices;
  }

  // Get connection status
  getStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const chain of this.config.chains) {
      const ws = this.connections.get(chain);
      status[chain] = ws?.readyState === WebSocket.OPEN;
    }
    return status;
  }

  // Graceful shutdown
  stop(): void {
    console.log("🛑 Stopping Pricing Relay");
    if (this.statsInterval) clearInterval(this.statsInterval);
    for (const [chain, ws] of this.connections) {
      console.log(`   Closing ${chain} connection`);
      ws.close(1000, "Client disconnect");
    }
    this.connections.clear();
    this.prices.clear();
  }
}

// Export as BebopRelay for compatibility
export { PricingRelay as BebopRelay };

// Factory function for easy creation
export function createPricingRelay(config: PricingRelayConfig): PricingRelay {
  return new PricingRelay(config);
}
