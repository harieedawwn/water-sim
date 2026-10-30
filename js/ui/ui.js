// Settings panel: 3 tabs (Thí nghiệm, Cảnh, Hiệu năng). Plain working controls; restyled in P6.
import { STR, fmt } from './strings.js';
import { LIMITS, VIEWS, MAX_SOURCES, BALL_HEX } from '../config.js';

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

const THUMB_2D = 'radial-gradient(circle at 50% 60%, transparent 0 18%, rgba(255,255,255,0.7) 19% 21%, '
  + 'transparent 22% 38%, rgba(255,255,255,0.5) 39% 41%, transparent 42%), #0A0D11';

// Exactly 2 sources with equal frequency: the interference lines can be drawn.
export function linesAvailable(s) {
  if (s.sourceCount !== 2) return false;
  return !s.perSourceFreq || s.sourceFreqs[0] === s.sourceFreqs[1];
}

/*
  maps:    MAPS (index 0 = lake, 1 = sea) for the view thumbnails
  actions: { onChange(key), setView(id), resetPositions(), resetDefaults(), close() }
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
  // get / set default to settings[key]; isHidden() hides the whole row.
  function slider(parent, key, label, tip, lim, format, opts = {}) {
    const get = opts.get || (() => settings[key]);
    const set = opts.set || ((v) => { settings[key] = v; });
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
    lab.htmlFor = input.id = `set-${opts.id || key}`;
    input.addEventListener('input', () => {
      set(parseFloat(input.value));
      value.textContent = format(get());
      actions.onChange(key);
    });
    row.append(lab, input);
    parent.append(row);
    syncers.push(() => {
      if (opts.isHidden) row.hidden = opts.isHidden();
      input.value = String(get());
      value.textContent = format(get());
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

  function button(parent, label, tip, onClick) {
    const b = el('button', 'btn btn--block tip-left', label);
    b.type = 'button';
    b.dataset.tip = tip;
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  }

  // Initial phase per source: S1..SN selector, slider with readout, quick-value chips, hint.
  const PHASE_CHIPS = [0, 15, 30, 45, 60, 90, 180];
  function phaseSection(parent) {
    let sel = 0;
    const box = el('div', 'row phase');
    const title = el('div', 'row__label tip-left', P.phase);
    title.dataset.tip = P.tipPhase;
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', P.phase);
    const segBtns = [];
    for (let i = 0; i < MAX_SOURCES; i++) {
      const b = el('button', 'seg__btn');
      b.type = 'button';
      const dot = el('span', 'seg__dot');
      dot.style.background = BALL_HEX;
      b.append(dot, STR.sourceName(i));
      b.addEventListener('click', () => { sel = i; sync(); });
      seg.append(b);
      segBtns.push(b);
    }
    const sliderRow = el('div', 'row');
    const lab = el('label', 'row__label');
    const labText = el('span');
    const value = el('span', 'row__value');
    lab.append(labText, value);
    const input = el('input', 'range');
    input.type = 'range';
    input.min = String(LIMITS.phase.min);
    input.max = String(LIMITS.phase.max);
    input.step = String(LIMITS.phase.step);
    lab.htmlFor = input.id = 'set-phase';
    sliderRow.append(lab, input);
    const chips = el('div', 'chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', P.phase);
    const chipBtns = PHASE_CHIPS.map((deg) => {
      const b = el('button', 'chip', `${deg}${U.deg}`);
      b.type = 'button';
      b.addEventListener('click', () => setPhase(deg));
      chips.append(b);
      return [deg, b];
    });
    box.append(title, seg, sliderRow, chips, el('p', 'note', P.phaseHint));
    parent.append(box);

    function setPhase(deg) {
      settings.phases[sel] = deg;
      input.value = String(deg);
      show();
      actions.onChange('phases');
    }
    input.addEventListener('input', () => setPhase(parseFloat(input.value)));

    function show() {
      const v = settings.phases[sel];
      value.textContent = `${Math.round(v)}${U.deg}`;
      for (const [deg, b] of chipBtns) b.setAttribute('aria-pressed', String(deg === v));
    }
    function sync() {
      if (sel >= settings.sourceCount) sel = settings.sourceCount - 1;
      segBtns.forEach((b, i) => {
        b.hidden = i >= settings.sourceCount;
        b.setAttribute('aria-pressed', String(i === sel));
      });
      labText.textContent = P.phaseOf(sel);
      input.value = String(settings.phases[sel]);
      show();
    }
    syncers.push(sync);
  }

  const hz = (v) => `${fmt(v, 2)} ${U.hz}`;

  // ---- Tab 1: Thí nghiệm ----
  const t1 = tabs[0].body;
  slider(t1, 'frequency', P.frequency, P.tipFrequency, LIMITS.frequency, hz,
    { isHidden: () => settings.perSourceFreq });
  toggle(t1, 'perSourceFreq', P.perSourceFreq, P.tipPerSourceFreq);
  for (let i = 0; i < MAX_SOURCES; i++) {
    slider(t1, 'sourceFreqs', P.freqOf(i), P.tipFreqOf, LIMITS.frequency, hz, {
      id: `sourceFreq${i}`,
      get: () => settings.sourceFreqs[i],
      set: (v) => { settings.sourceFreqs[i] = v; },
      isHidden: () => !settings.perSourceFreq || i >= settings.sourceCount,
    });
  }
  slider(t1, 'amplitude', P.amplitude, P.tipAmplitude, LIMITS.amplitude, (v) => `${fmt(v, 3)} ${U.len}`);
  slider(t1, 'spacing', P.spacing, P.tipSpacing, LIMITS.spacing, (v) => `${fmt(v, 1)} ${U.len}`);
  phaseSection(t1);
  segmented(t1, 'layout', P.layout, P.tipLayout, [['hang', P.layoutHang], ['vuong', P.layoutVuong]]);
  toggle(t1, 'moveMode', P.moveMode, P.tipMoveMode);
  button(t1, P.resetPositions, P.tipResetPositions, () => actions.resetPositions());
  toggle(t1, 'showMaxima', P.maxima, P.tipMaxima);
  toggle(t1, 'showMinima', P.minima, P.tipMinima);
  const linesNote = el('p', 'note note--warn', P.linesNeed);
  t1.append(linesNote);
  syncers.push(() => { linesNote.hidden = linesAvailable(settings); });

  // ---- Tab 2: Cảnh ----
  const t2 = tabs[1].body;
  const viewRow = el('div', 'row');
  const viewLab = el('div', 'row__label tip-left', P.view);
  viewLab.dataset.tip = P.tipView;
  const grid = el('div', 'maps');
  const viewBtns = VIEWS.map((id, i) => {
    const b = el('button', 'map-btn');
    b.type = 'button';
    const th = el('span', 'map-btn__thumb');
    th.style.background = id === '2d' ? THUMB_2D : thumbStyle(maps[i]);
    const name = id === 'lake' ? STR.views.lake : id === 'sea' ? STR.views.sea : STR.views.twoD;
    b.append(th, el('span', 'map-btn__name', name));
    b.addEventListener('click', () => actions.setView(id));
    grid.append(b);
    return [id, b];
  });
  viewRow.append(viewLab, grid);
  t2.append(viewRow);
  syncers.push(() => { for (const [id, b] of viewBtns) b.setAttribute('aria-pressed', String(settings.view === id)); });
  slider(t2, 'cameraPitch', P.pitch, P.tipPitch, LIMITS.cameraPitch, (v) => `${Math.round(v)}${U.deg}`);
  toggle(t2, 'show2dTroughs', P.troughs2d);
  toggle(t2, 'show2dGrid', P.grid2d);

  // ---- Tab 3: Hiệu năng ----
  const t3 = tabs[2].body;
  const Q = P.qualityNames;
  segmented(t3, 'quality', P.quality, P.tipQuality, [['auto', Q.auto], ['low', Q.low], ['medium', Q.medium], ['high', Q.high]]);
  const qNow = el('p', 'note');
  t3.append(qNow);
  toggle(t3, 'reflection', P.reflection);
  toggle(t3, 'refraction', P.refraction, null, () => qualityState.level === 'low');
  toggle(t3, 'foam', P.foam, null, () => qualityState.level === 'low');
  const lowNote = el('p', 'note', P.lowNote);
  t3.append(lowNote);
  toggle(t3, 'showFps', P.showFps);
  const resetBtn = el('button', 'btn btn--block btn--warn tip-left push-end', P.reset);
  resetBtn.type = 'button';
  resetBtn.dataset.tip = P.tipReset;
  resetBtn.addEventListener('click', () => actions.resetDefaults());
  t3.append(resetBtn, el('p', 'note', P.keys));

  let qualityState = { level: 'medium', nx: 0, nz: 0, pixelRatio: 1 };

  select(active);

  function sync() {
    for (const s of syncers) s();
  }

  // Live quality values (cheap; called only when they change).
  function setInfo(q) {
    qualityState = q;
    qNow.textContent = P.current(Q[q.level], q.nx, q.nz, fmt(q.pixelRatio, 2));
    lowNote.hidden = q.level !== 'low';
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
