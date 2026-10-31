// Analytic top-down 2D view on its own canvas (not a readback of the GPU sim). For every source the
// crests already emitted are circles r = v (t - t_n), t_n = (n + 1/4 - phi / 2 pi) / f, between the
// source's emission start and stop; troughs are the half-period circles. Same v, f, phase, positions
// and clock as the sim. Optional grid, interference lines (lines.js), S1-S2 line, source markers.
import { WAVE_SPEED, BALL_HEX, MAX_SOURCES } from './config.js';
import { STR } from './ui/strings.js';
import { LINE_COLORS, MULTI_LEVELS } from './lines.js';

const BG = '#0A0D11';
const GRID = 'rgba(255, 255, 255, 0.07)';
const WAVE = '#FFFFFF';
const LINK = 'rgba(204, 96, 88, 0.8)';       // muted red, S1-S2
const GRID_STEPS = [0.25, 0.5, 1, 2, 4];
const GRID_MIN_PX = 40;
const CURVE_SAMPLES = 128;
const MARKER_R = 7;                             // source marker radius, CSS px (hovered: +2)
const LINE_CLEAR_PX = MARKER_R + 4;             // lines end this far from a source centre (just outside the dot)
const TWO_PI = Math.PI * 2;
const MAX_DPR = 2;                              // a 3x canvas costs 2.25x the fill for no visible gain on thin lines
const RING_STEPS = 96;                          // angular samples used to find the on-screen part of a ring
const CONTOUR_PX = 5;                           // 3-4 sources: envelope sample spacing (CSS px)
const PT_STRIDE = 6;                            // contour polyline points: x, y (CSS px), r_0..r_3 (world distances)
const FADE_LEVELS = 4;                          // alpha steps of the fading contour segments

export class View2D {
  constructor(sceneCanvas) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'view2d';
    this.canvas.hidden = true;
    sceneCanvas.after(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.dpr = 1;
    this._xs = new Float32Array(CURVE_SAMPLES + 1);
    this._ys = new Float32Array(CURVE_SAMPLES + 1);
    this._as = new Float32Array(CURVE_SAMPLES + 1);
    this._dn = new Float32Array(CURVE_SAMPLES + 1);   // distance to the nearest source minus the clearance
    this._s = { x: 0, y: 0 };
    this._dashTrough = [3, 4];
    this._dashMin = [7, 5];
    this._dashLink = [6, 5];
    this._noDash = [];
    this._cos = new Float32Array(RING_STEPS);
    this._sin = new Float32Array(RING_STEPS);
    this._on = new Uint8Array(RING_STEPS);
    for (let k = 0; k < RING_STEPS; k++) {
      this._cos[k] = Math.cos((k * TWO_PI) / RING_STEPS);
      this._sin[k] = Math.sin((k * TWO_PI) / RING_STEPS);
    }
    this._fontPx = 0;
    this._font = '';
    // 3-4 sources: contour polylines, rebuilt only when the inputs change (see _contours).
    this._cKey = new Float64Array(17).fill(NaN);
    this._cGrid = new Float32Array(0);
    this._ePx = new Float32Array(0);    // per grid edge: crossing point of the current level
    this._ePy = new Float32Array(0);
    this._adj0 = new Int32Array(0);     // per grid edge: the (at most two) segments ending on it
    this._adj1 = new Int32Array(0);
    this._segA = new Int32Array(0);     // per segment: its two edge ids
    this._segB = new Int32Array(0);
    this._segSeen = new Uint8Array(0);
    this._cMax = { pts: new Float32Array(0), n: 0, starts: new Int32Array(0), chains: 0 };
    this._cMin = { pts: new Float32Array(0), n: 0, starts: new Int32Array(0), chains: 0 };
    this._cVis = new Float32Array(0);
    this._env = { n: 0, arg: 0, near: 0 };
  }

  get visible() { return !this.canvas.hidden; }

  setVisible(v) { this.canvas.hidden = !v; }

