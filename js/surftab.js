// Loss surface tab: J(w) over (w1, w2) for two correlated features, with
// gradient descent walking downhill on it, and the coefficient path
// w*(lambda) beside it.
//
// The surface shows the path of w* as the swept lambda runs from 0 (OLS)
// up, and on request the two pieces of J through w*: the MSE level set
// and the penalty level set, which touch there. Dragging the true w
// rebuilds y from the same noise.

/**
 * Penalized loss J over a two-feature data set, for LossView and Runner.
 *
 * Returns:
 *   obj (object): { f(w), grad(w), excess(w), mse(w), pen(w), fmin,
 *     wstar: (2,), L: smoothness bound, kinked, converged(c, start) }
 */
function penalizedLoss(d, l1, l2) {
  const pen = w => penalty(w, l1, l2);
  const f = w => mse(d, w) / 2 + pen(w);
  const wstar = solve(d, l1, l2), fmin = f(wstar);
  const G = d.cols.map(c => d.cols.map(e => dot(c, e) / d.n));
  const L = eigMax(G[0][0], G[0][1], G[1][1]) + l2;
  return {
    f, pen, fmin, wstar, L,
    mse: w => mse(d, w),
    excess: w => f(w) - fmin,
    grad(w) {
      const r = d.X.map((x, i) => dot(x, w) - d.y[i]);
      return d.cols.map((c, j) =>
        dot(c, r) / d.n + l1 * sgn(w[j]) + l2 * w[j]);
    },
    kinked: l1 > 0 && wstar.some(v => v === 0),
    converged(c, start) {
      return f(c) - fmin <= 1e-9 * Math.max(1, f(start) - fmin);
    },
  };
}

