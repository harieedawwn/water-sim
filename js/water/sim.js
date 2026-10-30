// GPU height-field water: damped 2D wave equation on ping-pong float render targets.
import * as THREE from 'three';
import { SIM_VERT, SIM_FRAG, COPY_FRAG, MAX_SOURCES } from './shaders.js';
import { WAVE_SPEED, WORLD_SIZE } from '../config.js';

export const SIM_DT = 1 / 120;      // fixed timestep (s)
const MAX_SUBSTEPS = 3;
const MAX_COURANT = 0.4;
const DAMPING = 0.0003;             // per step on velocity: amplitude decays ~1.8 %/s
const SPONGE_WIDTH = 0.06;          // fraction of the tank on each border
const SPONGE_STRENGTH = 0.12;
const TWO_PI = Math.PI * 2;

function pickTargetType(renderer) {
  const ext = renderer.extensions;
  if (!renderer.capabilities.isWebGL2) return null;
  if (ext.has('EXT_color_buffer_float')) {
    return { type: THREE.FloatType, linear: ext.has('OES_texture_float_linear'), canHalf: true };
  }
  if (ext.has('EXT_color_buffer_half_float')) {
    return { type: THREE.HalfFloatType, linear: true, canHalf: true };
  }
  return null;
}

export class WaterSim {
  constructor(renderer, { res = 512 } = {}) {
    this.renderer = renderer;
    this.res = 0;
    this.time = 0;
    this.accumulator = 0;
    this.driveFreq = 2;
    this.courant = 0;

    const fmt = pickTargetType(renderer);
    if (!fmt) {
      const err = new Error('No renderable float/half-float texture format');
      err.code = 'NO_FLOAT_RT';
      throw err;
    }
    this._fmt = fmt;

    this._src = [];
    for (let i = 0; i < MAX_SOURCES; i++) this._src.push(new THREE.Vector4());

    this._material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SIM_VERT,
      fragmentShader: SIM_FRAG,
      uniforms: {
        uState: { value: null },
        uRes: { value: res },
        uC2: { value: 0 },
        uDamp: { value: DAMPING },
        uSponge: { value: SPONGE_WIDTH },
        uSpongeStrength: { value: SPONGE_STRENGTH },
        uSrc: { value: this._src },
        uSrcCount: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._material);
    this._quad.frustumCulled = false;
    this._scene = new THREE.Scene();
    this._scene.add(this._quad);
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this._targets = null;
    this._read = 0;
    this._clearColor = new THREE.Color();
    this.setResolution(res);
  }

  get heightTexture() { return this._targets[this._read].texture; }

  // Time including the not-yet-simulated remainder, for smooth visuals at any refresh rate.
  get renderTime() { return this.time + this.accumulator; }

  get cellSize() { return WORLD_SIZE / this.res; }

