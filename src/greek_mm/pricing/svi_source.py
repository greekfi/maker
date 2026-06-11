"""Local PriceSource: SSVI surface + Black-Scholes + fixed spread policy.

This is the implementation that gets swapped for a remote pricing service —
everything it knows (spot feed, surface params, spreads, rate) is internal.
"""

import math
import time
from dataclasses import dataclass

from greek_mm.pricing import svi
from greek_mm.pricing.black_scholes import black_scholes, greeks
from greek_mm.pricing.source import PriceResult
from greek_mm.pricing.spot_feed import SpotFeed
from greek_mm.pricing.svi import SECONDS_PER_YEAR, SviParams


@dataclass(frozen=True)
class SpreadConfig:
    bid_spread: float = 0.02  # 2% below mid
    ask_spread: float = 0.02  # 2% above mid
    min_spread: float = 0.001  # $0.001 floor so cheap options keep a real spread


class SviPriceSource:
    def __init__(
        self,
        spot_feed: SpotFeed,
        params: SviParams | None = None,
        spread: SpreadConfig | None = None,
        risk_free_rate: float = 0.05,
    ) -> None:
        self._spot_feed = spot_feed
        self._params = params or SviParams()
        svi.validate(self._params)
        self._spread = spread or SpreadConfig()
        self._rate = risk_free_rate

    async def price(
        self,
        *,
        underlying: str,
        strike: float,
        expiry: int,
        is_put: bool,
        chain_id: int,  # noqa: ARG002 — part of the seam contract, unused locally
        option_address: str,  # noqa: ARG002
    ) -> PriceResult | None:
        t = (expiry - time.time()) / SECONDS_PER_YEAR
        if t <= 0 or strike <= 0:
            return None

        spot = await self._spot_feed.get_price(underlying)
        if spot is None or spot <= 0:
            return None

        forward = spot * math.exp(self._rate * t)
        k = math.log(strike / forward)
        sigma = svi.iv(self._params, k, t)

        bs = black_scholes(spot, strike, t, self._rate, sigma)
        g = greeks(spot, strike, t, self._rate, sigma, is_put=is_put)
        mid = bs.put_price if is_put else bs.call_price

        bid_amount = max(mid * self._spread.bid_spread, self._spread.min_spread / 2)
        ask_amount = max(mid * self._spread.ask_spread, self._spread.min_spread / 2)

        return PriceResult(
            bid=max(0.0, mid - bid_amount),
            ask=mid + ask_amount,
            mid=mid,
            iv=sigma,
            spot=spot,
            delta=g.delta,
            gamma=g.gamma,
            theta=g.theta,
            vega=g.vega,
            time_to_expiry=t,
        )
