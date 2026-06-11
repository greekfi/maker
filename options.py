"""Get option info from chain: read OptionCreated events from the factory."""

from dataclasses import dataclass

from eth_abi import decode as abi_decode
from eth_utils import keccak, to_checksum_address
from web3 import AsyncWeb3

_TOPIC0 = "0x" + keccak(
    text="OptionCreated(address,address,uint40,uint96,bool,bool,uint40,address,address)"
).hex()
# non-indexed event args, in order
_DATA_TYPES = ["uint40", "uint96", "bool", "bool", "uint40", "address"]
_DECIMALS_ABI = [
    {
        "name": "decimals",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "uint8"}],
    }
]


@dataclass(frozen=True)
class Option:
    address: str  # the option ERC20
    collateral: str
    consideration: str
    strike: float  # human-readable (consideration per collateral)
    expiry: int  # unix seconds
    is_put: bool
    is_euro: bool
    window_seconds: int
    decimals: int  # option token decimals


def _addr(topic_or_bytes) -> str:
    return to_checksum_address(bytes(topic_or_bytes)[-20:])


async def fetch_options(
    w3: AsyncWeb3, factory: str, from_block: int, chunk: int = 10_000
) -> list[Option]:
    """Walk OptionCreated logs from `from_block` to head and return options."""
    head = await w3.eth.block_number
    logs = []
    start = from_block
    while start <= head:
        end = min(start + chunk - 1, head)
        logs += await w3.eth.get_logs(
            {"address": to_checksum_address(factory), "topics": [_TOPIC0],
             "fromBlock": start, "toBlock": end}
        )
        start = end + 1

    options = []
    for log in logs:
        expiry, strike_raw, is_put, is_euro, window, _receipt = abi_decode(
            _DATA_TYPES, bytes(log["data"])
        )
        strike = int(strike_raw) / 10**18
        if is_put and strike > 0:  # contract stores 1/strike for puts
            strike = 1 / strike
        address = _addr(log["topics"][3])
        options.append(
            Option(
                address=address,
                collateral=_addr(log["topics"][1]),
                consideration=_addr(log["topics"][2]),
                strike=strike,
                expiry=int(expiry),
                is_put=bool(is_put),
                is_euro=bool(is_euro),
                window_seconds=int(window),
                decimals=await _decimals(w3, address),
            )
        )
    return options


async def _decimals(w3: AsyncWeb3, address: str) -> int:
    try:
        c = w3.eth.contract(address=to_checksum_address(address), abi=_DECIMALS_ABI)
        return int(await c.functions.decimals().call())
    except Exception:  # noqa: BLE001 — default to 18 if the read fails
        return 18
