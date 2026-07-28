import express, { type Request, type Response } from "express";
import cors from "cors";
import type { Pricer } from "../pricing/pricer";
import { ensureRegistered, registerFromEvents } from "../pricing/registry";
import { fetchEvents } from "../events/client";
import { summary as syncSummary } from "../events/store";
import type { QuoteResponse, ErrorResponse } from "../pricing/types";
import { signQuote, type QuoteData } from "../bebop/signing";
import { privateKeyToAccount } from "viem/accounts";

/** Signs a QuoteData without exposing the underlying key. Produced at factory time. */
export type Signer = (data: QuoteData) => Promise<{ signature: string }>;

export interface QuoteServerConfig {
  port: number;
  /** One Pricer per supported chain, keyed by chainId. */
  pricers: Map<number, Pricer>;
  makerAddress: string;
  /** Optional signer closure. If absent, /quote responses omit signature fields. */
  signer?: Signer;
}

export class QuoteServer {
  private app = express();
  private pricers: Map<number, Pricer>;
  private makerAddress: string;
  private signer?: Signer;

  constructor(private config: QuoteServerConfig) {
    this.pricers = config.pricers;
    this.makerAddress = config.makerAddress;
    this.signer = config.signer;

    this.app.use(cors());
    this.app.use(express.json());
    this.setupRoutes();
  }

