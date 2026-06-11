"""EIP-712 quote signing for the BebopBlend PMM RFQ contract."""

from eth_account import Account
from eth_account.messages import encode_typed_data

# BebopBlend PMM RFQ contract — same address on all supported chains
# (NOT the JAM settlement at 0xbEbEbEb…, which uses a different EIP-712 domain)
BEBOP_BLEND_ADDRESS = "0xbbbbbBB520d69a9775E85b458C58c648259FAD5F"

_SINGLE_ORDER_TYPES = {
    "EIP712Domain": [
        {"name": "name", "type": "string"},
        {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ],
    "SingleOrder": [
        {"name": "partner_id", "type": "uint64"},
        {"name": "expiry", "type": "uint256"},
        {"name": "taker_address", "type": "address"},
        {"name": "maker_address", "type": "address"},
        {"name": "maker_nonce", "type": "uint256"},
        {"name": "taker_token", "type": "address"},
        {"name": "maker_token", "type": "address"},
        {"name": "taker_amount", "type": "uint256"},
        {"name": "maker_amount", "type": "uint256"},
        {"name": "receiver", "type": "address"},
        {"name": "packed_commands", "type": "uint256"},
    ],
}


def sign_quote(quote_data: dict, private_key: str) -> dict:
    """Sign a QuoteData dict (same shape as node's signing.ts). Returns
    {"signature": "0x...", "sign_scheme": "EIP712"}.
    """
    if quote_data["order_signing_type"] != "SingleOrder":
        msg = "MultiOrder signing not yet implemented"
        raise NotImplementedError(msg)

    key = private_key if private_key.startswith("0x") else f"0x{private_key}"

    # Aggregate per-token amounts (multi-quote RFQs collapse to one order).
    taker_tokens: dict[str, int] = {}
    maker_tokens: dict[str, int] = {}
    for partial in quote_data["quotes"]:
        taker_tokens[partial["taker_token"]] = taker_tokens.get(partial["taker_token"], 0) + int(
            partial["taker_amount"]
        )
        maker_tokens[partial["maker_token"]] = maker_tokens.get(partial["maker_token"], 0) + int(
            partial["maker_amount"]
        )

    taker_token, taker_amount = next(iter(taker_tokens.items()))
    maker_token, maker_amount = next(iter(maker_tokens.items()))

    typed_data = {
        "types": _SINGLE_ORDER_TYPES,
        "primaryType": "SingleOrder",
        "domain": {
            "name": "BebopSettlement",
            "version": "2",
            "chainId": quote_data["chain_id"],
            "verifyingContract": BEBOP_BLEND_ADDRESS,
        },
        "message": {
            "partner_id": int(quote_data["onchain_partner_id"]),
            "expiry": int(quote_data["expiry"]),
            "taker_address": quote_data["taker_address"],
            "maker_address": quote_data["maker_address"],
            "maker_nonce": int(quote_data["maker_nonce"]),
            "taker_token": taker_token,
            "maker_token": maker_token,
            "taker_amount": taker_amount,
            "maker_amount": maker_amount,
            "receiver": quote_data["receiver"],
            "packed_commands": int(quote_data["packed_commands"]),
        },
    }

    signed = Account.sign_message(encode_typed_data(full_message=typed_data), private_key=key)
    return {"signature": signed.signature.to_0x_hex(), "sign_scheme": "EIP712"}
