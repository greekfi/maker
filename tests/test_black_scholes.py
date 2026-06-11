import math

from hypothesis import given
from hypothesis import strategies as st

from greek_mm.pricing.black_scholes import black_scholes, cdf, greeks


def test_known_values() -> None:
    # Textbook case: S=100, K=100, T=1y, r=5%, sigma=20%
    result = black_scholes(100, 100, 1.0, 0.05, 0.20)
    assert math.isclose(result.call_price, 10.4506, abs_tol=1e-3)
    assert math.isclose(result.put_price, 5.5735, abs_tol=1e-3)


def test_expiry_is_intrinsic() -> None:
    result = black_scholes(3500, 3000, 0.0, 0.05, 0.8)
    assert result.call_price == 500
    assert result.put_price == 0


def test_zero_vol_is_discounted_intrinsic() -> None:
    result = black_scholes(3000, 3000, 1.0, 0.05, 0.0)
    pv = 3000 * math.exp(-0.05)
    assert math.isclose(result.call_price, 3000 - pv)
    assert result.put_price == 0


def test_cdf_symmetry() -> None:
    assert math.isclose(cdf(0), 0.5)
    assert math.isclose(cdf(1.0) + cdf(-1.0), 1.0)


@given(
    s=st.floats(min_value=100, max_value=100_000),
    k=st.floats(min_value=100, max_value=100_000),
    t=st.floats(min_value=1 / 365, max_value=2.0),
    r=st.floats(min_value=0.0, max_value=0.15),
    sigma=st.floats(min_value=0.05, max_value=3.0),
)
def test_put_call_parity(s: float, k: float, t: float, r: float, sigma: float) -> None:
    result = black_scholes(s, k, t, r, sigma)
    # C - P = S - K*e^(-rT)
    lhs = result.call_price - result.put_price
    rhs = s - k * math.exp(-r * t)
    assert math.isclose(lhs, rhs, rel_tol=1e-9, abs_tol=1e-6)


@given(
    s=st.floats(min_value=100, max_value=100_000),
    k=st.floats(min_value=100, max_value=100_000),
    t=st.floats(min_value=1 / 365, max_value=2.0),
    sigma=st.floats(min_value=0.05, max_value=3.0),
)
def test_delta_bounds(s: float, k: float, t: float, sigma: float) -> None:
    call = greeks(s, k, t, 0.05, sigma, is_put=False)
    put = greeks(s, k, t, 0.05, sigma, is_put=True)
    assert 0.0 <= call.delta <= 1.0
    assert -1.0 <= put.delta <= 0.0
    assert math.isclose(call.delta - put.delta, 1.0, abs_tol=1e-9)
    assert call.gamma >= 0
    assert call.vega >= 0
