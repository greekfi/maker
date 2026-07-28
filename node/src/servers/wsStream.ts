import WebSocket, { WebSocketServer } from "ws";
import type { Pricer } from "../pricing/pricer";
import type {
  PriceUpdate,
  ClientMessage,
  ServerMessage,
  SubscribeMessage,
  UnsubscribeMessage,
} from "../pricing/types";

interface ClientConnection {
  ws: WebSocket;
  subscribedOptions: Set<string>;
  subscribedUnderlyings: Set<string>;
  isAlive: boolean;
}

export interface PricingStreamConfig {
  port: number;
  /** One Pricer per supported chain, keyed by chainId. */
  pricers: Map<number, Pricer>;
  updateIntervalMs?: number; // How often to broadcast price updates
}

interface OptionRef {
  chainId: number;
  pricer: Pricer;
  optionAddress: string;
  underlying: string;
}

export class PricingStream {
  private wss: WebSocketServer;
  private pricers: Map<number, Pricer>;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private updateIntervalMs: number;

  constructor(private config: PricingStreamConfig) {
    this.pricers = config.pricers;
    this.updateIntervalMs = config.updateIntervalMs ?? 5000;
    this.wss = new WebSocketServer({ port: config.port, host: "0.0.0.0" });

    this.setupServer();
  }

  /** Flatten options across every configured chain. */
  private allOptions(): OptionRef[] {
    const out: OptionRef[] = [];
    for (const [chainId, pricer] of this.pricers) {
      for (const opt of pricer.getAllOptions()) {
        out.push({ chainId, pricer, optionAddress: opt.optionAddress, underlying: opt.underlying });
      }
    }
    return out;
  }

  /** Find which (chainId, Pricer) owns a given option address. */
  private findOption(optionAddress: string): OptionRef | null {
    const lc = optionAddress.toLowerCase();
    for (const [chainId, pricer] of this.pricers) {
      for (const opt of pricer.getAllOptions()) {
        if (opt.optionAddress.toLowerCase() === lc) {
          return { chainId, pricer, optionAddress: opt.optionAddress, underlying: opt.underlying };
        }
      }
    }
    return null;
  }

  private setupServer(): void {
    this.wss.on("connection", (ws) => {
      console.log("New pricing stream client connected");

      const client: ClientConnection = {
        ws,
        subscribedOptions: new Set(),
        subscribedUnderlyings: new Set(),
        isAlive: true,
      };

      this.clients.set(ws, client);

      ws.on("message", (data) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());
          this.handleMessage(client, message);
        } catch {
          this.sendError(ws, "Invalid message format");
        }
      });

      ws.on("close", () => {
        console.log("Pricing stream client disconnected");
        this.clients.delete(ws);
      });

      ws.on("pong", () => {
        client.isAlive = true;
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.clients.delete(ws);
      });

