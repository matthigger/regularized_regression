// Curves against a penalty weight lambda, on a log axis with lambda = 0
// (OLS) as its own stop at the left edge, past a break.
//
// Clicking or dragging in the plot sets lambda (onSet); the current lambda
// is a violet line with a knob, the best one a dashed line with a
// triangle. An optional strip under the plot steps the nonzero count.

const LC = { w: 440, x0: 58, gap: 34, x1: 428, y0: 14, plotH: 230,
  stripH: 70 };

class LamChart {
  /**
   * Args:
   *   svg (SVGElement): the chart's SVG
   *   opts (object): { onSet(lam, done): lambda picked (done on
   *     release) }
   */
  constructor(svg, opts) {
    this.svg = svg;
    this.opts = opts;
    this.cfg = null;
    this.drag = false;
    this.listen();
  }

  get lx0() { return LC.x0 + LC.gap; }

  /** Screen x of a lambda: 0 at the left stop, else the log axis. */
  sx(lam) {
    if (lam <= 0) return LC.x0;
    const t = Math.log(lam / LAM_LO) / Math.log(LAM_HI / LAM_LO);
    return this.lx0 + clamp(t, 0, 1) * (LC.x1 - this.lx0);
  }

  /** Lambda under a screen x; left of the break snaps to 0. */
  lamAt(x) {
    if (x < LC.x0 + LC.gap / 2) return 0;
    const t = clamp((x - this.lx0) / (LC.x1 - this.lx0), 0, 1);
    return LAM_LO * (LAM_HI / LAM_LO) ** t;
  }

  /**
   * Draw the chart.
   *
   * Args:
   *   cfg (object): {
   *     grid (number[]): (G,) lambdas, LAM_GRID
   *     series ({ vals: (G,) number[], cls: string }[]): curves
   *     lam (number): current lambda
   *     best (number | null): lambda to mark as best
   *     ylog (boolean): log y axis
   *     ymax (number | undefined): clip the y axis here
   *     xlabel (string), ylabel (string): HTML-free axis names
   *     strip ({ vals: (G,) number[], max: number, log: boolean } |
   *       null): nonzero counts for the strip under the plot, on a
   *       log(1 + count) axis when log
   *   }
   */
  render(cfg) {
    this.cfg = cfg;
    const svg = this.svg, strip = cfg.strip;
    const y1 = LC.y0 + LC.plotH;
    const sTop = y1 + 30, sBot = sTop + LC.stripH;
    const h = (strip ? sBot : y1) + 44;
    svg.setAttribute("viewBox", `0 0 ${LC.w} ${h}`);
    svg.innerHTML = "";
    this.bottom = strip ? sBot : y1;

    const all = cfg.series.flatMap(s => s.vals).filter(v =>
      Number.isFinite(v) && (!cfg.ylog || v > 0));
    let lo = Math.min(...all), hi = Math.max(...all);
    if (cfg.ymax !== undefined) hi = Math.min(hi, cfg.ymax);
    let yt;
    if (cfg.ylog) {
      lo = Math.log10(lo);
      hi = Math.log10(hi);
      const pad = Math.max(0.05, (hi - lo) * 0.06);
      lo -= pad;
      hi += pad;
      yt = logTicks(lo, hi);
    } else {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
      const pad = 0.06 * (hi - lo || 1);
      hi += pad;
      if (lo < 0) lo -= pad;
      yt = ticks(lo, hi, 5);
    }
    const tr = v => cfg.ylog ? Math.log10(v) : v;
    const sy = v => y1 - (clamp(tr(v), lo - (hi - lo), 2 * hi - lo) - lo)
      / (hi - lo) * (y1 - LC.y0);

    for (const t of yt) {
      const y = sy(cfg.ylog ? 10 ** t : t);
      node("line", { x1: LC.x0, x2: LC.x1, y1: y, y2: y,
        class: !cfg.ylog && t === 0 ? "axis0" : "grid" }, svg);
      text(svg, LC.x0 - 6, y + 4, fmt(cfg.ylog ? 10 ** t : t),
        { class: "tick", "text-anchor": "end" });
    }
    this.xAxis(svg, LC.y0, this.bottom);
    this.frames(svg, LC.y0, y1);

    // Curves clipped to the plot, so a clipped one leaves through the top
    // rather than running along it.
    const defs = node("defs", {}, svg);
    const clip = node("clipPath", { id: `${svg.id}-clip` }, defs);
    node("rect", { x: LC.x0 - 8, y: LC.y0, width: LC.x1 - LC.x0 + 8,
      height: y1 - LC.y0 }, clip);
    const cg = node("g", { "clip-path": `url(#${svg.id}-clip)` }, svg);
    for (const s of cfg.series) {
      // The lambda = 0 point stands alone, joined to the curve by a dotted
      // bridge across the break.
      const pts = [];
      for (let k = 1; k < cfg.grid.length; k++) {
        if (Number.isFinite(s.vals[k]) && (!cfg.ylog || s.vals[k] > 0)) {
          pts.push(`${this.sx(cfg.grid[k])},${sy(s.vals[k])}`);
        }
      }
      node("polyline", { points: pts.join(" "), class: `lc ${s.cls}` }, cg);
      const v0 = s.vals[0];
      if (Number.isFinite(v0) && (!cfg.ylog || v0 > 0)) {
        node("line", { x1: LC.x0, y1: sy(v0), x2: this.lx0,
          y2: sy(s.vals[1]), class: `lc bridge ${s.cls}` }, cg);
        node("circle", { cx: LC.x0, cy: sy(v0), r: 3.5,
          class: `lc-dot ${s.cls}` }, cg);
      }
    }
    if (strip) this.strip(svg, strip, sTop, sBot);

    if (cfg.best !== null && cfg.best !== undefined) {
      const x = this.sx(cfg.best);
      node("line", { x1: x, x2: x, y1: LC.y0, y2: this.bottom,
        class: "best-lam" }, svg);
      node("polygon", { points: `${x - 6},${LC.y0 - 1} ${x + 6},${LC.y0 - 1}`
        + ` ${x},${LC.y0 + 9}`, class: "best-tri" }, svg);
    }
    const x = this.sx(cfg.lam);
    node("line", { x1: x, x2: x, y1: LC.y0, y2: this.bottom,
      class: "cur-lam" }, svg);
    node("circle", { cx: x, cy: this.bottom, r: 7, class: "lam-knob" }, svg);

    text(svg, (LC.x0 + LC.x1) / 2, this.bottom + 38, cfg.xlabel,
      { class: "axis-label small", "text-anchor": "middle" });
    const my = (LC.y0 + y1) / 2;
    text(svg, 14, my, cfg.ylabel, { class: "axis-label small",
      "text-anchor": "middle", transform: `rotate(-90 14 ${my})` });
  }

