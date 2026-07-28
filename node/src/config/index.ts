/**
 * Configuration Barrel Export
 *
 * Centralized imports for all config modules.
 */

// RPC Clients (use these for ALL blockchain interactions)
export { getPublicClient, getWalletClient, resetClients, getCurrentChainId } from "./client";

// Chain Configuration
export { getChain, getChainByName, CHAINS, type ChainConfig } from "./chains";

// Token Configuration
export { getToken, getTokenByAddress, TOKENS, type TokenConfig } from "./tokens";

// Option Deployments
export { getOptionFactory, getOptionAddresses, isOptionToken, OPTIONS, type OptionDeployment } from "./options";

// Option Metadata
export {
  fetchOptionMetadata,
  fetchAllOptionMetadata,
  loadMetadataFromFile,
  getOptionMetadata,
  type OptionMetadata,
} from "./metadata";
