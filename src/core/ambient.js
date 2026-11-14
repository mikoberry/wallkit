// Ambient particle helpers.
//
// Unlike the pointer effects, this layer has no input at all: nothing arrives
// from the host, so there is nothing to sample, buffer or expire. A particle's
// position is a pure function of `(parameters, time)`:
//
//   x, y = f(seed, t)
//
// That has three consequences worth stating, because they are the reason this
// module stores parameters rather than particles:
//
//   - No ring buffers. The parameter table is filled once per (variant, count)
//     and then only read, so 60 fps costs zero allocations.
//   - `paused` is just "stop advancing t". There is no accumulated state to
//     reconcile, so pausing and resuming cannot drift or jump.
//   - A resize re-maps every particle correctly on the next frame. Positions are
//     normalised, never stored in pixels.
//
// The parameters live in one flat Float32Array with a fixed stride so the draw
// loop can walk it without touching objects. Everything here is pure: no DOM,
// no React, no timers.

import { isHexColor } from './audio.js'

export const AMBIENT_VARIANTS = ['snow', 'sakura', 'bubble', 'steam', 'rain', 'fog', 'leaves']

export const AMBIENT_SIZE_MIN = 20
export const AMBIENT_SIZE_MAX = 300
export const AMBIENT_SIZE_DEFAULT = 100

export const AMBIENT_DENSITY_MIN = 10
export const AMBIENT_DENSITY_MAX = 300
export const AMBIENT_DENSITY_DEFAULT = 100

export const AMBIENT_INTENSITY_MIN = 0
export const AMBIENT_INTENSITY_MAX = 300
export const AMBIENT_INTENSITY_DEFAULT = 100

// Global motion pace, a percentage applied to the layer's clock. It scales the
// elapsed time rather than any per-particle parameter, so translation, sway,
// twinkle and the life ramps all speed up or slow down together.
export const AMBIENT_SPEED_MIN = 20
export const AMBIENT_SPEED_MAX = 300
export const AMBIENT_SPEED_DEFAULT = 100

// Hard ceiling across every variant. A wallpaper runs for hours at 60 fps, so
// the count is capped here rather than left to a caller that asks for 300% of a
// dense preset. Per-variant limits in the presets are lower still.
export const AMBIENT_COUNT_MAX = 240

// Fallback tint. `bubble` reads `--wallkit-accent` first, so this is only the
// last resort when no theme token is available either.
export const AMBIENT_DEFAULT_COLOR = '#a8c4ff'

// Parameter layout. Indices are exported so the renderers can read the buffer
// by name instead of by magic number.
export const AMBIENT_STRIDE = 10
export const AMBIENT_X = 0
export const AMBIENT_PHASE = 1
export const AMBIENT_TRAVEL = 2
export const AMBIENT_SWAY_AMP = 3
export const AMBIENT_SWAY_FREQ = 4
export const AMBIENT_DRIFT = 5
export const AMBIENT_SIZE = 6
export const AMBIENT_SPIN = 7
export const AMBIENT_ALPHA = 8
export const AMBIENT_TWINKLE = 9

/**
 * Per-variant physics and look.
 *
 * Ranges are `[min, max]`, drawn per particle from a deterministic sequence.
 * `travel` is seconds to cross the screen, which is why a slow flake and a fast
 * one never fall in step: every particle has its own period, so the scatter
 * stays uniform instead of pulsing in rows.
 *
 * `baseSize` is the particle radius in px at 1080p for a size factor of 1; the
 * component scales it by the viewport and by its `size` prop.
 *
 * @type {Record<string, {
 *   count: number, max: number, color: string, direction: 'down'|'up'|'side',
 *   baseSize: number, travel: [number, number], swayAmp: [number, number],
 *   swayFreq: [number, number], drift: [number, number],
 *   size: [number, number], spin: [number, number],
 *   alpha: [number, number], twinkle: [number, number],
 * }>}
 */
