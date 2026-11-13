// Shared spectrum canvas.
//
// `Spectrum` (a floating overlay) and `MiniSpectrum` (fills whatever box its
// parent gives it) paint exactly the same pixels; they differ only in how their
// box is sized and positioned. Everything that is identical lives here: the 2D
// context, the per-frame smoothing, the renderer table, and the frame loop.
//
// Keeping one loop means the two widgets cannot drift apart — a fix to the
// smoothing or the reduced-motion handling applies to both.
//
// The caller owns the box. This module only draws into the canvas it renders,
// so it must be placed inside a parent with a definite size.

import { useEffect, useRef } from 'react'
import {
  DEFAULT_SPECTRUM_COLOR,
  SPECTRUM_BARS,
  SPECTRUM_CURVE_DEFAULT,
  SPECTRUM_CURVE_MAX,
  SPECTRUM_CURVE_MIN,
  SPECTRUM_INTENSITY_DEFAULT,
  SPECTRUM_INTENSITY_MAX,
  SPECTRUM_INTENSITY_MIN,
  bassLevel,
  isHexColor,
  prefersReducedMotion,
  resampleBars,
  shapeSpectrumLevel,
  smoothAudioLevel,
} from '../../core/index.js'
import { SPECTRUM_RENDERERS, SPECTRUM_STYLES, createRendererState } from './renderers.js'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Resolve the drawing colour: an explicit prop wins, otherwise the inherited
 * theme token, otherwise the shared default.
 *
 * @param {string|undefined} colorHex
 * @param {HTMLElement|null} host
 * @returns {string}
 */
export function resolveColor(colorHex, host) {
  if (isHexColor(colorHex)) return colorHex.trim().toLowerCase()
  if (host && typeof window !== 'undefined') {
    const token = window.getComputedStyle(host).getPropertyValue('--wallkit-accent').trim()
    if (isHexColor(token)) return token.toLowerCase()
  }
  return DEFAULT_SPECTRUM_COLOR
}

/**
 * Turn the response props into the shape `shapeSpectrumLevel` expects.
 *
 * @param {number} intensity Percent (0..1000); 100 leaves the bars unchanged.
 * @param {number} curve     Exponent (0.2..2); 1 is linear.
 * @returns {{ intensity: number, curve: number }}
 */
export function resolveShape(intensity, curve) {
  const gain =
    clamp(Number(intensity) || 0, SPECTRUM_INTENSITY_MIN, SPECTRUM_INTENSITY_MAX) / 100
  const exponent = Number.isFinite(curve)
    ? clamp(curve, SPECTRUM_CURVE_MIN, SPECTRUM_CURVE_MAX)
    : SPECTRUM_CURVE_DEFAULT
  return { intensity: gain, curve: exponent }
}

/**
 * A canvas that paints the caller's bars with the shared draw loop.
 *
 * It renders nothing meaningful without a sized parent: the canvas is 100% of
 * its box, and the backing store is measured from `offsetWidth` / `offsetHeight`
 * so no transform on an ancestor can double-scale it.
 *
 * @param {Object} props
 * @param {Float32Array|number[]|null} props.bars Bar magnitudes, 0..1. No bars
 *   means no loop — there is no synthetic fallback.
 * @param {'bars'|'mirror'|'curve'|'pill'|'ring'|'ringwave'|'dots'|'ripples'|'aurora'} [props.variant='bars']
 * @param {string} [props.colorHex]  `#rrggbb`; defaults to `--wallkit-accent`.
 * @param {number} [props.intensity=100]
 * @param {number} [props.curve=1]
 * @param {number} [props.barCount]  Fold the incoming bars to this many columns
 *   before drawing. Omit to draw one column per incoming bar.
 * @param {boolean} [props.paused=false] Cancel the rAF while true.
 * @param {string} [props.className]
 */
