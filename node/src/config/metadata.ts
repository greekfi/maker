import { formatUnits, parseAbiItem } from "viem";
import { getOptionAddresses, getOptionFactory, getDeploymentBlock } from "./options";
import { getPublicClient } from "./client";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Event signature for OptionCreated on the Factory. Matches the solidity
// signature in foundry/contracts/Factory.sol. Indexed: collateral,
// consideration, option.
const OPTION_CREATED_EVENT = parseAbiItem(
  "event OptionCreated(address indexed collateral, address indexed consideration, uint40 expirationDate, uint256 strike, bool isPut, bool isEuro, uint40 windowSeconds, address indexed option, address receipt)",
);

// RPC getLogs limits: Alchemy/public nodes typically cap at 10k blocks.
// Most public RPCs allow up to ~50k–100k blocks per getLogs call. Bumping
// this from 10k means fewer sequential requests during cold-start discovery,
// which matters a lot on shared/free-tier endpoints that rate-limit per IP.
const LOG_CHUNK_SIZE = BigInt(parseInt(process.env.LOG_CHUNK_SIZE ?? "50000", 10));
// Keep to 2-way to stay under PublicNode's per-second burst ceiling.
const LOG_CONCURRENCY = 2;

async function getLogsWithRetry<T>(fn: () => Promise<T>, attempts = 4, baseMs = 300): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, baseMs * (i + 1)));
    }
  }
  throw lastErr;
}

type OptionCreatedArgs = {
  collateral?: string;
  consideration?: string;
  expirationDate?: bigint | number;
  strike?: bigint;
  isPut?: boolean;
  isEuro?: boolean;
  windowSeconds?: bigint | number;
  option?: string;
  receipt?: string;
};

/**
 * Discover options by scanning the Factory's OptionCreated events. Returns
 * full metadata directly from event args — no per-option RPC reads needed
 * (strike, expiry, isPut, collateral, receipt() are all in the event).
 * Uses chunked getLogs to work around per-call block range limits.
 */
export async function discoverOptionMetadata(chainId: number): Promise<OptionMetadata[]> {
  console.log(`[discoverOptions] ENTER chain=${chainId}`);
  try {
  const factory = getOptionFactory(chainId);
  console.log(`[discoverOptions] chain=${chainId} factory=${factory}`);
  if (!factory || factory === "0x..." || factory === "0x") {
    console.warn(`⚠️  No factory configured for chain ${chainId}`);
    return [];
  }

  const client = getPublicClient(chainId);
  console.log(`[discoverOptions] calling getBlockNumber()`);
  const currentBlock = await client.getBlockNumber();
  console.log(`[discoverOptions] currentBlock=${currentBlock}`);
  const deploymentBlock = BigInt(getDeploymentBlock(chainId));

  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  for (let b = deploymentBlock; b <= currentBlock; b += LOG_CHUNK_SIZE) {
    const end = b + LOG_CHUNK_SIZE - 1n > currentBlock ? currentBlock : b + LOG_CHUNK_SIZE - 1n;
    ranges.push({ fromBlock: b, toBlock: end });
  }
  console.log(
    `[discoverOptions] chain=${chainId} factory=${factory} scan=${deploymentBlock}→${currentBlock} chunks=${ranges.length}`,
  );

  const allLogs: Array<{ args: OptionCreatedArgs }> = [];
  for (let i = 0; i < ranges.length; i += LOG_CONCURRENCY) {
    const batch = ranges.slice(i, i + LOG_CONCURRENCY);
    const results = await Promise.all(
      batch.map(r =>
        getLogsWithRetry(() =>
          client.getLogs({
            address: factory as `0x${string}`,
            event: OPTION_CREATED_EVENT,
            ...r,
          }),
        ),
      ),
    );
    for (const chunk of results) allLogs.push(...(chunk as Array<{ args: OptionCreatedArgs }>));
  }

  // Dedupe by option address; last-writer-wins if the factory somehow emits twice.
  const byAddress = new Map<string, OptionMetadata>();
  for (const log of allLogs) {
    const a = log.args;
    if (!a.option || !a.receipt || !a.collateral || !a.consideration) continue;
    // Strike on-chain is "consideration per collateral". For puts, the contract
    // stores the inverted form (1e36 / humanStrike) so call/put strikes share
    // the same encoding. Invert it back here so downstream Black-Scholes sees
    // the same human-readable strike for both sides.
    const rawStrike = Number(formatUnits(BigInt(a.strike ?? 0n), 18));
    const strike = a.isPut && rawStrike > 0 ? 1 / rawStrike : rawStrike;
    byAddress.set(a.option.toLowerCase(), {
      address: a.option,
      receiptAddress: a.receipt,
      strike,
      expirationTimestamp: Number(a.expirationDate ?? 0),
      isPut: Boolean(a.isPut),
      collateralAddress: a.collateral,
      considerationAddress: a.consideration,
    });
  }
  const metadata = Array.from(byAddress.values());
  console.log(`[discoverOptions] found ${allLogs.length} events, ${metadata.length} unique options`);
  // Prime the module-level cache so downstream callers skip the RPC reads.
  for (const m of metadata) metadataCache.set(m.address.toLowerCase(), m);
  return metadata;
  } catch (err) {
    console.error(`[discoverOptions] THREW:`, err instanceof Error ? err.stack || err.message : err);
    throw err;
  }
}

