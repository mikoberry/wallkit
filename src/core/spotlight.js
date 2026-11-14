// Spotlight helpers.
//
// The spotlight is a CSS-only effect: a full-bleed overlay whose background is a
// radial gradient, so a "light" hole follows the pointer while everything else
// is darkened. There is no canvas and no per-frame drawing — the only thing
// that moves is the gradient origin, which the component writes as a CSS
// custom property on pointer events.
//
// Everything here is pure: no DOM, no React, no timers. The gradient strings
// are built once per prop change (in a memo), never inside an event handler.

import { isHexColor } from './audio.js'

export const SPOTLIGHT_SIZE_MIN = 80
export const SPOTLIGHT_SIZE_MAX = 3000
export const SPOTLIGHT_SIZE_DEFAULT = 420

// How soft the edge is, as a fraction of the light radius. 0 is a hard rim;
// 1 makes the falloff as wide as the circle itself.
export const SPOTLIGHT_FEATHER_MIN = 0
export const SPOTLIGHT_FEATHER_MAX = 1
export const SPOTLIGHT_FEATHER_DEFAULT = 0.45

// Opacity of the darkened area, 0..1. 1 is fully black outside the light.
export const SPOTLIGHT_DIM_MIN = 0
export const SPOTLIGHT_DIM_MAX = 1
export const SPOTLIGHT_DIM_DEFAULT = 0.72

// Strength of the soft highlight inside the circle, 0..1. This is what makes
// the ring read as a *lit* spot rather than just a hole in the dark: it is
// blended with `screen`, so it can only brighten what is already there.
export const SPOTLIGHT_GLOW_MIN = 0
export const SPOTLIGHT_GLOW_MAX = 1
export const SPOTLIGHT_GLOW_DEFAULT = 0.22

// Follow lag, as a time constant in seconds. 0 snaps to the pointer on every
// event; 0.05–0.2 gives the light a little weight without feeling detached.
export const SPOTLIGHT_SMOOTHING_MIN = 0
export const SPOTLIGHT_SMOOTHING_MAX = 0.5
export const SPOTLIGHT_SMOOTHING_DEFAULT = 0.05

export const SPOTLIGHT_DARK_DEFAULT = '#000000'
export const SPOTLIGHT_LIGHT_DEFAULT = '#ffffff'

// Number of stops used to approximate the smoothstep falloff. Six is enough
// that the ramp never shows a mach band on a dark wallpaper, and the string is
// built once per prop change anyway.
const STOP_STEPS = 6

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Parse `#rrggbb` into channels, falling back so an invalid value never paints
 * nothing.
 *
 * @param {string} hex
 * @param {string} fallback
 * @returns {[number, number, number]}
 */
function rgb(hex, fallback) {
  const value = isHexColor(hex) ? hex.trim() : fallback
  const packed = parseInt(value.slice(1), 16)
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
}

