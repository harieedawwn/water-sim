# PLAN (update at the end of each stage; no git, back up the folder first)
Stages (each = one session, /clear between):
- [x] P1 Core: GPU wave sim + shader v1 + auto-running sources (1/2/4 bobbing balls) + mouse drops + error overlay
- [x] P2 Photoreal shading to match ref/ref.png + 4 maps + live tuning panel
- [x] P3 Vietnamese settings UI + persistence + adaptive quality + FPS + theory overlay/readout + shortcuts
- [x] P4 Independent review + fixes
- [x] P5 Engine + features: full-screen water (screen-sized sim domain), 3 views (Mặt hồ, Mặt biển, 2D), move mode, per-source frequency, fixed ball look, interference maxima/minima lines (3D + 2D), analytic 2D view
- [x] P6 Visual UI redesign: flat dark UI, title + footer plates, f/lambda readout, grouped settings (side panel / phone bottom sheet), chrome.js + icons.js
Decisions: three.js core, GPU height-field, no camera/hand tracking, assets vendored, sources 1/2/4.
P1 notes: c = 0.8 u/s, f 0.8-2.4 Hz (lambda >= 8 cells at 384), dt 1/120, 9-point Laplacian, c_num corrected so lambda = c/f;
emitter gain normalised so "amplitude" = wave amplitude at r = 1. Temporary debug panel lives in js/ui/ui.js.
P2 notes: water shader defines REFRACTION / FOAM / CHEAP_SKY (settings refraction / foam / reflection; Low = none);
water is opaque except where the view ray hits a submerged ball; maps crossfade via MapBlender (js/maps.js);
tuning panel js/ui/tuning.js (key T). Checked in the in-app browser: 4 maps + Low build compile, no console errors.
Open: fps not measured (browser pane was throttled); fine look tuning via T panel.
P3 notes: SPEC has no "UI/UX" section; UI follows the P3 prompt (toolbar.js, ui.js tabs, hud.js, keys.js, quality.js).
Quality ladder low < medium@pr1 < medium < high@pr1.25 < high (pixel ratio before sim res); setResolution resamples waves.
Overlay = OVERLAY define; CPU check: matches simulated nodal lines within 0.5 deg at 90 deg phase offset.
P4 review: 0 blocker, 1 high (Space swallowed by mouse-focused panel controls; fixed in keys.js).
Open medium: toolbar blur() drops keyboard focus; presentation hides UI by opacity (still tabbable);
file:// fallback lacks background and is not hidden by main.js; param changes smoothed instead of re-ramped.
Open low: setResolution failure drops old targets; SPEC nodal formula counts axis lines at half-integer d/lambda; fps unmeasured on hardware.
P5 notes: sunset / moon scenes and the Lý thuyết tab + nodal overlay (key O) removed. Sim domain = view footprint + 1.5 u
margin, area 256 u^2 (framing.js); pitch narrowed to 50-90. Lines use dphi = phi2 - phi1 (offset on S2); the prompt's formula had
the opposite sign convention. Checked: node --check on every changed file; one load in the in-app browser (800x600): no console
error in lake, sea, 2D; water edge to edge, lines on the bands. Not run: phone/portrait, touch drag, fps on hardware.
Open: 2D crest circles use "crest leaves the source at the ball's top"; the sim's far-field crest lags that by ~lambda/8
(2D Green's function phase). 2D drops are not drawn (clicks do nothing in 2D unless move mode). Positions are not persisted.

## Contract for P6 (the UI must use exactly these)
Settings keys (config.js, `settings[key] = v; actions.onChange(key)`):
quality, reflection, refraction, foam, sourceCount, layout, spacing, frequency, perSourceFreq, sourceFreqs (array of 4; onChange('sourceFreqs')),
amplitude, phases (array of 4 initial phases in degrees, 0-360 step 5; onChange('phases')), sourcesRunning, view ('lake'|'sea'|'2d'), cameraPitch, showFps, moveMode, showMaxima, showMinima, show2dTroughs, show2dGrid.
(simRes is written by the quality controller, not by the UI.) Limits: LIMITS in config.js; VIEWS order = M-key cycle.
Actions (main.js): setCount(n), toggleRunning(), clearWaves(), setView(id), nextView(), toggleMoveMode(), resetPositions(),
toggleLayout(), toggleFps(), toggleTuning(), togglePresentation(), toggleFullscreen(), toggleSettings(), resetDefaults(), escape(), onChange(key).
Derived state: linesAvailable(settings) (ui.js) -> show STR.panel.linesNeed when false; hud.setReadout({f, lambda, d|null, nodal|null});
panel.setInfo({level, nx, nz, pixelRatio}).
Strings (js/ui/strings.js): STR.views.{lake, sea, twoD}; STR.sourceName(i); STR.panel.{view, tipView, pitch, tipPitch, troughs2d, grid2d,
frequency, tipFrequency, perSourceFreq, tipPerSourceFreq, freqOf(i), tipFreqOf, amplitude, tipAmplitude, spacing, tipSpacing,
phase, phaseOf(i), phaseHint, tipPhase, layout, layoutHang, layoutVuong, tipLayout, moveMode, tipMoveMode, resetPositions, tipResetPositions,
maxima, tipMaxima, minima, tipMinima, linesNeed, quality, qualityNames, tipQuality, current(level, nx, nz, pr), reflection, refraction,
foam, lowNote, showFps, reset, tipReset, keys, tabs, title, close}; STR.toolbar.*; STR.readout.*; STR.units.*.
phaseOffset was replaced by phases[]: an old saved phaseOffset maps to phases[1] and phases[3]. Panel: segmented S1..SN + slider + chips (ui.js phaseSection).
Colours fixed by the engine (do not restyle): BALL_HEX, LINE_COLORS (lines.js), 2D palette (view2d.js).
P6 notes: no tabs any more (one scrolling panel, collapsed "Nâng cao"); view picker is a segmented control; createSettingsPanel(container, settings, actions) has no maps arg;
readout shows only f and lambda (one pair, or one line per source when frequencies differ); .glass renamed .plate (flat, no blur). Checked: node --check, one load at 1280x720 and 390x844 (settings open), no console errors.
Not run: phone landscape, real touch drag, tuning panel / error overlay visual check, projector contrast.
Next: done (P9 physics pass below)
P7 [x] glass title (left of centre) + school name top right above the HUD; paper sample 0.41x; envelope-contour lines for 3-4 equal-frequency sources (3D shader + cached 2D marching squares); first-visit guided tour (js/ui/tour.js, key ripple.tour.v1).
P8 [x] white glass title lower-left (school text above it in every layout), HUD/tray lower, compact 2-item tray; default layouts shifted 5% left; interference lines reach the balls/markers (chained 2D contours); Dừng hình freeze (key P); rubber duck sample on a shared Sample base (js/sample.js, js/duck.js); trash bin (js/ui/bin.js). Checked: node --check, headless loads 1920x1080 / 800x450 / 390x844, freeze frames identical. Not run: real GPU frame rate, touch drag, bin animation at full fps.
P9 [x] Physics pass (textbook model first: Vật lí 11 KNTT Bài 8, 12). Branch physics-p9, one commit per item.
- F1 PML absorbing border (Grote & Sim), 1.0 u per side, aux fields in B/A; old sponge removed. F3 4th-order cross Laplacian (still 9 fetches) and one c_num per cell size (minimax 0.8-2.4 Hz, all directions; setDriveFrequency removed); state = (h, h - hPrev, psi_x, psi_z). Code: js/water/scheme.js (new), sim.js, shaders.js.
- F2 emitter phase lead pi/4 (2D Green's function); emitter Gaussian floor 1.3 cells (same near field on every preset). F4 equal-frequency sources glide their phase bases to a common value; one clock sources.time = sim.time (emitters, balls, lines, 2D, rebase). F5 crest history ring buffer (js/crests.js), 2D rings r = v (t - t_emit) around the emission point.
- F6 half float: state stores h - hPrev (accurate velocity); forced HalfFloat path tested (replica with IEEE round-to-nearest, matches SwiftShader GPU). F7 lines.js / LINES unchanged (formula and sign were right); samples bob with the local height (no drift); drops are linear impulses absorbed by the PML.
Audit (offline, outside the deploy folder: tools/replica.mjs = line-by-line copy of SIM_FRAG + WaterSim, drives the real scheme.js / sources.js / lines.js / crests.js; GPU float32 state = replica within 2e-6 after 600 steps):
T1 lambda error <= 0.19 % (all f, axis + diagonal, presets 320/384/512/768, pairs (0.8, 2.4) and (1.5, 2.0) together; was -0.8 % desktop, -2.2 % phone). T2 phase vs 2 pi f t + phi - k r: <= 3.5 deg at lambda/2 .. 5 lambda (was -44 deg). T3 a(1) = 0.99-1.02 x setting, a sqrt(r) law within 1 %. T4 reflection <= 0.26 % normal / 45 deg / corner at 0.8-2.4 Hz (was 73 % / 32 % / 5 %). T5 extrema vs exact continuous two-source field <= 0.7 cell (57 cases, dphi 0/45/90/180/270/355, d 1/2.4/5, f 0.8/2/2.4); vs bare hyperbola <= 2.3 cells (minima) / 2.8 (maxima), the physical shift from unequal 1/sqrt(r) amplitudes. T6 spacing on S1S2 = lambda/2 x (0.994-1.028); dphi 0 bisector = maximum, dphi 180 = minimum (0.000 when the midpoint is a cell centre). T7 different f: amplitude map changes 76 % in 2.5 s, lines off. T8 front within 0.09 lambda of v (t - t0). T9 2D rings vs simulated crests <= 0.04 lambda (after phase, f, drag, pause, 2D -> 3D). T10 phase difference after 20 random per-source f changes: 0.03 deg (was up to 162 deg). T11 half float: lambda 0.19 %, phase 4.1 deg, T5 0.7 cell, reflection 1.5 % (corner, phone, 0.8 Hz; float: 0.26 %). T0 300 s run stable, decays after sources off.
T12 performance: not measurable on a real GPU here. SwiftShader (CPU) sim pass +5-15 % per substep (texel count unchanged, extra ALU only in the 1 u border band); whole-frame median old/new within noise (low 383/383 ms, medium 450/450, high 500/500). Check with the F key on the target laptop.
Checked in headless Chromium: 5 setting combos (LINES, REFRACTION, FOAM, CHEAP_SKY, 4 sources, per-source f) x 3 views x float / forced half float: no shader error, no console error.
Open: half-float reflection 1.5 % in the phone corner case (float is fine); T12 on real hardware; GPUs that truncate float -> half would lose ~7 % amplitude per few seconds (SwiftShader rounds to nearest). The lambda/8 2D offset from P5 is closed.
