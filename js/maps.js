// Environment presets ("maps") as pure numeric parameter sets, plus a blender that
// crossfades every parameter when the map changes. Colours are linear HDR RGB.
import { STR } from './ui/strings.js';

const FADE_SECONDS = 1.2;

function dir(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

// water.extinction = per-channel absorption per world unit (lower = clearer water).
// floorAmount 0 = deep water (no floor), 1 = procedural sandy floor at floorDepth.
// sun.light = diffuse light on balls / floor; sun.intensity = specular glint strength.
export const MAPS = [
  {
    // Overcast late-afternoon lake (ref/ref.png): silver sky bands on crests, dark troughs.
    id: 'ho-chieu-xam',
    name: STR.maps.hoChieuXam,
    sky: {
      zenith: [0.05, 0.08, 0.13],
      horizon: [0.20, 0.27, 0.38],
      glareDir: dir(-0.45, 0.25, -1),   // bright patch upper left, low over the far shore
      glareColor: [0.92, 0.96, 1.0],
      glareIntensity: 20,
      glareSize: 0.03,
      cloud: 0.5,
    },
    sun: { dir: dir(-0.5, 0.42, -1), color: [1.0, 0.96, 0.9], power: 1200, intensity: 3, light: 0.6 },
    water: {
      deep: [0.002, 0.012, 0.022],
      scatter: [0.010, 0.040, 0.055],
      extinction: [1.6, 0.6, 0.45],
      fresnelBias: 0.02,
      normalStrength: 5.0,
      micro: 0.015,
      foam: 0.6,
      floorColor: [0.30, 0.27, 0.20],
      floorDepth: 2.0,
      floorAmount: 0,
    },
    haze: 0.00025,
    background: [0.05, 0.07, 0.10],
    exposure: 1.0,
    ballColor: [0.10, 0.78, 0.16],
  },
  {
    // Clear turquoise sea at midday over a sandy floor.
    id: 'bien-ban-ngay',
    name: STR.maps.bienBanNgay,
    sky: {
      zenith: [0.10, 0.28, 0.65],
      horizon: [0.55, 0.72, 0.90],
      glareDir: dir(-0.3, 0.5, -1),
      glareColor: [1.0, 0.98, 0.94],
      glareIntensity: 6,
      glareSize: 0.05,
      cloud: 0.25,
    },
    sun: { dir: dir(-0.3, 0.75, -0.6), color: [1.0, 0.97, 0.9], power: 700, intensity: 12, light: 1.0 },
    water: {
      deep: [0.005, 0.06, 0.09],
      scatter: [0.03, 0.30, 0.32],
      extinction: [0.45, 0.09, 0.07],
      fresnelBias: 0.02,
      normalStrength: 3.0,
      micro: 0.08,
      foam: 0.8,
      floorColor: [0.62, 0.55, 0.38],
      floorDepth: 1.4,
      floorAmount: 1,
    },
    haze: 0.0004,
    background: [0.40, 0.55, 0.70],
    exposure: 1.0,
    ballColor: [0.10, 0.78, 0.16],
  },
  {
    // Sunset: orange-pink sky mirrored on dark water.
    id: 'hoang-hon',
    name: STR.maps.hoangHon,
    sky: {
      zenith: [0.10, 0.08, 0.18],
      horizon: [1.0, 0.42, 0.30],
      glareDir: dir(0.0, 0.12, -1),
      glareColor: [1.0, 0.55, 0.30],
      glareIntensity: 14,
      glareSize: 0.03,
      cloud: 0.55,
    },
    sun: { dir: dir(0.0, 0.10, -1), color: [1.0, 0.55, 0.30], power: 600, intensity: 14, light: 0.8 },
    water: {
      deep: [0.004, 0.006, 0.012],
      scatter: [0.020, 0.020, 0.030],
      extinction: [1.2, 0.8, 0.6],
      fresnelBias: 0.02,
      normalStrength: 4.0,
      micro: 0.04,
      foam: 0.5,
      floorColor: [0.30, 0.27, 0.20],
      floorDepth: 2.0,
      floorAmount: 0,
    },
    haze: 0.0008,
    background: [0.35, 0.15, 0.12],
    exposure: 1.0,
    ballColor: [0.10, 0.78, 0.16],
  },
  {
    // Moonlit night: navy water, tight moon halo, glittering moon path.
    id: 'dem-trang',
    name: STR.maps.demTrang,
    sky: {
      zenith: [0.004, 0.007, 0.018],
      horizon: [0.020, 0.035, 0.070],
      glareDir: dir(0.25, 0.3, -1),
      glareColor: [0.75, 0.85, 1.0],
      glareIntensity: 2.5,
      glareSize: 0.012,
      cloud: 0.3,
    },
    sun: { dir: dir(0.25, 0.3, -1), color: [0.75, 0.85, 1.0], power: 1800, intensity: 18, light: 0.12 },
    water: {
      deep: [0.0008, 0.002, 0.006],
      scatter: [0.002, 0.006, 0.014],
      extinction: [1.4, 0.7, 0.5],
      fresnelBias: 0.02,
      normalStrength: 3.5,
      micro: 0.10,
      foam: 0.3,
      floorColor: [0.30, 0.27, 0.20],
      floorDepth: 2.0,
      floorAmount: 0,
    },
    haze: 0.0005,
    background: [0.010, 0.015, 0.030],
    exposure: 1.6,
    ballColor: [0.10, 0.78, 0.16],
  },
];

export function cloneParams(p) {
  return JSON.parse(JSON.stringify(p));
}

// out = mix(a, b, t) for every number / number array; strings switch at the midpoint.
export function lerpParams(out, a, b, t) {
  for (const k in out) {
    const o = out[k];
    if (typeof o === 'number') out[k] = a[k] + (b[k] - a[k]) * t;
    else if (Array.isArray(o)) for (let i = 0; i < o.length; i++) o[i] = a[k][i] + (b[k][i] - a[k][i]) * t;
    else if (o && typeof o === 'object') lerpParams(o, a[k], b[k], t);
    else out[k] = t < 0.5 ? a[k] : b[k];
  }
  return out;
}

// Holds an editable copy of every map (tuning panel edits live here for the session)
// and the blended parameters currently shown.
export class MapBlender {
  constructor(index) {
    this.tuned = MAPS.map(cloneParams);
    this.index = index;
    this.current = cloneParams(this.tuned[index]);
    this._from = cloneParams(this.tuned[index]);
    this._t = 1;
    this._dirty = true;
  }

  get target() { return this.tuned[this.index]; }

  setIndex(i) {
    if (i === this.index) return;
    lerpParams(this._from, this.current, this.current, 0);   // snapshot what is on screen
    this.index = i;
    this._t = 0;
  }

  // Call after editing this.target so the change shows up.
  markDirty() { this._dirty = true; }

  // Returns true when this.current changed and uniforms need refreshing.
  update(dt) {
    if (this._t >= 1 && !this._dirty) return false;
    this._t = Math.min(1, this._t + dt / FADE_SECONDS);
    const s = this._t * this._t * (3 - 2 * this._t);
    lerpParams(this.current, this._from, this.target, s);
    this._dirty = false;
    return true;
  }
}
