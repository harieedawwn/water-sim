# SPEC - Ripple Tank 3D, self-running interference simulator
Goal: browser app (laptop + projector in class, Chrome/Edge; also phones in portrait) showing interfering water waves. 1, 2 or 4 green balls bob up and down on their own and make circular waves, like a real ripple tank. Three views: two photoreal 3D water scenes and an analytic 2D top view. Physically accurate, 60 fps on a modest laptop. No camera, no hand tracking. 3D look target: ref/ref.png (real photo: dark blue water, long bright sky-reflection bands on crests, dark troughs, honeycomb interference cells, green ball).

## Experiment (physics the app must reproduce; textbook model wins over "real water")
Vật lí 11 KNTT, Bài 8 (Mô tả sóng) and Bài 12 (Giao thoa sóng).
- Point source i oscillates vertically: u_Si(t) = A sin(2 pi f_i t + phi_i), phi_i = `phases[i]`.
- Wave at M, distance r: u_i(M, t) = a(r) sin(2 pi f_i t + phi_i - 2 pi r / lambda_i) once the front r = v (t - t_start) has passed; still water before. M lags the source by exactly 2 pi r / lambda (in phase at r = lambda, opposite at lambda / 2), no extra offset.
- lambda = v / f; v = WAVE_SPEED = 0.8 u/s for every f in 0.8-2.4 Hz, every quality preset, also when two sources run at different frequencies (v depends on the medium only).
- a(r) ~ 1 / sqrt(r) (circular spreading) times a small friction decay (~1.8 %/s); a(1 u) = the `amplitude` setting.
- Superposition is linear. Two coherent sources (same f, constant dphi = phi2 - phi1):
  maxima r2 - r1 = (k + dphi / 2 pi) lambda, minima r2 - r1 = (k + 1/2 + dphi / 2 pi) lambda, only |r2 - r1| < d (d = S1S2);
  dphi = 0: bisector = maximum; dphi = pi: bisector = minimum; on S1S2 consecutive maxima are lambda / 2 apart.
  Equal amplitudes: maxima ~ a1 + a2, minima ~ |a1 - a2| (only "nearly still" away from the bisector, as in a real tank).
  Different phases with a constant difference still interfere (the pattern shifts); different frequencies give no stationary pattern (no lines drawn).
- Waves carry energy, not matter: floating samples bob in place. Causality: pausing a source or changing f / phi leaves the waves already emitted travelling outward with their old wavelength.
- dphi = phases[1] - phases[0] (the central maximum bends towards S1 when dphi > 0). Some textbooks write the formula with dphi = phi1 - phi2; the sign above is the one the sim uses.

## Stack
- three.js r160 core: `import * as THREE from 'three'`, import map in index.html: {"imports":{"three":"./vendor/three/three.module.js"}}. No addons.
- WebGL2 required; float render targets (EXT_color_buffer_float) else half-float; else Vietnamese error.

## Folder map
index.html, css/style.css
js/main.js (bootstrap, loop, glue only) | js/config.js (defaults, limits, presets, load/save localStorage key "ripple.settings.v1")
js/framing.js (camera framing, sim domain, 2D mapping, area allowed for sources)
js/water/sim.js (WaterSim) | js/water/scheme.js (solver constants and coefficients, pure math) | js/water/shaders.js (GLSL strings) | js/water/surface.js (water mesh/material, env + line uniforms)
js/maps.js (MAPS[]: lake, sea) | js/sources.js (SourceManager) | js/balls.js (3D balls) | js/labels.js (S1..S4 tags in 3D)
js/lines.js (interference lines state, shared by 3D and 2D) | js/crests.js (crest history ring buffer for 2D) | js/view2d.js (analytic 2D canvas) | js/pointer.js (drops, source dragging)
js/ui/strings.js (all Vietnamese text) | js/ui/errors.js | js/ui/ui.js (settings panel) | js/ui/chrome.js (title, footer, bottom row) | js/ui/icons.js | js/ui/hud.js (fps, f / lambda readout) | js/ui/keys.js | js/ui/toolbar.js | js/ui/tuning.js | js/quality.js

## Views (setting `view`)
- `lake` "Mặt hồ" (default): overcast lake, MAPS[0]. `sea` "Mặt biển": turquoise sea over sand, MAPS[1]. Switching 3D views crossfades the parameters.
- `2d` "2D": analytic top view (below). While active the WebGL sim is neither stepped nor drawn; the sim clock (sim.time) still advances and sources keep their state. Back in 3D, SourceManager.rebase() shifts phases and pattern clocks by the time spent in 2D, so the frozen 3D field continues seamlessly; crest records emitted while in 2D are dropped and the others shifted, so 2D and 3D still match.
- Key M cycles lake -> sea -> 2d. Old saved `mapIndex` migrates: 1 -> sea, anything else -> lake.

