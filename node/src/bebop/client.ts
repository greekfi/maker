import WebSocket from "ws";
import type {
  BebopConfig,
  IncomingMessage,
  OutgoingMessage,
  RFQRequest,
  OrderNotification,
  RFQHandler,
  OrderHandler,
  QuoteResponse,
  DeclineResponse,
} from "./types";
import { signQuote, type QuoteData } from "./signing";

/** Shape of a quote item in Bebop's incoming RFQ messages */
interface BebopRfqQuoteItem {
  maker_token: string;
  taker_token: string;
  maker_amount?: string;
  taker_amount?: string;
}

/** Shape of the msg object we send back in a taker_quote response */
interface BebopQuoteMsg {
  quote_id: string;
  event_id?: string;
  order_signing_type?: string;
  order_type?: string;
  onchain_partner_id?: number;
  expiry: number;
  taker_address?: string;
  maker_address: string;
  maker_nonce?: string;
  quotes: Array<{
    taker_token: string;
    maker_token: string;
    taker_amount: string;
    maker_amount: string;
    reference_price: number;
  }>;
  receiver?: string;
  commands?: string;
  packed_commands?: string;
  fee_native?: number;
  is_aggregate_order?: boolean;
  expiry_type: string;
  origin_address?: string;
  signature?: string;
}

const BEBOP_WS_BASE = "wss://api.bebop.xyz/pmm";
const CHAIN_ID = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 1; // Default to Ethereum mainnet

export class BebopClient {
  private ws: WebSocket | null = null;
  private config: BebopConfig;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 300000; // Cap at 5 minutes
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnected = false;

  private rfqHandler: RFQHandler | null = null;
  private orderHandler: OrderHandler | null = null;

  constructor(config: BebopConfig) {
    this.config = config;
  }

  get wsUrl(): string {
    return `${BEBOP_WS_BASE}/${this.config.chain}/v3/maker/quote`;
  }

  onRFQ(handler: RFQHandler): void {
    this.rfqHandler = handler;
  }

