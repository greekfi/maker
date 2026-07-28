/**
 * Spot Price Feed
 *
 * Fetches real-time spot prices for underlying assets.
 * Supports multiple data sources with fallback.
 */

export interface SpotPriceProvider {
  name: string;
  getPrice(symbol: string): Promise<number | null>;
}

/**
 * CoinGecko price provider (free, no API key required for basic use)
 */
export class CoinGeckoProvider implements SpotPriceProvider {
  name = "coingecko";

  private symbolToId: Record<string, string> = {
    ETH: "ethereum",
    WETH: "ethereum",
    BTC: "bitcoin",
    WBTC: "wrapped-bitcoin",
    cbBTC: "bitcoin",
    SOL: "solana",
    AVAX: "avalanche-2",
    MATIC: "matic-network",
    ARB: "arbitrum",
    OP: "optimism",
    LINK: "chainlink",
    UNI: "uniswap",
  };

  async getPrice(symbol: string): Promise<number | null> {
    const id = this.symbolToId[symbol.toUpperCase()];
    if (!id) return null;

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
      );
      const data = (await response.json()) as Record<string, { usd?: number }>;
      return data[id]?.usd ?? null;
    } catch (error) {
      console.error(`CoinGecko price fetch failed for ${symbol}:`, error);
      return null;
    }
  }
}

/**
 * Binance price provider
 */
export class BinanceProvider implements SpotPriceProvider {
  name = "binance";

  private symbolToTicker: Record<string, string> = {
    ETH: "ETHUSDT",
    WETH: "ETHUSDT",
    BTC: "BTCUSDT",
    WBTC: "BTCUSDT",
    cbBTC: "BTCUSDT",
    SOL: "SOLUSDT",
    AVAX: "AVAXUSDT",
    MATIC: "MATICUSDT",
    ARB: "ARBUSDT",
    OP: "OPUSDT",
    LINK: "LINKUSDT",
    UNI: "UNIUSDT",
  };

  async getPrice(symbol: string): Promise<number | null> {
    const ticker = this.symbolToTicker[symbol.toUpperCase()];
    if (!ticker) return null;

    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${ticker}`
      );
      const data = (await response.json()) as { price?: string };
      return data.price ? parseFloat(data.price) : null;
    } catch (error) {
      console.error(`Binance price fetch failed for ${symbol}:`, error);
      return null;
    }
  }
}

/**
 * Static/manual price provider for testing
 */
export class StaticProvider implements SpotPriceProvider {
  name = "static";
  private prices: Map<string, number> = new Map();

  setPrice(symbol: string, price: number): void {
    this.prices.set(symbol.toUpperCase(), price);
  }

  async getPrice(symbol: string): Promise<number | null> {
    return this.prices.get(symbol.toUpperCase()) ?? null;
  }
}

/**
 * Aggregated spot price feed with fallback
 */
export class SpotFeed {
  private providers: SpotPriceProvider[] = [];
  private cache: Map<string, { price: number; timestamp: number }> = new Map();
  private cacheTTL: number; // Cache TTL in milliseconds
  private updateCallbacks: Set<(symbol: string, price: number) => void> = new Set();

  constructor(cacheTTL: number = 5000) {
    this.cacheTTL = cacheTTL;
  }

  /**
   * Add a price provider
   */
  addProvider(provider: SpotPriceProvider): void {
    this.providers.push(provider);
  }

  /**
   * Register callback for price updates
   */
  onPriceUpdate(callback: (symbol: string, price: number) => void): void {
    this.updateCallbacks.add(callback);
  }

  /**
   * Get spot price for a symbol
   */
  async getPrice(symbol: string): Promise<number | null> {
    const upperSymbol = symbol.toUpperCase();

    // Check cache
    const cached = this.cache.get(upperSymbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.price;
    }

    // Try providers in order
    for (const provider of this.providers) {
      const price = await provider.getPrice(upperSymbol);
      if (price !== null) {
        this.cache.set(upperSymbol, { price, timestamp: Date.now() });

        // Notify callbacks
        for (const callback of this.updateCallbacks) {
          callback(upperSymbol, price);
        }

        return price;
      }
    }

    return null;
  }

  /**
   * Get multiple prices at once
   */
  async getPrices(symbols: string[]): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    await Promise.all(
      symbols.map(async (symbol) => {
        const price = await this.getPrice(symbol);
        if (price !== null) {
          results.set(symbol.toUpperCase(), price);
        }
      })
    );

    return results;
  }

  /**
   * Start periodic price updates
   */
  startPolling(symbols: string[], intervalMs: number = 10000): NodeJS.Timeout {
    const poll = async () => {
      await this.getPrices(symbols);
    };

    poll(); // Initial fetch
    return setInterval(poll, intervalMs);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Start the feed (for compatibility with index.ts)
   */
  start(): void {
    // Add default providers if none exist
    if (this.providers.length === 0) {
      this.addProvider(new CoinGeckoProvider());
      this.addProvider(new BinanceProvider());
    }
  }

  /**
   * Stop the feed (for compatibility with index.ts)
   */
  stop(): void {
    // Clean up if needed
    this.cache.clear();
    this.updateCallbacks.clear();
  }
}

/**
 * Create a default spot feed with common providers
 */
export function createDefaultSpotFeed(): SpotFeed {
  const feed = new SpotFeed();
  feed.addProvider(new BinanceProvider());
  feed.addProvider(new CoinGeckoProvider());
  return feed;
}
