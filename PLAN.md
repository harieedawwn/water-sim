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
Next: done
P7 [x] glass title (left of centre) + school name top right above the HUD; paper sample 0.41x; envelope-contour lines for 3-4 equal-frequency sources (3D shader + cached 2D marching squares); first-visit guided tour (js/ui/tour.js, key ripple.tour.v1).
P8 [x] white glass title lower-left (school text above it in every layout), HUD/tray lower, compact 2-item tray; default layouts shifted 5% left; interference lines reach the balls/markers (chained 2D contours); Dừng hình freeze (key P); rubber duck sample on a shared Sample base (js/sample.js, js/duck.js); trash bin (js/ui/bin.js). Checked: node --check, headless loads 1920x1080 / 800x450 / 390x844, freeze frames identical. Not run: real GPU frame rate, touch drag, bin animation at full fps.
