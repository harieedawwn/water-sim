// HUD (top left): live readout card and FPS counter. DOM is written only when values change.
import { STR, fmt } from './strings.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Nodal-line count for two in-phase sources: 2 * (floor(d / lambda - 0.5) + 1) if d > lambda / 2.
export function nodalLines(d, lambda) {
  return d > lambda / 2 ? 2 * (Math.floor(d / lambda - 0.5) + 1) : 0;
}

export function createHud(container) {
  const R = STR.readout;
  const U = STR.units;
  const hud = el('div', 'hud');

  const card = el('div', 'hud__card glass');
  const kv = el('dl', 'kv');
  const cells = {};
  for (const [k, label] of [['f', R.f], ['lambda', R.lambda], ['d', R.d], ['ratio', R.ratio], ['nodal', R.nodal]]) {
    const dt = el('dt', null, label);
    const dd = el('dd');
    kv.append(dt, dd);
    cells[k] = { dt, dd };
  }
  card.append(kv);

  const fpsCard = el('div', 'hud__card hud__fps glass');
  fpsCard.hidden = true;
  const fpsValue = el('b');
  const fpsLevel = el('span');
  fpsCard.append(document.createTextNode(`${STR.hud.fps} `), fpsValue, fpsLevel);

  hud.append(card, fpsCard);
  container.append(hud);

  let lastKey = '';
  let lastFps = -1;
  let lastLevel = '';

  return {
    element: hud,

    // r: { f, lambda, d|null, nodal|null }
    setReadout(r) {
      const key = `${r.f}|${r.d}|${r.nodal}`;
      if (key === lastKey) return;
      lastKey = key;
      cells.f.dd.textContent = `${fmt(r.f, 2)} ${U.hz}`;
      cells.lambda.dd.textContent = `${fmt(r.lambda, 3)} ${U.len}`;
      const hasD = r.d != null;
      cells.d.dt.hidden = cells.d.dd.hidden = !hasD;
      cells.ratio.dt.hidden = cells.ratio.dd.hidden = !hasD;
      if (hasD) {
        cells.d.dd.textContent = `${fmt(r.d, 2)} ${U.len}`;
        cells.ratio.dd.textContent = fmt(r.d / r.lambda, 2);
      }
      const hasN = r.nodal != null;
      cells.nodal.dt.hidden = cells.nodal.dd.hidden = !hasN;
      if (hasN) cells.nodal.dd.textContent = String(r.nodal);
    },

    setFpsVisible(v) { fpsCard.hidden = !v; },

    setFps(fps, levelName) {
      const f = Math.round(fps);
      if (f !== lastFps) {
        lastFps = f;
        fpsValue.textContent = String(f);
      }
      if (levelName !== lastLevel) {
        lastLevel = levelName;
        fpsLevel.textContent = ` · ${levelName}`;
      }
    },
  };
}
