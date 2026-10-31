// Bottom toolbar: ball count, run/stop sources, freeze frame, clear waves, settings, presentation, fullscreen.
import { STR } from './strings.js';
import { ICONS } from './icons.js';

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

// actions: { setCount(n), toggleRunning(), toggleFreeze(), clearWaves(), toggleSettings(), togglePresentation(), toggleFullscreen() }
export function createToolbar(container, settings, actions) {
  const T = STR.toolbar;
  const bar = document.createElement('div');
  bar.className = 'toolbar plate';
  bar.setAttribute('role', 'toolbar');

  // Ball count
  const countGroup = document.createElement('div');
  countGroup.className = 'toolbar__group';
  const countLabel = document.createElement('span');
  countLabel.className = 'toolbar__label btn__text';
  countLabel.textContent = T.count;
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.dataset.tip = T.tipCount;
  seg.classList.add('tip-up');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', T.count);
  seg.dataset.tour = 'count';
  const countBtns = [1, 2, 3, 4].map((n) => {
    const b = button('seg__btn');
    b.textContent = String(n);
    b.setAttribute('aria-label', STR.toolbar.countN(n));
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

  // Freeze frame: stops time for the whole water (not only the emitters).
  const freezeBtn = button('btn', T.tipFreeze);
  freezeBtn.addEventListener('click', () => { actions.toggleFreeze(); freezeBtn.blur(); });

  const clearBtn = button('btn', T.tipClear);
  clearBtn.innerHTML = `${ICONS.clear}<span class="btn__text">${T.clear}</span>`;
  clearBtn.setAttribute('aria-label', T.clear);
  clearBtn.addEventListener('click', () => { actions.clearWaves(); clearBtn.blur(); });

  const settingsBtn = button('btn', T.tipSettings);
  settingsBtn.innerHTML = `${ICONS.settings}<span class="btn__text">${T.settings}</span>`;
  settingsBtn.setAttribute('aria-label', T.settings);
  settingsBtn.addEventListener('click', () => { actions.toggleSettings(); settingsBtn.blur(); });

  const presentBtn = button('btn btn--icon btn--optional', T.tipPresent);
  presentBtn.innerHTML = ICONS.present;
  presentBtn.setAttribute('aria-label', T.present);
  presentBtn.addEventListener('click', () => { actions.togglePresentation(); presentBtn.blur(); });

  const fsBtn = button('btn btn--icon btn--optional', T.tipFullscreen);
  fsBtn.addEventListener('click', () => { actions.toggleFullscreen(); fsBtn.blur(); });

  runBtn.dataset.tour = freezeBtn.dataset.tour = clearBtn.dataset.tour = 'runclear';   // guided tour targets (tour.js)
  settingsBtn.dataset.tour = 'settings';
  presentBtn.dataset.tour = fsBtn.dataset.tour = 'screen';
  bar.append(countGroup, sep(), runBtn, freezeBtn, clearBtn, sep(), settingsBtn, presentBtn, fsBtn);
  container.append(bar);

  function sync(state) {
    for (const [n, b] of countBtns) b.setAttribute('aria-pressed', String(settings.sourceCount === n));
    const running = settings.sourcesRunning;
    runBtn.setAttribute('aria-pressed', String(running));
    runBtn.innerHTML = running ? `${ICONS.pause}<span class="btn__text">${T.stop}</span>` : `${ICONS.play}<span class="btn__text">${T.run}</span>`;
    runBtn.setAttribute('aria-label', running ? T.stop : T.run);
    const frozen = !!state.frozen;
    freezeBtn.setAttribute('aria-pressed', String(frozen));
    freezeBtn.classList.toggle('btn--accent', frozen);
    freezeBtn.innerHTML = `${frozen ? ICONS.unfreeze : ICONS.freeze}<span class="btn__text">${frozen ? T.unfreeze : T.freeze}</span>`;
    freezeBtn.setAttribute('aria-label', frozen ? T.unfreeze : T.freeze);
    settingsBtn.setAttribute('aria-pressed', String(!!state.settingsOpen));
    settingsBtn.classList.toggle('btn--accent', !!state.settingsOpen);
    const fs = !!document.fullscreenElement;
    fsBtn.innerHTML = fs ? ICONS.exitFullscreen : ICONS.fullscreen;
    fsBtn.setAttribute('aria-label', fs ? T.exitFullscreen : T.fullscreen);
  }

  return { element: bar, sync };
}
