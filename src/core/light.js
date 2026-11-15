// Light helpers — a directional wash of light over the whole picture.
//
// Same rendering contract as the spotlight: the entire effect is a stack of CSS
// gradients whose origin lives in two custom properties, so following the
// pointer is a two-line style write instead of a redraw. No canvas, no draw
// loop, no timers.
//
// The one thing this file does NOT decide is *when* the light moves — that is
// the component's job (and it borrows `spotlightApproach()` for the easing, so
// both pointer-driven layers lag identically).
//
// Everything here is pure: no DOM, no React, no timers.

import { ANCHORS, anchorPoint } from './anchor.js'
import { isHexColor } from './audio.js'

export const LIGHT_VARIANTS = ['sun', 'moon', 'dusk', 'overcast']
export const LIGHT_VARIANT_DEFAULT = 'sun'

// Where the light centre sits. It is an anchor point — the same nine the
// floating widgets use — plus offsets, because a light has no box of its own
// and "the sun is at the top-left" is all an author wants to say. Sunlight has
// to come from somewhere, so the default is the top-left corner rather than
// `ANCHOR_DEFAULT` (bottom-left), which would light the picture from below.
export const LIGHT_ANCHOR_DEFAULT = 'top-left'

// Strength as a percentage of the preset's own alphas. Above 100 the alphas
// climb towards opaque; the range stops at 200 because by then the wide wash is
// already saturated and further steps do nothing.
export const LIGHT_INTENSITY_MIN = 0
export const LIGHT_INTENSITY_MAX = 200
export const LIGHT_INTENSITY_DEFAULT = 100

// Radius of the wide wash, in px. Omitted, the preset picks one.
export const LIGHT_SIZE_MIN = 200
export const LIGHT_SIZE_MAX = 4000
export const LIGHT_SIZE_FALLBACK = 1400

// Shaft strength, 0..1. Omitted, the preset picks one; `0` is legitimate and
// means "flat light" (that is what overcast is).
export const LIGHT_RAYS_MIN = 0
export const LIGHT_RAYS_MAX = 1

// How far the light travels towards the pointer, 0..1. 0 pins it to the
// configured corner, 1 puts it on the pointer (still clamped above the horizon).
export const LIGHT_FOLLOW_MIN = 0
export const LIGHT_FOLLOW_MAX = 1
export const LIGHT_FOLLOW_DEFAULT = 0.45

// Follow lag, as a time constant in seconds — same unit and meaning as
// `Spotlight.smoothing`, a touch slower because a sun is heavier than a torch.
export const LIGHT_SMOOTHING_MIN = 0
export const LIGHT_SMOOTHING_MAX = 0.5
export const LIGHT_SMOOTHING_DEFAULT = 0.12

// How far *outside* the box the light may sit, in percent of the box. Reachable
// through a negative offset: a streetlamp or a window just off camera is a
// legitimate source, and gradients accept origins outside 0–100%, so there is
// no reason to stop at the edge. Bounded only to keep a typo (offset -4000)
// from parking the light in another postcode.
export const LIGHT_ORIGIN_EXTENT = 100

// The *pointer* never drags the light below this fraction of the box height:
// a sun that chased the cursor into the bottom half would light the picture
// from below. The anchor itself is not clamped — that is a deliberate choice by
// the caller, not a side effect of moving the mouse.
export const LIGHT_ORIGIN_MAX_Y = 0.6

