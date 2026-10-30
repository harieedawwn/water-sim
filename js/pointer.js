// Pointer input on the water (mouse and touch). Move mode off: click / drag makes drops (3D views).
// Move mode on: hovering a source highlights it, dragging moves it (all views).
import { BALL_RADIUS } from './config.js';

const DROP_INTERVAL = 0.05;   // s between drops while dragging
const HIT_PX = 30;            // pick radius around a source, CSS px (touch: larger)
const HIT_PX_TOUCH = 44;

// state(): { is2d, moveMode }; actions: { drop(x, z), moveSource(i, x, z) }
export function installPointer(canvas, framing, sources, state, actions) {
  const w = { x: 0, z: 0 };
  const s = { x: 0, y: 0 };
  let mode = '';              // '' | 'drop' | 'drag'
  let dragIndex = -1;
  let offX = 0;
  let offZ = 0;
  let hover = -1;
  let px = 0;
  let py = 0;
  let dropTimer = 0;
  let cursor = '';

  function toWorld() {
    return state().is2d ? framing.screenToWorld2d(px, py, w) : framing.screenToWater3d(px, py, w);
  }

  function screenOf(i) {
    const p = sources.positions;
    if (state().is2d) return framing.worldToScreen2d(p[i * 2], p[i * 2 + 1], s);
    return framing.worldToScreen3d(p[i * 2], BALL_RADIUS * 0.6, p[i * 2 + 1], s);
  }

  function pick(radius) {
    let best = -1;
    let bestD = radius;
    for (let i = 0; i < sources.count; i++) {
      screenOf(i);
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function refresh() {
    const st = state();
    if (!st.moveMode && mode !== 'drag') hover = -1;
    let c;
    if (st.moveMode) c = mode === 'drag' ? 'grabbing' : hover >= 0 ? 'grab' : 'default';
    else c = st.is2d ? 'default' : 'crosshair';
    if (c !== cursor) {
      cursor = c;
      canvas.style.cursor = c;
    }
  }

  function drop() {
    if (state().is2d || !toWorld()) return;
    actions.drop(w.x, w.z);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    px = e.clientX;
    py = e.clientY;
    if (state().moveMode) {
      const i = pick(e.pointerType === 'mouse' ? HIT_PX : HIT_PX_TOUCH);
      if (i < 0 || !toWorld()) return;
      mode = 'drag';
      dragIndex = i;
      hover = i;
      offX = sources.positions[i * 2] - w.x;
      offZ = sources.positions[i * 2 + 1] - w.z;
    } else {
      mode = 'drop';
      dropTimer = 0;
      drop();
    }
    canvas.setPointerCapture(e.pointerId);
    refresh();
  });

  canvas.addEventListener('pointermove', (e) => {
    px = e.clientX;
    py = e.clientY;
    if (mode === 'drag') {
      if (toWorld()) actions.moveSource(dragIndex, w.x + offX, w.z + offZ);
    } else if (state().moveMode && e.pointerType === 'mouse') {
      hover = pick(HIT_PX);
      refresh();
    }
  });

  const end = (e) => {
    if (mode === 'drag' && e.pointerType !== 'mouse') hover = -1;
    mode = '';
    dragIndex = -1;
    refresh();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    if (mode !== 'drag' && hover >= 0) {
      hover = -1;
      refresh();
    }
  });

  refresh();
  return {
    get hover() { return hover; },
    // Call when move mode or the view changes.
    refresh,
    // Per frame: repeated drops while the pointer is held down.
    tick(dt) {
      if (mode !== 'drop') return;
      dropTimer += dt;
      if (dropTimer >= DROP_INTERVAL) {
        dropTimer = 0;
        drop();
      }
    },
  };
}