## World, camera and full-screen water (js/framing.js)
- Units: surface y = 0, +y up. Camera: perspective fov 50 (vertical), looks at the origin, pitch 50-90 deg (slider; 90 = straight down). Below 50 deg the far edge recedes too fast for the sources to fit near the screen edge; the horizon would appear below 25 deg.
- For the current window size and pitch, the exact ground footprint of the view (a trapezoid; screen rows map to lines of constant z) is computed. The camera height H is chosen so that the footprint's bounding box padded by 1.5 units on every side has area SIM_AREA = 256 units^2 (same cell count as the old 16 x 16 tank). That padded box is the simulated domain, so water covers the whole viewport at any aspect ratio, the absorbing layer (PML, 1.0 unit) is off screen and the canvas is never boxed. Recomputed on resize and pitch change.
- 2D view: same scale as the 3D view at the screen centre (orthographic equivalent), centred on the origin, screen up = -z.
- Sources may only be where they are on screen in every view: inside the 3D view and the 2D rectangle, at least max(36 px, 7% of the short screen side) from the edges (Framing.inside / clamp).

## Water simulation (GPU height field, js/water/sim.js + js/water/scheme.js)
- Equation: u_tt + 2 g u_t = c^2 lap u (g = 0.018 /s friction: ~1.8 %/s decay), on a rectangular grid nx x nz of square cells; fixed timestep 1/120 s with accumulator (max 3 substeps/frame).
- Space: 4th-order cross Laplacian (-1, 16, -30, 16, -1) / 12 per axis (9 texel fetches, like the old 9-point stencil). Time: leapfrog, damping centred. CFL c dt / dx <= 0.5 (limit 0.61); warn in console if violated.
- One solver speed c_num per cell size (scheme.js numericSpeed: minimax of the discrete dispersion over 0.8-2.4 Hz and every direction), independent of the source frequencies: lambda = c / f within 0.2 % for every f, direction and preset (phone 320 included, 6.7 cells per lambda at 2.4 Hz), old and new waves alike. (The old "dispersion cancelled at the mean source frequency" is gone.)
- Absorbing border: PML of Grote & Sim (arXiv:1001.0319) for the second-order wave equation, 1.0 unit on each border (always off screen), damping zeta_max (s)^3, zeta_max from a design reflection 1e-4 at normal incidence:
  u_tt + (2 g + zx + zz) u_t + zx zz u = c^2 lap u + div psi; psi_x,t = -zx psi_x + c^2 (zz - zx) u_x (same for z).
  psi lives in the B / A channels at half steps; div psi at step n is the mean of n - 1/2 and n + 1/2 (the n + 1/2 values of the 4 neighbours are rebuilt from the fetched heights). Measured reflection <= 0.3 % at 0.8-2.4 Hz, normal, 45 deg and corner, every preset (was 73 % at 0.8 Hz with the old sponge).
- State texture: r = h^n, g = h^n - h^(n-1) (the step difference keeps the velocity accurate in half-float targets), b / a = psi_x, psi_z (scaled by dt^2 / dx). Surface, balls and samples read r only.
- Cell size = 16 / simRes (simRes 320 phone / 384 / 512 / 768 by quality).
- Domain origin snapped to whole cells; setDomain / setCellSize reallocate and resample the waves by world position (exact texel shift when only the domain moves; the PML fields restart at 0).
- API: `new WaterSim(renderer, {cell, domain})`, `step(dt, emitters)`, `advanceTime(dt)` (clock only), `heightTexture`, `domainUniform` (minX, minZ, sizeX, sizeZ), `texel`, `nx`, `nz`, `setDomain(d)`, `setCellSize(c)`, `reset()`, `time` (time of the state on screen: the clock of every wave-related visual), `renderTime` (time + accumulator, decorative animation only).
- Emitter = {x,z,radius,mode:'sine'|'impulse',amp,freq,phase}. sine: d += amp*sin(2 pi f t + phase + pi/4)*G(r) each step (t = sim.time before the substep). The pi/4 lead cancels the far-field lag of the 2D Green's function (i H0(kr) ~ e^{i(kr + pi/4)}), so the radiated wave is sin(2 pi f t + phase - k r) with t = sim.time of the state on screen: measured within 0.5 deg for r >= 2 lambda; nearer the exact Hankel phase adds +1/(8 k r) rad (+2.3 deg at lambda / 2). Amplitude ramped from 0 over 1.2 s after a layout change. impulse: one-step displacement (mouse drops). G = Gaussian, sigma = max(radius*0.6, 2 cells); gain (scheme.js sourceGain) makes a(1) = amp setting (2D Green's function, footprint spectrum, friction).

