/**
 * Deribit-sourced Option Pricer
 *
 * Maps on-chain option contracts to Deribit instruments and uses
 * Deribit's live bid/ask as the pricing source instead of Black-Scholes.
 *
 * Duck-types the same interface as Pricer so it drops into
 * startBebopMode() and PricingStream without changes.
 */

import type { DeribitFeed } from "./deribitFeed";
import type { OptionParams, PriceResult } from "./types";
import type { RFQRequest, QuoteResponse, DeclineResponse } from "../bebop/types";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface DeribitPricerConfig {
  deribitFeed: DeribitFeed;
  spreadMarkup?: number; // Additional spread on top of Deribit's (0 = use raw)
}

export class DeribitPricer {
  private options: Map<string, OptionParams> = new Map();
  private optionToDeribit: Map<string, string> = new Map(); // on-chain address → Deribit instrument
  private deribitFeed: DeribitFeed;
  private spreadMarkup: number;

  constructor(config: DeribitPricerConfig) {
    this.deribitFeed = config.deribitFeed;
    this.spreadMarkup = config.spreadMarkup ?? 0;
  }

  /**
   * Register an option and map it to a Deribit instrument
   */
  registerOption(option: OptionParams): void {
    const addr = option.optionAddress.toLowerCase();
    this.options.set(addr, option);

    const deribitName = this.mapToDeribitInstrument(option);
    if (deribitName) {
      this.optionToDeribit.set(addr, deribitName);
    }
  }

  /**
   * Check if an on-chain option has a Deribit mapping
   */
  hasDeribitMapping(address: string): boolean {
    return this.optionToDeribit.has(address.toLowerCase());
  }

  /**
   * Get all Deribit instrument names that we have mappings for
   */
  getDeribitInstruments(): string[] {
    return Array.from(new Set(this.optionToDeribit.values()));
  }

  getOption(address: string): OptionParams | undefined {
    return this.options.get(address.toLowerCase());
  }

  getAllOptions(): OptionParams[] {
    return Array.from(this.options.values());
  }

  getOptionAddresses(): string[] {
    return Array.from(this.options.keys());
  }

  isOption(address: string): boolean {
    return this.options.has(address.toLowerCase());
  }

  /**
   * Price an option using Deribit market data
   */
  price(optionAddress: string): PriceResult | null {
    const addr = optionAddress.toLowerCase();
    const option = this.options.get(addr);
    if (!option) return null;

    const deribitName = this.optionToDeribit.get(addr);
    if (!deribitName) return null;

    const dp = this.deribitFeed.getPrice(deribitName);
    if (!dp) return null;

    // Deribit prices are in ETH — convert to USD
    const indexPrice = dp.indexPrice;
    if (indexPrice <= 0) return null;

    let bidUsd = dp.bestBidPrice * indexPrice;
    let askUsd = dp.bestAskPrice * indexPrice;
    let midUsd = dp.markPrice * indexPrice;

    // Apply optional spread markup
    if (this.spreadMarkup > 0) {
      const mid = (bidUsd + askUsd) / 2;
      bidUsd = mid * (1 - this.spreadMarkup);
      askUsd = mid * (1 + this.spreadMarkup);
    }

    // Ensure bid is non-negative
    bidUsd = Math.max(0, bidUsd);

    return {
      bid: bidUsd,
      ask: askUsd,
      mid: midUsd,
      delta: dp.delta,
      gamma: dp.gamma,
      theta: dp.theta,
      vega: dp.vega,
      iv: dp.markIv / 100, // Deribit gives IV as percentage, convert to decimal
      spotPrice: indexPrice,
      timeToExpiry: Math.max(0, (option.expiry - Date.now() / 1000) / (365 * 24 * 3600)),
    };
  }

  /**
   * Get pricing for PricingStream (bids/asks in [price, size] format)
   */
  getPrice(optionAddress: string): { bids: [number, number][]; asks: [number, number][] } | null {
    const priceResult = this.price(optionAddress);
    if (!priceResult) return null;

    return {
      bids: [[priceResult.bid, 1000]],
      asks: [[priceResult.ask, 1000]],
    };
  }

  /**
   * Get ask quote (taker buying options, maker selling at ask)
   */
  getAskQuote(optionAddress: string, amount: bigint, decimals: number): bigint | null {
    const priceResult = this.price(optionAddress);
    if (!priceResult) return null;

    const option = this.getOption(optionAddress);
    if (!option) return null;

    const askPriceScaled = BigInt(Math.floor(priceResult.ask * 10 ** decimals));
    return (amount * askPriceScaled) / BigInt(10 ** option.decimals);
  }

  /**
   * Get bid quote (taker selling options, maker buying at bid)
   */
  getBidQuote(optionAddress: string, amount: bigint, decimals: number): bigint | null {
    const priceResult = this.price(optionAddress);
    if (!priceResult) return null;

    const option = this.getOption(optionAddress);
    if (!option) return null;

    const bidPriceScaled = BigInt(Math.floor(priceResult.bid * 10 ** decimals));
    return (amount * bidPriceScaled) / BigInt(10 ** option.decimals);
  }

