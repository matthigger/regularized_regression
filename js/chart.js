// Loss against step number.
//
// Log mode plots f - fmin on a log axis: steady convergence is a straight
// line falling at a rate set by eta and the curvature near the minimum,
// and a lasso walk that hops across 0 levels off. Linear mode plots f.

const CH = { w: 360, h: 210, x0: 54, x1: 348, y0: 12, y1: 172 };

/**
 * Draw the chart.
 *
 * Args:
 *   svg (SVGElement): chart SVG
 *   losses (number[]): (k+1,) f at each iterate
 *   fmin (number): minimum of f
 *   log (boolean): log(f - fmin) axis rather than f
 *   fname (string): objective name for the axis label
 *   mark (number | null): step to highlight (the hovered iterate)
 */
function drawLossChart(svg, losses, fmin, log, fname, mark = null) {
  svg.setAttribute("viewBox", `0 0 ${CH.w} ${CH.h}`);
  svg.innerHTML = "";
  const n = losses.length;
  const xmax = Math.max(10, n - 1);
  // Floor the excess so a run that reaches the minimum stays on the axis.
  const val = log
    ? losses.map(f => Math.log10(Math.max(f - fmin, 1e-12)))
    : losses.slice();
  const fin = val.filter(Number.isFinite);
  let lo = Math.min(...fin), hi = Math.max(...fin);
  if (!log) lo = Math.min(lo, fmin);
  if (log) { lo = Math.floor(lo); hi = Math.ceil(hi); }
  if (!(hi > lo)) { hi = lo + 1; }
  const sx = i => CH.x0 + i / xmax * (CH.x1 - CH.x0);
  const sy = v => CH.y1 - (clamp(v, lo, hi) - lo) / (hi - lo)
    * (CH.y1 - CH.y0);

  const yt = log
    ? ticks(lo, hi, 5).filter(t => Number.isInteger(t)) : ticks(lo, hi, 4);
  for (const t of yt) {
    node("line", { x1: CH.x0, x2: CH.x1, y1: sy(t), y2: sy(t),
      class: "grid" }, svg);
    text(svg, CH.x0 - 5, sy(t) + 4, log ? `10${expSup(t)}` : fmt(t),
      { class: "tick", "text-anchor": "end" });
  }
  for (const t of ticks(0, xmax, 5).filter(Number.isInteger)) {
    text(svg, sx(t), CH.y1 + 15, String(t),
      { class: "tick", "text-anchor": "middle" });
  }
  node("rect", { x: CH.x0, y: CH.y0, width: CH.x1 - CH.x0,
    height: CH.y1 - CH.y0, class: "frame" }, svg);
  text(svg, (CH.x0 + CH.x1) / 2, CH.y1 + 33, "step",
    { class: "axis-label", "text-anchor": "middle" });
  const yl = log && fmin !== 0 ? `${fname} − min` : fname;
  text(svg, 13, (CH.y0 + CH.y1) / 2, yl, { class: "axis-label",
    "text-anchor": "middle",
    transform: `rotate(-90 13 ${(CH.y0 + CH.y1) / 2})` });

  const pts = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(val[i])) pts.push(`${sx(i)},${sy(val[i])}`);
  }
  node("polyline", { points: pts.join(" "), class: "loss" }, svg);
  if (mark !== null && Number.isFinite(val[mark])) {
    node("line", { x1: sx(mark), x2: sx(mark), y1: CH.y0, y2: CH.y1,
      class: "mark" }, svg);
    node("circle", { cx: sx(mark), cy: sy(val[mark]), r: 5,
      class: "hover-ring" }, svg);
  }
  const last = val[n - 1];
  if (Number.isFinite(last)) {
    node("circle", { cx: sx(n - 1), cy: sy(last), r: 4,
      class: "loss-dot" }, svg);
  }
}

function expSup(t) {
  return String(t).split("").map(ch => SUP[ch]).join("");
}