// Per-variant look. Every number the stylesheet would otherwise have to know
// lives here, so a new variant is one entry and no CSS.
//
//   size        wash radius in px at 1080p
//   color       shaft / wash tint
//   coreColor   the tight hotspot, brighter and closer to white
//   washAlpha   alpha of the wide wash at intensity 100
//   coreAlpha   alpha of the hotspot at intensity 100
//   rayAlpha    alpha of a shaft at `rays = 1`
//   wedge       degrees one shaft occupies
//   period      degrees from one shaft to the next
//   maskInner   where the shafts start, as a fraction of the wash radius.
//               Non-zero on purpose: a shaft fan seen from its own apex looks
//               like a star filter, not like daylight.
//   maskOuter   where they have faded out
//   angleOffset degrees added to the corner's base direction
export const LIGHT_PRESETS = {
  sun: {
    size: 1400,
    color: '#fff1c9',
    coreColor: '#fffdf2',
    washAlpha: 0.4,
    coreAlpha: 0.55,
    rayAlpha: 0.4,
    wedge: 5,
    period: 26,
    maskInner: 0.18,
    maskOuter: 0.95,
    angleOffset: 0,
  },
  moon: {
    size: 1100,
    color: '#bcd2ff',
    coreColor: '#e9f1ff',
    washAlpha: 0.3,
    coreAlpha: 0.42,
    rayAlpha: 0.22,
    wedge: 12,
    period: 58,
    maskInner: 0.12,
    maskOuter: 1.1,
    angleOffset: 4,
  },
  // Low sun: warmer, longer shafts, and the direction is pushed from
  // "down-right" (135°) towards "right" so the light rakes across the frame.
  dusk: {
    size: 1750,
    color: '#ffae74',
    coreColor: '#ffe0b4',
    washAlpha: 0.44,
    coreAlpha: 0.52,
    rayAlpha: 0.36,
    wedge: 6,
    period: 32,
    maskInner: 0.2,
    maskOuter: 1.05,
    angleOffset: -20,
  },
  // No shafts at all: an overcast sky is a huge, flat, slightly cool source.
  overcast: {
    size: 2400,
    color: '#d6e0ef',
    coreColor: '#f2f7ff',
    washAlpha: 0.26,
    coreAlpha: 0.18,
    rayAlpha: 0,
    wedge: 0,
    period: 0,
    maskInner: 0,
    maskOuter: 1,
    angleOffset: 0,
  },
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function rgb(hex, fallback) {
  const value = isHexColor(hex) ? hex.trim() : fallback
  const packed = parseInt(value.slice(1), 16)
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255]
}

