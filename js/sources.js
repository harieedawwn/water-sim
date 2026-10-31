// SourceManager: source positions (layouts, dragging), per-source frequency, coherent sine emitters
// with ramp-up, phase offset, mouse drops, and the per-source emission start / stop times that the
// analytic 2D view and the interference lines use. Sources are S1..S4 = index 0..3.
import { WAVE_SPEED, BALL_RADIUS, MAX_SOURCES, LIMITS } from './config.js';

const TWO_PI = Math.PI * 2;
const MAX_DROPS = 4;
const RAMP_UP = 1.2;             // s, smooth start avoids transients and DC drift
const RAMP_DOWN = 0.5;           // s, when paused
const PHASE_RATE = Math.PI;      // rad/s, smoothing of initial-phase changes
const AMP_RATE = 4;              // 1/s, smoothing of amplitude changes
const DROP_RADIUS = 0.14;
const DROP_AMP = -0.035;         // push the water down
const FIT_STEPS = 18;
const LAYOUT_SHIFT_X_FRAC = 0.05;   // default layouts sit left of the screen centre by this much of the visible width
export const MIN_GAP = LIMITS.spacing.min;   // world units between two sources

export class SourceManager {
  constructor(sim, framing) {
    this.sim = sim;
    this.framing = framing;
    this.count = 0;
    this.layout = '';
    this.spacing = 0;
    this.amplitude = 0;
    this.running = true;
    this.gain = 0;               // smoothed 0..1 ramp
    this.positions = new Float32Array(MAX_SOURCES * 2);   // x0, z0, x1, z1, ...
    this.freqs = new Float64Array(MAX_SOURCES);           // Hz per source
    this.start = new Float64Array(MAX_SOURCES);           // time emission began with the current parameters
    this.stop = new Float64Array(MAX_SOURCES).fill(Infinity);   // time emission stopped (paused)
    this.moved = false;          // positions differ from the layout (dragged)
    this.version = 0;            // bumps whenever positions change
    this.emitters = [];

    this._phaseBase = new Float64Array(MAX_SOURCES);
    this._layoutPos = new Float32Array(MAX_SOURCES * 2);
    this._tmp = { x: 0, z: 0 };
    this._ramp = 0;
    this._amp = 0;
    this._phi = new Float64Array(MAX_SOURCES);          // smoothed initial phase, rad
    this._phiTarget = new Float64Array(MAX_SOURCES);
    this._sines = [];
    for (let i = 0; i < MAX_SOURCES; i++) {
      this._sines.push({ x: 0, z: 0, radius: 0.1, mode: 'sine', amp: 0, freq: 2, phase: 0 });
    }
    this._drops = [];
    for (let i = 0; i < MAX_DROPS; i++) {
      this._drops.push({ x: 0, z: 0, radius: DROP_RADIUS, mode: 'impulse', amp: DROP_AMP, freq: 0, phase: 0 });
    }
    this._dropCount = 0;
  }

  // Time base shared by every view (the sim clock keeps running in the 2D view).
  get time() { return this.sim.renderTime; }

  // Take new settings. Layout changes reset positions and restart the ramp; frequency changes keep
  // each source's phase continuous and restart its pattern clock.
  apply(s) {
    const t = this.time;
    for (let i = 0; i < MAX_SOURCES; i++) {
      const f = s.perSourceFreq ? s.sourceFreqs[i] : s.frequency;
      if (f === this.freqs[i]) continue;
      if (this.freqs[i] > 0) {
        this._phaseBase[i] = (this._phaseBase[i] + TWO_PI * (this.freqs[i] - f) * this.sim.time) % TWO_PI;
        this.start[i] = t;
      }
      this.freqs[i] = f;
    }
    this.amplitude = s.amplitude;
    for (let i = 0; i < MAX_SOURCES; i++) this._phiTarget[i] = (s.phases[i] * Math.PI) / 180;

    if (s.sourcesRunning !== this.running) {
      this.running = s.sourcesRunning;
      if (this.running) this.start.fill(t);
      this.stop.fill(this.running ? Infinity : t);
    }

    if (s.sourceCount !== this.count || s.layout !== this.layout || s.spacing !== this.spacing) {
      this.count = s.sourceCount;
      this.layout = s.layout;
      this.spacing = s.spacing;
      this.resetPositions();
      this._ramp = 0;
      this.gain = 0;
    }

    // Dispersion is cancelled exactly at one frequency: the mean of the active sources.
    let sum = 0;
    for (let i = 0; i < this.count; i++) sum += this.freqs[i];
    this.sim.setDriveFrequency(sum / this.count);
  }

