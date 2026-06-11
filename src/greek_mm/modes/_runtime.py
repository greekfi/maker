"""Shared mode plumbing: .env loading, logging, signal-aware run()."""

import asyncio
import contextlib
import logging
import os
import signal
from collections.abc import Awaitable, Callable

from dotenv import load_dotenv


def bootstrap() -> None:
    load_dotenv()
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def run(main: Callable[[], Awaitable[None]]) -> None:
    """asyncio.run wrapper with SIGINT/SIGTERM → clean cancellation."""

    async def wrapper() -> None:
        task = asyncio.current_task()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, task.cancel)  # type: ignore[union-attr]
        with contextlib.suppress(asyncio.CancelledError):
            await main()

    asyncio.run(wrapper())


def load_chain_ids() -> list[int]:
    """CHAIN_IDS/CHAIN_ID env restriction, else every chain in factories.json."""
    from greek_mm.config.options import OPTIONS

    raw = os.environ.get("CHAIN_IDS") or os.environ.get("CHAIN_ID")
    if raw:
        return [int(s.strip()) for s in raw.split(",") if s.strip()]
    return list(OPTIONS.keys())
