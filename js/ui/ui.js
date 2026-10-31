// Settings panel: one scrolling list of grouped sections (view, sources, lines, phase, more) and a
// collapsed "Nâng cao" section. Side panel on desktop, bottom sheet on phones (see style.css).
import { STR, fmt } from './strings.js';
import { LIMITS, VIEWS, MAX_SOURCES, BALL_COLORS } from '../config.js';
import { LINE_COLORS } from '../lines.js';
import { ICONS } from './icons.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function dot() {
  const d = el('span', 'dot');
  d.style.background = 'var(--ball-color)';
  return d;
}

// Exactly 2 sources with equal frequency: the interference lines can be drawn.
export function linesAvailable(s) {
  if (s.sourceCount !== 2) return false;
  return !s.perSourceFreq || s.sourceFreqs[0] === s.sourceFreqs[1];
}

/*
  actions: { onChange(key), setView(id), resetPositions(), resetDefaults(), close() }
*/
export function createSettingsPanel(container, settings, actions) {
  const P = STR.panel;
  const U = STR.units;
  const panel = el('div', 'panel plate');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', P.title);
  const syncers = [];

  const head = el('div', 'panel__head');
  head.append(el('h2', 'panel__title', P.title));
  const closeBtn = el('button', 'btn btn--icon btn--quiet');
  closeBtn.type = 'button';
  closeBtn.innerHTML = ICONS.close;
  closeBtn.setAttribute('aria-label', P.close);
  closeBtn.addEventListener('click', () => actions.close());
  head.append(closeBtn);
  const body = el('div', 'panel__body');
  panel.append(head, body);

  // ---- control builders ----
  function section(title) {
    const sec = el('section', 'sec');
    sec.append(el('h3', 'sec__title', title));
    body.append(sec);
    return sec;
  }

  const note = (parent, text, cls = 'note') => parent.appendChild(el('p', cls, text));

  // get / set default to settings[key]; isHidden() hides the whole row; source adds the green dot.
  function slider(parent, key, label, tip, lim, format, opts = {}) {
    const get = opts.get || (() => settings[key]);
    const set = opts.set || ((v) => { settings[key] = v; });
    const row = el('div', 'row');
    const lab = el('label', 'row__label tip-side');
    if (tip) lab.dataset.tip = tip;
    const name = el('span', 'row__name');
    if (opts.source) name.append(dot());
    name.append(label);
    const value = el('output', 'row__value');
    lab.append(name, value);
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

  // Segmented control; onPick overrides the default settings[key] = value.
  function segmented(parent, key, label, tip, options, onPick, hideLabel = false) {
    const row = el('div', 'row');
    const lab = el('div', 'row__label tip-side');
    lab.append(el('span', 'row__name', label));
    if (tip) lab.dataset.tip = tip;
    lab.hidden = hideLabel;
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label);
    const buttons = options.map(([val, text]) => {
      const b = el('button', 'seg__btn', text);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (onPick) { onPick(val); return; }
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

  // opts: { disabled(), hidden() }
  function toggle(parent, key, label, tip, opts = {}) {
    const lab = el('label', 'switch');
    if (tip) {
      lab.dataset.tip = tip;
      lab.classList.add('tip-side');
    }
    const text = el('span', null, label);
    const input = el('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      actions.onChange(key);
    });
    lab.append(text, input);
    parent.append(lab);
    syncers.push(() => {
      input.checked = !!settings[key];
      if (opts.disabled) input.disabled = opts.disabled();
      if (opts.hidden) lab.hidden = opts.hidden();
    });
    return lab;
  }

  function button(parent, icon, label, tip, onClick, cls = '') {
    const b = el('button', `btn btn--block ${cls}`);
    b.type = 'button';
    b.innerHTML = `${icon}<span>${label}</span>`;
    if (tip) {
      b.dataset.tip = tip;
      b.classList.add('tip-side');
    }
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  }

  const PHASE_CHIPS = [0, 15, 30, 45, 60, 90, 180];
  const CHIP_HUES = [200, 160, 120, 50, 30, 330, 270];   // one colour per preset
  const hz = (v) => `${fmt(v, 2)} ${U.hz}`;
  const deg = (v) => `${Math.round(v)}${U.deg}`;

  // ---- Chế độ xem ----
  const secView = section(P.secView);
  segmented(secView, 'view', P.view, P.tipView,
    VIEWS.map((id) => [id, id === 'lake' ? STR.views.lake : id === 'sea' ? STR.views.sea : STR.views.twoD]),
    (id) => actions.setView(id), true);

  // ---- Nguồn sóng ----
  const secSrc = section(P.secSources);
  toggle(secSrc, 'moveMode', P.moveMode, P.tipMoveMode);
  slider(secSrc, 'frequency', P.frequency, P.tipFrequency, LIMITS.frequency, hz,
    { isHidden: () => settings.perSourceFreq });
  toggle(secSrc, 'perSourceFreq', P.perSourceFreq, P.tipPerSourceFreq);
  for (let i = 0; i < MAX_SOURCES; i++) {
    slider(secSrc, 'sourceFreqs', STR.sourceName(i), P.tipFreqOf, LIMITS.frequency, hz, {
      id: `sourceFreq${i}`,
      source: true,
      get: () => settings.sourceFreqs[i],
      set: (v) => { settings.sourceFreqs[i] = v; },
      isHidden: () => !settings.perSourceFreq || i >= settings.sourceCount,
    });
  }

  // ---- Đường giao thoa ----
  const secLines = section(P.secLines);
  toggle(secLines, 'showMaxima', P.maxima, P.tipMaxima);
  toggle(secLines, 'showMinima', P.minima, P.tipMinima);
  const legend = el('ul', 'legend');
  const legendItem = (color, dashed, name, lineStyle) => {
    const li = el('li', 'legend__item');
    const sw = el('span', 'legend__swatch');
    sw.style.borderTopColor = color;
    sw.style.borderTopStyle = dashed ? 'dashed' : 'solid';
    li.append(sw, el('span', null, `${name} (${lineStyle})`));
    legend.append(li);
    return li;
  };
  const legendMax = legendItem(LINE_COLORS.max, false, P.maxima, P.legendSolid);
  const legendMin = legendItem(LINE_COLORS.min, true, P.minima, P.legendDashed);
  secLines.append(legend);
  const linesNote = note(secLines, P.linesNeed, 'note note--warn');
  syncers.push(() => {
    const ok = linesAvailable(settings);
    linesNote.hidden = ok;
    legendMax.hidden = !settings.showMaxima;
    legendMin.hidden = !settings.showMinima;
    legend.hidden = !ok || (!settings.showMaxima && !settings.showMinima);
  });

  // ---- Pha ban đầu ----
  phaseSection(section(P.secPhase));

  // ---- Tùy chỉnh thêm ----
  const secMore = section(P.secMore);
  slider(secMore, 'spacing', P.spacing, P.tipSpacing, LIMITS.spacing, (v) => `${fmt(v, 1)} ${U.len}`);
  slider(secMore, 'amplitude', P.amplitude, P.tipAmplitude, LIMITS.amplitude, (v) => `${fmt(v, 3)} ${U.len}`);
  segmented(secMore, 'layout', P.layout, P.tipLayout, [['hang', P.layoutHang], ['vuong', P.layoutVuong]]);
  slider(secMore, 'ballSize', P.ballSize, P.tipBallSize, LIMITS.ballSize, (v) => `×${fmt(v, 2)}`);
  // Ball colour presets: a row of swatches.
  const colorRow = el('div', 'row');
  colorRow.append(el('div', 'row__label', null));
  colorRow.firstChild.append(el('span', 'row__name', P.ballColor));
  const swatches = el('div', 'swatches');
  swatches.setAttribute('role', 'group');
  swatches.setAttribute('aria-label', P.ballColor);
  const swatchBtns = BALL_COLORS.map((hex, i) => {
    const b = el('button', 'swatch');
    b.type = 'button';
    b.style.background = hex;
    b.setAttribute('aria-label', P.ballColorNames[i]);
    b.title = P.ballColorNames[i];
    b.addEventListener('click', () => { settings.ballColor = hex; actions.onChange('ballColor'); });
    swatches.append(b);
    return [hex, b];
  });
  colorRow.append(swatches);
  secMore.append(colorRow);
  syncers.push(() => {
    for (const [hex, b] of swatchBtns) b.setAttribute('aria-pressed', String(settings.ballColor === hex));
  });
  slider(secMore, 'cameraPitch', P.pitch, P.tipPitch, LIMITS.cameraPitch, deg,
    { isHidden: () => settings.view === '2d' });
  toggle(secMore, 'show2dTroughs', P.troughs2d, null, { hidden: () => settings.view !== '2d' });
  toggle(secMore, 'show2dGrid', P.grid2d, null, { hidden: () => settings.view !== '2d' });
  button(secMore, ICONS.target, P.resetPositions, P.tipResetPositions, () => actions.resetPositions());

  // ---- Nâng cao (collapsed) ----
  const adv = el('details', 'sec sec--adv');
  adv.append(el('summary', 'sec__title', P.secAdvanced));
  body.append(adv);
  const Q = P.qualityNames;
  segmented(adv, 'quality', P.quality, P.tipQuality, [['auto', Q.auto], ['low', Q.low], ['medium', Q.medium], ['high', Q.high]]);
  const qNow = note(adv, '');
  toggle(adv, 'reflection', P.reflection);
  toggle(adv, 'refraction', P.refraction, null, { disabled: () => qualityState.level === 'low' });
  toggle(adv, 'foam', P.foam, null, { disabled: () => qualityState.level === 'low' });
  const lowNote = note(adv, P.lowNote);
  toggle(adv, 'showFps', P.showFps);
  button(adv, ICONS.reset, P.reset, P.tipReset, () => actions.resetDefaults(), 'btn--warn');

  let qualityState = { level: 'medium', nx: 0, nz: 0, pixelRatio: 1 };

  // Initial phase per source: S1..SN selector, slider with readout, quick-value chips, hint.
  function phaseSection(parent) {
    let sel = 0;
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', P.secPhase);
    const segBtns = [];
    for (let i = 0; i < MAX_SOURCES; i++) {
      const b = el('button', 'seg__btn');
      b.type = 'button';
      b.append(dot(), STR.sourceName(i));
      b.addEventListener('click', () => { sel = i; sync(); });
      seg.append(b);
      segBtns.push(b);
    }
    const sliderRow = el('div', 'row');
    const lab = el('label', 'row__label');
    const labText = el('span', 'row__name');
    const value = el('output', 'row__value');
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
    chips.setAttribute('aria-label', P.secPhase);
    const chipBtns = PHASE_CHIPS.map((d) => {
      const b = el('button', 'chip', `${d}${U.deg}`);
      b.style.setProperty('--chip-h', String(CHIP_HUES[PHASE_CHIPS.indexOf(d)]));
      b.type = 'button';
      b.addEventListener('click', () => setPhase(d));
      chips.append(b);
      return [d, b];
    });
    parent.append(seg, sliderRow, chips);

    function setPhase(d) {
      settings.phases[sel] = d;
      input.value = String(d);
      show();
      actions.onChange('phases');
    }
    input.addEventListener('input', () => setPhase(parseFloat(input.value)));

    function show() {
      const v = settings.phases[sel];
      value.textContent = deg(v);
      for (const [d, b] of chipBtns) b.setAttribute('aria-pressed', String(d === v));
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
