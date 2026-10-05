/** Kleine, geprüfte Statistik-Helfer (keine externen Abhängigkeiten). */
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export interface LinReg {
  n: number;
  slope: number;
  intercept: number;
  r2: number;
  seSlope: number;
  /** t-Statistik der Steigung */
  t: number;
}

export function linreg(xs: number[], ys: number[]): LinReg {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { n, slope: 0, intercept: ys[0] ?? 0, r2: 0, seSlope: Infinity, t: 0 };
  const mx = mean(xs.slice(0, n)), my = mean(ys.slice(0, n));
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return { n, slope: 0, intercept: my, r2: 0, seSlope: Infinity, t: 0 };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const r2 = syy === 0 ? 0 : Math.max(0, 1 - sse / syy);
  const seSlope = Math.sqrt(sse / Math.max(1, n - 2) / sxx);
  const t = seSlope === 0 ? (slope === 0 ? 0 : Infinity) : slope / seSlope;
  return { n, slope, intercept, r2, seSlope, t };
}

/** Standardnormal-Verteilungsfunktion (Abramowitz/Stegun 7.1.26). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Welch-t-Test (zweiseitig, Normal-Approximation für p – ausreichend ab n≈30). */
export function welch(a: number[], b: number[]): { diff: number; t: number; p: number } {
  if (a.length < 2 || b.length < 2) return { diff: 0, t: 0, p: 1 };
  const va = std(a) ** 2 / a.length, vb = std(b) ** 2 / b.length;
  const diff = mean(a) - mean(b);
  const se = Math.sqrt(va + vb);
  const t = se === 0 ? 0 : diff / se;
  return { diff, t, p: 2 * (1 - normCdf(Math.abs(t))) };
}

export function cosine(a: number[], b: number[]): number {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { ab += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa === 0 || bb === 0 ? 0 : ab / Math.sqrt(aa * bb);
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function round(v: number, d = 2) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