  /** Frames for the zero stop and the log axis, with the break between. */
  frames(svg, top, bot) {
    node("rect", { x: this.lx0, y: top, width: LC.x1 - this.lx0,
      height: bot - top, class: "frame" }, svg);
    node("line", { x1: LC.x0 - 6, x2: LC.x0 + 6, y1: bot, y2: bot,
      class: "frame" }, svg);
    node("line", { x1: LC.x0 - 6, x2: LC.x0 - 6, y1: top, y2: bot,
      class: "frame" }, svg);
    for (const dx of [-3, 3]) {
      const bx = (LC.x0 + this.lx0) / 2 + dx;
      node("line", { x1: bx - 3, x2: bx + 3, y1: bot + 5, y2: bot - 5,
        class: "frame" }, svg);
    }
  }

  /** Decade ticks under the plot (and strip), "0" at the stop. */
  xAxis(svg, top, bot) {
    text(svg, LC.x0, bot + 17, "0", { class: "tick",
      "text-anchor": "middle" });
    for (let e = Math.log10(LAM_LO); e <= Math.log10(LAM_HI); e++) {
      const x = this.sx(10 ** e);
      node("line", { x1: x, x2: x, y1: top, y2: bot, class: "grid" }, svg);
      text(svg, x, bot + 17, fmt(10 ** e), { class: "tick",
        "text-anchor": "middle" });
    }
  }

  /** Nonzero-count steps, 0 at the bottom and max at the top. */
  strip(svg, st, top, bot) {
    node("rect", { x: this.lx0, y: top, width: LC.x1 - this.lx0,
      height: bot - top, class: "frame" }, svg);
    const f = v => st.log ? Math.log10(1 + v) : v;
    const sy = v => bot - f(v) / f(st.max) * (bot - top);
    let d = "";
    const g = this.cfg.grid;
    for (let k = 1; k < g.length; k++) {
      const xa = k === 1 ? this.lx0 : (this.sx(g[k - 1]) + this.sx(g[k])) / 2;
      const xb = k === g.length - 1 ? LC.x1
        : (this.sx(g[k]) + this.sx(g[k + 1])) / 2;
      d += `${k === 1 ? "M" : "L"}${xa} ${sy(st.vals[k])}L${xb} `
        + `${sy(st.vals[k])}`;
    }
    node("path", { d, class: "lc nz" }, svg);
    node("circle", { cx: LC.x0, cy: sy(st.vals[0]), r: 3.5,
      class: "lc-dot nz" }, svg);
    const labels = st.log ? [0, 10, 100, st.max].filter(v => v <= st.max)
      : [0, st.max];
    for (const v of labels) {
      if (v > 0 && v < st.max) {
        node("line", { x1: this.lx0, x2: LC.x1, y1: sy(v), y2: sy(v),
          class: "grid" }, svg);
      }
      text(svg, LC.x0 - 6, sy(v) + 4, v.toLocaleString("en-US"),
        { class: "tick", "text-anchor": "end" });
    }
    text(svg, this.lx0, top - 6, st.log
      ? "number of nonzero weights (log scale)" : "number of nonzero weights",
      { class: "tick strip-label" });
  }

  listen() {
    const svg = this.svg;
    const pick = (e, done) => {
      const p = svgPoint(svg, e);
      this.opts.onSet(this.lamAt(p.x), done);
    };
    svg.addEventListener("pointerdown", e => {
      if (e.button !== 0 || !this.cfg) return;
      const p = svgPoint(svg, e);
      if (p.x < LC.x0 - 10 || p.x > LC.x1 + 6 || p.y > this.bottom + 12) {
        return;
      }
      this.drag = true;
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      pick(e, false);
    });
    svg.addEventListener("pointermove", e => {
      if (this.drag) pick(e, false);
    });
    const end = e => {
      if (!this.drag) return;
      this.drag = false;
      pick(e, true);
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", () => { this.drag = false; });
  }
}

/** Integer decades covering [lo, hi] (log10 units), thinned to five. */
function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) out.push(e);
  if (out.length >= 2) return out;
  // Under two decades in view: label 1, 2, 5 steps instead.
  const fine = [];
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
    for (const m of [1, 2, 5]) {
      const v = e + Math.log10(m);
      if (v >= lo && v <= hi) fine.push(v);
    }
  }
  return fine;
}
