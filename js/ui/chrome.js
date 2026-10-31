// Fixed page chrome: the white glass title plate (upper left), the school name (top right) and the bottom row. The bottom row is a three-column
// grid (free | toolbar | corner: trash bin), so the bin can never overlap the toolbar at any screen size.
// Both plates stay visible in presentation mode and fullscreen (see style.css).
import { STR } from './strings.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Returns { toolbarSlot, cornerSlot }: where the toolbar and the trash bin go.
export function createChrome(container) {
  const title = el('h1', 'plate title title--glass', STR.chrome.title);
  const bottom = el('div', 'bottom');
  const slot = el('div', 'bottom__slot');
  const school = el('p', 'school', STR.chrome.footer);
  const corner = el('div', 'bottom__corner');
  bottom.append(el('div'), slot, corner);
  container.append(school, title, bottom);
  return { toolbarSlot: slot, cornerSlot: corner };
}
