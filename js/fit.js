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
const LAM_LO = 1e-3, LAM_HI = 1e2;
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
 * feature j.
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
      const K = X.map(r => X.map(s => dot(r, s)));
      for (let i = 0; i < n; i++) K[i][i] += n * l2;
      const al = cholSolve(K, y);
      return cols.map(c => dot(c, al));
    }
    const A = cols.map(c => cols.map(e => dot(c, e)));
    for (let j = 0; j < p; j++) A[j][j] += n * l2;
    return cholSolve(A, cols.map(c => dot(c, y)));
  }
  if (p <= 2) return solveSmall(d, l1, l2);
  const w = warm ? warm.slice() : new Array(p).fill(0);
  const r = y.slice();
  for (let j = 0; j < p; j++) {
    if (w[j]) for (let i = 0; i < n; i++) r[i] -= cols[j][i] * w[j];
  }
  for (let sweep = 0; sweep < 20000; sweep++) {
    let moved = 0;
    for (let j = 0; j < p; j++) {
      const c = cols[j], den = a[j] + l2;
      if (!(den > 0)) continue;
      const z = dot(c, r) / n + a[j] * w[j];
      const v = soft(z, l1) / den;
      const dw = v - w[j];
      if (dw !== 0) {
        for (let i = 0; i < n; i++) r[i] -= c[i] * dw;
        w[j] = v;
        moved = Math.max(moved, Math.abs(dw) * Math.sqrt(a[j]));
      }
    }
    if (moved < 1e-10) break;
  }
  return w;
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