  /**
   * Handle RFQ request from Bebop
   */
  async handleRfq(rfq: RFQRequest): Promise<QuoteResponse | DeclineResponse> {
    const { buy_tokens, sell_tokens, rfq_id, taker_address, _originalRequest } = rfq;

    console.log(`\n📝 RFQ ${rfq_id.substring(0, 8)}:`);
    console.log(`  Buy: ${buy_tokens?.[0]?.amount} of ${buy_tokens?.[0]?.token?.substring(0, 8)}`);
    console.log(`  Sell: ${sell_tokens?.[0]?.amount} of ${sell_tokens?.[0]?.token?.substring(0, 8)}`);

    const buyToken = buy_tokens?.[0];
    const sellToken = sell_tokens?.[0];

    if (!buyToken || !sellToken) {
      console.log(`❌ Decline: Invalid tokens`);
      return { type: "decline", rfq_id, reason: "Invalid tokens" };
    }

    const isBuyingOption = this.isOption(buyToken.token);
    const isSellingOption = this.isOption(sellToken.token);

    if (!isBuyingOption && !isSellingOption) {
      console.log(`❌ Decline: No option token found`);
      return { type: "decline", rfq_id, reason: "No option token in request" };
    }

    if (isBuyingOption && isSellingOption) {
      console.log(`❌ Decline: Both tokens are options`);
      return { type: "decline", rfq_id, reason: "Cannot trade option for option" };
    }

    try {
      const makerAddress = process.env.MAKER_ADDRESS;
      if (!makerAddress) throw new Error("MAKER_ADDRESS not set");

      let quoteResponse: QuoteResponse;
      if (isBuyingOption) {
        // Taker buying options — maker sells at ask
        const optionAddress = buyToken.token;
        const optionAmount = BigInt(buyToken.amount);
        const option = this.getOption(optionAddress);
        if (!option) throw new Error("Option not found in registry");

        const considerationAmount = this.getAskQuote(optionAddress, optionAmount, 6);
        if (!considerationAmount) throw new Error("Failed to calculate quote (no Deribit price?)");

        // Check we have a Deribit mapping
        const deribitName = this.optionToDeribit.get(optionAddress.toLowerCase());
        console.log(`💰 Quote (Deribit ${deribitName}): Sell ${optionAmount} options for ${considerationAmount} USDC`);

        quoteResponse = {
          type: "quote",
          rfq_id,
          maker_address: makerAddress,
          buy_tokens: [{ token: sellToken.token, amount: considerationAmount.toString() }],
          sell_tokens: [{ token: buyToken.token, amount: optionAmount.toString() }],
          expiry: Math.floor(Date.now() / 1000) + 60,
          _originalRequest,
        };
      } else {
        // Taker selling options — maker buys at bid
        const optionAddress = sellToken.token;
        const optionAmount = BigInt(sellToken.amount);
        const option = this.getOption(optionAddress);
        if (!option) throw new Error("Option not found in registry");

        const considerationAmount = this.getBidQuote(optionAddress, optionAmount, 6);
        if (!considerationAmount) throw new Error("Failed to calculate quote (no Deribit price?)");

        const deribitName = this.optionToDeribit.get(optionAddress.toLowerCase());
        console.log(`💰 Quote (Deribit ${deribitName}): Buy ${optionAmount} options for ${considerationAmount} USDC`);

        quoteResponse = {
          type: "quote",
          rfq_id,
          maker_address: makerAddress,
          buy_tokens: [{ token: sellToken.token, amount: optionAmount.toString() }],
          sell_tokens: [{ token: buyToken.token, amount: considerationAmount.toString() }],
          expiry: Math.floor(Date.now() / 1000) + 60,
          _originalRequest,
        };
      }

      // Sign the quote
      const privateKey = process.env.PRIVATE_KEY;
      if (privateKey && _originalRequest) {
        const { signQuote } = await import("../bebop/signing");
        const quoteData = {
          chain_id: rfq.chain_id,
          order_signing_type: _originalRequest.order_signing_type || "SingleOrder",
          order_type: _originalRequest.order_type || "Single",
          onchain_partner_id: _originalRequest.onchain_partner_id || 0,
          expiry: quoteResponse.expiry,
          taker_address: taker_address,
          maker_address: makerAddress,
          maker_nonce: _originalRequest.maker_nonce || "0",
          receiver: _originalRequest.receiver || taker_address,
          packed_commands: _originalRequest.packed_commands || "0",
          quotes: [
            {
              taker_token: quoteResponse.buy_tokens[0].token,
              maker_token: quoteResponse.sell_tokens[0].token,
              taker_amount: quoteResponse.buy_tokens[0].amount,
              maker_amount: quoteResponse.sell_tokens[0].amount,
            },
          ],
        };

        const { signature } = await signQuote(quoteData, privateKey);
        quoteResponse.signature = signature;
        console.log(`✍️  Quote signed`);
      }

      console.log(`✅ Quote sent`);
      return quoteResponse;
    } catch (error) {
      console.error(`❌ Error generating quote:`, error);
      return { type: "decline", rfq_id, reason: `Error: ${(error as Error).message}` };
    }
  }

  /**
   * Convert on-chain option params to Deribit instrument name
   * e.g., "ETH-28MAR25-3000-C"
   */
  private mapToDeribitInstrument(option: OptionParams): string | null {
    const expiry = this.formatDeribitExpiry(option.expiry);
    if (!expiry) return null;

    const strike = Math.round(option.strike);
    if (strike <= 0) return null;

    const type = option.isPut ? "P" : "C";
    const name = `${this.deribitFeed ? "ETH" : option.underlying}-${expiry}-${strike}-${type}`;

    // Validate against Deribit's instrument list
    if (!this.deribitFeed.hasInstrument(name)) {
      return null;
    }

    return name;
  }

  /**
   * Convert unix timestamp to Deribit's DDMMMYY format
   * Deribit expirations are at 08:00 UTC
   */
  private formatDeribitExpiry(unixTimestamp: number): string | null {
    const date = new Date(unixTimestamp * 1000);
    const day = date.getUTCDate();
    const month = MONTHS[date.getUTCMonth()];
    const year = String(date.getUTCFullYear()).slice(-2);

    if (!month) return null;

    return `${day}${month}${year}`;
  }
}