function rgba([r, g, b], alpha) {
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp(alpha, 0, 1) * 1000) / 1000})`
}

function finite(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

/**
 * @param {*} value
 * @returns {string} One of `LIGHT_VARIANTS`.
 */
export function normalizeLightVariant(value) {
  return LIGHT_VARIANTS.includes(value) ? value : LIGHT_VARIANT_DEFAULT
}

/**
 * @param {*} value
 * @returns {string} One of `ANCHORS`.
 */
export function normalizeLightAnchor(value) {
  return ANCHORS.includes(value) ? value : LIGHT_ANCHOR_DEFAULT
}

/**
 * Resolve one numeric prop against a preset value. `undefined` / `null` /
 * garbage mean "use the preset", which is how a variant can own a size without
 * the component hard-coding one per variant.
 *
 * @param {*} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function lightNumber(value, fallback, min, max) {
  if (value == null || value === '') return fallback
  return clamp(finite(value, fallback), min, max)
}

// The anchor is a *point*, so it has to be expressed as a fraction even when it
// sits outside the box — see `LIGHT_ORIGIN_EXTENT`.
const ORIGIN_FRACTION_MIN = -LIGHT_ORIGIN_EXTENT / 100
const ORIGIN_FRACTION_MAX = 1 + LIGHT_ORIGIN_EXTENT / 100

function clampOrigin(fraction) {
  return clamp(fraction, ORIGIN_FRACTION_MIN, ORIGIN_FRACTION_MAX)
}

/**
 * One offset as a fraction of the box.
 *
 * A number is a percentage, exactly like `anchorStyle`'s numeric form, and a
 * percentage string is accepted because that is the only unit that can be
 * resolved without measuring the box. `px` / `vh` would silently mean "0" here,
 * so they are rejected rather than half-supported.
 *
 * @param {*} value
 * @returns {number} Fractions of the box; 0 for anything unusable.
 */
export function lightOffsetFraction(value) {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text.endsWith('%')) return 0
    const parsed = Number.parseFloat(text)
    return Number.isFinite(parsed) ? parsed / 100 : 0
  }
  const number = Number(value)
  return Number.isFinite(number) ? number / 100 : 0
}

/**
 * The light centre placed the way the whole library places widgets: on one of
 * the nine anchor points, plus offsets measured from it.
 *
 * The point that coincides is the **light centre**, not a box corner — this
 * layer has no box of its own, and "the sun is at the top-left" is the thing an
 * author wants to say. Offsets keep the `anchorStyle` sign rule: a number always
 * grows *inward*, so on `top-right` a positive `offsetX` moves the light left,
 * and on `bottom-*` a positive `offsetY` moves it up. That way one number means
 * "further in" on every corner instead of flipping between left and right.
 *
 * The light may leave the box: a negative offset pushes the source out of
 * frame, up to `LIGHT_ORIGIN_EXTENT` beyond the edge.
 *
 * @param {string} anchor One of `ANCHORS` (see `core/anchor.js`).
 * @param {number|string} [offsetX=0] Percentage of the box width, growing inward.
 * @param {number|string} [offsetY=0] Percentage of the box height, growing inward.
 * @returns {{ x: number, y: number }} Fractions of the box; may be negative.
 */
export function lightAnchorOrigin(anchor, offsetX = 0, offsetY = 0) {
  const point = anchorPoint(normalizeLightAnchor(anchor))
  // A right/bottom anchor is measured from that edge, so "inward" is negative.
  const dx = lightOffsetFraction(offsetX) * (point.x === 1 ? -1 : 1)
  const dy = lightOffsetFraction(offsetY) * (point.y === 1 ? -1 : 1)
  return { x: clampOrigin(point.x + dx), y: clampOrigin(point.y + dy) }
}

/**
 * Blend the resting position towards the pointer.
 *
 * `pointer` is `{ x, y }` in 0..1 of the box; `null` means "no pointer yet" and
 * returns the base position unchanged. The pointer's y is clamped above the
 * horizon *before* blending, so dragging to the bottom of the screen slides the
 * light to the horizon and no further instead of flipping the scene into a
 * floor-lit one. The base position is left alone: an explicit `originY` may sit
 * wherever the caller wants it.
 *
 * The result is in percentages (0..100), ready to be written into the CSS
 * custom properties.
 *
 * @param {{ x: number, y: number }} base      Fractions of the box.
 * @param {{ x: number, y: number } | null} pointer
 * @param {number} [follow=LIGHT_FOLLOW_DEFAULT]
 * @returns {{ x: number, y: number }} Percentages.
 */
export function lightFollowOrigin(base, pointer, follow = LIGHT_FOLLOW_DEFAULT) {
  // `clampOrigin`, not 0..1: an anchored light may legitimately sit outside the
  // box, and pinning it to the edge here would undo that on the first event.
  const bx = clampOrigin(finite(base && base.x, 0))
  const by = clampOrigin(finite(base && base.y, 0))

  if (!pointer) return { x: bx * 100, y: by * 100 }

  const weight = clamp(finite(follow, LIGHT_FOLLOW_DEFAULT), LIGHT_FOLLOW_MIN, LIGHT_FOLLOW_MAX)
  const px = clamp(finite(pointer.x, bx), 0, 1)
  const py = clamp(finite(pointer.y, by), 0, LIGHT_ORIGIN_MAX_Y)

  return {
    x: (bx + (px - bx) * weight) * 100,
    y: (by + (py - by) * weight) * 100,
  }
}

/**
 * The wide wash plus the hotspot, as one `background-image` stack (hotspot
 * first, so it paints on top).
 *
 * The origin is read from `--wallkit-light-x` / `-y` on the element, so moving
 * the light rewrites two custom properties instead of rebuilding this string.
 *
 * @param {Object} options
 * @param {number} options.size      Wash radius, px.
 * @param {string} options.color     Wash tint, `#rrggbb`.
 * @param {string} options.coreColor Hotspot tint, `#rrggbb`.
 * @param {number} options.washAlpha 0..1.
 * @param {number} options.coreAlpha 0..1.
 * @returns {string}
 */