// Option contract ABI (minimal for metadata).
// `receipt()` returns the paired Receipt (short-side) contract address.
// (Note: `Option.collateral()` would return the underlying ERC20 address,
//  not the receipt contract — that's the pre-rename Collateral pointer.)
const OPTION_ABI = [
  {
    name: "receipt",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

// Receipt contract ABI (has the actual option parameters).
const REDEMPTION_ABI = [
  {
    name: "strike",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "expirationDate",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint40" }],
  },
  {
    name: "isPut",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    name: "collateral",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "consideration",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export interface OptionMetadata {
  address: string;
  receiptAddress: string;
  strike: number; // In USD (normalized; for puts, inverted back from contract's 1/strike encoding)
  expirationTimestamp: number; // Unix timestamp
  isPut: boolean;
  collateralAddress: string;
  /** Consideration token (USDC for calls, the underlying for puts). */
  considerationAddress: string;
}

// Cache for option metadata
const metadataCache = new Map<string, OptionMetadata>();

export async function fetchOptionMetadata(optionAddress: string): Promise<OptionMetadata | null> {
  const cached = metadataCache.get(optionAddress.toLowerCase());
  if (cached) return cached;

  const client = getPublicClient();

  try {
    // Resolve the paired Receipt (short-side) contract — that's where the
    // option parameters live (strike, expirationDate, isPut, collateral, consideration).
    const receiptAddress = await client.readContract({
      address: optionAddress as `0x${string}`,
      abi: OPTION_ABI,
      functionName: "receipt",
    }) as `0x${string}`;

    // Then get option parameters from receipt contract
    const [strike, expirationDate, isPut, collateral, consideration] = await Promise.all([
      client.readContract({
        address: receiptAddress,
        abi: REDEMPTION_ABI,
        functionName: "strike",
      }) as Promise<bigint>,
      client.readContract({
        address: receiptAddress,
        abi: REDEMPTION_ABI,
        functionName: "expirationDate",
      }) as Promise<unknown> as Promise<bigint>,
      client.readContract({
        address: receiptAddress,
        abi: REDEMPTION_ABI,
        functionName: "isPut",
      }) as Promise<boolean>,
      client.readContract({
        address: receiptAddress,
        abi: REDEMPTION_ABI,
        functionName: "collateral",
      }) as Promise<`0x${string}`>,
      client.readContract({
        address: receiptAddress,
        abi: REDEMPTION_ABI,
        functionName: "consideration",
      }) as Promise<`0x${string}`>,
    ]);

    // Strike is encoded with 18 decimals
    let strikeNum = parseFloat(formatUnits(strike, 18));

    // For puts, the contract stores strike as collateral/consideration (inverted)
    // Normalize to consideration/collateral (same as calls) for Black-Scholes
    if (isPut && strikeNum > 0) {
      strikeNum = 1 / strikeNum;
    }

    const metadata: OptionMetadata = {
      address: optionAddress.toLowerCase(),
      receiptAddress: receiptAddress.toLowerCase(),
      strike: strikeNum,
      expirationTimestamp: Number(expirationDate),
      isPut,
      collateralAddress: collateral.toLowerCase(),
      considerationAddress: consideration.toLowerCase(),
    };

    metadataCache.set(optionAddress.toLowerCase(), metadata);
    return metadata;
  } catch (error) {
    console.error(`Failed to fetch metadata for option ${optionAddress}:`, error);
    return null;
  }
}

/**
 * Load option metadata from persisted JSON file
 * This is much faster than fetching from chain
 *
 * @returns Map of option metadata, or null if file doesn't exist
 */
export function loadMetadataFromFile(chainId: number): Map<string, OptionMetadata> | null {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const filePath = join(__dirname, "..", "..", "data", `metadata-${chainId}.json`);

  if (!existsSync(filePath)) {
    console.log(`⚠️  No metadata file found at ${filePath}`);
    return null;
  }

  try {
    const fileContent = readFileSync(filePath, "utf-8");
    const data = JSON.parse(fileContent) as {
      chainId: number;
      timestamp: number;
      count: number;
      options: OptionMetadata[];
    };

    if (data.chainId !== chainId) {
      console.warn(`⚠️  Metadata file is for chain ${data.chainId}, but caller asked for chain ${chainId}`);
      return null;
    }

    // Populate cache
    const map = new Map<string, OptionMetadata>();
    for (const option of data.options) {
      const address = option.address.toLowerCase();
      map.set(address, option);
      metadataCache.set(address, option);
    }

    const age = Date.now() - data.timestamp;
    const ageMinutes = Math.floor(age / 60000);
    console.log(`✅ Loaded ${data.count} options from file (${ageMinutes}m old)`);

    return map;
  } catch (error) {
    console.error(`❌ Failed to load metadata from file:`, error);
    return null;
  }
}

/**
 * Fetch all option metadata from chain (slow, use loadMetadataFromFile when possible)
 *
 * @param forceRefresh If true, merges cached data with new options from config
 */
export async function fetchAllOptionMetadata(chainId: number, forceRefresh = false): Promise<Map<string, OptionMetadata>> {
  // Prefer dynamic discovery: scans the Factory for OptionCreated events so new
  // options appear without a code change. The call primes metadataCache with
  // event-derived OptionMetadata, so subsequent fetchOptionMetadata(addr) hits
  // the cache and skips per-option RPC reads (necessary because the current
  // Option contract exposes collateral() not receipt()()).
  const discovered = await discoverOptionMetadata(chainId).catch(err => {
    console.warn(`⚠️  Option discovery failed: ${err instanceof Error ? err.message : err}`);
    return [] as OptionMetadata[];
  });
  const optionAddresses =
    discovered.length > 0 ? discovered.map(m => m.address) : getOptionAddresses(chainId);

  // Load existing cache
  const fromFile = loadMetadataFromFile(chainId);

  if (forceRefresh && fromFile) {
    // Merge mode: find options that are in config but not in cache
    const cachedAddresses = new Set(fromFile.keys());
    const configAddresses = new Set(optionAddresses.map(addr => addr.toLowerCase()));

    const newAddresses = optionAddresses.filter(
      addr => !cachedAddresses.has(addr.toLowerCase())
    );

    const removedAddresses = Array.from(cachedAddresses).filter(
      addr => !configAddresses.has(addr)
    );

    if (newAddresses.length === 0 && removedAddresses.length === 0) {
      console.log("✅ Cache is up to date with config");
      return fromFile;
    }

    if (removedAddresses.length > 0) {
      console.log(`🗑️  Removing ${removedAddresses.length} options no longer in config`);
      removedAddresses.forEach(addr => {
        fromFile.delete(addr);
        metadataCache.delete(addr);
      });
    }

    if (newAddresses.length > 0) {
      console.log(`📥 Fetching ${newAddresses.length} new options from chain...`);

      // Fetch new options in batches
      const batchSize = 10;
      for (let i = 0; i < newAddresses.length; i += batchSize) {
        const batch = newAddresses.slice(i, i + batchSize);
        await Promise.all(batch.map(addr => fetchOptionMetadata(addr)));
        if (i + batchSize < newAddresses.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Successfully fetched ${newAddresses.length} new options`);
    }

    return metadataCache;
  }

  // Non-refresh mode: use cache if available
  if (!forceRefresh && fromFile) {
    return fromFile;
  }

  // No cache available: fetch everything
  console.log(`Fetching metadata for ${optionAddresses.length} options on chain ${chainId}...`);

  const batchSize = 10;
  for (let i = 0; i < optionAddresses.length; i += batchSize) {
    const batch = optionAddresses.slice(i, i + batchSize);
    await Promise.all(batch.map(addr => fetchOptionMetadata(addr)));
    if (i + batchSize < optionAddresses.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`Successfully fetched metadata for ${metadataCache.size} options`);
  return metadataCache;
}

export function getOptionMetadata(address: string): OptionMetadata | undefined {
  return metadataCache.get(address.toLowerCase());
}

// Fetch current ETH spot price from a simple source
// In production, use Chainlink or similar oracle
let cachedSpotPrice = 2300; // Default fallback (update this!)
let lastSpotFetch = 0;

export async function fetchSpotPrice(): Promise<number> {
  const now = Date.now();
  // Cache for 30 seconds
  if (now - lastSpotFetch < 30000 && lastSpotFetch > 0) {
    return cachedSpotPrice;
  }

  // Try CoinGecko first
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: AbortSignal.timeout(5000) }
    );
    const data = (await response.json()) as { ethereum?: { usd?: number } };
    if (data.ethereum?.usd) {
      cachedSpotPrice = data.ethereum.usd;
      lastSpotFetch = now;
      console.log(`[CoinGecko] ETH spot price: $${cachedSpotPrice}`);
      return cachedSpotPrice;
    }
  } catch (error) {
    console.error("[CoinGecko] Failed:", (error as Error).message);
  }

  // Fallback to CoinCap
  try {
    const response = await fetch(
      "https://api.coincap.io/v2/assets/ethereum",
      { signal: AbortSignal.timeout(5000) }
    );
    const data = (await response.json()) as { data?: { priceUsd?: string } };
    if (data.data?.priceUsd) {
      cachedSpotPrice = parseFloat(data.data.priceUsd);
      lastSpotFetch = now;
      console.log(`[CoinCap] ETH spot price: $${cachedSpotPrice}`);
      return cachedSpotPrice;
    }
  } catch (error) {
    console.error("[CoinCap] Failed:", (error as Error).message);
  }

  console.warn(`⚠️  Using cached/default spot price: $${cachedSpotPrice}`);
  return cachedSpotPrice;
}

export function getSpotPrice(): number {
  return cachedSpotPrice;
}
