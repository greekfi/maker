// market-maker/src/config/chains.ts

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  // Price feed contracts (Chainlink or Uniswap TWAP)
  priceFeed: {
    ethUsd?: string;       // Chainlink ETH/USD
    uniV3Pool?: string;    // Uniswap V3 pool for TWAP
  };
}

export const CHAINS: Record<number, ChainConfig> = {
  // === MAINNETS ===
  1: {
    id: 1,
    name: "Ethereum",
    rpcUrl: process.env.RPC_ETHEREUM || "https://eth.drpc.org",
    blockExplorer: "https://etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    priceFeed: {
      ethUsd: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",  // Chainlink ETH/USD
    },
  },
  8453: {
    id: 8453,
    name: "Base",
    rpcUrl: process.env.RPC_BASE || "https://mainnet.base.org",
    blockExplorer: "https://basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    priceFeed: {
      ethUsd: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",  // Chainlink ETH/USD on Base
    },
  },
  42161: {
    id: 42161,
    name: "Arbitrum One",
    rpcUrl: process.env.RPC_ARBITRUM || "https://arb1.arbitrum.io/rpc",
    blockExplorer: "https://arbiscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    priceFeed: {
      ethUsd: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",  // Chainlink ETH/USD on Arbitrum
    },
  },
  10: {
    id: 10,
    name: "Optimism",
    rpcUrl: process.env.RPC_OPTIMISM || "https://mainnet.optimism.io",
    blockExplorer: "https://optimistic.etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    priceFeed: {
      ethUsd: "0x13e3Ee699D1909E989722E753853AE30b17e08c5",  // Chainlink ETH/USD on Optimism
    },
  },
  130: {
    id: 130,
    name: "Unichain",
    rpcUrl: process.env.RPC_UNICHAIN || "https://mainnet.unichain.org",
    blockExplorer: "https://uniscan.xyz",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    priceFeed: {
      uniV3Pool: "0x...",  // WETH/USDC pool for TWAP (TBD)
    },
  },
  57073: {
    id: 57073,
    name: "Ink",
    rpcUrl: process.env.RPC_INK || "https://rpc-gel.inkonchain.com",
    blockExplorer: "https://explorer.inkonchain.com",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    priceFeed: {},  // No Chainlink on Ink yet — relies on configured fallback
  },

  // === TESTNETS ===
  11155111: {
    id: 11155111,
    name: "Sepolia",
    rpcUrl: process.env.RPC_SEPOLIA || "https://rpc.sepolia.org",
    blockExplorer: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    priceFeed: {
      ethUsd: "0x694AA1769357215DE4FAC081bf1f309aDC325306",  // Chainlink ETH/USD Sepolia
    },
  },
  84532: {
    id: 84532,
    name: "Base Sepolia",
    rpcUrl: process.env.RPC_BASE_SEPOLIA || "https://sepolia.base.org",
    blockExplorer: "https://sepolia.basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    priceFeed: {
      ethUsd: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1",  // Chainlink ETH/USD Base Sepolia
    },
  },
  1301: {
    id: 1301,
    name: "Unichain Sepolia",
    rpcUrl: process.env.RPC_UNICHAIN_SEPOLIA || "https://sepolia.unichain.org",
    blockExplorer: "https://sepolia.uniscan.xyz",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    priceFeed: {},  // No Chainlink on testnet - use fallback
  },
  31337: {
    id: 31337,
    name: "Anvil (Local)",
    rpcUrl: "http://127.0.0.1:8545",
    blockExplorer: "",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    priceFeed: {},  // Mock in tests
  },
};

export function getChain(chainId: number): ChainConfig {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Unknown chain ID: ${chainId}`);
  return chain;
}

export function getChainByName(name: string): ChainConfig | undefined {
  return Object.values(CHAINS).find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
}
