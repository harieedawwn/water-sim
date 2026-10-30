// Green balls bobbing in sync with their emitters, partly submerged, tinted by water below the surface.
import * as THREE from 'three';
import { BALL_VERT, BALL_FRAG, MAX_BALLS } from './water/shaders.js';
import { envUniforms, applyEnv } from './water/surface.js';
import { BALL_RADIUS, BALL_HEX } from './config.js';

const REST = 0.2;   // centre height above the water at rest, as a fraction of the radius

export class Balls {
  constructor(scene, sim) {
    // Shared uniform objects; each ball's material adds only its own highlight value.
    this.uniforms = {
      ...envUniforms(),
      uHeight: { value: null },
      uDomain: { value: sim.domainUniform },
      uDisp: { value: 1 },
      uColor: { value: new THREE.Color(BALL_HEX) },
    };
    this.geometry = new THREE.SphereGeometry(1, 48, 32);
    this.meshes = [];
    this._highlights = [];
    for (let i = 0; i < MAX_BALLS; i++) {
      const highlight = { value: 0 };
      const material = new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uHighlight: highlight },
        vertexShader: BALL_VERT,
        fragmentShader: BALL_FRAG,
      });
      const m = new THREE.Mesh(this.geometry, material);
      m.visible = false;
      m.scale.setScalar(BALL_RADIUS);
      scene.add(m);
      this.meshes.push(m);
      this._highlights.push(highlight);
    }
  }

  applyMap(p) {
    applyEnv(this.uniforms, p);
  }

  // hover: index of the highlighted source, or -1.
  update(sim, sources, hover) {
    this.uniforms.uHeight.value = sim.heightTexture;
    const t = sim.renderTime;
    const bob = sources.bobAmplitude;
    const p = sources.positions;
    for (let i = 0; i < MAX_BALLS; i++) {
      const m = this.meshes[i];
      m.visible = i < sources.count;
      this._highlights[i].value = i === hover ? 1 : 0;
      if (!m.visible) continue;
      m.position.set(p[i * 2], BALL_RADIUS * REST + bob * sources.oscillation(i, t), p[i * 2 + 1]);
    }
  }

  dispose() {
    for (const m of this.meshes) {
      m.removeFromParent();
      m.material.dispose();
    }
    this.geometry.dispose();
  }
}
