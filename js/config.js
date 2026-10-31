// Defaults, limits, quality presets and localStorage persistence.

export const STORAGE_KEY = 'ripple.settings.v1';

// Reference tank: simRes cells span WORLD_SIZE world units, so the cell size is WORLD_SIZE / simRes.
// The simulated domain itself is a rectangle sized to the screen (see framing.js) whose area is
// SIM_AREA, so the cell count (cost) matches the old square WORLD_SIZE x WORLD_SIZE tank.
export const WORLD_SIZE = 16;
export const SIM_AREA = WORLD_SIZE * WORLD_SIZE;

// Physical wave speed (world units / s). lambda = WAVE_SPEED / f exactly.
// f = 2 Hz -> lambda = 0.4 = 12.8 cells at res 512. The frequency range below keeps
// lambda >= 8 cells at the coarsest cell (16 / 384): 0.8 / 2.4 / (16 / 384) = 8.
export const WAVE_SPEED = 0.8;

// Fixed ball look (no settings): radius in world units and a calm leaf green (sRGB).
export const BALL_RADIUS = 0.45;
export const BALL_HEX = '#F5A524';
// Ball colour presets (sRGB); the first is the default.
export const BALL_COLORS = ['#F5A524', '#E5484D', '#4FB36B', '#F2C94C', '#3E8EDE', '#9B6BDF', '#E86FB0', '#E8E8E8'];

export const MAX_SOURCES = 4;

export const LIMITS = {
  frequency: { min: 0.8, max: 2.4, step: 0.05 },
  amplitude: { min: 0.002, max: 0.03, step: 0.001 },
  spacing: { min: 1, max: 8, step: 0.1 },
  phase: { min: 0, max: 360, step: 5 },
  ballSize: { min: 0.4, max: 1.8, step: 0.05 },   // ball radius scale   // initial phase of each source, degrees
  // Below ~50 deg the far edge of the view recedes so fast that the near edge (where the
  // sources sit) shrinks to a few units; above 25 deg + margin the horizon never shows.
  cameraPitch: { min: 50, max: 90, step: 1 },
};

export const SOURCE_COUNTS = [1, 2, 3, 4];
export const LAYOUTS = ['hang', 'vuong'];
export const QUALITIES = ['auto', 'low', 'medium', 'high'];
export const SIM_RESOLUTIONS = [320, 384, 512, 768];
export const VIEWS = ['lake', 'sea', '2d'];

export const QUALITY_PRESETS = {
  low: { simRes: 384, pixelRatio: 1, refraction: false, foam: false },
  medium: { simRes: 512, pixelRatio: 1.25, refraction: true, foam: true },
  high: { simRes: 768, pixelRatio: 1.5, refraction: true, foam: true },
  phone: { simRes: 320, pixelRatio: 1, refraction: false, foam: false },   // extra steps below low, phones only
};

// Phones and tablets: touch-first device with a small screen (or a mobile user agent). They get a lighter
// quality ladder, no MSAA and a lighter 2D canvas: weaker GPUs, high-DPR screens and thermal throttling.
export const IS_MOBILE = (() => {
  try {
    const ua = navigator.userAgent || '';
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(window.screen.width, window.screen.height) <= 900;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (coarse && small)
      || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));   // iPadOS reports a desktop UA
  } catch {
    return false;
  }
})();

export const DEFAULTS = Object.freeze({
  quality: 'auto',
  simRes: 512,
  reflection: true,
  refraction: true,
  foam: true,
  sourceCount: 2,
  layout: 'hang',
  spacing: 2.4,          // ~6 lambda at 2 Hz
  frequency: 2,          // linked frequency (all sources)
  perSourceFreq: false,  // true: sourceFreqs[i] drives source i
  sourceFreqs: Object.freeze([2, 2, 2, 2]),
  amplitude: 0.012,      // wave amplitude at 1 unit from a source (world units)
  phases: Object.freeze([0, 0, 0, 0]),   // degrees, initial phase phi_i of source i (S1..S4)
  sourcesRunning: true,
  view: 'lake',
  cameraPitch: 50,
  ballSize: 1,
  ballColor: BALL_HEX,
  showFps: false,
  moveMode: false,       // not persisted: always starts off
  showMaxima: false,
  showMinima: false,
  show2dTroughs: true,
  show2dGrid: true,
});