  /**
   * Resolve the Pricer for the chainId in the request. Throws (caught by
   * the route handler → 400) if missing or unknown.
   */
  private pricerForRequest(req: Request): { chainId: number; pricer: Pricer } {
    const raw = req.query.chainId ?? req.query.chain_id ?? req.query.chain;
    if (raw === undefined) {
      throw new Error("chainId query parameter is required");
    }
    const chainId = Number(raw);
    if (!Number.isFinite(chainId)) {
      throw new Error(`Invalid chainId: ${raw}`);
    }
    const pricer = this.pricers.get(chainId);
    if (!pricer) {
      const supported = Array.from(this.pricers.keys()).join(", ");
      throw new Error(`Unsupported chainId ${chainId} (server runs ${supported})`);
    }
    return { chainId, pricer };
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/health", (req, res) => {
      const chains = Array.from(this.pricers.entries()).map(([chainId, pricer]) => ({
        chainId,
        optionsCount: pricer.getAllOptions().length,
      }));
      res.json({
        status: "ok",
        chains,
        sync: syncSummary(),
        makerAddress: this.makerAddress,
      });
    });

    // OptionCreated events. Same shape and route as greek-events so the
    // frontend can flip its EVENTS_API_URL from greek-events.fly.dev to
    // api.greek.finance once Phase 2 is live.
    this.app.get("/events", async (req, res) => {
      const chainIdRaw = req.query.chainId;
      const chainId = chainIdRaw !== undefined ? Number(chainIdRaw) : undefined;
      if (chainId !== undefined && !Number.isFinite(chainId)) {
        res.status(400).json({ error: `Invalid chainId: ${chainIdRaw}`, code: "BAD_REQUEST" });
        return;
      }
      // Iterate every tracked chain when no filter is supplied, matching
      // greek-events' behaviour. Within a chain, return latest first.
      const chains = chainId !== undefined ? [chainId] : Array.from(this.pricers.keys());
      const out: Array<Awaited<ReturnType<typeof fetchEvents>>[number]> = [];
      for (const id of chains) {
        const events = await fetchEvents({ chainId: id });
        out.push(...events);
      }
      out.sort((a, b) => {
        const ab = BigInt(a.blockNumber);
        const bb = BigInt(b.blockNumber);
        if (ab !== bb) return ab > bb ? -1 : 1;
        return b.logIndex - a.logIndex;
      });
      res.json({ count: out.length, events: out });
    });

    // List options with live prices. `chainId` is required; an optional
    // (collateral, consideration) pair filter narrows to one underlying/quote
    // pair so the frontend can ask for "WETH/USDC options on Base" without
    // pulling everything. Discovery is delegated to greek-events; this
    // handler registers any new options into the per-chain Pricer on demand,
    // then prices everything that came back.
    this.app.get("/options", async (req, res) => {
      try {
        const chainIdRaw = req.query.chainId;
        if (chainIdRaw === undefined) {
          res.status(400).json({ error: "chainId query parameter is required", code: "BAD_REQUEST" });
          return;
        }
        const chainId = Number(chainIdRaw);
        if (!Number.isFinite(chainId)) {
          res.status(400).json({ error: `Invalid chainId: ${chainIdRaw}`, code: "BAD_REQUEST" });
          return;
        }
        const pricer = this.pricers.get(chainId);
        if (!pricer) {
          const supported = Array.from(this.pricers.keys()).join(", ");
          res
            .status(400)
            .json({ error: `Unsupported chainId ${chainId} (server runs ${supported})`, code: "BAD_REQUEST" });
          return;
        }

        const collateral = typeof req.query.collateral === "string" ? req.query.collateral : undefined;
        const consideration = typeof req.query.consideration === "string" ? req.query.consideration : undefined;

        // Pull events for this chain (optionally pair-filtered) and register
        // any we haven't seen yet. Failures bubble up as an empty list — the
        // pricer.price() loop below just returns nothing for unknown options.
        const events = await fetchEvents({ chainId, collateral, consideration });
        await registerFromEvents(pricer, chainId, events);

        const now = Math.floor(Date.now() / 1000);
        const out: Array<Record<string, unknown>> = [];
        for (const ev of events) {
          const opt = pricer.getOption(ev.args.option);
          if (!opt) continue; // unknown underlying — skipped during register
          if (opt.expiry <= now) continue; // expired options aren't quotable
          const price = pricer.price(opt.optionAddress);
          out.push({
            chainId,
            address: opt.optionAddress,
            underlying: opt.underlying,
            strike: opt.strike,
            expiry: opt.expiry,
            isPut: opt.isPut,
            decimals: opt.decimals,
            bid: price?.bid ?? null,
            ask: price?.ask ?? null,
            mid: price?.mid ?? null,
            delta: price?.delta ?? null,
            gamma: price?.gamma ?? null,
            theta: price?.theta ?? null,
            vega: price?.vega ?? null,
            iv: price?.iv ?? null,
            spotPrice: price?.spotPrice ?? null,
          });
        }
        res.json({ options: out });
      } catch (err) {
        console.error("/options error:", err);
        res.status(500).json({ error: (err as Error).message, code: "OPTIONS_ERROR" });
      }
    });

    // Get quote - Bebop-compatible format. Caller must include chainId.
    // Lazy-registers either side of the pair if the option isn't in the
    // Pricer yet; first quote on a fresh option pays for one decimals read.
    this.app.get("/quote", async (req: Request, res: Response) => {
      try {
        const { pricer, chainId } = this.pricerForRequest(req);
        const params = req.query as Record<string, string | undefined>;
        const buyToken = params.buyToken ?? params.buy_tokens;
        const sellToken = params.sellToken ?? params.sell_tokens;
        if (buyToken) await ensureRegistered(pricer, chainId, buyToken).catch(() => {});
        if (sellToken) await ensureRegistered(pricer, chainId, sellToken).catch(() => {});
        const quote = await this.handleQuoteRequest(pricer, chainId, params);
        res.json(quote);
      } catch (error: unknown) {
        console.error("Quote error:", error);
        const errorResponse: ErrorResponse = {
          error: error instanceof Error ? error.message : "Quote generation failed",
          code: "QUOTE_ERROR",
        };
        res.status(400).json(errorResponse);
      }
    });

    // Get price for a specific option (chainId required). Lazy-registers if
    // the option isn't yet known to this Pricer.
    this.app.get("/price/:optionAddress", async (req, res) => {
      try {
        const { optionAddress } = req.params;
        const { pricer, chainId } = this.pricerForRequest(req);
        const ok = await ensureRegistered(pricer, chainId, optionAddress);
        if (!ok) {
          res.status(404).json({ error: "Option not found on this chain" });
          return;
        }
        const price = pricer.price(optionAddress);
        if (!price) {
          res.status(404).json({ error: "Option not priced (spot unavailable?)" });
          return;
        }
        const option = pricer.getOption(optionAddress);
        res.json({
          optionAddress,
          chainId,
          underlying: option?.underlying,
          strike: option?.strike,
          expiry: option?.expiry,
          isPut: option?.isPut,
          ...price,
        });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message, code: "BAD_REQUEST" });
      }
    });
  }

  private async handleQuoteRequest(
    pricer: Pricer,
    chainId: number,
    params: Record<string, string | undefined>,
  ): Promise<QuoteResponse> {
    const {
      buyToken,
      sellToken,
      buy_tokens,
      sell_tokens,
      sellAmount,
      buyAmount,
      sell_amounts,
      buy_amounts,
      takerAddress,
      taker_address,
    } = params;

    // Normalize parameters (support both formats)
    const normalizedBuyToken = buyToken || buy_tokens;
    const normalizedSellToken = sellToken || sell_tokens;
    const normalizedSellAmount = sellAmount || sell_amounts;
    const normalizedBuyAmount = buyAmount || buy_amounts;
    const normalizedTaker = takerAddress || taker_address || "0x0000000000000000000000000000000000000000";

    if (!normalizedBuyToken || !normalizedSellToken) {
      throw new Error("buyToken and sellToken are required");
    }

    if (!normalizedSellAmount && !normalizedBuyAmount) {
      throw new Error("Either sellAmount or buyAmount is required");
    }

    // Determine if user is buying or selling options
    const isBuyingOption = pricer.isOption(normalizedBuyToken);
    const isSellingOption = pricer.isOption(normalizedSellToken);

    if (!isBuyingOption && !isSellingOption) {
      throw new Error("Neither token is a registered option");
    }

    let buyAmountBigInt: bigint;
    let sellAmountBigInt: bigint;
    let optionAddress: string;
    let price: number;
    let greeks: QuoteResponse["greeks"];
    let spotPrice: number | undefined;
    let iv: number | undefined;

    if (isBuyingOption) {
      // User BUYING options (paying sellToken, receiving buyToken/options)
      optionAddress = normalizedBuyToken;
      const option = pricer.getOption(optionAddress);
      if (!option) throw new Error("Option not found");

      const priceResult = pricer.price(optionAddress);
      if (!priceResult) throw new Error("Unable to price option - check spot price");

      price = priceResult.ask;
      spotPrice = priceResult.spotPrice;
      iv = priceResult.iv;
      greeks = {
        delta: priceResult.delta,
        gamma: priceResult.gamma,
        theta: priceResult.theta,
        vega: priceResult.vega,
      };

      if (normalizedBuyAmount) {
        buyAmountBigInt = BigInt(normalizedBuyAmount);
        const cost = pricer.getAskQuote(optionAddress, buyAmountBigInt, 6);
        if (cost === null) throw new Error("Unable to calculate cost");
        sellAmountBigInt = cost;
      } else {
        sellAmountBigInt = BigInt(normalizedSellAmount!);
        const askPriceScaled = BigInt(Math.floor(price * 1e6));
        buyAmountBigInt = (sellAmountBigInt * BigInt(10 ** option.decimals)) / askPriceScaled;
      }
    } else {
      // User SELLING options (paying options, receiving buyToken)
      optionAddress = normalizedSellToken;
      const option = pricer.getOption(optionAddress);
      if (!option) throw new Error("Option not found");

      const priceResult = pricer.price(optionAddress);
      if (!priceResult) throw new Error("Unable to price option - check spot price");

      price = priceResult.bid;
      spotPrice = priceResult.spotPrice;
      iv = priceResult.iv;
      greeks = {
        delta: priceResult.delta,
        gamma: priceResult.gamma,
        theta: priceResult.theta,
        vega: priceResult.vega,
      };

      if (normalizedSellAmount) {
        sellAmountBigInt = BigInt(normalizedSellAmount);
        const payout = pricer.getBidQuote(optionAddress, sellAmountBigInt, 6);
        if (payout === null) throw new Error("Unable to calculate payout");
        buyAmountBigInt = payout;
      } else {
        buyAmountBigInt = BigInt(normalizedBuyAmount!);
        const bidPriceScaled = BigInt(Math.floor(price * 1e6));
        sellAmountBigInt = (buyAmountBigInt * BigInt(10 ** option.decimals)) / bidPriceScaled;
      }
    }

    const quoteId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // 5-minute quote TTL leaves room for wallet confirmation + tx propagation
    // without tripping Bebop's OrderExpired() on settlement.
    const expiry = Math.floor(Date.now() / 1000) + 300;

    const response: QuoteResponse = {
      quoteId,
      buyToken: normalizedBuyToken,
      sellToken: normalizedSellToken,
      buyAmount: buyAmountBigInt.toString(),
      sellAmount: sellAmountBigInt.toString(),
      price: price.toFixed(6),
      expiry,
      makerAddress: this.makerAddress,
      greeks,
      spotPrice,
      iv,
      routes: ["RFQ"],
      estimatedGas: "150000",
    };

    if (this.signer) {
      // 256-bit nonce built from timestamp + random — unique per quote without a DB.
      const nonce = (BigInt(Date.now()) << 128n) | BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      const order = {
        partner_id: "0",
        expiry: expiry.toString(),
        taker_address: normalizedTaker,
        maker_address: this.makerAddress,
        maker_nonce: nonce.toString(),
        taker_token: normalizedSellToken,
        maker_token: normalizedBuyToken,
        taker_amount: sellAmountBigInt.toString(),
        maker_amount: buyAmountBigInt.toString(),
        receiver: normalizedTaker,
        packed_commands: "0",
      };
      const { signature } = await this.signer({
        chain_id: chainId,
        order_signing_type: "SingleOrder",
        order_type: "Single",
        onchain_partner_id: 0,
        expiry,
        taker_address: order.taker_address,
        maker_address: order.maker_address,
        maker_nonce: order.maker_nonce,
        receiver: order.receiver,
        packed_commands: order.packed_commands,
        quotes: [
          {
            taker_token: order.taker_token,
            maker_token: order.maker_token,
            taker_amount: order.taker_amount,
            maker_amount: order.maker_amount,
          },
        ],
      });
      response.signature = signature;
      response.signScheme = "EIP712";
      response.order = order;
    }

    return response;
  }

  public start(): void {
    this.app.listen(this.config.port, "0.0.0.0", () => {
      console.log(`Quote server listening on port ${this.config.port}`);
      console.log(`  Health:  http://localhost:${this.config.port}/health`);
      console.log(`  Options: http://localhost:${this.config.port}/options`);
      console.log(`  Quote:   http://localhost:${this.config.port}/quote`);
    });
  }

  public listen(port: number): void {
    this.config.port = port;
    this.start();
  }
}

// Factory: build a QuoteServer for one or more chains.
export function createHttpApi(pricers: Map<number, Pricer>): QuoteServer {
  const port = parseInt(process.env.HTTP_PORT || "3010");

  // The maker address is *derived from the signing key* — never a separate
  // env var. A standalone MAKER_ADDRESS can drift out of sync with PRIVATE_KEY,
  // which makes every signed order fail Bebop's `ecrecover(order) == maker`
  // check with InvalidEIP712Signature. Single source of truth = the key.
  //
  // Capture the key in a closure at construction time so it never reaches
  // QuoteServer (no class property, no config field). Read from env locally
  // and let GC collect the local binding after the closure is built.
  let signer: Signer | undefined;
  let makerAddress = "0x0000000000000000000000000000000000000000";
  {
    const pk = process.env.PRIVATE_KEY;
    if (pk) {
      const key = (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
      makerAddress = privateKeyToAccount(key).address;
      signer = data => signQuote(data, pk);
    }
  }

  return new QuoteServer({ pricers, makerAddress, port, signer });
}
