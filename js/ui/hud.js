// HUD (right side): frequency / wavelength readout, the sample tray (paper, duck) and the FPS counter. DOM is written only when values change.
import { STR, fmt } from './strings.js';
import { WAVE_SPEED, MAX_SOURCES } from '../config.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Small side view of a bath duck (tray thumbnail).
const DUCK_SVG = `<svg viewBox="0 0 48 44" aria-hidden="true">
<path d="M7 27c-3-6-3-11 1-12 2 3 4 7 6 9z" fill="#ffcf1f"/>
<ellipse cx="22" cy="30" rx="18" ry="10" fill="#ffcf1f"/>
<circle cx="31" cy="16" r="10" fill="#ffcf1f"/>
<path d="M39.5 14.5c4-1.5 7.5-.5 8 1.5-2 2.5-5.5 3-8.5 2.5z" fill="#ff7a12"/>
<circle cx="34" cy="13" r="1.9" fill="#111"/><circle cx="34.6" cy="12.4" r="0.6" fill="#fff"/>
<path d="M12 28c5-5 12-5 15 0-5 5-11 5-15 0z" fill="#f2b20c"/>
<ellipse cx="26" cy="9.5" rx="4" ry="2" fill="#fff" opacity=".45"/>
<path d="M2 39c5-2 9 2 14 0s9-2 14 0 9 2 14 0" stroke="#7cc8ee" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`;

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

  // Sample tray: press a thumbnail and drag the sample onto the water (sample.js bindTray).
  const tray = el('div', 'hud__card tray plate');
  tray.dataset.tour = 'tray';
  const items = el('div', 'tray__items');
  const thumb = (cls, name) => {
    const t = el('div', `tray__thumb ${cls}`);
    t.setAttribute('role', 'button');
    t.setAttribute('aria-label', name);
    t.title = name;
    items.append(t);
    return t;
  };
  const sheet = thumb('tray__sheet', STR.hud.paperName);
  const duck = thumb('tray__duck', STR.hud.duckName);
  duck.innerHTML = DUCK_SVG;
  const trayText = el('div', 'tray__text');
  trayText.append(el('b', null, STR.hud.paper), el('span', null, STR.hud.paperHint));
  tray.append(items, trayText);

  hud.append(card, tray, fpsCard);
  container.append(hud);

  let lastKey = '';
  let lastFps = -1;
  let lastLevel = '';

  return {
    element: hud,
    sampleTray: tray,
    thumbs: { paper: sheet, duck },

    // A sample in use (on the water or carried) greys out its thumbnail.
    setTaken(name, taken) {
      const t = name === 'duck' ? duck : sheet;
      t.classList.toggle('is-taken', taken);
      t.setAttribute('aria-disabled', String(taken));
    },

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
