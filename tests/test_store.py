import pytest

from greek_mm.events import store


@pytest.fixture(autouse=True)
def clean_store():
    store.clear()
    yield
    store.clear()


def _event(tx: str, log_index: int, option: str = "0x" + "ab" * 20) -> dict:
    return {
        "blockNumber": "100",
        "txHash": tx,
        "logIndex": log_index,
        "args": {
            "collateral": "0x" + "01" * 20,
            "consideration": "0x" + "02" * 20,
            "expirationDate": 1750000000,
            "strike": str(3000 * 10**18),
            "isPut": False,
            "isEuro": False,
            "windowSeconds": 28800,
            "option": option,
            "receipt": "0x" + "03" * 20,
        },
    }


def test_append_dedups_by_tx_and_log_index() -> None:
    added = store.append_events(8453, [_event("0xt1", 0), _event("0xt1", 0)], 100)
    assert added == 1
    # Overlapping rescan: same event again, plus one new.
    added = store.append_events(8453, [_event("0xt1", 0), _event("0xt1", 1)], 110)
    assert added == 1
    assert len(store.get_events(8453)) == 2
    assert store.get_chain_state(8453).last_block == 110


def test_find_by_option_case_insensitive() -> None:
    option = "0x" + "AB" * 20
    store.append_events(8453, [_event("0xt1", 0, option)], 100)
    assert store.find_by_option(8453, option.lower()) is not None
    assert store.find_by_option(8453, "0x" + "ff" * 20) is None
    assert store.find_by_option(1, option) is None  # wrong chain


def test_summary_shape() -> None:
    store.append_events(8453, [_event("0xt1", 0)], 100)
    summary = store.summary()
    assert summary == [
        {"chainId": 8453, "events": 1, "lastBlock": "100", "syncedAt": summary[0]["syncedAt"]}
    ]
    assert summary[0]["syncedAt"] is not None
