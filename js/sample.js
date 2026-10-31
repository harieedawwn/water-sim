// Floating samples (paper sheet, rubber duck): the shared carry / fall / float state machine, tray drags,
// pointer picking on the water, separation from the balls and from each other, and the animated removal
// into the trash bin. Subclasses (paper.js, duck.js) build the mesh and its look; their vertex shaders
// sample the sim height texture themselves (no GPU readback). Every sample material has uLift (height of
// the sample origin above the local water) and uVanish (0..1, shrink + spin while flying into the bin).

export const LIFT = 0.8;           // height while carried
const DRAG_RATE = 14;              // 1/s, carried sample follows the pointer
const VANISH_S = 0.5;              // removal animation (s)
const VANISH_SPIN = 6;             // rad of extra spin over the animation (shader)
const SEP_GAP = 0.04;              // world gap kept between a sample and a ball / another sample
const SEP_RATE = 10;               // 1/s, how fast an overlapping sample is pushed clear

export class Sample {
  // opts: { radius (world, separation circle), floatLift (rest height above the water), hitPx, hitY (grab point height),
  //         drag (1/s air drag while falling), buoyK (1/s^2) / buoyC (1/s) (buoyancy spring after landing),
  //         impactKeep (fraction of the impact speed that becomes the plunge), minDip (deepest plunge, world) }
  constructor(scene, sim, sources, framing, mesh, opts) {
    this.sim = sim;
    this.sources = sources;
    this.framing = framing;
    this.mesh = mesh;
    this.uniforms = mesh.material.uniforms;
    this.radius = opts.radius;
    this.floatLift = opts.floatLift;
    this.hitPx = opts.hitPx;
    this.hitY = opts.hitY;
    this.drag = opts.drag;
    this.buoyK = opts.buoyK;
    this.buoyC = opts.buoyC;
    this.impactKeep = opts.impactKeep;
    this.minDip = opts.minDip;
    this.offX = 0;             // display-only offset (paper flutter while falling)
    this.offZ = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);

