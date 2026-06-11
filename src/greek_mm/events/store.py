"""In-memory OptionCreated store, per chain.

Same trade-off as the node version: the MM is always-on, event volume is
tiny, and a cold boot refills from deploymentBlock in seconds. Event dicts
keep the node JSON shape (camelCase args) so /events stays byte-compatible.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass
class ChainState:
    last_block: int = -1  # last block scanned (inclusive); -1 until first tick
    events: list[dict] = field(default_factory=list)
    synced_at: str = ""


_state: dict[int, ChainState] = {}


def get_chain_state(chain_id: int) -> ChainState | None:
    return _state.get(chain_id)


def get_events(chain_id: int) -> list[dict]:
    state = _state.get(chain_id)
    return state.events if state else []


def find_by_option(chain_id: int, option_address: str) -> dict | None:
    lower = option_address.lower()
    for event in get_events(chain_id):
        if event["args"]["option"].lower() == lower:
            return event
    return None


def append_events(chain_id: int, new_events: list[dict], new_last_block: int) -> int:
    """Append a sync tick's events, dedup'd by (txHash, logIndex). Returns count added."""
    state = _state.setdefault(chain_id, ChainState())
    seen = {(e["txHash"], e["logIndex"]) for e in state.events}

    added = 0
    for event in new_events:
        key = (event["txHash"], event["logIndex"])
        if key in seen:
            continue
        seen.add(key)
        state.events.append(event)
        added += 1

    state.last_block = new_last_block
    state.synced_at = datetime.now(UTC).isoformat()
    return added


def summary() -> list[dict]:
    return [
        {
            "chainId": chain_id,
            "events": len(s.events),
            "lastBlock": str(s.last_block) if s.last_block >= 0 else None,
            "syncedAt": s.synced_at or None,
        }
        for chain_id, s in _state.items()
    ]


def clear() -> None:
    """Test helper."""
    _state.clear()
