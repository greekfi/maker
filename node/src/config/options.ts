// market-maker/src/config/options.ts
//
// Factory addresses + deployment blocks come from `factories.json` — generated
// in the protocol repo by `generateTsAbis.js` after every deploy and copied
// into this repo's Docker context at build time. Adding a new chain doesn't
// require editing this file.

import factoriesJson from "../../factories.json" with { type: "json" };

export interface OptionDeployment {
  factory: string;
  /** First block with the factory — starting point for OptionCreated scans. */
  deploymentBlock?: number;
  /** Optional pre-seeded list; dynamic discovery from the factory takes precedence. */
  options: string[];
}

interface FactoryEntry {
  name: string;
  factory: string;
  deploymentBlock: number;
}

const FACTORIES = factoriesJson as Record<string, FactoryEntry>;

export const OPTIONS: Record<number, OptionDeployment> = Object.fromEntries(
  Object.entries(FACTORIES).map(([chainId, entry]) => [
    parseInt(chainId, 10),
    {
      factory: entry.factory,
      deploymentBlock: entry.deploymentBlock,
      options: [],
    },
  ]),
);

export function getDeploymentBlock(chainId: number): number {
  return OPTIONS[chainId]?.deploymentBlock ?? 0;
}

export function getOptionFactory(chainId: number): string {
  const deployment = OPTIONS[chainId];
  if (!deployment) throw new Error(`No options deployed on chain ${chainId}`);
  return deployment.factory;
}

export function getOptionAddresses(chainId: number): string[] {
  return OPTIONS[chainId]?.options ?? [];
}

export function isOptionToken(chainId: number, address: string): boolean {
  const options = getOptionAddresses(chainId);
  return options.some((o) => o.toLowerCase() === address.toLowerCase());
}
