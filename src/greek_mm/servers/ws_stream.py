"""WebSocket price broadcast server (direct mode, :3011).

Message protocol matches the node wsStream byte-for-byte:
client → subscribe/unsubscribe/ping, server → price/pong/subscribed/error.
"""

import asyncio
import contextlib
import json
import logging
import time
from dataclasses import dataclass, field

import websockets

from greek_mm.pricing.pricer import Pricer

log = logging.getLogger(__name__)


@dataclass
class _Client:
    ws: websockets.ServerConnection
    options: set[str] = field(default_factory=set)
    underlyings: set[str] = field(default_factory=set)


class PricingStreamServer:
    def __init__(
        self,
        pricers: dict[int, Pricer],
        port: int,
        update_interval: float = 5.0,
    ) -> None:
        self._pricers = pricers
        self._port = port
        self._update_interval = update_interval
        self._clients: dict[websockets.ServerConnection, _Client] = {}

    async def run(self) -> None:
        # websockets' built-in keepalive replaces the node ping/terminate loop.
        async with websockets.serve(
            self._handler, "0.0.0.0", self._port, ping_interval=30, ping_timeout=30
        ):
            log.info("Pricing stream listening on port %d", self._port)
            await self._broadcast_loop()

    async def _handler(self, ws: websockets.ServerConnection) -> None:
        log.info("New pricing stream client connected")
        client = _Client(ws=ws)
        self._clients[ws] = client
        try:
            await self._send(ws, {"type": "subscribed", "options": []})
            async for raw in ws:
                try:
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    await self._send(ws, {"type": "error", "message": "Invalid message format"})
                    continue
                await self._handle_message(client, message)
        except websockets.ConnectionClosed:
            pass
        finally:
            log.info("Pricing stream client disconnected")
            self._clients.pop(ws, None)

    async def _handle_message(self, client: _Client, message: dict) -> None:
        msg_type = message.get("type")
        if msg_type == "subscribe":
            if message.get("options"):
                client.options.update(o.lower() for o in message["options"])
            else:
                # Subscribe to all options across all chains.
                for pricer in self._pricers.values():
                    client.options.update(pricer.option_addresses())
            if message.get("underlyings"):
                client.underlyings.update(u.upper() for u in message["underlyings"])
            await self._send(client.ws, {"type": "subscribed", "options": sorted(client.options)})
            await self._send_updates(client)
        elif msg_type == "unsubscribe":
            for option in message.get("options") or []:
                client.options.discard(option.lower())
            for underlying in message.get("underlyings") or []:
                client.underlyings.discard(underlying.upper())
            await self._send(client.ws, {"type": "subscribed", "options": sorted(client.options)})
        elif msg_type == "ping":
            await self._send(client.ws, {"type": "pong", "timestamp": int(time.time() * 1000)})
        else:
            await self._send(
                client.ws, {"type": "error", "message": f"Unknown message type: {msg_type}"}
            )

    async def _send_updates(self, client: _Client) -> None:
        for chain_id, pricer in self._pricers.items():
            for option in pricer.all_options():
                addr = option.option_address.lower()
                subscribed = (
                    addr in client.options or option.underlying.upper() in client.underlyings
                )
                if not subscribed:
                    continue
                price = await pricer.price(option.option_address)
                if price is None:
                    continue
                await self._send(
                    client.ws,
                    {
                        "type": "price",
                        "optionAddress": option.option_address,
                        "chainId": chain_id,
                        "bid": f"{price.bid:.6f}",
                        "ask": f"{price.ask:.6f}",
                        "mid": f"{price.mid:.6f}",
                        "spotPrice": price.spot,
                        "iv": price.iv,
                        "delta": price.delta,
                        "timestamp": int(time.time() * 1000),
                    },
                )

    async def _broadcast_loop(self) -> None:
        while True:
            await asyncio.sleep(self._update_interval)
            for client in list(self._clients.values()):
                try:
                    await self._send_updates(client)
                except websockets.ConnectionClosed:
                    self._clients.pop(client.ws, None)

    async def _send(self, ws: websockets.ServerConnection, message: dict) -> None:
        with contextlib.suppress(websockets.ConnectionClosed):
            await ws.send(json.dumps(message))
