# Market-Maker Architecture

## 🎯 Centralized Configuration System

All blockchain interactions flow through a centralized configuration layer that ensures consistency and maintainability.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                       │
│  (bebop.ts, direct.ts, relay.ts, fetch-metadata.ts)        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Config Layer (src/config/)                 │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  client.ts   │◄───│  chains.ts   │    │ metadata.ts  │ │
│  │              │    │              │    │              │ │
│  │ • getPublic  │    │ • RPC URLs   │    │ • Load/Save  │ │
│  │   Client()   │    │ • Chain info │    │ • Fetch from │ │
│  │ • getWallet  │    │ • Env vars   │    │   chain      │ │
│  │   Client()   │    │              │    │              │ │
│  └──────┬───────┘    └──────────────┘    └──────────────┘ │
│         │                                                   │
│         │  Single source of truth for ALL RPC calls        │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Blockchain (via RPC)                      │
│                                                              │
│     Ethereum (https://eth.drpc.org)                         │
│     Base, Arbitrum, Unichain, etc.                          │
└─────────────────────────────────────────────────────────────┘
```

## Configuration Hierarchy

### 1. Chain Configuration (`chains.ts`)
**Single source of truth for chain settings**

```typescript
export const CHAINS: Record<number, ChainConfig> = {
  1: {
    id: 1,
    name: "Ethereum",
    rpcUrl: process.env.RPC_ETHEREUM || "https://eth.drpc.org",  // ← Centralized!
    blockExplorer: "https://etherscan.io",
    priceFeed: {
      ethUsd: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    },
  },
  // ... other chains
};
```

### 2. RPC Client Factory (`client.ts`)
**Single source of truth for RPC clients**

```typescript
// ✅ CORRECT: Use centralized client
import { getPublicClient } from "./config/client";
const client = getPublicClient();

// ❌ WRONG: Don't create clients directly
import { createPublicClient, http } from "viem";
const client = createPublicClient({ ... });
```

### 3. Environment Variables (`.env`)
**Runtime configuration overrides**

```bash
# Chain selection
CHAIN_ID=1

# RPC URL override (optional)
RPC_ETHEREUM=https://eth.drpc.org

# Wallet (for transactions)
PRIVATE_KEY=0x...
```

## Data Flow

### Reading Blockchain Data
```
1. Application calls getPublicClient()
2. Client factory checks CHAIN_ID env var
3. Client factory looks up chain config
4. Chain config returns RPC URL (with env override)
5. Client created with correct RPC URL
6. Client is cached (singleton pattern)
7. Application uses client to read data
```

### Writing to Blockchain
```
1. Application calls getWalletClient()
2. Same flow as above, plus:
3. Account created from PRIVATE_KEY
4. Wallet client ready for transactions
```

## File Structure

```
market-maker/
├── src/
│   ├── config/                 # 🎯 Configuration layer
│   │   ├── client.ts          # RPC client factory (USE THIS!)
│   │   ├── chains.ts          # Chain configurations
│   │   ├── tokens.ts          # Token addresses
│   │   ├── options.ts         # Option deployments
│   │   ├── metadata.ts        # Option metadata
│   │   ├── index.ts           # Barrel exports
│   │   └── README.md          # Config documentation
│   │
│   ├── pricing/               # Pricing engine
│   │   ├── pricer.ts
│   │   ├── blackScholes.ts
│   │   └── spotFeed.ts
│   │
│   ├── servers/               # API servers
│   │   ├── httpApi.ts
│   │   ├── wsStream.ts
│   │   └── wsRelay.ts
│   │
│   ├── modes/                 # Service modes
│   │   ├── direct.ts
│   │   ├── bebop.ts
│   │   └── relay.ts
│   │
│   ├── bebop.ts              # Entry point: Bebop RFQ
│   ├── direct.ts             # Entry point: Direct quotes
│   └── relay.ts              # Entry point: Price relay
│
├── scripts/
│   └── fetch-metadata.ts     # Metadata fetcher
│
├── data/                      # Cached data
│   └── metadata-{chainId}.json
│
├── .env                       # Environment config
└── .env.example              # Example config
```

## Usage Patterns

### Basic RPC Call
```typescript
import { getPublicClient } from "./config/client";

const client = getPublicClient();
const balance = await client.getBalance({
  address: "0x...",
});
```

### Reading Contracts
```typescript
import { getPublicClient } from "./config/client";

const client = getPublicClient();
const result = await client.readContract({
  address: optionAddress,
  abi: OPTION_ABI,
  functionName: "balanceOf",
  args: [userAddress],
});
```

### Getting Chain Info
```typescript
import { getChain, getCurrentChainId } from "./config";

const chainId = getCurrentChainId();  // From CHAIN_ID env var
const chain = getChain(chainId);      // Get full config

console.log(`Connected to ${chain.name}`);
console.log(`RPC: ${chain.rpcUrl}`);
console.log(`Explorer: ${chain.blockExplorer}`);
```

### Multi-Chain Support
```typescript
import { getPublicClient, getChain } from "./config";

// Ethereum
const ethClient = getPublicClient(1);
const ethChain = getChain(1);

// Base
const baseClient = getPublicClient(8453);
const baseChain = getChain(8453);
```

## Environment Configuration

### Development (.env)
```bash
CHAIN_ID=1
RPC_ETHEREUM=https://eth.drpc.org
MAKER_ADDRESS=0x...
PRIVATE_KEY=0x...
```

### Production (.env.production)
```bash
CHAIN_ID=1
RPC_ETHEREUM=https://your-production-rpc.com
MAKER_ADDRESS=0x...
PRIVATE_KEY=0x...
```

### Testing (.env.test)
```bash
CHAIN_ID=31337  # Anvil local
MAKER_ADDRESS=0x...
PRIVATE_KEY=0x...
```

## Benefits of Centralized Config

✅ **Single Source of Truth**
- All RPC URLs defined in one place
- No hardcoded endpoints scattered in code

✅ **Easy Chain Switching**
- Change `CHAIN_ID=1` → `CHAIN_ID=8453` to switch chains
- All code automatically uses correct RPC

✅ **Efficient**
- Singleton clients (reused, not recreated)
- Lazy initialization (created only when needed)

✅ **Maintainable**
- Add new chain? Update `chains.ts` only
- Change RPC? Update `.env` only
- No code changes required

✅ **Type-Safe**
- Full TypeScript support
- Viem integration

✅ **Observable**
- Centralized logging of RPC connections
- Easy to monitor which RPCs are being used

## Adding a New Chain

1. **Add chain config** (`src/config/chains.ts`):
```typescript
137: {
  id: 137,
  name: "Polygon",
  rpcUrl: process.env.RPC_POLYGON || "https://polygon-rpc.com",
  blockExplorer: "https://polygonscan.com",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  priceFeed: {
    ethUsd: "0x...",  // Chainlink feed address
  },
},
```

2. **Add env var** (`.env.example`):
```bash
# RPC_POLYGON=https://polygon-rpc.com
```

3. **Done!** All existing code works automatically.

## Migration Checklist

For any new code that needs RPC access:

- [ ] Import from `./config/client`, not `viem` directly
- [ ] Use `getPublicClient()` for reads
- [ ] Use `getWalletClient()` for writes
- [ ] Use `getCurrentChainId()` to get chain ID
- [ ] Use `getChain()` for chain metadata
- [ ] Never hardcode RPC URLs
- [ ] Never create clients directly with `createPublicClient()`

## Testing

```typescript
import { getPublicClient, resetClients } from "./config/client";

describe("Option Metadata", () => {
  beforeEach(() => {
    resetClients();  // Reset singleton between tests
  });

  it("fetches from Ethereum", async () => {
    process.env.CHAIN_ID = "1";
    const client = getPublicClient();
    // ... test
  });

  it("fetches from Base", async () => {
    process.env.CHAIN_ID = "8453";
    const client = getPublicClient();
    // ... test
  });
});
```

## Troubleshooting

### Client using wrong RPC?
Check the logs:
```
[RPC Client] Creating public client for Ethereum (chainId: 1)
[RPC Client] RPC URL: https://eth.drpc.org
```

### Need to force new chain?
```typescript
import { resetClients } from "./config/client";

process.env.CHAIN_ID = "8453";
resetClients();  // Force recreation
const client = getPublicClient();  // Now uses Base
```

### Want to override RPC temporarily?
```bash
RPC_ETHEREUM=https://different-rpc.com yarn bebop
```

## Summary

🎯 **One rule**: Always use `getPublicClient()` / `getWalletClient()` from `./config/client`

Everything else (RPC URLs, chain switching, env vars) is handled automatically by the centralized configuration layer.