    this.on = false;           // taken from the tray (carried, falling, floating or vanishing)
    this.shown = true;         // false in the 2D view
    this.state = 'off';        // 'off' | 'carry' | 'fall' | 'float' | 'vanish'
    this.x = 0;
    this.z = 0;
    this.tx = 0;
    this.tz = 0;
    this.lift = LIFT;
    this.vel = 0;
    this.yaw = 0;
    this.time = 0;
    this.vanish = 0;
    this._vt = 0;
    this._from = { x: 0, z: 0, lift: 0 };
    this._to = { x: 0, z: 0 };
    this._w = { x: 0, z: 0 };
    this._s = { x: 0, y: 0 };
  }

  // On the water (falling or floating): counts for the bin, pushed clear of the balls.
  get onWater() { return this.state === 'fall' || this.state === 'float'; }

  // Hooks for subclasses.
  onTake() {}
  onLand(speed) {}   // eslint-disable-line no-unused-vars
  look() {}

  // Point under the screen position at the carry height (so the sample stays under the finger) -> out {x, z}.
  aimPoint(px, py, out) {
    if (!this.framing.screenToWater3d(px, py, this._w)) return false;
    const c = this.framing.camera.position;
    const k = c.y > LIFT ? (c.y - LIFT) / c.y : 0;
    out.x = c.x + (this._w.x - c.x) * k;
    out.z = c.z + (this._w.z - c.z) * k;
    return true;
  }

  _aim(px, py) {
    if (!this.aimPoint(px, py, this._w)) return false;
    this.tx = this._w.x;
    this.tz = this._w.z;
    return true;
  }

  // Fresh sample from the tray.
  take(px, py) {
    this.on = true;
    this.offX = this.offZ = 0;
    this.state = 'carry';
    this.lift = LIFT;
    this.vanish = 0;
    this.yaw = (Math.random() - 0.5) * 0.6;
    this.onTake();
    if (this._aim(px, py)) {
      this.x = this.tx;
      this.z = this.tz;
    }
    this._visible();
  }

  // Picked up again from the water.
  grab(px, py) {
    this.state = 'carry';
    this._aim(px, py);
  }

  moveTo(px, py) {
    if (this.state === 'carry') this._aim(px, py);
  }

  // Released: falls onto the water if the pointer is over it (true), otherwise goes back to the tray (false).
  release(px, py) {
    if (this.state !== 'carry') return false;
    if (this.framing.screenToWater3d(px, py, this._w)) {
      this.state = 'fall';
      this.vel = 0;
      return true;
    }
    this.remove();
    return false;
  }

  remove() {
    this.on = false;
    this.state = 'off';
    this.vanish = 0;
    this._visible();
  }

  // Shrink, spin and fly to (x, z) at the carry height, then disappear.
  startVanish(x, z) {
    this.state = 'vanish';
    this._vt = 0;
    this._from.x = this.x;
    this._from.z = this.z;
    this._from.lift = this.lift;
    this._to.x = x;
    this._to.z = z;
  }

  // Screen distance (CSS px) from the pointer to the sample's grab point.
  screenDistance(px, py) {
    const s = this.framing.worldToScreen3d(this.x, this.lift + this.hitY, this.z, this._s);
    return Math.hypot(s.x - px, s.y - py);
  }

  setShown(v) {
    this.shown = v;
    this._visible();
  }

  _visible() {
    this.mesh.visible = this.on && this.shown;
  }

  // dt: simulation step (0 while frozen); rdt: wall-clock step (carrying and removal keep moving).
  // Returns true when the sample just finished vanishing.
  update(dt, rdt) {
    if (!this.on) return false;
    this.time += dt;
    let done = false;
    if (this.state === 'carry') {
      const k = Math.min(1, rdt * DRAG_RATE);
      this.x += (this.tx - this.x) * k;
      this.z += (this.tz - this.z) * k;
      this.lift += (LIFT - this.lift) * k;
    } else if (this.state === 'fall') {
      // Gravity against the sample's own air drag.
      this.vel += (-9.8 - this.drag * this.vel) * dt;
      this.lift += this.vel * dt;
      if (this.lift <= this.floatLift) {
        // Impact: part of the speed carries the sample below its rest line, buoyancy pushes it back up.
        const speed = -this.vel;
        this.x += this.offX;
        this.z += this.offZ;
        this.offX = this.offZ = 0;
        this.lift = this.floatLift;
        this.vel = -speed * this.impactKeep;
        this.state = 'float';
        this.onLand(speed);
      }
    } else if (this.state === 'float') {
      // Damped buoyancy spring around the rest line (semi-implicit Euler, stable for dt <= 0.1).
      this.vel += (-this.buoyK * (this.lift - this.floatLift) - this.buoyC * this.vel) * dt;
      this.lift = Math.max(this.floatLift - this.minDip, this.lift + this.vel * dt);
    } else if (this.state === 'vanish') {
      this._vt = Math.min(1, this._vt + rdt / VANISH_S);
      const e = 1 - (1 - this._vt) ** 3;   // ease out
      this.x = this._from.x + (this._to.x - this._from.x) * e;
      this.z = this._from.z + (this._to.z - this._from.z) * e;
      this.lift = this._from.lift + (LIFT - this._from.lift) * e;
      this.vanish = e;
      if (this._vt >= 1) done = true;
    }
    const u = this.uniforms;
    u.uHeight.value = this.sim.heightTexture;
    u.uLift.value = this.lift;
    u.uVanish.value = this.vanish;
    u.uSpin.value = this.vanish * VANISH_SPIN;
    this.look(dt);
    this.mesh.position.set(this.x + this.offX, 0, this.z + this.offZ);
    this.mesh.rotation.y = this.yaw;
    if (done) this.remove();
    return done;
  }
}

// The set of samples: pointer picking on the canvas (install BEFORE pointer.js so grabbing a sample stops
// the drop / drag handlers), tray drags, separation, removal. hooks: { changed(), touched() (a sample was
// taken or released: unfreeze), overBin(px, py), hoverBin(on), binPoint(out) -> bool (bin centre, CSS px),
// discarded() (samples are going into the bin) }.
export class Samples {
  constructor(canvas, sources, list, hooks) {
    this.sources = sources;
    this.list = list;
    this.hooks = hooks;
    this.shown = true;
    this.carried = null;
    this._p = { x: 0, z: 0 };
    this._b = { x: 0, y: 0 };
    this._reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    this._installPointer(canvas);
  }

  // Samples on the water (what the bin would remove).
  get countOnWater() {
    let n = 0;
    for (const s of this.list) if (s.onWater) n++;
    return n;
  }

