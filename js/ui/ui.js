// Settings panel: 4 tabs (Thí nghiệm, Cảnh, Lý thuyết, Hiệu năng). Every tab fits without scrolling.
import { STR, fmt } from './strings.js';
import { LIMITS, WAVE_SPEED } from '../config.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function toSrgbByte(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

function css(a, gain = 1) {
  return `rgb(${toSrgbByte(a[0] * gain)}, ${toSrgbByte(a[1] * gain)}, ${toSrgbByte(a[2] * gain)})`;
}

// Thumbnail: sky gradient over a water gradient, from the map's own colours.
function thumbStyle(m) {
  const e = m.exposure;
  return `linear-gradient(180deg, ${css(m.sky.zenith, e)} 0%, ${css(m.sky.horizon, e)} 42%, `
    + `${css(m.water.scatter, e * 2)} 50%, ${css(m.water.deep, e * 3)} 100%)`;
}

/*
  actions: { onChange(key), resetDefaults(), close() }
  info():  { quality: {level, simRes, pixelRatio}, readout: {...} } live values for the panel
*/
export function createSettingsPanel(container, settings, maps, actions) {
  const P = STR.panel;
  const U = STR.units;
  const panel = el('div', 'panel glass');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', P.title);
  const syncers = [];

  const head = el('div', 'panel__head');
  head.append(el('h2', 'panel__title', P.title));
  const closeBtn = el('button', 'btn btn--icon', '✕');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', P.close);
  closeBtn.addEventListener('click', () => actions.close());
  head.append(closeBtn);
  panel.append(head);

  // Tabs
  const tabBar = el('div', 'tabs');
  tabBar.setAttribute('role', 'tablist');
  const tabs = [];
  let active = 0;
  P.tabs.forEach((name, i) => {
    const b = el('button', 'tabs__btn', name);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => select(i));
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = (i + (e.key === 'ArrowRight' ? 1 : P.tabs.length - 1)) % P.tabs.length;
        select(n);
        tabs[n].btn.focus();
      }
    });
    const body = el('div', 'tab');
    body.setAttribute('role', 'tabpanel');
    tabBar.append(b);
    tabs.push({ btn: b, body });
  });
  panel.append(tabBar);
  for (const t of tabs) panel.append(t.body);

  function select(i) {
    active = i;
    tabs.forEach((t, k) => {
      t.btn.setAttribute('aria-selected', String(k === i));
      t.btn.tabIndex = k === i ? 0 : -1;
      t.body.hidden = k !== i;
    });
  }

  // ---- control builders ----
  function slider(parent, key, label, tip, lim, format) {
    const row = el('div', 'row');
    const lab = el('label', 'row__label tip-left', label);
    lab.dataset.tip = tip;
    const value = el('span', 'row__value');
    lab.append(value);
    const input = el('input', 'range');
    input.type = 'range';
    input.min = String(lim.min);
    input.max = String(lim.max);
    input.step = String(lim.step);
    lab.htmlFor = input.id = `set-${key}`;
    input.addEventListener('input', () => {
      settings[key] = parseFloat(input.value);
      value.textContent = format(settings[key]);
      actions.onChange(key);
    });
    row.append(lab, input);
    parent.append(row);
    syncers.push(() => {
      input.value = String(settings[key]);
      value.textContent = format(settings[key]);
    });
  }

  function segmented(parent, key, label, tip, options) {
    const row = el('div', 'row');
    const lab = el('div', 'row__label tip-left', label);
    lab.dataset.tip = tip;
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label);
    const buttons = options.map(([val, text]) => {
      const b = el('button', 'seg__btn', text);
      b.type = 'button';
      b.addEventListener('click', () => {
        settings[key] = val;
        actions.onChange(key);
      });
      seg.append(b);
      return [val, b];
    });
    row.append(lab, seg);
    parent.append(row);
    syncers.push(() => {
      for (const [val, b] of buttons) b.setAttribute('aria-pressed', String(settings[key] === val));
    });
  }

  function toggle(parent, key, label, tip, isDisabled) {
    const lab = el('label', 'switch');
    if (tip) {
      lab.dataset.tip = tip;
      lab.classList.add('tip-left');
    }
    const text = el('span', null, label);
    const input = el('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      actions.onChange(key);
    });
    lab.append(text, input);
    parent.append(lab);
    syncers.push(() => {
      input.checked = !!settings[key];
      if (isDisabled) input.disabled = isDisabled();
    });
  }

  // ---- Tab 1: Thí nghiệm ----
  const t1 = tabs[0].body;
  slider(t1, 'frequency', P.frequency, P.tipFrequency, LIMITS.frequency, (v) => `${fmt(v, 2)} ${U.hz}`);
  slider(t1, 'amplitude', P.amplitude, P.tipAmplitude, LIMITS.amplitude, (v) => `${fmt(v, 3)} ${U.len}`);
  slider(t1, 'spacing', P.spacing, P.tipSpacing, LIMITS.spacing, (v) => `${fmt(v, 1)} ${U.len}`);
  slider(t1, 'phaseOffset', P.phaseOffset, P.tipPhaseOffset, LIMITS.phaseOffset, (v) => `${Math.round(v)}${U.deg}`);
  slider(t1, 'ballSize', P.ballSize, P.tipBallSize, LIMITS.ballSize, (v) => `${fmt(v, 2)} ${U.len}`);
  segmented(t1, 'layout', P.layout, P.tipLayout, [['hang', P.layoutHang], ['vuong', P.layoutVuong]]);

  // ---- Tab 2: Cảnh ----
  const t2 = tabs[1].body;
  const mapRow = el('div', 'row');
  const mapLab = el('div', 'row__label tip-left', P.map);
  mapLab.dataset.tip = P.tipMap;
  const grid = el('div', 'maps');
  const mapBtns = maps.map((m, i) => {
    const b = el('button', 'map-btn');
    b.type = 'button';
    const th = el('span', 'map-btn__thumb');
    th.style.background = thumbStyle(m);
    b.append(th, el('span', 'map-btn__name', m.name));
    b.addEventListener('click', () => {
      settings.mapIndex = i;
      actions.onChange('mapIndex');
    });
    grid.append(b);
    return b;
  });
  mapRow.append(mapLab, grid);
  t2.append(mapRow);
  syncers.push(() => mapBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(settings.mapIndex === i))));
  slider(t2, 'cameraPitch', P.pitch, P.tipPitch, LIMITS.cameraPitch, (v) => `${Math.round(v)}${U.deg}`);

  // ---- Tab 3: Lý thuyết ----
  const t3 = tabs[2].body;
  toggle(t3, 'showOverlay', P.overlay, P.tipOverlay);
  const overlayNote = el('p', 'note note--warn', P.overlayNeeds2);
  t3.append(overlayNote);
  syncers.push(() => { overlayNote.hidden = settings.sourceCount === 2; });
  const readTitle = el('div', 'row__label', P.readout);
  const kv = el('dl', 'kv');
  const R = STR.readout;
  const cells = {};
  for (const [k, label] of [['f', R.f], ['lambda', R.lambda], ['speed', R.speed], ['d', R.d], ['ratio', R.ratio], ['nodal', R.nodal]]) {
    kv.append(el('dt', null, label));
    cells[k] = el('dd');
    kv.append(cells[k]);
  }
  t3.append(readTitle, kv);
  const list = el('ul', 'formulas');
  for (const f of P.formulas) list.append(el('li', null, f));
  t3.append(list);

  // ---- Tab 4: Hiệu năng ----
  const t4 = tabs[3].body;
  const Q = P.qualityNames;
  segmented(t4, 'quality', P.quality, P.tipQuality, [['auto', Q.auto], ['low', Q.low], ['medium', Q.medium], ['high', Q.high]]);
  const qNow = el('p', 'note');
  t4.append(qNow);
  toggle(t4, 'reflection', P.reflection);
  toggle(t4, 'refraction', P.refraction, null, () => qualityState.level === 'low');
  toggle(t4, 'foam', P.foam, null, () => qualityState.level === 'low');
  const lowNote = el('p', 'note', P.lowNote);
  t4.append(lowNote);
  toggle(t4, 'showFps', P.showFps);
  const resetBtn = el('button', 'btn btn--block btn--warn tip-left push-end', P.reset);
  resetBtn.type = 'button';
  resetBtn.dataset.tip = P.tipReset;
  resetBtn.addEventListener('click', () => actions.resetDefaults());
  t4.append(resetBtn, el('p', 'note', P.keys));

  let qualityState = { level: 'medium', simRes: 512, pixelRatio: 1 };

  select(active);

  function sync() {
    for (const s of syncers) s();
  }

  // Live values: quality level and readout (cheap; called only when they change).
  function setInfo(q, r) {
    qualityState = q;
    qNow.textContent = P.current(Q[q.level], q.simRes, fmt(q.pixelRatio, 2));
    lowNote.hidden = q.level !== 'low';
    cells.f.textContent = `${fmt(r.f, 2)} ${U.hz}`;
    cells.lambda.textContent = `${fmt(r.lambda, 3)} ${U.len}`;
    cells.speed.textContent = `${fmt(WAVE_SPEED, 2)} ${U.speed}`;
    cells.d.textContent = r.d == null ? R.na : `${fmt(r.d, 2)} ${U.len}`;
    cells.ratio.textContent = r.d == null ? R.na : fmt(r.d / r.lambda, 2);
    cells.nodal.textContent = r.nodal == null ? R.na : String(r.nodal);
  }

  sync();
  container.append(panel);
  return {
    element: panel,
    sync,
    setInfo,
    get open() { return !panel.hidden; },
    setOpen(open) {
      panel.hidden = !open;
      if (open) sync();
    },
  };
}
