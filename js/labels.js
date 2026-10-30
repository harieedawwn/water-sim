// S1..S4 name tags above the 3D balls (DOM). Written only when a tag moves on screen.
import { STR } from './ui/strings.js';
import { BALL_RADIUS, MAX_SOURCES } from './config.js';

const TAG_HEIGHT = BALL_RADIUS * 2.2;   // world height of the tag anchor above the water

export class SourceLabels {
  constructor(before) {
    this.element = document.createElement('div');
    this.element.className = 'src-labels';
    this._tags = [];
    this._x = new Float32Array(MAX_SOURCES).fill(-1e9);
    this._y = new Float32Array(MAX_SOURCES).fill(-1e9);
    this._s = { x: 0, y: 0 };
    for (let i = 0; i < MAX_SOURCES; i++) {
      const tag = document.createElement('span');
      tag.className = 'src-label';
      tag.textContent = STR.sourceName(i);
      this.element.append(tag);
      this._tags.push(tag);
    }
    before.parentNode.insertBefore(this.element, before);
  }

  setVisible(v) { this.element.hidden = !v; }

  update(framing, sources) {
    const p = sources.positions;
    for (let i = 0; i < MAX_SOURCES; i++) {
      const tag = this._tags[i];
      const show = i < sources.count;
      if (tag.hidden === show) tag.hidden = !show;
      if (!show) continue;
      const s = framing.worldToScreen3d(p[i * 2], TAG_HEIGHT, p[i * 2 + 1], this._s);
      if (Math.abs(s.x - this._x[i]) < 0.25 && Math.abs(s.y - this._y[i]) < 0.25) continue;
      this._x[i] = s.x;
      this._y[i] = s.y;
      tag.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}
