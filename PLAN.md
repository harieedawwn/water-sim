# PLAN (update + commit at the end of each stage)
Stages (each = one session, /clear between):
- [x] P1 Core: GPU wave sim + shader v1 + auto-running sources (1/2/4 bobbing balls) + mouse drops + error overlay
- [x] P2 Photoreal shading to match ref/ref.png + 4 maps + live tuning panel
- [x] P3 Vietnamese settings UI + persistence + adaptive quality + FPS + theory overlay/readout + shortcuts
- [x] P4 Independent review + fixes
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
Next: done
