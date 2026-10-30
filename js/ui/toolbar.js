// Bottom toolbar: ball count, run/stop sources, clear waves, settings, presentation, fullscreen.
import { STR } from './strings.js';

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M3 18h18"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  present: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  exitFullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
};

function button(cls, tip) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  if (tip) {
    b.dataset.tip = tip;
    b.classList.add('tip-up');
  }
  return b;
}

// actions: { setCount(n), toggleRunning(), clearWaves(), toggleSettings(), togglePresentation(), toggleFullscreen() }
export function createToolbar(container, settings, actions) {
  const T = STR.toolbar;
  const bar = document.createElement('div');
  bar.className = 'toolbar glass';

  // Ball count
  const countGroup = document.createElement('div');
  countGroup.className = 'toolbar__group';
  const countLabel = document.createElement('span');
  countLabel.className = 'toolbar__label';
  countLabel.textContent = T.count;
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.dataset.tip = T.tipCount;
  seg.classList.add('tip-up');
  const countBtns = [1, 2, 4].map((n) => {
    const b = button('seg__btn');
    b.textContent = String(n);
    b.addEventListener('click', () => { actions.setCount(n); b.blur(); });
    seg.append(b);
    return [n, b];
  });
  countGroup.append(countLabel, seg);

  const sep = () => {
    const s = document.createElement('span');
    s.className = 'toolbar__sep';
    return s;
  };

  const runBtn = button('btn btn--run', T.tipRun);
  runBtn.addEventListener('click', () => { actions.toggleRunning(); runBtn.blur(); });

  const clearBtn = button('btn', T.tipClear);
  clearBtn.innerHTML = `${ICONS.clear}<span>${T.clear}</span>`;
  clearBtn.addEventListener('click', () => { actions.clearWaves(); clearBtn.blur(); });

  const settingsBtn = button('btn', T.tipSettings);
  settingsBtn.innerHTML = `${ICONS.settings}<span>${T.settings}</span>`;
  settingsBtn.addEventListener('click', () => { actions.toggleSettings(); settingsBtn.blur(); });

  const presentBtn = button('btn btn--icon', T.tipPresent);
  presentBtn.innerHTML = ICONS.present;
  presentBtn.setAttribute('aria-label', T.present);
  presentBtn.addEventListener('click', () => { actions.togglePresentation(); presentBtn.blur(); });

  const fsBtn = button('btn btn--icon', T.tipFullscreen);
  fsBtn.addEventListener('click', () => { actions.toggleFullscreen(); fsBtn.blur(); });

  bar.append(countGroup, sep(), runBtn, clearBtn, sep(), settingsBtn, presentBtn, fsBtn);
  container.append(bar);

  function sync(state) {
    for (const [n, b] of countBtns) b.setAttribute('aria-pressed', String(settings.sourceCount === n));
    const running = settings.sourcesRunning;
    runBtn.setAttribute('aria-pressed', String(running));
    runBtn.innerHTML = running ? `${ICONS.pause}<span>${T.stop}</span>` : `${ICONS.play}<span>${T.run}</span>`;
    settingsBtn.setAttribute('aria-pressed', String(!!state.settingsOpen));
    settingsBtn.classList.toggle('btn--accent', !!state.settingsOpen);
    const fs = !!document.fullscreenElement;
    fsBtn.innerHTML = fs ? ICONS.exitFullscreen : ICONS.fullscreen;
    fsBtn.setAttribute('aria-label', fs ? T.exitFullscreen : T.fullscreen);
  }

  return { element: bar, sync };
}
