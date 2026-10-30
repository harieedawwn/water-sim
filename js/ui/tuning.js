// Live look-tuning panel (key T). Edits the current map's parameters in the MapBlender
// and copies them as JSON for pasting into a later prompt.
import { STR } from './strings.js';
import { copyText } from './errors.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function toSrgb(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

function toLinear(byte) {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexFromLinear(a) {
  return '#' + a.map((c) => toSrgb(c).toString(16).padStart(2, '0')).join('');
}

const round = (v) => Math.round(v * 10000) / 10000;

export function createTuningPanel(container, blender) {
  const S = STR.tuning;
  const panel = el('div', 'tuning glass');
  panel.hidden = true;
  panel.append(el('h2', 'panel__title', S.title));
  const syncers = [];

  // get/set operate on blender.target (the editable copy of the current map).
  function slider(id, label, min, max, step, get, set, fmt) {
    const row = el('div', 'row');
    const head = el('label', 'row__label', label);
    const value = el('span', 'row__value');
    head.append(value);
    const input = el('input', 'range');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    head.htmlFor = input.id = `tune-${id}`;
    input.addEventListener('input', () => {
      set(blender.target, parseFloat(input.value));
      value.textContent = fmt(parseFloat(input.value));
      blender.markDirty();
    });
    row.append(head, input);
    panel.append(row);
    syncers.push(() => {
      const v = get(blender.target);
      input.value = String(v);
      value.textContent = fmt(v);
    });
  }

  slider('normal', S.normalStrength, 0.5, 8, 0.1,
    (p) => p.water.normalStrength, (p, v) => { p.water.normalStrength = v; }, (v) => v.toFixed(1));
  slider('glare', S.glareIntensity, 0, 30, 0.5,
    (p) => p.sky.glareIntensity, (p, v) => { p.sky.glareIntensity = v; }, (v) => v.toFixed(1));
  slider('fresnel', S.fresnelBias, 0, 0.2, 0.005,
    (p) => p.water.fresnelBias, (p, v) => { p.water.fresnelBias = v; }, (v) => v.toFixed(3));
  slider('spec', S.specularPower, 1.3, 3.5, 0.01,
    (p) => Math.log10(p.sun.power), (p, v) => { p.sun.power = Math.round(Math.pow(10, v)); },
    (v) => String(Math.round(Math.pow(10, v))));
  slider('foam', S.foam, 0, 2, 0.05,
    (p) => p.water.foam, (p, v) => { p.water.foam = v; }, (v) => v.toFixed(2));

  // Deep water colour (picker works in sRGB; parameters are linear).
  const row = el('div', 'row');
  const head = el('label', 'row__label', S.deepColor);
  const colorValue = el('span', 'row__value');
  head.append(colorValue);
  const picker = el('input', 'color');
  picker.type = 'color';
  head.htmlFor = picker.id = 'tune-deep';
  picker.addEventListener('input', () => {
    const h = picker.value;
    const deep = blender.target.water.deep;
    for (let i = 0; i < 3; i++) deep[i] = toLinear(parseInt(h.slice(1 + i * 2, 3 + i * 2), 16));
    colorValue.textContent = h;
    blender.markDirty();
  });
  row.append(head, picker);
  panel.append(row);
  syncers.push(() => {
    picker.value = hexFromLinear(blender.target.water.deep);
    colorValue.textContent = picker.value;
  });

  const copyBtn = el('button', 'btn btn--block', S.copy);
  copyBtn.type = 'button';
  copyBtn.addEventListener('click', () => {
    const p = blender.target;
    const json = JSON.stringify({
      map: p.id,
      normalStrength: round(p.water.normalStrength),
      glareIntensity: round(p.sky.glareIntensity),
      fresnelBias: round(p.water.fresnelBias),
      deepColor: p.water.deep.map(round),
      specularPower: p.sun.power,
      foam: round(p.water.foam),
    }, null, 2);
    copyText(json).then(() => {
      copyBtn.textContent = S.copied;
      setTimeout(() => { copyBtn.textContent = S.copy; }, 1500);
    });
    copyBtn.blur();
  });
  panel.append(copyBtn, el('p', 'note', S.hint));

  container.append(panel);

  function sync() {
    for (const s of syncers) s();
  }
  sync();
  return {
    element: panel,
    sync,
    toggle() {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) sync();
    },
  };
}