function rgba([r, g, b], alpha) {
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp(alpha, 0, 1) * 1000) / 1000})`
}

/**
 * The darkening layer: transparent over the light circle, then a smoothstep
 * ramp out to full `dim` at the edge of the feather.
 *
 * The origin is read from `--wallkit-spotlight-x` / `--wallkit-spotlight-y` on
 * the element, so moving the light only rewrites two custom properties instead
 * of rebuilding this string.
 *
 * @param {Object} [options]
 * @param {number} [options.size=SPOTLIGHT_SIZE_DEFAULT]         Light diameter, px.
 * @param {number} [options.feather=SPOTLIGHT_FEATHER_DEFAULT]   Edge softness, 0..1.
 * @param {number} [options.dim=SPOTLIGHT_DIM_DEFAULT]           Outside opacity, 0..1.
 * @param {string} [options.darkColor=SPOTLIGHT_DARK_DEFAULT]    What the dark is made of.
 * @returns {string} A `radial-gradient(...)` value.
 */
export function spotlightMaskGradient({
  size = SPOTLIGHT_SIZE_DEFAULT,
  feather = SPOTLIGHT_FEATHER_DEFAULT,
  dim = SPOTLIGHT_DIM_DEFAULT,
  darkColor = SPOTLIGHT_DARK_DEFAULT,
} = {}) {
  const radius = clamp(Number(size) || SPOTLIGHT_SIZE_DEFAULT, SPOTLIGHT_SIZE_MIN, SPOTLIGHT_SIZE_MAX) / 2
  const soft = clamp(Number.isFinite(feather) ? feather : SPOTLIGHT_FEATHER_DEFAULT, 0, SPOTLIGHT_FEATHER_MAX)
  const alpha = clamp(Number.isFinite(dim) ? dim : SPOTLIGHT_DIM_DEFAULT, SPOTLIGHT_DIM_MIN, SPOTLIGHT_DIM_MAX)
  const [r, g, b] = rgb(darkColor, SPOTLIGHT_DARK_DEFAULT)

  // `feather` 0 would put the ramp over zero pixels, which some renderers draw
  // as a hard aliased step; a 0.5px ladder is enough to stay crisp-but-smooth.
  const outer = radius + Math.max(1, radius * soft)
  const corePos = (radius / outer) * 100

  const stops = [`rgba(${r}, ${g}, ${b}, 0) 0%`, `rgba(${r}, ${g}, ${b}, 0) ${corePos.toFixed(2)}%`]
  for (let i = 1; i <= STOP_STEPS; i += 1) {
    const t = i / STOP_STEPS
    // smoothstep: no visible seam where the ramp meets the flat centre or the
    // flat dark, which a linear ramp shows on a near-black background.
    const eased = t * t * (3 - 2 * t)
    const position = corePos + (100 - corePos) * t
    stops.push(`${rgba([r, g, b], alpha * eased)} ${position.toFixed(2)}%`)
  }

  return `radial-gradient(circle ${outer.toFixed(2)}px at var(--wallkit-spotlight-x, 50%) var(--wallkit-spotlight-y, 50%), ${stops.join(', ')})`
}

/**
 * The soft highlight inside the circle. Painted on a separate layer with
 * `mix-blend-mode: screen`, so it brightens the wallpaper instead of veiling it.
 *
 * @param {Object} [options]
 * @param {number} [options.size=SPOTLIGHT_SIZE_DEFAULT]        Light diameter, px.
 * @param {number} [options.feather=SPOTLIGHT_FEATHER_DEFAULT]  Widens the halo slightly.
 * @param {number} [options.glow=SPOTLIGHT_GLOW_DEFAULT]        Highlight strength, 0..1.
 * @param {string} [options.lightColor=SPOTLIGHT_LIGHT_DEFAULT] Highlight colour.
 * @returns {string} A `radial-gradient(...)` value.
 */
export function spotlightGlowGradient({
  size = SPOTLIGHT_SIZE_DEFAULT,
  feather = SPOTLIGHT_FEATHER_DEFAULT,
  glow = SPOTLIGHT_GLOW_DEFAULT,
  lightColor = SPOTLIGHT_LIGHT_DEFAULT,
} = {}) {
  const radius = clamp(Number(size) || SPOTLIGHT_SIZE_DEFAULT, SPOTLIGHT_SIZE_MIN, SPOTLIGHT_SIZE_MAX) / 2
  const soft = clamp(Number.isFinite(feather) ? feather : SPOTLIGHT_FEATHER_DEFAULT, 0, SPOTLIGHT_FEATHER_MAX)
  const strength = clamp(Number.isFinite(glow) ? glow : SPOTLIGHT_GLOW_DEFAULT, SPOTLIGHT_GLOW_MIN, SPOTLIGHT_GLOW_MAX)
  const rgbLight = rgb(lightColor, SPOTLIGHT_LIGHT_DEFAULT)

  // Slightly wider than the light so the halo does not end exactly on the rim.
  const outer = radius * (1.1 + soft * 0.5)
  return `radial-gradient(circle ${outer.toFixed(2)}px at var(--wallkit-spotlight-x, 50%) var(--wallkit-spotlight-y, 50%), ${[
    `${rgba(rgbLight, strength)} 0%`,
    `${rgba(rgbLight, strength * 0.62)} 38%`,
    `${rgba(rgbLight, strength * 0.24)} 68%`,
    `${rgba(rgbLight, 0)} 100%`,
  ].join(', ')})`
}

/**
 * Frame-rate independent catch-up, used when `smoothing` > 0 so the light
 * trails the pointer with a little weight.
 *
 * `tau` is a time constant in seconds: after `tau` the light has covered ~63%
 * of the remaining distance. `tau <= 0` returns the target unchanged, which is
 * how the component skips the animation loop entirely.
 *
 * @param {number} current
 * @param {number} target
 * @param {number} tau             Seconds; 0 means "no lag".
 * @param {number} deltaSeconds
 * @returns {number}
 */
export function spotlightApproach(current, target, tau, deltaSeconds) {
  if (!Number.isFinite(tau) || tau <= 0) return target
  if (!Number.isFinite(current)) return target
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current
  const alpha = 1 - Math.exp(-deltaSeconds / tau)
  const next = current + (target - current) * alpha
  // Snap once the remainder is sub-pixel, so the loop can stop instead of
  // asymptotically creeping forever.
  return Math.abs(target - next) < 0.35 ? target : next
}
