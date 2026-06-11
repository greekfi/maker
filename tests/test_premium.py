from greek_mm.pricing.premium import premium_amount


def test_ask_side() -> None:
    # 2.5 option units (18 dec) at $105 -> 262.5 premium = 262_500_000 (6 dec)
    assert premium_amount(105.0, 25 * 10**17, 18, 6) == 262_500_000


def test_bid_side() -> None:
    assert premium_amount(95.0, 10**18, 18, 6) == 95_000_000


def test_six_decimal_option() -> None:
    # An option token can inherit non-18 decimals (e.g. USDC-collateralized).
    # 1 option (6 dec) at $10 -> $10 = 10_000_000 (6 dec premium).
    assert premium_amount(10.0, 10**6, 6, 6) == 10_000_000


def test_is_exact_integer_math() -> None:
    # No float drift: large amounts stay exact (Python ints).
    assert premium_amount(10.0, 7 * 10**18, 18, 6) == 70_000_000
