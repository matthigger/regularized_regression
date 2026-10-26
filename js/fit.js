// Penalized least squares, with no intercept (features and y have mean 0):
//
//   J(w) = (1/2n) ||Xw - y||^2 + l1 ||w||_1 + (l2/2) ||w||_2^2
//
// Ridge is l1 = 0, lasso is l2 = 0, elastic net has both. The 1/2 on each
// quadratic term gives the gradient (1/n) X'(Xw - y) + l1 sign(w) + l2 w;
// at w_j = 0 the subgradient sign(0) = 0 is used.
//
// The exact minimizer w* comes from a closed form when l1 = 0, from the
// sign patterns when p <= 2, and from coordinate descent otherwise
// (Friedman et al. 2010). Gradient descent on the page is only ever the
// plain subgradient walk.

// Penalty weights the lambda sliders and charts span; 0 is its own stop.
const LAM_LO = 1e-2, LAM_HI = 1e2;
const LAM_GRID = [0];
for (let k = 0; k <= 40; k++) {
  LAM_GRID.push(LAM_LO * (LAM_HI / LAM_LO) ** (k / 40));
}

/**
 * Bundle a data set with its columns, for the solvers.
 *
 * Args:
 *   X (number[][]): (n, p) features, one row per sample
 *   y (number[]): (n,) responses
 *
 * Returns:
 *   d (object): { X, y, n, p, cols: (p, n) columns of X,
 *     a: (p,) ||x_j||^2 / n }
 */
function dataSet(X, y) {
  const n = X.length, p = n ? X[0].length : 0;
  const cols = [];
  for (let j = 0; j < p; j++) cols.push(X.map(r => r[j]));
  return { X, y, n, p, cols, a: cols.map(c => dot(c, c) / n) };
}

/** Predictions Xw. */
function predict(d, w) { return d.X.map(r => dot(r, w)); }

/** Mean squared error (1/n) ||Xw - y||^2 (no 1/2). */
function mse(d, w) {
  let s = 0;
  for (let i = 0; i < d.n; i++) s += (dot(d.X[i], w) - d.y[i]) ** 2;
  return s / d.n;
}

/** The penalty l1 ||w||_1 + (l2/2) ||w||^2. */
function penalty(w, l1, l2) {
  let a = 0, q = 0;
  for (const v of w) { a += Math.abs(v); q += v * v; }
  return l1 * a + l2 / 2 * q;
}

/**
 * Exact minimizer of J.
 *
 * With l1 = 0 it is the ridge closed form, taken in the dual
 * w = X'(XX' + n l2 I)^-1 y when n <= p, so l2 = 0 gives the
 * smallest-norm least-squares fit when many fit equally well. Otherwise
 * solveSmall for p <= 2, or coordinate descent: w_j <-
 * soft(x_j' r_j / n, l1) / (a_j + l2), r_j the residual leaving out
 * feature j, with active-set sweeps (Friedman et al. 2010).
 *
 * Args:
 *   d (object): data set (see dataSet)
 *   l1 (number): lasso weight
 *   l2 (number): ridge weight
 *   warm (number[] | null): (p,) start for coordinate descent
 *
 * Returns:
 *   w (number[]): (p,) minimizer
 */
function solve(d, l1, l2, warm = null) {
  const { X, y, n, p, cols, a } = d;
  if (l1 === 0) {
    if (n <= p) {
      // XX' is reused across a path of l2 values, so build it once.
      if (!d.K) d.K = X.map(r => X.map(s => dot(r, s)));
      const K = d.K.map(r => r.slice());
      for (let i = 0; i < n; i++) K[i][i] += n * l2;
      const al = cholSolve(K, y);
      return cols.map(c => dot(c, al));
    }
    const A = cols.map(c => cols.map(e => dot(c, e)));
    for (let j = 0; j < p; j++) A[j][j] += n * l2;
    return cholSolve(A, cols.map(c => dot(c, y)));
  }
  if (p <= 2) return solveSmall(d, l1, l2);
  if (!d.cf) d.cf = cols.map(c => Float64Array.from(c));
  const cf = d.cf, w = warm ? warm.slice() : new Array(p).fill(0);
  const r = Float64Array.from(y);
  for (let j = 0; j < p; j++) {
    if (w[j]) for (let i = 0; i < n; i++) r[i] -= cf[j][i] * w[j];
  }
  /** One coordinate update; returns how far the fit moved. */
  const update = j => {
    const c = cf[j], den = a[j] + l2;
    if (!(den > 0)) return 0;
    let z = 0;
    for (let i = 0; i < n; i++) z += c[i] * r[i];
    const v = soft(z / n + a[j] * w[j], l1) / den;
    const dw = v - w[j];
    if (dw === 0) return 0;
    for (let i = 0; i < n; i++) r[i] -= c[i] * dw;
    w[j] = v;
    return Math.abs(dw) * Math.sqrt(a[j]);
  };
  // Sweep only the nonzero weights until they settle, then sweep all to
  // check none of the zeros wants in; done when a full sweep is still.
  // The tolerance is in units of y, far below anything the page shows.
  const TOL = 1e-8;
  for (let full = 0; full < 200; full++) {
    let moved = 0;
    for (let j = 0; j < p; j++) moved = Math.max(moved, update(j));
    if (moved < TOL) break;
    const act = [];
    for (let j = 0; j < p; j++) if (w[j] !== 0) act.push(j);
    for (let sweep = 0; sweep < 200; sweep++) {
      let m = 0;
      for (const j of act) m = Math.max(m, update(j));
      if (m < TOL) break;
    }
    const exact = finish(d, l1, l2, act.filter(j => w[j] !== 0), w);
    if (exact) return exact;
  }
  return w;
}

