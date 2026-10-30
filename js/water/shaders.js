// GLSL sources. Sim shaders are raw GLSL3; surface/ball shaders are three ShaderMaterial
// (three supplies matrices, cameraPosition, tone mapping and colour-space chunks).

export const MAX_SOURCES = 8;
export const MAX_BALLS = 4;

// ---------- Simulation (ping-pong state: r = h, g = hPrev) ----------

export const SIM_VERT = /* glsl */`
precision highp float;
in vec3 position;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SIM_FRAG = /* glsl */`
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform int uRes;
uniform float uC2;              // (c_num * dt / dx)^2
uniform float uDamp;            // velocity damping per step
uniform float uSponge;          // sponge width in uv
uniform float uSpongeStrength;  // extra damping per step at the very edge
uniform vec4 uSrc[${MAX_SOURCES}];          // xy = uv, z = 1 / (2 sigma_uv^2), w = displacement this step
uniform int uSrcCount;

out vec4 outState;

float hAt(ivec2 p) {
  return texelFetch(uState, clamp(p, ivec2(0), ivec2(uRes - 1)), 0).r;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 s = texelFetch(uState, p, 0).rg;
  float h = s.r;

  // 9-point isotropic Laplacian (in cell units).
  float edge4 = hAt(p + ivec2(1, 0)) + hAt(p + ivec2(-1, 0)) + hAt(p + ivec2(0, 1)) + hAt(p + ivec2(0, -1));
  float diag = hAt(p + ivec2(1, 1)) + hAt(p + ivec2(-1, 1)) + hAt(p + ivec2(1, -1)) + hAt(p + ivec2(-1, -1));
  float lap = (4.0 * edge4 + diag - 20.0 * h) / 6.0;

  // Sponge layer: quadratic ramp of damping towards the border.
  vec2 uv = (vec2(p) + 0.5) / float(uRes);
  float edge = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
  float sp = clamp(1.0 - edge / uSponge, 0.0, 1.0);
  sp *= sp;

  float vel = (h - s.g) * (1.0 - uDamp - uSpongeStrength * sp);
  float hn = (h + vel + uC2 * lap) * (1.0 - 0.1 * uSpongeStrength * sp);

  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    if (i >= uSrcCount) break;
    vec4 q = uSrc[i];
    vec2 d = uv - q.xy;
    hn += q.w * exp(-dot(d, d) * q.z);
  }

  outState = vec4(hn, h, 0.0, 1.0);
}
`;

// Resample a state texture into a target of another resolution (quality changes keep the waves).
export const COPY_FRAG = /* glsl */`
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uSrc;
uniform int uRes;
out vec4 outState;
void main() {
  outState = vec4(texture(uSrc, gl_FragCoord.xy / float(uRes)).rg, 0.0, 1.0);
}
`;

// ---------- Shared sky + noise (procedural, no textures) ----------
// CHEAP_SKY (reflection setting off) drops the cloud noise.

const SKY_GLSL = /* glsl */`
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uGlareDir;
uniform vec3 uGlareColor;       // already multiplied by glare intensity
uniform float uGlareSize;
uniform float uCloud;
uniform float uHazeDensity;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}

// Two-lobe glare: sharp core (crisp crest bands) + broad halo.
vec3 glareHalo(vec3 d) {
  return uGlareColor * (0.12 * exp((dot(d, uGlareDir) - 1.0) / (uGlareSize * 6.0)));
}

vec3 glare(vec3 d) {
  return uGlareColor * exp((dot(d, uGlareDir) - 1.0) / uGlareSize) + glareHalo(d);
}

// Linear HDR sky radiance for direction d (d.y >= 0).
vec3 skyColor(vec3 d) {
  float e = max(d.y, 0.0);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(e, 0.55));
#ifdef CHEAP_SKY
  return c + glare(d);
#else
  float cl = fbm(d.xz / (e + 0.18) * 0.9 + vec2(3.0, 1.0));
  float cloudMod = mix(1.0, 0.6 + 0.8 * cl, uCloud);
  return (c + glare(d)) * cloudMod;
#endif
}

// Horizon haze colour seen along view direction -V.
vec3 hazeColor(vec3 V) {
  vec3 h = normalize(vec3(-V.x, 0.04, -V.z));
  return uSkyHorizon + glareHalo(h) * 0.5;
}

// Diffuse sky light for a normal (no glare peak).
vec3 skyAmbient(vec3 n) {
  float e = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  return mix(uSkyHorizon * 0.5, mix(uSkyHorizon, uSkyZenith, 0.5), e) + uGlareColor * 0.004;
}
`;

// ---------- Water surface (single pass) ----------
// Defines: REFRACTION (subsurface gradient + optional sandy floor), FOAM, CHEAP_SKY.

export const WATER_VERT = /* glsl */`
uniform sampler2D uHeight;
uniform float uHalf;
uniform float uDisp;

