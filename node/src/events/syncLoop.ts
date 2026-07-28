/**
 * In-process OptionCreated sync. Replaces the standalone greek-events Fly
 * app: this module owns the same getLogs walk + per-chain head tracking,
 * but writes into the in-memory `store` so the rest of the MM (Pricer
 * registration, /options handler, /events endpoint) reads the freshest
 * data without an HTTP hop.
 *
 * Why in-process: the MM is already always-on (fly.toml has
 * auto_stop_machines = "off"), so the sync loop runs continuously at no
 * extra infra cost. Phase 2 collapses the two services into one — see
 * notes above store.ts for the persistence trade-off.
 */

import { createPublicClient, http, parseAbiItem, type Log, type PublicClient } from "viem";
import { getChain } from "../config/chains";
import { OPTIONS } from "../config/options";
import type { OptionCreatedEvent } from "./client";
import { appendEvents, getChainState } from "./store";

const OPTION_CREATED = parseAbiItem(
  "event OptionCreated(address indexed collateral, address indexed consideration, uint40 expirationDate, uint256 strike, bool isPut, bool isEuro, uint40 windowSeconds, address indexed option, address receipt)",
);

/** Per-call getLogs block-range cap. Default 10k matches Base's strict cap;
 *  paid RPCs (Alchemy/Infura) allow more — bump via env when configured. */
const LOG_CHUNK_SIZE = BigInt(parseInt(process.env.LOG_CHUNK_SIZE ?? "10000", 10));
/** Sync cadence — events are rare (a `createOptions` is the only emitter). */
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS ?? "30000", 10);
/** Backoff base for getLogs retries (multiplied by attempt #). */
const RETRY_BASE_MS = 500;
/** Inter-chunk pause during cold scan to stay under public-RPC burst caps. */
const CHUNK_PAUSE_MS = parseInt(process.env.LOG_CHUNK_PAUSE_MS ?? "100", 10);

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Rate-limit / transient errors look very similar across RPCs; wait
      // longer on each successive failure rather than try to classify them.
      const wait = RETRY_BASE_MS * (i + 1) * (i + 1);
      console.warn(`[sync] ${label} attempt ${i + 1}/${attempts} failed: ${(err as Error).message.split("\n")[0]} — retrying in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export interface SyncOptions {
  /** Chains to track. Defaults to all keys in factories.json. */
  chainIds?: number[];
  /** Hook fired with the freshly-discovered events on each tick (per chain). */
  onNewEvents?: (chainId: number, events: OptionCreatedEvent[]) => void | Promise<void>;
  /** Override the polling cadence (ms). Default 30000. */
  intervalMs?: number;
}

/**
 * One sync pass for one chain: read `state.lastBlock` (or `deploymentBlock`
 * if cold), walk getLogs in chunks up to head, append to the store. Returns
 * the events that were *new* this tick so the caller can pipe them into
 * Pricer.registerFromEvents.
 */
async function syncChain(
  chainId: number,
  client: PublicClient,
): Promise<OptionCreatedEvent[]> {
  const deployment = OPTIONS[chainId];
  if (!deployment) return [];

  const factory = deployment.factory.toLowerCase() as `0x${string}`;
  const head = await withRetry(`chain ${chainId} getBlockNumber`, () => client.getBlockNumber());
  const state = getChainState(chainId);
  const fromStart =
    state && state.lastBlock >= 0n
      ? state.lastBlock + 1n
      : BigInt(deployment.deploymentBlock ?? 0);
  if (fromStart > head) return [];

  const fresh: OptionCreatedEvent[] = [];
  for (let from = fromStart; from <= head; from += LOG_CHUNK_SIZE) {
    const to = from + LOG_CHUNK_SIZE - 1n > head ? head : from + LOG_CHUNK_SIZE - 1n;
    const logs = await withRetry(`chain ${chainId} getLogs ${from}-${to}`, () =>
      client.getLogs({
        address: factory,
        event: OPTION_CREATED,
        fromBlock: from,
        toBlock: to,
      }),
    );
    for (const log of logs) fresh.push(toEvent(log));
    // Tiny pause between chunks during a cold scan keeps us under
    // PublicNode/free-tier per-second burst limits.
    if (CHUNK_PAUSE_MS > 0 && to < head) {
      await new Promise(r => setTimeout(r, CHUNK_PAUSE_MS));
    }
  }

  const { added } = appendEvents(chainId, fresh, head);
  // appendEvents dedup'd against state; only the truly-new are returned.
  return fresh.slice(fresh.length - added);
}

function toEvent(log: Log<bigint, number, false, typeof OPTION_CREATED>): OptionCreatedEvent {
  const a = log.args!;
  return {
    blockNumber: String(log.blockNumber),
    txHash: log.transactionHash!,
    logIndex: log.logIndex!,
    args: {
      collateral: a.collateral!,
      consideration: a.consideration!,
      expirationDate: Number(a.expirationDate),
      strike: String(a.strike),
      isPut: a.isPut!,
      isEuro: a.isEuro!,
      windowSeconds: Number(a.windowSeconds),
      option: a.option!,
      receipt: a.receipt!,
    },
  };
}

/**
 * Start the recurring sync. Returns a stop() handle. Uses chained
 * setTimeout (not setInterval) so a slow tick can never overlap the next
 * one — slow RPC just delays the next pass.
 */
export function startSyncLoop(opts: SyncOptions = {}): { stop: () => void } {
  const interval = opts.intervalMs ?? SYNC_INTERVAL_MS;
  const chainIds = opts.chainIds ?? Object.keys(OPTIONS).map(k => parseInt(k, 10));

  // Don't go through getPublicClient — its singleton model assumes one
  // chain per process and would clobber the cache when called for multiple
  // chains in succession. Build one client per chain directly so each one
  // has its own RPC URL pinned for the lifetime of the loop.
  const clients = new Map<number, PublicClient>();
  for (const id of chainIds) {
    try {
      const cfg = getChain(id);
      clients.set(id, createPublicClient({ transport: http(cfg.rpcUrl) }) as PublicClient);
    } catch (err) {
      console.warn(`[sync] no RPC client for chain ${id}: ${(err as Error).message}`);
    }
  }

  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopped) return;
    await Promise.allSettled(
      chainIds.map(async id => {
        const client = clients.get(id);
        if (!client) return;
        try {
          const newEvents = await syncChain(id, client);
          if (newEvents.length > 0) {
            console.log(`[sync] chain ${id}: +${newEvents.length} events`);
            if (opts.onNewEvents) await opts.onNewEvents(id, newEvents);
          }
        } catch (err) {
          console.warn(`[sync] chain ${id} failed:`, (err as Error).message);
        }
      }),
    );
    if (!stopped) timer = setTimeout(tick, interval);
  };

  // Kick the first tick immediately. `tick` schedules itself thereafter.
  tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
