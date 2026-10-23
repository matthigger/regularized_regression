// The Why tab's two pictures of fitted weights: a cloud of refits in the
// (w1, w2) plane, and a stem plot of 40 gene weights.

const CP = { w: 480, h: 480, x0: 58, x1: 466, y0: 14, y1: 422 };

/**
 * Weights fitted to many fresh samples, as dots in the (w1, w2) plane.
 */
class CloudPlot {
  constructor(svg) {
    this.svg = svg;
    svg.setAttribute("viewBox", `0 0 ${CP.w} ${CP.h}`);
  }

  /**
   * Draw the plot.
   *
   * Args:
   *   st (object): {
   *     fit (number[][]): (T, 2) the model's w-hat per sample
   *     ols (number[][] | null): (T, 2) OLS w-hat, drawn grey behind
   *     truth (number[]): (2,) true w
   *     mean (number[]): (2,) mean of fit
   *     lo (number), hi (number): the square view, both axes
   *   }
   */
  render(st) {
    const svg = this.svg, P = CP;
    svg.innerHTML = "";
    const k = (P.x1 - P.x0) / (st.hi - st.lo);
    const sx = v => P.x0 + (v - st.lo) * k;
    const sy = v => P.y1 - (v - st.lo) * k;
    const defs = node("defs", {}, svg);
    const clip = node("clipPath", { id: "cp-clip" }, defs);
    node("rect", { x: P.x0, y: P.y0, width: P.x1 - P.x0,
      height: P.y1 - P.y0 }, clip);
    const g = node("g", { "clip-path": "url(#cp-clip)" }, svg);

    for (const t of ticks(st.lo, st.hi, 7)) {
      node("line", { x1: sx(t), x2: sx(t), y1: P.y0, y2: P.y1,
        class: t === 0 ? "axis0" : "grid" }, g);
      node("line", { x1: P.x0, x2: P.x1, y1: sy(t), y2: sy(t),
        class: t === 0 ? "axis0" : "grid" }, g);
      text(svg, sx(t), P.y1 + 17, fmt(t), { class: "tick",
        "text-anchor": "middle" });
      text(svg, P.x0 - 6, sy(t) + 4, fmt(t), { class: "tick",
        "text-anchor": "end" });
    }
    // The data pin down w1 + w2 far better than the split between them
    // when the features are correlated; mark the true sum.
    const s = st.truth[0] + st.truth[1];
    node("line", { x1: sx(st.lo), y1: sy(s - st.lo), x2: sx(st.hi),
      y2: sy(s - st.hi), class: "sumline" }, g);
    const lx = st.lo + 0.08 * (st.hi - st.lo);
    text(g, sx(lx) + 6, sy(s - lx) - 6, `w₁ + w₂ = ${fmt(s)}`,
      { class: "sum-label" });

    if (st.ols) {
      for (const [a, b] of st.ols) {
        node("circle", { cx: sx(a), cy: sy(b), r: 3, class: "dot-ols" }, g);
      }
    }
    for (const [a, b] of st.fit) {
      node("circle", { cx: sx(a), cy: sy(b), r: 3.2, class: "dot-fit" }, g);
    }
    const [tx, ty] = [sx(st.truth[0]), sy(st.truth[1])];
    node("path", { d: `M${tx - 8} ${ty - 8}L${tx + 8} ${ty + 8}M${tx - 8} `
      + `${ty + 8}L${tx + 8} ${ty - 8}`, class: "truth-x" }, g);
    const [mx, my] = [sx(st.mean[0]), sy(st.mean[1])];
    node("polygon", { points: `${mx},${my - 8} ${mx + 8},${my} ${mx},`
      + `${my + 8} ${mx - 8},${my}`, class: "mean-dia" }, g);

    node("rect", { x: P.x0, y: P.y0, width: P.x1 - P.x0,
      height: P.y1 - P.y0, class: "frame" }, svg);
    text(svg, (P.x0 + P.x1) / 2, P.y1 + 42, "w₁",
      { class: "axis-label sym", "text-anchor": "middle" });
    text(svg, 18, (P.y0 + P.y1) / 2 + 5, "w₂",
      { class: "axis-label sym", "text-anchor": "middle" });
  }
}

