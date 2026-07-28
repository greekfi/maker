/**
 * Lazy option registration. Replaces direct.ts's boot-time eager scan: instead
 * of registering every option on every chain at startup, we register on first
 * access via a `/options` or `/quote` request. Decimals are read once per
 * option and cached for the process lifetime.
 *
 * The Pricer cache itself is a Map<address, OptionParams>, so registering the
 * same option twice is a no-op (first one wins, subsequent calls short-circuit
 * before the decimals RPC).
 */

import { formatUnits } from "viem";
import type { Pricer } from "./pricer";
import type { OptionCreatedEvent } from "../events/client";
import { fetchEventByAddress } from "../events/client";
import { getPublicClient } from "../config/client";
import { getTokenByAddress } from "../config/tokens";

const DECIMALS_ABI = [
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/**
 * Map a token symbol to the spot-feed key. Calls reference the collateral's
 * underlying; puts reference the consideration. Variants of ETH and BTC
 * collapse onto a single feed.
 */
export function feedSymbolFor(tokenSymbol: string | undefined): string | undefined {
  if (!tokenSymbol) return undefined;
  const s = tokenSymbol.toUpperCase();
  if (s === "WETH" || s === "ETH" || s.endsWith("ETH")) return "ETH";
  if (s === "WBTC" || s === "BTC" || s === "CBBTC" || s.endsWith("BTC")) return "BTC";
  return undefined;
}

/**
 * Register an option from an OptionCreated event into the pricer if not
 * already present. Reads decimals on-chain once. Returns the resolved
 * underlying-feed symbol (for callers that want to start spot polling for it),
 * or `undefined` if the underlying isn't recognized.
 */
export async function registerFromEvent(
  pricer: Pricer,
  chainId: number,
  event: OptionCreatedEvent,
): Promise<string | undefined> {
  const optionAddress = event.args.option;
  if (pricer.isOption(optionAddress)) {
    return pricer.getOption(optionAddress)?.underlying;
  }

  // Calls reference collateral; puts reference consideration.
  const refAddress = event.args.isPut ? event.args.consideration : event.args.collateral;
  const tok = getTokenByAddress(chainId, refAddress);
  const underlying = feedSymbolFor(tok?.symbol);
  if (!underlying) {
    // Unknown underlying — skip rather than register-and-fail-to-price later.
    console.warn(
      `[registry] chain ${chainId}: unknown ${event.args.isPut ? "consideration" : "collateral"} ${refAddress} on option ${optionAddress}; not registering`,
    );
    return undefined;
  }

  const decimals = await readDecimalsCached(chainId, optionAddress);

  // Strike is 18-decimal fixed-point on chain. For puts the contract stores
  // 1/strike (collateral-per-consideration); invert back so the Pricer always
  // sees consideration-per-collateral, the form Black-Scholes expects.
  let strike = parseFloat(formatUnits(BigInt(event.args.strike), 18));
  if (event.args.isPut && strike > 0) strike = 1 / strike;

  pricer.registerOption({
    optionAddress,
    underlying,
    strike,
    expiry: event.args.expirationDate,
    isPut: event.args.isPut,
    decimals,
    collateralAddress: event.args.collateral,
  });
  return underlying;
}

/**
 * Register a batch of events. Returns the union of underlying symbols touched,
 * useful if the caller wants to ensure the spot feed is polling them.
 */
export async function registerFromEvents(
  pricer: Pricer,
  chainId: number,
  events: OptionCreatedEvent[],
): Promise<Set<string>> {
  const underlyings = new Set<string>();
  // Read decimals concurrently with a small cap to stay polite to public RPCs.
  const BATCH = 16;
  for (let i = 0; i < events.length; i += BATCH) {
    const slice = events.slice(i, i + BATCH);
    const results = await Promise.all(slice.map(e => registerFromEvent(pricer, chainId, e)));
    for (const u of results) if (u) underlyings.add(u);
  }
  return underlyings;
}

/**
 * Register a single option by address. Falls back to event lookup when called
 * from `/price/:addr` or `/quote` paths that don't already have the event in
 * hand. Returns `false` if no event matches (option doesn't exist on this
 * chain) or its underlying isn't recognized.
 */
export async function ensureRegistered(
  pricer: Pricer,
  chainId: number,
  optionAddress: string,
): Promise<boolean> {
  if (pricer.isOption(optionAddress)) return true;
  const event = await fetchEventByAddress(chainId, optionAddress);
  if (!event) return false;
  const underlying = await registerFromEvent(pricer, chainId, event);
  return underlying !== undefined;
}

// Per-process decimals cache. Options inherit collateral decimals and
// can't change them, so a single read per address is enough for ever.
const decimalsByAddress = new Map<string, number>();

async function readDecimalsCached(chainId: number, address: string): Promise<number> {
  const key = `${chainId}:${address.toLowerCase()}`;
  const cached = decimalsByAddress.get(key);
  if (cached !== undefined) return cached;
  try {
    const client = getPublicClient(chainId);
    const dec = await client.readContract({
      address: address as `0x${string}`,
      abi: DECIMALS_ABI,
      functionName: "decimals",
    });
    const n = Number(dec);
    decimalsByAddress.set(key, n);
    return n;
  } catch (err) {
    console.warn(`[registry] decimals() failed for ${address} on chain ${chainId}:`, (err as Error).message);
    // 18 is the default for ERC20s and matches the option implementation's
    // own override anyway. Caching the fallback prevents repeated misses.
    decimalsByAddress.set(key, 18);
    return 18;
  }
}