export const AMBIENT_PRESETS = {
  snow: {
    count: 90,
    max: 220,
    color: '#dbe9ff',
    direction: 'down',
    baseSize: 9,
    // Slow and stately. Snow that crosses the screen in three seconds reads as
    // rain, not snow.
    travel: [9, 17],
    swayAmp: [0.008, 0.032],
    swayFreq: [0.08, 0.22],
    drift: [-0.035, 0.035],
    size: [0.45, 1.2],
    spin: [0, 0],
    alpha: [0.4, 0.95],
    twinkle: [0.04, 0.3],
  },
  sakura: {
    count: 40,
    max: 90,
    color: '#f5b8cd',
    direction: 'down',
    baseSize: 13,
    travel: [12, 20],
    // Petals swing much wider than snow, and the drift is signed: a whole
    // screenful travels roughly the same way, like wind.
    swayAmp: [0.03, 0.075],
    swayFreq: [0.06, 0.14],
    drift: [0.04, 0.14],
    size: [0.7, 1.3],
    spin: [-1.5, 1.5],
    alpha: [0.55, 0.95],
    twinkle: [0, 0.12],
  },
  bubble: {
    count: 32,
    max: 80,
    color: '',
    direction: 'up',
    baseSize: 17,
    travel: [11, 22],
    swayAmp: [0.01, 0.035],
    swayFreq: [0.12, 0.3],
    drift: [-0.02, 0.02],
    size: [0.5, 1.35],
    spin: [0, 0],
    alpha: [0.25, 0.65],
    twinkle: [0.1, 0.4],
  },
  steam: {
    // Fog's vertical twin: same bank look and motion, rising instead of
    // sliding. The bank is anchored horizontally, crosses the screen
    // vertically, and the life ramp fades it in at the bottom and out before
    // the top edge — which also hides the wrap. Bob is horizontal.
    count: 12,
    max: 30,
    color: '#eef1f4',
    direction: 'up',
    baseSize: 110,
    travel: [34, 58],
    swayAmp: [0.008, 0.02],
    swayFreq: [0.04, 0.1],
    drift: [0, 0],
    size: [1.0, 2.0],
    spin: [0, 0],
    // Peak alpha of the life ramp is 1 mid-crossing, so the base range can
    // sit a little higher than a constant-alpha variant would.
    alpha: [0.14, 0.3],
    twinkle: [0.02, 0.08],
  },
  rain: {
    count: 150,
    max: 220,
    color: '#a8c0dc',
    direction: 'down',
    baseSize: 9,
    // Fast and near-straight: rain that takes four seconds to cross the
    // screen reads as snow. The small signed drift slants the whole shower
    // one way, like wind, and the streak sprite is tilted to match (see
    // `drawRain`).
    travel: [1.6, 3.2],
    swayAmp: [0.002, 0.012],
    swayFreq: [0.3, 0.8],
    drift: [0.05, 0.15],
    size: [0.5, 1.0],
    spin: [0, 0],
    alpha: [0.35, 0.75],
    twinkle: [0, 0],
  },
  fog: {
    count: 12,
    max: 30,
    color: '#dfe6ee',
    direction: 'side',
    baseSize: 140,
    // Fog banks slide sideways over the whole screen. `travel` is seconds to
    // cross the width; the stored X slot doubles as the vertical anchor, the
    // phase doubles as the horizontal start, and sway becomes vertical
    // bobbing (see the fog branch in `ambientOffset`).
    travel: [34, 58],
    swayAmp: [0.008, 0.02],
    swayFreq: [0.04, 0.1],
    drift: [0, 0],
    size: [1.0, 2.0],
    spin: [0, 0],
    alpha: [0.14, 0.3],
    twinkle: [0.02, 0.08],
  },
  leaves: {
    count: 28,
    max: 70,
    color: '#d98a4f',
    direction: 'down',
    baseSize: 14,
    // Windy autumn: wide swing plus a second quicker eddy gives the zigzag
    // tumble, and every leaf spins on its own.
    travel: [7, 14],
    swayAmp: [0.035, 0.08],
    swayFreq: [0.1, 0.24],
    drift: [0.05, 0.16],
    size: [0.75, 1.3],
    spin: [-2.2, 2.2],
    alpha: [0.5, 0.9],
    twinkle: [0, 0.1],
  },
}

// Per-variant shuffle salt: switching style reshuffles the scatter instead of
// reusing the snow positions for petals.
const AMBIENT_SALTS = {
  snow: 0x9e3779b1,
  sakura: 0x4f1bbcdd,
  bubble: 0x27d4eb2d,
  steam: 0x71c3e9ad,
  rain: 0x3c6ef372,
  fog: 0x85c05c1a,
  leaves: 0xd3a2e91b,
}

/**
 * Upward variants rise from the bottom edge instead of falling. Only the
 * generic motion path consults this — `steam` and `fog` have their own
 * branches and never reach it.
 */
const UPWARD_VARIANTS = ['bubble']

