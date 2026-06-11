import pytest
from helpers import make_option

from greek_mm.pricing.pricer import flat_price


def test_flat_price_defaults_to_ten(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PRICE_PER_TOKEN", raising=False)
    assert flat_price(make_option()) == (10.0, 10.0)


def test_flat_price_respects_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PRICE_PER_TOKEN", "42.5")
    assert flat_price(make_option()) == (42.5, 42.5)


def test_flat_price_ignores_option(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PRICE_PER_TOKEN", "10")
    call = flat_price(make_option(is_put=False, strike=3000.0))
    put = flat_price(make_option(is_put=True, strike=0.0003))
    assert call == put == (10.0, 10.0)
