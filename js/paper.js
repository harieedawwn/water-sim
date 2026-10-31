// Paper sample: a light, flexible sheet taken from the tray (press, drag onto the water, release).
// It falls with strong air drag, lands without drifting, then rides the simulated surface (state machine,
// pointer and tray handling in sample.js).
// The vertex shader samples the sim height texture itself, so the sheet sits exactly on the
// rendered water (no clipping through crests) and bobs / bends with it. No GPU readback.
import * as THREE from 'three';
import { Sample, LIFT } from './sample.js';

// Compact sample: 0.41 x the old 0.7 x 0.5 sheet (1/6 of the area). At the default 1920x1080 view
// (~180 px per world unit at the centre) the long edge is ~52 px, above the ~24 px legibility floor.
// Every size-dependent constant below (and in the shaders) is scaled with SCALE.
const SCALE = 0.41;
const W = 0.7 * SCALE;      // sheet size (world units)
const D = 0.5 * SCALE;
const SEG_X = 24;           // vertex spacing ~0.012 units: finer than a sim cell, so crests cannot poke through
const SEG_Z = 18;
// Gaps scale less than linearly: depth precision does not shrink with the sheet (avoids z-fighting).
const FLOAT = 0.0025;       // gap above the surface (a sheet floats on the surface film)
const CLEAR = 0.004;        // the sheet never dips below the water under it by less than this
const CURL = 0.03 * SCALE;  // dry edge curl
const SWAY_CARRY = 0.02 * SCALE;
const SWAY_FALL = 0.06 * SCALE;
const WET_RATE = 0.12;      // wetness gained per second on the water
const HIT_PX = 44;          // grab radius stays larger than the sheet itself (easy to pick up)

const VERT = /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uDomain;           // minX, minZ, sizeX, sizeZ (world)
uniform float uDisp;
uniform float uLift;            // height above the surface (0 = floating)
uniform float uFlex;            // 0 rigid sheet .. 1 follows the water at every point
uniform float uCurl;            // dry edge curl
uniform float uSway;            // flutter while falling
uniform vec2 uHalf;             // half size (local x, z)
uniform float uClear;           // minimum height above the local water
uniform float uVanish;          // 0..1 removal: shrink
uniform float uSpin;            // removal spin (rad)
varying vec2 vUv;
varying vec3 vN;

float waterAt(vec3 local) {
  vec3 w = (modelMatrix * vec4(local.x, 0.0, local.z, 1.0)).xyz;
  vec2 uv = (w.xz - uDomain.xy) / uDomain.zw;
  return texture(uHeight, clamp(uv, 0.0, 1.0)).r * uDisp;
}

// Sheet height (relative to the mesh origin) at a local point.
float sheetAt(vec2 p, float hc, vec2 g) {
  vec2 q = p / uHalf;
  float rigid = hc + g.x * p.x + g.y * p.y;                 // plane fitted to the water under the sheet
  float water = mix(rigid, waterAt(vec3(p.x, 0.0, p.y)), uFlex);
  float y = water + uLift + uCurl * (q.x * q.x + 0.4 * q.y * q.y) + uSway * q.x;
  // Water cannot pass through the sheet: it always rests on top of the local surface.
  return max(y, waterAt(vec3(p.x, 0.0, p.y)) + uClear);
}

void main() {
  vUv = uv;
  float hc = waterAt(vec3(0.0));
  vec2 g = vec2(
    (waterAt(vec3(uHalf.x, 0.0, 0.0)) - waterAt(vec3(-uHalf.x, 0.0, 0.0))) / (2.0 * uHalf.x),
    (waterAt(vec3(0.0, 0.0, uHalf.y)) - waterAt(vec3(0.0, 0.0, -uHalf.y))) / (2.0 * uHalf.y));
  float cs = cos(uSpin);
  float sn = sin(uSpin);
  vec2 p = mat2(cs, sn, -sn, cs) * position.xz * (1.0 - uVanish);
  float e = 0.008;   // finite-difference step, scaled with the sheet
  float y = sheetAt(p, hc, g);
  float yx = sheetAt(p + vec2(e, 0.0), hc, g);
  float yz = sheetAt(p + vec2(0.0, e), hc, g);
  vec3 n = normalize(vec3(-(yx - y) / e, 1.0, -(yz - y) / e));
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p.x, y, p.y, 1.0);
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
  // Texture density scaled with the sheet (fewer fibres / ruled lines), widths anti-aliased with fwidth
  // so the small sheet does not shimmer.
  vec3 col = vec3(0.86, 0.84, 0.78) - hash(floor(vUv * vec2(56.0, 40.0))) * 0.04;     // paper fibres
  float ly = vUv.y * 4.0;
  float ruled = (1.0 - smoothstep(0.0, 0.05 + fwidth(ly), abs(fract(ly) - 0.5))) * step(vUv.y, 0.88);
  col = mix(col, vec3(0.35, 0.55, 0.85), ruled * 0.5);
  float margin = 1.0 - smoothstep(0.0, 0.01 + fwidth(vUv.x), abs(vUv.x - 0.14));
  col = mix(col, vec3(0.85, 0.2, 0.2), margin * 0.65);
  col = mix(col, col * vec3(0.72, 0.76, 0.8), uWet);                                      // wet: darker, greyer
  float diff = 0.45 + 0.55 * max(dot(n, uSun), 0.0);
  gl_FragColor = vec4(col * diff, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Paper extends Sample {
  constructor(scene, sim, sources, framing) {
    const geo = new THREE.PlaneGeometry(W, D, SEG_X, SEG_Z);
    geo.rotateX(-Math.PI / 2);
    const uniforms = {
      uHeight: { value: null },
      uDomain: { value: sim.domainUniform },
      uDisp: { value: 1 },
      uLift: { value: LIFT },
      uFlex: { value: 0.3 },
      uCurl: { value: CURL },
      uSway: { value: 0 },
      uHalf: { value: new THREE.Vector2(W / 2, D / 2) },
      uClear: { value: CLEAR },
      uWet: { value: 0 },
      uSun: { value: new THREE.Vector3(0.4, 1, 0.3).normalize() },
      uVanish: { value: 0 },
      uSpin: { value: 0 },
    };
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,   // wins depth ties with the water
    }));
    mesh.renderOrder = 1;
    super(scene, sim, sources, framing, mesh, { radius: 0.16, floatLift: FLOAT, hitPx: HIT_PX, hitY: 0 });
    this.wet = 0;
  }

  onTake() { this.wet = 0; }

  // Small splash pushed out at the two short edges (not under the sheet).
  onLand() {
    const cx = Math.cos(this.yaw) * W * 0.6;
    const sx = Math.sin(this.yaw) * W * 0.6;
    this.sources.addDrop(this.x + cx, this.z - sx);
    this.sources.addDrop(this.x - cx, this.z + sx);
  }

  look(dt) {
    const u = this.uniforms;
    let sway = 0;
    if (this.state === 'carry') sway = Math.sin(this.time * 3) * SWAY_CARRY;
    else if (this.state === 'fall') sway = Math.sin(this.time * 6.1) * SWAY_FALL * Math.min(1, this.lift / 0.3);
    // Linear waves move the water up and down, so a floating sheet bobs in place; it follows the surface
    // ever more closely as it soaks.
    else if (this.state === 'float') this.wet = Math.min(1, this.wet + WET_RATE * dt);
    u.uSway.value = sway;
    u.uWet.value = this.wet;
    u.uCurl.value = CURL * (1 - this.wet);
    u.uFlex.value = this.state === 'float' ? 0.6 + 0.4 * this.wet : 0;
  }
}