      // Send initial subscription confirmation
      this.send(ws, { type: "subscribed", options: [] });
    });

    this.wss.on("listening", () => {
      console.log(`Pricing stream listening on port ${this.config.port}`);
    });
  }

  private handleMessage(client: ClientConnection, message: ClientMessage): void {
    switch (message.type) {
      case "subscribe":
        this.handleSubscribe(client, message as SubscribeMessage);
        break;
      case "unsubscribe":
        this.handleUnsubscribe(client, message as UnsubscribeMessage);
        break;
      case "ping":
        this.send(client.ws, { type: "pong", timestamp: Date.now() });
        break;
      default:
        this.sendError(client.ws, `Unknown message type: ${(message as { type: string }).type}`);
    }
  }

  private handleSubscribe(client: ClientConnection, message: SubscribeMessage): void {
    if (message.options) {
      for (const opt of message.options) {
        client.subscribedOptions.add(opt.toLowerCase());
      }
    } else {
      // Subscribe to all options across all chains
      for (const ref of this.allOptions()) {
        client.subscribedOptions.add(ref.optionAddress.toLowerCase());
      }
    }

    if (message.underlyings) {
      for (const u of message.underlyings) {
        client.subscribedUnderlyings.add(u.toUpperCase());
      }
    }

    // Send confirmation
    this.send(client.ws, {
      type: "subscribed",
      options: Array.from(client.subscribedOptions),
    });

    // Send immediate price update
    this.sendPriceUpdates(client);
  }

  private handleUnsubscribe(client: ClientConnection, message: UnsubscribeMessage): void {
    if (message.options) {
      for (const opt of message.options) {
        client.subscribedOptions.delete(opt.toLowerCase());
      }
    }

    if (message.underlyings) {
      for (const u of message.underlyings) {
        client.subscribedUnderlyings.delete(u.toUpperCase());
      }
    }

    this.send(client.ws, {
      type: "subscribed",
      options: Array.from(client.subscribedOptions),
    });
  }

  private sendPriceUpdates(client: ClientConnection): void {
    for (const ref of this.allOptions()) {
      const optAddr = ref.optionAddress.toLowerCase();

      // Check if client is subscribed to this option or its underlying
      const isSubscribed =
        client.subscribedOptions.has(optAddr) ||
        client.subscribedUnderlyings.has(ref.underlying.toUpperCase());

      if (!isSubscribed) continue;

      const price = ref.pricer.price(ref.optionAddress);
      if (!price) continue;

      const update: PriceUpdate = {
        type: "price",
        optionAddress: ref.optionAddress,
        chainId: ref.chainId,
        bid: price.bid.toFixed(6),
        ask: price.ask.toFixed(6),
        mid: price.mid.toFixed(6),
        spotPrice: price.spotPrice,
        iv: price.iv,
        delta: price.delta,
        timestamp: Date.now(),
      };

      this.send(client.ws, update);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, message: string): void {
    this.send(ws, { type: "error", message });
  }

  /**
   * Start broadcasting price updates
   */
  public startBroadcasting(): void {
    // Price update interval
    this.updateInterval = setInterval(() => {
      for (const client of this.clients.values()) {
        this.sendPriceUpdates(client);
      }
    }, this.updateIntervalMs);

    // Heartbeat interval (30 seconds)
    this.heartbeatInterval = setInterval(() => {
      for (const [ws, client] of this.clients) {
        if (!client.isAlive) {
          console.log("Terminating unresponsive client");
          ws.terminate();
          this.clients.delete(ws);
          continue;
        }

        client.isAlive = false;
        ws.ping();
      }
    }, 30000);

    console.log(`Price broadcasting started (every ${this.updateIntervalMs}ms)`);
  }

  /**
   * Stop broadcasting
   */
  public stopBroadcasting(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Broadcast price update to all subscribed clients
   */
  public broadcastPrice(optionAddress: string): void {
    const ref = this.findOption(optionAddress);
    if (!ref) return;
    const price = ref.pricer.price(ref.optionAddress);
    if (!price) return;
    const option = ref.pricer.getOption(ref.optionAddress);
    if (!option) return;

    const update: PriceUpdate = {
      type: "price",
      optionAddress: ref.optionAddress,
      chainId: ref.chainId,
      bid: price.bid.toFixed(6),
      ask: price.ask.toFixed(6),
      mid: price.mid.toFixed(6),
      spotPrice: price.spotPrice,
      iv: price.iv,
      delta: price.delta,
      timestamp: Date.now(),
    };

    for (const client of this.clients.values()) {
      const isSubscribed =
        client.subscribedOptions.has(ref.optionAddress.toLowerCase()) ||
        client.subscribedUnderlyings.has(option.underlying.toUpperCase());

      if (isSubscribed) {
        this.send(client.ws, update);
      }
    }
  }

  /**
   * Get connection count
   */
  public get connectionCount(): number {
    return this.clients.size;
  }

  /**
   * Shutdown the server
   */
  public shutdown(): void {
    this.stopBroadcasting();

    for (const ws of this.clients.keys()) {
      ws.close(1000, "Server shutting down");
    }

    this.wss.close();
  }

  public listen(port: number): void {
    this.config.port = port;
    this.startBroadcasting();
  }
}

// Factory: build a PricingStream over one or more chains.
export function createWsStream(pricers: Map<number, Pricer>): PricingStream {
  const port = parseInt(process.env.WS_PORT || "3011");
  const updateIntervalMs = parseInt(process.env.WS_UPDATE_INTERVAL || "5000");

  const stream = new PricingStream({ pricers, port, updateIntervalMs });
  return stream;
}
