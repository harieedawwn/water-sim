// Analytic top-down 2D view on its own canvas (not a readback of the GPU sim). For every source the
// crests already emitted are circles r = v (t - t_n), t_n = (n + 1/4 - phi / 2 pi) / f, between the
// source's emission start and stop; troughs are the half-period circles. Same v, f, phase, positions
// and clock as the sim. Optional grid, interference lines (lines.js), S1-S2 line, source markers.
import { WAVE_SPEED, BALL_HEX, MAX_SOURCES } from './config.js';
import { STR } from './ui/strings.js';
import { LINE_COLORS, MULTI_LEVELS, MULTI_DASHES } from './lines.js';

const BG = '#0A0D11';
const GRID = 'rgba(255, 255, 255, 0.07)';
const WAVE = '#FFFFFF';
const LINK = 'rgba(204, 96, 88, 0.8)';       // muted red, S1-S2
const GRID_STEPS = [0.25, 0.5, 1, 2, 4];
const GRID_MIN_PX = 40;
const CURVE_SAMPLES = 128;
const NEAR_SOURCE = 0.6;                        // world units kept clear around a marker
const TWO_PI = Math.PI * 2;
const MAX_DPR = 2;                              // a 3x canvas costs 2.25x the fill for no visible gain on thin lines
const RING_STEPS = 96;                          // angular samples used to find the on-screen part of a ring
const CONTOUR_PX = 5;                           // 3-4 sources: envelope sample spacing (CSS px)
const SEG_STRIDE = 8;
const FADE_LEVELS = 4;                          // alpha steps of the fading contour segments                           // x1, y1, x2, y2, r_0..r_3 (distances at the midpoint)

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
    // 3-4 sources: contour segments, rebuilt only when the inputs change (see _contours).
    this._cKey = new Float64Array(17).fill(NaN);
    this._cGrid = new Float32Array(0);
    this._cMax = new Float32Array(0);
    this._cMin = new Float32Array(0);
    this._cMaxN = 0;
    this._cMinN = 0;
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
      if (lines.drawMin) this._segments(lines, this._cMin, this._cMinN, LINE_COLORS.min);
      if (lines.drawMax) this._segments(lines, this._cMax, this._cMaxN, LINE_COLORS.max);
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
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    for (let k = 0; k < count; k++) {
      const half = deltas[k] / 2;
      const b = Math.sqrt(Math.max(c * c - half * half, 0));
      for (let j = 0; j <= CURVE_SAMPLES; j++) {
        const sv = -sMax + (2 * sMax * j) / CURVE_SAMPLES;
        const X = -half * Math.cosh(sv);
        const Y = b * Math.sinh(sv);
        const wx = mx + X * ux - Y * uz;
        const wz = mz + X * uz + Y * ux;
        const r1 = Math.hypot(wx - L.ax, wz - L.az);
        const r2 = Math.hypot(wx - L.bx, wz - L.bz);
        const near = Math.min(r1, r2) < NEAR_SOURCE ? 0 : 1;
        as[j] = L.visibility(r1, r2) * near;
        const sc = f.worldToScreen2d(wx, wz, this._s);
        xs[j] = sc.x;
        ys[j] = sc.y;
      }
      // Fully visible runs as one path (continuous dashes), fading segments one by one.
      ctx.globalAlpha = 1;
      ctx.beginPath();
      let pen = false;
      for (let j = 1; j <= CURVE_SAMPLES; j++) {
        if (Math.min(as[j - 1], as[j]) >= 0.999) {
          if (!pen) ctx.moveTo(xs[j - 1], ys[j - 1]);
          ctx.lineTo(xs[j], ys[j]);
          pen = true;
        } else {
          pen = false;
        }
      }
      ctx.stroke();
      for (let j = 1; j <= CURVE_SAMPLES; j++) {
        const a = Math.min(as[j - 1], as[j]);
        if (a >= 0.999 || a <= 0.01) continue;
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
  // and minima levels. Runs only when count / lambda / positions / phases / canvas change; the cached
  // segments are redrawn every frame.
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
    if (this._cGrid.length < nx * ny) this._cGrid = new Float32Array(nx * ny);
    const g = this._cGrid;
    const w = this._s;
    const env = this._env;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        f.screenToWorld2d(i * CONTOUR_PX, j * CONTOUR_PX, w);
        g[j * nx + i] = L.envelope(w.x, w.z, env).n;
      }
    }
    this._cMaxN = this._march(f, L, nx, ny, MULTI_LEVELS.max, false);
    this._cMinN = this._march(f, L, nx, ny, MULTI_LEVELS.min, true);
  }

  // Segments of the contour n = level into this._cMax / this._cMin; returns the segment count.
  // Minima keep only the "on" part of the dash pattern (dashes follow arg(sum), as in the 3D shader).
  _march(f, L, nx, ny, level, dashed) {
    const g = this._cGrid;
    let buf = dashed ? this._cMin : this._cMax;
    let n = 0;
    const s = CONTOUR_PX;
    const pt = this._xs;              // scratch: 4 edge points (x, y) in _xs[0..3], _ys[0..3]
    const pu = this._ys;
    const w = this._s;
    const env = this._env;
    const edge = (e, i, j, a, b, c, d) => {
      // e: 0 top (a-b), 1 right (b-c), 2 bottom (d-c), 3 left (a-d)
      const x0 = i * s;
      const y0 = j * s;
      if (e === 0) { pt[0] = x0 + s * (level - a) / (b - a); pu[0] = y0; }
      else if (e === 1) { pt[1] = x0 + s; pu[1] = y0 + s * (level - b) / (c - b); }
      else if (e === 2) { pt[2] = x0 + s * (level - d) / (c - d); pu[2] = y0 + s; }
      else { pt[3] = x0; pu[3] = y0 + s * (level - a) / (d - a); }
    };
    const emit = (e0, e1) => {
      const x1 = pt[e0], y1 = pu[e0], x2 = pt[e1], y2 = pu[e1];
      f.screenToWorld2d((x1 + x2) / 2, (y1 + y2) / 2, w);
      L.envelope(w.x, w.z, env);
      if (env.near < NEAR_SOURCE) return;
      if (dashed) {
        let u = (env.arg / TWO_PI) * MULTI_DASHES;
        u -= Math.floor(u);
        if (u >= 0.6) return;
      }
      if (buf.length < (n + 1) * SEG_STRIDE) {
        const bigger = new Float32Array(Math.max(1024 * SEG_STRIDE, buf.length * 2));
        bigger.set(buf);
        buf = bigger;
      }
      const o = n * SEG_STRIDE;
      buf[o] = x1; buf[o + 1] = y1; buf[o + 2] = x2; buf[o + 3] = y2;
      for (let k = 0; k < 4; k++) {
        buf[o + 4 + k] = k < L.count ? Math.hypot(w.x - L.mx[k], w.z - L.mz[k]) : 0;
      }
      n++;
    };
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = g[j * nx + i];
        const b = g[j * nx + i + 1];
        const c = g[(j + 1) * nx + i + 1];
        const d = g[(j + 1) * nx + i];
        const idx = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        for (let e = 0; e < 4; e++) edge(e, i, j, a, b, c, d);
        switch (idx) {
          case 1: case 14: emit(3, 0); break;
          case 2: case 13: emit(0, 1); break;
          case 3: case 12: emit(3, 1); break;
          case 4: case 11: emit(1, 2); break;
          case 6: case 9: emit(0, 2); break;
          case 7: case 8: emit(3, 2); break;
          case 5: case 10: {
            // Saddle: the centre value decides which corners are connected.
            const centreAbove = (a + b + c + d) / 4 >= level;
            if ((idx === 5) === centreAbove) { emit(0, 1); emit(2, 3); } else { emit(3, 0); emit(1, 2); }
            break;
          }
          default: break;
        }
      }
    }
    if (dashed) this._cMin = buf; else this._cMax = buf;
    return n;
  }

  // Cached contour segments with the grow-outward fade (lines.js visibilityMulti), quantised to a few
  // alpha levels so a frame costs at most FADE_LEVELS strokes per colour.
  _segments(L, buf, count, color) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(this._noDash);
    for (let lv = 1; lv <= FADE_LEVELS; lv++) {
      const lo = (lv - 1) / FADE_LEVELS;
      const hi = lv / FADE_LEVELS;
      ctx.globalAlpha = hi;
      ctx.beginPath();
      let any = false;
      for (let k = 0; k < count; k++) {
        const o = k * SEG_STRIDE;
        const a = L.visibilityMulti(buf, o + 4);
        if (a <= lo || (a > hi && lv < FADE_LEVELS)) continue;
        ctx.moveTo(buf[o], buf[o + 1]);
        ctx.lineTo(buf[o + 2], buf[o + 3]);
        any = true;
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
      const r = hot ? 9 : 7;
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
