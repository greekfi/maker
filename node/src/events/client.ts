/**
 * Event lookup against the in-memory store. In Phase 1 this was an HTTP
 * client to greek-events.fly.dev; Phase 2 folded the sync loop into this
 * process, so the same exports now read from `./store` directly. Kept
 * under the original filename so callers in pricing/registry.ts and
 * servers/httpApi.ts don't need to change.
 */

import { getEvents } from "./store";

export interface OptionCreatedEvent {
  blockNumber: string;
  txHash: string;
  logIndex: number;
  args: {
    collateral: string;
    consideration: string;
    expirationDate: number;
    /** 18-decimal fixed-point bigint as a decimal string. */
    strike: string;
    isPut: boolean;
    isEuro: boolean;
    /** Length in seconds of the post-expiry exercise window. */
    windowSeconds: number;
    /** Long-side ERC20 (the Option clone). */
    option: string;
    /** Short-side ERC20 (the Receipt clone). */
    receipt: string;
  };
}

export interface FetchEventsParams {
  chainId: number;
  /** Optional case-insensitive collateral filter (lowercase address). */
  collateral?: string;
  /** Optional case-insensitive consideration filter (lowercase address). */
  consideration?: string;
}

/**
 * Get every OptionCreated event for a chain, optionally filtered to a
 * (collateral, consideration) pair. Synchronous in this build but kept
 * async so the call sites don't churn — and so the signature stays compatible
 * with a future Phase-2.5 that swaps in a disk-backed store.
 */
export async function fetchEvents(params: FetchEventsParams): Promise<OptionCreatedEvent[]> {
  const events = getEvents(params.chainId);
  const collFilter = params.collateral?.toLowerCase();
  const consFilter = params.consideration?.toLowerCase();
  if (!collFilter && !consFilter) return events;
  return events.filter(e => {
    if (collFilter && e.args.collateral.toLowerCase() !== collFilter) return false;
    if (consFilter && e.args.consideration.toLowerCase() !== consFilter) return false;
    return true;
  });
}

/** Lookup a single event by option address. */
export async function fetchEventByAddress(
  chainId: number,
  optionAddress: string,
): Promise<OptionCreatedEvent | undefined> {
  const lower = optionAddress.toLowerCase();
  return getEvents(chainId).find(e => e.args.option.toLowerCase() === lower);
}
