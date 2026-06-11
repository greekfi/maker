"""Token registry per chain. Mirrors node config/tokens.ts."""

from dataclasses import dataclass


@dataclass(frozen=True)
class TokenConfig:
    address: str
    symbol: str
    decimals: int
    name: str


TOKENS: dict[int, dict[str, TokenConfig]] = {
    # === ETHEREUM MAINNET ===
    1: {
        "WETH": TokenConfig(
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "WETH", 18, "Wrapped Ether"
        ),
        "USDC": TokenConfig("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "USDC", 6, "USD Coin"),
        "USDT": TokenConfig("0xdAC17F958D2ee523a2206206994597C13D831ec7", "USDT", 6, "Tether USD"),
        "DAI": TokenConfig(
            "0x6B175474E89094C44Da98b954EescdeCB5BBCFA0", "DAI", 18, "Dai Stablecoin"
        ),
        "WBTC": TokenConfig("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", "WBTC", 8, "Wrapped BTC"),
        "cbBTC": TokenConfig(
            "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", "cbBTC", 8, "Coinbase Wrapped BTC"
        ),
    },
    # === BASE MAINNET ===
    8453: {
        "WETH": TokenConfig(
            "0x4200000000000000000000000000000000000006", "WETH", 18, "Wrapped Ether"
        ),
        "USDC": TokenConfig("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "USDC", 6, "USD Coin"),
        "USDbC": TokenConfig(
            "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", "USDbC", 6, "USD Base Coin (Bridged)"
        ),
        "cbETH": TokenConfig(
            "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", "cbETH", 18, "Coinbase Wrapped Staked ETH"
        ),
        "cbBTC": TokenConfig(
            "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", "cbBTC", 8, "Coinbase Wrapped BTC"
        ),
    },
    # === ARBITRUM ONE ===
    42161: {
        "WETH": TokenConfig(
            "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "WETH", 18, "Wrapped Ether"
        ),
        "USDC": TokenConfig("0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "USDC", 6, "USD Coin"),
        "USDC.e": TokenConfig(
            "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", "USDC.e", 6, "USD Coin (Bridged)"
        ),
        "ARB": TokenConfig("0x912CE59144191C1204E64559FE8253a0e49E6548", "ARB", 18, "Arbitrum"),
        "WBTC": TokenConfig("0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", "WBTC", 8, "Wrapped BTC"),
        "USDT": TokenConfig("0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", "USDT", 6, "Tether USD"),
    },
    # === UNICHAIN MAINNET ===
    130: {
        "WETH": TokenConfig(
            "0x4200000000000000000000000000000000000006", "WETH", 18, "Wrapped Ether"
        ),
        "USDC": TokenConfig("0x078D888E40faAe0f32594342c85940AF0b45DA6D", "USDC", 6, "USD Coin"),
    },
    # === SEPOLIA TESTNET ===
    11155111: {
        "WETH": TokenConfig(
            "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", "WETH", 18, "Wrapped Ether"
        ),
        "USDC": TokenConfig("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", "USDC", 6, "USD Coin"),
    },
    # === BASE SEPOLIA ===
    84532: {
        "WETH": TokenConfig(
            "0x4200000000000000000000000000000000000006", "WETH", 18, "Wrapped Ether"
        ),
        "USDC": TokenConfig("0x036CbD53842c5426634e7929541eC2318f3dCF7e", "USDC", 6, "USD Coin"),
    },
    # === UNICHAIN SEPOLIA ===
    1301: {
        "WETH": TokenConfig(
            "0x4200000000000000000000000000000000000006", "WETH", 18, "Wrapped Ether"
        ),
        "USDC": TokenConfig("0x31d0220469e10c4E71834a79b1f276d740d3768F", "USDC", 6, "USD Coin"),
    },
}


def get_token(chain_id: int, symbol: str) -> TokenConfig:
    chain_tokens = TOKENS.get(chain_id)
    if chain_tokens is None:
        msg = f"No tokens configured for chain {chain_id}"
        raise KeyError(msg)
    token = chain_tokens.get(symbol)
    if token is None:
        msg = f"Token {symbol} not found on chain {chain_id}"
        raise KeyError(msg)
    return token


def get_token_by_address(chain_id: int, address: str) -> TokenConfig | None:
    chain_tokens = TOKENS.get(chain_id)
    if chain_tokens is None:
        return None
    lower = address.lower()
    for token in chain_tokens.values():
        if token.address.lower() == lower:
            return token
    return None
