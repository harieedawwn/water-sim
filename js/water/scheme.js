// Numerical scheme of the GPU wave solver: constants and coefficients only (pure math, no three.js),
// shared by sim.js and the offline audit replica. See SPEC.md "Water simulation".
//
// Equation (world units, seconds), PML after Grote & Sim (arXiv:1001.0319):
//   u_tt + (2 g + zx + zz) u_t + zx zz u = c^2 lap u + div psi
//   psi_x,t = -zx psi_x + c^2 (zz - zx) u_x,   psi_z,t = -zz psi_z + c^2 (zx - zz) u_z
// g = friction, zx(x) / zz(z) = PML damping (0 inside the domain proper). Space: 4th-order cross
// Laplacian (-1, 16, -30, 16, -1) / 12 per axis; time: leapfrog, damping centred.
import { WAVE_SPEED, LIMITS } from '../config.js';

export const SIM_DT = 1 / 120;          // fixed timestep (s)
export const FRICTION = 0.018;          // g (1/s): amplitude decays e^(-g t), about 1.8 %/s
export const PML_WIDTH = 1.0;           // world units on each border (inside the 1.5 margin of framing.js, off screen)
export const PML_POWER = 3;             // damping profile zeta_max * s^3
export const PML_R0 = 1e-4;             // design reflection of the continuous layer at normal incidence
export const MAX_COURANT = 0.5;         // stability of the cross stencil: c dt / dx < sqrt(3 / 8) = 0.61

const TWO_PI = Math.PI * 2;
const F_LO = LIMITS.frequency.min;
const F_HI = LIMITS.frequency.max;

// -dx^2 * (symbol of the 1D 4th-order second difference) at a = k dx (>= 0), and its derivative.
function axisSym(a) { return (30 - 32 * Math.cos(a) + 2 * Math.cos(2 * a)) / 12; }
function axisSymD(a) { return (32 * Math.sin(a) - 4 * Math.sin(2 * a)) / 12; }

// Numerical wavenumber (1 / world) of frequency f travelling at angle th to the x axis, for a solver
// speed cNum on cells of size cell: 4 sin^2(w dt / 2) = (cNum dt / dx)^2 (S(k dx cos th) + S(k dx sin th)).
export function numericWavenumber(f, th, cell, cNum) {
  const nu = (cNum * SIM_DT) / cell;
  const target = (2 * Math.sin(Math.PI * f * SIM_DT)) ** 2 / (nu * nu);
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  let k = (TWO_PI * f) / cNum;
  for (let i = 0; i < 12; i++) {
    const a = k * cell * cs;
    const b = k * cell * sn;
    const g = axisSym(a) + axisSym(b) - target;
    const dg = cell * (cs * axisSymD(a) + sn * axisSymD(b));
    k -= g / dg;
  }
  return k;
}

// The one solver speed used for every frequency at this cell size: chosen so the simulated wavelength
// matches WAVE_SPEED / f as closely as possible over the whole frequency range and every direction
// (minimax of lambda_num / lambda - 1). Waves of any frequency, old or new, then travel at WAVE_SPEED.
export function numericSpeed(cell) {
  let c = WAVE_SPEED;
  for (let it = 0; it < 4; it++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= 16; i++) {
      const f = F_LO + ((F_HI - F_LO) * i) / 16;
      for (let j = 0; j <= 4; j++) {
        const e = (TWO_PI * f) / WAVE_SPEED / numericWavenumber(f, (Math.PI / 4) * (j / 4), cell, c) - 1;
        if (e < lo) lo = e;
        if (e > hi) hi = e;
      }
    }
    c *= 2 / (2 + lo + hi);
  }
  return c;
}

// Peak PML damping (1/s): the continuous layer reflects R0 at normal incidence,
// R = exp(-2 / c * integral of zeta) with zeta = zeta_max s^p over the width.
export function pmlMax() {
  return ((PML_POWER + 1) * WAVE_SPEED * Math.log(1 / PML_R0)) / (2 * PML_WIDTH);
}

// Gaussian width (world units) actually used for an emitter radius. The floor (1.3 cells: spectrum e^-8 at the
// grid Nyquist) keeps sigma = 0.0675 for the sine emitters on every preset, so the near field (r ~ lambda / 2)
// is the same on the phone grid as on the fine ones.
export const SIGMA_MIN_CELLS = 1.3;
export function sigmaFor(radius, cell) {
  return Math.max(radius * 0.6, SIGMA_MIN_CELLS * cell);
}

// Per-step displacement amplitude that yields a far-field wave amplitude of 1 at r = 1 unit.
// 2D Green's function: |h| = F / (4 c^2) * sqrt(2 / (pi k r)) * e^(-g r / c), with the step displacement q
// acting as a source density q / dt^2 whose Gaussian footprint has spectrum 2 pi s^2 exp(-k^2 s^2 / 2).
export function sourceGain(radius, freq, cell) {
  const s = sigmaFor(radius, cell);
  const k = (TWO_PI * freq) / WAVE_SPEED;
  const footprint = TWO_PI * s * s * Math.exp(-0.5 * k * k * s * s);
  const friction = Math.exp(FRICTION / WAVE_SPEED);
  return (4 * WAVE_SPEED * WAVE_SPEED * SIM_DT * SIM_DT * friction) / (footprint * Math.sqrt(2 / (Math.PI * k)));
}

// Phase lead added to a sine emitter so that the wave it radiates is sin(2 pi f t + phi - k r) exactly
// (t = sim.time of the displayed state): the 2D Green's function lags its source by pi / 4 in the far
// field (i H0(kr) ~ e^(i (kr + pi / 4))). Measured on the replica: the residual is below 0.5 deg for
// r >= 2 lambda; nearer it follows the exact Hankel phase (+1/(8 k r) rad: +2.3 deg at lambda / 2).
export const SOURCE_PHASE_LEAD = Math.PI / 4;
