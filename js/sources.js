// SourceManager: source layouts, coherent sine emitters with ramp-up, phase offset, mouse drops.
import { WORLD_HALF, WAVE_SPEED } from './config.js';

const TWO_PI = Math.PI * 2;
const MAX_SOURCES = 4;
const MAX_DROPS = 4;
const RAMP_UP = 1.2;             // s, smooth start avoids transients and DC drift
const RAMP_DOWN = 0.5;           // s, when paused
const PHASE_RATE = Math.PI;      // rad/s, smoothing of phase-offset changes
const AMP_RATE = 4;              // 1/s, smoothing of amplitude changes
const MAX_EXTENT = WORLD_HALF - 1.8;  // keep sources clear of the sponge layer
const DROP_RADIUS = 0.14;
const DROP_AMP = -0.035;         // push the water down
const REF_BALL = 0.45;           // ball radius at which amplitude scale = 1

export class SourceManager {
  constructor(sim) {
    this.sim = sim;
    this.count = 0;
    this.layout = '';
    this.spacing = 0;
    this.frequency = 0;
    this.amplitude = 0;
    this.ballSize = REF_BALL;
    this.running = true;
    this.gain = 0;               // smoothed 0..1 ramp
    this.positions = new Float32Array(MAX_SOURCES * 2);
    this.emitters = [];

    this._ramp = 0;
    this._amp = 0;
    this._phaseBase = 0;
    this._phaseOffset = 0;
    this._phaseOffsetTarget = 0;
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

  // Take new settings. Moving sources restarts the ramp; frequency changes keep the phase continuous.
  apply(s) {
    if (s.frequency !== this.frequency) {
      if (this.frequency > 0) {
        const t = this.sim.time;
        this._phaseBase = (this._phaseBase + TWO_PI * (this.frequency - s.frequency) * t) % TWO_PI;
      }
      this.frequency = s.frequency;
      this.sim.setDriveFrequency(s.frequency);
    }
    this.amplitude = s.amplitude;
    this.ballSize = s.ballSize;
    this.running = s.sourcesRunning;
    this._phaseOffsetTarget = (s.phaseOffset * Math.PI) / 180;

    if (s.sourceCount !== this.count || s.layout !== this.layout || s.spacing !== this.spacing) {
      this.count = s.sourceCount;
      this.layout = s.layout;
      this.spacing = s.spacing;
      this._layout();
      this._ramp = 0;
      this.gain = 0;
    }
  }

  _layout() {
    const n = this.count;
    const p = this.positions;
    if (this.layout === 'vuong' && n === 4) {
      // Ring order, so "alternate sources" are diagonal pairs.
      const h = Math.min(this.spacing / 2, MAX_EXTENT);
      p.set([-h, -h, h, -h, h, h, -h, h]);
      return;
    }
    // "hang" (and "vuong" for 1 or 2): row along x, centred.
    const d = n > 1 ? Math.min(this.spacing, (2 * MAX_EXTENT) / (n - 1)) : 0;
    for (let i = 0; i < n; i++) {
      p[i * 2] = (i - (n - 1) / 2) * d;
      p[i * 2 + 1] = 0;
    }
  }

  // Emitter radius: grows with the ball but stays below ~lambda/2.6 so the source radiates efficiently.
  emitterRadius() {
    const k = (TWO_PI * this.frequency) / WAVE_SPEED;
    return Math.min(0.25 * this.ballSize, 2.4 / k);
  }

  // Current (smoothed) phase offset of the odd sources, radians.
  get phaseOffset() { return this._phaseOffset; }

  get ampScale() { return Math.sqrt(this.ballSize / REF_BALL); }

  // Vertical travel of a ball (world units).
  get bobAmplitude() { return Math.min(0.3 * this.ballSize, this._amp * 6 * this.ampScale); }

  _phaseOf(i) { return this._phaseBase + (i & 1 ? this._phaseOffset : 0); }

  // Normalised oscillation of source i at time t, including the ramp (-1..1).
  oscillation(i, t) {
    return Math.sin(TWO_PI * this.frequency * t + this._phaseOf(i)) * this.gain;
  }

  addDrop(x, z) {
    if (this._dropCount >= MAX_DROPS) return;
    const d = this._drops[this._dropCount++];
    d.x = x;
    d.z = z;
  }

  // Build the emitter list for this frame (reuses objects; no allocations).
  update(dt) {
    this._ramp = this.running ? Math.min(1, this._ramp + dt / RAMP_UP) : Math.max(0, this._ramp - dt / RAMP_DOWN);
    const r = this._ramp;
    this.gain = r * r * (3 - 2 * r);

    const dp = this._phaseOffsetTarget - this._phaseOffset;
    const maxStep = PHASE_RATE * dt;
    this._phaseOffset += Math.abs(dp) <= maxStep ? dp : Math.sign(dp) * maxStep;
    this._amp += (this.amplitude - this._amp) * Math.min(1, dt * AMP_RATE);

    const radius = this.emitterRadius();
    const amp = this._amp * this.ampScale * this.gain * this.sim.sourceGain(radius, this.frequency);
    const em = this.emitters;
    em.length = 0;
    for (let i = 0; i < this.count; i++) {
      const e = this._sines[i];
      e.x = this.positions[i * 2];
      e.z = this.positions[i * 2 + 1];
      e.radius = radius;
      e.amp = amp;
      e.freq = this.frequency;
      e.phase = this._phaseOf(i);
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
