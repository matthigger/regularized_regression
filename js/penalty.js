// The model (OLS, Ridge, Lasso or Elastic net), shared by both tabs, and
// each tab's penalty weights.
//
// OLS uses neither weight, ridge only l2, lasso only l1, elastic net both.
// A tab keeps one { l1, l2 } per model, so switching models brings back
// that model's sliders where they were. Charts against lambda sweep l1
// (lasso, elastic net, with l2 held) or l2 (ridge). OLS has no lambda: its
// charts show the ridge sweep, faded, with OLS at the lambda = 0 stop.

const MODELS = {
  ols: { name: "OLS", l1: false, l2: false },
  ridge: { name: "Ridge", l1: false, l2: true },
  lasso: { name: "Lasso", l1: true, l2: false },
  enet: { name: "Elastic net", l1: true, l2: true },
};

const Model = (function () {
  let kind = "ridge";
  const listeners = [];

  function sync() {
    for (const b of document.querySelectorAll("[data-model]")) {
      b.setAttribute("aria-checked", b.dataset.model === kind);
    }
    // Grey out the penalty terms the model drops, in every formula.
    const m = MODELS[kind];
    for (const el of document.querySelectorAll(".t-l1")) {
      el.classList.toggle("off", !m.l1);
    }
    for (const el of document.querySelectorAll(".t-l2")) {
      el.classList.toggle("off", !m.l2);
    }
    for (const el of document.querySelectorAll("[data-ols-show]")) {
      el.hidden = kind !== "ols";
    }
    for (const el of document.querySelectorAll(".lam-chart")) {
      el.classList.toggle("inert", kind === "ols");
    }
  }

  for (const b of document.querySelectorAll("[data-model]")) {
    b.onclick = () => {
      if (b.dataset.model === kind) return;
      kind = b.dataset.model;
      sync();
      for (const fn of listeners) fn(kind);
    };
  }
  sync();

  return {
    get kind() { return kind; },
    get spec() { return MODELS[kind]; },
    /** Subscribe to model changes: fn(kind). */
    onChange(fn) { listeners.push(fn); },
  };
})();

/**
 * A tab's two lambda sliders, showing only those the model uses.
 *
 * Args:
 *   prefix (string): id prefix; expects inputs <prefix>-l1, <prefix>-l2,
 *     value spans <prefix>-l1val, <prefix>-l2val, and the labels around
 *     the inputs as the rows to hide
 *   init (object): { ridge, lasso, enet }, each { l1, l2 }, the starting
 *     weights per model (OLS needs none)
 *   onInput (Function): called after a slider moves
 */
class Lambdas {
  constructor(prefix, init, onInput) {
    const $ = id => document.getElementById(id);
    this.vals = JSON.parse(JSON.stringify(init));
    this.in = { l1: $(`${prefix}-l1`), l2: $(`${prefix}-l2`) };
    this.out = { l1: $(`${prefix}-l1val`), l2: $(`${prefix}-l2val`) };
    this.sl = { l1: lamSlider(this.in.l1, LAM_LO, LAM_HI),
      l2: lamSlider(this.in.l2, LAM_LO, LAM_HI) };
    for (const k of ["l1", "l2"]) {
      this.in[k].oninput = () => {
        this.vals[Model.kind][k] = this.sl[k].get();
        this.sync();
        onInput();
      };
    }
    this.sync();
  }

  /** Swap in another set of per-model weights (another scenario's). */
  use(vals) {
    this.vals = vals;
    this.sync();
  }

  /** This model's { l1, l2 }; OLS gets zeros. */
  get v() { return this.vals[Model.kind] || { l1: 0, l2: 0 }; }

  /** The current model's weights [l1, l2] (0 for a term it drops). */
  get w() {
    const m = Model.spec, v = this.v;
    return [m.l1 ? v.l1 : 0, m.l2 ? v.l2 : 0];
  }

  /** Which weight a chart against lambda sweeps, and the one held. */
  get sweep() {
    const [l1, l2] = this.w;
    return Model.kind === "ridge" || Model.kind === "ols"
      ? { which: "l2", lam: l2, other: 0 }
      : { which: "l1", lam: l1, other: l2 };
  }

  /** Set the swept weight (a chart click); OLS has none to set. */
  setSwept(lam) {
    if (Model.kind === "ols") return;
    this.vals[Model.kind][this.sweep.which] = lam;
    this.sync();
  }

  /** Show the model's sliders, at its weights. */
  sync() {
    const m = Model.spec, v = this.v;
    for (const k of ["l1", "l2"]) {
      this.in[k].closest("label").hidden = !m[k];
      this.sl[k].set(v[k]);
      const sub = k === "l1" ? "₁" : "₂";
      this.out[k].innerHTML = `<i>λ</i>${sub} = ${fmtLam(v[k])}`;
    }
  }
}

/** A penalty weight at two significant digits, exactly "0" at the stop. */
function fmtLam(lam) { return lam === 0 ? "0" : fmt(lam, 2); }
