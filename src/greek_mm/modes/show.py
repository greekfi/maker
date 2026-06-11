"""Show what the maker would push to Bebop — no connection, no credentials.

Discovers the options on each configured chain (one OptionCreated scan) and
prints every option with the flat price it would be quoted at. This is the
quick way to eyeball the maker before pointing it at the live Bebop socket.

    uv run greek-mm-show            # all chains in factories.json
    uv run greek-mm-show 8453       # just one chain
"""

import os
import sys

from greek_mm.events.sync_loop import sync_chain
from greek_mm.modes._runtime import bootstrap, load_chain_ids, run
from greek_mm.pricing.flat_source import FlatPriceSource
from greek_mm.pricing.pricer import Pricer
from greek_mm.pricing.registry import register_from_events


async def _main() -> None:
    price = float(os.environ.get("PRICE_PER_TOKEN", "10"))
    chain_ids = [int(a) for a in sys.argv[1:]] or load_chain_ids()
    source = FlatPriceSource(price)

    print(f"\nFlat price: ${price:.2f} per option token\n")
    for chain_id in chain_ids:
        pricer = Pricer(source, chain_id)
        print(f"chain {chain_id}: scanning for options (this walks the chain, ~1 min)...")
        events = await sync_chain(chain_id)
        await register_from_events(pricer, chain_id, events)
        options = pricer.all_options()
        print(f"  {len(options)} options found")
        for opt in options:
            result = await pricer.price(opt.option_address)
            kind = "put " if opt.is_put else "call"
            print(
                f"    {opt.option_address}  {opt.underlying:>5} {kind} "
                f"K={opt.strike:<10g} bid=${result.bid:.2f} ask=${result.ask:.2f}"
            )
        print(f"  => {len(options)} levels would stream to Bebop at ${price:.2f}/token\n")


def main() -> None:
    bootstrap()
    run(_main)


if __name__ == "__main__":
    main()