function num(v, fallback, lim) {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return lim ? Math.min(lim.max, Math.max(lim.min, n)) : n;
}

function oneOf(v, list, fallback) {
  return list.includes(v) ? v : fallback;
}

function bool(v, fallback) {
  return typeof v === 'boolean' ? v : fallback;
}

// Older versions stored mapIndex (0 lake, 1 sea, 2 sunset, 3 moon); sunset and moon no longer exist.
function viewOf(r) {
  if (VIEWS.includes(r.view)) return r.view;
  return r.mapIndex === 1 ? 'sea' : DEFAULTS.view;
}

function freqs(v) {
  const out = [];
  for (let i = 0; i < MAX_SOURCES; i++) {
    out.push(num(Array.isArray(v) ? v[i] : undefined, DEFAULTS.sourceFreqs[i], LIMITS.frequency));
  }
  return out;
}

// Per-source initial phases. An old saved phaseOffset (S2 and S4 only) maps to phases[1] and phases[3];
// it was 0-180, so it fits the new range.
function phases(r) {
  const out = [];
  for (let i = 0; i < MAX_SOURCES; i++) {
    const legacy = i & 1 ? num(r.phaseOffset, 0, LIMITS.phase) : 0;
    const v = Array.isArray(r.phases) ? r.phases[i] : undefined;
    out.push(num(v, legacy, LIMITS.phase));
  }
  return out;
}

// Returns a complete, valid settings object; unknown/invalid fields fall back to defaults.
export function sanitize(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const d = DEFAULTS;
  return {
    quality: oneOf(r.quality, QUALITIES, d.quality),
    simRes: oneOf(r.simRes, SIM_RESOLUTIONS, d.simRes),
    reflection: bool(r.reflection, d.reflection),
    refraction: bool(r.refraction, d.refraction),
    foam: bool(r.foam, d.foam),
    sourceCount: oneOf(r.sourceCount, SOURCE_COUNTS, d.sourceCount),
    layout: oneOf(r.layout, LAYOUTS, d.layout),
    spacing: num(r.spacing, d.spacing, LIMITS.spacing),
    frequency: num(r.frequency, d.frequency, LIMITS.frequency),
    perSourceFreq: bool(r.perSourceFreq, d.perSourceFreq),
    sourceFreqs: freqs(r.sourceFreqs),
    amplitude: num(r.amplitude, d.amplitude, LIMITS.amplitude),
    phases: phases(r),
    sourcesRunning: bool(r.sourcesRunning, d.sourcesRunning),
    view: viewOf(r),
    cameraPitch: num(r.cameraPitch, d.cameraPitch, LIMITS.cameraPitch),
    ballSize: num(r.ballSize, d.ballSize, LIMITS.ballSize),
    ballColor: oneOf(r.ballColor, BALL_COLORS, d.ballColor),
    showFps: bool(r.showFps, d.showFps),
    moveMode: bool(r.moveMode, d.moveMode),
    showMaxima: bool(r.showMaxima, d.showMaxima),
    showMinima: bool(r.showMinima, d.showMinima),
    show2dTroughs: bool(r.show2dTroughs, d.show2dTroughs),
    show2dGrid: bool(r.show2dGrid, d.show2dGrid),
  };
}

export function loadSettings() {
  let s;
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    s = sanitize(text ? JSON.parse(text) : null);
  } catch (e) {
    console.warn('Settings ignored (corrupt or unavailable storage):', e);
    s = sanitize(null);
  }
  s.moveMode = false;
  return s;
}

export function saveSettings(settings) {
  try {
    const s = sanitize(settings);
    delete s.moveMode;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('Settings not saved:', e);
  }
}
