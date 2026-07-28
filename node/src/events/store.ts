/**
 * In-memory event store. Holds the OptionCreated history per chain that
 * the sync loop populates. Keeping this in-process (rather than the
 * on-disk JSON cache that the standalone event-sync uses) is fine because:
 *
 *   - The MM is always-on per fly.toml, so the cache is rarely cold.
 *   - The total event volume is small — ~1KB per OptionCreated, low
 *     hundreds of options per chain. A few MB at most.
 *   - On a fresh boot, syncLoop's first tick rescans from
 *     deploymentBlock → head and refills the store; takes seconds, not
 *     minutes.
 *
 * If long-lived persistence becomes useful (e.g. to survive a Fly Machine
 * replacement without rescanning), swap this for a Fly volume-backed JSON
 * cache — the public API doesn't change.
 */

import type { OptionCreatedEvent } from "./client";

interface ChainState {
  /** Last block number scanned (inclusive). `-1` until first tick. */
  lastBlock: bigint;
  /** All known events for this chain, append-only, dedup'd by (txHash, logIndex). */
  events: OptionCreatedEvent[];
  /** Wall-clock of the most recent successful sync tick. */
  syncedAt: string;
}

const state = new Map<number, ChainState>();

export function getChainState(chainId: number): ChainState | undefined {
  return state.get(chainId);
}

export function getEvents(chainId: number): OptionCreatedEvent[] {
  return state.get(chainId)?.events ?? [];
}

/**
 * Append events from a sync tick. Dedup'd by (txHash, logIndex) so a chain
 * reorg or overlapping range doesn't duplicate a row.
 */
export function appendEvents(
  chainId: number,
  newEvents: OptionCreatedEvent[],
  newLastBlock: bigint,
): { added: number } {
  const existing = state.get(chainId);
  const seen = new Set<string>();
  if (existing) {
    for (const e of existing.events) seen.add(`${e.txHash}:${e.logIndex}`);
  }

  const added: OptionCreatedEvent[] = [];
  for (const e of newEvents) {
    const key = `${e.txHash}:${e.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(e);
  }

  state.set(chainId, {
    lastBlock: newLastBlock,
    events: existing ? [...existing.events, ...added] : added,
    syncedAt: new Date().toISOString(),
  });
  return { added: added.length };
}

export function summary(): Array<{
  chainId: number;
  events: number;
  lastBlock: string | null;
  syncedAt: string | null;
}> {
  return Array.from(state.entries()).map(([chainId, s]) => ({
    chainId,
    events: s.events.length,
    lastBlock: s.lastBlock >= 0n ? String(s.lastBlock) : null,
    syncedAt: s.syncedAt,
  }));
}
