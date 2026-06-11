import httpx
import pytest
from helpers import StubSource, make_option, make_result

from greek_mm.bebop.signing import sign_quote
from greek_mm.events import store
from greek_mm.pricing.pricer import Pricer
from greek_mm.servers.http_api import create_app

OPTION = "0x" + "ab" * 20
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
MAKER = "0x" + "11" * 20
TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"


def _event() -> dict:
    return {
        "blockNumber": "100",
        "txHash": "0xt1",
        "logIndex": 0,
        "args": {
            "collateral": "0x4200000000000000000000000000000000000006",
            "consideration": USDC,
            "expirationDate": 4_000_000_000,
            "strike": str(3000 * 10**18),
            "isPut": False,
            "isEuro": False,
            "windowSeconds": 28800,
            "option": OPTION,
            "receipt": "0x" + "03" * 20,
        },
    }


@pytest.fixture
def client():
    store.clear()
    store.append_events(8453, [_event()], 100)
    pricer = Pricer(StubSource(make_result(bid=95.0, ask=105.0)), chain_id=8453)
    pricer.register_option(make_option(OPTION))
    app = create_app(
        {8453: pricer},
        maker_address=MAKER,
        signer=lambda data: sign_quote(data, TEST_KEY),
    )
    transport = httpx.ASGITransport(app=app)
    yield httpx.AsyncClient(transport=transport, base_url="http://test")
    store.clear()


async def test_health(client: httpx.AsyncClient) -> None:
    response = await client.get("/health")
    body = response.json()
    assert response.status_code == 200
    assert body["status"] == "ok"
    assert body["chains"] == [{"chainId": 8453, "optionsCount": 1}]
    assert body["makerAddress"] == MAKER
    assert body["sync"][0]["chainId"] == 8453


async def test_events(client: httpx.AsyncClient) -> None:
    response = await client.get("/events")
    body = response.json()
    assert body["count"] == 1
    assert body["events"][0]["args"]["option"] == OPTION

    filtered = (await client.get("/events", params={"chainId": "1"})).json()
    assert filtered["count"] == 0

    bad = await client.get("/events", params={"chainId": "nope"})
    assert bad.status_code == 400


async def test_options(client: httpx.AsyncClient) -> None:
    response = await client.get("/options", params={"chainId": "8453"})
    body = response.json()
    assert response.status_code == 200
    opt = body["options"][0]
    assert opt["address"] == OPTION
    assert opt["bid"] == 95.0
    assert opt["ask"] == 105.0
    assert opt["underlying"] == "ETH"

    missing = await client.get("/options")
    assert missing.status_code == 400
    unsupported = await client.get("/options", params={"chainId": "1"})
    assert unsupported.status_code == 400


async def test_price(client: httpx.AsyncClient) -> None:
    response = await client.get(f"/price/{OPTION}", params={"chainId": "8453"})
    body = response.json()
    assert response.status_code == 200
    assert body["bid"] == 95.0
    assert body["strike"] == 3000.0

    not_found = await client.get("/price/0x" + "ff" * 20, params={"chainId": "8453"})
    assert not_found.status_code == 404


async def test_quote_buy_option_signed(client: httpx.AsyncClient) -> None:
    response = await client.get(
        "/quote",
        params={
            "chainId": "8453",
            "buyToken": OPTION,
            "sellToken": USDC,
            "buyAmount": str(10**18),
            "takerAddress": "0x" + "22" * 20,
        },
    )
    body = response.json()
    assert response.status_code == 200
    # 1 option at ask $105 → 105 USDC (6 decimals).
    assert body["sellAmount"] == "105000000"
    assert body["buyAmount"] == str(10**18)
    assert body["price"] == "105.000000"
    assert body["signScheme"] == "EIP712"
    assert body["signature"].startswith("0x")
    assert body["order"]["maker_amount"] == str(10**18)
    assert body["order"]["taker_amount"] == "105000000"


async def test_quote_sell_option(client: httpx.AsyncClient) -> None:
    response = await client.get(
        "/quote",
        params={
            "chainId": "8453",
            "buyToken": USDC,
            "sellToken": OPTION,
            "sellAmount": str(2 * 10**18),
        },
    )
    body = response.json()
    # Selling 2 options at bid $95 → 190 USDC.
    assert body["buyAmount"] == "190000000"


async def test_quote_requires_chain_and_amounts(client: httpx.AsyncClient) -> None:
    no_chain = await client.get("/quote", params={"buyToken": OPTION, "sellToken": USDC})
    assert no_chain.status_code == 400

    no_amount = await client.get(
        "/quote", params={"chainId": "8453", "buyToken": OPTION, "sellToken": USDC}
    )
    assert no_amount.status_code == 400
    assert no_amount.json()["code"] == "QUOTE_ERROR"
