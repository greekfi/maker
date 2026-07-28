/**
 * Centralized RPC Client Factory
 *
 * Single source of truth for creating viem clients.
 * All RPC calls in the codebase should use clients from this module.
 */

import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Chain } from "viem";
import * as chains from "viem/chains";
import { getChain as getChainConfig } from "./chains";
import { privateKeyToAccount } from "viem/accounts";

// Singleton clients (lazy-initialized)
let _publicClient: PublicClient | null = null;
let _walletClient: WalletClient | null = null;
let _currentChainId: number | null = null;

/**
 * Get the viem chain object from chain ID
 */
function getViemChain(chainId: number): Chain {
  const chain = Object.values(chains).find(
    (c) => typeof c === "object" && c !== null && "id" in c && c.id === chainId,
  ) as Chain | undefined;
  return chain ?? chains.mainnet;
}

/**
 * Get or create a public client for the current chain
 *
 * @param chainId Optional chain ID (defaults to CHAIN_ID env var)
 * @returns Public client for reading blockchain data
 */
export function getPublicClient(chainId?: number): PublicClient {
  const targetChainId = chainId ?? (process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 1);

  // Re-create client if chain changed
  if (_publicClient && _currentChainId !== targetChainId) {
    _publicClient = null;
  }

  if (!_publicClient) {
    const chainConfig = getChainConfig(targetChainId);
    const viemChain = getViemChain(targetChainId);

    console.log(`[RPC Client] Creating public client for ${chainConfig.name} (chainId: ${targetChainId})`);
    console.log(`[RPC Client] RPC URL: ${chainConfig.rpcUrl}`);

    _publicClient = createPublicClient({
      chain: viemChain,
      transport: http(chainConfig.rpcUrl),
    });

    _currentChainId = targetChainId;
  }

  return _publicClient;
}

/**
 * Get or create a wallet client for the current chain
 *
 * Requires PRIVATE_KEY environment variable.
 *
 * @param chainId Optional chain ID (defaults to CHAIN_ID env var)
 * @returns Wallet client for sending transactions
 */
export function getWalletClient(chainId?: number): WalletClient {
  const targetChainId = chainId ?? (process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 1);

  // Re-create client if chain changed
  if (_walletClient && _currentChainId !== targetChainId) {
    _walletClient = null;
  }

  if (!_walletClient) {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY environment variable is required for wallet client");
    }

    const chainConfig = getChainConfig(targetChainId);
    const viemChain = getViemChain(targetChainId);
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    console.log(`[RPC Client] Creating wallet client for ${chainConfig.name} (chainId: ${targetChainId})`);
    console.log(`[RPC Client] Account: ${account.address}`);

    _walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport: http(chainConfig.rpcUrl),
    });

    _currentChainId = targetChainId;
  }

  return _walletClient;
}

/**
 * Reset clients (useful for testing or chain switching)
 */
export function resetClients(): void {
  _publicClient = null;
  _walletClient = null;
  _currentChainId = null;
}

/**
 * Get the currently configured chain ID
 */
export function getCurrentChainId(): number {
  return process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 1;
}
