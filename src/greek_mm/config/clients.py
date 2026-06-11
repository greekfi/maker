"""Per-chain AsyncWeb3 clients, one per chain for the process lifetime."""

from web3 import AsyncHTTPProvider, AsyncWeb3

from greek_mm.config.chains import get_chain

_clients: dict[int, AsyncWeb3] = {}


def get_w3(chain_id: int) -> AsyncWeb3:
    w3 = _clients.get(chain_id)
    if w3 is None:
        cfg = get_chain(chain_id)
        w3 = AsyncWeb3(AsyncHTTPProvider(cfg.rpc_url))
        _clients[chain_id] = w3
    return w3
