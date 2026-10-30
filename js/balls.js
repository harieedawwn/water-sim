// Green balls bobbing in sync with their emitters, partly submerged, tinted by water below the surface.
import * as THREE from 'three';
import { BALL_VERT, BALL_FRAG, MAX_BALLS } from './water/shaders.js';
import { envUniforms, applyEnv } from './water/surface.js';
import { WORLD_HALF } from './config.js';

const REST = 0.2;   // centre height above the water at rest, as a fraction of the radius

export class Balls {
  constructor(scene) {
    this.uniforms = {
      ...envUniforms(),
      uHeight: { value: null },
      uHalf: { value: WORLD_HALF },
      uDisp: { value: 1 },
      uColor: { value: new THREE.Color(0.1, 0.78, 0.16) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: BALL_VERT,
      fragmentShader: BALL_FRAG,
    });
    this.geometry = new THREE.SphereGeometry(1, 48, 32);
    this.meshes = [];
    for (let i = 0; i < MAX_BALLS; i++) {
      const m = new THREE.Mesh(this.geometry, this.material);
      m.visible = false;
      scene.add(m);
      this.meshes.push(m);
    }
  }

  applyMap(p) {
    applyEnv(this.uniforms, p);
    const c = p.ballColor;
    this.uniforms.uColor.value.setRGB(c[0], c[1], c[2]);
  }

  update(sim, sources) {
    this.uniforms.uHeight.value = sim.heightTexture;
    const t = sim.renderTime;
    const r = sources.ballSize;
    const bob = sources.bobAmplitude;
    const p = sources.positions;
    for (let i = 0; i < MAX_BALLS; i++) {
      const m = this.meshes[i];
      m.visible = i < sources.count;
      if (!m.visible) continue;
      m.position.set(p[i * 2], r * REST + bob * sources.oscillation(i, t), p[i * 2 + 1]);
      m.scale.setScalar(r);
    }
  }

  dispose() {
    for (const m of this.meshes) m.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
