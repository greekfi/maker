/**
 * Black-Scholes Option Pricing Model
 *
 * Standard normal cumulative distribution function and
 * Black-Scholes formulas for European call/put options.
 */

// Standard normal PDF
function pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Standard normal CDF using Horner's method approximation
// Abramowitz and Stegun approximation (error < 7.5e-8)
function cdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);

  return 0.5 * (1.0 + sign * y);
}

export interface BlackScholesInput {
  S: number; // Spot price
  K: number; // Strike price
  T: number; // Time to expiry in years
  r: number; // Risk-free rate (annualized, e.g., 0.05 = 5%)
  sigma: number; // Implied volatility (annualized, e.g., 0.80 = 80%)
}

export interface BlackScholesResult {
  callPrice: number;
  putPrice: number;
  d1: number;
  d2: number;
}

export interface GreeksResult {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

/**
 * Calculate Black-Scholes option prices
 */
export function blackScholes(input: BlackScholesInput): BlackScholesResult {
  const { S, K, T, r, sigma } = input;

  // Handle edge case: at or past expiry
  if (T <= 0) {
    const callPrice = Math.max(0, S - K);
    const putPrice = Math.max(0, K - S);
    return { callPrice, putPrice, d1: 0, d2: 0 };
  }

  // Handle edge case: zero volatility
  if (sigma <= 0) {
    const pv = K * Math.exp(-r * T);
    const callPrice = Math.max(0, S - pv);
    const putPrice = Math.max(0, pv - S);
    return { callPrice, putPrice, d1: Infinity, d2: Infinity };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Nd1 = cdf(d1);
  const Nd2 = cdf(d2);
  const NminusD1 = cdf(-d1);
  const NminusD2 = cdf(-d2);

  const discount = Math.exp(-r * T);

  const callPrice = S * Nd1 - K * discount * Nd2;
  const putPrice = K * discount * NminusD2 - S * NminusD1;

  return { callPrice, putPrice, d1, d2 };
}

/**
 * Calculate option Greeks
 */
export function calculateGreeks(
  input: BlackScholesInput,
  isPut: boolean
): GreeksResult {
  const { S, K, T, r, sigma } = input;

  if (T <= 0 || sigma <= 0) {
    return { delta: isPut ? -1 : 1, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const discount = Math.exp(-r * T);
  const pdfD1 = pdf(d1);
  const Nd1 = cdf(d1);
  const Nd2 = cdf(d2);

  // Delta
  const delta = isPut ? Nd1 - 1 : Nd1;

  // Gamma (same for call and put)
  const gamma = pdfD1 / (S * sigma * sqrtT);

  // Theta (per day)
  const thetaBase = -(S * pdfD1 * sigma) / (2 * sqrtT);
  const theta = isPut
    ? (thetaBase + r * K * discount * cdf(-d2)) / 365
    : (thetaBase - r * K * discount * Nd2) / 365;

  // Vega (per 1% change in IV)
  const vega = (S * sqrtT * pdfD1) / 100;

  // Rho (per 1% change in rate)
  const rho = isPut
    ? (-K * T * discount * cdf(-d2)) / 100
    : (K * T * discount * Nd2) / 100;

  return { delta, gamma, theta, vega, rho };
}

/**
 * Implied Volatility solver using Newton-Raphson
 */
export function impliedVolatility(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  isPut: boolean,
  maxIterations: number = 100,
  tolerance: number = 1e-6
): number {
  // Initial guess based on Brenner & Subrahmanyam (1988)
  let sigma = Math.sqrt((2 * Math.PI) / T) * (marketPrice / S);
  sigma = Math.max(0.01, Math.min(5.0, sigma)); // Clamp to reasonable range

  for (let i = 0; i < maxIterations; i++) {
    const result = blackScholes({ S, K, T, r, sigma });
    const price = isPut ? result.putPrice : result.callPrice;
    const vega = calculateGreeks({ S, K, T, r, sigma }, isPut).vega * 100; // Convert back

    if (Math.abs(vega) < 1e-10) break;

    const diff = price - marketPrice;
    if (Math.abs(diff) < tolerance) break;

    sigma = sigma - diff / vega;
    sigma = Math.max(0.01, Math.min(5.0, sigma));
  }

  return sigma;
}
