// Paper sample: a light, flexible sheet that can be lifted (press and drag), dropped onto the water
// and then floats in place: it bobs and bends with the local surface but never drifts sideways.
// The surface height comes from the analytic sum of the source waves (no GPU readback).
import * as THREE from 'three';
import { WAVE_SPEED } from './config.js';

const W = 0.7;              // sheet size (world units)
const D = 0.5;
const NX = 20;              // grid segments
const NZ = 14;
const LIFT = 1.1;           // height while carried
const FLOAT = 0.003;        // rest height above the surface (very light sheet)
const K = 160;              // buoyancy spring (1/s^2) and damping (1/s): stiff and well damped
const C = 11;
const BEND_RATE = 14;       // how fast the sheet takes a new shape (1/s)
const WET_RATE = 0.12;      // wetness gained per second on the water
const CURL = 0.03;          // dry sheet edge curl
const HIT_PX = 44;
const TWO_PI = Math.PI * 2;
// Must match the water sim (sim.js): 2D Green's function far field lags the driving force by pi/4,
// and the sim's velocity damping makes the amplitude decay by ~1.8 %/s of travel time.
const GREEN_LAG = Math.PI / 4;
const DECAY = 0.018;

const VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
uniform float uWet;
uniform vec3 uSun;
varying vec2 vUv;
varying vec3 vN;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 col = vec3(0.86, 0.84, 0.78) - hash(floor(vUv * vec2(260.0, 190.0))) * 0.05;   // paper fibres
  float ruled = (1.0 - smoothstep(0.0, 0.035, abs(fract(vUv.y * 9.0) - 0.5))) * step(vUv.y, 0.9);
  col = mix(col, vec3(0.35, 0.55, 0.85), ruled * 0.55);
  float margin = 1.0 - smoothstep(0.0, 0.004, abs(vUv.x - 0.14));
  col = mix(col, vec3(0.85, 0.2, 0.2), margin * 0.7);
  col = mix(col, col * vec3(0.72, 0.76, 0.8), uWet);                                      // wet: darker, greyer
  float diff = 0.45 + 0.55 * max(dot(n, uSun), 0.0);
  gl_FragColor = vec4(col * diff, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Paper {
  constructor(scene, sources, framing, canvas) {
    this.sources = sources;
    this.framing = framing;
    const geo = new THREE.PlaneGeometry(W, D, NX, NZ);
    geo.rotateX(-Math.PI / 2);
    this.geometry = geo;
    this.pos = geo.attributes.position;
    this.nrm = geo.attributes.normal;
    const n = this.pos.count;
    this.lx = new Float32Array(n);
    this.lz = new Float32Array(n);
    this.ly = new Float32Array(n);
    this.vy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.lx[i] = this.pos.getX(i);
      this.lz[i] = this.pos.getZ(i);
    }
    this.uniforms = { uWet: { value: 0 }, uSun: { value: new THREE.Vector3(0.4, 1, 0.3).normalize() } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    }));
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.on = false;
    this.shown = true;
    this.state = 'fall';   // 'carry' | 'fall' | 'float'
    this.x = 0;
    this.z = 1.2;
    this.y = LIFT;
    this.vel = 0;
    this.tx = 0;
    this.tz = 0;
    this.yaw = 0.3;
    this.wet = 0;
    this.time = 0;
    this._w = { x: 0, z: 0 };
    this._s = { x: 0, y: 0 };
    this._installPointer(canvas);
  }

  // Must be installed before pointer.js so a grab can stop the drop / drag handlers.
  _installPointer(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.on || !this.shown || e.button !== 0) return;
      const s = this.framing.worldToScreen3d(this.x, this.y, this.z, this._s);
      if (Math.hypot(s.x - e.clientX, s.y - e.clientY) > HIT_PX * 1.6) return;
      e.stopImmediatePropagation();
      canvas.setPointerCapture(e.pointerId);
      this.state = 'carry';
      this.tx = this.x;
      this.tz = this.z;
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.state !== 'carry' || !this.on) return;
      if (this.framing.screenToWater3d(e.clientX, e.clientY, this._w)) {
        this.tx = this._w.x;
        this.tz = this._w.z;
      }
    });
    const release = () => {
      if (this.state !== 'carry') return;
      this.state = 'fall';
      this.vel = 0;
      canvas.style.cursor = '';
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  setOn(on) {
    this.on = on;
    if (on) {
      // Appears in the air in front of the sources and falls onto the water.
      this.x = 0;
      this.z = 1.2;
      this.y = LIFT;
      this.vel = 0;
      this.wet = 0;
      this.state = 'fall';
      this.yaw = (Math.random() - 0.5) * 0.8;
      this.ly.fill(0);
      this.vy.fill(0);
    }
    this.mesh.visible = this.on && this.shown;
  }

  setShown(v) {
    this.shown = v;
    this.mesh.visible = this.on && this.shown;
  }

  // Analytic surface height: sum of circular waves from the running sources.
  height(x, z, t) {
    const s = this.sources;
    const a = s._amp * s.gain;
    let h = 0;
    for (let i = 0; i < s.count; i++) {
      const r = Math.max(0.25, Math.hypot(x - s.positions[i * 2], z - s.positions[i * 2 + 1]));
      if (t - s.start[i] < r / WAVE_SPEED) continue;
      const f = s.freqs[i];
      const amp = (a / Math.sqrt(r)) * Math.exp(-DECAY * r / WAVE_SPEED);
      h += amp * Math.sin(TWO_PI * f * t - (TWO_PI * f / WAVE_SPEED) * r + s.phaseOf(i) - GREEN_LAG);
    }
    return h;
  }

  update(dt, t) {
    if (!this.mesh.visible || dt <= 0) return;
    this.time += dt;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const n = this.pos.count;
    let flex = 0;
    let hc = 0;

    if (this.state === 'carry') {
      const k = Math.min(1, dt * 12);
      this.x += (this.tx - this.x) * k;
      this.z += (this.tz - this.z) * k;
      this.y += (LIFT - this.y) * k;
    } else if (this.state === 'fall') {
      // Light sheet: strong air drag, low terminal speed, sways while it falls.
      this.vel += (-9.8 - 6 * this.vel) * dt;
      this.y += this.vel * dt;
      this.x += Math.sin(this.time * 5.3) * 0.25 * dt;
      hc = this.height(this.x, this.z, t);
      if (this.y <= hc + FLOAT) {
        this.y = hc + FLOAT;
        this.vel *= 0.2;
        this.state = 'float';
        this.sources.addDrop(this.x, this.z);   // small splash where it lands
      }
    } else {
      hc = this.height(this.x, this.z, t);
      this.vel += (K * (hc + FLOAT - this.y) - C * this.vel) * dt;
      this.y += this.vel * dt;
      this.wet = Math.min(1, this.wet + WET_RATE * dt);
      flex = 0.35 + 0.6 * this.wet;   // wet paper follows the water more closely
    }
    this.uniforms.uWet.value = this.wet;

    // Target shape per vertex (relative to the centre height), then a damped approach.
    const floating = this.state === 'float';
    const sway = this.state === 'fall' ? Math.sin(this.time * 6.1) * 0.06 : 0;
    const curl = CURL * (1 - this.wet);
    const kb = Math.min(1, dt * BEND_RATE);
    for (let i = 0; i < n; i++) {
      const lx = this.lx[i];
      const lz = this.lz[i];
      const u = (2 * lx) / W;
      const v = (2 * lz) / D;
      let target = curl * (u * u + 0.4 * v * v) + sway * u;
      if (floating) {
        const wx = this.x + lx * cy + lz * sy;
        const wz = this.z - lx * sy + lz * cy;
        target = target * (1 - flex) + flex * (this.height(wx, wz, t) - hc);
      }
      this.ly[i] += (target - this.ly[i]) * kb;
      this.pos.setY(i, this.ly[i]);
    }

    // Grid normals from neighbouring heights (no allocations).
    const dx = W / NX;
    const dz = D / NZ;
    for (let j = 0; j <= NZ; j++) {
      for (let i = 0; i <= NX; i++) {
        const id = j * (NX + 1) + i;
        const l = this.ly[j * (NX + 1) + Math.max(0, i - 1)];
        const r = this.ly[j * (NX + 1) + Math.min(NX, i + 1)];
        const b = this.ly[Math.max(0, j - 1) * (NX + 1) + i];
        const f = this.ly[Math.min(NZ, j + 1) * (NX + 1) + i];
        const gx = (r - l) / (dx * (i > 0 && i < NX ? 2 : 1));
        const gz = (f - b) / (dz * (j > 0 && j < NZ ? 2 : 1));
        const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
        this.nrm.setXYZ(id, -gx * inv, inv, -gz * inv);
      }
    }
    this.pos.needsUpdate = true;
    this.nrm.needsUpdate = true;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
  }
}
