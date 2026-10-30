// GPU height-field water: damped 2D wave equation on ping-pong float render targets.
import * as THREE from 'three';
import { SIM_VERT, SIM_FRAG, COPY_FRAG, MAX_SOURCES } from './shaders.js';
import { WAVE_SPEED } from '../config.js';

export const SIM_DT = 1 / 120;      // fixed timestep (s)
const MAX_SUBSTEPS = 3;
const MAX_COURANT = 0.4;
const DAMPING = 0.0003;             // per step on velocity: amplitude decays ~1.8 %/s
const SPONGE_WIDTH = 1.2;           // world units on each border (kept off screen by framing.js)
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

// The domain is a rectangle of square cells: world (minX, minZ) .. (minX + nx * cell, minZ + nz * cell),
// snapped to whole cells so moving it keeps the waves exactly (integer texel shift).
export class WaterSim {
  constructor(renderer, { cell, domain }) {
    this.renderer = renderer;
    this.nx = 0;
    this.nz = 0;
    this.cell = 0;
    this.minX = 0;
    this.minZ = 0;
    this.domainUniform = new THREE.Vector4();   // minX, minZ, sizeX, sizeZ (shared with shaders)
    this.texel = new THREE.Vector2(1, 1);       // 1 / nx, 1 / nz (shared with shaders)
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
        uRes: { value: new THREE.Vector2(1, 1) },
        uC2: { value: 0 },
        uDamp: { value: DAMPING },
        uSponge: { value: 1 },
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
    this._domain = { minX: domain.minX, minZ: domain.minZ, sizeX: domain.sizeX, sizeZ: domain.sizeZ };
    this._cellTarget = cell;
    this._rebuild();
  }

  get heightTexture() { return this._targets[this._read].texture; }

  // Time including the not-yet-simulated remainder, for smooth visuals at any refresh rate.
  get renderTime() { return this.time + this.accumulator; }

  get cellSize() { return this.cell; }

  _createTarget(nx, nz) {
    const filter = this._fmt.linear ? THREE.LinearFilter : THREE.NearestFilter;
    return new THREE.WebGLRenderTarget(nx, nz, {
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

  // Cell size (world units). Quality changes resample the waves into the new grid.
  setCellSize(cell) {
    this._cellTarget = cell;
    this._rebuild();
  }

  // World rectangle that must be simulated (it is extended to whole cells).
  setDomain(d) {
    const o = this._domain;
    o.minX = d.minX;
    o.minZ = d.minZ;
    o.sizeX = d.sizeX;
    o.sizeZ = d.sizeZ;
    this._rebuild();
  }

  // Reallocates the targets when the snapped grid changes. The current waves are resampled into the
  // new grid by world position (no visible reset; calm water where the old grid did not reach),
  // then the old targets are disposed.
  _rebuild() {
    const cell = this._cellTarget;
    const d = this._domain;
    const minX = Math.floor(d.minX / cell) * cell;
    const minZ = Math.floor(d.minZ / cell) * cell;
    const nx = Math.ceil((d.minX + d.sizeX - minX) / cell);
    const nz = Math.ceil((d.minZ + d.sizeZ - minZ) / cell);
    if (this._targets && nx === this.nx && nz === this.nz && cell === this.cell
      && minX === this.minX && minZ === this.minZ) return;
    const old = this._targets;
    const oldTex = old ? old[this._read].texture : null;
    const oldDomain = this.domainUniform.clone();
    this._targets = null;
    let a = this._createTarget(nx, nz);
    let b = this._createTarget(nx, nz);
    if (!this._isComplete(a) && this._fmt.type === THREE.FloatType && this._fmt.canHalf) {
      // Float32 attachments rejected by the driver: fall back to half float.
      a.dispose();
      b.dispose();
      this._fmt = { type: THREE.HalfFloatType, linear: true, canHalf: false };
      a = this._createTarget(nx, nz);
      b = this._createTarget(nx, nz);
      console.warn('Float32 render targets incomplete, using half float.');
    }
    if (!this._isComplete(a)) {
      a.dispose();
      b.dispose();
      if (old) {
        // Keep running on the old grid.
        this._targets = old;
        return;
      }
      const err = new Error('Simulation render target incomplete');
      err.code = 'NO_FLOAT_RT';
      throw err;
    }
    this._targets = [a, b];
    this._read = 0;
    this.nx = nx;
    this.nz = nz;
    this.cell = cell;
    this.minX = minX;
    this.minZ = minZ;
    this.domainUniform.set(minX, minZ, nx * cell, nz * cell);
    this.texel.set(1 / nx, 1 / nz);
    const u = this._material.uniforms;
    u.uRes.value.set(nx, nz);
    u.uSponge.value = SPONGE_WIDTH / cell;
    this._updateCoefficients();
    this.reset();
    if (old) {
      this._resample(oldTex, oldDomain);
      old[0].dispose();
      old[1].dispose();
    }
  }

  _resample(texture, oldDomain) {
    if (!this._copyMaterial) {
      this._copyMaterial = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: SIM_VERT,
        fragmentShader: COPY_FRAG,
        uniforms: {
          uSrc: { value: null },
          uOld: { value: new THREE.Vector4() },
          uNewMin: { value: new THREE.Vector2() },
          uCell: { value: 1 },
        },
        depthTest: false,
        depthWrite: false,
      });
    }
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const u = this._copyMaterial.uniforms;
    this._quad.material = this._copyMaterial;
    u.uSrc.value = texture;
    u.uOld.value.copy(oldDomain);
    u.uNewMin.value.set(this.minX, this.minZ);
    u.uCell.value = this.cell;
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

  // Advance the clock only (2D view: the GPU sim is not stepped).
  advanceTime(dt) {
    this.time += Math.min(Math.max(dt, 0), 0.25);
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
      // Position in cells (texel centres at i + 0.5), Gaussian width in cells.
      const sc = this.sigmaFor(e.radius) / this.cell;
      this._src[count].set((e.x - this.minX) / this.cell, (e.z - this.minZ) / this.cell, 1 / (2 * sc * sc), value);
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
