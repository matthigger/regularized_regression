// The gradient-descent runner and its run loop.

const MAX_STEPS = 3000;

/**
 * Gradient-descent iterates from a start point.
 *
 * obj supplies f(c), grad(c), converged(c, start) and kinked (w* has a
 * weight at exactly 0 under a lasso term); scale is the size of the view,
 * used to call a run diverged once it is far off.
 *
 * Attributes:
 *   trail (number[][]): (k+1, 2) iterates, trail[0] the start
 *   losses (number[]): (k+1,) loss at each iterate
 *   status (string): "", "converged", "diverged" or "capped"
 */
class Runner {
  constructor(obj, c, scale) {
    this.obj = obj;
    this.scale = scale;
    this.reset(c);
  }
  get c() { return this.trail[this.trail.length - 1]; }
  get steps() { return this.trail.length - 1; }
  reset(c) {
    this.trail = [c.slice()];
    this.losses = [this.obj.f(c)];
    this.status = this.obj.converged(c, c) ? "converged" : "";
  }
  /** New objective (e.g. data edited): restart from the current point. */
  setObjective(obj, scale = this.scale) {
    this.obj = obj;
    this.scale = scale;
    this.reset(this.c);
  }
  step(eta) {
    if (this.status) return false;
    const c = this.c, g = this.obj.grad(c);
    const next = c.map((v, i) => v - eta * g[i]);
    this.trail.push(next);
    this.losses.push(this.obj.f(next));
    const start = this.trail[0];
    const far = Math.hypot(...next.map((v, i) => v - start[i]));
    if (!next.every(Number.isFinite) || far > 1e4 * this.scale) {
      this.status = "diverged";
    } else if (this.obj.converged(next, start)) {
      this.status = "converged";
    } else if (this.steps >= MAX_STEPS) {
      this.status = "capped";
    }
    return true;
  }
  /** Sentence describing the run so far. */
  describe() {
    const k = this.steps, s = k === 1 ? "" : "s";
    const capped = this.obj.kinked
      ? `Stopped after ${k} steps, not converged. A weight that w* sets to `
        + "0 keeps hopping across 0: its sign(w) flips every step, so "
        + "plain gradient steps never land on exactly 0."
      : `Stopped after ${k} steps, not yet converged.`;
    return {
      converged: k ? `Converged in ${k} step${s}.` : "At the minimum.",
      diverged: `Diverged after ${k} step${s}.`,
      capped,
    }[this.status] || `${k} step${s}.`;
  }
}

/**
 * Step a runner on a timer until it stops, speeding up as it goes so a
 * slow crawl of thousands of steps still finishes in seconds.
 *
 * Returns a function that stops the loop.
 */
function runLoop(runner, getEta, onTick, onDone) {
  let ticks = 0;
  const id = setInterval(() => {
    ticks += 1;
    const n = ticks < 20 ? 1 : Math.ceil(1.06 ** (ticks - 20));
    for (let i = 0; i < n && runner.step(getEta()); i++);
    onTick();
    if (runner.status) { clearInterval(id); onDone(); }
  }, 50);
  return () => clearInterval(id);
}