export default function SpectrumCanvas({
  bars,
  variant = 'bars',
  colorHex,
  intensity = SPECTRUM_INTENSITY_DEFAULT,
  curve = SPECTRUM_CURVE_DEFAULT,
  barCount,
  paused = false,
  className,
}) {
  const canvasRef = useRef(null)
  // The loop is created once per pause state; refs let new bars, a colour
  // change, a variant switch and the response settings reach it without tearing
  // the animation down.
  const barsRef = useRef(null)
  const colorRef = useRef(DEFAULT_SPECTRUM_COLOR)
  const variantRef = useRef('bars')
  const shapeRef = useRef({ intensity: 1, curve: 1 })
  const barCountRef = useRef(0)
  // Phase and per-style state outlive the loop, so pausing (which cancels the
  // rAF) or switching style resumes instead of snapping back to zero.
  const elapsedRef = useRef(0)
  const stateRef = useRef({})
  const stateVariantRef = useRef(null)

  const hasBars = bars != null && bars.length > 0
  const resolvedVariant = SPECTRUM_STYLES.includes(variant) ? variant : 'bars'

  useEffect(() => {
    barsRef.current = hasBars ? bars : null
  }, [bars, hasBars])

  useEffect(() => {
    variantRef.current = resolvedVariant
  }, [resolvedVariant])

  useEffect(() => {
    shapeRef.current = resolveShape(intensity, curve)
  }, [intensity, curve])

  useEffect(() => {
    const next = Number.isFinite(barCount) ? Math.floor(barCount) : 0
    barCountRef.current = next > 0 ? next : 0
  }, [barCount])

  // Colour is read from the DOM, so it has to wait for the element to exist.
  // Re-running on `resolvedVariant` covers a theme-class change on the parent.
  useEffect(() => {
    colorRef.current = resolveColor(colorHex, canvasRef.current)
  }, [colorHex, resolvedVariant, hasBars])

  useEffect(() => {
    // No loop while paused: the rAF is cancelled outright rather than spinning
    // and skipping work, so a paused wallpaper really costs nothing.
    if (!hasBars || paused) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined

    const context = canvas.getContext('2d')
    if (!context) return undefined

    let count = SPECTRUM_BARS
    let targets = new Float32Array(count)
    let levels = new Float32Array(count)

    // Restore the state bag matching the current variant, or make a fresh one
    // when the variant changed while the loop was stopped.
    if (stateVariantRef.current !== variantRef.current) {
      stateRef.current = createRendererState(variantRef.current)
      stateVariantRef.current = variantRef.current
    }

    const reducedMotion = prefersReducedMotion()

    let frameId = 0
    let lastTime = performance.now()
    // Animation clock in seconds, advanced only on frames that actually draw, so
    // pausing freezes the visuals instead of skipping them ahead.
    let elapsed = elapsedRef.current

    const resize = () => {
      // offsetWidth/offsetHeight describe the layout box and ignore any transform
      // on an ancestor. getBoundingClientRect would report the *scaled* size, so a
      // zoom change plus a window resize would double-scale the backing store.
      const width = Math.max(1, Math.round(canvas.offsetWidth))
      const height = Math.max(1, Math.round(canvas.offsetHeight))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
    }

    const tick = (now) => {
      const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 0.05)
      lastTime = now

      // Reduced motion freezes the time-driven decoration (ring spin, ripples,
      // aurora sway) while the level response keeps working.
      if (!reducedMotion) elapsed += delta
      elapsedRef.current = elapsed

      // A variant switch swaps the renderer and its state bag without rebuilding
      // the loop, so the spin phase carries over between ring styles.
      const activeVariant = variantRef.current
      if (stateVariantRef.current !== activeVariant) {
        stateRef.current = createRendererState(activeVariant)
        stateVariantRef.current = activeVariant
      }

      const source = barsRef.current
      // `barCount` folds the incoming bars into fewer, wider columns. This is a
      // drawing-density choice, so it happens per frame rather than in render:
      // callers commonly mutate one Float32Array in place, and a memoised fold
      // would silently keep drawing the first frame.
      const foldTo = barCountRef.current
      const drawCount = foldTo > 0 ? foldTo : source && source.length > 0 ? source.length : count

      if (drawCount !== count) {
        count = drawCount
        targets = new Float32Array(count)
        levels = new Float32Array(count)
      }

      if (source && source.length > 0) {
        if (foldTo > 0) {
          resampleBars(source, foldTo, targets)
        } else {
          for (let i = 0; i < count; i += 1) targets[i] = source[i]
        }
      } else {
        targets.fill(0)
      }

      // Shape each band by the caller's response settings, then smooth it.
      const shape = shapeRef.current
      for (let i = 0; i < count; i += 1) {
        levels[i] = smoothAudioLevel(levels[i], shapeSpectrumLevel(targets[i], shape), delta)
      }

      context.clearRect(0, 0, canvas.width, canvas.height)
      const render = SPECTRUM_RENDERERS[activeVariant] ?? SPECTRUM_RENDERERS.bars
      render(context, levels, canvas.width, canvas.height, colorRef.current, stateRef.current, {
        time: elapsed,
        bass: bassLevel(levels),
      })

      frameId = window.requestAnimationFrame(tick)
    }

    resize()

    // ResizeObserver catches both viewport changes and a parent resize, which
    // window.resize alone would miss.
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize)
      observer.observe(canvas)
    }
    window.addEventListener('resize', resize)

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      if (observer) observer.disconnect()
    }
  }, [hasBars, paused])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
