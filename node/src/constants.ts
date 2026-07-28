// USDC addresses by chain ID
export const USDC_ADDRESSES: Record<number, string> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",      // Ethereum Mainnet
  130: "0x078d782b760474a361dda0af3839290b0ef57ad6",    // Unichain
  1301: "0x078d782b760474a361dda0af3839290b0ef57ad6",  // Unichain Sepolia
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // Base
};

// Bebop chain name mapping
export const CHAIN_NAMES: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  56: "bnb",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
  43114: "avalanche",
  59144: "linea",
  81457: "blast",
  534352: "scroll",
  1301: "unichain",
};

// Get USDC address for current chain (defaults to mainnet if not found)
export function getUSDCAddress(chainId: number = 1): string {
  return USDC_ADDRESSES[chainId] || USDC_ADDRESSES[1];
}

// Get Bebop chain name for given chain ID
export function getChainName(chainId: number): string | undefined {
  return CHAIN_NAMES[chainId];
}