export function lightWashGradient({ size, color, coreColor, washAlpha, coreAlpha } = {}) {
  const radius = clamp(finite(size, LIGHT_SIZE_FALLBACK), LIGHT_SIZE_MIN, LIGHT_SIZE_MAX)
  const washRgb = rgb(color, LIGHT_PRESETS.sun.color)
  const coreRgb = rgb(coreColor, color)
  const wash = clamp(finite(washAlpha, LIGHT_PRESETS.sun.washAlpha), 0, 1)
  const core = clamp(finite(coreAlpha, LIGHT_PRESETS.sun.coreAlpha), 0, 1)
  const at = 'var(--wallkit-light-x, 50%) var(--wallkit-light-y, 30%)'

  // The hotspot is a fixed fraction of the wash so scaling `size` keeps the
  // sun disc in proportion with the pool of light around it.
  const coreRadius = Math.max(24, radius * 0.13)

  const hotspot = [
    `${rgba(coreRgb, core)} 0%`,
    `${rgba(coreRgb, core * 0.56)} 34%`,
    `${rgba(coreRgb, core * 0.2)} 66%`,
    `${rgba(coreRgb, 0)} 100%`,
  ].join(', ')

  const pool = [
    `${rgba(washRgb, wash)} 0%`,
    `${rgba(washRgb, wash * 0.74)} 24%`,
    `${rgba(washRgb, wash * 0.34)} 52%`,
    `${rgba(washRgb, wash * 0.1)} 74%`,
    `${rgba(washRgb, 0)} 94%`,
  ].join(', ')

  return [
    `radial-gradient(circle ${coreRadius.toFixed(1)}px at ${at}, ${hotspot})`,
    `radial-gradient(circle ${radius.toFixed(1)}px at ${at}, ${pool})`,
  ].join(', ')
}

// One family of shafts. `repeating-conic-gradient` gives hard-edged wedges, so
// the peak is reached over the first third of the wedge and released over the
// rest — a single stop pair would read as a vector starburst.
function shaftLayer(shaftRgb, alpha, wedge, period) {
  const width = Math.max(3, wedge)
  const step = Math.max(width * 1.7, period)
  const at = 'var(--wallkit-light-angle, 135deg) at var(--wallkit-light-x, 50%) var(--wallkit-light-y, 30%)'

  const stops = [
    `${rgba(shaftRgb, 0)} 0deg`,
    `${rgba(shaftRgb, alpha * 0.55)} ${(width * 0.24).toFixed(2)}deg`,
    `${rgba(shaftRgb, alpha)} ${(width * 0.42).toFixed(2)}deg`,
    `${rgba(shaftRgb, alpha * 0.5)} ${(width * 0.66).toFixed(2)}deg`,
    `${rgba(shaftRgb, 0)} ${width.toFixed(2)}deg`,
    `${rgba(shaftRgb, 0)} ${step.toFixed(2)}deg`,
  ].join(', ')

  return `repeating-conic-gradient(from ${at}, ${stops})`
}

/**
 * The shafts. Two families at different widths and periods: one alone repeats
 * visibly, and the second one is what breaks the rhythm.
 *
 * Returns `''` when there is no light to draw, and the component then renders
 * no beam layer at all.
 *
 * @param {Object} options
 * @param {string} options.color  Shaft tint, `#rrggbb`.
 * @param {number} options.rayAlpha 0..1.
 * @param {number} options.wedge    Degrees per shaft.
 * @param {number} options.period   Degrees between shafts.
 * @returns {string}
 */
