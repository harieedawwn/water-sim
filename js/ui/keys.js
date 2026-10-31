// Keyboard shortcuts: 1 2 4 balls, L layout, Space sources, M next view, D move mode, F fps, T tuning,
// P freeze frame, H presentation, Esc leaves presentation / closes the settings panel.

const CODES = {
  Digit1: ['setCount', 1], Numpad1: ['setCount', 1],
  Digit2: ['setCount', 2], Numpad2: ['setCount', 2],
  Digit3: ['setCount', 3], Numpad3: ['setCount', 3],
  Digit4: ['setCount', 4], Numpad4: ['setCount', 4],
  KeyL: ['toggleLayout'],
  Space: ['toggleRunning'],
  KeyM: ['nextView'],
  KeyD: ['toggleMoveMode'],
  KeyF: ['toggleFps'],
  KeyT: ['toggleTuning'],
  KeyH: ['togglePresentation'],
  KeyP: ['toggleFreeze'],
  Escape: ['escape'],
};

export function installKeys(actions) {
  // How focus last moved: Tab / arrows (keyboard user) or pointer. :focus-visible cannot be used,
  // Chrome turns it on for a clicked control as soon as any key is pressed.
  let keyboardFocus = false;
  window.addEventListener('pointerdown', () => { keyboardFocus = false; }, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboardFocus = true;
  }, true);

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const entry = CODES[e.code];
    if (!entry) return;
    const t = e.target;
    const control = e.code === 'Space' && t instanceof HTMLElement
      && (t.tagName === 'BUTTON' || t.tagName === 'INPUT') && t.type !== 'range';
    // A control reached by keyboard keeps Space; one merely clicked with the mouse must not
    // swallow the shortcut (it would re-press the button / re-toggle the switch).
    if (control && keyboardFocus) return;
    const fn = actions[entry[0]];
    if (!fn) return;
    e.preventDefault();
    if (control) t.blur();
    fn(entry[1]);
  });
}
