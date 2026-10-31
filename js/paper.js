// Paper sample: a light, flexible sheet taken from the tray (press, drag onto the water, release).
// It falls with strong air drag, lands without drifting, then rides the simulated surface.
// The vertex shader samples the sim height texture itself, so the sheet sits exactly on the
// rendered water (no clipping through crests) and bobs / bends with it. No GPU readback.
import * as THREE from 'three';

const W = 0.7;              // sheet size (world units)
const D = 0.5;
const LIFT = 0.8;           // height while carried
const FLOAT = 0.004;        // gap above the surface (a sheet floats on the surface film)
const WET_RATE = 0.12;      // wetness gained per second on the water
const HIT_PX = 60;

const VERT = /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uDomain;           // minX, minZ, sizeX, sizeZ (world)
uniform float uDisp;
uniform float uLift;            // height above the surface (0 = floating)
uniform float uFlex;            // 0 rigid sheet .. 1 follows the water at every point
uniform float uCurl;            // dry edge curl
uniform float uSway;            // flutter while falling
uniform vec2 uHalf;             // half size (local x, z)
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
  return water + uLift + uCurl * (q.x * q.x + 0.4 * q.y * q.y) + uSway * q.x;
}

void main() {
  vUv = uv;
  float hc = waterAt(vec3(0.0));
  vec2 g = vec2(
    (waterAt(vec3(uHalf.x, 0.0, 0.0)) - waterAt(vec3(-uHalf.x, 0.0, 0.0))) / (2.0 * uHalf.x),
    (waterAt(vec3(0.0, 0.0, uHalf.y)) - waterAt(vec3(0.0, 0.0, -uHalf.y))) / (2.0 * uHalf.y));
  vec2 p = position.xz;
  float e = 0.02;
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
  constructor(scene, sim, sources, framing, canvas) {
    this.sim = sim;
    this.sources = sources;
    this.framing = framing;
    const geo = new THREE.PlaneGeometry(W, D, 20, 14);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = {
      uHeight: { value: null },
      uDomain: { value: sim.domainUniform },
      uDisp: { value: 1 },
      uLift: { value: LIFT },
      uFlex: { value: 0.3 },
      uCurl: { value: 0.03 },
      uSway: { value: 0 },
      uHalf: { value: new THREE.Vector2(W / 2, D / 2) },
      uWet: { value: 0 },
      uSun: { value: new THREE.Vector3(0.4, 1, 0.3).normalize() },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    }));
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.on = false;
    this.shown = true;
    this.state = 'off';   // 'off' | 'carry' | 'fall' | 'float'
    this.x = 0;
    this.z = 0;
    this.tx = 0;
    this.tz = 0;
    this.lift = LIFT;
    this.vel = 0;
    this.yaw = 0;
    this.wet = 0;
    this.time = 0;
    this._w = { x: 0, z: 0 };
    this._s = { x: 0, y: 0 };
    this._installPointer(canvas);
  }

  get carrying() { return this.state === 'carry'; }

  // Point under the screen position at the carry height (so the sheet stays under the finger).
  _aim(px, py) {
    if (!this.framing.screenToWater3d(px, py, this._w)) return false;
    const c = this.framing.camera.position;
    const k = c.y > LIFT ? (c.y - LIFT) / c.y : 0;
    this.tx = c.x + (this._w.x - c.x) * k;
    this.tz = c.z + (this._w.z - c.z) * k;
    return true;
  }

  // Start carrying a fresh sheet from the tray.
  takeFromTray(px, py) {
    this.on = true;
    this.state = 'carry';
    this.lift = LIFT;
    this.wet = 0;
    this.yaw = (Math.random() - 0.5) * 0.6;
    if (this._aim(px, py)) {
      this.x = this.tx;
      this.z = this.tz;
    }
    this._visible();
  }

  moveTo(px, py) {
    if (this.state === 'carry') this._aim(px, py);
  }

  // Released: falls onto the water if the pointer is over it, otherwise goes back to the tray.
  release(px, py) {
    if (this.state !== 'carry') return;
    if (this.framing.screenToWater3d(px, py, this._w)) {
      this.state = 'fall';
      this.vel = 0;
    } else {
      this.state = 'off';
      this.on = false;
      this._visible();
    }
  }

  // Must be installed before pointer.js so grabbing the sheet stops the drop / drag handlers.
  _installPointer(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.on || !this.shown || e.button !== 0 || this.state === 'carry') return;
      const s = this.framing.worldToScreen3d(this.x, this.lift, this.z, this._s);
      if (Math.hypot(s.x - e.clientX, s.y - e.clientY) > HIT_PX) return;
      e.stopImmediatePropagation();
      canvas.setPointerCapture(e.pointerId);
      this.state = 'carry';
      this._aim(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', (e) => this.moveTo(e.clientX, e.clientY));
    canvas.addEventListener('pointerup', (e) => this.release(e.clientX, e.clientY));
    canvas.addEventListener('pointercancel', (e) => this.release(e.clientX, e.clientY));
  }

  setShown(v) {
    this.shown = v;
    this._visible();
  }

  _visible() {
    this.mesh.visible = this.on && this.shown;
  }

  update(dt) {
    if (!this.mesh.visible) return;
    this.time += dt;
    const u = this.uniforms;
    u.uHeight.value = this.sim.heightTexture;
    let sway = 0;
    if (this.state === 'carry') {
      const k = Math.min(1, dt * 14);
      this.x += (this.tx - this.x) * k;
      this.z += (this.tz - this.z) * k;
      this.lift += (LIFT - this.lift) * k;
      sway = Math.sin(this.time * 3) * 0.02;
    } else if (this.state === 'fall') {
      // Light sheet: gravity against strong air drag (terminal speed ~1.6 units/s), flutters but
      // falls straight down: nothing pushes it sideways.
      this.vel += (-9.8 - 6 * this.vel) * dt;
      this.lift += this.vel * dt;
      sway = Math.sin(this.time * 6.1) * 0.06 * Math.min(1, this.lift / 0.3);
      if (this.lift <= FLOAT) {
        this.lift = FLOAT;
        this.state = 'float';
        this.sources.addDrop(this.x, this.z);   // small splash where it lands
      }
    } else if (this.state === 'float') {
      // Linear waves move the water up and down (and slightly back and forth around a fixed point),
      // so a floating sheet bobs in place; it follows the surface ever more closely as it soaks.
      this.wet = Math.min(1, this.wet + WET_RATE * dt);
    }
    u.uLift.value = this.lift;
    u.uSway.value = sway;
    u.uWet.value = this.wet;
    u.uCurl.value = 0.03 * (1 - this.wet);
    u.uFlex.value = this.state === 'float' ? 0.3 + 0.65 * this.wet : 0;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
  }
}
