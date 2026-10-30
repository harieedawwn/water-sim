// Defaults, limits, quality presets and localStorage persistence.

export const STORAGE_KEY = 'ripple.settings.v1';

// World: water plane WORLD_SIZE x WORLD_SIZE centred at origin, surface y = 0.
export const WORLD_SIZE = 16;
export const WORLD_HALF = WORLD_SIZE / 2;

// Physical wave speed (world units / s). lambda = WAVE_SPEED / f exactly.
// f = 2 Hz -> lambda = 0.4 = 12.8 cells at res 512. The frequency range below keeps
// lambda >= 8 cells at the lowest resolution (384): 0.8 / 2.4 / (16 / 384) = 8.
export const WAVE_SPEED = 0.8;

export const LIMITS = {
  frequency: { min: 0.8, max: 2.4, step: 0.05 },
  amplitude: { min: 0.002, max: 0.03, step: 0.001 },
  spacing: { min: 1, max: 8, step: 0.1 },
  phaseOffset: { min: 0, max: 180, step: 5 },
  ballSize: { min: 0.25, max: 1.1, step: 0.05 },
  cameraPitch: { min: 35, max: 90, step: 1 },
};

export const SOURCE_COUNTS = [1, 2, 4];
export const LAYOUTS = ['hang', 'vuong'];
export const QUALITIES = ['auto', 'low', 'medium', 'high'];
export const SIM_RESOLUTIONS = [384, 512, 768];

export const QUALITY_PRESETS = {
  low: { simRes: 384, pixelRatio: 1, refraction: false, foam: false },
  medium: { simRes: 512, pixelRatio: 1.25, refraction: true, foam: true },
  high: { simRes: 768, pixelRatio: 1.5, refraction: true, foam: true },
};

export const DEFAULTS = Object.freeze({
  quality: 'auto',
  simRes: 512,
  reflection: true,
  refraction: true,
  foam: true,
  sourceCount: 2,
  layout: 'hang',
  spacing: 2.4,          // ~6 lambda at 2 Hz
  frequency: 2,
  amplitude: 0.012,      // wave amplitude at 1 unit from a source (world units)
  phaseOffset: 0,        // degrees, applied to alternate sources
  ballSize: 0.45,        // ball radius (world units)
  sourcesRunning: true,
  mapIndex: 0,
  cameraPitch: 50,
  showFps: false,
  showOverlay: false,
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
    amplitude: num(r.amplitude, d.amplitude, LIMITS.amplitude),
    phaseOffset: num(r.phaseOffset, d.phaseOffset, LIMITS.phaseOffset),
    ballSize: num(r.ballSize, d.ballSize, LIMITS.ballSize),
    sourcesRunning: bool(r.sourcesRunning, d.sourcesRunning),
    mapIndex: Math.max(0, Math.floor(num(r.mapIndex, d.mapIndex))),
    cameraPitch: num(r.cameraPitch, d.cameraPitch, LIMITS.cameraPitch),
    showFps: bool(r.showFps, d.showFps),
    showOverlay: bool(r.showOverlay, d.showOverlay),
  };
}

export function loadSettings() {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return sanitize(null);
    return sanitize(JSON.parse(text));
  } catch (e) {
    console.warn('Settings ignored (corrupt or unavailable storage):', e);
    return sanitize(null);
  }
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(settings)));
  } catch (e) {
    console.warn('Settings not saved:', e);
  }
}