const SP = { w: 560, h: 330, x0: 52, x1: 548, y0: 14, y1: 284 };

/**
 * One stem per feature (gene): its fitted weight, its true weight, and
 * whether the fit set it to exactly 0.
 */
class StemPlot {
  constructor(svg) {
    this.svg = svg;
    svg.setAttribute("viewBox", `0 0 ${SP.w} ${SP.h}`);
  }

  /**
   * Draw the plot.
   *
   * Args:
   *   st (object): {
   *     w (number[]): (p,) fitted weights
   *     truth (number[]): (p,) true weights
   *     group (number[] | null): indices to bracket as a pathway
   *     lim (number): the y axis spans [-lim, lim]
   *   }
   */
  render(st) {
    const svg = this.svg, P = SP, p = st.w.length;
    svg.innerHTML = "";
    const bw = (P.x1 - P.x0) / p;
    const cx = j => P.x0 + (j + 0.5) * bw;
    const sy = v => P.y0 + (st.lim - clamp(v, -st.lim, st.lim))
      / (2 * st.lim) * (P.y1 - P.y0);

    for (const t of ticks(-st.lim, st.lim, 6)) {
      node("line", { x1: P.x0, x2: P.x1, y1: sy(t), y2: sy(t),
        class: t === 0 ? "axis0" : "grid" }, svg);
      text(svg, P.x0 - 6, sy(t) + 4, fmt(t), { class: "tick",
        "text-anchor": "end" });
    }
    if (st.group) {
      const a = Math.min(...st.group), b = Math.max(...st.group);
      node("rect", { x: P.x0 + a * bw, y: P.y0, width: (b - a + 1) * bw,
        height: P.y1 - P.y0, class: "pathway" }, svg);
      text(svg, cx((a + b) / 2), P.y0 + 13, "pathway",
        { class: "pathway-label", "text-anchor": "middle" });
    }
    for (let j = 0; j < p; j++) {
      const x = cx(j), v = st.w[j], real = st.truth[j] !== 0;
      const g = node("g", { class: real ? "stem real" : "stem" }, svg);
      const tip = node("title", {}, g);
      tip.textContent = `gene ${j + 1}: w = ${fmt(v)}`
        + (real ? ` (true ${fmt(st.truth[j])})` : " (true 0)");
      node("rect", { x: x - bw / 2, y: P.y0, width: bw,
        height: P.y1 - P.y0, class: "stem-hit" }, g);
      if (real) {
        node("line", { x1: x - bw * 0.3, x2: x + bw * 0.3,
          y1: sy(st.truth[j]), y2: sy(st.truth[j]), class: "true-tick" }, g);
      }
      if (Math.abs(v) <= 1e-8) {
        node("circle", { cx: x, cy: sy(0), r: 3, class: "stem-zero" }, g);
        continue;
      }
      node("line", { x1: x, x2: x, y1: sy(0), y2: sy(v), class: "stem-line" },
        g);
      const clipped = Math.abs(v) > st.lim;
      if (clipped) {
        const y = sy(v), d = v > 0 ? 1 : -1;
        node("polygon", { points: `${x - 4},${y + 7 * d} ${x + 4},`
          + `${y + 7 * d} ${x},${y}`, class: "stem-clip" }, g);
      } else {
        node("circle", { cx: x, cy: sy(v), r: 3.6, class: "stem-head" }, g);
      }
    }
    for (let j = 0; j < p; j += 1) {
      if (j % 5 !== 4 && j !== 0) continue;
      text(svg, cx(j), P.y1 + 16, String(j + 1), { class: "tick",
        "text-anchor": "middle" });
    }
    node("rect", { x: P.x0, y: P.y0, width: P.x1 - P.x0,
      height: P.y1 - P.y0, class: "frame" }, svg);
    text(svg, (P.x0 + P.x1) / 2, P.y1 + 38, "gene",
      { class: "axis-label small", "text-anchor": "middle" });
    const my = (P.y0 + P.y1) / 2;
    text(svg, 15, my, "weight", { class: "axis-label small",
      "text-anchor": "middle", transform: `rotate(-90 15 ${my})` });
  }
}
