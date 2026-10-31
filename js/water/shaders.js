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
uniform vec2 uRes;              // grid size in cells (nx, nz)
uniform float uC2;              // (c_num * dt / dx)^2
uniform float uDamp;            // velocity damping per step
uniform float uSponge;          // sponge width in cells
uniform float uSpongeStrength;  // extra damping per step at the very edge
uniform vec4 uSrc[${MAX_SOURCES}];          // xy = position in cells, z = 1 / (2 sigma_cells^2), w = displacement this step
uniform int uSrcCount;

out vec4 outState;

float hAt(ivec2 p) {
  return texelFetch(uState, clamp(p, ivec2(0), ivec2(uRes) - 1), 0).r;
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
  vec2 pc = vec2(p) + 0.5;
  float edge = min(min(pc.x, pc.y), min(uRes.x - pc.x, uRes.y - pc.y));
  float sp = clamp(1.0 - edge / uSponge, 0.0, 1.0);
  sp *= sp;

  float vel = (h - s.g) * (1.0 - uDamp - uSpongeStrength * sp);
  float hn = (h + vel + uC2 * lap) * (1.0 - 0.1 * uSpongeStrength * sp);

  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    if (i >= uSrcCount) break;
    vec4 q = uSrc[i];
    vec2 d = pc - q.xy;
    hn += q.w * exp(-dot(d, d) * q.z);
  }

  outState = vec4(hn, h, 0.0, 1.0);
}
`;

// Resample a state texture into a grid of another size, cell or position, by world position
// (quality or window changes keep the waves). Same cell size + snapped origin = exact texel copy.
export const COPY_FRAG = /* glsl */`
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uSrc;
uniform vec4 uOld;              // old domain: minX, minZ, sizeX, sizeZ
uniform vec2 uNewMin;
uniform float uCell;            // new cell size
out vec4 outState;
void main() {
  vec2 uv = (uNewMin + gl_FragCoord.xy * uCell - uOld.xy) / uOld.zw;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  outState = vec4(texture(uSrc, uv).rg * inside, 0.0, 1.0);
}
`;

// ---------- Shared sky + noise (procedural, no textures) ----------
// CHEAP_SKY (reflection setting off) drops the cloud noise.

export const SKY_GLSL = /* glsl */`
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
// The mesh is a unit grid stretched over the simulated domain, which always covers the screen.
// Defines: REFRACTION (subsurface gradient + optional sandy floor), FOAM, CHEAP_SKY,
// LINES (interference maxima / minima drawn on the surface, see js/lines.js).

export const WATER_VERT = /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uDomain;           // minX, minZ, sizeX, sizeZ (world)
uniform float uDisp;

varying vec3 vWorld;
varying vec2 vSimUv;

