# Configuration Architecture

This directory contains the centralized configuration for the market-maker package.

## File Structure

```
config/
├── chains.ts       # Chain configurations (RPC URLs, price feeds, etc.)
├── client.ts       # Centralized RPC client factory ⭐ USE THIS
├── tokens.ts       # Token addresses per chain
├── options.ts      # Option contract deployments
├── metadata.ts     # Option metadata fetching/caching
└── registry.ts     # Option address registry
```

## 🎯 Single Source of Truth

### Chain Configuration: `chains.ts`

**This is where ALL chain settings are defined:**
- RPC URLs (with env var overrides)
- Block explorers
- Chainlink price feed addresses
- Native currency info

```typescript
import { getChain, getChainByName } from "./chains";

const chain = getChain(1);  // Get Ethereum config
console.log(chain.rpcUrl);  // https://eth.drpc.org (or RPC_ETHEREUM env override)
```

### RPC Clients: `client.ts`

**⚠️ IMPORTANT: ALL code must use clients from this module**

Do NOT create viem clients directly with `createPublicClient()` or `createWalletClient()`.
Instead, use the centralized factory:

```typescript
import { getPublicClient, getWalletClient } from "./client";

// Reading blockchain data
const client = getPublicClient();
const balance = await client.getBalance({ address: "0x..." });

// Sending transactions (requires PRIVATE_KEY env var)
const wallet = getWalletClient();
const hash = await wallet.sendTransaction({ ... });
```

**Why centralized clients?**
- ✅ Single source of truth for RPC URLs
- ✅ Automatic chain switching
- ✅ Lazy initialization (created only when needed)
- ✅ Singleton pattern (reuses same client)
- ✅ Consistent logging
- ✅ Easy to add batching/caching later

## Configuration Hierarchy

### RPC URL Resolution
```
1. Environment variable (highest priority)
   └─ RPC_ETHEREUM, RPC_BASE, etc.

2. Chain config default
   └─ CHAINS[1].rpcUrl = "https://eth.drpc.org"

3. Viem default (fallback)
   └─ chains.mainnet.rpcUrls.default.http[0]
```

### Chain ID Resolution
```
1. Function parameter (if provided)
   └─ getPublicClient(8453)

2. CHAIN_ID environment variable
   └─ CHAIN_ID=1

3. Default to Ethereum mainnet (1)
```

## Usage Examples

### Basic RPC Call
```typescript
import { getPublicClient } from "./config/client";

const client = getPublicClient();
const block = await client.getBlock({ blockTag: "latest" });
```

### Multi-Chain Support
```typescript
import { getPublicClient } from "./config/client";
import { getChain } from "./config/chains";

// Get Ethereum client
const ethClient = getPublicClient(1);
const ethChain = getChain(1);

// Get Base client
const baseClient = getPublicClient(8453);
const baseChain = getChain(8453);
```

### Reading Contracts
```typescript
import { getPublicClient } from "./config/client";

const client = getPublicClient();

const result = await client.readContract({
  address: "0x...",
  abi: OPTION_ABI,
  functionName: "balanceOf",
  args: ["0x..."],
});
```

### Sending Transactions
```typescript
import { getWalletClient } from "./config/client";

const wallet = getWalletClient();

const hash = await wallet.writeContract({
  address: "0x...",
  abi: OPTION_ABI,
  functionName: "mint",
  args: [1000000n],
});
```

## Environment Variables

### Required
```bash
# Default chain (1 = Ethereum, 8453 = Base, etc.)
CHAIN_ID=1
```

### Optional RPC Overrides
```bash
# Override any chain's RPC URL
RPC_ETHEREUM=https://eth.drpc.org
RPC_BASE=https://mainnet.base.org
RPC_ARBITRUM=https://arb1.arbitrum.io/rpc
RPC_UNICHAIN=https://mainnet.unichain.org
```

### For Wallet Client
```bash
# Required for sending transactions
PRIVATE_KEY=0x...
```

## Adding New Chains

1. Add to `chains.ts`:
```typescript
export const CHAINS: Record<number, ChainConfig> = {
  // ...
  1329: {
    id: 1329,
    name: "Sei Network",
    rpcUrl: process.env.RPC_SEI || "https://evm-rpc.sei-apis.com",
    blockExplorer: "https://seistream.app",
    nativeCurrency: { name: "Sei", symbol: "SEI", decimals: 18 },
    priceFeed: {},
  },
};
```

2. Add token configs to `tokens.ts`
3. Add option deployments to `options.ts`
4. Use existing client factory - no changes needed! ✅

## Migration Checklist

When adding RPC calls to new code:

- [ ] Import from `./config/client` (not `viem` directly)
- [ ] Use `getPublicClient()` for reads
- [ ] Use `getWalletClient()` for writes
- [ ] Use `getCurrentChainId()` to get chain ID
- [ ] Use `getChain(chainId)` for chain metadata
- [ ] Never hardcode RPC URLs

## Testing

```typescript
import { getPublicClient, resetClients } from "./config/client";

// Reset before each test
beforeEach(() => {
  resetClients();
});

// Test with specific chain
test("reads from Base", async () => {
  process.env.CHAIN_ID = "8453";
  const client = getPublicClient();
  // ... assertions
});
```
