// HUD (right side): frequency / wavelength readout and the FPS counter. DOM is written only when values change.
import { STR, fmt } from './strings.js';
import { WAVE_SPEED, MAX_SOURCES } from '../config.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function createHud(container) {
  const R = STR.readout;
  const U = STR.units;
  const hud = el('div', 'hud');

  const card = el('div', 'hud__card plate');
  card.setAttribute('aria-live', 'polite');
  card.dataset.tour = 'readout';
  // One shared pair (f, lambda) or, when the frequencies differ, one line per source.
  const shared = el('dl', 'kv');
  const fDt = el('dt', null, R.f);
  const fDd = el('dd');
  const lDt = el('dt', null, R.lambda);
  const lDd = el('dd');
  shared.append(fDt, fDd, lDt, lDd);

  const list = el('ul', 'srclist');
  const lines = [];
  for (let i = 0; i < MAX_SOURCES; i++) {
    const li = el('li', 'srclist__row');
    const dot = el('span', 'dot');
    dot.style.background = 'var(--ball-color)';
    const name = el('b', null, STR.sourceName(i));
    const text = el('span', 'srclist__text');
    li.append(dot, name, text);
    list.append(li);
    lines.push({ li, text });
  }
  card.append(shared, list);

  const fpsCard = el('div', 'hud__card hud__fps plate');
  fpsCard.hidden = true;
  const fpsValue = el('b');
  const fpsLevel = el('span');
  fpsCard.append(document.createTextNode(`${STR.hud.fps} `), fpsValue, fpsLevel);

  // Paper tray: press the sheet and drag it onto the water (wired in main.js).
  const tray = el('div', 'hud__card tray plate');
  tray.dataset.tour = 'tray';
  tray.title = STR.hud.paperHint;
  const sheet = el('div', 'tray__sheet');
  sheet.setAttribute('role', 'button');
  sheet.setAttribute('aria-label', STR.hud.paperHint);
  const trayText = el('div', 'tray__text');
  trayText.append(el('b', null, STR.hud.paper), el('span', null, STR.hud.paperHint));
  tray.append(sheet, trayText);

  hud.append(card, tray, fpsCard);
  container.append(hud);

  let lastKey = '';
  let lastFps = -1;
  let lastLevel = '';

  return {
    element: hud,
    paperSheet: sheet,
    paperTray: tray,

    // r: { count, freqs } (freqs: Hz per source, at least count entries)
    setReadout(r) {
      let key = String(r.count);
      for (let i = 0; i < r.count; i++) key += `|${r.freqs[i]}`;
      if (key === lastKey) return;
      lastKey = key;
      let same = true;
      for (let i = 1; i < r.count; i++) if (r.freqs[i] !== r.freqs[0]) same = false;
      shared.hidden = !same;
      list.hidden = same;
      if (same) {
        fDd.textContent = `${fmt(r.freqs[0], 2)} ${U.hz}`;
        lDd.textContent = `${fmt(WAVE_SPEED / r.freqs[0], 3)} ${U.len}`;
        return;
      }
      for (let i = 0; i < MAX_SOURCES; i++) {
        lines[i].li.hidden = i >= r.count;
        if (i < r.count) {
          lines[i].text.textContent = `${fmt(r.freqs[i], 2)} ${U.hz} · λ ${fmt(WAVE_SPEED / r.freqs[i], 3)} ${U.len}`;
        }
      }
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