export function lightBeamGradient({ color, rayAlpha, wedge, period } = {}) {
  const alpha = clamp(finite(rayAlpha, 0), 0, 1)
  if (alpha <= 0) return ''

  const shaftRgb = rgb(color, LIGHT_PRESETS.sun.color)
  const shaftWedge = Math.max(3, finite(wedge, LIGHT_PRESETS.sun.wedge))
  const shaftPeriod = Math.max(shaftWedge * 1.7, finite(period, LIGHT_PRESETS.sun.period))

  return [
    shaftLayer(shaftRgb, alpha, shaftWedge, shaftPeriod),
    // Wider, fainter, differently spaced, and rotated by half a period so the
    // two families never line up into a moiré.
    shaftLayer(shaftRgb, alpha * 0.5, shaftWedge * 1.9, shaftPeriod * 2.35 + shaftWedge * 0.5),
  ].join(', ')
}

/**
 * The mask that turns the shaft fan into something that looks like daylight:
 * nothing at the apex, full strength a little further out, gone by the edge.
 *
 * Without `maskInner` the conic gradients converge on a single point and the
 * picture reads as a star filter instead of a light source outside the frame.
 *
 * @param {Object} options
 * @param {number} options.size       Wash radius, px.
 * @param {number} options.maskInner  Fraction of the radius where shafts begin.
 * @param {number} options.maskOuter  Fraction of the radius where they end.
 * @returns {string}
 */
export function lightBeamMask({ size, maskInner, maskOuter } = {}) {
  const radius = Math.max(24, clamp(finite(size, LIGHT_SIZE_FALLBACK), LIGHT_SIZE_MIN, LIGHT_SIZE_MAX) * 1.15)
  const inner = clamp(finite(maskInner, 0.16), 0, 0.9)
  const outer = Math.max(inner + 0.1, clamp(finite(maskOuter, 0.94), 0.1, 1.4))

  // All positions are fractions of `radius`, written as stops so the ramp can
  // be eased without a second mask.
  const at = (fraction) => `${(Math.min(fraction, 1) * 100).toFixed(2)}%`
  const stops = [
    'rgba(0, 0, 0, 0) 0%',
    `rgba(0, 0, 0, 0) ${at(inner)}`,
    `rgba(0, 0, 0, 0.82) ${at(inner + (outer - inner) * 0.22)}`,
    `rgba(0, 0, 0, 0.9) ${at(inner + (outer - inner) * 0.45)}`,
    `rgba(0, 0, 0, 0.52) ${at(inner + (outer - inner) * 0.72)}`,
    'rgba(0, 0, 0, 0) 100%',
  ].join(', ')

  return `radial-gradient(circle ${radius.toFixed(1)}px at var(--wallkit-light-x, 50%) var(--wallkit-light-y, 30%), ${stops})`
}

/**
 * Phase of the shaft fan, in CSS degrees (0 = up, 90 = right).
 *
 * Derived from the anchor rather than configured: shafts always travel *away*
 * from the source, so a light in `top-left` throws them down-right (135°) and
 * one in `bottom-right` up-left (315°). Deriving it means the two can never be
 * set to contradict each other — an anchor that placed the sun at the bottom
 * while the shafts rained downward would light the picture from a floor lamp
 * and read as a bug.
 *
 * The variant nudges the base angle (`angleOffset`), which is what makes a low
 * dusk sun rake across the frame instead of pointing at the opposite corner.
 * The angle is fixed per render rather than following the pointer: moving the
 * sun slides the shafts, it does not spin them.
 *
 * @param {string} anchor
 * @param {number} [angleOffset=0]
 * @returns {number}
 */
export function lightBeamAngle(anchor, angleOffset = 0) {
  const point = anchorPoint(normalizeLightAnchor(anchor))
  // Direction towards the middle of the box. A centred light has no such
  // direction, so it throws the shafts straight down.
  const dx = 0.5 - point.x
  const dy = 0.5 - point.y
  const base = dx === 0 && dy === 0 ? 180 : (Math.atan2(dx, -dy) * 180) / Math.PI
  const offset = clamp(finite(angleOffset, 0), -90, 90)
  return (((base + offset) % 360) + 360) % 360
}