const SurfTab = (function () {
  const ETA_LO = 0.01, ETA_HI = 10;
  const START = [0, 0];
  const TRUTH = [2, 0];
  const $ = id => document.getElementById(id);

  const S = { view: "contour", log: true, pieces: true, path: true,
    seed: 1, rho: 0.6, n: 20, truth: TRUTH.slice(), hover: null };
  const lams = new Lambdas("sf", {
    ridge: { l1: 0, l2: 0.5 }, lasso: { l1: 0.6, l2: 0 },
    enet: { l1: 0.3, l2: 0.3 } }, () => refresh());
  let d, obj, runner, stopRun = null, wpath = null, z = null;

  const etaInput = $("sf-eta");
  const eta = etaSlider(etaInput, ETA_LO, ETA_HI);
  const view = new LossView($("sf-surf"), {
    labels: ["w₁", "w₂"], fname: "J",
    onSet: c => setC(c),
    onHover: () => render(),
    decorate: g => decorate(g),
    onTruth: (w, done) => {
      if (w) {
        S.truth = w;
        rebuild(false);
      }
      if (done || w) render();
    },
  });
  const pathChart = new LamChart($("sf-path"), {
    onSet: lam => { lams.setSwept(lam); refresh(); },
  });
  const chart = $("sf-chart");

  function visible() { return !$("sf-surf").closest("[hidden]"); }

  /** Rebuild the data from the draws; fresh also refits the view. */
  function rebuild(fresh) {
    stop();
    if (fresh || !z) z = drawZ(S.seed + 900, 60, 2, 1);
    const X = buildX(z, S.n, [[0, 1]], S.rho);
    d = dataSet(X, buildY(X, S.truth, 1, z.eps));
    obj = penalizedLoss(d, ...lams.w);
    wpath = null;
    if (fresh) {
      view.fit([START, solve(d, 0, 0), S.truth, obj.wstar], 1.5);
      runner = new Runner(obj, START, view.scale);
    } else {
      runner.setObjective(obj);
    }
  }

  /** New lambdas or model: same data, new objective, same view. */
  function refresh() {
    stop();
    obj = penalizedLoss(d, ...lams.w);
    wpath = null;
    runner.setObjective(obj);
    if (visible()) render();
  }

  /** w* along the swept weight's grid, cached until J changes. */
  function wPath() {
    if (!wpath) {
      const { which, other } = lams.sweep;
      wpath = solvePath(d, which, other);
    }
    return wpath;
  }

  /** Contour overlays: the w* path, the pieces through w*, the truth. */
  function decorate(g) {
    const sx = v => view.sx(v), sy = v => view.sy(v), ws = obj.wstar;
    if (S.path) {
      const pts = wPath().map(w => `${sx(w[0])},${sy(w[1])}`).join(" ");
      node("polyline", { points: pts, class: "lampath" }, g);
      const o = wPath()[0];
      node("circle", { cx: sx(o[0]), cy: sy(o[1]), r: 4.5, class: "ols-dot" },
        g);
      text(g, sx(o[0]) + 8, sy(o[1]) + 15, "OLS", { class: "ols-label" });
    }
    if (S.pieces) {
      const m = obj.mse(ws);
      const zm = view.sampleFn(w => obj.mse(w));
      node("path", { d: path(view.march(m, zm)), class: "piece-mse" }, g);
      const ring = penaltyRing(ws);
      if (ring) {
        node("polygon", { points: ring.map(w => `${sx(w[0])},${sy(w[1])}`)
          .join(" "), class: "piece-pen" }, g);
      }
    }
    const [tx, ty] = [sx(S.truth[0]), sy(S.truth[1])];
    const th = node("g", { class: "truth-handle" }, g);
    node("circle", { cx: tx, cy: ty, r: 12, class: "truth-hit" }, th);
    node("path", { d: `M${tx - 7} ${ty - 7}L${tx + 7} ${ty + 7}M${tx - 7} `
      + `${ty + 7}L${tx + 7} ${ty - 7}`, class: "truth-x" }, th);
    node("path", { d: star(sx(ws[0]), sy(ws[1]), 9), class: "wstar" }, g);
  }

  /**
   * The penalty level set through w*: l1 ||w||_1 + (l2/2) ||w||^2 = c,
   * c its value at w*, as points around the origin; null when c = 0.
   */
  function penaltyRing(ws) {
    const [l1, l2] = lams.w, c = penalty(ws, l1, l2);
    if (!(c > 0)) return null;
    const out = [];
    for (let k = 0; k < 360; k++) {
      const t = k / 360 * 2 * Math.PI, u = [Math.cos(t), Math.sin(t)];
      const s = Math.abs(u[0]) + Math.abs(u[1]);
      const r = l2 > 0
        ? (-l1 * s + Math.sqrt(l1 * l1 * s * s + 2 * l2 * c)) / l2
        : c / (l1 * s);
      out.push([r * u[0], r * u[1]]);
    }
    return out;
  }

  function setC(c) {
    stop();
    runner.reset(c);
    render();
  }

  function stop() {
    if (stopRun) { stopRun(); stopRun = null; }
  }

  function step() {
    stop();
    runner.step(eta.get());
    render();
  }

  function toggleRun() {
    if (stopRun) { stop(); render(); return; }
    if (runner.status) return;
    stopRun = runLoop(runner, eta.get, render, () => {
      stopRun = null;
      render();
    });
    render();
  }

  function hovered() {
    const h = view.hover, n = runner.trail.length;
    return h !== null && n > 1 && h < n ? h : null;
  }

  function readout() {
    const h = hovered(), c = h === null ? runner.c : runner.trail[h];
    const g = obj.grad(c), ws = obj.wstar;
    const rows = [
      [`<b>w</b> = ${colVec(["<i>w</i>₁", "<i>w</i>₂"])}`, fmtCol(c)],
      ["<i>J</i>(<b>w</b>)", fmt(obj.f(c))],
      ["&nbsp;&nbsp;½ MSE + penalty", `${fmt(obj.mse(c) / 2)} + ${
        fmt(obj.pen(c))}`],
      ["∇<i>J</i>(<b>w</b>)", fmtCol(g)],
      ["‖∇<i>J</i>(<b>w</b>)‖", fmt(Math.hypot(...g))],
      ["min <i>J</i>, at <b>w</b>* (★)", `${fmt(obj.fmin)} at ${fmtCol(ws)}`],
      ["weights of <b>w</b>* at 0", `${2 - nonzeros(ws)} of 2`],
      ["true <b>w</b> (✕)", fmtCol(S.truth)],
    ];
    $("sf-readout").innerHTML = rows.map(([k, v]) =>
      `<div class="row"><span>${k}</span><span class="val">${v}</span></div>`
    ).join("") + statusLine(runner, h);
  }

  function syncControls() {
    lams.sync();
    for (const b of document.querySelectorAll("[data-sf-view]")) {
      b.setAttribute("aria-checked", b.dataset.sfView === S.view);
    }
    for (const b of document.querySelectorAll("[data-sf-log]")) {
      b.setAttribute("aria-checked", (b.dataset.sfLog === "1") === S.log);
    }
    $("sf-pieces").checked = S.pieces;
    $("sf-showpath").checked = S.path;
    $("sf-rho").value = S.rho;
    $("sf-rhoval").innerHTML = `<i>ρ</i> = ${fmt(S.rho)}`;
    $("sf-n").value = S.n;
    $("sf-nval").innerHTML = `<i>n</i> = ${S.n}`;
    $("sf-etaval").innerHTML = `<i>η</i> = ${fmt(eta.get())}`
      + ` <span class="muted">(1/<i>L</i> = ${fmt(1 / obj.L)})</span>`;
    $("sf-run").innerHTML = stopRun ? "❚❚ Pause" : "&#9654; Run";
    $("sf-run").disabled = !stopRun && !!runner.status;
    $("sf-step").disabled = !!runner.status;
    $("sf-surf-hint").textContent = S.view === "3d"
      ? "Drag to orbit, scroll to zoom. Drag the point w on the floor to "
        + "move it (hold Shift to change only one weight); the dropline is "
        + "its J."
      : "Drag the point w, or click anywhere, to choose the start. Drag "
        + "the ✕ to change the true w. After a step, hover the trail.";
  }

  function render() {
    view.render(obj, { c: runner.c, trail: runner.trail, eta: eta.get(),
      mode: S.view });
    const ws = wPath();
    const { lam } = lams.sweep;
    pathChart.render({ grid: LAM_GRID, lam, best: null, ylog: false,
      series: [{ vals: ws.map(w => w[0]), cls: "w1" },
        { vals: ws.map(w => w[1]), cls: "w2" }],
      xlabel: lams.sweep.which === "l2" ? "λ₂ (ridge weight)"
        : Model.kind === "enet"
          ? `λ₁ (with λ₂ = ${fmtLam(lams.sweep.other)} held)`
          : "λ₁ (lasso weight)",
      ylabel: "w*", strip: null });
    drawLossChart(chart, runner.losses, obj.fmin, S.log, "J", hovered());
    readout();
    syncControls();
  }

  for (const b of document.querySelectorAll("[data-sf-view]")) {
    b.onclick = () => { S.view = b.dataset.sfView; render(); };
  }
  for (const b of document.querySelectorAll("[data-sf-log]")) {
    b.onclick = () => { S.log = b.dataset.sfLog === "1"; render(); };
  }
  $("sf-pieces").onchange = e => { S.pieces = e.target.checked; render(); };
  $("sf-showpath").onchange = e => { S.path = e.target.checked; render(); };
  $("sf-rho").oninput = e => { S.rho = +e.target.value; rebuild(true);
    render(); };
  $("sf-n").oninput = e => { S.n = +e.target.value; rebuild(true);
    render(); };
  $("sf-resample").onclick = () => { S.seed += 1; rebuild(true); render(); };
  $("sf-truth").onclick = () => { S.truth = TRUTH.slice(); rebuild(true);
    render(); };
  etaInput.oninput = render;
  $("sf-step").onclick = step;
  $("sf-run").onclick = toggleRun;
  $("sf-restart").onclick = () => setC(runner.trail[0]);
  $("sf-zero").onclick = () => setC(START);
  Model.onChange(() => refresh());

  rebuild(true);
  eta.set(1 / obj.L);

  return { step, stop, render };
})();

/** Five-pointed star path centered on (x, y), outer radius r. */
function star(x, y, r) {
  let d = "";
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r * 0.45 : r;
    d += `${k ? "L" : "M"}${(x + q * Math.cos(a)).toFixed(1)} `
      + `${(y + q * Math.sin(a)).toFixed(1)}`;
  }
  return d + "Z";
}
