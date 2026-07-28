/**
 * Deribit WebSocket Feed
 *
 * Connects to Deribit's public WebSocket API and maintains a live cache
 * of option prices (bid/ask/IV/greeks) for subscribed instruments.
 *
 * Prices are in ETH (Deribit convention), not USD.
 */

import WebSocket from "ws";

export interface DeribitPrice {
  bestBidPrice: number;
  bestBidAmount: number;
  bestAskPrice: number;
  bestAskAmount: number;
  markPrice: number;
  markIv: number;
  bidIv: number;
  askIv: number;
  indexPrice: number;
  underlyingPrice: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  timestamp: number;
}

export interface DeribitInstrument {
  instrumentName: string;
  strike: number;
  expirationTimestamp: number; // ms
  optionType: "call" | "put";
  isActive: boolean;
}

export interface DeribitFeedConfig {
  underlying?: string; // "ETH" default
  testnet?: boolean;
}

type PriceCallback = (instrument: string, price: DeribitPrice) => void;

const STALE_THRESHOLD_MS = 60_000; // 60s

export class DeribitFeed {
  private ws: WebSocket | null = null;
  private prices: Map<string, DeribitPrice> = new Map();
  private instruments: Map<string, DeribitInstrument> = new Map();
  private subscribedChannels: string[] = [];
  private callbacks: PriceCallback[] = [];
  private reconnectAttempts = 0;
  private maxReconnectDelay = 300_000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private rpcId = 0;
  private underlying: string;
  private testnet: boolean;

  constructor(config: DeribitFeedConfig = {}) {
    this.underlying = config.underlying ?? "ETH";
    this.testnet = config.testnet ?? false;
  }

  get baseUrl(): string {
    return this.testnet
      ? "https://test.deribit.com/api/v2"
      : "https://www.deribit.com/api/v2";
  }

  get wsUrl(): string {
    return this.testnet
      ? "wss://test.deribit.com/ws/api/v2"
      : "wss://www.deribit.com/ws/api/v2";
  }

  /**
   * Fetch all available option instruments from Deribit REST API
   */
  async fetchInstruments(): Promise<DeribitInstrument[]> {
    const url = `${this.baseUrl}/public/get_instruments?currency=${this.underlying}&kind=option&expired=false`;
    console.log(`Fetching Deribit instruments: ${url}`);

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = (await response.json()) as {
      result?: Array<{
        instrument_name: string;
        strike: number;
        expiration_timestamp: number;
        option_type: string;
        is_active: boolean;
      }>;
      error?: unknown;
    };

    if (!data.result) {
      throw new Error(`Deribit get_instruments failed: ${JSON.stringify(data.error)}`);
    }

    const instruments: DeribitInstrument[] = data.result.map((inst) => ({
      instrumentName: inst.instrument_name,
      strike: inst.strike,
      expirationTimestamp: inst.expiration_timestamp,
      optionType: inst.option_type as "call" | "put",
      isActive: inst.is_active,
    }));

    // Index by name
    for (const inst of instruments) {
      this.instruments.set(inst.instrumentName, inst);
    }

    console.log(`Loaded ${instruments.length} Deribit ${this.underlying} option instruments`);
    return instruments;
  }

  /**
   * Check if a Deribit instrument exists
   */
  hasInstrument(name: string): boolean {
    return this.instruments.has(name);
  }

  /**
   * Get all instrument names
   */
  getInstrumentNames(): string[] {
    return Array.from(this.instruments.keys());
  }

  /**
   * Connect to Deribit WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to Deribit WebSocket: ${this.wsUrl}`);

      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.log("Connected to Deribit WebSocket");
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        resolve();
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("close", (code, reason) => {
        console.log(`Deribit WebSocket closed: ${code} - ${reason.toString()}`);
        this.stopHeartbeat();
        this.scheduleReconnect();
      });

      this.ws.on("error", (error) => {
        console.error("Deribit WebSocket error:", error.message);
        reject(error);
      });
    });
  }

  /**
   * Subscribe to ticker channels for the given instruments
   */
  subscribe(instrumentNames: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("Cannot subscribe: WebSocket not connected");
      return;
    }

    const channels = instrumentNames.map((name) => `ticker.${name}.100ms`);
    this.subscribedChannels = channels;

    const msg = {
      jsonrpc: "2.0",
      id: ++this.rpcId,
      method: "public/subscribe",
      params: { channels },
    };

