// Shared helpers: SVG nodes, pointer coordinates, number formatting, seeded
// random numbers, arrows, ticks and the log-scale sliders for the step
// size and the penalty weights.

const SVGNS = "http://www.w3.org/2000/svg";

function node(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

function text(parent, x, y, str, attrs = {}) {
  const t = node("text", { x, y, ...attrs }, parent);
  t.textContent = str;
  return t;
}

/** Pointer position in the viewBox units of an SVG. */
function svgPoint(svg, e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵",
  6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

/** Three significant digits; powers of ten outside 0.001..99999. */
function fmt(v, digits = 3) {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "—";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) {
    const [m, e] = v.toExponential(digits - 1).split("e");
    const exp = String(+e).split("").map(ch => SUP[ch]).join("");
    return `${m.replace("-", "−")}×10${exp}`;
  }
  const s = a === 0 ? "0" : String(+v.toPrecision(digits));
  return s.replace("-", "−");
}

/** Column vector (HTML) of already-formatted entries, in brackets. */
function colVec(entries) {
  return `<span class="colvec">${
    entries.map(e => `<span>${e}</span>`).join("")}</span>`;
}

function fmtCol(c) { return colVec(c.map(v => fmt(v))); }

/** Seeded uniform [0, 1) generator (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw from a uniform generator (Box-Muller). */
function randn(r) {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

/** Largest eigenvalue of the symmetric matrix [[a, b], [b, d]]. */
function eigMax(a, b, d) {
  return (a + d) / 2 + Math.hypot((a - d) / 2, b);
}

/** Arrow from (x1, y1) to (x2, y2) in screen units; skipped if too short. */
function arrow(parent, x1, y1, x2, y2, cls, head = 9) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  const g = node("g", { class: cls }, parent);
  if (len < 1) return g;
  const ux = dx / len, uy = dy / len;
  const h = Math.min(head, len * 0.6);
  node("line", { x1, y1, x2: x2 - ux * h * 0.8, y2: y2 - uy * h * 0.8 }, g);
  const bx = x2 - ux * h, by = y2 - uy * h;
  node("polygon", { points: [
    `${x2},${y2}`,
    `${bx - uy * h * 0.5},${by + ux * h * 0.5}`,
    `${bx + uy * h * 0.5},${by - ux * h * 0.5}`].join(" ") }, g);
  return g;
}

/** Roughly n round tick values covering [lo, hi]. */
function ticks(lo, hi, n = 5) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(f => f * mag).find(s => s >= raw);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9;
    v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return out;
}

/**
 * Log-scale slider for the step size eta over [lo, hi].
 *
 * The input runs 0..RES; get/set convert to and from eta.
 */
const ETA_RES = 1000;
function etaSlider(input, lo, hi) {
  input.min = 0;
  input.max = ETA_RES;
  input.step = 1;
  const span = Math.log(hi / lo);
  return {
    lo, hi,
    get: () => lo * Math.exp(span * input.value / ETA_RES),
    set: eta => {
      input.value = Math.round(ETA_RES * Math.log(eta / lo) / span);
    },
  };
}

/**
 * Readout status: which step the readout shows while hovering the trail,
 * else the run's progress.
 */
function statusLine(runner, hover) {
  if (hover !== null) {
    return `<p class="status hovering">Showing step ${hover} of `
      + `${runner.steps} (hovering).</p>`;
  }
  return `<p class="status ${runner.status}">${runner.describe()}</p>`;
}

/**
 * Log-scale slider for a penalty weight over [lo, hi], with its bottom
 * stop at exactly 0 (no penalty: OLS).
 *
 * The input runs 0..RES; position 0 is lambda = 0 and 1..RES span lo..hi.
 */
const LAM_RES = 1000;
function lamSlider(input, lo, hi) {
  input.min = 0;
  input.max = LAM_RES;
  input.step = 1;
  const span = Math.log(hi / lo);
  return {
    lo, hi,
    get: () => +input.value === 0
      ? 0 : lo * Math.exp(span * (input.value - 1) / (LAM_RES - 1)),
    set: lam => {
      input.value = lam <= 0 ? 0
        : Math.round(1 + (LAM_RES - 1) * clamp(Math.log(lam / lo) / span,
          0, 1));
    },
  };
}

/** Soft threshold: shrink v toward 0 by t, stopping at 0. */
function soft(v, t) {
  return v > t ? v - t : v < -t ? v + t : 0;
}

/** Sign of v, with sign(0) = 0 (the subgradient used for |w| at 0). */
function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Solve A x = b for symmetric positive-definite A by Cholesky.
 *
 * Args:
 *   A (number[][]): (m, m) symmetric positive definite; not modified
 *   b (number[]): (m,) right-hand side
 *
 * Returns:
 *   x (number[]): (m,) solution
 */
function cholSolve(A, b) {
  const m = b.length, L = A.map(() => new Float64Array(m));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      // Clamp the pivot so a numerically singular A still returns finite
      // values rather than NaN.
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
    }
  }
  const z = new Float64Array(m), x = new Array(m);
  for (let i = 0; i < m; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * z[k];
    z[i] = s / L[i][i];
  }
  for (let i = m - 1; i >= 0; i--) {
    let s = z[i];
    for (let k = i + 1; k < m; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}
