# SPEC - Ripple Tank 3D, self-running interference simulator
Goal: browser app (laptop + projector in class, Chrome/Edge; also phones in portrait) showing interfering water waves. 1, 2 or 4 green balls bob up and down on their own and make circular waves, like a real ripple tank. Three views: two photoreal 3D water scenes and an analytic 2D top view. Physically accurate, 60 fps on a modest laptop. No camera, no hand tracking. 3D look target: ref/ref.png (real photo: dark blue water, long bright sky-reflection bands on crests, dark troughs, honeycomb interference cells, green ball).

## Experiment (physics the app must reproduce)
Point sources oscillate vertically at frequency f_i and phase phi_i (source i: sin(2 pi f_i t + phi_i)) and emit sin(w t + phi_i - k r_i). With two sources S1, S2 of equal frequency and dphi = phi2 - phi1:
- maxima (strong oscillation): r2 - r1 = (k + dphi / 2 pi) lambda
- minima (still water): r2 - r1 = (k + 1/2 + dphi / 2 pi) lambda
- only integers k with |r2 - r1| <= d (distance S1-S2) exist; for dphi = 0 the k = 0 maximum is the perpendicular bisector.
phi_i is the per-source initial phase setting `phases[i]`, so dphi = phases[1] - phases[0] (the central maximum bends towards S1 when dphi > 0). Some textbooks write the formula with dphi = phi1 - phi2; the sign above is the one the sim uses.

## Stack
- three.js r160 core: `import * as THREE from 'three'`, import map in index.html: {"imports":{"three":"./vendor/three/three.module.js"}}. No addons.
- WebGL2 required; float render targets (EXT_color_buffer_float) else half-float; else Vietnamese error.

## Folder map
index.html, css/style.css
js/main.js (bootstrap, loop, glue only) | js/config.js (defaults, limits, presets, load/save localStorage key "ripple.settings.v1")
js/framing.js (camera framing, sim domain, 2D mapping, area allowed for sources)
js/water/sim.js (WaterSim) | js/water/shaders.js (GLSL strings) | js/water/surface.js (water mesh/material, env + line uniforms)
js/maps.js (MAPS[]: lake, sea) | js/sources.js (SourceManager) | js/balls.js (3D balls) | js/labels.js (S1..S4 tags in 3D)
js/lines.js (interference lines state, shared by 3D and 2D) | js/view2d.js (analytic 2D canvas) | js/pointer.js (drops, source dragging)
js/ui/strings.js (all Vietnamese text) | js/ui/errors.js | js/ui/ui.js (settings panel) | js/ui/chrome.js (title, footer, bottom row) | js/ui/icons.js | js/ui/hud.js (fps, f / lambda readout) | js/ui/keys.js | js/ui/toolbar.js | js/ui/tuning.js | js/quality.js

## Views (setting `view`)
- `lake` "Mặt hồ" (default): overcast lake, MAPS[0]. `sea` "Mặt biển": turquoise sea over sand, MAPS[1]. Switching 3D views crossfades the parameters.
- `2d` "2D": analytic top view (below). While active the WebGL sim is neither stepped nor drawn; the sim clock (sim.time) still advances and sources keep their state. Back in 3D, SourceManager.rebase() shifts phases and pattern clocks by the time spent in 2D, so the frozen 3D field continues seamlessly.
- Key M cycles lake -> sea -> 2d. Old saved `mapIndex` migrates: 1 -> sea, anything else -> lake.

## World, camera and full-screen water (js/framing.js)
- Units: surface y = 0, +y up. Camera: perspective fov 50 (vertical), looks at the origin, pitch 50-90 deg (slider; 90 = straight down). Below 50 deg the far edge recedes too fast for the sources to fit near the screen edge; the horizon would appear below 25 deg.
- For the current window size and pitch, the exact ground footprint of the view (a trapezoid; screen rows map to lines of constant z) is computed. The camera height H is chosen so that the footprint's bounding box padded by 1.5 units on every side has area SIM_AREA = 256 units^2 (same cell count as the old 16 x 16 tank). That padded box is the simulated domain, so water covers the whole viewport at any aspect ratio, the absorbing border is off screen and the canvas is never boxed. Recomputed on resize and pitch change.
- 2D view: same scale as the 3D view at the screen centre (orthographic equivalent), centred on the origin, screen up = -z.
- Sources may only be where they are on screen in every view: inside the 3D view and the 2D rectangle, at least max(36 px, 7% of the short screen side) from the edges (Framing.inside / clamp).

## Water simulation (GPU height field, js/water/sim.js)
- Damped 2D wave equation, ping-pong render targets storing (h, hPrev), rectangular grid nx x nz of square cells. Fixed timestep 1/120 s with accumulator (max 3 substeps/frame). CFL: c*dt/dx <= 0.4; warn in console if violated.
- Cell size = 16 / simRes (simRes 384 / 512 / 768 by quality). lambda = c / f exactly (c = 0.8 u/s, dispersion cancelled at the mean source frequency). f 0.8-2.4 Hz keeps lambda >= 8 cells at every quality (0.8 / 2.4 / (16 / 384) = 8).
- Domain origin snapped to whole cells; setDomain / setCellSize reallocate and resample the waves by world position (exact texel shift when only the domain moves). Sponge 1.2 world units on each border, always off screen.
- API: `new WaterSim(renderer, {cell, domain})`, `step(dt, emitters)`, `advanceTime(dt)` (clock only), `heightTexture`, `domainUniform` (minX, minZ, sizeX, sizeZ), `texel`, `nx`, `nz`, `setDomain(d)`, `setCellSize(c)`, `reset()`, `time`, `renderTime`.
- Emitter = {x,z,radius,mode:'sine'|'impulse',amp,freq,phase}. sine: h += amp*sin(2 pi f t + phase)*G(r) each step; amplitude ramped from 0 over 1.2 s after a layout change. impulse: one-step displacement (mouse drops). G = Gaussian, sigma = max(radius*0.6, 2 cells).

