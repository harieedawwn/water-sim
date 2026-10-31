// Water mesh + material. One unit grid stretched over the simulated domain in the vertex shader;
// framing.js sizes that domain so it always covers the whole screen (no tank edge, no horizon).
import * as THREE from 'three';
import { WATER_VERT, WATER_FRAG, MAX_BALLS } from './shaders.js';
import { MULTI_LEVELS, MULTI_DASHES } from '../lines.js';

const SEGMENTS = 256;

function buildGeometry() {
  const n = SEGMENTS + 1;
  const pos = new Float32Array(n * n * 3);
  let p = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      pos[p++] = i / SEGMENTS;
      pos[p++] = 0;
      pos[p++] = j / SEGMENTS;
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
  return g;
}

// '#RRGGBB' -> display (sRGB) components, used where colours are mixed after tone mapping.
export function hexToVec3(hex, out) {
  const v = parseInt(hex.slice(1), 16);
  return out.set(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
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
  // sim: WaterSim (its domain / texel vectors are shared, so grid changes need no copying).
  constructor(sim, lineColors) {
    const balls = [];
    for (let i = 0; i < MAX_BALLS; i++) balls.push(new THREE.Vector4());
    this.uniforms = {
      ...envUniforms(),
      uHeight: { value: null },
      uDomain: { value: sim.domainUniform },
      uDisp: { value: 1 },
      uTexel: { value: sim.texel },
      uCell: { value: sim.cellSize },
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
      uLineSrc: { value: new THREE.Vector4() },
      uLineLambda: { value: 0.4 },
      uLineCycles: { value: 0 },
      uLineReach: { value: new THREE.Vector2() },
      uLineFade: { value: 1 },
      uLineOn: { value: new THREE.Vector2() },
      uLinePx: { value: 1 },
      uLineDash: { value: 0.1 },
      uLineMaxColor: { value: hexToVec3(lineColors.max, new THREE.Vector3()) },
      uLineMinColor: { value: hexToVec3(lineColors.min, new THREE.Vector3()) },
      uLineMCount: { value: 0 },
      uLineM: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uLineLevels: { value: new THREE.Vector4(MULTI_LEVELS.max, MULTI_LEVELS.min, MULTI_LEVELS.rMin, MULTI_DASHES) },
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
    this.mesh.frustumCulled = false;
    this._features = '';
  }

  // Effect switches compile in or out of the shader (Low quality pays nothing for disabled effects).
  // The interference lines are a define too (on when either line toggle is on), so they cost nothing when off.
  setFeatures({ reflection, refraction, foam, lines }) {
    const key = `${reflection}|${refraction}|${foam}|${lines}`;
    if (key === this._features) return;
    this._features = key;
    const d = {};
    if (!reflection) d.CHEAP_SKY = '';
    if (refraction) d.REFRACTION = '';
    if (foam) d.FOAM = '';
    if (lines) d.LINES = '';
    this.material.defines = d;
    this.material.needsUpdate = true;
  }

  // lines: InterferenceLines state; pixelRatio: renderer pixel ratio; pxPerUnit: CSS px per world unit
  // at the screen centre (keeps the dashes about the same length on screen at any zoom).
  setLines(lines, pixelRatio, pxPerUnit) {
    const u = this.uniforms;
    u.uLineSrc.value.set(lines.ax, lines.az, lines.bx, lines.bz);
    u.uLineLambda.value = lines.lambda;
    u.uLineCycles.value = lines.cycles;
    u.uLineReach.value.set(lines.reachA, lines.reachB);
    u.uLineFade.value = lines.fade;
    u.uLineOn.value.set(lines.drawMax ? 1 : 0, lines.drawMin ? 1 : 0);
    u.uLinePx.value = 0.9 * pixelRatio;
    u.uLineDash.value = 16 / pxPerUnit;
    u.uLineMCount.value = lines.multi ? lines.count : 0;
    if (lines.multi) {
      for (let i = 0; i < lines.count; i++) {
        u.uLineM.value[i].set(lines.mx[i], lines.mz[i], lines.mPhase[i], lines.mReach[i]);
      }
    }
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
    u.uCell.value = sim.cellSize;
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
