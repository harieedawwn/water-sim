// Rubber duck sample: a classic yellow bath duck built from three core geometries (squashed-sphere body,
// round head, two-part orange beak, glossy black eyes with a white glint, flat side wings, upturned tail).
// Same carry / fall / float behaviour as the paper (sample.js). It floats as a rigid body: the vertex shader
// samples the sim height texture at 5 points of its footprint (rotated with the yaw) and applies one heave
// plus a small clamped pitch / roll to every vertex, so it bobs and tilts without bending. No GPU readback.
import * as THREE from 'three';
import { Sample, LIFT } from './sample.js';
import { SKY_GLSL } from './water/shaders.js';

const FOOT = [0.11, 0.08];   // half spans of the slope samples (local x, z), below half a wavelength
const TILT_GAIN = 0.6;       // a rigid hull tilts less than the local wave slope
const TILT_MAX = 0.35;       // rad (20 deg)
const HIT_PX = 56;

const YELLOW = '#ffcf1f';
const WING = '#f6b80e';
const BEAK = '#ff7a12';
const BEAK_LOW = '#e8600c';
const EYE = '#0c0c0e';
const GLINT = '#ffffff';

const VERT = /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uDomain;           // minX, minZ, sizeX, sizeZ (world)
uniform float uDisp;
uniform float uLift;            // height of the duck origin above the water (0 = floating)
uniform float uFloat;           // 0 carried .. 1 floating: how much the hull tilts with the water
uniform vec2 uFoot;             // half spans of the slope samples (local x, z)
uniform float uVanish;          // 0..1 removal: shrink
uniform float uSpin;            // removal spin (rad)
attribute vec3 aCol;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vWorld;

float waterAt(vec2 local) {
  vec2 w = (modelMatrix * vec4(local.x, 0.0, local.y, 1.0)).xz;
  vec2 uv = (w - uDomain.xy) / uDomain.zw;
  return texture(uHeight, clamp(uv, 0.0, 1.0)).r * uDisp;
}

void main() {
  // Rigid body: one heave and one tilt for the whole duck.
  float hc = waterAt(vec2(0.0));
  float hxp = waterAt(vec2(uFoot.x, 0.0));
  float hxn = waterAt(vec2(-uFoot.x, 0.0));
  float hzp = waterAt(vec2(0.0, uFoot.y));
  float hzn = waterAt(vec2(0.0, -uFoot.y));
  float heave = 0.4 * hc + 0.15 * (hxp + hxn + hzp + hzn);
  float ax = clamp(atan(${TILT_GAIN.toFixed(2)} * (hxp - hxn) / (2.0 * uFoot.x)), -${TILT_MAX.toFixed(2)}, ${TILT_MAX.toFixed(2)}) * uFloat;
  float az = -clamp(atan(${TILT_GAIN.toFixed(2)} * (hzp - hzn) / (2.0 * uFoot.y)), -${TILT_MAX.toFixed(2)}, ${TILT_MAX.toFixed(2)}) * uFloat;
  mat3 pitch = mat3(cos(ax), sin(ax), 0.0, -sin(ax), cos(ax), 0.0, 0.0, 0.0, 1.0);   // about z: +x rises with the slope
  mat3 roll = mat3(1.0, 0.0, 0.0, 0.0, cos(az), sin(az), 0.0, -sin(az), cos(az));    // about x
  mat3 R = pitch * roll;

  vec3 p = position;
  vec3 n = normal;
  float cs = cos(uSpin);
  float sn = sin(uSpin);
  mat2 spin = mat2(cs, sn, -sn, cs);
  p.xz = spin * p.xz;
  n.xz = spin * n.xz;
  p *= 1.0 - uVanish;
  p = R * p;
  p.y += heave + uLift;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * (R * n));
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// Glossy plastic under the scene's sun and sky (same lighting terms as the balls).
const FRAG = /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uDomain;
uniform float uDisp;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunLight;
uniform float uExposure;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vWorld;

${SKY_GLSL}

