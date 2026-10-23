// Loss surface J over the weights (w1, w2), c in the code, for the Loss
// surface tab.
//
// The lasso term makes J piecewise quadratic, with creases along the
// axes, so it is sampled on a grid: filled bands come from a canvas image
// and level lines from marching squares. Levels are spaced geometrically
// in the excess J - Jmin, so the valley floor stays visible. Both axes
// share one scale, so the gradient is perpendicular to the level lines on
// screen as it is in the math.
// Optional dashed reference lines (opts.refs) mark fixed weights, so a
// penalty level set can be read against them.
//
// The point c is a draggable handle (or click anywhere in contour mode);
// holding Shift locks the drag to whichever of c1, c2 the pointer has
// moved further along. In contour mode the caller draws overlays through
// opts.decorate, and an element of class truth-handle drags the true w
// (opts.onTruth). Hovering picks the trail iterate nearest the pointer as
// this.hover. 3D mode draws the same surface as a mesh under an
// orthographic orbit camera; the handle slides on the floor and a
// dropline shows its height.

const PLOT = { w: 560, h: 560, x0: 62, x1: 546, y0: 14, y1: 498 };
const GRID = 120;
// Level sets: LEVELS levels, each RHO times the excess of the one outside.
const LEVELS = 16;
const RHO = 0.55;
const MESH = 26;
// Surface ramp, low (light) to high (dark), one hue.
const RAMP_LO = [246, 248, 252];
const RAMP_HI = [156, 178, 218];

/**
 * Orthographic orbit camera: world (X, Y, Z), floor in [-1, 1]^2, to
 * screen { x, y, depth } (depth grows away from the camera).
 */
function orbitProject(cam, [X, Y, Z]) {
  const { theta, phi, zoom } = cam, s = 175 * zoom;
  const xr = X * Math.cos(theta) - Y * Math.sin(theta);
  const yr = X * Math.sin(theta) + Y * Math.cos(theta);
  return {
    x: PLOT.w / 2 + s * xr,
    y: PLOT.h * 0.6 - s * (Z * Math.cos(phi) + yr * Math.sin(phi)),
    depth: yr * Math.cos(phi) - Z * Math.sin(phi),
  };
}

/** Inverse of orbitProject on the floor plane Z = 0: world [X, Y]. */
function orbitUnprojectFloor(cam, px, py) {
  const { theta, phi, zoom } = cam, s = 175 * zoom;
  const xr = (px - PLOT.w / 2) / s;
  const yr = (PLOT.h * 0.6 - py) / (s * Math.sin(phi));
  return [xr * Math.cos(theta) + yr * Math.sin(theta),
    -xr * Math.sin(theta) + yr * Math.cos(theta)];
}

function rampRGB(t) {
  return RAMP_LO.map((lo, i) => Math.round(lo + t * (RAMP_HI[i] - lo)));
}
function ramp(t) { return `rgb(${rampRGB(t).join(",")})`; }

class LossView {
  /**
   * Args:
   *   svg (SVGElement): the view's SVG
   *   opts (object): { labels: [x, y] axis names, fname: objective name
   *     for the tip label, onSet(c, done): called while dragging (done
   *     false) and on release, onHover(i): the hovered trail iterate
   *     changed (i null when none), decorate(g): draw contour-mode
   *     overlays into g, onTruth(w, done): the true w dragged,
   *     refs ([axis, value, label][]): reference lines; the caller
   *     redraws }
   */
  constructor(svg, opts) {
    this.svg = svg;
    this.opts = opts;
    this.cam = { theta: -0.7, phi: 0.62, zoom: 1 };
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = GRID;
    this.drag = null;
    this.hover = null;
    this.obj = null;
    // Screen positions of the trail iterates, from the last render.
    this.trailPts = [];
    svg.setAttribute("viewBox", `0 0 ${PLOT.w} ${PLOT.h}`);
    this.listen();
  }

