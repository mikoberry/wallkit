// Pointer-effect data helpers.
//
// Pointer input arrives far more often than React should re-render. These
// helpers keep samples in fixed-size, preallocated ring buffers that the
// component rewrites in place and reads from inside its own draw loop — the
// same contract as the audio bars: a stable reference, no per-event state, no
// synthetic fallback when the wallpaper receives no pointer events.
//
// Everything here is pure: no DOM, no React, no timers.

import { isHexColor } from './audio.js'

// Both particle styles are available on BOTH channels: `bubble` and `firework`
// work as a trail style and as a click style. The channel only changes the
// scale and lifetime, never the drawing primitive. Kept as arrays so a picker
// can enumerate them without duplicating the list at the call site.
export const POINTER_TRAIL_VARIANTS = ['glow', 'ribbon', 'bubble', 'firework']
export const POINTER_CLICK_VARIANTS = ['ripple', 'sparks', 'bubble', 'firework']

export const POINTER_FX_SIZE_MIN = 20
export const POINTER_FX_SIZE_MAX = 300
export const POINTER_FX_SIZE_DEFAULT = 100
export const POINTER_FX_INTENSITY_MIN = 0
export const POINTER_FX_INTENSITY_MAX = 300
export const POINTER_FX_INTENSITY_DEFAULT = 100

// Matches the default --wallkit-accent token. Used only when neither an
// explicit colour nor an inherited theme token is available.
export const POINTER_FX_DEFAULT_COLOR = '#a8c4ff'

// Ring buffer capacities. The trail is sampled on every meaningful move, so it
// needs more slots than the much rarer click bursts.
export const POINTER_TRAIL_CAPACITY = 48
export const POINTER_BURST_CAPACITY = 12
export const POINTER_SPARKS_PER_BURST = 12
// A trail sample is emitted every 1.2 px, so it gets a small cluster; a click
// is a single deliberate event, so it gets a fuller one.
export const POINTER_BUBBLES_PER_SAMPLE = 2
export const POINTER_BUBBLES_PER_BURST = 7
export const POINTER_CLICK_FIREWORK_PARTICLES = 20
export const POINTER_TRAIL_FIREWORK_PARTICLES = 8

// Seconds. Short enough that a stationary cursor leaves a clean canvas.
export const POINTER_TRAIL_LIFE = 0.55
export const POINTER_BURST_LIFE = 0.72
// Particle styles have visible travel (rising / falling), so they live longer
// than a flat fading dot or ring. The trail variants are deliberately shorter
// and smaller than the click variants: a fast cursor emits dozens of samples,
// and full-sized bursts on every sample would bury the wallpaper.
export const POINTER_TRAIL_BUBBLE_LIFE = 1.05
export const POINTER_CLICK_BUBBLE_LIFE = 1.25
export const POINTER_TRAIL_FIREWORK_LIFE = 0.8
export const POINTER_CLICK_FIREWORK_LIFE = 1.35
// Reduced motion keeps a brief, non-expanding click marker instead of a trail.
export const POINTER_REDUCED_LIFE = 0.18

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function capacityOf(value, fallback) {
  return Number.isFinite(value) ? Math.max(2, Math.floor(value)) : fallback
}

