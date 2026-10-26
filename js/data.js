// Seeded data sets: the two Why-regularize problems and the Loss surface
// tab's two features. Every feature is standard normal (mean 0, sd 1) and
// y = Xw + noise has mean 0, so no model needs an intercept.
//
// Each set keeps its standard-normal draws, so moving a slider (the
// correlation, n, the true w) reshapes the same draws rather than drawing
// new ones; Resample draws new ones.

/**
 * Standard-normal draws for up to nMax samples of p features.
 *
 * Returns:
 *   z (object): { s: (nMax, k) shared factors, one per group,
 *     e: (nMax, p) own parts, eps: (nMax,) noise }
 */
function drawZ(seed, nMax, p, k) {
  const r = rng(seed * 7919 + 31);
  const mat = (m, q) => Array.from({ length: m },
    () => Array.from({ length: q }, () => randn(r)));
  return { s: mat(nMax, k), e: mat(nMax, p), eps: mat(nMax, 1).map(v => v[0]) };
}

/**
 * Features from draws: feature j in group g is sqrt(rho) s_g +
 * sqrt(1 - rho) e_j, so features in one group have correlation rho; the
 * rest are e_j alone.
 *
 * Args:
 *   z (object): draws (see drawZ)
 *   n (number): samples to use, the first n draws
 *   groups (number[][]): feature indices of each correlated group
 *   rho (number): correlation within a group, in [0, 1)
 *
 * Returns:
 *   X (number[][]): (n, p) features
 */
function buildX(z, n, groups, rho) {
  const p = z.e[0].length, g = new Array(p).fill(-1);
  groups.forEach((idx, k) => { for (const j of idx) g[j] = k; });
  const a = Math.sqrt(rho), b = Math.sqrt(1 - rho);
  return z.e.slice(0, n).map((e, i) =>
    e.map((v, j) => g[j] < 0 ? v : a * z.s[i][g[j]] + b * v));
}

/** Responses y = Xw + sigma eps. */
function buildY(X, w, sigma, eps) {
  return X.map((x, i) => dot(x, w) + sigma * eps[i]);
}

/** Two-feature problem: the Correlated features card. */
const PAIR = { w: [3, 3], sigma: 1, trials: 200, nMax: 100 };

/** Gene problem (the lasso card): 2000 genes, 4 of which matter. */
const GENES = { p: 2000, nMax: 200, nTest: 300, sigma: 1,
  w: { 112: 2, 587: -3, 1240: 2.5, 1833: 3.5 } };

/** Dense (p,) weight vector from an { index: value } map. */
function denseW(p, map) {
  const w = new Array(p).fill(0);
  for (const [j, v] of Object.entries(map)) w[+j] = v;
  return w;
}
