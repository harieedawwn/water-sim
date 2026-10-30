# Ripple Tank 3D (self-running water interference simulator) - worker rules
Static web app, no build, no server code, no camera, no hand tracking. Final output = this folder, uploaded to GitHub Pages / Netlify.
Source of truth: SPEC.md (design + contracts). Progress: PLAN.md. Reference look: ref/ref.png.

## Run / test
- Local: `python -m http.server 8000` (or `py -m http.server 8000`), open http://localhost:8000 (file:// breaks ES modules).
- No browser is available to you. Check JS syntax by copying each file to a temp .mjs and running `node --check` if node exists. The app has an on-screen error overlay; the user reports errors from it.

## Rules
- Offline only: three.js r160 core is already in vendor/three/three.module.js. Never fetch from the network, never add CDN links, never npm install.
- Only three core (no addons). WebGL2. ES modules + import map. Relative paths only (no leading slash).
- All user-visible text is Vietnamese and lives in js/ui/strings.js. Code comments in English.
- Small modules, one responsibility each (see SPEC.md folder map). Do not merge them into main.js.
- No per-frame allocations, no GPU readbacks (readPixels/getImageData) in the render loop.

## Working rules (apply to every task)
- Write files in priority order: core first, polish last, optional items last. Save each file fully to disk before starting the next. The app must load without errors after each milestone, even if later features are stubbed.
- Commit after each milestone ("P<n>: ..."), then tick PLAN.md. If budget runs out, the files on disk and the last commit are the deliverable.
- Never print whole files to the console; read only the parts you need; do not re-read large files.
- Do not add features, files, tests or docs that were not asked for; mention good ideas in one line.
- Confirm before destructive steps (deleting files, force push, overwriting user data).
- When compacting, keep: list of modified files, current stage, open issues.