  // Positions back to the layout (fitted to the screen); restarts every pattern clock.
  resetPositions() {
    this._computeLayout(this._layoutPos);
    this.positions.set(this._layoutPos);
    this.moved = false;
    this.restart();
  }

  // All sources start a fresh wave pattern now (count change, clear waves, reset positions).
  restart() {
    const t = this.time;
    this.start.fill(t);
    this.stop.fill(this.running ? Infinity : t);
    this.version++;
  }

  _computeLayout(p) {
    const n = this.count;
    p.fill(0);
    if (this.layout === 'vuong' && n === 4) {
      // Ring order, so "alternate sources" are diagonal pairs.
      const h = this.spacing / 2;
      p.set([-h, -h, h, -h, h, h, -h, h]);
    } else if (this.layout === 'vuong' && n === 3) {
      // Equilateral triangle with side = spacing, centred on its centroid.
      const a = this.spacing;
      const ht = (a * Math.sqrt(3)) / 2;
      p.set([-a / 2, ht / 3, a / 2, ht / 3, 0, -(2 * ht) / 3]);
    } else {
      // "hang" (and "vuong" for 1 or 2): row along x, centred.
      for (let i = 0; i < n; i++) p[i * 2] = (i - (n - 1) / 2) * this.spacing;
    }
    // Whole layout shifted left of the screen centre; shrink about that shifted centre until every
    // source is on screen in every view.
    const f = this.framing;
    const cx = -LAYOUT_SHIFT_X_FRAC * (f.width / f.scale2d);
    const fits = (k) => {
      for (let i = 0; i < n; i++) if (!f.inside(cx + p[i * 2] * k, p[i * 2 + 1] * k)) return false;
      return true;
    };
    let lo = 1;
    if (!fits(1)) {
      lo = 0;
      let hi = 1;
      for (let i = 0; i < FIT_STEPS; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
    }
    for (let i = 0; i < n; i++) {
      p[i * 2] = cx + p[i * 2] * lo;
      p[i * 2 + 1] *= lo;
    }
  }

  // The visible area changed (resize, view angle): refit the layout, or pull dragged sources back on screen.
  refit() {
    const t = this.time;
    const p = this.positions;
    let changed = false;
    if (!this.moved) {
      this._computeLayout(this._layoutPos);
      for (let i = 0; i < this.count; i++) {
        const k = i * 2;
        if (p[k] === this._layoutPos[k] && p[k + 1] === this._layoutPos[k + 1]) continue;
        p[k] = this._layoutPos[k];
        p[k + 1] = this._layoutPos[k + 1];
        this.start[i] = t;
        changed = true;
      }
    } else {
      for (let i = 0; i < this.count; i++) {
        const c = this.framing.clamp(p[i * 2], p[i * 2 + 1], this._tmp);
        if (c.x === p[i * 2] && c.z === p[i * 2 + 1]) continue;
        p[i * 2] = c.x;
        p[i * 2 + 1] = c.z;
        this.start[i] = t;
        changed = true;
      }
    }
    if (changed) this.version++;
  }

  // Drag source i towards (x, z): clamped to the visible area, at least MIN_GAP from the others.
  // Returns true if it moved.
  moveTo(i, x, z) {
    const p = this.positions;
    let c = this.framing.clamp(x, z, this._tmp);
    let nx = c.x;
    let nz = c.z;
    for (let pass = 0; pass < 4; pass++) {
      let pushed = false;
      for (let j = 0; j < this.count; j++) {
        if (j === i) continue;
        let dx = nx - p[j * 2];
        let dz = nz - p[j * 2 + 1];
        let dd = Math.hypot(dx, dz);
        if (dd >= MIN_GAP - 1e-6) continue;
        if (dd < 1e-6) { dx = p[i * 2] - p[j * 2]; dz = p[i * 2 + 1] - p[j * 2 + 1]; dd = Math.hypot(dx, dz) || 1; }
        nx = p[j * 2] + (dx / dd) * MIN_GAP;
        nz = p[j * 2 + 1] + (dz / dd) * MIN_GAP;
        pushed = true;
      }
      if (!pushed) break;
      c = this.framing.clamp(nx, nz, this._tmp);
      nx = c.x;
      nz = c.z;
    }
    for (let j = 0; j < this.count; j++) {
      if (j !== i && Math.hypot(nx - p[j * 2], nz - p[j * 2 + 1]) < MIN_GAP - 1e-3) return false;
    }
    if (nx === p[i * 2] && nz === p[i * 2 + 1]) return false;
    p[i * 2] = nx;
    p[i * 2 + 1] = nz;
    this.start[i] = this.time;
    this.moved = true;
    this.version++;
    return true;
  }

  // Distance S1-S2 (world units).
  get distance12() {
    const p = this.positions;
    return Math.hypot(p[2] - p[0], p[3] - p[1]);
  }

  // Back from the 2D view, where the clock ran for delta seconds (since -> now) but the GPU sim did not:
  // shift phases and pattern clocks so the frozen 3D field continues seamlessly.
  rebase(delta, since) {
    const now = since + delta;
    let changedDuring = false;
    for (let i = 0; i < MAX_SOURCES; i++) {
      this._phaseBase[i] = (this._phaseBase[i] - TWO_PI * this.freqs[i] * delta) % TWO_PI;
      if (this.start[i] <= since) this.start[i] += delta;
      else { this.start[i] = now; changedDuring = true; }
      if (this.stop[i] <= since) this.stop[i] += delta;
      else if (Number.isFinite(this.stop[i])) this.stop[i] = now;
    }
    if (changedDuring && this.running) this._ramp = 0;
  }

  // Emitter radius: about the ball footprint but below ~lambda/2.6 so the source radiates efficiently.
  emitterRadius(f) {
    const k = (TWO_PI * f) / WAVE_SPEED;
    return Math.min(0.25 * BALL_RADIUS, 2.4 / k);
  }

  // Vertical travel of a ball (world units).
  get bobAmplitude() { return Math.min(0.3 * BALL_RADIUS, this._amp * 6); }

  // Phase of source i (radians): it oscillates as sin(2 pi f_i t + phase).
  phaseOf(i) { return this._phaseBase[i] + this._phi[i]; }

  // Normalised oscillation of source i at time t, including the ramp (-1..1).
  oscillation(i, t) {
    return Math.sin(TWO_PI * this.freqs[i] * t + this.phaseOf(i)) * this.gain;
  }

  addDrop(x, z) {
    if (this._dropCount >= MAX_DROPS) return;
    const d = this._drops[this._dropCount++];
    d.x = x;
    d.z = z;
  }

  // Advance ramps / smoothing and build the emitter list for this frame (reuses objects; no allocations).
  update(dt) {
    this._ramp = this.running ? Math.min(1, this._ramp + dt / RAMP_UP) : Math.max(0, this._ramp - dt / RAMP_DOWN);
    const r = this._ramp;
    this.gain = r * r * (3 - 2 * r);

    // Each initial phase moves to its target by the shortest way round the circle.
    const maxStep = PHASE_RATE * dt;
    for (let i = 0; i < MAX_SOURCES; i++) {
      let dp = this._phiTarget[i] - this._phi[i];
      dp -= TWO_PI * Math.round(dp / TWO_PI);
      if (Math.abs(dp) < 1e-9) continue;
      this._phi[i] += Math.abs(dp) <= maxStep ? dp : Math.sign(dp) * maxStep;
      // The pattern of this source is not stable until its phase settles.
      this.start[i] = this.time;
    }
    this._amp += (this.amplitude - this._amp) * Math.min(1, dt * AMP_RATE);

    const em = this.emitters;
    em.length = 0;
    for (let i = 0; i < this.count; i++) {
      const e = this._sines[i];
      const f = this.freqs[i];
      e.x = this.positions[i * 2];
      e.z = this.positions[i * 2 + 1];
      e.radius = this.emitterRadius(f);
      e.amp = this._amp * this.gain * this.sim.sourceGain(e.radius, f);
      e.freq = f;
      e.phase = this.phaseOf(i);
      em.push(e);
    }
    for (let i = 0; i < this._dropCount; i++) em.push(this._drops[i]);
    return em;
  }

  // Drops are consumed once the sim has actually run a substep.
  afterStep(substeps) {
    if (substeps > 0) this._dropCount = 0;
  }
}
