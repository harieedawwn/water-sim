// Interference maxima / minima of exactly two sources (S1, S2) of equal frequency: availability,
// the orders k that exist, and how far from each source the pattern is already stable, so the lines
// grow outward behind the wavefronts. Shared by the 3D overlay (water shader) and the 2D view.
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

export class InterferenceLines {
  constructor() {
    this.available = false;      // exactly 2 sources with equal frequency
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
    this.available = sources.count === 2 && sources.freqs[0] === sources.freqs[1];
    if (!this.available) {
      this.drawMax = this.drawMin = false;
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

  // Lines r2 - r1 = (k + offset) lambda with |r2 - r1| <= d.
  _orders(offset, delta, ks) {
    const r = this.d / this.lambda;
    const k0 = Math.ceil(-r - offset - 1e-9);
    const k1 = Math.floor(r - offset + 1e-9);
    let n = 0;
    for (let k = k0; k <= k1 && n < MAX_ORDERS; k++) {
      delta[n] = Math.max(-this.d, Math.min(this.d, (k + offset) * this.lambda));
      ks[n] = k;
      n++;
    }
    return n;
  }

  // Visibility (0..1) of a line point at distances r1, r2: grows outward behind both wavefronts.
  visibility(r1, r2) {
    const v = Math.min(this.reachA - r1, this.reachB - r2) / this.fade;
    return v <= 0 ? 0 : v >= 1 ? 1 : v;
  }
}