void main() {
  vec3 N = normalize(vN);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float diff = max(dot(N, uSunDir), 0.0);
  vec3 col = vCol * (uSunColor * uSunLight * (0.25 + 0.75 * diff) + skyAmbient(N) + 0.12);
  vec3 H = normalize(uSunDir + V);
  float nh = max(dot(N, H), 0.0);
  col += uSunColor * uSunLight * (pow(nh, 90.0) * 0.9 + pow(nh, 14.0) * 0.06);
  vec3 R = reflect(-V, N);
  R.y = max(R.y, 0.02);
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col = mix(col, skyColor(normalize(R)), F * 0.3);

  // Soft contact shade along the waterline.
  vec2 uv = (vWorld.xz - uDomain.xy) / uDomain.zw;
  float wh = texture(uHeight, clamp(uv, 0.0, 1.0)).r * uDisp;
  col *= 1.0 - 0.3 * smoothstep(0.035, 0.0, abs(vWorld.y - wh));

  col *= uExposure;
  float haze = 1.0 - exp(-uHazeDensity * dist * dist);
  col = mix(col, hazeColor(V) * uExposure, haze);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// One indexed geometry from parts { geo, hex, m (Matrix4) } with a per-vertex colour (linear) attribute.
function mergeParts(parts) {
  let nv = 0;
  let ni = 0;
  for (const p of parts) {
    p.geo.applyMatrix4(p.m);
    nv += p.geo.attributes.position.count;
    ni += p.geo.index.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  const c = new THREE.Color();
  let ov = 0;
  let oi = 0;
  for (const p of parts) {
    const g = p.geo;
    const count = g.attributes.position.count;
    pos.set(g.attributes.position.array, ov * 3);
    nor.set(g.attributes.normal.array, ov * 3);
    c.set(p.hex);
    for (let i = 0; i < count; i++) col.set([c.r, c.g, c.b], (ov + i) * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[oi + i] = src[i] + ov;
    ov += count;
    oi += src.length;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

// Local frame: +x forward (beak), +y up, origin at the waterline; ~0.83 long, 37 % of the body below y = 0.
function buildDuck() {
  const parts = [];
  const m = () => new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const add = (geo, hex, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    q.setFromEuler(e.set(rx, ry, rz));
    parts.push({ geo, hex, m: m().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)) });
  };
  const sphere = (w, h) => new THREE.SphereGeometry(1, w, h);
  add(sphere(32, 20), YELLOW, -0.02, 0.05, 0, 0.34, 0.19, 0.25);                     // body
  add(sphere(28, 18), YELLOW, 0.17, 0.31, 0, 0.16, 0.16, 0.155);                     // head
  add(new THREE.ConeGeometry(0.075, 0.18, 14, 1), YELLOW, -0.34, 0.18, 0, 1, 1, 0.6, 0, 0, 0.95);   // tail, tip up and back
  for (const sz of [1, -1]) {
    add(sphere(16, 10), WING, -0.05, 0.12, 0.236 * sz, 0.15, 0.075, 0.035, 0, 0.12 * sz, 0.22);   // wing
    // Eye on the head surface, a white glint on its upper front.
    const d = new THREE.Vector3(0.63, 0.37, 0.69 * sz);
    const c = new THREE.Vector3(0.17, 0.31, 0).addScaledVector(d, 0.148);
    add(sphere(12, 8), EYE, c.x, c.y, c.z, 0.03, 0.034, 0.03);
    const g = c.clone().addScaledVector(d, 0.024).add(new THREE.Vector3(0.004, 0.012, 0));
    add(sphere(8, 6), GLINT, g.x, g.y, g.z, 0.009, 0.009, 0.009);
  }
  add(sphere(18, 10), BEAK, 0.335, 0.295, 0, 0.09, 0.032, 0.075);                    // upper beak
  add(sphere(16, 8), BEAK_LOW, 0.32, 0.262, 0, 0.07, 0.022, 0.058);                  // lower beak
  return mergeParts(parts);
}

export class Duck extends Sample {
  // envUniforms: the balls' shared sky / sun / water uniforms (same lighting as the rest of the scene).
  constructor(scene, sim, sources, framing, envUniforms) {
    const uniforms = {
      ...envUniforms,
      uHeight: { value: null },
      uDomain: { value: sim.domainUniform },
      uDisp: { value: 1 },
      uLift: { value: LIFT },
      uFloat: { value: 0 },
      uFoot: { value: new THREE.Vector2(FOOT[0], FOOT[1]) },
      uVanish: { value: 0 },
      uSpin: { value: 0 },
    };
    const mesh = new THREE.Mesh(buildDuck(), new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG,
    }));
    super(scene, sim, sources, framing, mesh, { radius: 0.33, floatLift: 0, hitPx: HIT_PX, hitY: 0.15 });
    this._float = 0;
  }

  // Small splash on both sides of the hull (not under it).
  onLand() {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const side = 0.36;
    this.sources.addDrop(this.x + s * side, this.z + c * side);
    this.sources.addDrop(this.x - s * side, this.z - c * side);
  }

  look(dt) {
    // Tilting with the water eases in after landing (no snap).
    const target = this.state === 'float' ? 1 : 0;
    this._float += (target - this._float) * Math.min(1, dt * 4);
    this.uniforms.uFloat.value = this._float;
  }
}
