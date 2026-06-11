"""SSVI implied-volatility surface (Gatheral-Jacquier surface SVI).

Total implied variance at log-moneyness k and ATM total variance theta:

    w(k, theta) = (theta / 2) * (1 + rho*phi*k + sqrt((phi*k + rho)^2 + 1 - rho^2))

with the power-law factor phi(theta) = eta / theta^gamma and the flat ATM
term structure theta(T) = atm_iv^2 * T.

Pure math, no I/O — everything stateful (spot, spreads) lives in
SviPriceSource. Replaces the node pricer's skew/curvature smile.
"""

import math
import os
from dataclasses import dataclass

SECONDS_PER_YEAR = 365 * 24 * 60 * 60

# theta range over which no-arbitrage is asserted at startup: 1 hour to 2 years.
_T_MIN = 1.0 / (24.0 * 365.0)
_T_MAX = 2.0


@dataclass(frozen=True)
class SviParams:
    atm_iv: float = 0.80  # ATM vol anchor
    rho: float = -0.3  # skew direction, in (-1, 1); negative tilts puts rich
    eta: float = 1.0  # smile amplitude
    gamma: float = 0.4  # smile flattening speed with maturity, in (0, 1)
    min_iv: float = 0.10
    max_iv: float = 3.0

    @classmethod
    def from_env(cls) -> "SviParams":
        def f(name: str, default: float) -> float:
            raw = os.environ.get(name)
            return float(raw) if raw is not None else default

        return cls(
            # DEFAULT_IV kept as a fallback alias for env compatibility with node.
            atm_iv=f("SVI_ATM_IV", f("DEFAULT_IV", 0.80)),
            rho=f("SVI_RHO", -0.3),
            eta=f("SVI_ETA", 1.0),
            gamma=f("SVI_GAMMA", 0.4),
            min_iv=f("SVI_MIN_IV", 0.10),
            max_iv=f("SVI_MAX_IV", 3.0),
        )


def total_variance(k: float, theta: float, rho: float, eta: float, gamma: float) -> float:
    phi = eta / theta**gamma
    return 0.5 * theta * (1.0 + rho * phi * k + math.sqrt((phi * k + rho) ** 2 + 1.0 - rho * rho))


def iv(params: SviParams, k: float, t: float) -> float:
    """Implied vol at log-moneyness k = ln(K/F) and time-to-expiry t (years)."""
    t = max(t, _T_MIN)
    theta = params.atm_iv**2 * t
    w = total_variance(k, theta, params.rho, params.eta, params.gamma)
    raw = math.sqrt(w / t)
    return min(params.max_iv, max(params.min_iv, raw))


def validate(params: SviParams, t_min: float = _T_MIN, t_max: float = _T_MAX) -> None:
    """Assert parameter ranges and the SSVI no-butterfly-arbitrage conditions.

    Gatheral-Jacquier (2014) Theorem 4.2: the surface is free of butterfly
    arbitrage if theta*phi*(1+|rho|) <= 4 and theta*phi^2*(1+|rho|) <= 4.
    With phi = eta/theta^gamma both expressions are monotone powers of theta,
    so checking the endpoints of the live theta range covers everything.
    Calendar-spread arbitrage is excluded by construction (theta = atm_iv^2*T
    is increasing in T with k-independent phi ordering).
    """
    errors: list[str] = []
    if not -1.0 < params.rho < 1.0:
        errors.append(f"rho must be in (-1, 1), got {params.rho}")
    if params.eta <= 0:
        errors.append(f"eta must be > 0, got {params.eta}")
    if not 0.0 < params.gamma < 1.0:
        errors.append(f"gamma must be in (0, 1), got {params.gamma}")
    if params.atm_iv <= 0:
        errors.append(f"atm_iv must be > 0, got {params.atm_iv}")
    if not 0 < params.min_iv <= params.max_iv:
        errors.append(f"need 0 < min_iv <= max_iv, got {params.min_iv}/{params.max_iv}")

    if not errors:
        for t in (t_min, t_max):
            theta = params.atm_iv**2 * t
            phi = params.eta / theta**params.gamma
            lim = 1.0 + abs(params.rho)
            if theta * phi * lim > 4.0:
                errors.append(
                    f"butterfly arbitrage: theta*phi*(1+|rho|) = {theta * phi * lim:.3f} > 4 at T={t:.4f}y"
                )
            if theta * phi * phi * lim > 4.0:
                errors.append(
                    f"butterfly arbitrage: theta*phi^2*(1+|rho|) = {theta * phi * phi * lim:.3f} > 4 at T={t:.4f}y"
                )

    if errors:
        msg = "Invalid SVI parameters: " + "; ".join(errors)
        raise ValueError(msg)