varying vec3 vWorld;
varying vec2 vSimUv;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 uv = wp.xz / (2.0 * uHalf) + 0.5;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  wp.y += texture(uHeight, clamp(uv, 0.0, 1.0)).r * uDisp * inside;
  vWorld = wp.xyz;
  vSimUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const WATER_FRAG = /* glsl */`
uniform sampler2D uHeight;
uniform vec2 uTexel;            // 1 / res
uniform float uCell;            // world size of one texel
uniform float uTime;
uniform float uNormalStrength;
uniform float uMicro;
uniform float uFresnelBias;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunPower;
uniform float uSunIntensity;
uniform float uSunLight;
uniform vec3 uDeep;
uniform vec3 uScatter;
uniform vec3 uExtinction;
uniform vec3 uFloorColor;
uniform float uFloorDepth;
uniform float uFloorAmount;
uniform float uFoam;
uniform float uExposure;
uniform vec4 uBalls[${MAX_BALLS}];         // xyz centre, w radius
uniform int uBallCount;
#ifdef OVERLAY
uniform vec4 uOverlaySrc;       // xy = source 0 (x, z), zw = source 1 (x, z)
uniform float uOverlayLambda;
uniform float uOverlayPhase;    // phase offset of source 1, in cycles
#endif

varying vec3 vWorld;
varying vec2 vSimUv;

${SKY_GLSL}

// Short wind ripples: four directional sines with analytic slopes (cheap, no textures).
vec2 microSlope(vec2 p, float t) {
  vec2 d1 = vec2(0.80, 0.60);
  vec2 d2 = vec2(-0.45, 0.89);
  vec2 d3 = vec2(0.96, -0.28);
  vec2 d4 = vec2(-0.70, -0.71);
  return d1 * cos(dot(p, d1) * 31.0 + t * 7.1) * 0.35
       + d2 * cos(dot(p, d2) * 43.0 + t * 8.3) * 0.28
       + d3 * cos(dot(p, d3) * 57.0 + t * 9.6) * 0.22
       + d4 * cos(dot(p, d4) * 71.0 + t * 10.7) * 0.15;
}

void main() {
  vec2 uv = vSimUv;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec2 cuv = clamp(uv, 0.0, 1.0);
  float hC = texture(uHeight, cuv).r * inside;
  float hL = texture(uHeight, cuv - vec2(uTexel.x, 0.0)).r * inside;
  float hR = texture(uHeight, cuv + vec2(uTexel.x, 0.0)).r * inside;
  float hD = texture(uHeight, cuv - vec2(0.0, uTexel.y)).r * inside;
  float hU = texture(uHeight, cuv + vec2(0.0, uTexel.y)).r * inside;

  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  // Slope normal, amplified; faded with distance to limit aliasing of far crests.
  float fade = 1.0 / (1.0 + 0.004 * dist * dist);
  vec2 grad = vec2(hR - hL, hU - hD) / (2.0 * uCell) * uNormalStrength * fade;
  grad += microSlope(vWorld.xz, uTime) * uMicro * fade * fade;
  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));

  float cosV = clamp(dot(N, V), 0.0, 1.0);
  float F = uFresnelBias + (1.0 - uFresnelBias) * pow(1.0 - cosV, 5.0);

  vec3 R = reflect(-V, N);
  R.y = max(R.y, 0.02);
  R = normalize(R);
  vec3 refl = skyColor(R);
  vec3 spec = uSunColor * (pow(max(dot(R, uSunDir), 0.0), uSunPower) * uSunIntensity);

  // Curvature (1 / world unit): negative on crests.
  float curv = (hL + hR + hD + hU - 4.0 * hC) / (uCell * uCell);

#ifdef REFRACTION
  vec3 T = refract(-V, N, 0.75);
  float down = clamp(-T.y, 0.05, 1.0);
  // Distorted subsurface gradient: more scattered light when looking down, wobbling with the refracted ray.
  vec3 body = mix(uDeep, uScatter, down * down * (0.8 + 0.4 * vnoise(vWorld.xz * 0.7 + T.xz * 2.5)));
  if (uFloorAmount > 0.0) {
    float tF = uFloorDepth / down;
    vec2 fp = vWorld.xz + T.xz * tF;
    float sand = 0.7 + 0.3 * vnoise(fp * 3.0) + 0.08 * sin(fp.x * 5.0 + 3.0 * vnoise(fp * 0.8));
    float caustic = 1.0 + clamp(-curv * 0.12, -0.4, 1.2);     // crests focus light onto the floor
    vec3 floorLit = uFloorColor * sand * caustic * (uSunColor * uSunLight * max(uSunDir.y, 0.0) + skyAmbient(vec3(0.0, 1.0, 0.0)));
    vec3 trans = exp(-uExtinction * (tF + uFloorDepth));
    body = mix(body, floorLit * trans + body * (1.0 - trans), uFloorAmount);
  }
#else
  vec3 body = mix(uScatter, uDeep, 1.0 - exp(-0.6 / max(cosV, 0.08)));
#endif
  body *= 1.0 + clamp(hC * 25.0, -0.5, 0.5);   // crests thinner and lighter, troughs darker

  // Balls under the surface: let the ball fragments behind show through (ball shader tints them).
  float hit = 0.0;
  for (int i = 0; i < ${MAX_BALLS}; i++) {
    if (i >= uBallCount) break;
    vec3 oc = vWorld - uBalls[i].xyz;
    float b = dot(oc, V);                       // ray dir is -V, so b = -(oc . dir)
    float r2 = uBalls[i].w * uBalls[i].w;
    float disc = b * b - (dot(oc, oc) - r2);
    hit = max(hit, smoothstep(0.0, 0.06, disc / r2) * step(0.0, b));
  }

  vec3 col = mix(mix(body, refl, F), refl, hit) + spec;
  float alpha = mix(1.0, F, hit);

#ifdef FOAM
  float crest = smoothstep(4.0, 9.0, -curv) * step(0.0, hC);
  float foam = clamp(crest * uFoam * (0.35 + 0.9 * vnoise(vWorld.xz * 9.0 + vec2(uTime * 0.3, 0.0))), 0.0, 1.0);
  vec3 foamCol = skyAmbient(vec3(0.0, 1.0, 0.0)) * 1.4 + uSunColor * uSunLight * max(uSunDir.y, 0.0) * 0.6;
  col = mix(col, foamCol, foam);
  alpha = mix(alpha, 1.0, foam);
#endif

  col *= uExposure;
  float haze = 1.0 - exp(-uHazeDensity * dist * dist);
  col = mix(col, hazeColor(V) * uExposure, haze);
  alpha = mix(alpha, 1.0, haze);

#ifdef OVERLAY
  // Theoretical nodal lines. Source i emits sin(w t + phi_i - k r_i); the two cancel where
  // (r1 - r0) / lambda - phi1 / (2 pi) = m + 1/2.
  float ox = (distance(vWorld.xz, uOverlaySrc.zw) - distance(vWorld.xz, uOverlaySrc.xy)) / uOverlayLambda - uOverlayPhase;
  float od = abs(fract(ox) - 0.5);
  float ow = fwidth(ox);
  float line = (1.0 - smoothstep(0.5 * ow, 1.5 * ow, od)) * inside;
  col = mix(col, vec3(1.8, 1.25, 0.15), line * 0.9);
  alpha = mix(alpha, 1.0, line);
#endif

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------- Balls ----------

export const BALL_VERT = /* glsl */`
varying vec3 vWorld;
varying vec3 vNormal;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const BALL_FRAG = /* glsl */`
uniform sampler2D uHeight;
uniform float uHalf;
uniform float uDisp;
uniform vec3 uColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunLight;
uniform vec3 uDeep;
uniform vec3 uScatter;
uniform vec3 uExtinction;
uniform float uExposure;

varying vec3 vWorld;
varying vec3 vNormal;

${SKY_GLSL}

void main() {
  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  float diff = max(dot(N, uSunDir), 0.0);
  vec3 col = uColor * (uSunColor * uSunLight * diff + skyAmbient(N));
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * uSunLight * pow(max(dot(N, H), 0.0), 60.0) * 0.25;

  vec3 R = reflect(-V, N);
  R.y = max(R.y, 0.02);
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col = mix(col, skyColor(normalize(R)), F * 0.35);

  // Water line and submerged tint: light travels down to this depth and back up,
  // so the transmitted colour falls off with the same extinction as the water body.
  vec2 uv = vWorld.xz / (2.0 * uHalf) + 0.5;
  float wh = texture(uHeight, clamp(uv, 0.0, 1.0)).r * uDisp;
  float depth = wh - vWorld.y;
  col *= 1.0 - 0.3 * smoothstep(0.04, 0.0, abs(depth));
  vec3 trans = exp(-uExtinction * max(depth, 0.0) * 2.0);
  vec3 inscatter = mix(uDeep, uScatter, 0.5);
  col = mix(col, col * trans + inscatter * (1.0 - trans), step(0.0, depth));

  col *= uExposure;
  float haze = 1.0 - exp(-uHazeDensity * dist * dist);
  col = mix(col, hazeColor(V) * uExposure, haze);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
