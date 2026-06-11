import pytest
from eth_account import Account
from eth_account.messages import encode_typed_data
from helpers import make_option

from greek_mm.bebop.client import BebopClient, BebopConfig
from greek_mm.bebop.signing import _SINGLE_ORDER_TYPES, BEBOP_BLEND_ADDRESS
from greek_mm.pricing.flat_source import FlatPriceSource
from greek_mm.pricing.pricer import Pricer

# anvil/hardhat test key #0 — public, never holds funds.
TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
OPTION = "0x" + "ab" * 20
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"


async def test_rfq_produces_signed_quote(monkeypatch: pytest.MonkeyPatch) -> None:
    """Full maker path: taker RFQ -> $10 quote -> EIP-712 signed response."""
    monkeypatch.setenv("MAKER_ADDRESS", TEST_ADDRESS)

    pricer = Pricer(FlatPriceSource(10.0), chain_id=8453)
    pricer.register_option(make_option(OPTION))
    client = BebopClient(
        BebopConfig(
            chain="base",
            chain_id=8453,
            marketmaker="x",
            authorization="y",
            maker_address=TEST_ADDRESS,
            private_key=TEST_KEY,
        ),
        pricer.handle_rfq,
    )

    # Taker wants to buy 1 option, paying USDC.
    rfq = {
        "rfq_id": "rfq-sign",
        "buy_tokens": [{"token": OPTION, "amount": str(10**18)}],
        "sell_tokens": [{"token": USDC, "amount": "0"}],
        "_originalRequest": {
            "order_signing_type": "SingleOrder",
            "order_type": "Single",
            "onchain_partner_id": 0,
            "maker_nonce": "777",
            "packed_commands": "0",
            "receiver": TEST_ADDRESS,
            "taker_address": TEST_ADDRESS,
        },
    }

    quote = await pricer.handle_rfq(rfq)
    assert quote["type"] == "quote"
    # 1 option at $10 -> 10 USDC (6 decimals)
    assert quote["buy_tokens"][0]["amount"] == "10000000"

    bebop_msg = client._build_quote_message(quote)
    signed = bebop_msg["msg"]
    assert signed["signature"].startswith("0x")

    # The signature recovers to the maker — a real, valid EIP-712 quote.
    typed_data = {
        "types": _SINGLE_ORDER_TYPES,
        "primaryType": "SingleOrder",
        "domain": {
            "name": "BebopSettlement",
            "version": "2",
            "chainId": 8453,
            "verifyingContract": BEBOP_BLEND_ADDRESS,
        },
        "message": {
            "partner_id": 0,
            "expiry": signed["expiry"],
            "taker_address": TEST_ADDRESS,
            "maker_address": TEST_ADDRESS,
            "maker_nonce": 777,
            # The maker signs taker_token=option / maker_token=USDC (mirrors
            # the node maker's quote construction).
            "taker_token": OPTION,
            "maker_token": USDC,
            "taker_amount": 10**18,
            "maker_amount": 10_000_000,
            "receiver": TEST_ADDRESS,
            "packed_commands": 0,
        },
    }
    recovered = Account.recover_message(
        encode_typed_data(full_message=typed_data), signature=signed["signature"]
    )
    assert recovered == TEST_ADDRESS
