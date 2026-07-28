// === Pricer Types ===

export interface OptionParams {
  strike: number;
  expiry: number;
  isPut: boolean;
  underlying: string;
  collateralAddress?: string;
  considerationAddress?: string;
  optionAddress: string;
  chainId?: number;
  decimals: number;
}

export interface PriceResult {
  bid: number;
  ask: number;
  mid: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  spotPrice: number;
  timeToExpiry: number;
}

export interface MarketData {
  spotPrice: number;
  riskFreeRate: number;
  impliedVolatility: number;
}

export interface SpreadConfig {
  bidSpread: number;
  askSpread: number;
  minSpread: number;
}

/** Minimal interface for components that consume option prices (e.g., PricingStream) */
export interface PricingSource {
  getOptionAddresses(): string[];
  getPrice(optionAddress: string): { bids: [number, number][]; asks: [number, number][] } | null;
}

// === Quote Types ===

export interface QuoteRequest {
  buyToken: string;
  sellToken: string;
  sellAmount?: string;
  buyAmount?: string;
  takerAddress?: string;
  chainId?: number;
}

export interface QuoteResponse {
  quoteId: string;
  buyToken: string;
  sellToken: string;
  buyAmount: string;
  sellAmount: string;
  price: string;
  expiry: number;
  makerAddress: string;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  spotPrice?: number;
  iv?: number;
  routes?: string[];
  estimatedGas?: string;
  /** EIP-712 maker signature over the SingleOrder struct (BebopSettlement v2). Present when server has a signing key. */
  signature?: string;
  signScheme?: "EIP712";
  /** The exact SingleOrder struct the signature covers — pass verbatim to BebopSettlement.swapSingle. */
  order?: {
    partner_id: string;
    expiry: string;
    taker_address: string;
    maker_address: string;
    maker_nonce: string;
    taker_token: string;
    maker_token: string;
    taker_amount: string;
    maker_amount: string;
    receiver: string;
    packed_commands: string;
  };
}

export interface ErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

// === WebSocket Types ===

export interface PriceUpdate {
  type: "price";
  optionAddress: string;
  chainId: number;
  bid: string;
  ask: string;
  mid: string;
  spotPrice: number;
  iv: number;
  delta: number;
  timestamp: number;
}

export interface SubscribeMessage {
  type: "subscribe";
  options?: string[];
  underlyings?: string[];
}

export interface UnsubscribeMessage {
  type: "unsubscribe";
  options?: string[];
  underlyings?: string[];
}

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | { type: "ping" };

export type ServerMessage =
  | PriceUpdate
  | { type: "pong"; timestamp: number }
  | { type: "subscribed"; options: string[] }
  | { type: "error"; message: string };