const TAU = Math.PI * 2

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// Deterministic 32-bit mix, same family as core/pointer.js. Kept local for the
// same reason PointerFx keeps its own colour parser: a control should not break
// because another widget changed its internals.
function hash32(seed, index) {
  return Math.imul((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0
}

/**
 * Per-particle uniform sequence.
 *
 * One mixed seed is enough to start, but each parameter needs its own draw;
 * advancing a cheap xorshift keeps the values independent and reproduces the
 * exact same table on every run.
 */
function sequence(seed, index) {
  let state = hash32(seed, index) || 0x9e3779b9
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0
    return state / 4294967296
  }
}

function span(next, range) {
  return range[0] + (range[1] - range[0]) * next()
}

/**
 * @param {unknown} variant
 * @returns {'snow'|'sakura'|'bubble'|'steam'|'rain'|'fog'|'leaves'} Always a variant the presets know about.
 */
export function normalizeAmbientVariant(variant) {
  return AMBIENT_VARIANTS.includes(variant) ? variant : 'snow'
}

/**
 * How many particles a density setting produces.
 *
 * Density is a percentage of the preset's own count, so 100 means what the
 * preset intends and a caller never has to know how many flakes "90%" is.
 *
 * @param {unknown} variant
 * @param {number} [density=100]
 * @returns {number}
 */
export function ambientCount(variant, density = AMBIENT_DENSITY_DEFAULT) {
  const preset = AMBIENT_PRESETS[normalizeAmbientVariant(variant)]
  const value = Number.isFinite(Number(density))
    ? Number(density)
    : AMBIENT_DENSITY_DEFAULT
  const scaled = Math.round(
    preset.count * (clamp(value, AMBIENT_DENSITY_MIN, AMBIENT_DENSITY_MAX) / 100),
  )
  return clamp(scaled, 1, Math.min(AMBIENT_COUNT_MAX, preset.max))
}

/**
 * Write the parameter table for `count` particles.
 *
 * Called when the variant or the count changes — not per frame. The buffer is
 * rewritten in place and may be longer than needed; only the first
 * `count * AMBIENT_STRIDE` slots are meaningful.
 *
 * @param {unknown} variant
 * @param {number} count
 * @param {Float32Array} out
 * @returns {Float32Array}
 */
export function fillAmbientParticles(variant, count, out) {
  const name = normalizeAmbientVariant(variant)
  const preset = AMBIENT_PRESETS[name]
  const salt = AMBIENT_SALTS[name] || 0x9e3779b1
  const total = Math.max(0, Math.floor(count))

  for (let i = 0; i < total; i += 1) {
    const next = sequence(salt, i)
    const offset = i * AMBIENT_STRIDE

    // Never seeded exactly at 0 or 1: a particle pinned to the edge would half
    // live off screen for its whole life.
    out[offset + AMBIENT_X] = 0.02 + next() * 0.96
    out[offset + AMBIENT_PHASE] = next()
    out[offset + AMBIENT_TRAVEL] = span(next, preset.travel)
    out[offset + AMBIENT_SWAY_AMP] = span(next, preset.swayAmp)
    out[offset + AMBIENT_SWAY_FREQ] = span(next, preset.swayFreq)
    out[offset + AMBIENT_DRIFT] = span(next, preset.drift)
    out[offset + AMBIENT_SIZE] = span(next, preset.size)
    out[offset + AMBIENT_SPIN] = span(next, preset.spin)
    out[offset + AMBIENT_ALPHA] = span(next, preset.alpha)
    out[offset + AMBIENT_TWINKLE] = span(next, preset.twinkle)
  }

  return out
}

// Smoothstep 0..1, the easing behind the bank life ramp.
function smoothstep(value) {
  const v = value < 0 ? 0 : value > 1 ? 1 : value
  return v * v * (3 - 2 * v)
}

// Bank life over one crossing (fog slides horizontally, steam rises
// vertically): fade in from the entry edge, hold, fade out before the exit
// edge. Hides the wrap for a mass far too large to exit the frame cleanly.
function bankLife(progress) {
  return smoothstep(progress / 0.1) * (1 - smoothstep((progress - 0.88) / 0.1))
}

/**
 * Position, rotation and opacity of one particle at time `t`.
 *
 * Both the sway and the twinkle are keyed off absolute time rather than the
 * wrapped phase, so they stay continuous even when the particle wraps from one
 * edge to the other.
 *
 * @param {unknown} variant
 * @param {Float32Array} particles
 * @param {number} offset  `index * AMBIENT_STRIDE`
 * @param {number} t       Seconds since the loop started.
 * @param {number[]} [out] `[x01, y01, rotation, alpha]`, rewritten in place.
 * @returns {number[]}
 */
export function ambientOffset(variant, particles, offset, t, out = [0, 0, 0, 0]) {
  const x0 = particles[offset + AMBIENT_X]
  const phase = particles[offset + AMBIENT_PHASE]
  const travel = particles[offset + AMBIENT_TRAVEL]
  const swayAmp = particles[offset + AMBIENT_SWAY_AMP]
  const swayFreq = particles[offset + AMBIENT_SWAY_FREQ]
  const drift = particles[offset + AMBIENT_DRIFT]
  const spin = particles[offset + AMBIENT_SPIN]
  const alpha = particles[offset + AMBIENT_ALPHA]

  // Wrapped progress down (or up) the screen. `Math.floor` rather than `%` so
  // the result stays correct for the negative values a wrapped phase produces.
  const raw = phase + t / travel
  const progress = raw - Math.floor(raw)

  // Steam is fog's vertical twin: a bank anchored on one axis that crosses
  // the other, faded in and out by the life ramp instead of exiting the
  // frame. The anchor carries a slow bob; drift is unused — steam rises
  // straight.
  if (variant === 'steam') {
    const rawY = phase + t / travel
    const p = rawY - Math.floor(rawY)
    const bob = Math.sin(t * swayFreq * TAU + phase * TAU) * swayAmp
    out[0] = x0 + bob
    out[1] = 1 - p
    out[2] = 0
    out[3] = alpha * bankLife(p)
    return out
  }

  // Fog banks slide sideways instead of falling: the stored X slot doubles as
  // the vertical anchor, the phase doubles as the horizontal start, and sway
  // becomes vertical bobbing. Half the banks drift each way, and `bankLife`
  // fades them over the horizontal edges, which hides the wrap of a mass too
  // wide to exit the frame cleanly.
  if (variant === 'fog') {
    const dir = phase < 0.5 ? -1 : 1
    const rawX = phase + (dir * t) / travel
    const x = rawX - Math.floor(rawX)
    const bob = Math.sin(t * swayFreq * TAU + phase * TAU) * swayAmp
    out[0] = x
    out[1] = x0 + bob
    out[2] = 0
    out[3] = alpha * bankLife(x)
    return out
  }

  // Leaves tumble: the same two sway octaves the steam branch uses, stacked
  // on the generic fall, plus per-leaf spin.
  if (variant === 'leaves') {
    const twinkle = particles[offset + AMBIENT_TWINKLE]
    const eddy = Math.sin(t * swayFreq * 2.4 * TAU + phase * 4.7 * TAU)
    out[0] =
      x0 +
      drift * (progress - 0.5) +
      Math.sin(t * swayFreq * TAU + phase * TAU) * swayAmp +
      eddy * swayAmp * 0.5
    out[1] = progress
    out[2] = phase * TAU + t * spin
    out[3] = alpha * (0.78 + 0.22 * Math.sin(t * twinkle * TAU + phase * TAU))
    return out
  }

  const y = UPWARD_VARIANTS.includes(variant) ? 1 - progress : progress
  const twinkle = particles[offset + AMBIENT_TWINKLE]

  // `drift` tilts the fall so petals travel, `sway` makes them tumble around
  // that line. Both are fractions of the viewport width.
  out[0] = x0 + drift * (y - 0.5) + Math.sin(t * swayFreq * TAU + phase * TAU) * swayAmp
  out[1] = y
  out[2] = phase * TAU + t * spin
  out[3] = alpha * (0.78 + 0.22 * Math.sin(t * twinkle * TAU + phase * TAU))
  return out
}

/**
 * Split a `#rrggbb` colour into channels, falling back to the default accent.
 *
 * @param {unknown} hex
 * @returns {[number, number, number]}
 */
export function ambientRgb(hex) {
  const value = isHexColor(hex) ? String(hex).trim() : AMBIENT_DEFAULT_COLOR
  const packed = parseInt(value.slice(1), 16)
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
}

/**
 * The tint a variant uses when the caller passes no `colorHex`.
 *
 * Every variant except `bubble` carries its own colour: a blue snowflake, a
 * pink petal or an accent-tinted raindrop looks like a mistake, so only
 * `bubble` follows the theme accent.
 *
 * @param {unknown} variant
 * @returns {string} `#rrggbb`, or `''` when the caller should read the accent
 */
export function ambientPresetColor(variant) {
  return AMBIENT_PRESETS[normalizeAmbientVariant(variant)].color
}