// Deterministic 32-bit mix. Every particle style derives its parameters from
// (seed, index) with this, so the draw loop can rebuild the whole scatter on
// each frame without keeping mutable particle objects around.
function hash32(seed, index) {
  return Math.imul((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0
}

function bits(mixed, shift, mask) {
  return ((mixed >>> shift) & mask) / mask
}

/**
 * Preallocated trail samples, oldest first when read through
 * `pointerTrailIndex`. `head` is the next slot to overwrite; `count` never
 * exceeds `capacity`. `seeds` lets per-sample particles (bubbles) be
 * recomputed identically every frame without storing a particle array.
 *
 * @param {number} [capacity=POINTER_TRAIL_CAPACITY]
 * @returns {{ capacity: number, count: number, head: number,
 *   xs: Float32Array, ys: Float32Array, born: Float64Array,
 *   speed: Float32Array, seeds: Uint32Array }}
 */
export function createPointerTrail(capacity = POINTER_TRAIL_CAPACITY) {
  const size = capacityOf(capacity, POINTER_TRAIL_CAPACITY)
  return {
    capacity: size,
    count: 0,
    head: 0,
    xs: new Float32Array(size),
    ys: new Float32Array(size),
    born: new Float64Array(size),
    speed: new Float32Array(size),
    seeds: new Uint32Array(size),
  }
}

/**
 * Index of the `offset`-th live sample, counting from the oldest one.
 *
 * @param {ReturnType<typeof createPointerTrail>} trail
 * @param {number} offset  0 .. trail.count - 1
 * @returns {number}
 */
export function pointerTrailIndex(trail, offset) {
  return (trail.head - trail.count + offset + trail.capacity) % trail.capacity
}

/**
 * Append a pointer sample. `time` is in seconds on the same clock as the draw
 * loop (performance.now() / 1000); `speed` is px/s and only affects styling.
 * The seed is derived from the event time and slot, so its bubbles scatter
 * identically on every frame, exactly like `pushBurst` does for sparks.
 *
 * @param {ReturnType<typeof createPointerTrail>} trail
 * @param {number} x  Local x inside the overlay box.
 * @param {number} y  Local y inside the overlay box.
 * @param {number} time
 * @param {number} [speed=0]
 * @returns {number} Index of the written slot.
 */
export function pushTrailPoint(trail, x, y, time, speed = 0) {
  const slot = trail.head
  trail.xs[slot] = x
  trail.ys[slot] = y
  trail.born[slot] = time
  trail.speed[slot] = speed
  trail.seeds[slot] = (Math.floor(time * 1000) + Math.imul(slot + 1, 0x85ebca6b)) >>> 0
  trail.head = (slot + 1) % trail.capacity
  trail.count = Math.min(trail.count + 1, trail.capacity)
  return slot
}

/**
 * Preallocated click bursts.
 *
 * @param {number} [capacity=POINTER_BURST_CAPACITY]
 * @returns {{ capacity: number, count: number, head: number,
 *   xs: Float32Array, ys: Float32Array, born: Float64Array, seeds: Uint32Array }}
 */
export function createPointerBursts(capacity = POINTER_BURST_CAPACITY) {
  const size = capacityOf(capacity, POINTER_BURST_CAPACITY)
  return {
    capacity: size,
    count: 0,
    head: 0,
    xs: new Float32Array(size),
    ys: new Float32Array(size),
    born: new Float64Array(size),
    seeds: new Uint32Array(size),
  }
}

/**
 * Index of the `offset`-th live burst, counting from the oldest one.
 *
 * @param {ReturnType<typeof createPointerBursts>} bursts
 * @param {number} offset
 * @returns {number}
 */
export function pointerBurstIndex(bursts, offset) {
  return (bursts.head - bursts.count + offset + bursts.capacity) % bursts.capacity
}

/**
 * Append a click. The seed is derived from the event time and slot, so a burst
 * always scatters its particles identically on every frame without storing a
 * particle array or calling the RNG inside the draw loop.
 *
 * @param {ReturnType<typeof createPointerBursts>} bursts
 * @param {number} x
 * @param {number} y
 * @param {number} time
 * @returns {number} Index of the written slot.
 */
export function pushBurst(bursts, x, y, time) {
  const slot = bursts.head
  bursts.xs[slot] = x
  bursts.ys[slot] = y
  bursts.born[slot] = time
  bursts.seeds[slot] = (Math.floor(time * 1000) + Math.imul(slot + 1, 0x9e3779b1)) >>> 0
  bursts.head = (slot + 1) % bursts.capacity
  bursts.count = Math.min(bursts.count + 1, bursts.capacity)
  return slot
}

/**
 * Drop all live samples, e.g. after a pause so old timestamps cannot paint a
 * burst that already expired while the loop was stopped.
 *
 * @param {ReturnType<typeof createPointerTrail>} trail
 * @param {ReturnType<typeof createPointerBursts>} bursts
 */
export function clearPointerState(trail, bursts) {
  trail.count = 0
  bursts.count = 0
}

/**
 * Deceleration curve for expanding rings and travelling sparks.
 *
 * @param {number} t  0..1
 * @returns {number}
 */
export function easeOutCubic(t) {
  const clamped = clamp(t, 0, 1)
  return 1 - (1 - clamped) ** 3
}

/**
 * Opacity of a sample at a given age, quadratic so the tail stays visible for
 * a moment and then clears without a hard cut.
 *
 * @param {number} age  Seconds since the sample was recorded.
 * @param {number} life Total lifetime in seconds.
 * @returns {number} 0..1
 */
export function pointerDecay(age, life) {
  if (!(life > 0) || age < 0) return 0
  return (1 - clamp(age / life, 0, 1)) ** 2
}

/**
 * Lifetime for a (channel, variant) pair, in seconds.
 *
 * Every style works on both channels, but a trail sample and a click burst need
 * different durations. Centralising the mapping keeps the renderer's `alive`
 * check — which decides when the rAF loop may stop — in agreement with the
 * animation, and gives one place to tune timing.
 *
 * @param {'trail'|'click'} channel
 * @param {string} variant
 * @param {boolean} [reduced=false]
 * @returns {number}
 */
export function pointerLife(channel, variant, reduced = false) {
  if (reduced) return POINTER_REDUCED_LIFE
  const isTrail = channel === 'trail'
  if (variant === 'bubble') {
    return isTrail ? POINTER_TRAIL_BUBBLE_LIFE : POINTER_CLICK_BUBBLE_LIFE
  }
  if (variant === 'firework') {
    return isTrail ? POINTER_TRAIL_FIREWORK_LIFE : POINTER_CLICK_FIREWORK_LIFE
  }
  return isTrail ? POINTER_TRAIL_LIFE : POINTER_BURST_LIFE
}

/**
 * Resolve a size percentage into the scale the renderers apply to radii,
 * travel distances and line widths. `size` is the shared default; a per-channel
 * `trailSize` / `clickSize` overrides it for that channel only. Omitting or
 * passing null/undefined inherits `fallback`, so an old `<PointerFx size={…} />`
 * keeps scaling both channels identically.
 *
 * @param {number|null|undefined} value     Per-channel percentage, if given.
 * @param {number} [fallback=POINTER_FX_SIZE_DEFAULT]  Shared size percentage.
 * @returns {number} Scale factor, 0.2 .. 3.
 */
export function pointerSizeScale(value, fallback = POINTER_FX_SIZE_DEFAULT) {
  const base = Number(fallback)
  const shared = Number.isFinite(base)
    ? clamp(base, POINTER_FX_SIZE_MIN, POINTER_FX_SIZE_MAX)
    : POINTER_FX_SIZE_DEFAULT
  const numeric = value == null ? NaN : Number(value)
  const percent = Number.isFinite(numeric) ? numeric : shared
  return clamp(percent, POINTER_FX_SIZE_MIN, POINTER_FX_SIZE_MAX) / 100
}

/**
 * Deterministic direction / reach / size for one spark of a burst. Pure so the
 * draw loop can recompute the same scatter every frame from a single seed.
 *
 * @param {number} seed
 * @param {number} index  0 .. count - 1
 * @param {number} [count=POINTER_SPARKS_PER_BURST]
 * @returns {{ angle: number, reach: number, size: number }}
 */
export function pointerSpark(seed, index, count = POINTER_SPARKS_PER_BURST) {
  const mixed = hash32(seed, index)
  const fine = bits(mixed, 0, 0xffff)
  const coarse = bits(mixed, 16, 0xffff)
  const sizeBits = bits(mixed, 8, 0xff)
  const total = Math.max(1, count)
  return {
    angle: ((index + fine * 0.75) / total) * Math.PI * 2,
    reach: 0.55 + coarse * 0.65,
    size: 0.6 + sizeBits * 0.9,
  }
}

/**
 * Deterministic shape / drift / buoyancy for one bubble of a trail sample.
 *
 * Odd indices are the smaller companion bubbles, so a large click cluster
 * still has varied sizes rather than one big bubble plus a crowd of clones.
 *
 * @param {number} seed  The sample's `seeds[slot]`.
 * @param {number} index  0 .. count - 1, works for either channel's cluster size
 * @returns {{ drift: number, radius: number, rise: number,
 *   wobble: number, phase: number }}
 */
export function pointerBubble(seed, index) {
  const mixed = hash32(seed ^ 0x27d4eb2d, index)
  const a = bits(mixed, 0, 0xffff)
  const b = bits(mixed, 16, 0xffff)
  const c = bits(mixed, 8, 0xff)
  const d = bits(mixed, 24, 0xff)
  const small = index % 2 !== 0
  return {
    drift: (a * 2 - 1) * (small ? 1 : 0.45),
    radius: (small ? 0.55 : 1) * (0.7 + b * 0.7),
    rise: 0.65 + c * 0.8,
    wobble: 0.6 + d * 1.3,
    phase: a * Math.PI * 2,
  }
}

/**
 * Deterministic direction / reach / ember behaviour for one firework particle.
 * `tint` and `twinkle` give the burst colour and brightness variety while the
 * whole effect still derives from a single `colorHex`.
 *
 * @param {number} seed
 * @param {number} index  0 .. count - 1
 * @param {number} [count=POINTER_CLICK_FIREWORK_PARTICLES]
 * @returns {{ angle: number, reach: number, size: number, gravity: number,
 *   tint: number, twinkle: number }}
 */
export function pointerFireworkSpark(seed, index, count = POINTER_CLICK_FIREWORK_PARTICLES) {
  const mixed = hash32(seed ^ 0x165667b1, index)
  const fine = bits(mixed, 0, 0xffff)
  const coarse = bits(mixed, 16, 0xffff)
  const sizeBits = bits(mixed, 8, 0xff)
  const tintBits = bits(mixed, 24, 0xff)
  const total = Math.max(1, count)
  return {
    angle: ((index + fine * 0.8) / total) * Math.PI * 2,
    reach: 0.45 + coarse * 0.75,
    size: 0.55 + sizeBits * 1.1,
    gravity: 0.5 + fine,
    tint: tintBits,
    twinkle: bits(mixed, 4, 0xff),
  }
}

/**
 * Buoyant rise, 0..1. Quick off the cursor then easing out, so bubbles do not
 * shoot upward linearly.
 *
 * @param {number} progress  0..1
 * @returns {number}
 */
export function pointerRise(progress) {
  return easeOutCubic(progress)
}

/**
 * Gravitational drop, 0..1. Quadratic in time like a falling ember.
 *
 * @param {number} progress  0..1
 * @returns {number}
 */
export function pointerFall(progress) {
  const t = clamp(progress, 0, 1)
  return t * t
}

/**
 * Mix a colour toward white, giving firework embers a hot core and cooler tips.
 * Pass a scratch array from the draw loop to avoid allocating per particle;
 * like the ring buffers, that array is rewritten in place.
 *
 * @param {[number, number, number]} rgb
 * @param {number} amount  0..1
 * @param {number[]} [out]
 * @returns {number[]}
 */
export function pointerTint(rgb, amount, out = [0, 0, 0]) {
  const t = clamp(amount, 0, 1)
  for (let i = 0; i < 3; i += 1) {
    out[i] = Math.round(rgb[i] + (255 - rgb[i]) * t)
  }
  return out
}

/**
 * Split a `#rrggbb` colour into channels for canvas `rgba()` strings.
 * Invalid input falls back to the default accent rather than painting nothing.
 *
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function pointerRgb(hex) {
  const value = isHexColor(hex) ? hex.trim() : POINTER_FX_DEFAULT_COLOR
  const packed = parseInt(value.slice(1), 16)
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
}
