import itertools
import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from greek_mm.pricing import svi
from greek_mm.pricing.svi import SviParams

DEFAULTS = SviParams()


def test_default_params_validate() -> None:
    svi.validate(DEFAULTS)


def test_atm_iv_recovered_at_k_zero() -> None:
    # At k=0: w = theta/2 * (1 + sqrt(1)) = theta, so iv = atm_iv exactly.
    for t in (7 / 365, 30 / 365, 1.0):
        assert math.isclose(svi.iv(DEFAULTS, 0.0, t), DEFAULTS.atm_iv, rel_tol=1e-12)


def test_negative_rho_tilts_puts_rich() -> None:
    t = 30 / 365
    otm_put_iv = svi.iv(DEFAULTS, -0.2, t)  # K < F
    otm_call_iv = svi.iv(DEFAULTS, 0.2, t)  # K > F
    assert otm_put_iv > otm_call_iv


def test_short_dated_smile_is_steeper() -> None:
    # Put wing (k < 0 with rho < 0 lifts IV above ATM on both tenors);
    # the short-dated lift must be larger.
    k = -0.2
    short = svi.iv(DEFAULTS, k, 7 / 365) - DEFAULTS.atm_iv
    long = svi.iv(DEFAULTS, k, 365 / 365) - DEFAULTS.atm_iv
    assert short > long > 0


def test_iv_clamped() -> None:
    params = SviParams(min_iv=0.5, max_iv=0.9)
    assert svi.iv(params, 5.0, 7 / 365) == 0.9
    assert svi.iv(params, 0.0, 1.0) <= 0.9


@pytest.mark.parametrize(
    "bad",
    [
        SviParams(rho=1.5),
        SviParams(rho=-1.0),
        SviParams(eta=0.0),
        SviParams(gamma=0.0),
        SviParams(gamma=1.0),
        SviParams(atm_iv=-0.5),
        SviParams(eta=100.0),  # blows the butterfly bound at short tenors
    ],
)
def test_bad_params_rejected(bad: SviParams) -> None:
    with pytest.raises(ValueError, match="Invalid SVI parameters"):
        svi.validate(bad)


@given(
    k=st.floats(min_value=-3.0, max_value=3.0),
    t=st.floats(min_value=1 / 8760, max_value=2.0),
)
def test_total_variance_positive(k: float, t: float) -> None:
    theta = DEFAULTS.atm_iv**2 * t
    w = svi.total_variance(k, theta, DEFAULTS.rho, DEFAULTS.eta, DEFAULTS.gamma)
    assert w >= 0


@given(k=st.floats(min_value=-2.0, max_value=2.0))
def test_no_calendar_arbitrage(k: float) -> None:
    # Total variance must be non-decreasing in T at fixed k.
    tenors = [1 / 365, 7 / 365, 30 / 365, 90 / 365, 1.0, 2.0]
    variances = [
        svi.total_variance(k, DEFAULTS.atm_iv**2 * t, DEFAULTS.rho, DEFAULTS.eta, DEFAULTS.gamma)
        for t in tenors
    ]
    for earlier, later in itertools.pairwise(variances):
        assert later >= earlier - 1e-12
