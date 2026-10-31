// First-visit guided tour: a dim layer with a rounded spotlight "hole" that glides between targets
// (elements marked data-tour="..."), and a tooltip card with an arrow. The layer captures every
// pointer event (a click anywhere = next step) and suspends the single-key shortcuts while active.
import { STR } from './strings.js';

const STORAGE_KEY = 'ripple.tour.v1';
const PAD = 8;            // spotlight padding around the target (px)
const GAP = 14;           // target -> card distance (px), room for the arrow
const EDGE = 8;           // viewport margin for the card (px)
const FADE_MS = 140;      // card fade-out before it moves to the next target

// key: data-tour value(s); panel: the settings panel must be open for this step.
const STEPS = [
  { key: 'count' },
  { key: 'runclear' },
  { key: 'settings' },
  { key: 'move', panel: true },
  { key: 'lines', panel: true },
  { key: 'readout' },
  { key: 'tray' },
  { key: 'screen' },
];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function storedDone() {
  try { return window.localStorage.getItem(STORAGE_KEY) === 'done'; } catch { return false; }
}

function storeDone() {
  try { window.localStorage.setItem(STORAGE_KEY, 'done'); } catch { /* storage refused: nothing to keep */ }
}

/*
  app: { isSettingsOpen(), setSettingsOpen(open), canAutoStart() }
*/
export function createTour(container, app) {
  const T = STR.tour;
  const layer = el('div', 'tour');
  layer.hidden = true;
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  const hole = el('div', 'tour__hole');
  const card = el('div', 'tour__card');
  const arrow = el('div', 'tour__arrow');
  const title = el('h3', 'tour__title');
  const text = el('p', 'tour__text');
  const foot = el('div', 'tour__foot');
  const count = el('span', 'tour__count');
  const skipBtn = el('button', 'btn btn--quiet tour__skip', T.skip);
  const nextBtn = el('button', 'btn btn--accent tour__next', T.next);
  skipBtn.type = nextBtn.type = 'button';
  foot.append(count, skipBtn, nextBtn);
  card.append(arrow, title, text, foot);
  layer.append(hole, card);
  container.append(layer);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rect = { left: 0, top: 0, right: 0, bottom: 0 };
  let steps = [];          // the STEPS whose target exists in this layout
  let index = -1;
  let active = false;
  let openedPanel = false; // the tour opened the settings panel (close it again afterwards)
  let fadeTimer = 0;
  let placed = false;      // the hole has a position (first step appears without gliding)

  const targets = (key) => document.querySelectorAll(`[data-tour~="${key}"]`);

  // Union of the visible target boxes into rect; false when nothing is visible.
  function measure(key) {
    let any = false;
    for (const t of targets(key)) {
      const r = t.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (!any) {
        rect.left = r.left; rect.top = r.top; rect.right = r.right; rect.bottom = r.bottom;
        any = true;
      } else {
        rect.left = Math.min(rect.left, r.left); rect.top = Math.min(rect.top, r.top);
        rect.right = Math.max(rect.right, r.right); rect.bottom = Math.max(rect.bottom, r.bottom);
      }
    }
    return any;
  }

  // Step is usable: target in the DOM, and (outside the panel) currently rendered.
  function usable(step) {
    const list = targets(step.key);
    if (!list.length) return false;
    if (step.panel) return true;
    for (const t of list) if (t.getClientRects().length && !t.closest('[hidden]')) return true;
    return false;
  }

  function setPanel(step) {
    if (step.panel && !app.isSettingsOpen()) {
      app.setSettingsOpen(true);
      openedPanel = true;
    } else if (!step.panel && openedPanel && app.isSettingsOpen()) {
      app.setSettingsOpen(false);
      openedPanel = false;
    }
  }

  function placeHole() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const l = Math.max(2, rect.left - PAD);
    const t = Math.max(2, rect.top - PAD);
    const w = Math.min(vw - 2, rect.right + PAD) - l;
    const h = Math.min(vh - 2, rect.bottom + PAD) - t;
    hole.style.left = `${l}px`;
    hole.style.top = `${t}px`;
    hole.style.width = `${w}px`;
    hole.style.height = `${h}px`;
    hole.style.borderRadius = `${Math.min(16, h / 2)}px`;
  }

  // Card side from the free space (bottom, top, right, left), clamped to the viewport; the arrow
  // points at the target centre.
  function placeCard() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const l = rect.left - PAD;
    const r = rect.right + PAD;
    const t = rect.top - PAD;
    const b = rect.bottom + PAD;
    const space = { bottom: vh - b, top: t, right: vw - r, left: l };
    const fits = {
      bottom: space.bottom >= ch + GAP + EDGE,
      top: space.top >= ch + GAP + EDGE,
      right: space.right >= cw + GAP + EDGE,
      left: space.left >= cw + GAP + EDGE,
    };
    let side = 'top';
    if (fits.top || fits.bottom) side = space.top >= space.bottom ? (fits.top ? 'top' : 'bottom') : (fits.bottom ? 'bottom' : 'top');
    else if (fits.right || fits.left) side = space.right >= space.left ? 'right' : 'left';
    else side = Object.keys(space).reduce((a, k) => (space[k] > space[a] ? k : a), 'top');
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    let x;
    let y;
    if (side === 'top' || side === 'bottom') {
      x = Math.min(Math.max(cx - cw / 2, EDGE), vw - cw - EDGE);
      y = side === 'top' ? t - GAP - ch : b + GAP;
    } else {
      y = Math.min(Math.max(cy - ch / 2, EDGE), vh - ch - EDGE);
      x = side === 'left' ? l - GAP - cw : r + GAP;
    }
    y = Math.min(Math.max(y, EDGE), vh - ch - EDGE);
    x = Math.min(Math.max(x, EDGE), vw - cw - EDGE);
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
    card.dataset.side = side;
    // Arrow offset along the card edge, kept clear of the rounded corners.
    if (side === 'top' || side === 'bottom') arrow.style.setProperty('--at', `${Math.min(Math.max(cx - x, 18), cw - 18)}px`);
    else arrow.style.setProperty('--at', `${Math.min(Math.max(cy - y, 18), ch - 18)}px`);
  }

  function fillCard() {
    const step = steps[index];
    const copy = T.steps[step.key];
    title.textContent = copy.title;
    text.textContent = copy.text;
    count.textContent = T.progress(index + 1, steps.length);
    nextBtn.textContent = index === steps.length - 1 ? T.done : T.next;
  }

  // Measure after layout settles (panel just opened / section scrolled into view).
  function layout(animateCard) {
    const step = steps[index];
    if (!step) return;
    requestAnimationFrame(() => {
      if (!active || steps[index] !== step) return;
      if (!measure(step.key)) {
        go(index + 1);   // target vanished in this layout: skip the step
        return;
      }
      layer.classList.toggle('tour--still', reduced.matches || !placed);
      placeHole();
      placed = true;
      if (animateCard) fillCard();
      placeCard();
      card.classList.remove('is-hidden');
      if (!reduced.matches) requestAnimationFrame(() => layer.classList.remove('tour--still'));
    });
  }

  function go(i) {
    clearTimeout(fadeTimer);
    if (i >= steps.length) {
      finish();
      return;
    }
    index = i;
    const step = steps[index];
    if (!usable(step)) {
      go(index + 1);
      return;
    }
    setPanel(step);
    const first = targets(step.key)[0];
    if (step.panel && first) first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (!placed || reduced.matches) {
      layout(true);
      return;
    }
    card.classList.add('is-hidden');
    fadeTimer = setTimeout(() => layout(true), FADE_MS);
  }

  function next() { if (active) go(index + 1); }

  function finish() {
    if (!active) return;
    active = false;
    clearTimeout(fadeTimer);
    storeDone();
    layer.hidden = true;
    if (openedPanel && app.isSettingsOpen()) app.setSettingsOpen(false);
    openedPanel = false;
  }

  function start() {
    if (active) return;
    steps = STEPS.filter(usable);
    if (!steps.length) return;
    active = true;
    placed = false;
    openedPanel = false;
    layer.hidden = false;
    card.classList.add('is-hidden');
    go(0);
    nextBtn.focus({ preventScroll: true });
  }

  // Clicks anywhere on the layer (dimmed area or the highlighted target) advance; the card itself
  // only reacts through its buttons.
  layer.addEventListener('click', (e) => {
    if (e.target === skipBtn) finish();
    else if (e.target === nextBtn || !card.contains(e.target)) next();
  });
  // The layer swallows pointer / wheel input so nothing reaches the canvas or the controls below.
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'contextmenu']) {
    layer.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === 'wheel' || type === 'contextmenu') e.preventDefault();
    }, { passive: false });
  }
  // Capture phase on window: runs before the app shortcuts (keys.js) and stops them.
  window.addEventListener('keydown', (e) => {
    if (!active) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
    } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key !== 'Tab') {
      e.preventDefault();
    }
  }, true);
  const relayout = () => { if (active) layout(false); };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);

  return {
    get active() { return active; },
    start,
    // First visit only, and not over the error overlay or in presentation mode.
    autoStart() {
      if (storedDone() || !app.canAutoStart()) return;
      start();
    },
  };
}
