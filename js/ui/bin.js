// Trash bin (bottom right corner): click removes every sample on the water (they fly into it, sample.js);
// a carried sample released over it is deleted too. Dimmed and inert while nothing is on the water.
import { STR } from './strings.js';

const OPEN_MS = 520;     // lid stays open while the samples fly in (sample.js VANISH_S)
const BOUNCE_MS = 420;   // lid snap-shut bounce (style.css)
const HOVER_PAD = 10;    // px around the button that still count as "over the bin" when releasing

const SVG = `<svg viewBox="0 0 40 44" aria-hidden="true">
<g class="bin__lid">
<path d="M15.5 7V5.2a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2V7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
<rect x="5" y="7.5" width="30" height="4.6" rx="2.2" fill="currentColor"/>
</g>
<path d="M8.2 15.5h23.6l-2.1 23.3a3 3 0 0 1-3 2.7H13.3a3 3 0 0 1-3-2.7z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M15.2 20.5l.6 15.5M20 20.5V36M24.8 20.5l-.6 15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// onClear(): remove every sample on the water.
export function createBin(container, onClear) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bin plate tip-up';
  btn.dataset.tip = STR.bin.label;
  btn.setAttribute('aria-label', STR.bin.label);
  btn.innerHTML = SVG;
  const badge = document.createElement('span');
  badge.className = 'bin__badge';
  btn.append(badge);
  container.append(btn);

  let count = -1;
  let t1 = 0;
  let t2 = 0;
  btn.addEventListener('click', () => {
    btn.blur();
    if (count > 0) onClear();
  });

  return {
    element: btn,

    // Number of samples on the water (0: dimmed, no-op).
    setCount(n) {
      if (n === count) return;
      count = n;
      btn.classList.toggle('is-empty', n === 0);
      btn.setAttribute('aria-disabled', String(n === 0));
      badge.hidden = n === 0;
      badge.textContent = String(n);
    },

    // Pointer (CSS px) over the bin.
    contains(px, py) {
      const r = btn.getBoundingClientRect();
      if (r.width === 0) return false;
      return px >= r.left - HOVER_PAD && px <= r.right + HOVER_PAD && py >= r.top - HOVER_PAD && py <= r.bottom + HOVER_PAD;
    },

    // Centre of the bin (CSS px) into out {x, y}; false when not shown.
    centre(out) {
      const r = btn.getBoundingClientRect();
      if (r.width === 0) return false;
      out.x = r.left + r.width / 2;
      out.y = r.top + r.height / 2;
      return true;
    },

    // A carried sample hovers over the bin.
    setHover(on) { btn.classList.toggle('is-hover', on); },

    // Lid flips open while samples fly in, then snaps shut with a small bounce.
    swallow() {
      clearTimeout(t1);
      clearTimeout(t2);
      btn.classList.remove('is-closing');
      btn.classList.add('is-open');
      t1 = setTimeout(() => {
        btn.classList.remove('is-open');
        btn.classList.add('is-closing');
        t2 = setTimeout(() => btn.classList.remove('is-closing'), BOUNCE_MS);
      }, OPEN_MS);
    },
  };
}
