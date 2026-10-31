// Frame-rate meter (2 s rolling window) and adaptive quality controller.
import { QUALITY_PRESETS, IS_MOBILE } from './config.js';

const WINDOW = 2;            // s rolling average
const DOWN_FPS = 50;
const UP_FPS = 58;
const UP_HOLD = 6;           // s above UP_FPS before stepping up
const COOLDOWN = 4;          // s after any change
const FAIL_MEMORY = 12;      // s: a drop this soon after stepping up caps the ceiling (no oscillation)
const MAX_SAMPLES = 1024;

const L = QUALITY_PRESETS.low;
const M = QUALITY_PRESETS.medium;
const H = QUALITY_PRESETS.high;
const P = QUALITY_PRESETS.phone;

// Ordered cheapest -> best. Between presets the pixel ratio changes before the sim resolution,
// because fill rate usually dominates on integrated GPUs. Phones get two cheaper steps first.
const PHONE_STEPS = IS_MOBILE ? [
  { level: 'low', ...P, pixelRatio: 0.8 },
  { level: 'low', ...P },
] : [];
const O = PHONE_STEPS.length;
export const QUALITY_STEPS = [
  ...PHONE_STEPS,
  { level: 'low', ...L },
  { level: 'medium', ...M, pixelRatio: L.pixelRatio },
  { level: 'medium', ...M },
  { level: 'high', ...H, pixelRatio: M.pixelRatio },
  { level: 'high', ...H },
];

// Desktop: low / medium / high presets, auto starts at medium. Phones: "low" is the phone step, "medium"
// keeps the CSS pixel ratio, auto starts at the phone step and never climbs above medium at pixel ratio 1
// (keeps the frame rate steady and the phone cool).
const PRESET_STEP = IS_MOBILE ? { low: 1, medium: O + 1, high: O + 3 } : { low: 0, medium: 2, high: 4 };
const AUTO_START = IS_MOBILE ? 1 : 2;
const AUTO_CEILING = IS_MOBILE ? O + 1 : QUALITY_STEPS.length - 1;

export class FpsMeter {
  constructor() {
    this._t = new Float64Array(MAX_SAMPLES);
    this._head = 0;
    this._count = 0;
    this.fps = 0;
    this.span = 0;
  }

  reset() {
    this._count = 0;
    this.fps = 0;
    this.span = 0;
  }

  // now in seconds. Long gaps (hidden tab) restart the window.
  tick(now) {
    if (this._count > 0) {
      const prev = this._t[(this._head + MAX_SAMPLES - 1) % MAX_SAMPLES];
      if (now - prev > 0.25) this._count = 0;
    }
    this._t[this._head] = now;
    this._head = (this._head + 1) % MAX_SAMPLES;
    if (this._count < MAX_SAMPLES) this._count++;
    // Drop samples older than the window.
    let first = (this._head + MAX_SAMPLES - this._count) % MAX_SAMPLES;
    while (this._count > 2 && now - this._t[first] > WINDOW) {
      first = (first + 1) % MAX_SAMPLES;
      this._count--;
    }
    this.span = now - this._t[first];
    this.fps = this.span > 0 ? (this._count - 1) / this.span : 0;
  }
}

export class QualityController {
  // effective(step) -> comparable key of what the step actually changes on this device
  constructor(mode, apply, effective) {
    this.meter = new FpsMeter();
    this._apply = apply;
    this._effective = effective;
    this.mode = mode;
    this.step = AUTO_START;
    this.ceiling = AUTO_CEILING;
    this._lastChange = -Infinity;
    this._lastUp = -Infinity;
    this._highSince = -1;
    this.setMode(mode, 0);
  }

  get current() { return QUALITY_STEPS[this.step]; }

  setMode(mode, now) {
    this.mode = mode;
    this.ceiling = AUTO_CEILING;
    this.step = mode === 'auto' ? Math.min(this.step, AUTO_CEILING) : PRESET_STEP[mode];
    this._go(this.step, now);
  }

  _go(step, now) {
    this.step = step;
    this._lastChange = now;
    this._highSince = -1;
    this.meter.reset();
    this._apply(QUALITY_STEPS[step]);
  }

  // Next step in direction dir that actually changes something on this device.
  _next(dir) {
    const cur = this._effective(QUALITY_STEPS[this.step]);
    for (let s = this.step + dir; s >= 0 && s < QUALITY_STEPS.length; s += dir) {
      if (this._effective(QUALITY_STEPS[s]) !== cur) return s;
    }
    return -1;
  }

  // Call once per frame with the current time in seconds.
  update(now) {
    this.meter.tick(now);
    if (this.mode !== 'auto') return;
    if (now - this._lastChange < COOLDOWN || this.meter.span < WINDOW * 0.95) return;
    const fps = this.meter.fps;
    if (fps < DOWN_FPS) {
      const s = this._next(-1);
      if (s < 0) return;
      if (now - this._lastUp < FAIL_MEMORY) this.ceiling = s;   // the upper level could not hold 50 fps
      this._go(s, now);
    } else if (fps > UP_FPS) {
      if (this._highSince < 0) this._highSince = now;
      if (now - this._highSince < UP_HOLD) return;
      const s = this._next(1);
      if (s < 0 || s > this.ceiling) return;
      this._lastUp = now;
      this._go(s, now);
    } else {
      this._highSince = -1;
    }
  }
}
