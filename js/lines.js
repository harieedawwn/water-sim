// Interference maxima / minima of two sources (S1, S2) of equal frequency: availability,
// the orders k that exist, and how far from each source the pattern is already stable, so the lines
// grow outward behind the wavefronts. Shared by the 3D overlay (water shader) and the 2D view.
//
// 3 or 4 sources of equal frequency (the "multi" path): maxima / minima are no longer hyperbolas but a
// lattice of small cells, so the lines are contours of the normalised amplitude envelope
//   n(x) = |sum_i w_i e^{j(phi_i - k r_i)}| / sum_i w_i,  w_i = 1 / sqrt(max(r_i, r_min)),  k = 2 pi / lambda:
// maxima = contour n = LEVEL_MAX (solid), minima = contour n = LEVEL_MIN (dashed).
//
// Source i oscillates as sin(w t + phi_i) and emits sin(w t + phi_i - k r_i). With dphi = phi2 - phi1:
//   maximum: r2 - r1 = (k + dphi / 2 pi) lambda,   minimum: r2 - r1 = (k + 1/2 + dphi / 2 pi) lambda,
// and only |r2 - r1| <= d (distance S1-S2) exists. (The phase offset setting is applied to S2, so a
// positive offset bends the central maximum towards S1.)
import { WAVE_SPEED } from './config.js';

export const LINE_COLORS = { max: '#F2B544', min: '#8FDDF2' };   // warm amber (solid), light cyan (dashed)
const MARGIN_WAVELENGTHS = 1;    // lines start one wavelength behind each wavefront
const FADE_SECONDS = 1;          // then fade in over this much wavefront travel
const MAX_ORDERS = 256;
export const MULTI_LEVELS = { max: 0.85, min: 0.2, rMin: 0.3 };   // contour levels of n(x), r_min (world)
export const MULTI_DASHES = 4;   // minima dashes per turn of arg(sum) (one turn around every node)
const TWO_PI = Math.PI * 2;

export class InterferenceLines {
  constructor() {
    this.available = false;      // 2-4 sources with equal frequency
    this.multi = false;          // 3 or 4 sources: envelope contours (see top)
    this.count = 0;              // sources used by the multi path
    this.k = TWO_PI / 0.4;
    this.mx = new Float64Array(4);       // multi path: positions, phases relative to S1, stable radius
    this.mz = new Float64Array(4);
    this.mPhase = new Float64Array(4);
    this.mReach = new Float64Array(4);
    this.drawMax = false;        // toggle on, available, and some of the pattern is stable
    this.drawMin = false;
    this.ax = 0; this.az = 0;    // S1
    this.bx = 0; this.bz = 0;    // S2
    this.d = 0;
    this.lambda = 0.4;
    this.cycles = 0;             // dphi / 2 pi, in [-0.5, 0.5)
    this.reachA = -1;            // world radius around S1 / S2 inside which the pattern is stable
    this.reachB = -1;
    this.fade = WAVE_SPEED * FADE_SECONDS;
    // r2 - r1 of every existing line and its order k.
    this.maxDelta = new Float64Array(MAX_ORDERS);
    this.maxK = new Int32Array(MAX_ORDERS);
    this.maxCount = 0;
    this.minDelta = new Float64Array(MAX_ORDERS);
    this.minK = new Int32Array(MAX_ORDERS);
    this.minCount = 0;
  }

