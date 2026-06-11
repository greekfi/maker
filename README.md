# maker

A Bebop options market maker in two files:

- **`maker.py`** — run this. Connects to Bebop, streams a price for every
  option, and signs RFQ quotes. The price is one function (`price()`) at the
  top — flat $10/token by default. Edit it for real pricing.
- **`options.py`** — reads option info (strike, expiry, decimals, …) from the
  factory's `OptionCreated` events on-chain.

Protobuf and EIP-712 signing are inlined in `maker.py` (no generated files).

## Run

```bash
uv sync
cp .env.example .env && chmod 600 .env   # fill it in

uv run maker.py          # stream prices + answer RFQs
uv run maker.py show     # just print discovered options + prices (no connect)
```

## Config (.env)

| Var | What |
|---|---|
| `BEBOP_MARKETMAKER`, `BEBOP_AUTHORIZATION` | Bebop maker credentials |
| `PRIVATE_KEY`, `MAKER_ADDRESS` | signer + maker address — **must match**, or Bebop rejects every quote (the maker warns at startup if they don't) |
| `CHAIN_ID`, `CHAIN`, `RPC_URL` | chain to make markets on |
| `FACTORY`, `FROM_BLOCK` | options factory + the block to scan from |
| `PRICE_PER_TOKEN` | the flat price (default `10`) |
| `OPTION_ONLY` | optional: comma-separated option addresses to limit to |

## Self-test (Bebop's RFQ test path)

To see your maker answer a real RFQ, run `maker.py`, then as a taker request a
quote for one of your options with your maker credentials
([Bebop docs](https://docs.bebop.xyz/market-makers/go-live/testing)):

```
GET https://api.bebop.xyz/pmm/<chain>/v3/quote
  ?sell_tokens=<USDC>&buy_tokens=<option>&sell_amounts=<amount>
  &taker_address=<you>&approval_type=Standard&skip_validation=true
  &gasless=false&source=<BEBOP_MARKETMAKER>
header: source-auth: <BEBOP_AUTHORIZATION>
```

Bebop routes that RFQ back to your maker, which signs and pushes a quote.
(Verified live: levels push and signed quotes reach Bebop; acceptance needs
`PRIVATE_KEY` to match the maker address registered with Bebop, and the option
to be live/settleable.)