void main() {
  vec2 uv = position.xz;
  vec4 wp = vec4(uDomain.x + uv.x * uDomain.z, 0.0, uDomain.y + uv.y * uDomain.w, 1.0);
  wp.y += texture(uHeight, uv).r * uDisp;
  vWorld = wp.xyz;
  vSimUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const WATER_FRAG = /* glsl */`
uniform sampler2D uHeight;
uniform vec2 uTexel;            // 1 / grid size
uniform float uCell;            // world size of one (square) cell
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
#ifdef LINES
uniform vec4 uLineSrc;          // xy = S1 (x, z), zw = S2 (x, z)
uniform float uLineLambda;
uniform float uLineCycles;      // (phase S2 - phase S1) / 2 pi
uniform vec2 uLineReach;        // stable radius around S1 and S2 (lines show inside both)
uniform float uLineFade;        // radius over which a line fades in behind the reach
uniform vec2 uLineOn;           // maxima, minima (0 or 1)
uniform float uLinePx;          // half line width, framebuffer px
uniform float uLineDash;        // dash period of the minima, world units
uniform vec3 uLineMaxColor;     // display (sRGB) colours, mixed after tone mapping
uniform vec3 uLineMinColor;
uniform int uLineMCount;        // 3 or 4: multi-source envelope contours (0 = two-source path)
uniform vec4 uLineM[4];         // xy = position (x, z), z = phase relative to S1, w = stable radius
uniform vec4 uLineLevels;       // x = maxima level, y = minima level, z = r_min, w = dashes per turn
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
  vec2 cuv = clamp(vSimUv, 0.0, 1.0);
  float hC = texture(uHeight, cuv).r;
  float hL = texture(uHeight, cuv - vec2(uTexel.x, 0.0)).r;
  float hR = texture(uHeight, cuv + vec2(uTexel.x, 0.0)).r;
  float hD = texture(uHeight, cuv - vec2(0.0, uTexel.y)).r;
  float hU = texture(uHeight, cuv + vec2(0.0, uTexel.y)).r;

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

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

#ifdef LINES
  float vis, pxMax, pxMin, dash;
  if (uLineMCount >= 3) {
    // 3-4 sources: contours of n = |sum w_i e^{j(phi_i - k r_i)}| / sum w_i, w_i = 1 / sqrt(max(r_i, r_min)).
    vec2 sum = vec2(0.0);
    float wsum = 0.0;
    float gap = 1e9;
    float near = 1e9;
    float kw = 6.2831853 / uLineLambda;
    for (int i = 0; i < 4; i++) {
      if (i >= uLineMCount) break;
      vec4 q = uLineM[i];
      float r = distance(vWorld.xz, q.xy);
      float w = inversesqrt(max(r, uLineLevels.z));
      float th = q.z - kw * r;
      sum += w * vec2(cos(th), sin(th));
      wsum += w;
      gap = min(gap, q.w - r);
      near = min(near, r - uBalls[i].w);         // distance to the edge of ball i (source i)
    }
    float nv = length(sum) / wsum;
    float nw = max(fwidth(nv), 1e-6);
    vis = clamp(gap / uLineFade, 0.0, 1.0) * smoothstep(0.02, 0.1, near);   // lines run up to the balls
    pxMax = abs(nv - uLineLevels.x) / nw;
    pxMin = abs(nv - uLineLevels.y) / nw;
    // arg(sum) turns once around every node: a few dashes per minima loop.
    dash = step(fract(atan(sum.y, sum.x) * (uLineLevels.w / 6.2831853)), 0.6);
  } else {
  // Source i emits sin(w t + phi_i - k r_i). With x = (r2 - r1) / lambda - (phi2 - phi1) / 2 pi,
  // maxima lie on integer x, minima on half-integer x (only |r2 - r1| <= d exists, automatically).
  float r1 = distance(vWorld.xz, uLineSrc.xy);
  float r2 = distance(vWorld.xz, uLineSrc.zw);
  float lx = (r2 - r1) / uLineLambda - uLineCycles;
  float lw = max(fwidth(lx), 1e-6);
  // Lines run up to the ball edges and fade out only in a thin band right at the edge.
  vis = clamp(min(uLineReach.x - r1, uLineReach.y - r2) / uLineFade, 0.0, 1.0)
            * smoothstep(0.02, 0.1, min(r1 - uBalls[0].w, r2 - uBalls[1].w));
  // |r2 - r1| = d only on the S1-S2 axis beyond the sources: a degenerate "line" with no width (the
  // pattern does not change across it), so it is not drawn.
  float dAxis = distance(uLineSrc.xy, uLineSrc.zw);
  vis *= smoothstep(0.05, 0.12, (dAxis - abs(r2 - r1)) / uLineLambda);
  pxMax = abs(fract(lx + 0.5) - 0.5) / lw;     // distance to the line in px
  pxMin = abs(fract(lx) - 0.5) / lw;
  // Dashes of the minima: approximate arc length from the hyperbola vertex,
  // L = sqrt(b^2 sinh^2 s + a^2 (cosh s - 1)^2) with cosh s = (r1 + r2) / d (exact for a = 0 or b = 0).
  float dd = max(distance(uLineSrc.xy, uLineSrc.zw), 1e-4);
  float ch = max((r1 + r2) / dd, 1.0);
  float ha = 0.5 * abs(r2 - r1);
  float hb2 = max(0.25 * dd * dd - ha * ha, 0.0);
  float arc = sqrt(hb2 * (ch * ch - 1.0) + ha * ha * (ch - 1.0) * (ch - 1.0));
  dash = step(fract(arc / uLineDash), 0.6);
  }
  float onMax = uLineOn.x * vis;
  float onMin = uLineOn.y * vis * dash;
  // Thin dark casing keeps both colours readable on the dark lake and the bright sea.
  float casing = max(onMax * (1.0 - smoothstep(uLinePx + 0.5, uLinePx + 1.5, pxMax)),
                     onMin * (1.0 - smoothstep(uLinePx + 0.5, uLinePx + 1.5, pxMin)));
  float lMax = onMax * (1.0 - smoothstep(uLinePx - 0.5, uLinePx + 0.5, pxMax));
  float lMin = onMin * (1.0 - smoothstep(uLinePx - 0.5, uLinePx + 0.5, pxMin));
  gl_FragColor.rgb *= 1.0 - 0.45 * casing;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uLineMaxColor, lMax);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uLineMinColor, lMin);
  gl_FragColor.a = max(gl_FragColor.a, casing);
#endif
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
uniform vec4 uDomain;           // minX, minZ, sizeX, sizeZ (world)
uniform float uDisp;
uniform vec3 uColor;
uniform float uHighlight;       // 0..1, hovered in move mode
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
  col += uHighlight * (0.35 * uColor + vec3(0.9) * pow(1.0 - max(dot(N, V), 0.0), 3.0));

  // Water line and submerged tint: light travels down to this depth and back up,
  // so the transmitted colour falls off with the same extinction as the water body.
  vec2 uv = (vWorld.xz - uDomain.xy) / uDomain.zw;
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