/**
 * Exact minimizer of J from a guessed support, or null if none is found.
 *
 * Coordinate descent crawls when the fit nearly interpolates (p > n,
 * small l1), but it finds the support and signs s early. On a support A
 * J is a quadratic with minimizer (X_A'X_A/n + l2 I)^-1 (X_A'y/n - l1 s);
 * it is w* if it keeps the signs and every feature off A has
 * |x_j' r / n| <= l1 (the KKT conditions). When the guess fails, drop the
 * features whose sign flipped, or else add the worst KKT violator, and
 * solve again (a primal active-set method).
 */
function finish(d, l1, l2, act, w) {
  const { n, p, cf, y } = d;
  const dotc = (u, v) => {
    let s = 0;
    for (let t = 0; t < n; t++) s += u[t] * v[t];
    return s;
  };
  let A = act.slice(), sg = A.map(j => sgn(w[j]));
  for (let iter = 0; iter < 60; iter++) {
    if (!A.length || A.length > n) return null;
    const M = A.map(i => A.map(j => dotc(cf[i], cf[j]) / n
      + (i === j ? l2 : 0)));
    const b = A.map((j, k) => dotc(cf[j], y) / n - l1 * sg[k]);
    const wa = cholSolve(M, b, true);
    if (!wa) return null;
    const flip = wa.map((v, k) => sgn(v) !== sg[k]);
    if (flip.some(Boolean)) {
      A = A.filter((_, k) => !flip[k]);
      sg = sg.filter((_, k) => !flip[k]);
      continue;
    }
    const out = new Array(p).fill(0), r = Float64Array.from(y);
    A.forEach((j, k) => {
      out[j] = wa[k];
      for (let t = 0; t < n; t++) r[t] -= cf[j][t] * wa[k];
    });
    let worst = -1, wz = l1 * (1 + 1e-9);
    for (let j = 0; j < p; j++) {
      if (out[j] !== 0) continue;
      const z = Math.abs(dotc(cf[j], r) / n);
      if (z > wz) { wz = z; worst = j; }
    }
    if (worst < 0) return out;
    A.push(worst);
    sg.push(sgn(dotc(cf[worst], r)));
  }
  return null;
}

/**
 * Exact minimizer of J for p <= 2 features, with l1 > 0.
 *
 * On each orthant J is a quadratic 1/2 w'Hw - (b - l1 s)'w, H = G + l2 I,
 * G = X'X/n, b = X'y/n, s the sign pattern. Every candidate (support and
 * signs) whose stationary point keeps its signs is a local minimizer on
 * its face; J is convex, so the lowest of them is w*.
 */
function solveSmall(d, l1, l2) {
  const p = d.p, b = d.cols.map(c => dot(c, d.y) / d.n);
  const H = d.cols.map((c, i) => d.cols.map((e, j) =>
    dot(c, e) / d.n + (i === j ? l2 : 0)));
  const J = w => {
    let q = 0;
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) q += w[i] * H[i][j] * w[j];
    }
    return q / 2 - dot(b, w) + l1 * w.reduce((t, v) => t + Math.abs(v), 0);
  };
  let best = new Array(p).fill(0), bj = 0;
  const offer = w => {
    const v = J(w);
    if (v < bj) { bj = v; best = w; }
  };
  for (let j = 0; j < p; j++) {
    if (!(H[j][j] > 0)) continue;
    const w = new Array(p).fill(0);
    w[j] = soft(b[j], l1) / H[j][j];
    if (w[j]) offer(w);
  }
  if (p === 2) {
    const det = H[0][0] * H[1][1] - H[0][1] ** 2;
    if (det > 1e-12 * (H[0][0] * H[1][1] || 1)) {
      for (const s of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const c = [b[0] - l1 * s[0], b[1] - l1 * s[1]];
        const w = [(H[1][1] * c[0] - H[0][1] * c[1]) / det,
          (H[0][0] * c[1] - H[0][1] * c[0]) / det];
        if (sgn(w[0]) === s[0] && sgn(w[1]) === s[1]) offer(w);
      }
    }
  }
  return best;
}

/**
 * Minimizers along a grid of one penalty weight, the other held.
 *
 * Solved from the largest weight down, each warm-started from the last,
 * since a heavily penalized w* is sparse and quick to find.
 *
 * Args:
 *   d (object): data set
 *   which (string): "l1" or "l2", the weight that varies
 *   other (number): the weight held fixed
 *   grid (number[]): (G,) weights, ascending
 *
 * Returns:
 *   ws (number[][]): (G, p) w* at each grid weight
 */
function solvePath(d, which, other, grid = LAM_GRID) {
  const ws = new Array(grid.length);
  let warm = null;
  for (let k = grid.length - 1; k >= 0; k--) {
    const l1 = which === "l1" ? grid[k] : other;
    const l2 = which === "l2" ? grid[k] : other;
    ws[k] = solve(d, l1, l2, warm);
    warm = ws[k];
  }
  return ws;
}

/** Count of nonzero weights (|w_j| above a rounding floor). */
function nonzeros(w) {
  return w.filter(v => Math.abs(v) > 1e-8).length;
}