  onOrder(handler: OrderHandler): void {
    this.orderHandler = handler;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to ${this.wsUrl}...`);

      this.ws = new WebSocket(this.wsUrl, [], {
        headers: {
          marketmaker: this.config.marketmaker,
          authorization: this.config.authorization,
        },
      });

      this.ws.on("open", () => {
        console.log("Connected to Bebop");
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        resolve();
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("close", (code, reason) => {
        console.log(`Disconnected: ${code} - ${reason.toString()}`);
        this.isConnected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      });

      this.ws.on("error", (error) => {
        console.error("WebSocket error:", error.message);
        if (!this.isConnected) {
          reject(error);
        }
      });
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.ws?.ping();
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts + 1})`);

    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(console.error);
    }, delay);
  }

  private handleMessage(data: string): void {
    try {
      console.log("📨 Received message:", data);
      const message = JSON.parse(data);

      // Handle actual Bebop message format
      if (message.msg_topic === "taker_quote" && message.msg_type === "request") {
        // Extract RFQ from the nested msg object
        const rfqData = message.msg;
        const rfq: RFQRequest = {
          type: "rfq",
          rfq_id: rfqData.quote_id,
          chain_id: message.chain_id,
          taker_address: rfqData.taker_address,
          buy_tokens: rfqData.quotes.map((q: BebopRfqQuoteItem) => ({
            token: q.maker_token,
            amount: q.maker_amount || "0",
          })),
          sell_tokens: rfqData.quotes.map((q: BebopRfqQuoteItem) => ({
            token: q.taker_token,
            amount: q.taker_amount || "0",
          })),
          receiver_address: rfqData.receiver,
          expiry: rfqData.expiry,
          // Store original request data for response
          _originalRequest: {
            event_id: rfqData.event_id,
            order_signing_type: rfqData.order_signing_type,
            order_type: rfqData.order_type,
            onchain_partner_id: rfqData.onchain_partner_id,
            maker_nonce: rfqData.maker_nonce,
            commands: rfqData.commands,
            packed_commands: rfqData.packed_commands,
            fee_native: rfqData.fee_native,
            is_aggregate_order: rfqData.is_aggregate_order,
            origin_address: rfqData.origin_address,
            expiry_type: rfqData.expiry_type,
          },
        };
        this.handleRFQ(rfq);
        return;
      }

      // Handle other message formats (legacy support)
      const legacyMessage = message as IncomingMessage;
      switch (legacyMessage.type) {
        case "rfq":
          this.handleRFQ(legacyMessage as RFQRequest);
          break;
        case "order":
          this.handleOrder(legacyMessage as OrderNotification);
          break;
        case "heartbeat":
          console.log("💓 Heartbeat received");
          break;
        default:
          console.log("❓ Unknown message type:", data);
      }
    } catch (error) {
      console.error("Failed to parse message:", data, error);
    }
  }

  private async handleRFQ(rfq: RFQRequest): Promise<void> {
    console.log(`RFQ received: ${rfq.rfq_id}`);

    if (!this.rfqHandler) {
      console.warn("No RFQ handler registered, declining");
      this.decline(rfq.rfq_id, "No handler");
      return;
    }

    try {
      const response = await this.rfqHandler(rfq);
      if (response) {
        this.send(response);
      }
    } catch (error) {
      console.error("RFQ handler error:", error);
      this.decline(rfq.rfq_id, "Handler error");
    }
  }

  private handleOrder(order: OrderNotification): void {
    console.log(`Order update: ${order.rfq_id} - ${order.status}`);
    this.orderHandler?.(order);
  }

  quote(rfqId: string, buyTokens: { token: string; amount: string }[], sellTokens: { token: string; amount: string }[], expiry: number): void {
    const response: QuoteResponse = {
      type: "quote",
      rfq_id: rfqId,
      maker_address: this.config.makerAddress,
      buy_tokens: buyTokens,
      sell_tokens: sellTokens,
      expiry,
    };
    this.send(response);
  }

  decline(rfqId: string, reason?: string): void {
    const response: DeclineResponse = {
      type: "decline",
      rfq_id: rfqId,
      reason,
    };
    this.send(response);
  }

  private async send(message: OutgoingMessage): Promise<void> {
    if (!this.ws || !this.isConnected) {
      console.error("Not connected, cannot send message");
      return;
    }

    // Convert to Bebop's expected format
    let bebopMessage: object;

    if (message.type === "quote") {
      // Validate amounts are not zero
      const hasValidAmounts = message.buy_tokens.every(t => t.amount !== "0") &&
                              message.sell_tokens.every(t => t.amount !== "0");

      if (!hasValidAmounts) {
        console.error("❌ Cannot send quote with zero amounts");
        return;
      }

      // Format as taker_quote response with all required fields from template
      const originalReq = message._originalRequest || {};

      // Build the msg object, only including fields that are defined
      const msg: BebopQuoteMsg = {
        quote_id: message.rfq_id,
        event_id: originalReq.event_id,
        order_signing_type: originalReq.order_signing_type,
        order_type: originalReq.order_type,
        onchain_partner_id: originalReq.onchain_partner_id,
        expiry: message.expiry,
        taker_address: originalReq.taker_address,
        maker_address: message.maker_address,
        maker_nonce: originalReq.maker_nonce,
        quotes: message.buy_tokens.map((buyToken, idx) => {
          // Calculate reference price: taker_amount / maker_amount
          const takerAmount = parseFloat(message.sell_tokens[idx].amount);
          const makerAmount = parseFloat(buyToken.amount);
          const referencePrice = makerAmount > 0 ? takerAmount / makerAmount : 0;

          return {
            taker_token: message.sell_tokens[idx].token,
            maker_token: buyToken.token,
            taker_amount: message.sell_tokens[idx].amount,
            maker_amount: buyToken.amount,
            reference_price: referencePrice,
          };
        }),
        receiver: originalReq.receiver,
        commands: originalReq.commands,
        packed_commands: originalReq.packed_commands,
        fee_native: originalReq.fee_native,
        is_aggregate_order: originalReq.is_aggregate_order,
        expiry_type: originalReq.expiry_type || "standard",
      };

      // Only include origin_address if it was in the original request
      if (originalReq.origin_address) {
        msg.origin_address = originalReq.origin_address;
      }

      // Sign the quote if private key is available
      if (this.config.privateKey) {
        try {
          const quoteData: QuoteData = {
            chain_id: this.config.chainId || CHAIN_ID,
            order_signing_type: msg.order_signing_type ?? "SingleOrder",
            order_type: msg.order_type ?? "Single",
            onchain_partner_id: msg.onchain_partner_id ?? 0,
            expiry: msg.expiry,
            taker_address: msg.taker_address ?? "",
            maker_address: msg.maker_address,
            maker_nonce: msg.maker_nonce ?? "0",
            receiver: msg.receiver ?? "",
            packed_commands: msg.packed_commands ?? "0",
            quotes: msg.quotes,
          };

          const { signature } = await signQuote(quoteData, this.config.privateKey);
          msg.signature = signature;
          console.log("✅ Quote signed successfully");
        } catch (error) {
          console.error("❌ Failed to sign quote:", error);
          // Continue without signature - some endpoints might not require it
        }
      } else {
        console.warn("⚠️  No private key configured - sending unsigned quote");
      }

      bebopMessage = {
        chain_id: this.config.chainId || CHAIN_ID,
        msg_topic: "taker_quote",
        msg_type: "response",
        msg,
      };
    } else if (message.type === "decline") {
      // Format as decline response
      bebopMessage = {
        msg_topic: "taker_quote",
        msg_type: "decline",
        msg: {
          quote_id: message.rfq_id,
          reason: message.reason || "Declined",
        },
      };
    } else {
      // Fallback to original format
      bebopMessage = message;
    }

    let msgStr: string;
    try {
      msgStr = JSON.stringify(bebopMessage);
      // Validate it's actually valid JSON by parsing it back
      JSON.parse(msgStr);

      // Log pretty-printed version for debugging
      console.log("📤 Sending message (pretty):");
      console.log(JSON.stringify(bebopMessage, null, 2));

      this.ws.send(msgStr);

      // Note: Signature might be required. If Bebop keeps rejecting, implement EIP712 signing:
      // 1. Load private key for MAKER_ADDRESS
      // 2. Create EIP712 typed data for the quote
      // 3. Sign with ethers/viem
      // 4. Add signature field: { signature: "0x...", sign_scheme: "EIP712" }
    } catch (error) {
      console.error("❌ Failed to create valid JSON message:", error);
      console.error("   Message object:", bebopMessage);
      throw error;
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.isConnected = false;
  }
}
