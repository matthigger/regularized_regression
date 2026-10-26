// Why regularize? tab: two problems, each one a penalty fixes.
//
//   pair   Correlated features (ridge): 200 fresh samples of two
//          correlated features, each fitted; the cloud of w-hat and its
//          bias^2, variance and error against lambda.
//   genes  Many genes, few people (lasso): 2000 genes, 100 people, 4
//          genes matter; the fitted weights and test-set MSE against
//          lambda.
//
// The Model control is shared with the other tab; each problem keeps its
// own lambdas per model, and starts at lambda = 0 (OLS).

const WhyTab = (function () {
  const $ = id => document.getElementById(id);
  const zeroLams = () => ({ ridge: { l1: 0, l2: 0 }, lasso: { l1: 0, l2: 0 },
    enet: { l1: 0, l2: 0.1 } });
  const S = {
    scen: "pair",
    seed: { pair: 1, genes: 1 },
    rho: { pair: 0.9 },
    n: { pair: 20, genes: 100 },
    lam: { pair: zeroLams(), genes: zeroLams() },
  };
  const lams = new Lambdas("wy", S.lam.pair, () => render());
  lams.use(S.lam.pair);
  const cloud = new CloudPlot($("wy-cloud"));
  const stems = new StemPlot($("wy-stems"));
  const chart = new LamChart($("wy-chart"), {
    onSet: lam => { lams.setSwept(lam); render(); },
  });
  const rhoIn = $("wy-rho"), nIn = $("wy-n");

  // Caches, keyed by the inputs each depends on.
  const C = { zs: {}, data: {}, curves: {} };

  // -------------------------------------------------------------- data

  /** The 200 two-feature samples (Correlated features). */
  function pairData() {
    const key = `pair|${S.seed.pair}|${S.rho.pair}|${S.n.pair}`;
    if (C.data.key === key) return C.data.val;
    const zk = `pair|${S.seed.pair}`;
    if (!C.zs[zk]) {
      C.zs[zk] = Array.from({ length: PAIR.trials }, (_, t) =>
        drawZ(S.seed.pair * 1000 + t, PAIR.nMax, 2, 1));
    }
    const sets = C.zs[zk].map(z => {
      const X = buildX(z, S.n.pair, [[0, 1]], S.rho.pair);
      return dataSet(X, buildY(X, PAIR.w, PAIR.sigma, z.eps));
    });
    const ols = sets.map(d => solve(d, 0, 0));
    const val = { sets, ols, truth: PAIR.w, view: cloudView(ols) };
    C.data = { key, val };
    return val;
  }

  /** A square view holding the origin, the truth and most OLS fits. */
  function cloudView(ols) {
    const v = ols.flat().sort((a, b) => a - b);
    const q = f => v[Math.floor(f * (v.length - 1))];
    const lo = Math.min(-0.5, q(0.01)), hi = Math.max(PAIR.w[0] + 1,
      q(0.99));
    const pad = 0.06 * (hi - lo);
    return { lo: lo - pad, hi: hi + pad };
  }

  /** Training and test sets for the gene problem. */
  function geneData() {
    const key = `genes|${S.seed.genes}|${S.n.genes}`;
    if (C.data.key === key) return C.data.val;
    const seed = S.seed.genes, truth = denseW(GENES.p, GENES.w);
    const make = (z, m) => {
      const X = buildX(z, m, [], 0);
      return dataSet(X, buildY(X, truth, GENES.sigma, z.eps));
    };
    const zk = `genes|${seed}`;
    if (!C.zs[zk]) {
      C.zs[zk] = { tr: drawZ(seed, GENES.nMax, GENES.p, 0),
        te: drawZ(seed + 5000, GENES.nTest, GENES.p, 0) };
    }
    const val = { tr: make(C.zs[zk].tr, S.n.genes),
      te: make(C.zs[zk].te, GENES.nTest), truth };
    C.data = { key, val };
    return val;
  }

  // ----------------------------------------------------------- curves

  /** Per-lambda summaries along the swept weight, cached. */
  function curves() {
    const { which, other } = lams.sweep;
    const key = `${C.data.key}|${Model.kind}|${other}`;
    if (C.curves.key === key) return C.curves.val;
    let val;
    if (S.scen === "pair") {
      const D = pairData(), G = LAM_GRID.length, T = D.sets.length;
      const paths = D.sets.map(d => solvePath(d, which, other));
      const bias2 = [], vari = [], total = [];
      for (let k = 0; k < G; k++) {
        const ws = paths.map(pth => pth[k]);
        const m = [0, 1].map(i => ws.reduce((t, w) => t + w[i], 0) / T);
        bias2.push((m[0] - D.truth[0]) ** 2 + (m[1] - D.truth[1]) ** 2);
        vari.push(ws.reduce((t, w) => t + (w[0] - m[0]) ** 2
          + (w[1] - m[1]) ** 2, 0) / T);
        total.push(bias2[k] + vari[k]);
      }
      val = { bias2, vari, total, best: argmin(total) };
    } else {
      const D = geneData(), ws = solvePath(D.tr, which, other);
      const test = ws.map(w => mse(D.te, w));
      val = { ws, test, train: ws.map(w => mse(D.tr, w)),
        nz: ws.map(nonzeros), best: argmin(test) };
    }
    C.curves = { key, val };
    return val;
  }

  function argmin(v) {
    let k = 0;
    v.forEach((x, i) => { if (x < v[k]) k = i; });
    return k;
  }

  /** Grid index nearest a lambda (log scale; 0 is index 0). */
  function nearest(lam) {
    if (lam <= 0) return 0;
    let k = 1;
    for (let i = 1; i < LAM_GRID.length; i++) {
      if (Math.abs(Math.log(LAM_GRID[i] / lam))
        < Math.abs(Math.log(LAM_GRID[k] / lam))) k = i;
    }
    return k;
  }

  // ----------------------------------------------------------- render

  function row(k, v) {
    return `<div class="row"><span>${k}</span><span class="val">${v}</span>`
      + "</div>";
  }

  /** "Ridge, λ₂ = 0.3", or "OLS (no penalty)" when every weight is 0. */
  function modelLine() {
    const [l1, l2] = lams.w, m = Model.spec;
    if (l1 === 0 && l2 === 0) return "OLS (no penalty)";
    const parts = [];
    if (m.l1) parts.push(`<i>λ</i>₁ = ${fmtLam(l1)}`);
    if (m.l2) parts.push(`<i>λ</i>₂ = ${fmtLam(l2)}`);
    return `${m.name}, ${parts.join(", ")}`;
  }

  function xlabel() {
    const { which, other } = lams.sweep;
    if (which === "l2") return "λ₂ (ridge weight)";
    return Model.kind === "enet" ? `λ₁ (with λ₂ = ${fmtLam(other)} held)`
      : "λ₁ (lasso weight)";
  }

  function renderPair() {
    const D = pairData(), cv = curves(), [l1, l2] = lams.w;
    const fit = D.sets.map(d => solve(d, l1, l2));
    const T = fit.length;
    const mean = [0, 1].map(i => fit.reduce((t, w) => t + w[i], 0) / T);
    const bias2 = (mean[0] - D.truth[0]) ** 2 + (mean[1] - D.truth[1]) ** 2;
    const vari = fit.reduce((t, w) => t + (w[0] - mean[0]) ** 2
      + (w[1] - mean[1]) ** 2, 0) / T;
    const penalized = l1 > 0 || l2 > 0;
    cloud.render({ fit, ols: penalized ? D.ols : null, truth: D.truth, mean,
      lo: D.view.lo, hi: D.view.hi });
    const both0 = fit.filter(w => w[0] === 0 || w[1] === 0).length;

    chart.render({ grid: LAM_GRID, lam: lams.sweep.lam,
      best: LAM_GRID[cv.best], ylog: false, ymax: 1.5 * cv.total[0],
      series: [{ vals: cv.bias2, cls: "bias" },
        { vals: cv.vari, cls: "vari" }, { vals: cv.total, cls: "total" }],
      xlabel: xlabel(), ylabel: "error in ŵ", strip: null });

    const ols = cv.total[0];
    $("wy-readout").innerHTML = row("model", modelLine())
      + row("mean ŵ (◆)", fmtCol(mean))
      + row("bias² ‖mean ŵ − <b>w</b>‖²", fmt(bias2))
      + row("variance (spread of ŵ)", fmt(vari))
      + row("error = bias² + variance", fmt(bias2 + vari))
      + row("OLS error, for comparison", fmt(ols))
      + (Model.kind === "ridge" ? ""
        : row("fits with a weight at 0", `${both0} of ${T}`))
      + `<p class="muted">Each of the ${T} dots is one fit, to its own `
      + `sample of n = ${S.n.pair}. Error is the mean of ‖ŵ − <b>w</b>‖² `
      + "over the fits.</p>";
  }

  function renderGenes() {
    const D = geneData(), cv = curves(), [l1, l2] = lams.w;
    const w = solve(D.tr, l1, l2, cv.ws[nearest(lams.sweep.lam)]);
    stems.render({ w, truth: D.truth, lim: 4.5 });
    chart.render({ grid: LAM_GRID, lam: lams.sweep.lam,
      best: LAM_GRID[cv.best], ylog: true,
      series: [{ vals: cv.train.map(v => Math.max(v, 0.03)), cls: "train" },
        { vals: cv.test, cls: "held" }],
      xlabel: xlabel(), ylabel: "MSE", strip: { vals: cv.nz,
        max: D.tr.p, log: true } });

    const real = D.truth.map((v, j) => v !== 0 ? j : -1).filter(j => j >= 0);
    const kept = real.filter(j => Math.abs(w[j]) > 1e-8).length;
    const other = nonzeros(w) - kept;
    const tr = mse(D.tr, w), test = mse(D.te, w);
    const { which } = lams.sweep;
    const sub = which === "l1" ? "₁" : "₂";
    const num = v => v.toLocaleString("en-US");
    $("wy-readout").innerHTML = row("model", modelLine())
      + row("genes that matter kept", `${kept} of ${real.length}`)
      + row("other genes kept", `${num(other)} of ${
        num(D.tr.p - real.length)}`)
      + row("training MSE", tr < 1e-9 ? "0 (fits every person)" : fmt(tr))
      + row("test-set MSE", fmt(test))
      + row("lowest test-set MSE", `${fmt(cv.test[cv.best])} at <i>λ</i>${
        sub} = ${fmtLam(LAM_GRID[cv.best])}`)
      + `<p class="muted">${D.tr.n} people for training; the test set is `
      + `${D.te.n} new people. Hover a stem for its gene.</p>`;
  }

  function syncControls() {
    for (const b of document.querySelectorAll("[data-scen]")) {
      b.setAttribute("aria-checked", b.dataset.scen === S.scen);
    }
    for (const el of document.querySelectorAll("[data-scen-show]")) {
      el.hidden = !el.dataset.scenShow.split(" ").includes(S.scen);
    }
    const hasRho = S.scen in S.rho, hasN = S.scen in S.n;
    rhoIn.closest("label").hidden = !hasRho;
    nIn.closest("label").hidden = !hasN;
    if (hasRho) {
      rhoIn.value = S.rho[S.scen];
      $("wy-rhoval").innerHTML = `<i>ρ</i> = ${fmt(S.rho[S.scen])}`;
    }
    if (hasN) {
      const [lo, hi] = S.scen === "pair" ? [5, 100] : [50, 200];
      nIn.min = lo;
      nIn.max = hi;
      nIn.value = S.n[S.scen];
      $("wy-nval").innerHTML = `<i>n</i> = ${S.n[S.scen]}`;
    }
    $("wy-nname").textContent = S.scen === "pair" ? "Samples" : "People";
    lams.sync();
  }

  function render() {
    syncControls();
    if (S.scen === "pair") renderPair();
    else renderGenes();
  }

  function setScen(s) {
    S.scen = s;
    lams.use(S.lam[s]);
    render();
  }

  for (const b of document.querySelectorAll("[data-scen]")) {
    b.onclick = () => { if (b.dataset.scen !== S.scen) setScen(b.dataset.scen); };
  }
  rhoIn.oninput = () => { S.rho[S.scen] = +rhoIn.value; render(); };
  // A gene fit takes a moment, so refit on release; the label follows
  // the drag.
  nIn.oninput = () => {
    S.n[S.scen] = +nIn.value;
    if (S.scen === "pair") render();
    else $("wy-nval").innerHTML = `<i>n</i> = ${S.n.genes}`;
  };
  nIn.onchange = () => { if (S.scen !== "pair") render(); };
  $("wy-resample").onclick = () => { S.seed[S.scen] += 1; render(); };
  Model.onChange(() => {
    if (!$("wy-chart").closest("[hidden]")) render();
  });

  return { render, step() {}, stop() {} };
})();
