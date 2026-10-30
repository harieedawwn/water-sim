// Bootstrap, render loop and glue.
import * as THREE from 'three';
import { STR } from './ui/strings.js';
import { showError, installShaderErrorHook } from './ui/errors.js';
import { loadSettings, saveSettings, sanitize, WORLD_HALF, WAVE_SPEED } from './config.js';
import { WaterSim } from './water/sim.js';
import { WaterSurface } from './water/surface.js';
import { MAPS, MapBlender } from './maps.js';
import { SourceManager } from './sources.js';
import { Balls } from './balls.js';
import { QualityController } from './quality.js';
import { createToolbar } from './ui/toolbar.js';
import { createSettingsPanel } from './ui/ui.js';
import { createHud, nodalLines } from './ui/hud.js';
import { createTuningPanel } from './ui/tuning.js';
import { installKeys } from './ui/keys.js';

const CAMERA_DISTANCE = 11;
const CAMERA_FOV = 50;
const DROP_INTERVAL = 0.05;   // s between drops while dragging
const DROP_LIMIT = WORLD_HALF * 0.88;
const HINT_SECONDS = 2.5;

window.__rippleStarted = true;   // tells the static fallback in index.html that scripts run

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

function start() {
  document.title = STR.appTitle;
  if (!hasWebGL2()) {
    showError(STR.err.noWebGL2Title, STR.err.noWebGL2, STR.err.noWebGL2Hint);
    return;
  }

  const settings = loadSettings();
  settings.mapIndex = Math.min(settings.mapIndex, MAPS.length - 1);

  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  installShaderErrorHook(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  let sim;
  try {
    sim = new WaterSim(renderer, { res: settings.simRes });
  } catch (e) {
    if (e.code === 'NO_FLOAT_RT') {
      showError(STR.err.floatTitle, STR.err.float, STR.err.floatHint);
      renderer.dispose();
      return;
    }
    throw e;
  }

  const blender = new MapBlender(settings.mapIndex);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.05, 200);
  function placeCamera() {
    const p = THREE.MathUtils.degToRad(Math.min(settings.cameraPitch, 89.9));
    camera.position.set(0, CAMERA_DISTANCE * Math.sin(p), CAMERA_DISTANCE * Math.cos(p));
    camera.lookAt(0, 0, 0);
  }
  placeCamera();

  const surface = new WaterSurface();
  scene.add(surface.mesh);
  const sources = new SourceManager(sim);
  sources.apply(settings);
  const balls = new Balls(scene);

  function applyEnvironment() {
    const p = blender.current;
    surface.applyMap(p);
    balls.applyMap(p);
    scene.background.setRGB(p.background[0], p.background[1], p.background[2]);
  }
  blender.update(0);
  applyEnvironment();

  // ---- UI ----
  const uiRoot = document.getElementById('ui');
  const hud = createHud(uiRoot);
  const ui = { settingsOpen: false, presenting: false };
  let panel = null;
  let toolbar = null;
  let tuning = null;
  let quality = null;

  const overlayOn = () => settings.showOverlay && settings.sourceCount === 2;

  function applyFeatures() {
    const step = quality ? quality.current : { refraction: true, foam: true };
    surface.setFeatures({
      reflection: settings.reflection,
      refraction: settings.refraction && step.refraction,
      foam: settings.foam && step.foam,
      overlay: overlayOn(),
    });
  }

  function applyPixelRatio(pr) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pr));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  // Readout values (also shown in the Lý thuyết tab).
  const readout = { f: 0, lambda: 0, d: null, nodal: null };
  const qualityInfo = { level: 'medium', simRes: 512, pixelRatio: 1 };
  function refreshInfo() {
    readout.f = settings.frequency;
    readout.lambda = WAVE_SPEED / settings.frequency;
    const p = sources.positions;
    readout.d = sources.count >= 2 ? Math.hypot(p[2] - p[0], p[3] - p[1]) : null;
    readout.nodal = sources.count === 2 && settings.phaseOffset === 0 ? nodalLines(readout.d, readout.lambda) : null;
    hud.setReadout(readout);
    if (quality) {
      const s = quality.current;
      qualityInfo.level = s.level;
      qualityInfo.simRes = sim.res;
      qualityInfo.pixelRatio = renderer.getPixelRatio();
    }
    if (panel) panel.setInfo(qualityInfo, readout);
  }

  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveSettings(settings), 300);
  }

  quality = new QualityController(settings.quality, (step) => {
    applyPixelRatio(step.pixelRatio);
    sim.setResolution(step.simRes);
    settings.simRes = step.simRes;
    applyFeatures();
    if (panel) {
      refreshInfo();
      panel.sync();
    }
  }, (step) => `${Math.min(window.devicePixelRatio || 1, step.pixelRatio)}|${step.simRes}|${step.refraction}|${step.foam}`);

  function syncUi() {
    if (panel) panel.sync();
    if (toolbar) toolbar.sync(ui);
    hud.setFpsVisible(settings.showFps);
    refreshInfo();
  }

  function onChange(key) {
    sources.apply(settings);
    switch (key) {
      case 'cameraPitch': placeCamera(); break;
      case 'mapIndex': blender.setIndex(settings.mapIndex); if (tuning) tuning.sync(); break;
      case 'quality': quality.setMode(settings.quality, performance.now() / 1000); break;
      default: break;
    }
    applyFeatures();
    syncUi();
    scheduleSave();
  }

  function resetDefaults() {
    Object.assign(settings, sanitize(null));
    sources.apply(settings);
    placeCamera();
    blender.setIndex(settings.mapIndex);
    if (tuning) tuning.sync();
    quality.setMode(settings.quality, performance.now() / 1000);
    applyFeatures();
    syncUi();
    scheduleSave();
  }

  function setSettingsOpen(open) {
    ui.settingsOpen = open;
    panel.setOpen(open);
    toolbar.sync(ui);
  }

  const hint = document.createElement('div');
  hint.className = 'present-hint glass';
  hint.textContent = STR.toolbar.presentHint;
  uiRoot.append(hint);
  let hintTimer = 0;

  function setPresenting(on) {
    ui.presenting = on;
    document.body.classList.toggle('presenting', on);
    clearTimeout(hintTimer);
    hint.classList.toggle('is-visible', on);
    if (on) hintTimer = setTimeout(() => hint.classList.remove('is-visible'), HINT_SECONDS * 1000);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function toggleFullscreen() {
    const req = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    if (req && req.catch) req.catch(() => { /* refused by the browser: nothing to do */ });
  }
  document.addEventListener('fullscreenchange', () => toolbar.sync(ui));

  const setCount = (n) => { settings.sourceCount = n; onChange('sourceCount'); };
  const toggleRunning = () => { settings.sourcesRunning = !settings.sourcesRunning; onChange('sourcesRunning'); };

  toolbar = createToolbar(uiRoot, settings, {
    setCount,
    toggleRunning,
    clearWaves: () => sim.reset(),
    toggleSettings: () => setSettingsOpen(!ui.settingsOpen),
    togglePresentation: () => setPresenting(!ui.presenting),
    toggleFullscreen,
  });
  panel = createSettingsPanel(uiRoot, settings, MAPS, {
    onChange,
    resetDefaults,
    close: () => setSettingsOpen(false),
  });
  tuning = createTuningPanel(uiRoot, blender);

  installKeys({
    setCount,
    toggleRunning,
    toggleLayout: () => { settings.layout = settings.layout === 'hang' ? 'vuong' : 'hang'; onChange('layout'); },
    nextMap: () => { settings.mapIndex = (settings.mapIndex + 1) % MAPS.length; onChange('mapIndex'); },
    toggleOverlay: () => { settings.showOverlay = !settings.showOverlay; onChange('showOverlay'); },
    toggleFps: () => { settings.showFps = !settings.showFps; onChange('showFps'); },
    toggleTuning: () => tuning.toggle(),
    togglePresentation: () => setPresenting(!ui.presenting),
    escape: () => {
      if (ui.presenting) setPresenting(false);
      else if (ui.settingsOpen) setSettingsOpen(false);
    },
  });

  applyFeatures();
  syncUi();

  // ---- Mouse drops on the water ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let dragging = false;
  let dropTimer = 0;
  let pointerX = 0;
  let pointerY = 0;

  function dropAtPointer() {
    ndc.set((pointerX / window.innerWidth) * 2 - 1, -(pointerY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(waterPlane, hit)) return;
    if (Math.abs(hit.x) < DROP_LIMIT && Math.abs(hit.z) < DROP_LIMIT) sources.addDrop(hit.x, hit.z);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    pointerX = e.clientX;
    pointerY = e.clientY;
    dropTimer = 0;
    dropAtPointer();
  });
  canvas.addEventListener('pointermove', (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    applyPixelRatio(quality.current.pixelRatio);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
    showError(STR.err.contextLost, STR.err.contextLostDetail, STR.err.contextLostHint);
  });

  // ---- Loop ----
  let last = -1;
  let hudTimer = 0;
  function frame(now) {
    try {
      const dt = last < 0 ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      quality.update(now / 1000);
      if (dragging) {
        dropTimer += dt;
        if (dropTimer >= DROP_INTERVAL) {
          dropTimer = 0;
          dropAtPointer();
        }
      }
      if (blender.update(dt)) applyEnvironment();
      const emitters = sources.update(dt);
      sources.afterStep(sim.step(dt, emitters));
      balls.update(sim, sources);
      surface.update(sim, sim.renderTime, balls);
      if (overlayOn()) {
        const p = sources.positions;
        surface.setOverlay(p[0], p[1], p[2], p[3], WAVE_SPEED / settings.frequency, sources.phaseOffset);
      }
      hudTimer += dt;
      if (settings.showFps && hudTimer > 0.5) {
        hudTimer = 0;
        hud.setFps(quality.meter.fps, STR.panel.qualityNames[quality.current.level]);
      }
      renderer.render(scene, camera);
    } catch (err) {
      renderer.setAnimationLoop(null);
      showError(STR.err.loop, err);
    }
  }
  renderer.setAnimationLoop(frame);
}

try {
  start();
} catch (e) {
  showError(STR.err.startup, e);
}
