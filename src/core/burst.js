// One-shot burst-effect data helpers.
//
// `BurstFx` is the third kind of effect layer. Unlike `AmbientFx` (nothing ever
// arrives, the scene is rebuilt from a fixed table) and `PointerFx` (pointer
// events arrive continuously, sampled into ring buffers), a burst is *commanded*:
// the host calls `burst(type, opts)` and the component plays a single, finite
// effect — confetti or a water spray — then stops.
//
// A burst therefore shares the pointer layer's lifecycle shape (a sample has a
// birth time and dies) but not its input (no pointer, no window listeners). The
// trigger is a render command, so it arrives through a ref, and it is the one
// WallKit control that accepts such a command — the "data as props" rule holds
// for *data*, a burst is an *event*.
//
// The same "no particle arrays" rule applies: every burst is stored as a single
// record (origin, angle, seed, birth time, kind) and each particle is recomputed
// deterministically from `(seed, index)` on every frame. The seed reuses the
// same hash family as core/pointer.js so the scatter reproduces exactly across
// frames without any stored particle state.
//
// Everything here is pure: no DOM, no React, no timers.

import { isHexColor } from './audio.js'
// The deceleration curve is shared with the pointer layer: a burst's outward
// reach and a click's expanding ring coast the same way, and there is no reason
// for two modules to carry two copies of the same easing. `hash32` stays local,
// as in ambient.js, so a burst never breaks because another module changed its
// internals — but an easing curve is a contract, not an internal detail.
import { easeOutCubic } from './pointer.js'

export { easeOutCubic }

// Both burst kinds are one-shot: they spray out, fall under gravity, and the
// whole effect is gone by `life`. Confetti is a celebratory scatter of paper
// slips; spray is a fan of water droplets; yogurt is a viscous blob that flings
// out in thick, stringy clumps and drops fast under its own weight. Kept as
// arrays so a picker can enumerate them without duplicating the list at the
// call site.
export const BURST_VARIANTS = ['confetti', 'spray', 'yogurt']

export const BURST_SIZE_MIN = 20
export const BURST_SIZE_MAX = 300
export const BURST_SIZE_DEFAULT = 100

export const BURST_INTENSITY_MIN = 0
export const BURST_INTENSITY_MAX = 300
export const BURST_INTENSITY_DEFAULT = 100

// Motion pace, independent of `size` and `intensity`. `speed` scales the
// burst's clock, so translation and the life ramp speed up or slow down
// together without changing any particle parameter. Note this is distinct from
// `intensity`: `speed` controls how *fast* the whole effect plays, `intensity`
// controls how *hard* the particles are launched (their launch velocity, and
// therefore — through projectile physics — their reach, peak height and how the
// water column breaks up).
export const BURST_SPEED_MIN = 20
export const BURST_SPEED_MAX = 300
export const BURST_SPEED_DEFAULT = 100

// How many bursts can be in flight at once. A command fires on demand and the
// host may spam it, so a ring of records is enough — the oldest one is
// overwritten rather than growing without bound.
export const BURST_CAPACITY = 8

// Lifetime of one burst in seconds. Long enough for the particles to fall out
// of frame naturally; short enough that a stationary canvas goes quiet and the
// rAF loop stops.
export const BURST_LIFE_CONFETTI = 2.4
export const BURST_LIFE_SPRAY = 1.6
export const BURST_LIFE_YOGURT = 1.9

// Particle counts per burst, before the caller's scale is applied. The count
// is a preset default, not a ceiling: a per-burst `opts.count` may override it,
// within the bounds below.
export const BURST_CONFETTI_COUNT = 90
export const BURST_SPRAY_COUNT = 110
export const BURST_YOGURT_COUNT = 60

// Per-burst count bounds. A command may ask for anything in this range; below
// it a burst is an invisible puff, above it the ring's determinism still holds
// but the cost climbs without visible return.
export const BURST_COUNT_MIN = 4
export const BURST_COUNT_MAX = 400