  _installPointer(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.shown || e.button !== 0 || this.carried) return;
      let best = null;
      let bestD = Infinity;
      for (const s of this.list) {
        if (!s.onWater) continue;
        const d = s.screenDistance(e.clientX, e.clientY);
        if (d <= s.hitPx && d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (!best) return;
      e.stopImmediatePropagation();
      canvas.setPointerCapture(e.pointerId);
      this.carried = best;
      best.grab(e.clientX, e.clientY);
      this.hooks.touched();
      this.hooks.changed();
    });
    canvas.addEventListener('pointermove', (e) => this.move(e.clientX, e.clientY));
    canvas.addEventListener('pointerup', (e) => this.release(e.clientX, e.clientY));
    canvas.addEventListener('pointercancel', (e) => this.release(e.clientX, e.clientY));
  }

  // Tray thumbnail: press it and drag the sample onto the water. enabled() false (2D view) ignores it.
  bindTray(thumb, sample, enabled) {
    thumb.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !enabled() || sample.on || this.carried) return;
      e.preventDefault();
      thumb.setPointerCapture(e.pointerId);
      this.carried = sample;
      sample.take(e.clientX, e.clientY);
      this.hooks.touched();
      this.hooks.changed();
    });
    thumb.addEventListener('pointermove', (e) => this.move(e.clientX, e.clientY));
    thumb.addEventListener('pointerup', (e) => this.release(e.clientX, e.clientY));
    thumb.addEventListener('pointercancel', (e) => this.release(e.clientX, e.clientY));
  }

  move(px, py) {
    if (!this.carried) return;
    this.carried.moveTo(px, py);
    this.hooks.hoverBin(this.hooks.overBin(px, py));
  }

  release(px, py) {
    const s = this.carried;
    if (!s) return;
    this.carried = null;
    this.hooks.hoverBin(false);
    if (this.hooks.overBin(px, py)) {
      this._discard(s);
      this.hooks.discarded();
    } else {
      s.release(px, py);
      this.hooks.touched();
    }
    this.hooks.changed();
  }

  // Bin: every sample on the water flies into it (instant when hidden or with reduced motion).
  removeAll() {
    for (const s of this.list) if (s.onWater) this._discard(s);
    this.hooks.discarded();
    this.hooks.changed();
  }

  _discard(s) {
    if (!this.shown || (this._reduced && this._reduced.matches) || !this.hooks.binPoint(this._b)
      || !s.aimPoint(this._b.x, this._b.y, this._p)) {
      s.remove();
      return;
    }
    s.startVanish(this._p.x, this._p.z);
  }

  setShown(v) {
    this.shown = v;
    if (!v && this.carried) {
      this.carried.remove();
      this.carried = null;
      this.hooks.hoverBin(false);
    }
    for (const s of this.list) {
      if (!v && s.state === 'vanish') s.remove();
      s.setShown(v);
    }
    this.hooks.changed();
  }

  // dt: simulation step (0 while frozen), rdt: wall-clock step; balls: { radius }.
  update(dt, rdt, balls) {
    let changed = false;
    for (const s of this.list) if (s.update(dt, rdt)) changed = true;
    this._separate(Math.min(1, dt * SEP_RATE), balls.radius);
    if (changed) this.hooks.changed();
  }

  // Samples on the water never overlap a ball or each other: the sample is pushed (sources never are).
  _separate(k, ballRadius) {
    if (k <= 0) return;
    const p = this.sources.positions;
    const list = this.list;
    for (let a = 0; a < list.length; a++) {
      const s = list[a];
      if (!s.onWater) continue;
      for (let i = 0; i < this.sources.count; i++) {
        this._push(s, p[i * 2], p[i * 2 + 1], s.radius + ballRadius + SEP_GAP, k);
      }
      for (let b = a + 1; b < list.length; b++) {
        const o = list[b];
        if (!o.onWater) continue;
        const min = s.radius + o.radius + SEP_GAP;
        let dx = s.x - o.x;
        let dz = s.z - o.z;
        let d = Math.hypot(dx, dz);
        if (d >= min) continue;
        if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
        const push = 0.5 * (min - d) * k;
        s.x += (dx / d) * push;
        s.z += (dz / d) * push;
        o.x -= (dx / d) * push;
        o.z -= (dz / d) * push;
      }
    }
  }

  _push(s, cx, cz, min, k) {
    let dx = s.x - cx;
    let dz = s.z - cz;
    let d = Math.hypot(dx, dz);
    if (d >= min) return;
    if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
    const push = (min - d) * k;
    s.x += (dx / d) * push;
    s.z += (dz / d) * push;
  }
}
