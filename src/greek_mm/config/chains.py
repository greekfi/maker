"""Chain configs. RPC URLs are env-overridable, mirroring node config/chains.ts."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ChainConfig:
    id: int
    name: str
    rpc_url: str
    block_explorer: str = ""


CHAINS: dict[int, ChainConfig] = {
    # === MAINNETS ===
    1: ChainConfig(
        id=1,
        name="Ethereum",
        rpc_url=os.environ.get("RPC_ETHEREUM", "https://eth.drpc.org"),
        block_explorer="https://etherscan.io",
    ),
    8453: ChainConfig(
        id=8453,
        name="Base",
        rpc_url=os.environ.get("RPC_BASE", "https://mainnet.base.org"),
        block_explorer="https://basescan.org",
    ),
    42161: ChainConfig(
        id=42161,
        name="Arbitrum One",
        rpc_url=os.environ.get("RPC_ARBITRUM", "https://arb1.arbitrum.io/rpc"),
        block_explorer="https://arbiscan.io",
    ),
    130: ChainConfig(
        id=130,
        name="Unichain",
        rpc_url=os.environ.get("RPC_UNICHAIN", "https://mainnet.unichain.org"),
        block_explorer="https://uniscan.xyz",
    ),
    57073: ChainConfig(
        id=57073,
        name="Ink",
        rpc_url=os.environ.get("RPC_INK", "https://rpc-gel.inkonchain.com"),
        block_explorer="https://explorer.inkonchain.com",
    ),
    # === TESTNETS ===
    11155111: ChainConfig(
        id=11155111,
        name="Sepolia",
        rpc_url=os.environ.get("RPC_SEPOLIA", "https://rpc.sepolia.org"),
        block_explorer="https://sepolia.etherscan.io",
    ),
    84532: ChainConfig(
        id=84532,
        name="Base Sepolia",
        rpc_url=os.environ.get("RPC_BASE_SEPOLIA", "https://sepolia.base.org"),
        block_explorer="https://sepolia.basescan.org",
    ),
    1301: ChainConfig(
        id=1301,
        name="Unichain Sepolia",
        rpc_url=os.environ.get("RPC_UNICHAIN_SEPOLIA", "https://sepolia.unichain.org"),
        block_explorer="https://sepolia.uniscan.xyz",
    ),
    31337: ChainConfig(
        id=31337,
        name="Anvil (Local)",
        rpc_url="http://127.0.0.1:8545",
    ),
}


def get_chain(chain_id: int) -> ChainConfig:
    chain = CHAINS.get(chain_id)
    if chain is None:
        msg = f"Unknown chain ID: {chain_id}"
        raise KeyError(msg)
    return chain
