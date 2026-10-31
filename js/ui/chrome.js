// Fixed page chrome: the white glass title plate (upper left), the school name (top right) and the bottom row. The bottom row is a three-column
// grid (free | toolbar | footer), so the footer can never overlap the toolbar at any screen size.
// Both plates stay visible in presentation mode and fullscreen (see style.css).
import { STR } from './strings.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Returns the element the toolbar goes into.
export function createChrome(container) {
  const title = el('h1', 'plate title title--glass', STR.chrome.title);
  const bottom = el('div', 'bottom');
  const slot = el('div', 'bottom__slot');
  const school = el('p', 'school', STR.chrome.footer);
  bottom.append(el('div'), slot, el('div'));
  container.append(school, title, bottom);
  return slot;
}