    this.ws.send(JSON.stringify(msg));
    console.log(`Subscribed to ${channels.length} Deribit ticker channels`);
  }

  /**
   * Register callback for price updates
   */
  onPriceUpdate(callback: PriceCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Get cached price for an instrument
   */
  getPrice(instrument: string): DeribitPrice | undefined {
    const price = this.prices.get(instrument);
    if (!price) return undefined;

    // Check staleness
    if (Date.now() - price.timestamp > STALE_THRESHOLD_MS) {
      return undefined;
    }

    return price;
  }

  /**
   * Get the ETH/USD spot price from any cached instrument's indexPrice
   */
  getSpotPrice(): number | undefined {
    for (const price of this.prices.values()) {
      if (price.indexPrice > 0 && Date.now() - price.timestamp < STALE_THRESHOLD_MS) {
        return price.indexPrice;
      }
    }
    return undefined;
  }

  /**
   * Wait until at least one price update arrives
   */
  waitForPrices(timeoutMs: number = 5000): Promise<void> {
    return new Promise((resolve) => {
      if (this.prices.size > 0) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        console.warn(`Deribit price wait timed out after ${timeoutMs}ms`);
        resolve();
      }, timeoutMs);

      const check = () => {
        if (this.prices.size > 0) {
          clearTimeout(timeout);
          resolve();
        }
      };

      this.onPriceUpdate(check);
    });
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);

      // Handle subscription notifications
      if (msg.method === "subscription") {
        this.handleTicker(msg.params);
        return;
      }

      // Handle heartbeat test_request
      if (msg.method === "heartbeat" && msg.params?.type === "test_request") {
        this.sendTestResponse();
        return;
      }

      // Handle RPC responses (subscribe confirmations, etc.)
      if (msg.id && msg.result) {
        // Subscription confirmation — no action needed
        return;
      }

      if (msg.error) {
        console.error("Deribit RPC error:", msg.error);
      }
    } catch (error) {
      console.error("Failed to parse Deribit message:", error);
    }
  }

  private handleTicker(params: {
    channel: string;
    data: {
      best_bid_price?: number;
      best_bid_amount?: number;
      best_ask_price?: number;
      best_ask_amount?: number;
      mark_price?: number;
      mark_iv?: number;
      bid_iv?: number;
      ask_iv?: number;
      index_price?: number;
      underlying_price?: number;
      greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
      timestamp?: number;
    };
  }): void {
    const channel = params.channel;
    const data = params.data;

    // Extract instrument name from "ticker.ETH-28MAR25-3000-C.100ms"
    const match = channel.match(/^ticker\.(.+)\.100ms$/);
    if (!match) return;

    const instrument = match[1];

    const price: DeribitPrice = {
      bestBidPrice: data.best_bid_price ?? 0,
      bestBidAmount: data.best_bid_amount ?? 0,
      bestAskPrice: data.best_ask_price ?? 0,
      bestAskAmount: data.best_ask_amount ?? 0,
      markPrice: data.mark_price ?? 0,
      markIv: data.mark_iv ?? 0,
      bidIv: data.bid_iv ?? 0,
      askIv: data.ask_iv ?? 0,
      indexPrice: data.index_price ?? 0,
      underlyingPrice: data.underlying_price ?? 0,
      delta: data.greeks?.delta ?? 0,
      gamma: data.greeks?.gamma ?? 0,
      theta: data.greeks?.theta ?? 0,
      vega: data.greeks?.vega ?? 0,
      timestamp: data.timestamp ?? Date.now(),
    };

    this.prices.set(instrument, price);

    for (const cb of this.callbacks) {
      try {
        cb(instrument, price);
      } catch (err) {
        console.error("Price callback error:", err);
      }
    }
  }

  private startHeartbeat(): void {
    // Enable Deribit heartbeats
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: ++this.rpcId,
          method: "public/set_heartbeat",
          params: { interval: 30 },
        })
      );
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendTestResponse(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: ++this.rpcId,
          method: "public/test",
          params: {},
        })
      );
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    console.log(`Reconnecting to Deribit in ${delay}ms... (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();
        // Re-subscribe after reconnect
        if (this.subscribedChannels.length > 0) {
          const instruments = this.subscribedChannels.map((ch) =>
            ch.replace("ticker.", "").replace(".100ms", "")
          );
          this.subscribe(instruments);
        }
      } catch (error) {
        console.error("Reconnect failed:", error);
      }
    }, delay);
  }
}
