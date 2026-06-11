"""Show what the maker would push to Bebop — no connection, no credentials.

Discovers the options on each configured chain (one OptionCreated scan) and
prints every option with the flat price it would be quoted at. This is the
quick way to eyeball the maker before pointing it at the live Bebop socket.

    uv run greek-mm-show            # all chains in factories.json
    uv run greek-mm-show 8453       # just one chain
"""

import sys

from greek_mm.events.sync_loop import sync_chain
from greek_mm.modes._runtime import bootstrap, load_chain_ids, run
from greek_mm.pricing.pricer import flat_price
from greek_mm.pricing.registry import OptionRegistry, register_from_events


async def _main() -> None:
    chain_ids = [int(a) for a in sys.argv[1:]] or load_chain_ids()

    for chain_id in chain_ids:
        registry = OptionRegistry()
        print(f"chain {chain_id}: scanning for options (this walks the chain, ~1 min)...")
        events = await sync_chain(chain_id)
        await register_from_events(registry, chain_id, events)
        options = registry.all()
        print(f"  {len(options)} options found")
        for opt in options:
            bid, ask = flat_price(opt)
            kind = "put " if opt.is_put else "call"
            print(
                f"    {opt.option_address}  {opt.underlying:>5} {kind} "
                f"K={opt.strike:<10g} bid=${bid:.2f} ask=${ask:.2f}"
            )
        print(f"  => {len(options)} levels would stream to Bebop\n")


def main() -> None:
    bootstrap()
    run(_main)


if __name__ == "__main__":
    main()