## Sources (js/sources.js) and balls
- Names S1..S4 everywhere (index 0..3). Count N in {1,2,4}. Layouts: "hang" (row along x, centred, spacing setting) and "vuong" (square, 4 only). The layout is shrunk towards the centre until every source is on screen (any aspect ratio, portrait phones included).
- Frequency: linked by default (`frequency` drives all). `perSourceFreq` on: `sourceFreqs[i]` drives source i (same 0.8-2.4 Hz range); switching it on copies the linked value to all four. Frequency changes keep each phase continuous.
- Initial phase per source `phases[i]` (0-360 deg, step 5, default 0), emitter sin(2 pi f_i t + phi_i); balls and 2D crests use the same phase. Smoothed at pi rad/s by the shortest way round; the source's pattern clock restarts while it moves. Old saved phaseOffset maps to phases[1], phases[3].
- Move mode (`moveMode`, key D, default off): hover highlights a source (ball glow / larger 2D marker, grab cursor); mouse or touch drag moves it freely, clamped to the allowed area, at least 1 unit (MIN_GAP) from other sources. Works in all views; ball, emitter, label and lines follow instantly. For N = 2 the spacing setting follows the dragged distance (clamped to 1-8). Move mode off: click/drag on the water makes drops (3D views only).
- Changing count, layout or spacing resets positions to the layout; action resetPositions ("Đặt lại vị trí") does the same.
- Each source keeps `start[i]` (when its current wave pattern began: start, move, frequency or phase change, count change, clear waves, resume) and `stop[i]` (pause time, Infinity while running).
- Phase accounting: phase of source i = phaseBase[i] + phi_i. A frequency change shifts phaseBase so the phase stays continuous; whenever sources have equal frequencies, their phaseBase glides (pi rad/s, no jump, pattern clock restarted) to the base of the first source with that frequency, so the true phase difference always equals phases[j] - phases[i] (measured within 0.1 deg after 20 random frequency changes).
- One clock: sources.time = sim.time (time of the water on screen) for emitters, balls, 2D crests, lines and every phase change.
- Balls: fixed radius 0.45, fixed leaf green #4FB36B (BALL_HEX in config.js), bob as sin(2 pi f t + phi) with t = sim.time, exactly the source phase of the emitted wave (water at r = lambda from the centre moves with the ball), partly submerged, tinted by water below the surface. S1..S4 tags above them (js/labels.js).

## Interference lines (js/lines.js; settings showMaxima "Cực đại", showMinima "Cực tiểu", default off)
- Only with exactly 2 sources of equal frequency; otherwise nothing is drawn and the panel shows "Cần đúng 2 nguồn cùng tần số".
- Maxima: solid warm amber #F2B544. Minima: dashed light cyan #8FDDF2. Thin, thin dark casing, no glow. Same colours in 3D and 2D.
- Shown only where the pattern is stable: around source i the stable radius is v*(t - start[i]) - lambda; a point is drawn when r1 and r2 are both inside, fading in over 1 s of wavefront travel, so lines grow outward after any change. Hidden while paused. Kept clear of the balls (0.6 units).
- 3D: LINES define in the water shader (compiled when either toggle is on); exact per-fragment test on the displaced surface, so the lines lie on the simulated dark and bright bands for any source positions. 2D: exact hyperbola branches r2 - r1 = delta, parametrised X = -(delta/2) cosh s, Y = b sinh s.

## 2D view (js/view2d.js)
Own canvas, full viewport, device-pixel-ratio sharp. Flat near-black background (#0A0D11), faint square grid (`show2dGrid`, round world spacing >= 40 px), white crest circles (solid) and trough circles (`show2dTroughs`, dashed, dimmer), alpha falling with 1/sqrt(r). Crest history (js/crests.js): every time an emitting source passes phase pi/2 (crest) or 3 pi/2 (trough), SourceManager.track() (called each frame after the clock advanced) stores time, position and f in a preallocated ring buffer (512 per source). Each record is drawn as r = v (t - t_emit) around the position at emission, so old rings keep travelling after phase / frequency changes, drags, pauses, count changes, exactly like the 3D water (measured: <= lambda/20 from the simulated crests). Clear waves clears the history. Muted red dashed S1-S2 line for N = 2. Markers: BALL_HEX dots with white ring and S1..S4 labels. Analytic only (no GPU readback); same v, phase, positions and clock as the sim.

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
