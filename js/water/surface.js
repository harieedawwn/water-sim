// Water mesh + material. One mesh: fine grid over the simulated tank, coarse skirt of calm
// water around it out to the horizon so the tank edges are never visible.
import * as THREE from 'three';
import { WATER_VERT, WATER_FRAG, MAX_BALLS } from './shaders.js';
import { WORLD_HALF } from '../config.js';

const INNER_SEGMENTS = 256;
const SKIRT_EXTENT = 48;     // world units from origin
const SKIRT_SEGMENTS = 16;   // per side

function axisCoords() {
  const c = [];
  const outer = SKIRT_EXTENT - WORLD_HALF;
  for (let i = 0; i < SKIRT_SEGMENTS; i++) {
    const t = i / SKIRT_SEGMENTS;
    c.push(-SKIRT_EXTENT + outer * (1 - (1 - t) * (1 - t))); // denser towards the tank
  }
  for (let i = 0; i <= INNER_SEGMENTS; i++) c.push(-WORLD_HALF + (2 * WORLD_HALF * i) / INNER_SEGMENTS);
  for (let i = SKIRT_SEGMENTS - 1; i >= 0; i--) c.push(-c[i]);
  return c;
}

function buildGeometry() {
  const c = axisCoords();
  const n = c.length;
  const pos = new Float32Array(n * n * 3);
  let p = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      pos[p++] = c[i];
      pos[p++] = 0;
      pos[p++] = c[j];
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const d = a + n;
      const e = d + 1;
      // Counter-clockwise seen from +y.
      idx[k++] = a; idx[k++] = d; idx[k++] = b;
      idx[k++] = b; idx[k++] = d; idx[k++] = e;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKIRT_EXTENT * Math.SQRT2);
  return g;
}

function rgb(color, a) { color.setRGB(a[0], a[1], a[2]); }

// Uniforms shared by the water and ball shaders (sky, sun, water optics, haze, exposure).
export function envUniforms() {
  return {
    uSkyZenith: { value: new THREE.Color() },
    uSkyHorizon: { value: new THREE.Color() },
    uGlareDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
    uGlareColor: { value: new THREE.Color() },
    uGlareSize: { value: 0.05 },
    uCloud: { value: 0.4 },
    uHazeDensity: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunLight: { value: 1 },
    uDeep: { value: new THREE.Color() },
    uScatter: { value: new THREE.Color() },
    uExtinction: { value: new THREE.Vector3(1, 0.5, 0.4) },
    uExposure: { value: 1 },
  };
}

export function applyEnv(u, p) {
  rgb(u.uSkyZenith.value, p.sky.zenith);
  rgb(u.uSkyHorizon.value, p.sky.horizon);
  u.uGlareDir.value.set(p.sky.glareDir[0], p.sky.glareDir[1], p.sky.glareDir[2]).normalize();
  rgb(u.uGlareColor.value, p.sky.glareColor);
  u.uGlareColor.value.multiplyScalar(p.sky.glareIntensity);
  u.uGlareSize.value = p.sky.glareSize;
  u.uCloud.value = p.sky.cloud;
  u.uHazeDensity.value = p.haze;
  u.uSunDir.value.set(p.sun.dir[0], p.sun.dir[1], p.sun.dir[2]).normalize();
  rgb(u.uSunColor.value, p.sun.color);
  u.uSunLight.value = p.sun.light;
  rgb(u.uDeep.value, p.water.deep);
  rgb(u.uScatter.value, p.water.scatter);
  u.uExtinction.value.set(p.water.extinction[0], p.water.extinction[1], p.water.extinction[2]);
  u.uExposure.value = p.exposure;
}

export class WaterSurface {
  constructor() {
    const balls = [];
    for (let i = 0; i < MAX_BALLS; i++) balls.push(new THREE.Vector4());
    this.uniforms = {
      ...envUniforms(),
      uHeight: { value: null },
      uHalf: { value: WORLD_HALF },
      uDisp: { value: 1 },
      uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
      uCell: { value: (2 * WORLD_HALF) / 512 },
      uTime: { value: 0 },
      uNormalStrength: { value: 3 },
      uMicro: { value: 0 },
      uFresnelBias: { value: 0.02 },
      uSunPower: { value: 900 },
      uSunIntensity: { value: 4 },
      uFloorColor: { value: new THREE.Color() },
      uFloorDepth: { value: 2 },
      uFloorAmount: { value: 0 },
      uFoam: { value: 0.5 },
      uBalls: { value: balls },
      uBallCount: { value: 0 },
      uOverlaySrc: { value: new THREE.Vector4() },
      uOverlayLambda: { value: 0.4 },
      uOverlayPhase: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(buildGeometry(), this.material);
    this.mesh.renderOrder = 1;
    this._res = 0;
    this._features = '';
  }

  // Effect switches compile in or out of the shader (Low quality pays nothing for disabled effects).
  // The theory overlay is a define too, so it costs nothing when off.
  setFeatures({ reflection, refraction, foam, overlay }) {
    const key = `${reflection}|${refraction}|${foam}|${overlay}`;
    if (key === this._features) return;
    this._features = key;
    const d = {};
    if (!reflection) d.CHEAP_SKY = '';
    if (refraction) d.REFRACTION = '';
    if (foam) d.FOAM = '';
    if (overlay) d.OVERLAY = '';
    this.material.defines = d;
    this.material.needsUpdate = true;
  }

  // Sources 0 and 1 (world x, z), wavelength and phase offset of source 1 (radians).
  setOverlay(ax, az, bx, bz, lambda, phase) {
    const u = this.uniforms;
    u.uOverlaySrc.value.set(ax, az, bx, bz);
    u.uOverlayLambda.value = lambda;
    u.uOverlayPhase.value = phase / (2 * Math.PI);
  }

  applyMap(p) {
    const u = this.uniforms;
    applyEnv(u, p);
    u.uSunPower.value = p.sun.power;
    u.uSunIntensity.value = p.sun.intensity;
    u.uNormalStrength.value = p.water.normalStrength;
    u.uMicro.value = p.water.micro;
    u.uFresnelBias.value = p.water.fresnelBias;
    u.uFoam.value = p.water.foam;
    rgb(u.uFloorColor.value, p.water.floorColor);
    u.uFloorDepth.value = p.water.floorDepth;
    u.uFloorAmount.value = p.water.floorAmount;
  }

  update(sim, time, balls) {
    const u = this.uniforms;
    u.uHeight.value = sim.heightTexture;
    u.uTime.value = time;
    if (sim.res !== this._res) {
      this._res = sim.res;
      u.uTexel.value.set(1 / sim.res, 1 / sim.res);
      u.uCell.value = sim.cellSize;
    }
    let n = 0;
    for (let i = 0; i < balls.meshes.length; i++) {
      const m = balls.meshes[i];
      if (!m.visible) continue;
      u.uBalls.value[n++].set(m.position.x, m.position.y, m.position.z, m.scale.x);
    }
    u.uBallCount.value = n;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