## Sources (js/sources.js) and balls
- Names S1..S4 everywhere (index 0..3). Count N in {1,2,4}. Layouts: "hang" (row along x, centred, spacing setting) and "vuong" (square, 4 only). The layout is shrunk towards the centre until every source is on screen (any aspect ratio, portrait phones included).
- Frequency: linked by default (`frequency` drives all). `perSourceFreq` on: `sourceFreqs[i]` drives source i (same 0.8-2.4 Hz range); switching it on copies the linked value to all four. Frequency changes keep each phase continuous.
- Initial phase per source `phases[i]` (0-360 deg, step 5, default 0), emitter sin(2 pi f_i t + phi_i); balls and 2D crests use the same phase. Smoothed at pi rad/s by the shortest way round; the source's pattern clock restarts while it moves. Old saved phaseOffset maps to phases[1], phases[3].
- Move mode (`moveMode`, key D, default off): hover highlights a source (ball glow / larger 2D marker, grab cursor); mouse or touch drag moves it freely, clamped to the allowed area, at least 1 unit (MIN_GAP) from other sources. Works in all views; ball, emitter, label and lines follow instantly. For N = 2 the spacing setting follows the dragged distance (clamped to 1-8). Move mode off: click/drag on the water makes drops (3D views only).
- Changing count, layout or spacing resets positions to the layout; action resetPositions ("Đặt lại vị trí") does the same.
- Each source keeps `start[i]` (when its current wave pattern began: start, move, frequency or phase change, count change, clear waves, resume) and `stop[i]` (pause time, Infinity while running).
- Balls: fixed radius 0.45, fixed leaf green #4FB36B (BALL_HEX in config.js), bob in sync with their emitter, partly submerged, tinted by water below the surface. S1..S4 tags above them (js/labels.js).

## Interference lines (js/lines.js; settings showMaxima "Cực đại", showMinima "Cực tiểu", default off)
- Only with exactly 2 sources of equal frequency; otherwise nothing is drawn and the panel shows "Cần đúng 2 nguồn cùng tần số".
- Maxima: solid warm amber #F2B544. Minima: dashed light cyan #8FDDF2. Thin, thin dark casing, no glow. Same colours in 3D and 2D.
- Shown only where the pattern is stable: around source i the stable radius is v*(t - start[i]) - lambda; a point is drawn when r1 and r2 are both inside, fading in over 1 s of wavefront travel, so lines grow outward after any change. Hidden while paused. Kept clear of the balls (0.6 units).
- 3D: LINES define in the water shader (compiled when either toggle is on); exact per-fragment test on the displaced surface, so the lines lie on the simulated dark and bright bands for any source positions. 2D: exact hyperbola branches r2 - r1 = delta, parametrised X = -(delta/2) cosh s, Y = b sinh s.

## 2D view (js/view2d.js)
Own canvas, full viewport, device-pixel-ratio sharp. Flat near-black background (#0A0D11), faint square grid (`show2dGrid`, round world spacing >= 40 px), white crest circles (solid) and trough circles (`show2dTroughs`, dashed, dimmer), alpha falling with 1/sqrt(r). Crests of source i: r = v (t - t_n), t_n = (n + 1/4 - phi_i / 2 pi) / f_i for start[i] <= t_n <= min(t, stop[i]); troughs at n + 3/4. Muted red dashed S1-S2 line for N = 2. Markers: BALL_HEX dots with white ring and S1..S4 labels. Analytic only (no GPU readback); same v, f, phase, positions and clock as the sim.

## Rendering look (3D, match ref/ref.png)
- Normals from height texture gradient with strength uniform. Schlick Fresnel (F0 0.02), procedural sky reflection (gradient + glare patch + soft clouds; no image files), sun glints, depth colour absorption, refraction look (subsurface tint + optional sandy floor), foam from curvature, ACES tone mapping. ~20-30 crests across the view at 2 Hz.

## Settings (config.js keys, persisted unless noted)
quality(auto|low|medium|high), simRes(384|512|768), reflection, refraction, foam, sourceCount(1|2|4), layout(hang|vuong), spacing(1-8), frequency(0.8-2.4), perSourceFreq(bool), sourceFreqs([4] 0.8-2.4), amplitude(0.002-0.03), phases([4] 0-360), sourcesRunning, view(lake|sea|2d), cameraPitch(50-90), showFps, moveMode (not persisted, always starts off), showMaxima, showMinima, show2dTroughs, show2dGrid.
Removed: mapIndex (migrated to view), ballSize, showOverlay. Unknown or invalid values fall back to defaults.
Quality presets: low = cell 16/384, pixelRatio 1, no refraction/foam; medium = 16/512, pixelRatio<=1.25; high = 16/768, pixelRatio<=1.5, all effects.
Auto: rolling average over 2 s; <50 fps -> one level down; >58 fps for 6 s -> one level up; cooldown 4 s; never oscillate. Measured in the 3D views only.

## Shortcuts
1, 2, 4 balls | L layout | Space pause sources | M next view | D move mode | F fps | T tuning panel | H hide UI | Esc leave presentation / close panel

## Errors (Vietnamese, on screen, never a blank page)
No WebGL2; float render target unsupported (fallback or message); shader compile error (show log); uncaught errors with copy button.
