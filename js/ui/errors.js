// On-screen error overlay (Vietnamese). Loaded as its own module graph from index.html,
// so it also reports failures to load main.js or its imports.
import { STR } from './strings.js';

const entries = [];       // { key, title, detail, hint, count }
let root = null;
let logEl = null;
let titleEl = null;
let hintEl = null;

function build() {
  root = document.getElementById('errors');
  if (!root) {
    root = document.createElement('div');
    root.id = 'errors';
    root.className = 'errors';
    document.body.appendChild(root);
  }
  root.textContent = '';

  const head = document.createElement('div');
  head.className = 'errors__head';
  titleEl = document.createElement('h2');
  titleEl.className = 'errors__title';
  titleEl.textContent = STR.err.title;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn';
  copyBtn.textContent = STR.err.copy;
  copyBtn.addEventListener('click', () => {
    copyText(fullText()).then(() => {
      copyBtn.textContent = STR.err.copied;
      setTimeout(() => { copyBtn.textContent = STR.err.copy; }, 1500);
    });
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn';
  closeBtn.textContent = STR.err.close;
  closeBtn.addEventListener('click', () => { root.hidden = true; });

  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.className = 'btn btn--accent';
  reloadBtn.textContent = STR.err.reload;
  reloadBtn.addEventListener('click', () => window.location.reload());

  head.append(titleEl, reloadBtn, copyBtn, closeBtn);

  hintEl = document.createElement('p');
  hintEl.className = 'errors__hint';

  logEl = document.createElement('pre');
  logEl.className = 'errors__log';

  root.append(head, hintEl, logEl);
}

function fullText() {
  const lines = [navigator.userAgent, ''];
  for (const e of entries) {
    lines.push(`## ${e.title}${e.count > 1 ? ' ' + STR.err.repeated(e.count) : ''}`, e.detail, '');
  }
  return lines.join('\n');
}

function render() {
  if (!root) build();
  titleEl.textContent = entries.length === 1 ? entries[0].title : `${STR.err.title} (${entries.length})`;
  logEl.textContent = fullText();
  // What to do: the most recent error's advice, else the generic one.
  let hint = STR.err.hint;
  for (const e of entries) if (e.hint) hint = e.hint;
  hintEl.textContent = hint;
  root.hidden = false;
  window.__rippleErrorShown = true;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* nothing else to try */ }
    ta.remove();
  }
}

function describe(err) {
  if (err == null) return String(err);
  if (err instanceof Error) return err.stack || `${err.name}: ${err.message}`;
  if (typeof err === 'object') {
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

// Public: show an error (deduplicated by title + detail).
export function showError(title, detail = '', hint = '') {
  const text = typeof detail === 'string' ? detail : describe(detail);
  const key = title + '\n' + text;
  const existing = entries.find((e) => e.key === key);
  if (existing) existing.count++;
  else entries.push({ key, title, detail: text, hint, count: 1 });
  console.error(`[${title}]`, text);
  if (document.body) render();
  else window.addEventListener('DOMContentLoaded', render, { once: true });
}

function numbered(src) {
  return src.split('\n').map((l, i) => `${String(i + 1).padStart(4)}: ${l}`).join('\n');
}

// Public: route three.js shader compile/link failures to the overlay.
export function installShaderErrorHook(renderer) {
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const parts = [];
    const progLog = gl.getProgramInfoLog(program);
    if (progLog) parts.push('PROGRAM:\n' + progLog.trim());
    for (const [name, sh] of [['VERTEX', vs], ['FRAGMENT', fs]]) {
      if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) continue;
      parts.push(`${name}:\n${(gl.getShaderInfoLog(sh) || '').trim()}\n\n${numbered(gl.getShaderSource(sh) || '')}`);
    }
    showError(STR.err.shader, parts.join('\n\n'), STR.err.shaderHint);
  };
}

// Runtime errors and resource load failures (capture phase sees <script> errors too). Only errors raised by
// the app's own files are shown: in-app browsers (Zalo, Facebook, ...) inject their own scripts into the page,
// and their errors (e.g. "Can't find variable: zaloJSV2") must not cover the simulator. Those go to the console.
const APP_ROOT = new URL('../../', import.meta.url).href;   // .../water-sim/
const OWN = [`${APP_ROOT}js/`, `${APP_ROOT}vendor/`];
const isOwn = (text) => !!text && OWN.some((prefix) => String(text).includes(prefix));

window.addEventListener('error', (ev) => {
  if (ev instanceof ErrorEvent) {
    const stack = ev.error && ev.error.stack;
    if (!isOwn(ev.filename) && !isOwn(stack)) {
      console.warn('Ignored error from a script outside the app:', ev.message, ev.filename || '');
      return;
    }
    const where = ev.filename ? `\n${ev.filename}:${ev.lineno}:${ev.colno}` : '';
    showError(STR.err.uncaught, `${ev.message}${where}\n${ev.error ? describe(ev.error) : ''}`.trim());
    return;
  }
  const t = ev.target;
  if (t && t !== window && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
    const src = t.src || t.href || '';
    if (!src.startsWith(APP_ROOT)) return;   // a resource injected by the host browser
    showError(STR.err.load, src || t.outerHTML, STR.err.loadHint);
  }
}, true);

window.addEventListener('unhandledrejection', (ev) => {
  const r = ev.reason;
  if (!isOwn(r && r.stack)) {
    console.warn('Ignored unhandled rejection from outside the app:', r);
    return;
  }
  showError(STR.err.promise, describe(r));
});
