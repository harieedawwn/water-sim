# SPEC - Ripple Tank 3D, self-running interference simulator
Goal: browser app (laptop, Chrome/Edge) showing a photoreal water surface seen from above-oblique. 1, 2 or 4 balls bob up and down on their own at a set frequency and make circular waves that interfere, like a real ripple tank. Physically accurate, runs 60 fps on a modest laptop. No camera, no hand tracking. Look target: ref/ref.png (real photo: dark blue water, long bright sky-reflection bands on crests, dark troughs, honeycomb interference cells, green ball).

## Experiment (physics the sim must reproduce)
Point sources oscillate vertically on a calm surface at the same frequency and phase and emit continuous concentric ripples. Where crest meets crest or trough meets trough the amplitudes add (constructive interference, maximum displacement). Where a crest meets a trough they cancel (destructive interference, still surface), forming stable fanning nodal lines between the sources. Path difference delta = |r1-r2|: constructive when delta = m*lambda, destructive when delta = (m+1/2)*lambda (in phase).

## Stack
- three.js r160 core: `import * as THREE from 'three'`, import map in index.html: {"imports":{"three":"./vendor/three/three.module.js"}}. No addons.
- WebGL2 required; float render targets (EXT_color_buffer_float) else half-float; else Vietnamese error.

## Folder map
index.html, css/style.css
js/main.js (bootstrap, loop, glue only) | js/config.js (defaults, presets, load/save localStorage key "ripple.settings.v1")
js/water/sim.js (WaterSim) | js/water/shaders.js (GLSL strings) | js/water/surface.js (water mesh/material, env uniforms)
js/maps.js (MAPS[]) | js/sources.js (SourceManager: layouts, sine emitters, drops) | js/balls.js (3D balls bobbing in sync with emitters)
js/ui/strings.js (all Vietnamese text) | js/ui/errors.js | js/ui/ui.js (settings panel) | js/ui/hud.js (fps, readout) | js/ui/keys.js

## World
Units: water plane 16x16 centred at origin, surface y=0, +y up. Sim uv (0..1) <-> x,z in [-8,8]. Default camera: perspective fov 50, looks at origin from distance ~11, pitch 50 deg (slider 35-90, 90 = straight down). Default ball colour green.

## Water simulation (GPU height field)
- Damped 2D wave equation, ping-pong render targets storing (h, hPrev). Fixed timestep with accumulator (max 3 substeps/frame) so wave speed is independent of FPS. CFL: c*dt/dx <= 0.4; warn in console if violated.
- Accuracy: wave speed c is a fixed physical constant (world units/second), so lambda = c/f exactly. Default f = 2 Hz gives lambda ~ 12 cells at res 512. Keep lambda >= 8 cells at every allowed frequency and quality (choose frequency range and resolutions accordingly) so numerical dispersion stays negligible. Very light damping so the pattern persists; sponge layer (~6% of border) absorbs waves, no edge reflections.
- Resolutions: low 384, medium 512, high 768. setResolution reallocates (dispose old targets) and clears.
- API: `new WaterSim(renderer,{res})`, `step(dt, emitters)`, `heightTexture`, `setResolution(n)`, `reset()`.
- Emitter = {x,z,radius,mode:'sine'|'impulse',amp,freq,phase}. sine: h += amp*sin(2*pi*f*t+phase)*G(r) each step (continuous coherent source), amplitude ramped from 0 over ~1 s at start or after a parameter change to avoid transients. impulse: one-step signed displacement amp*G(r) (mouse drops). G = Gaussian, sigma = max(radius*0.6, 2 cells).

## Sources and balls
- Ball count N in {1,2,4}. Layouts: "hang" (row along x, centred, spacing setting) and "vuong" (square, used for 4; for 1 and 2 same as hang). Spacing 1-8 units, default ~6*lambda.
- All sources same frequency; "lệch pha" setting (0-180 deg) offsets alternate sources; default 0 (in phase).
- Auto mode (default ON, Space pauses/resumes sources): every ball bobs vertically exactly in sync with its emitter (ball y follows the emitter phase, partly submerged, ball radius setting 0.25-1.1 scales emitter radius and amplitude). Ball tinted by water when submerged.
- Mouse click/drag on the water adds impulse drops (works with sources on or paused).
- Settings: frequency, amplitude, spacing, phase offset, ball size, count, layout.

## Rendering look (match ref/ref.png)
- Normals from height texture gradient with strength uniform (amplified so bands switch between bright and dark). Schlick Fresnel (F0 0.02), procedural sky reflection (analytic gradient + broad bright glare patch + soft clouds; no image files), sun specular glints, depth colour absorption (dark deep blue-teal), refraction look (distorted subsurface/floor tint), foam from steepness/curvature, ACES tone mapping. Aim: 15-25 crests visible across the view.

## Theory overlay and readout (stage P3)
Readout (HUD): frequency f, wavelength lambda, spacing d, d/lambda, and for N=2 in phase the number of nodal lines = 2*(floor(d/lambda - 0.5)+1) if d > lambda/2 else 0. Overlay (key O, N=2 only): thin lines drawn in the water shader where 2*pi*(r1-r2)/lambda + phaseOffset = (2m+1)*pi, so users can verify the simulated dark nodal lines lie on the theoretical hyperbolas.

## Settings (config.js keys, persisted)
quality(auto|low|medium|high), simRes, reflection, refraction, foam, sourceCount(1|2|4), layout, spacing, frequency, amplitude, phaseOffset, ballSize, sourcesRunning, mapIndex, cameraPitch, showFps, showOverlay.
Quality presets: low = res 384, pixelRatio 1, no refraction/foam; medium = 512, pixelRatio<=1.25; high = 768, pixelRatio<=1.5, all effects.
Auto: rolling average over 2 s; <50 fps -> one level down; >58 fps for 6 s -> one level up; cooldown 4 s; never oscillate.

## Shortcuts
1, 2, 4 balls | L layout | Space pause sources | M next map | O theory overlay | F fps | T tuning panel | H hide UI

## Errors (Vietnamese, on screen, never a blank page)
No WebGL2; float render target unsupported (fallback or message); shader compile error (show log); uncaught errors with copy button.
