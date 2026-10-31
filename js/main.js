// Bootstrap, render loop and glue.
import * as THREE from 'three';
import { STR } from './ui/strings.js';
import { showError, installShaderErrorHook } from './ui/errors.js';
import { loadSettings, saveSettings, sanitize, BALL_RADIUS, WAVE_SPEED, WORLD_SIZE, LIMITS, VIEWS } from './config.js';
import { WaterSim } from './water/sim.js';
import { WaterSurface } from './water/surface.js';
import { MapBlender } from './maps.js';
import { SourceManager } from './sources.js';
import { Balls } from './balls.js';
import { Paper } from './paper.js';
import { Framing, CAMERA_FOV } from './framing.js';
import { InterferenceLines, LINE_COLORS } from './lines.js';
import { SourceLabels } from './labels.js';
import { View2D } from './view2d.js';
import { installPointer } from './pointer.js';
import { QualityController } from './quality.js';
import { createToolbar } from './ui/toolbar.js';
import { createSettingsPanel } from './ui/ui.js';
import { createHud } from './ui/hud.js';
import { createChrome } from './ui/chrome.js';
import { createTuningPanel } from './ui/tuning.js';
import { installKeys } from './ui/keys.js';

const HINT_SECONDS = 2.5;
const MAP_OF_VIEW = { lake: 0, sea: 1 };   // 3D views -> MAPS index

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
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  installShaderErrorHook(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.05, 200);
  const framing = new Framing(camera);
  framing.update(window.innerWidth, window.innerHeight, settings.cameraPitch);

  let sim;
  try {
    sim = new WaterSim(renderer, { cell: WORLD_SIZE / settings.simRes, domain: framing.domain });
  } catch (e) {
    if (e.code === 'NO_FLOAT_RT') {
      showError(STR.err.floatTitle, STR.err.float, STR.err.floatHint);
      renderer.dispose();
      return;
    }
    throw e;
  }

  const blender = new MapBlender(MAP_OF_VIEW[settings.view] ?? 0);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();

  const surface = new WaterSurface(sim, LINE_COLORS);
  scene.add(surface.mesh);
  const sources = new SourceManager(sim, framing);
  sources.apply(settings);
  const balls = new Balls(scene, sim);
  balls.radius = BALL_RADIUS * settings.ballSize;
  function applyBallColor() {
    balls.setColor(settings.ballColor);
    document.documentElement.style.setProperty('--ball-color', settings.ballColor);
  }
  applyBallColor();
  const paper = new Paper(scene, sources, framing, canvas);
  const lines = new InterferenceLines();
  const uiRoot = document.getElementById('ui');
  const labels = new SourceLabels(uiRoot);
  const view2d = new View2D(canvas);
  view2d.resize(framing.width, framing.height);

  function applyEnvironment() {
    const p = blender.current;
    surface.applyMap(p);
    balls.applyMap(p);
    scene.background.setRGB(p.background[0], p.background[1], p.background[2]);
  }
  blender.update(0);
  applyEnvironment();

  // ---- Views: the 2D view stops the GPU sim but keeps the clock and the sources running ----
  let in2d = false;
  let leftAt = 0;
  function applyView() {
    const want2d = settings.view === '2d';
    if (want2d && !in2d) {
      leftAt = sim.renderTime;
    } else if (!want2d && in2d) {
      sources.rebase(sim.renderTime - leftAt, leftAt);
      quality.meter.reset();
    }
    in2d = want2d;
    if (!want2d) blender.setIndex(MAP_OF_VIEW[settings.view]);
    view2d.setVisible(want2d);
    labels.setVisible(!want2d);
    paper.setShown(!want2d);
    if (pointer) pointer.refresh();
  }

  // ---- UI ----
  const hud = createHud(uiRoot);
  const ui = { settingsOpen: false, presenting: false, paperOn: false };
  let panel = null;
  let toolbar = null;
  let tuning = null;
  let quality = null;
  let pointer = null;

  const linesWanted = () => settings.showMaxima || settings.showMinima;

  function applyFeatures() {
    const step = quality ? quality.current : { refraction: true, foam: true };
    surface.setFeatures({
      reflection: settings.reflection,
      refraction: settings.refraction && step.refraction,
      foam: settings.foam && step.foam,
      lines: linesWanted(),
    });
  }

  function applyPixelRatio(pr) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pr));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  // Camera, simulated domain, 2D mapping and source positions follow the window and the view angle.
  function applyFraming() {
    framing.update(window.innerWidth, window.innerHeight, settings.cameraPitch);
    sim.setDomain(framing.domain);
    sources.refit();
    view2d.resize(framing.width, framing.height);
  }

  // HUD readout and quality info.
  const readout = { count: 0, freqs: sources.freqs };
  const qualityInfo = { level: 'medium', nx: 0, nz: 0, pixelRatio: 1 };
  function refreshInfo() {
    readout.count = sources.count;
    hud.setReadout(readout);
    if (quality && panel) {
      qualityInfo.level = quality.current.level;
      qualityInfo.nx = sim.nx;
      qualityInfo.nz = sim.nz;
      qualityInfo.pixelRatio = renderer.getPixelRatio();
      panel.setInfo(qualityInfo);
    }
  }

  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveSettings(settings), 300);
  }

  quality = new QualityController(settings.quality, (step) => {
    applyPixelRatio(step.pixelRatio);
    sim.setCellSize(WORLD_SIZE / step.simRes);
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
    // Unlinking the frequencies starts every source at the linked value, so nothing jumps.
    if (key === 'perSourceFreq' && settings.perSourceFreq) settings.sourceFreqs.fill(settings.frequency);
    sources.apply(settings);
    balls.radius = BALL_RADIUS * settings.ballSize;
    applyBallColor();
    switch (key) {
      case 'cameraPitch': applyFraming(); break;
      case 'view': applyView(); if (tuning) tuning.sync(); break;
      case 'quality': quality.setMode(settings.quality, performance.now() / 1000); break;
      case 'moveMode': pointer.refresh(); break;
      default: break;
    }
    applyFeatures();
    syncUi();
    scheduleSave();
  }

  function resetDefaults() {
    Object.assign(settings, sanitize(null));
    sources.apply(settings);
    balls.radius = BALL_RADIUS * settings.ballSize;
    applyBallColor();
    applyFraming();
    applyView();
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
  hint.className = 'present-hint plate';
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

  // Actions shared by the toolbar, the panel, the keys and the pointer (the P6 UI contract).
  const setCount = (n) => { settings.sourceCount = n; onChange('sourceCount'); };
  const toggleRunning = () => { settings.sourcesRunning = !settings.sourcesRunning; onChange('sourcesRunning'); };
  const setView = (id) => { settings.view = id; onChange('view'); };
  const nextView = () => setView(VIEWS[(VIEWS.indexOf(settings.view) + 1) % VIEWS.length]);
  const toggleMoveMode = () => { settings.moveMode = !settings.moveMode; onChange('moveMode'); };
  const clearWaves = () => {
    sim.reset();
    sources.restart();
  };
  const resetPositions = () => {
    sources.resetPositions();
    refreshInfo();
  };

  const bottomSlot = createChrome(uiRoot);
  toolbar = createToolbar(bottomSlot, settings, {
    setCount,
    toggleRunning,
    clearWaves,
    toggleSettings: () => setSettingsOpen(!ui.settingsOpen),
    togglePaper: () => { ui.paperOn = !ui.paperOn; paper.setOn(ui.paperOn); toolbar.sync(ui); },
    togglePresentation: () => setPresenting(!ui.presenting),
    toggleFullscreen,
  });
  panel = createSettingsPanel(uiRoot, settings, {
    onChange,
    setView,
    resetPositions,
    resetDefaults,
    close: () => setSettingsOpen(false),
  });
  tuning = createTuningPanel(uiRoot, blender);

  installKeys({
    setCount,
    toggleRunning,
    toggleLayout: () => { settings.layout = settings.layout === 'hang' ? 'vuong' : 'hang'; onChange('layout'); },
    nextView,
    toggleMoveMode,
    toggleFps: () => { settings.showFps = !settings.showFps; onChange('showFps'); },
    toggleTuning: () => tuning.toggle(),
    togglePresentation: () => setPresenting(!ui.presenting),
    escape: () => {
      if (ui.presenting) setPresenting(false);
      else if (ui.settingsOpen) setSettingsOpen(false);
    },
  });

  // ---- Pointer: drops, or dragging sources in move mode ----
  pointer = installPointer(canvas, framing, sources, () => ({ is2d: in2d, moveMode: settings.moveMode }), {
    drop: (x, z) => sources.addDrop(x, z),
    moveSource: (i, x, z) => {
      if (!sources.moveTo(i, x, z)) return;
      if (sources.count === 2) {
        // Keep the spacing slider in sync without re-applying the layout.
        const d = Math.round(sources.distance12 * 10) / 10;
        settings.spacing = Math.min(LIMITS.spacing.max, Math.max(LIMITS.spacing.min, d));
        sources.spacing = settings.spacing;
        if (ui.settingsOpen) panel.sync();
        scheduleSave();
      }
      refreshInfo();
    },
  });

  applyView();
  applyFeatures();
  syncUi();

  window.addEventListener('resize', () => {
    applyPixelRatio(quality.current.pixelRatio);
    applyFraming();
    refreshInfo();
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
      pointer.tick(dt);
      const emitters = sources.update(dt);
      if (in2d) {
        quality.meter.tick(now / 1000);   // FPS readout only; adaptive quality is for the 3D views
        sim.advanceTime(dt);
        lines.update(settings, sources);
        view2d.draw(framing, sources, lines, settings, pointer.hover);
      } else {
        quality.update(now / 1000);
        if (blender.update(dt)) applyEnvironment();
        sources.afterStep(sim.step(dt, emitters));
        balls.update(sim, sources, pointer.hover);
        paper.update(dt, sim.renderTime);
        surface.update(sim, sim.renderTime, balls);
        lines.update(settings, sources);
        if (linesWanted()) surface.setLines(lines, renderer.getPixelRatio(), framing.scale2d);
        labels.update(framing, sources, balls.radius);
        renderer.render(scene, camera);
      }
      hudTimer += dt;
      if (settings.showFps && hudTimer > 0.5) {
        hudTimer = 0;
        hud.setFps(quality.meter.fps, STR.panel.qualityNames[quality.current.level]);
      }
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
