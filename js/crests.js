// Crest / trough history of every source, for the analytic 2D view. Each time a source passes the top
// (phase pi / 2) or the bottom (3 pi / 2) of its oscillation, the time and the source position are stored
// in a preallocated ring buffer. The 2D view draws every record as a circle r = v (t - t_emit) around the
// position at emission, so waves already emitted keep spreading after any change (phase, frequency,
// dragging, pause, count), exactly like the simulated water.
import { MAX_SOURCES } from './config.js';

export const CREST_CAPACITY = 512;   // records per source (2 per period: > 100 s of history at 2.4 Hz)

export class CrestHistory {
  constructor(sources = MAX_SOURCES, capacity = CREST_CAPACITY) {
    this.capacity = capacity;
    const n = sources * capacity;
    this.t = new Float64Array(n);      // emission time (sim clock)
    this.x = new Float32Array(n);      // source position at emission
    this.z = new Float32Array(n);
    this.f = new Float32Array(n);      // source frequency at emission (Hz)
    this.crest = new Uint8Array(n);    // 1 = crest, 0 = trough
    this.head = new Int32Array(sources);   // next slot of source i
    this.size = new Int32Array(sources);   // records held by source i
  }

  add(i, t, x, z, f, crest) {
    const cap = this.capacity;
    const k = i * cap + this.head[i];
    this.t[k] = t;
    this.x[k] = x;
    this.z[k] = z;
    this.f[k] = f;
    this.crest[k] = crest ? 1 : 0;
    this.head[i] = (this.head[i] + 1) % cap;
    if (this.size[i] < cap) this.size[i]++;
  }

  // Slot of the j-th record of source i, oldest first (0 <= j < size[i]).
  slot(i, j) {
    const cap = this.capacity;
    return i * cap + ((this.head[i] - this.size[i] + j + cap) % cap);
  }

  clear() {
    this.head.fill(0);
    this.size.fill(0);
  }

  // Back from the 2D view (see SourceManager.rebase): the water continues from time `since`, so records
  // emitted later are dropped and the others are shifted by delta.
  rebase(delta, since) {
    const cap = this.capacity;
    for (let i = 0; i < this.head.length; i++) {
      while (this.size[i] > 0) {
        const last = i * cap + ((this.head[i] - 1 + cap) % cap);
        if (this.t[last] <= since) break;
        this.head[i] = (this.head[i] - 1 + cap) % cap;
        this.size[i]--;
      }
      for (let j = 0; j < this.size[i]; j++) this.t[this.slot(i, j)] += delta;
    }
  }
}