  resize(width, height) {
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.round(width * this.dpr);
    const h = Math.round(height * this.dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  draw(framing, sources, lines, settings, hover) {
    const ctx = this.ctx;
    const W = framing.width;
    const H = framing.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    if (settings.show2dGrid) this._grid(framing);
    this._waves(framing, sources, settings.show2dTroughs);
    if (lines.multi) {
      if (lines.drawMax || lines.drawMin) this._contours(framing, lines);
      if (lines.drawMin) this._polylines(lines, this._cMin, LINE_COLORS.min, this._dashMin);
      if (lines.drawMax) this._polylines(lines, this._cMax, LINE_COLORS.max, this._noDash);
    } else {
      if (lines.drawMin) this._lines(framing, lines, lines.minDelta, lines.minCount, LINE_COLORS.min, this._dashMin);
      if (lines.drawMax) this._lines(framing, lines, lines.maxDelta, lines.maxCount, LINE_COLORS.max, this._noDash);
    }
    this._ballColor = settings.ballColor || BALL_HEX;
    this._markers(framing, sources, hover);
  }

  // Faint square grid through the origin; spacing a round number of world units, >= GRID_MIN_PX.
  _grid(f) {
    const ctx = this.ctx;
    let step = GRID_STEPS[GRID_STEPS.length - 1];
    for (const g of GRID_STEPS) {
      if (g * f.scale2d >= GRID_MIN_PX) { step = g; break; }
    }
    const px = step * f.scale2d;
    const cx = f.width / 2;
    const cy = f.height / 2;
    const d = this.dpr;
    ctx.beginPath();
    // Snap to device pixel centres: crisp hairlines.
    for (let x = cx - Math.floor(cx / px) * px; x <= f.width; x += px) {
      const sx = (Math.round(x * d) + 0.5) / d;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, f.height);
    }
    for (let y = cy - Math.floor(cy / px) * px; y <= f.height; y += px) {
      const sy = (Math.round(y * d) + 0.5) / d;
      ctx.moveTo(0, sy);
      ctx.lineTo(f.width, sy);
    }
    ctx.setLineDash(this._noDash);
    ctx.lineWidth = 1 / this.dpr;
    ctx.strokeStyle = GRID;
    ctx.stroke();
  }

  _waves(f, sources, troughs) {
    const ctx = this.ctx;
    const t = sources.time;
    const p = sources.positions;
    const W = f.width;
    const H = f.height;
    const scale = f.scale2d;
    ctx.strokeStyle = WAVE;
    for (let pass = troughs ? 0 : 1; pass < 2; pass++) {
      const crest = pass === 1;              // troughs first, crests on top
      ctx.setLineDash(crest ? this._noDash : this._dashTrough);
      ctx.lineWidth = crest ? 1.25 : 1;
      const phaseAt = crest ? 0.25 : 0.75;
      for (let i = 0; i < sources.count; i++) {
        const fr = sources.freqs[i];
        const cyc = sources.phaseOf(i) / TWO_PI;
        const sc = f.worldToScreen2d(p[i * 2], p[i * 2 + 1], this._s);
        const sx = sc.x;
        const sy = sc.y;
        // Only rings whose radius lies between the nearest and the farthest point of the screen can be seen.
        const rMin = Math.hypot(Math.max(0, -sx, sx - W), Math.max(0, -sy, sy - H));
        const rMax = Math.hypot(Math.max(sx, W - sx), Math.max(sy, H - sy));
        // Emission times t_n = (n + phaseAt - cyc) / f inside [start, min(t, stop)], not yet off screen.
        const tFrom = Math.max(sources.start[i], t - rMax / (scale * WAVE_SPEED));
        const tTo = Math.min(t, sources.stop[i]);
        const n0 = Math.ceil(tFrom * fr - phaseAt + cyc);
        const n1 = Math.floor(tTo * fr - phaseAt + cyc);
        for (let n = n0; n <= n1; n++) {
          const r = WAVE_SPEED * (t - (n + phaseAt - cyc) / fr);
          const rPx = r * scale;
          if (r <= 0 || rPx < rMin - 2) continue;
          // Amplitude falls off as 1 / sqrt(r); keep far rings readable.
          const a = Math.max(0.3, 0.95 / Math.sqrt(1 + r / 1.5));
          ctx.globalAlpha = crest ? a : a * 0.5;
          ctx.beginPath();
          this._ring(sx, sy, rPx, W, H);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Adds the on-screen part of a circle to the current path. Off-screen arcs are skipped, which matters
  // most for dashed rings: dash generation is proportional to the whole circumference.
  _ring(cx, cy, r, W, H) {
    const ctx = this.ctx;
    const n = RING_STEPS;
    const on = this._on;
    const cs = this._cos;
    const sn = this._sin;
    const pad = 4;
    let count = 0;
    for (let k = 0; k < n; k++) {
      const x = cx + r * cs[k];
      const y = cy + r * sn[k];
      on[k] = x >= -pad && x <= W + pad && y >= -pad && y <= H + pad ? 1 : 0;
      count += on[k];
    }
    if (count === n || r < 24) {
      ctx.arc(cx, cy, r, 0, TWO_PI);
      return;
    }
    if (count === 0) {
      // Sampling can miss a short chord (a ring just grazing a corner); the pixel cost of drawing it whole
      // is only paid for small rings, so skip.
      return;
    }
    // Start at an off-screen sample so no run wraps around index 0.
    let first = 0;
    while (on[first]) first++;
    const step = TWO_PI / n;
    let k = 0;
    while (k < n) {
      const a = (first + k) % n;
      if (!on[a]) { k++; continue; }
      let len = 0;
      while (k + len < n && on[(first + k + len) % n]) len++;
      const a0 = (first + k) * step - step;
      ctx.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
      ctx.arc(cx, cy, r, a0, a0 + (len + 1) * step + step);
      k += len;
    }
  }

  // Hyperbola branches r2 - r1 = delta. In the frame centred between S1 and S2 (X along S1 -> S2):
  // X = -(delta / 2) cosh s, Y = b sinh s, b^2 = c^2 - (delta / 2)^2, c = d / 2; r1 + r2 = 2 c cosh s.
  _lines(f, L, deltas, count, color, dash) {
    if (L.d < 1e-6) return;
    const ctx = this.ctx;
    const c = L.d / 2;
    const ux = (L.bx - L.ax) / L.d;
    const uz = (L.bz - L.az) / L.d;
    const mx = (L.ax + L.bx) / 2;
    const mz = (L.az + L.bz) / 2;
    const reach = Math.hypot(f.width, f.height) / f.scale2d + Math.hypot(mx, mz);
    const sMax = Math.acosh(Math.max(1.0001, reach / c + 1));
    const xs = this._xs;
    const ys = this._ys;
    const as = this._as;
    const dn = this._dn;
    const clear = LINE_CLEAR_PX / f.scale2d;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    for (let k = 0; k < count; k++) {
      const half = deltas[k] / 2;
      const b = Math.sqrt(Math.max(c * c - half * half, 0));
      // |delta| = d: the branch degenerates into the ray beyond a source, traced twice; draw one half only.
      const j0 = b < 1e-6 * c ? CURVE_SAMPLES / 2 : 0;
      for (let j = 0; j <= CURVE_SAMPLES; j++) {
        const sv = -sMax + (2 * sMax * j) / CURVE_SAMPLES;
        const X = -half * Math.cosh(sv);
        const Y = b * Math.sinh(sv);
        const wx = mx + X * ux - Y * uz;
        const wz = mz + X * uz + Y * ux;
        const r1 = Math.hypot(wx - L.ax, wz - L.az);
        const r2 = Math.hypot(wx - L.bx, wz - L.bz);
        dn[j] = Math.min(r1, r2) - clear;
        as[j] = j < j0 ? 0 : L.visibility(r1, r2);
        const sc = f.worldToScreen2d(wx, wz, this._s);
        xs[j] = sc.x;
        ys[j] = sc.y;
      }
      // Fully visible runs as one path (continuous dashes), clipped exactly at the clearance circle
      // around each marker; fading segments (lines still growing) one by one.
      ctx.globalAlpha = 1;
      ctx.beginPath();
      let pen = false;
      for (let j = 1; j <= CURVE_SAMPLES; j++) {
        if (Math.min(as[j - 1], as[j]) < 0.999) { pen = false; continue; }
        const in0 = dn[j - 1] >= 0;
        const in1 = dn[j] >= 0;
        if (!in0 && !in1) { pen = false; continue; }
        const t = in0 && in1 ? 0 : dn[j - 1] / (dn[j - 1] - dn[j]);   // crossing of the clearance circle
        const cx = xs[j - 1] + (xs[j] - xs[j - 1]) * t;
        const cy = ys[j - 1] + (ys[j] - ys[j - 1]) * t;
        if (in0 && in1) {
          if (!pen) ctx.moveTo(xs[j - 1], ys[j - 1]);
          ctx.lineTo(xs[j], ys[j]);
          pen = true;
        } else if (in0) {
          if (!pen) ctx.moveTo(xs[j - 1], ys[j - 1]);
          ctx.lineTo(cx, cy);
          pen = false;
        } else {
          ctx.moveTo(cx, cy);
          ctx.lineTo(xs[j], ys[j]);
          pen = true;
        }
      }
      ctx.stroke();
      for (let j = 1; j <= CURVE_SAMPLES; j++) {
        const a = Math.min(as[j - 1], as[j]);
        if (a >= 0.999 || a <= 0.01 || dn[j - 1] < 0 || dn[j] < 0) continue;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(xs[j - 1], ys[j - 1]);
        ctx.lineTo(xs[j], ys[j]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // 3-4 sources: marching squares on the envelope n (lines.js) sampled every CONTOUR_PX, for the maxima
  // and minima levels, chained into polylines (so the minima dashes run evenly along each contour). Runs
  // only when count / lambda / positions / phases / canvas change; the cached polylines are redrawn every frame.
  _contours(f, L) {
    const key = this._cKey;
    let same = key[0] === L.count && key[1] === L.lambda && key[2] === f.width && key[3] === f.height
      && key[4] === f.scale2d;
    for (let i = 0; i < 4; i++) {
      const on = i < L.count;
      const x = on ? L.mx[i] : 0;
      const z = on ? L.mz[i] : 0;
      const ph = on ? L.mPhase[i] : 0;
      if (key[5 + i] !== x || key[9 + i] !== z || key[13 + i] !== ph) same = false;
      key[5 + i] = x; key[9 + i] = z; key[13 + i] = ph;
    }
    if (same) return;
    key[0] = L.count; key[1] = L.lambda; key[2] = f.width; key[3] = f.height; key[4] = f.scale2d;

    const nx = Math.ceil(f.width / CONTOUR_PX) + 1;
    const ny = Math.ceil(f.height / CONTOUR_PX) + 1;
    const cells = nx * ny;
    if (this._cGrid.length < cells) {
      this._cGrid = new Float32Array(cells);
      this._ePx = new Float32Array(cells * 2);
      this._ePy = new Float32Array(cells * 2);
      this._adj0 = new Int32Array(cells * 2);
      this._adj1 = new Int32Array(cells * 2);
    }
    const g = this._cGrid;
    const w = this._s;
    const env = this._env;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        f.screenToWorld2d(i * CONTOUR_PX, j * CONTOUR_PX, w);
        g[j * nx + i] = L.envelope(w.x, w.z, env).n;
      }
    }
    this._march(f, L, nx, ny, MULTI_LEVELS.max, this._cMax);
    this._march(f, L, nx, ny, MULTI_LEVELS.min, this._cMin);
  }

  // Contour n = level as polylines into out { pts, n, starts, chains }. Grid edges are numbered
  // (j nx + i) 2 (horizontal, (i, j) -> (i + 1, j)) and + 1 (vertical, (i, j) -> (i, j + 1)); a contour
  // crosses an edge at most once, so two segments sharing an edge id are joined there.
  _march(f, L, nx, ny, level, out) {
    const g = this._cGrid;
    const ex = this._ePx;
    const ey = this._ePy;
    const adj0 = this._adj0;
    const adj1 = this._adj1;
    adj0.fill(-1, 0, nx * ny * 2);
    adj1.fill(-1, 0, nx * ny * 2);
    const s = CONTOUR_PX;
    const w = this._s;
    const env = this._env;
    const clear = LINE_CLEAR_PX / f.scale2d;
    let nSeg = 0;
    const cross = (id, va, vb, x0, y0, horizontal) => {
      const t = (level - va) / (vb - va);
      ex[id] = horizontal ? x0 + s * t : x0;
      ey[id] = horizontal ? y0 : y0 + s * t;
    };
    const emit = (e0, e1) => {
      // Segments next to a source are dropped (the line ends just outside the marker).
      f.screenToWorld2d((ex[e0] + ex[e1]) / 2, (ey[e0] + ey[e1]) / 2, w);
      if (L.envelope(w.x, w.z, env).near < clear) return;
      if (this._segA.length <= nSeg) {
        const size = Math.max(4096, this._segA.length * 2);
        const a = new Int32Array(size); a.set(this._segA); this._segA = a;
        const b = new Int32Array(size); b.set(this._segB); this._segB = b;
      }
      this._segA[nSeg] = e0;
      this._segB[nSeg] = e1;
      if (adj0[e0] < 0) adj0[e0] = nSeg; else adj1[e0] = nSeg;
      if (adj0[e1] < 0) adj0[e1] = nSeg; else adj1[e1] = nSeg;
      nSeg++;
    };
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = g[j * nx + i];
        const b = g[j * nx + i + 1];
        const c = g[(j + 1) * nx + i + 1];
        const d = g[(j + 1) * nx + i];
        const idx = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const x0 = i * s;
        const y0 = j * s;
        const e0 = (j * nx + i) * 2;              // top
        const e1 = (j * nx + i + 1) * 2 + 1;      // right
        const e2 = ((j + 1) * nx + i) * 2;        // bottom
        const e3 = (j * nx + i) * 2 + 1;          // left
        if ((a >= level) !== (b >= level)) cross(e0, a, b, x0, y0, true);
        if ((b >= level) !== (c >= level)) cross(e1, b, c, x0 + s, y0, false);
        if ((d >= level) !== (c >= level)) cross(e2, d, c, x0, y0 + s, true);
        if ((a >= level) !== (d >= level)) cross(e3, a, d, x0, y0, false);
        switch (idx) {
          case 1: case 14: emit(e3, e0); break;
          case 2: case 13: emit(e0, e1); break;
          case 3: case 12: emit(e3, e1); break;
          case 4: case 11: emit(e1, e2); break;
          case 6: case 9: emit(e0, e2); break;
          case 7: case 8: emit(e3, e2); break;
          case 5: case 10: {
            // Saddle: the centre value decides which corners are connected.
            const centreAbove = (a + b + c + d) / 4 >= level;
            if ((idx === 5) === centreAbove) { emit(e0, e1); emit(e2, e3); } else { emit(e3, e0); emit(e1, e2); }
            break;
          }
          default: break;
        }
      }
    }
    this._chain(L, f, nSeg, out);
  }

  // Joins the segments into polylines (open chains start at a free end; closed loops repeat their first point).
  _chain(L, f, nSeg, out) {
    const A = this._segA;
    const B = this._segB;
    const adj0 = this._adj0;
    const adj1 = this._adj1;
    if (this._segSeen.length < nSeg) this._segSeen = new Uint8Array(A.length);
    const seen = this._segSeen;
    seen.fill(0, 0, nSeg);
    const other = (seg, e) => (adj0[e] === seg ? adj1[e] : adj0[e]);
    const w = this._s;
    let n = 0;
    let chains = 0;
    const push = (e) => {
      if (out.pts.length < (n + 1) * PT_STRIDE) {
        const bigger = new Float32Array(Math.max(4096 * PT_STRIDE, out.pts.length * 2));
        bigger.set(out.pts);
        out.pts = bigger;
      }
      const o = n * PT_STRIDE;
      const x = this._ePx[e];
      const y = this._ePy[e];
      out.pts[o] = x;
      out.pts[o + 1] = y;
      f.screenToWorld2d(x, y, w);
      for (let k = 0; k < 4; k++) out.pts[o + 2 + k] = k < L.count ? Math.hypot(w.x - L.mx[k], w.z - L.mz[k]) : 0;
      n++;
    };
    for (let s0 = 0; s0 < nSeg; s0++) {
      if (seen[s0]) continue;
      // Walk back from s0 to a free end (or once around a loop).
      let seg = s0;
      let e = A[s0];
      for (let guard = 0; guard < nSeg; guard++) {
        const nxt = other(seg, e);
        if (nxt < 0) break;
        if (nxt === s0) { seg = s0; e = A[s0]; break; }
        e = A[nxt] === e ? B[nxt] : A[nxt];
        seg = nxt;
      }
      if (out.starts.length <= chains + 1) {
        const bigger = new Int32Array(Math.max(1024, out.starts.length * 2));
        bigger.set(out.starts);
        out.starts = bigger;
      }
      out.starts[chains++] = n;
      push(e);
      for (;;) {
        seen[seg] = 1;
        e = A[seg] === e ? B[seg] : A[seg];
        push(e);
        const nxt = other(seg, e);
        if (nxt < 0 || seen[nxt]) break;
        seg = nxt;
      }
    }
    out.starts[chains] = n;
    out.n = n;
    out.chains = chains;
  }

  // Cached contour polylines with the grow-outward fade (lines.js visibilityMulti), quantised to a few
  // alpha levels so a frame costs at most FADE_LEVELS strokes per colour. Runs of equal alpha are one
  // subpath, so the dash pattern stays continuous along a contour.
  _polylines(L, c, color, dash) {
    const ctx = this.ctx;
    const pts = c.pts;
    if (this._cVis.length < c.n) this._cVis = new Float32Array(pts.length / PT_STRIDE);
    const vis = this._cVis;
    for (let i = 0; i < c.n; i++) vis[i] = L.visibilityMulti(pts, i * PT_STRIDE + 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    for (let lv = 1; lv <= FADE_LEVELS; lv++) {
      const lo = (lv - 1) / FADE_LEVELS;
      const hi = lv / FADE_LEVELS;
      ctx.globalAlpha = hi;
      ctx.beginPath();
      let any = false;
      for (let ch = 0; ch < c.chains; ch++) {
        const end = c.starts[ch + 1];
        let pen = false;
        for (let i = c.starts[ch] + 1; i < end; i++) {
          const a = Math.min(vis[i - 1], vis[i]);
          if (a <= lo || (a > hi && lv < FADE_LEVELS)) { pen = false; continue; }
          if (!pen) ctx.moveTo(pts[(i - 1) * PT_STRIDE], pts[(i - 1) * PT_STRIDE + 1]);
          ctx.lineTo(pts[i * PT_STRIDE], pts[i * PT_STRIDE + 1]);
          pen = true;
          any = true;
        }
      }
      if (any) ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _markers(f, sources, hover) {
    const ctx = this.ctx;
    const p = sources.positions;
    const n = sources.count;
    ctx.globalAlpha = 1;
    if (n === 2) {
      const a = f.worldToScreen2d(p[0], p[1], this._s);
      const ax = a.x;
      const ay = a.y;
      const b = f.worldToScreen2d(p[2], p[3], this._s);
      ctx.setLineDash(this._dashLink);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = LINK;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash(this._noDash);
    const fontPx = Math.round(Math.min(16, Math.max(12, Math.min(f.width, f.height) * 0.018)));
    if (fontPx !== this._fontPx) {
      this._fontPx = fontPx;
      this._font = `600 ${fontPx}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
    }
    ctx.font = this._font;
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < n && i < MAX_SOURCES; i++) {
      const s = f.worldToScreen2d(p[i * 2], p[i * 2 + 1], this._s);
      const hot = i === hover;
      const r = hot ? MARKER_R + 2 : MARKER_R;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TWO_PI);
      ctx.fillStyle = this._ballColor;
      ctx.fill();
      ctx.lineWidth = hot ? 2.5 : 2;
      ctx.strokeStyle = WAVE;
      ctx.stroke();
      ctx.fillStyle = WAVE;
      ctx.fillText(STR.sourceName(i), s.x + r + 4, s.y - r - 2);
    }
  }
}
