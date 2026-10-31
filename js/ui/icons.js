// Inline SVG icons (24x24, drawn with currentColor) shared by the toolbar and the settings panel.
const stroke = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const fill = (d) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;

export const ICONS = {
  play: fill('<path d="M8 5v14l11-7z"/>'),
  freeze: stroke('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M10 9v6M14 9v6"/>'),
  unfreeze: stroke('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M10 8.5v7l5.5-3.5z"/>'),
  pause: fill('<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'),
  clear: stroke('<path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M3 18h18"/>'),
  paper: stroke('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h7"/>'),
  settings: stroke('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  present: stroke('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>'),
  fullscreen: stroke('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exitFullscreen: stroke('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  close: stroke('<path d="M6 6l12 12M18 6L6 18"/>'),
  target: stroke('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  reset: stroke('<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/>'),
};