  update(settings, sources) {
    const n = sources.count;
    let same = n >= 2;
    for (let i = 1; i < n; i++) if (sources.freqs[i] !== sources.freqs[0]) same = false;
    this.available = same && n <= 4;
    this.multi = this.available && n >= 3;
    if (!this.available) {
      this.drawMax = this.drawMin = false;
      return;
    }
    if (this.multi) {
      this._updateMulti(settings, sources, n);
      return;
    }
    const p = sources.positions;
    this.ax = p[0]; this.az = p[1];
    this.bx = p[2]; this.bz = p[3];
    this.d = Math.hypot(this.bx - this.ax, this.bz - this.az);
    this.lambda = WAVE_SPEED / sources.freqs[0];
    let c = (sources.phaseOf(1) - sources.phaseOf(0)) / (2 * Math.PI);
    c -= Math.floor(c + 0.5);
    this.cycles = c;

    const t = sources.time;
    const margin = MARGIN_WAVELENGTHS * this.lambda;
    this.reachA = Number.isFinite(sources.stop[0]) ? -1 : WAVE_SPEED * (t - sources.start[0]) - margin;
    this.reachB = Number.isFinite(sources.stop[1]) ? -1 : WAVE_SPEED * (t - sources.start[1]) - margin;
    const stable = this.reachA > 0 && this.reachB > 0 && this.reachA + this.reachB > this.d;
    this.drawMax = settings.showMaxima && stable;
    this.drawMin = settings.showMinima && stable;

    this.maxCount = this._orders(c, this.maxDelta, this.maxK);
    this.minCount = this._orders(c + 0.5, this.minDelta, this.minK);
  }

  _updateMulti(settings, sources, n) {
    const p = sources.positions;
    const t = sources.time;
    this.count = n;
    this.lambda = WAVE_SPEED / sources.freqs[0];
    this.k = TWO_PI / this.lambda;
    const margin = MARGIN_WAVELENGTHS * this.lambda;
    const p0 = sources.phaseOf(0);
    let stable = true;
    for (let i = 0; i < n; i++) {
      this.mx[i] = p[i * 2];
      this.mz[i] = p[i * 2 + 1];
      let ph = (sources.phaseOf(i) - p0) % TWO_PI;
      if (ph < 0) ph += TWO_PI;
      this.mPhase[i] = ph;
      this.mReach[i] = Number.isFinite(sources.stop[i]) ? -1 : WAVE_SPEED * (t - sources.start[i]) - margin;
      if (this.mReach[i] <= 0) stable = false;
    }
    this.drawMax = settings.showMaxima && stable;
    this.drawMin = settings.showMinima && stable;
  }

  // Multi path: envelope at (x, z): out.n, out.arg (argument of the weighted sum; it turns once around
  // every node, which places the minima dashes), out.near (distance to the nearest source).
  envelope(x, z, out) {
    let re = 0;
    let im = 0;
    let ws = 0;
    let near = Infinity;
    for (let i = 0; i < this.count; i++) {
      const r = Math.hypot(x - this.mx[i], z - this.mz[i]);
      const w = 1 / Math.sqrt(Math.max(r, MULTI_LEVELS.rMin));
      const th = this.mPhase[i] - this.k * r;
      re += w * Math.cos(th);
      im += w * Math.sin(th);
      ws += w;
      near = Math.min(near, r);
    }
    out.n = Math.hypot(re, im) / ws;
    out.arg = Math.atan2(im, re);
    out.near = near;
    return out;
  }

  // Lines r2 - r1 = (k + offset) lambda with |r2 - r1| <= d.
  _orders(offset, delta, ks) {
    const r = this.d / this.lambda;
    const k0 = Math.ceil(-r - offset - 1e-9);
    const k1 = Math.floor(r - offset + 1e-9);
    let n = 0;
    for (let k = k0; k <= k1 && n < MAX_ORDERS; k++) {
      // |delta| ~ d is the degenerate ray on the S1-S2 axis beyond the sources: not a real curve, skipped.
      if (Math.abs((k + offset) * this.lambda) > this.d - 0.1 * this.lambda) continue;
      delta[n] = (k + offset) * this.lambda;
      ks[n] = k;
      n++;
    }
    return n;
  }

  // Multi path: visibility (0..1) of a point at distances rs[0..count-1] from the sources.
  visibilityMulti(rs, o) {
    let v = Infinity;
    for (let i = 0; i < this.count; i++) v = Math.min(v, this.mReach[i] - rs[o + i]);
    v /= this.fade;
    return v <= 0 ? 0 : v >= 1 ? 1 : v;
  }

  // Visibility (0..1) of a line point at distances r1, r2: grows outward behind both wavefronts.
  visibility(r1, r2) {
    const v = Math.min(this.reachA - r1, this.reachB - r2) / this.fade;
    return v <= 0 ? 0 : v >= 1 ? 1 : v;
  }
}
