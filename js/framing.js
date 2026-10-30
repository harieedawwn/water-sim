// Camera framing for the 3D views, the simulated domain that covers the screen, the 2D view mapping
// and the area sources may occupy (visible in every view). Pure geometry, recomputed on resize/pitch.
import * as THREE from 'three';
import { SIM_AREA } from './config.js';

export const CAMERA_FOV = 50;
const SIM_MARGIN = 1.5;      // world units simulated beyond the visible footprint (holds the sponge)
const EDGE_PX_MIN = 36;      // sources keep at least this far (CSS px) from the screen edge
const EDGE_FRAC = 0.07;      // ... or this fraction of the shorter screen side
const CLAMP_STEPS = 18;

export class Framing {
  constructor(camera) {
    this.camera = camera;
    this.width = 1;
    this.height = 1;
    this.height3d = 8;       // camera height above the water
    this.distance = 10;      // camera distance to the look-at point (origin)
    // Visible footprint of the 3D camera padded by SIM_MARGIN (world units).
    this.domain = { minX: -8, minZ: -8, sizeX: 16, sizeZ: 16 };
    // 2D view: world rectangle centred at the origin, same scale as the 3D view at the screen centre.
    this.half2d = { x: 8, z: 8 };
    this.scale2d = 1;        // CSS px per world unit in the 2D view
    this._edgePx = EDGE_PX_MIN;
    this._v = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  // Footprint of a camera at height 1 looking at the origin with pitch p, for screen rows
  // sy = -1 (near) and +1 (far). Screen rows map to lines of constant z.
  update(width, height, pitchDeg) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const aspect = this.width / this.height;
    const p = THREE.MathUtils.degToRad(Math.min(pitchDeg, 89.9));
    const s = Math.sin(p);
    const c = Math.cos(p);
    const ty = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
    const tx = aspect * ty;
    const tNear = 1 / (s + ty * c);
    const tFar = 1 / (s - ty * c);
    const zCam = c / s;
    const zNear = zCam - tNear * (c - ty * s);
    const zFar = zCam - tFar * (c + ty * s);
    const a = 2 * tFar * tx;       // footprint bounding box width / height3d
    const b = zNear - zFar;        // footprint depth / height3d

    // Choose the camera height so the padded footprint has area SIM_AREA:
    // (a H + 2m)(b H + 2m) = SIM_AREA.
    const m2 = 2 * SIM_MARGIN;
    const qa = a * b;
    const qb = m2 * (a + b);
    const qc = m2 * m2 - SIM_AREA;
    const H = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
    this.height3d = H;
    this.distance = H / s;

    const cam = this.camera;
    cam.fov = CAMERA_FOV;
    cam.aspect = aspect;
    cam.position.set(0, H, H * zCam);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    const d = this.domain;
    d.minX = -tFar * tx * H - SIM_MARGIN;
    d.sizeX = a * H + m2;
    d.minZ = zFar * H - SIM_MARGIN;
    d.sizeZ = b * H + m2;

    this.half2d.x = this.distance * tx;
    this.half2d.z = this.distance * ty;
    this.scale2d = this.height / 2 / this.half2d.z;
    this._edgePx = Math.max(EDGE_PX_MIN, EDGE_FRAC * Math.min(this.width, this.height));
  }

  // True when a source at (x, z) is comfortably on screen in the 3D views and in the 2D view.
  inside(x, z) {
    const e = this._edgePx / this.scale2d;
    if (Math.abs(x) > this.half2d.x - e || Math.abs(z) > this.half2d.z - e) return false;
    const v = this._v.set(x, 0, z).project(this.camera);
    return Math.abs(v.x) <= 1 - (2 * this._edgePx) / this.width
      && Math.abs(v.y) <= 1 - (2 * this._edgePx) / this.height;
  }

  // Pulls (x, z) towards the origin until it is inside(); writes the result to out {x, z}.
  clamp(x, z, out) {
    if (this.inside(x, z)) {
      out.x = x;
      out.z = z;
      return out;
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < CLAMP_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (this.inside(x * mid, z * mid)) lo = mid;
      else hi = mid;
    }
    out.x = x * lo;
    out.z = z * lo;
    return out;
  }

  // Screen (CSS px) -> point on the water plane y = 0 in the 3D view. Returns false if no hit.
  screenToWater3d(px, py, out) {
    this._ndc.set((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    const hit = this._ray.ray.intersectPlane(this._plane, this._v);
    if (!hit) return false;
    out.x = hit.x;
    out.z = hit.z;
    return true;
  }

  // World point -> screen (CSS px) in the 3D view; out {x, y}.
  worldToScreen3d(x, y, z, out) {
    const v = this._v.set(x, y, z).project(this.camera);
    out.x = (v.x + 1) * 0.5 * this.width;
    out.y = (1 - v.y) * 0.5 * this.height;
    return out;
  }

  // 2D view: screen up = -z (the far side of the 3D view).
  screenToWorld2d(px, py, out) {
    out.x = (px - this.width / 2) / this.scale2d;
    out.z = (py - this.height / 2) / this.scale2d;
    return true;
  }

  worldToScreen2d(x, z, out) {
    out.x = this.width / 2 + x * this.scale2d;
    out.y = this.height / 2 + z * this.scale2d;
    return out;
  }
}