  _createTarget(n) {
    const filter = this._fmt.linear ? THREE.LinearFilter : THREE.NearestFilter;
    return new THREE.WebGLRenderTarget(n, n, {
      type: this._fmt.type,
      format: THREE.RGBAFormat,
      minFilter: filter,
      magFilter: filter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
  }

  _isComplete(target) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(target);
    const gl = r.getContext();
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    r.setRenderTarget(prev);
    return ok;
  }

  _disposeTargets() {
    if (!this._targets) return;
    this._targets[0].dispose();
    this._targets[1].dispose();
    this._targets = null;
  }

  // Reallocates the targets. The current waves are resampled into the new grid (no visible reset),
  // then the old targets are disposed.
  setResolution(n) {
    if (n === this.res && this._targets) return;
    const old = this._targets;
    const oldRead = this._read;
    this._targets = null;
    this.res = n;
    let a = this._createTarget(n);
    let b = this._createTarget(n);
    if (!this._isComplete(a) && this._fmt.type === THREE.FloatType && this._fmt.canHalf) {
      // Float32 attachments rejected by the driver: fall back to half float.
      a.dispose();
      b.dispose();
      this._fmt = { type: THREE.HalfFloatType, linear: true, canHalf: false };
      a = this._createTarget(n);
      b = this._createTarget(n);
      console.warn('Float32 render targets incomplete, using half float.');
    }
    if (!this._isComplete(a)) {
      a.dispose();
      b.dispose();
      const err = new Error('Simulation render target incomplete');
      err.code = 'NO_FLOAT_RT';
      throw err;
    }
    this._targets = [a, b];
    this._read = 0;
    this._material.uniforms.uRes.value = n;
    this._updateCoefficients();
    this.reset();
    if (old) {
      this._resample(old[oldRead].texture);
      old[0].dispose();
      old[1].dispose();
    }
  }

  _resample(texture) {
    if (!this._copyMaterial) {
      this._copyMaterial = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: SIM_VERT,
        fragmentShader: COPY_FRAG,
        uniforms: { uSrc: { value: null }, uRes: { value: 1 } },
        depthTest: false,
        depthWrite: false,
      });
    }
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this._quad.material = this._copyMaterial;
    this._copyMaterial.uniforms.uSrc.value = texture;
    this._copyMaterial.uniforms.uRes.value = this.res;
    for (let i = 0; i < 2; i++) {
      r.setRenderTarget(this._targets[i]);
      r.render(this._scene, this._camera);
    }
    this._quad.material = this._material;
    r.setRenderTarget(prev);
  }

  // Frequency of the sine sources; used to cancel numerical dispersion at that frequency.
  setDriveFrequency(f) {
    if (f === this.driveFreq) return;
    this.driveFreq = f;
    this._updateCoefficients();
  }

  _updateCoefficients() {
    // Discrete dispersion (leapfrog + Laplacian along an axis):
    //   sin(w dt / 2) / dt = c_num * sin(k dx / 2) / dx.
    // Choosing c_num this way makes the simulated wavelength equal WAVE_SPEED / f exactly.
    const dx = this.cellSize;
    const w = TWO_PI * this.driveFreq;
    const k = w / WAVE_SPEED;
    const cNum = (dx / SIM_DT) * Math.sin(w * SIM_DT / 2) / Math.sin(k * dx / 2);
    this.courant = cNum * SIM_DT / dx;
    if (this.courant > MAX_COURANT) {
      console.warn(`CFL violated: c*dt/dx = ${this.courant.toFixed(3)} > ${MAX_COURANT}`);
    }
    this._material.uniforms.uC2.value = this.courant * this.courant;
  }

  // Gaussian width (world units) actually used for an emitter radius.
  sigmaFor(radius) {
    return Math.max(radius * 0.6, 2 * this.cellSize);
  }

  // Per-step sine displacement that yields a far-field wave amplitude of 1 at r = 1 unit.
  // 2D Green's function: |h| = F / (4 c^2) * sqrt(2 / (pi k r)), with the step displacement q
  // acting as a source density q / dt^2 whose Gaussian footprint has spectrum 2 pi s^2 exp(-k^2 s^2 / 2).
  sourceGain(radius, freq) {
    const s = this.sigmaFor(radius);
    const k = TWO_PI * freq / WAVE_SPEED;
    const footprint = TWO_PI * s * s * Math.exp(-0.5 * k * k * s * s);
    return (4 * WAVE_SPEED * WAVE_SPEED * SIM_DT * SIM_DT) / (footprint * Math.sqrt(2 / (Math.PI * k)));
  }

  reset() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.getClearColor(this._clearColor);
    const alpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (let i = 0; i < 2; i++) {
      r.setRenderTarget(this._targets[i]);
      r.clear(true, false, false);
    }
    r.setClearColor(this._clearColor, alpha);
    r.setRenderTarget(prev);
    this.accumulator = 0;
  }

  // Advance by dt seconds of wall time using fixed substeps. Impulse emitters are applied once,
  // on the first substep. Returns the number of substeps run (0 = impulses still pending).
  step(dt, emitters) {
    this.accumulator += Math.min(Math.max(dt, 0), 0.25);
    let n = 0;
    if (this.accumulator < SIM_DT) return 0;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    while (this.accumulator >= SIM_DT && n < MAX_SUBSTEPS) {
      this._substep(emitters, n === 0);
      this.accumulator -= SIM_DT;
      this.time += SIM_DT;
      n++;
    }
    // Too slow to keep up: drop the backlog instead of spiralling.
    if (this.accumulator >= SIM_DT) this.accumulator %= SIM_DT;
    r.setRenderTarget(prev);
    return n;
  }

  _substep(emitters, first) {
    let count = 0;
    for (let i = 0; i < emitters.length && count < MAX_SOURCES; i++) {
      const e = emitters[i];
      let value;
      if (e.mode === 'sine') value = e.amp * Math.sin(TWO_PI * e.freq * this.time + e.phase);
      else if (first) value = e.amp;
      else continue;
      if (value === 0) continue;
      const sUv = this.sigmaFor(e.radius) / WORLD_SIZE;
      this._src[count].set(e.x / WORLD_SIZE + 0.5, e.z / WORLD_SIZE + 0.5, 1 / (2 * sUv * sUv), value);
      count++;
    }
    const u = this._material.uniforms;
    u.uSrcCount.value = count;
    u.uState.value = this._targets[this._read].texture;
    const write = 1 - this._read;
    this.renderer.setRenderTarget(this._targets[write]);
    this.renderer.render(this._scene, this._camera);
    this._read = write;
  }

  dispose() {
    this._disposeTargets();
    this._material.dispose();
    if (this._copyMaterial) this._copyMaterial.dispose();
    this._quad.geometry.dispose();
  }
}
