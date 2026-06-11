"""Black-Scholes option pricing.

Uses the exact normal CDF via math.erf (the node version uses an
Abramowitz-Stegun polynomial approximation; prices agree to ~1e-7).
Conventions match the node implementation: theta is per day, vega is per
1% IV move, rho is per 1% rate move.
"""

import math
from dataclasses import dataclass

_SQRT2 = math.sqrt(2.0)
_SQRT2PI = math.sqrt(2.0 * math.pi)


def cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / _SQRT2))


def pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / _SQRT2PI


@dataclass(frozen=True)
class BsResult:
    call_price: float
    put_price: float
    d1: float
    d2: float


@dataclass(frozen=True)
class GreeksResult:
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float


def black_scholes(s: float, k: float, t: float, r: float, sigma: float) -> BsResult:
    # At or past expiry: intrinsic value
    if t <= 0:
        return BsResult(max(0.0, s - k), max(0.0, k - s), 0.0, 0.0)

    # Zero volatility: discounted intrinsic
    if sigma <= 0:
        pv = k * math.exp(-r * t)
        return BsResult(max(0.0, s - pv), max(0.0, pv - s), math.inf, math.inf)

    sqrt_t = math.sqrt(t)
    d1 = (math.log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * sqrt_t)
    d2 = d1 - sigma * sqrt_t

    discount = math.exp(-r * t)
    call_price = s * cdf(d1) - k * discount * cdf(d2)
    put_price = k * discount * cdf(-d2) - s * cdf(-d1)

    return BsResult(call_price, put_price, d1, d2)


def greeks(s: float, k: float, t: float, r: float, sigma: float, *, is_put: bool) -> GreeksResult:
    if t <= 0 or sigma <= 0:
        return GreeksResult(delta=-1.0 if is_put else 1.0, gamma=0.0, theta=0.0, vega=0.0, rho=0.0)

    sqrt_t = math.sqrt(t)
    d1 = (math.log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * sqrt_t)
    d2 = d1 - sigma * sqrt_t

    discount = math.exp(-r * t)
    pdf_d1 = pdf(d1)
    nd1 = cdf(d1)
    nd2 = cdf(d2)

    delta = nd1 - 1.0 if is_put else nd1
    gamma = pdf_d1 / (s * sigma * sqrt_t)

    theta_base = -(s * pdf_d1 * sigma) / (2.0 * sqrt_t)
    if is_put:
        theta = (theta_base + r * k * discount * cdf(-d2)) / 365.0
    else:
        theta = (theta_base - r * k * discount * nd2) / 365.0

    vega = (s * sqrt_t * pdf_d1) / 100.0
    rho = (-k * t * discount * cdf(-d2)) / 100.0 if is_put else (k * t * discount * nd2) / 100.0

    return GreeksResult(delta, gamma, theta, vega, rho)