  /**
   * Fit a square domain around the given points, at least 2 hwMin wide.
   * The surface is resampled at the next render.
   */
  fit(points, hwMin) {
    let lo = points[0].slice(), hi = points[0].slice();
    for (const p of points) {
      lo = lo.map((v, i) => Math.min(v, p[i]));
      hi = hi.map((v, i) => Math.max(v, p[i]));
    }
    this.mid = [0, 1].map(i => (lo[i] + hi[i]) / 2);
    this.hw = Math.max(hwMin,
      1.15 * Math.max((hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2));
    this.ppu = (PLOT.x1 - PLOT.x0) / (2 * this.hw);
    this.obj = null;
  }

  /** Size of the view in parameter units. */
  get scale() { return 2 * this.hw; }

  sx(v) { return PLOT.x0 + (v - this.mid[0] + this.hw) * this.ppu; }
  sy(v) { return PLOT.y1 - (v - this.mid[1] + this.hw) * this.ppu; }
  inv(px, py) {
    return [this.mid[0] - this.hw + (px - PLOT.x0) / this.ppu,
      this.mid[1] - this.hw + (PLOT.y1 - py) / this.ppu];
  }
  inside(c) {
    return [0, 1].every(i => Math.abs(c[i] - this.mid[i]) <= this.hw);
  }
  /** Domain point at fractions (u, v) across, from the bottom-left. */
  at(u, v) {
    return [this.mid[0] - this.hw + 2 * this.hw * u,
      this.mid[1] - this.hw + 2 * this.hw * v];
  }

  /** Sample the excess over the domain and cache the contour picture. */
  sample(obj) {
    this.obj = obj;
    const N = GRID, z = new Float64Array((N + 1) * (N + 1));
    let top = 0;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const e = obj.excess(this.at(i / N, j / N));
        z[j * (N + 1) + i] = e;
        if (e > top) top = e;
      }
    }
    this.z = z;
    this.top = top;
    this.levels = [];
    for (let k = 0; k < LEVELS; k++) this.levels.push(top * RHO ** k);
    this.paintBands();
    this.lines = this.levels.map(L => this.march(L));
  }

  /** Any function of c on the same grid, for march. */
  sampleFn(fn) {
    const N = GRID, z = new Float64Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) z[j * (N + 1) + i] = fn(this.at(i / N, j / N));
    }
    return z;
  }

  /** Level band of an excess value: 0 outermost (high) .. LEVELS-1. */
  band(e) {
    if (!(e > 0)) return LEVELS - 1;
    return clamp(Math.floor(Math.log(e / this.top) / Math.log(RHO)), 0,
      LEVELS - 1);
  }
  shade(e) { return 1 - (this.band(e) + 1) / LEVELS; }

  paintBands() {
    const N = GRID, ctx = this.canvas.getContext("2d");
    const img = ctx.createImageData(N, N);
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        // Canvas rows run top-down; the grid runs bottom-up. Sample the
        // middle of each pixel's cell.
        const j = N - 1 - py;
        const e = (this.z[j * (N + 1) + px] + this.z[j * (N + 1) + px + 1]
          + this.z[(j + 1) * (N + 1) + px]
          + this.z[(j + 1) * (N + 1) + px + 1]) / 4;
        const c = rampRGB(this.shade(e));
        const o = 4 * (py * N + px);
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.image = this.canvas.toDataURL();
  }

  /**
   * Level-L segments by marching squares, screen units, of the excess or
   * of another grid z from sampleFn.
   */
  march(L, z = this.z) {
    const N = GRID, segs = [];
    const X = i => PLOT.x0 + i / N * (PLOT.x1 - PLOT.x0);
    const Y = j => PLOT.y1 - j / N * (PLOT.y1 - PLOT.y0);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = z[j * (N + 1) + i], b = z[j * (N + 1) + i + 1];
        const c = z[(j + 1) * (N + 1) + i + 1], d = z[(j + 1) * (N + 1) + i];
        // Corners a (i, j), b (i+1, j), c (i+1, j+1), d (i, j+1).
        const pts = [];
        const edge = (v0, v1, x0, y0, x1, y1) => {
          if ((v0 > L) !== (v1 > L)) {
            const t = (L - v0) / (v1 - v0);
            pts.push([X(x0 + t * (x1 - x0)), Y(y0 + t * (y1 - y0))]);
          }
        };
        edge(a, b, i, j, i + 1, j);
        edge(b, c, i + 1, j, i + 1, j + 1);
        edge(c, d, i + 1, j + 1, i, j + 1);
        edge(d, a, i, j + 1, i, j);
        if (pts.length === 2) segs.push(pts);
        else if (pts.length === 4) segs.push(pts.slice(0, 2), pts.slice(2));
      }
    }
    return segs;
  }

  /**
   * Draw the view.
   *
   * Args:
   *   obj (object): penalized loss (see penalizedLoss)
   *   st (object): { c, trail, eta, mode: "contour" | "3d" }
   */
  render(obj, st) {
    if (obj !== this.obj) this.sample(obj);
    this.st = st;
    this.svg.innerHTML = "";
    this.trailPts = [];
    if (this.hover !== null && this.hover >= st.trail.length) {
      this.hover = null;
    }
    this.svg.classList.toggle("orbit", st.mode === "3d");
    if (st.mode === "3d") this.draw3d(obj, st);
    else this.drawContour(obj, st);
  }

  drawContour(obj, st) {
    const svg = this.svg, P = PLOT;
    const defs = node("defs", {}, svg);
    const clip = node("clipPath", { id: `${svg.id}-clip` }, defs);
    node("rect", { x: P.x0, y: P.y0, width: P.x1 - P.x0,
      height: P.y1 - P.y0 }, clip);
    const g = node("g", { "clip-path": `url(#${svg.id}-clip)` }, svg);
    node("image", { href: this.image, x: P.x0, y: P.y0,
      width: P.x1 - P.x0, height: P.y1 - P.y0, preserveAspectRatio: "none",
      class: "bands" }, g);
    for (const segs of this.lines) node("path", { d: path(segs),
      class: "flevel" }, g);

    if (Math.abs(this.mid[0]) <= this.hw) {
      const x = this.sx(0);
      node("line", { x1: x, x2: x, y1: P.y0, y2: P.y1, class: "axis0" }, g);
    }
    if (Math.abs(this.mid[1]) <= this.hw) {
      const y = this.sy(0);
      node("line", { x1: P.x0, x2: P.x1, y1: y, y2: y, class: "axis0" }, g);
    }
    this.refs(g, false);

    const c = st.c, ec = obj.excess(c);
    if (this.inside(c) && ec > 0) {
      node("path", { d: path(this.march(ec)), class: "here-level" }, g);
    }
    const lock = this.lockLine();
    if (lock) {
      const [[a0, a1], [b0, b1]] = lock;
      node("line", { x1: this.sx(a0), y1: this.sy(a1), x2: this.sx(b0),
        y2: this.sy(b1), class: "lockline" }, g);
    }
    this.labels(g, obj);
    if (this.opts.decorate) this.opts.decorate(g);
    this.trail(g, st.trail.map(p => [this.sx(p[0]), this.sy(p[1])]));

    const px = this.sx(c[0]), py = this.sy(c[1]);
    this.gradArrows(g, obj, st, px, py);
    node("circle", { cx: px, cy: py, r: 8, class: "handle" }, g);
    this.tipLabel(g, obj, c, px, py);

    this.axes(svg);
    if (!this.inside(c)) this.edgeMarker(svg, c);
  }

  /**
   * Dashed reference lines at fixed weights (opts.refs, each [axis,
   * value, label]), on the contour map or the 3D floor.
   */
  refs(g, floor) {
    for (const [i, v, label] of this.opts.refs || []) {
      const t = (v - this.mid[i]) / this.hw;
      if (Math.abs(t) > 1) continue;
      const end = s => i === 0 ? [t, s] : [s, t];
      let a, b;
      if (floor) {
        a = orbitProject(this.cam, [...end(-1), 0]);
        b = orbitProject(this.cam, [...end(1), 0]);
      } else {
        const [ax, ay] = end(-1), [bx, by] = end(1);
        const px = u => PLOT.x0 + (u + 1) / 2 * (PLOT.x1 - PLOT.x0);
        const py = u => PLOT.y1 - (u + 1) / 2 * (PLOT.y1 - PLOT.y0);
        a = { x: px(ax), y: py(ay) };
        b = { x: px(bx), y: py(by) };
      }
      node("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "refline" },
        g);
      const [lx, ly, anchor] = i === 0 ? [b.x + 4, b.y + 14, "start"]
        : [b.x - 4, b.y - 5, "end"];
      text(g, lx, ly, label, { class: "ref-label", "text-anchor": anchor });
    }
  }

  /** One value label per level, greedily kept apart from the others. */
  labels(g, obj) {
    const P = PLOT, placed = [];
    const ok = (x, y) => x > P.x0 + 22 && x < P.x1 - 22 && y > P.y0 + 12
      && y < P.y1 - 10;
    this.levels.forEach((L, k) => {
      let best = null, bd = 0;
      const segs = this.lines[k];
      const step = Math.max(1, Math.floor(segs.length / 60));
      for (let s = 0; s < segs.length; s += step) {
        const [[x0, y0], [x1, y1]] = segs[s];
        const x = (x0 + x1) / 2, y = (y0 + y1) / 2;
        if (!ok(x, y)) continue;
        const d = placed.reduce((m, [px, py]) =>
          Math.min(m, Math.hypot(x - px, y - py)), 1e9);
        if (d > bd) { bd = d; best = [x, y]; }
      }
      if (best && bd > 46) {
        placed.push(best);
        text(g, best[0], best[1] + 4, fmt(obj.fmin + L, 2),
          { class: "clabel", "text-anchor": "middle" });
      }
    });
  }

  /**
   * Ends of the line c may move along during a Shift drag, in parameter
   * units, spanning the domain; null when no axis is locked.
   */
  lockLine() {
    const d = this.drag;
    if (!d || d.lock === undefined) return null;
    const a = d.anchor;
    return [-1, 1].map(s => {
      const p = a.slice();
      p[d.lock] = this.mid[d.lock] + s * this.hw;
      return p;
    });
  }

  /**
   * Iterates as a polyline, with dots while there are few enough, and a
   * ring on the hovered one.
   */
  trail(g, pts) {
    if (pts.length < 2) return;
    this.trailPts = pts;
    node("polyline", { points: pts.map(p => p.join(",")).join(" "),
      class: "trail" }, g);
    if (pts.length <= 300) {
      for (const [x, y] of pts.slice(0, -1)) {
        node("circle", { cx: x, cy: y, r: 3, class: "trail-dot" }, g);
      }
    }
    if (this.hover !== null && pts[this.hover]) {
      const [x, y] = pts[this.hover];
      node("circle", { cx: x, cy: y, r: 7, class: "hover-ring" }, g);
    }
  }

  /**
   * The step -eta grad at true length, and the gradient itself drawn
   * uphill at a fixed screen length (its true length is often tiny).
   */
  gradArrows(g, obj, st, px, py) {
    const gr = obj.grad(st.c), n = Math.hypot(...gr);
    if (!(n > 0)) return;
    const ux = gr[0] / n, uy = -gr[1] / n;
    arrow(g, px, py, px + 70 * ux, py + 70 * uy, "grad", 10);
    const sx = this.sx(st.c[0] - st.eta * gr[0]);
    const sy = this.sy(st.c[1] - st.eta * gr[1]);
    arrow(g, px, py, sx, sy, "step", 11);
  }

  tipLabel(g, obj, c, px, py) {
    const x = clamp(px + 14, PLOT.x0 + 4, PLOT.x1 - 130);
    const y = clamp(py - 14, PLOT.y0 + 16, PLOT.y1 - 6);
    text(g, x, y, `${this.opts.fname} = ${fmt(obj.f(c))}`,
      { class: "tip-label" });
  }

  axes(svg) {
    const P = PLOT, lo0 = this.mid[0] - this.hw, hi0 = this.mid[0] + this.hw;
    const lo1 = this.mid[1] - this.hw, hi1 = this.mid[1] + this.hw;
    node("rect", { x: P.x0, y: P.y0, width: P.x1 - P.x0,
      height: P.y1 - P.y0, class: "frame" }, svg);
    for (const t of ticks(lo0, hi0, 6)) {
      text(svg, this.sx(t), P.y1 + 17, fmt(t),
        { class: "tick", "text-anchor": "middle" });
    }
    for (const t of ticks(lo1, hi1, 6)) {
      text(svg, P.x0 - 6, this.sy(t) + 4, fmt(t),
        { class: "tick", "text-anchor": "end" });
    }
    const [lx, ly] = this.opts.labels;
    text(svg, (P.x0 + P.x1) / 2, P.y1 + 40, lx,
      { class: "axis-label", "text-anchor": "middle" });
    text(svg, 16, (P.y0 + P.y1) / 2, ly, { class: "axis-label",
      "text-anchor": "middle",
      transform: `rotate(-90 16 ${(P.y0 + P.y1) / 2})` });
  }

  /** Arrowhead on the frame pointing toward an off-plot c. */
  edgeMarker(svg, c) {
    const d = [c[0] - this.mid[0], c[1] - this.mid[1]];
    const t = this.hw / Math.max(Math.abs(d[0]), Math.abs(d[1]));
    const ex = this.sx(this.mid[0] + d[0] * t);
    const ey = this.sy(this.mid[1] + d[1] * t);
    const n = Math.hypot(d[0], d[1]), ux = d[0] / n, uy = -d[1] / n;
    arrow(svg, ex - 26 * ux, ey - 26 * uy, ex, ey, "offplot", 13);
  }

  // ------------------------------------------------------------------ 3D

  /** World coordinates: floor in [-1, 1]^2, height 0..0.9 over the box. */
  world(c) {
    const z = Math.min(this.obj.excess(c) / this.top, 4);
    return [(c[0] - this.mid[0]) / this.hw, (c[1] - this.mid[1]) / this.hw,
      0.9 * z];
  }

  project(p) { return orbitProject(this.cam, p); }

  /** Parameters under a screen point, on the floor plane. */
  unprojectFloor(px, py) {
    const [X, Y] = orbitUnprojectFloor(this.cam, px, py);
    return [this.mid[0] + X * this.hw, this.mid[1] + Y * this.hw];
  }

  draw3d(obj, st) {
    const svg = this.svg;
    const P = c => this.project(this.world(c));
    const F = (X, Y) => this.project([X, Y, 0]);
    const at = (i, j) => this.at(i / MESH, j / MESH);

    const floor = node("g", { class: "floor" }, svg);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(
      ([X, Y]) => F(X, Y));
    node("polygon", { points: corners.map(p => `${p.x},${p.y}`).join(" ") },
      floor);
    const [lx, ly] = this.opts.labels;
    const l0 = F(0, -1.22), l1 = F(-1.22, 0);
    text(floor, l0.x, l0.y, lx, { class: "axis-label",
      "text-anchor": "middle" });
    text(floor, l1.x, l1.y, ly, { class: "axis-label",
      "text-anchor": "middle" });
    this.refs(floor, true);
    const lock = this.lockLine();
    if (lock) {
      const [a, b] = lock.map(p => {
        const w = this.world(p);
        return F(w[0], w[1]);
      });
      node("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "lockline" },
        floor);
    }
    const c = st.c, w = this.world(c);
    const tip = F(w[0], w[1]);

    const quads = [];
    for (let i = 0; i < MESH; i++) {
      for (let j = 0; j < MESH; j++) {
        const proj = [at(i, j), at(i + 1, j), at(i + 1, j + 1),
          at(i, j + 1)].map(P);
        quads.push({ proj, depth: proj.reduce((s, p) => s + p.depth, 0),
          t: this.shade(obj.excess(at(i + 0.5, j + 0.5))) });
      }
    }
    quads.sort((a, b) => b.depth - a.depth);
    const mesh = node("g", { class: "mesh" }, svg);
    for (const qd of quads) {
      node("polygon", { fill: ramp(qd.t),
        points: qd.proj.map(p => `${p.x},${p.y}`).join(" ") }, mesh);
    }

    const tp = st.trail.map(p => { const r = P(p); return [r.x, r.y]; });
    this.trail(svg, tp);
    const pc = P(c);
    node("line", { x1: pc.x, y1: pc.y, x2: tip.x, y2: tip.y,
      class: "dropline" }, svg);
    node("circle", { cx: pc.x, cy: pc.y, r: 6, class: "surf-pt" }, svg);
    node("circle", { cx: tip.x, cy: tip.y, r: 8, class: "handle" }, svg);
    text(svg, pc.x + 12, pc.y - 12, `${this.opts.fname} = ${fmt(obj.f(c))}`,
      { class: "tip-label" });
  }

  // ---------------------------------------------------------- pointer

  listen() {
    const svg = this.svg;
    svg.addEventListener("pointerdown", e => {
      if (e.button !== 0 || !this.obj) return;
      const p = svgPoint(svg, e);
      if (this.st.mode === "3d") {
        this.drag = e.target.classList.contains("handle")
          ? { tip: true, anchor: this.st.c.slice() }
          : { orbit: true, x: p.x, y: p.y };
      } else {
        const P = PLOT;
        if (p.x < P.x0 || p.x > P.x1 || p.y < P.y0 || p.y > P.y1) return;
        this.drag = e.target.closest(".truth-handle") ? { truth: true }
          : { tip: true, anchor: this.st.c.slice() };
      }
      this.hover = null;
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      this.move(p, e.shiftKey);
    });
    svg.addEventListener("pointermove", e => {
      if (this.drag) this.move(svgPoint(svg, e), e.shiftKey);
      else this.hoverAt(svgPoint(svg, e));
    });
    svg.addEventListener("pointerleave", () => this.setHover(null));
    const end = () => {
      // Clear the drag first so the final redraw drops the Shift guide.
      const d = this.drag;
      this.drag = null;
      if (d && d.tip) this.opts.onSet(this.st.c, true);
      if (d && d.truth) this.opts.onTruth(null, true);
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("wheel", e => {
      if (!this.st || this.st.mode !== "3d") return;
      e.preventDefault();
      this.cam.zoom = clamp(this.cam.zoom * Math.exp(-e.deltaY * 0.001),
        0.4, 3);
      this.render(this.obj, this.st);
    }, { passive: false });
  }

  /** Hover the trail iterate nearest the pointer, once there is a walk. */
  hoverAt(p) {
    const pts = this.trailPts, P = PLOT;
    const off = this.st.mode !== "3d"
      && (p.x < P.x0 || p.x > P.x1 || p.y < P.y0 || p.y > P.y1);
    if (pts.length < 2 || off) { this.setHover(null); return; }
    let best = 0, bd = Infinity;
    pts.forEach(([x, y], i) => {
      const d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    this.setHover(best);
  }

  setHover(i) {
    if (i === this.hover) return;
    this.hover = i;
    this.opts.onHover(i);
  }

  /** Follow the pointer; shift locks c to one axis through the anchor. */
  move(p, shift) {
    const d = this.drag;
    if (d.orbit) {
      this.cam.theta += (p.x - d.x) * 0.01;
      this.cam.phi = clamp(this.cam.phi + (p.y - d.y) * 0.01, 0.15, 1.45);
      d.x = p.x;
      d.y = p.y;
      this.render(this.obj, this.st);
      return;
    }
    const c = this.st.mode === "3d" ? this.unprojectFloor(p.x, p.y)
      : this.inv(clamp(p.x, PLOT.x0, PLOT.x1), clamp(p.y, PLOT.y0, PLOT.y1));
    if (d.truth) {
      this.opts.onTruth(c, false);
      return;
    }
    d.lock = undefined;
    if (shift) {
      // Both axes share one scale, so parameter units compare fairly.
      const a = d.anchor;
      d.lock = Math.abs(c[0] - a[0]) >= Math.abs(c[1] - a[1]) ? 0 : 1;
      c[1 - d.lock] = a[1 - d.lock];
    }
    this.opts.onSet(c, false);
  }
}

/** SVG path data for a list of two-point segments. */
function path(segs) {
  return segs.map(([[x0, y0], [x1, y1]]) =>
    `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`)
    .join("");
}