// Confetti palette. A single `colorHex` prop recolours the whole scatter, but
// the default is a fixed celebratory rainbow — a one-colour confetti reads as a
// bug, not a choice. Each particle picks its colour from `(seed, index)`.
export const BURST_CONFETTI_PALETTE = [
  '#ff5d5d',
  '#ffb84d',
  '#ffe14d',
  '#5dd66b',
  '#4dc9ff',
  '#7d7dff',
  '#f26bd1',
]

// Fallback tint for spray (and for confetti when the caller passes an explicit
// colour). Water has no accent of its own, so a pale blue reads as spray rather
// than paint.
export const BURST_DEFAULT_COLOR = '#7fc8f0'

// Yogurt is a viscous dairy blob: a warm off-white, not pure white (which reads
// as milk or ice cream) and not too yellow (which reads as custard). Slightly
// translucent in practice, but the colour channel is opaque so the renderer can
// control opacity per-clump through alpha.
export const BURST_YOGURT_COLOR = '#f6efe0'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function capacityOf(value, fallback) {
  return Number.isFinite(value) ? Math.max(2, Math.floor(value)) : fallback
}

// Deterministic 32-bit mix, the same family as core/pointer.js and
// core/ambient.js. Kept local so a burst never breaks because another module
// changed its internals.
function hash32(seed, index) {
  return Math.imul((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0
}

function bits(mixed, shift, mask) {
  return ((mixed >>> shift) & mask) / mask
}

/**
 * Preallocated burst records, oldest first when read through `burstIndex`.
 *
 * Each record stores an origin in normalised 0..1 coordinates (so a resize
 * re-maps every burst on the next frame without touching stored pixels), a
 * direction angle in radians, a seed, a birth time, and the kind. Per-burst
 * `size` / `intensity` / `count` are stored here too, so two bursts fired with
 * different parameters do not bleed into each other — the component's props
 * are only the *defaults* a command falls back to.
 *
 * @param {number} [capacity=BURST_CAPACITY]
 * @returns {{ capacity: number, count: number, head: number,
 *   xs: Float32Array, ys: Float32Array, angle: Float32Array,
 *   born: Float64Array, seeds: Uint32Array, kinds: Uint8Array,
 *   sizes: Float32Array, intensities: Float32Array, counts: Float32Array,
 *   speeds: Float32Array }}
 */
export function createBursts(capacity = BURST_CAPACITY) {
  const size = capacityOf(capacity, BURST_CAPACITY)
  return {
    capacity: size,
    count: 0,
    head: 0,
    xs: new Float32Array(size),
    ys: new Float32Array(size),
    angle: new Float32Array(size),
    born: new Float64Array(size),
    seeds: new Uint32Array(size),
    kinds: new Uint8Array(size),
    sizes: new Float32Array(size),
    intensities: new Float32Array(size),
    counts: new Float32Array(size),
    speeds: new Float32Array(size),
  }
}

/**
 * Index of the `offset`-th live burst, counting from the oldest one.
 *
 * @param {ReturnType<typeof createBursts>} bursts
 * @param {number} offset  0 .. bursts.count - 1
 * @returns {number}
 */
export function burstIndex(bursts, offset) {
  return (bursts.head - bursts.count + offset + bursts.capacity) % bursts.capacity
}

// Kind id → index into `kinds` (a Uint8Array, so it stores a small int).
const KIND_IDS = { confetti: 0, spray: 1, yogurt: 2 }

function kindId(kind) {
  return BURST_VARIANTS.includes(kind) ? KIND_IDS[kind] : KIND_IDS.confetti
}

/**
 * Append a burst command. `x` / `y` are normalised 0..1 within the overlay,
 * `angle` is radians (0 = up, positive = clockwise) and `time` is seconds on
 * the same clock as the draw loop (performance.now() / 1000). The seed is
 * derived from the event time and slot, so a burst always scatters its
 * particles identically on every frame without storing a particle array.
 *
 * @param {ReturnType<typeof createBursts>} bursts
 * @param {string} kind  'confetti' | 'spray'
 * @param {number} x
 * @param {number} y
 * @param {number} angle
 * @param {number} [time=0]          Reserved; `fireBurst` no longer records an
 *   absolute birth time. The birth time is stamped by the draw loop on the
 *   first tick (see `drawBursts`), so `born` and `now` always share the same
 *   rAF clock and `age` can never be negative. Kept as an ignored parameter for
 *   source compatibility.
 * @param {number} [scale=1]         Per-burst size multiplier (already resolved).
 * @param {number} [intensity=1]     Per-burst intensity multiplier (0..3). This
 *   is the *launch force*, not opacity: it drives launch velocity and, through
 *   projectile physics, reach, peak height and how the spray breaks up.
 * @param {number} [count=0]         Per-burst particle count; 0 lets the
 *   renderer use the kind's preset default.
 * @param {number} [speed=1]         Per-burst motion-pace multiplier (scales the
 *   burst's clock, not any particle parameter).
 * @returns {number} Index of the written slot.
 */
export function fireBurst(
  bursts,
  kind,
  x,
  y,
  angle,
  time = 0,
  scale = 1,
  intensity = 1,
  count = 0,
  speed = 1,
) {
  const slot = bursts.head
  bursts.xs[slot] = x
  bursts.ys[slot] = y
  bursts.angle[slot] = angle
  // Birth time is a sentinel here: the draw loop stamps it with its own rAF
  // clock on the first tick. Recording `performance.now()` here would be a
  // *different* clock from the rAF timestamp the loop reads as `now`, and the
  // rAF timestamp can lag the event-handler time — so `age = now - born` could
  // come out negative on the very first frame and the loop would self-stop
  // before drawing anything. `born = -1` means "unborn"; `drawBursts` turns it
  // into the current tick time.
  bursts.born[slot] = -1
  bursts.seeds[slot] = (Math.floor(time * 1000) + Math.imul(slot + 1, 0x9e3779b1)) >>> 0
  bursts.kinds[slot] = kindId(kind)
  bursts.sizes[slot] = scale
  bursts.intensities[slot] = intensity
  bursts.counts[slot] = count
  bursts.speeds[slot] = speed
  bursts.head = (slot + 1) % bursts.capacity
  bursts.count = Math.min(bursts.count + 1, bursts.capacity)
  return slot
}

/**
 * Drop all live bursts, e.g. after a pause so old timestamps cannot paint a
 * burst that already expired while the loop was stopped.
 *
 * @param {ReturnType<typeof createBursts>} bursts
 */
export function clearBursts(bursts) {
  bursts.count = 0
}

/**
 * Lifetime of a burst kind, in seconds.
 *
 * @param {string} kind  'confetti' | 'spray' | 'yogurt'
 * @param {boolean} [reduced=false]  Reduced motion shortens the effect.
 * @returns {number}
 */
export function burstLife(kind, reduced = false) {
  let base = BURST_LIFE_CONFETTI
  if (kind === 'spray') base = BURST_LIFE_SPRAY
  else if (kind === 'yogurt') base = BURST_LIFE_YOGURT
  return reduced ? base * 0.6 : base
}

/**
 * Opacity of a burst at a given age. A gentle ramp in avoids a full-brightness
 * pop, and a quadratic tail keeps the last particles visible a beat before the
 * canvas clears.
 *
 * @param {number} age  Seconds since the burst was commanded.
 * @param {number} life  Total lifetime in seconds.
 * @returns {number} 0..1
 */
export function burstDecay(age, life) {
  if (!(life > 0) || age < 0) return 0
  const t = clamp(age / life, 0, 1)
  return Math.min(1, t * 8) * (1 - t) ** 2
}

// Smoothstep 0..1, the easing behind the outward reach of a burst.
function smoothstep(value) {
  const v = clamp(value, 0, 1)
  return v * v * (3 - 2 * v)
}

/**
 * Gravitational drop, 0..1. Quadratic in time, like a falling ember or droplet.
 *
 * @param {number} progress  0..1
 * @returns {number}
 */
export function burstFall(progress) {
  const t = clamp(progress, 0, 1)
  return t * t
}

/**
 * Projectile flight of a burst, driven by launch force rather than an easing
 * curve. This is the physics behind `intensity`: a stronger launch means a
 * higher initial velocity, which — through the classic projectile equations —
 * yields a longer reach *and* a higher peak, with the peak scaling as the
 * square of the sine of the launch angle (so firing at an angle flies higher
 * than firing straight up is flat).
 *
 * The trajectory is a parameterised parabola over `progress` (0..1 of the
 * burst's life), with gravity folding the upward launch into a fall. The
 * horizontal term uses `cos` and the vertical term `sin` of the launch angle,
 * so an angled shot naturally arcs instead of travelling in a straight line.
 *
 * @param {number} progress  0..1 through the burst's life.
 * @param {number} angle     Launch angle in radians (0 = up, + = clockwise).
 * @param {number} force     Launch-force multiplier (0..3), from `intensity`.
 * @returns {{ dx: number, dy: number }}
 *   `dx` / `dy` are unitless displacement components scaled by `force`:
 *   horizontal advance ∝ v0·cosθ·t, vertical rise ∝ v0·sinθ·t + ½·g·t².
 *   Screen coords have y pointing down, and `angle` uses "up = negative", so
 *   `sinθ` is negative for an upward launch; gravity adds `+½·g·t²` (downward),
 *   which first flattens the climb and then brings the particle back down —
 *   a real parabola. Because `v0` scales with `force`, both reach and peak
 *   height grow with intensity.
 */
export function burstProjectile(progress, angle, force) {
  const t = clamp(progress, 0, 1)
  // Launch velocity scales linearly with force; gravity is a fixed constant,
  // so a stronger launch travels further before gravity wins.
  const v0 = force
  const g = 1.6
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  // Horizontal advance: constant-velocity (no drag), so it's just cosθ·v0·t.
  const dx = cos * v0 * t
  // Vertical: sinθ·v0·t + ½·g·t². The upward sinθ·v0·t term and the downward
  // gravity term compete; a stronger v0 keeps the particle rising longer and
  // to a higher peak before gravity pulls it back down.
  const dy = sin * v0 * t + 0.5 * g * t * t
  return { dx, dy }
}

/**
 * How much a spray has broken from a solid stream into scattered droplets, as a
 * function of intensity. A strong launch keeps the water column tight at first
 * (high pressure holds it together) and only shatters into droplets late in the
 * flight; a weak launch is scattered almost from the start.
 *
 * Returns a `breakup` value 0..1 (0 = solid stream, 1 = fully scattered) that
 * the renderer uses to widen the fan over time.
 *
 * @param {number} progress  0..1 through the burst's life.
 * @param {number} force     Launch-force multiplier (0..3).
 * @returns {number} 0..1
 */
export function burstBreakup(progress, force) {
  const t = clamp(progress, 0, 1)
  // Stronger launch → later, sharper breakup. Force 1 (100%) breaks up around
  // mid-flight; force 3 holds together until about two-thirds through, then
  // shatters. The higher the force, the closer `breakStart` is to 1 (later
  // breakup) and the steeper the transition once it begins.
  const breakStart = clamp(0.3 + force * 0.12, 0.3, 0.66)
  if (t <= breakStart) return 0
  const k = (t - breakStart) / (1 - breakStart)
  // Smoothstep keeps the widening gentle at first, then rapid — a column that
  // "shatters" rather than a fan that eases open.
  return smoothstep(k)
}

/**
 * Deterministic direction / reach / size / spin for one confetti particle.
 *
 * Confetti pieces launch upward into a cone, then flutter down: they drift
 * sideways, spin on their own and swing as they fall, so the mass reads as
 * paper rather than a cloud of dots. Everything derives from `(seed, index)`.
 *
 * @param {number} seed
 * @param {number} index  0 .. count - 1
 * @param {number} [count=BURST_CONFETTI_COUNT]
 * @returns {{ angle: number, reach: number, size: number, spin: number,
 *   drift: number, swayPhase: number, palette: number }}
 */
export function burstConfetti(seed, index, count = BURST_CONFETTI_COUNT) {
  const mixed = hash32(seed ^ 0x1c6a5b3d, index)
  const fine = bits(mixed, 0, 0xffff)
  const coarse = bits(mixed, 16, 0xffff)
  const sizeBits = bits(mixed, 8, 0xff)
  const spinBits = bits(mixed, 24, 0xff)
  const total = Math.max(1, count)
  return {
    // Spread across the launch cone, biased to fill it rather than cluster.
    angle: (index + fine * 0.85) / total * Math.PI * 2,
    reach: 0.55 + coarse * 0.75,
    size: 0.6 + sizeBits * 1.1,
    spin: (spinBits * 2 - 1) * 3.2,
    drift: (coarse * 2 - 1) * 0.7,
    swayPhase: fine * Math.PI * 2,
    palette: Math.floor(sizeBits * BURST_CONFETTI_PALETTE.length),
  }
}

/**
 * Deterministic direction / reach / size for one spray droplet. Droplets exit
 * in a narrow fan and fall fast; the fan width is baked into the angle spread
 * at the call site, and here only the per-droplet reach and size vary.
 *
 * @param {number} seed
 * @param {number} index  0 .. count - 1
 * @param {number} [count=BURST_SPRAY_COUNT]
 * @returns {{ reach: number, size: number, fan: number }}
 */
export function burstDroplet(seed, index, count = BURST_SPRAY_COUNT) {
  const mixed = hash32(seed ^ 0x7f4a7c15, index)
  const coarse = bits(mixed, 16, 0xffff)
  const sizeBits = bits(mixed, 8, 0xff)
  const fan = bits(mixed, 0, 0xffff)
  void count
  return {
    reach: 0.6 + coarse * 0.8,
    size: 0.5 + sizeBits * 0.9,
    // -1..1 across the fan, so droplets fill the cone edge to edge.
    fan: fan * 2 - 1,
  }
}

/**
 * Deterministic direction / reach / size for one yogurt glob. Yogurt is
 * viscous, so a glob is heavier and stickier than a water droplet: it launches
 * with a wider, lumpier spread, drags a string of trailing material behind it,
 * and its clumps vary more in size (some big gobs, some small flecks). The
 * `tail` length and `lump` size give the renderer the material to paint a
 * thick, stringy blob instead of a clean droplet.
 *
 * @param {number} seed
 * @param {number} index  0 .. count - 1
 * @param {number} [count=BURST_YOGURT_COUNT]
 * @returns {{ reach: number, size: number, fan: number, tail: number }}
 */
export function burstGlob(seed, index, count = BURST_YOGURT_COUNT) {
  const mixed = hash32(seed ^ 0x3c1d9b2f, index)
  const coarse = bits(mixed, 16, 0xffff)
  const sizeBits = bits(mixed, 8, 0xff)
  const tailBits = bits(mixed, 24, 0xff)
  const fan = bits(mixed, 0, 0xffff)
  void count
  return {
    // Yogurt is thrown harder per unit than water (it is thick), so reach is a
    // touch lower than a droplet's — it does not travel as far before weight
    // wins.
    reach: 0.5 + coarse * 0.7,
    // Clump size varies more than a droplet: big gobs mixed with small flecks.
    size: 0.7 + sizeBits * 1.6,
    // -1..1 across the fan.
    fan: fan * 2 - 1,
    // Trailing string length behind each glob, 0..1 — the sticky "tail".
    tail: 0.3 + tailBits * 0.7,
  }
}

/**
 * Resolve a size percentage into the scale the renderers apply to radii,
 * travel distances and line widths. Same contract as `pointerSizeScale`.
 *
 * @param {number|null|undefined} value
 * @param {number} [fallback=BURST_SIZE_DEFAULT]
 * @returns {number} Scale factor, 0.2 .. 3.
 */
export function burstSizeScale(value, fallback = BURST_SIZE_DEFAULT) {
  const base = Number(fallback)
  const shared = Number.isFinite(base)
    ? clamp(base, BURST_SIZE_MIN, BURST_SIZE_MAX)
    : BURST_SIZE_DEFAULT
  const numeric = value == null ? NaN : Number(value)
  const percent = Number.isFinite(numeric) ? numeric : shared
  return clamp(percent, BURST_SIZE_MIN, BURST_SIZE_MAX) / 100
}

/**
 * Split a `#rrggbb` colour into channels, falling back to the default tint.
 *
 * @param {unknown} hex
 * @returns {[number, number, number]}
 */
export function burstRgb(hex) {
  const value = isHexColor(hex) ? String(hex).trim() : BURST_DEFAULT_COLOR
  const packed = parseInt(value.slice(1), 16)
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
}

/**
 * Split a palette entry into channels. Used for confetti, whose per-particle
 * colour comes from `BURST_CONFETTI_PALETTE` rather than a single tint.
 *
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function burstPaletteRgb(hex) {
  const value = isHexColor(hex) ? hex : BURST_CONFETTI_PALETTE[0]
  const packed = parseInt(value.slice(1), 16)
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
}

/**
 * Normalise a burst kind, falling back to `confetti` on unknown input.
 *
 * @param {unknown} kind
 * @returns {'confetti'|'spray'}
 */
export function normalizeBurstKind(kind) {
  return BURST_VARIANTS.includes(kind) ? kind : 'confetti'
}

/**
 * Resolve a per-burst particle count. `undefined` / `null` / `NaN` return 0,
 * which the renderer interprets as "use the kind's preset default"; a real
 * number is clamped into `[BURST_COUNT_MIN, BURST_COUNT_MAX]`.
 *
 * @param {unknown} value
 * @returns {number} 0 for "preset", otherwise a clamped positive count.
 */
export function burstCount(value) {
  const numeric = value == null ? NaN : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(clamp(numeric, BURST_COUNT_MIN, BURST_COUNT_MAX))
}

/**
 * Resolve an intensity percentage into the launch-force multiplier the
 * renderers apply to projectile velocity (and, through it, reach and height).
 * `undefined` / `null` / `NaN` return `fallback` (the component's default).
 *
 * @param {unknown} value
 * @param {number} [fallback=BURST_INTENSITY_DEFAULT]
 * @returns {number} Launch-force factor, 0 .. 3.
 */
export function burstIntensityScale(value, fallback = BURST_INTENSITY_DEFAULT) {
  const base = Number(fallback)
  const shared = Number.isFinite(base)
    ? clamp(base, BURST_INTENSITY_MIN, BURST_INTENSITY_MAX)
    : BURST_INTENSITY_DEFAULT
  const numeric = value == null ? NaN : Number(value)
  const percent = Number.isFinite(numeric) ? numeric : shared
  return clamp(percent, BURST_INTENSITY_MIN, BURST_INTENSITY_MAX) / 100
}

/**
 * Resolve a per-burst motion-pace percentage into a multiplier. Same contract
 * as `burstDistanceScale`; `speed` scales the burst's clock.
 *
 * @param {unknown} value
 * @param {number} [fallback=BURST_SPEED_DEFAULT]
 * @returns {number} Scale factor, 0.2 .. 3.
 */
export function burstSpeedScale(value, fallback = BURST_SPEED_DEFAULT) {
  const base = Number(fallback)
  const shared = Number.isFinite(base)
    ? clamp(base, BURST_SPEED_MIN, BURST_SPEED_MAX)
    : BURST_SPEED_DEFAULT
  const numeric = value == null ? NaN : Number(value)
  const percent = Number.isFinite(numeric) ? numeric : shared
  return clamp(percent, BURST_SPEED_MIN, BURST_SPEED_MAX) / 100
}
