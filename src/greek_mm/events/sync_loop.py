"""In-process OptionCreated sync: chunked getLogs walk per chain, 30s tick.

Sequential async loop means a slow tick can never overlap the next one —
slow RPC just delays the next pass (same property as node's chained
setTimeout).
"""

import asyncio
import logging
import os
from collections.abc import Awaitable, Callable

from eth_abi import decode as abi_decode
from eth_utils import keccak, to_checksum_address

from greek_mm.config.clients import get_w3
from greek_mm.config.options import OPTIONS
from greek_mm.events import store

log = logging.getLogger(__name__)

# event OptionCreated(address indexed collateral, address indexed consideration,
#   uint40 expirationDate, uint96 strike, bool isPut, bool isEuro,
#   uint40 windowSeconds, address indexed option, address receipt)
_TOPIC0 = (
    "0x"
    + keccak(
        text="OptionCreated(address,address,uint40,uint96,bool,bool,uint40,address,address)"
    ).hex()
)
_DATA_TYPES = ["uint40", "uint96", "bool", "bool", "uint40", "address"]

# Per-call getLogs block-range cap; 10k matches Base's strict public cap.
LOG_CHUNK_SIZE = int(os.environ.get("LOG_CHUNK_SIZE", "10000"))
SYNC_INTERVAL = int(os.environ.get("SYNC_INTERVAL_MS", "30000")) / 1000
RETRY_BASE_S = 0.5
CHUNK_PAUSE_S = int(os.environ.get("LOG_CHUNK_PAUSE_MS", "100")) / 1000

OnNewEvents = Callable[[int, list[dict]], Awaitable[None]]


async def _with_retry(label: str, fn: Callable[[], Awaitable], attempts: int = 5):
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            return await fn()
        except Exception as err:
            last_err = err
            wait = RETRY_BASE_S * (i + 1) * (i + 1)
            log.warning(
                "[sync] %s attempt %d/%d failed: %s — retrying in %.1fs",
                label,
                i + 1,
                attempts,
                str(err).split("\n")[0],
                wait,
            )
            await asyncio.sleep(wait)
    raise last_err  # type: ignore[misc]


def _topic_to_address(topic: bytes | str) -> str:
    raw = topic.hex() if isinstance(topic, bytes) else topic.removeprefix("0x")
    return to_checksum_address("0x" + raw[-40:])


def _to_event(raw_log: dict) -> dict:
    topics = raw_log["topics"]
    data = raw_log["data"]
    data_bytes = (
        bytes(data) if not isinstance(data, str) else bytes.fromhex(data.removeprefix("0x"))
    )
    expiration, strike, is_put, is_euro, window_seconds, receipt = abi_decode(
        _DATA_TYPES, data_bytes
    )
    tx_hash = raw_log["transactionHash"]
    return {
        "blockNumber": str(int(raw_log["blockNumber"])),
        "txHash": tx_hash.to_0x_hex() if hasattr(tx_hash, "to_0x_hex") else str(tx_hash),
        "logIndex": int(raw_log["logIndex"]),
        "args": {
            "collateral": _topic_to_address(topics[1]),
            "consideration": _topic_to_address(topics[2]),
            "expirationDate": int(expiration),
            "strike": str(strike),
            "isPut": bool(is_put),
            "isEuro": bool(is_euro),
            "windowSeconds": int(window_seconds),
            "option": _topic_to_address(topics[3]),
            "receipt": to_checksum_address(receipt),
        },
    }


async def sync_chain(chain_id: int) -> list[dict]:
    """One pass: walk getLogs from lastBlock+1 (or deploymentBlock) to head."""
    deployment = OPTIONS.get(chain_id)
    if deployment is None:
        return []

    w3 = get_w3(chain_id)
    factory = to_checksum_address(deployment.factory)
    head = int(await _with_retry(f"chain {chain_id} blockNumber", lambda: w3.eth.block_number))

    state = store.get_chain_state(chain_id)
    from_start = (
        state.last_block + 1 if state and state.last_block >= 0 else deployment.deployment_block
    )
    if from_start > head:
        return []

    fresh: list[dict] = []
    start = from_start
    while start <= head:
        end = min(start + LOG_CHUNK_SIZE - 1, head)
        logs = await _with_retry(
            f"chain {chain_id} getLogs {start}-{end}",
            lambda s=start, e=end: w3.eth.get_logs(
                {"address": factory, "topics": [_TOPIC0], "fromBlock": s, "toBlock": e}
            ),
        )
        fresh.extend(_to_event(raw) for raw in logs)
        if CHUNK_PAUSE_S > 0 and end < head:
            await asyncio.sleep(CHUNK_PAUSE_S)
        start = end + 1

    added = store.append_events(chain_id, fresh, head)
    return fresh[len(fresh) - added :] if added else []


async def run_sync_loop(
    chain_ids: list[int] | None = None,
    on_new_events: OnNewEvents | None = None,
    interval: float | None = None,
) -> None:
    """Recurring sync across chains. Cancel the task to stop."""
    ids = chain_ids if chain_ids is not None else list(OPTIONS.keys())
    tick_interval = interval if interval is not None else SYNC_INTERVAL

    async def tick_chain(chain_id: int) -> None:
        try:
            new_events = await sync_chain(chain_id)
            if new_events:
                log.info("[sync] chain %s: +%d events", chain_id, len(new_events))
                if on_new_events is not None:
                    await on_new_events(chain_id, new_events)
        except Exception as err:
            log.warning("[sync] chain %s failed: %s", chain_id, err)

    while True:
        await asyncio.gather(*(tick_chain(chain_id) for chain_id in ids))
        await asyncio.sleep(tick_interval)
