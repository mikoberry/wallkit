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
  shapeSpectrumLevel,
  smoothAudioLevel,
} from '../../core/index.js'
import {
  SPECTRUM_STYLES,
  createRendererState,
  drawAurora,
  drawBars,
  drawCurve,
  drawDots,
  drawMirror,
  drawPill,
  drawRing,
  drawRingWave,
  drawRipples,
} from './renderers.js'
import './Spectrum.css'

// Size percentage bounds. 100 is the reference ("normal") widget size defined by
// the CSS base box; 500 lets a caller blow it up to a full-background visual, and
// below 20 it stops being legible.
export const SPECTRUM_SIZE_MIN = 20
export const SPECTRUM_SIZE_MAX = 500

// The renderer for each variant. Kept in one table so the draw loop never has to
// branch on a string every frame.
const RENDERERS = {
  bars: (ctx, levels, w, h, color) => drawBars(ctx, levels, w, h, color),
  mirror: (ctx, levels, w, h, color) => drawMirror(ctx, levels, w, h, color),
  curve: (ctx, levels, w, h, color) => drawCurve(ctx, levels, w, h, color),
  pill: (ctx, levels, w, h, color) => drawPill(ctx, levels, w, h, color),
  ring: (ctx, levels, w, h, color, state, meta) => drawRing(ctx, levels, w, h, color, meta),
  ringwave: (ctx, levels, w, h, color, state, meta) =>
    drawRingWave(ctx, levels, w, h, color, meta),
  dots: (ctx, levels, w, h, color) => drawDots(ctx, levels, w, h, color),
  ripples: (ctx, levels, w, h, color, state, meta) =>
    drawRipples(ctx, levels, w, h, color, state, meta),
  aurora: (ctx, levels, w, h, color, state, meta) =>
    drawAurora(ctx, levels, w, h, color, state, meta),
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Resolve the drawing colour: an explicit prop wins, otherwise the theme token
 * on the host element, otherwise the shared default.
 *
 * @param {string|undefined} colorHex
 * @param {HTMLElement|null} host
 * @returns {string}
 */
function resolveColor(colorHex, host) {
  if (isHexColor(colorHex)) return colorHex.trim().toLowerCase()
  if (host && typeof window !== 'undefined') {
    const token = window.getComputedStyle(host).getPropertyValue('--wallkit-accent').trim()
    if (isHexColor(token)) return token.toLowerCase()
  }
  return DEFAULT_SPECTRUM_COLOR
}

/**
 * Wallpaper Engine style audio spectrum overlay.
 *
 * Pure view: the component reads no audio itself and holds no data timer. The
 * caller produces the normalised `bars` (see `extractSpectrumBars`) and drives
 * pause handling; the component only smooths them for the animation and paints
 * a canvas.
 *
 * `visible` and `paused` are different: `visible={false}` renders nothing at all
 * (no DOM, no loop), while `paused` keeps the widget on screen but freezes it.
 * Both stop the draw loop, so a paused/hidden wallpaper costs nothing.
 *
 * @param {Object} props
 * @param {Float32Array|number[]|null} props.bars  Bar magnitudes, each 0..1.
 *   Required: when `null` (or empty) nothing is rendered — there is no
 *   synthetic fallback.
 * @param {boolean} [props.visible=true]        Render nothing when false.
 * @param {'bars'|'mirror'|'curve'|'pill'|'ring'|'ringwave'|'dots'|'ripples'|'aurora'} [props.variant='bars']
 *   Visual style. Invalid values fall back to `bars`.
 * @param {string} [props.colorHex]             `#rrggbb`. Defaults to `--wallkit-accent`.
 * @param {number} [props.size=100]             Size percentage. 100 is the normal
 *   widget size; range 20..500.
 * @param {number} [props.offsetX=0]            Horizontal offset, viewport percentage.
 * @param {number} [props.offsetY=0]            Vertical offset, viewport percentage.
 * @param {number} [props.intensity=100]        Response strength, percent (0..1000).
 *   100 leaves the bars unchanged, higher boosts quiet bands, 0 flattens them.
 * @param {number} [props.curve=1]              Response curve exponent (0.2..2).
 *   Below 1 lifts quiet bands into a steady swell; above 1 sharpens the motion
 *   into distinct peaks. 1 is linear.
 * @param {boolean} [props.paused=false]        Freeze the draw loop while paused.
 */
export default function Spectrum({
  bars,
  visible = true,
  variant = 'bars',
  colorHex,
  size = 100,
  offsetX = 0,
  offsetY = 0,
  intensity = SPECTRUM_INTENSITY_DEFAULT,
  curve = SPECTRUM_CURVE_DEFAULT,
  paused = false,
}) {
  const canvasRef = useRef(null)
  const hostRef = useRef(null)
  // The loop is created once per visibility/pause state; refs let new bars, a
  // colour change, a variant switch and the response settings reach it without
  // tearing down and rebuilding the animation.
  const barsRef = useRef(null)
  const colorRef = useRef(DEFAULT_SPECTRUM_COLOR)
  const variantRef = useRef('bars')
  const shapeRef = useRef({ intensity: 1, curve: 1 })
  // Animation phase and per-style state outlive the loop, so a pause (which
  // cancels the rAF) or a variant switch resumes instead of snapping to 0.
  const elapsedRef = useRef(0)
  const stateRef = useRef({})
  const stateVariantRef = useRef(null)

  const hasBars = bars != null && bars.length > 0
  const resolvedVariant = SPECTRUM_STYLES.includes(variant) ? variant : 'bars'

  useEffect(() => {
    barsRef.current = hasBars ? bars : null
  }, [bars, hasBars])

  useEffect(() => {
    colorRef.current = resolveColor(colorHex, hostRef.current)
  }, [colorHex, hasBars, visible])

  useEffect(() => {
    variantRef.current = resolvedVariant
  }, [resolvedVariant])

  useEffect(() => {
    const gain =
      clamp(Number(intensity) || 0, SPECTRUM_INTENSITY_MIN, SPECTRUM_INTENSITY_MAX) / 100
    const exponent = Number.isFinite(curve)
      ? clamp(curve, SPECTRUM_CURVE_MIN, SPECTRUM_CURVE_MAX)
      : SPECTRUM_CURVE_DEFAULT
    shapeRef.current = { intensity: gain, curve: exponent }
  }, [intensity, curve])

  useEffect(() => {
    // No loop while hidden or paused: the rAF is cancelled outright rather than
    // spinning and skipping work, so a paused wallpaper really costs nothing.
    // `elapsed` and the renderer state live in refs, so the next run continues
    // from where this one stopped.
    if (!visible || !hasBars || paused) return undefined

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
    // Animation clock in seconds. Advanced only on frames that actually draw, so
    // pausing the wallpaper freezes the visuals instead of skipping them ahead.
    let elapsed = elapsedRef.current

    const resize = () => {
      // offsetWidth/offsetHeight describe the layout box and ignore any
      // transform on an ancestor. getBoundingClientRect would report the
      // *scaled* size, so a zoom change plus a window resize would double-scale
      // the backing store and the bars would jump. Backing store in CSS pixels
      // keeps this consistent with the background WebGL canvas.
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
      if (source && source.length > 0) {
        if (source.length !== count) {
          count = source.length
          targets = new Float32Array(count)
          levels = new Float32Array(count)
        }
        for (let i = 0; i < count; i += 1) targets[i] = source[i]
      } else {
        targets.fill(0)
      }

      // Shape each band by the caller's response settings, then smooth it.
      const shape = shapeRef.current
      for (let i = 0; i < count; i += 1) {
        levels[i] = smoothAudioLevel(levels[i], shapeSpectrumLevel(targets[i], shape), delta)
      }

      context.clearRect(0, 0, canvas.width, canvas.height)
      const render = RENDERERS[activeVariant] ?? RENDERERS.bars
      render(context, levels, canvas.width, canvas.height, colorRef.current, stateRef.current, {
        time: elapsed,
        bass: bassLevel(levels),
      })

      frameId = window.requestAnimationFrame(tick)
    }

    resize()

    // ResizeObserver catches both viewport changes and a `size` prop change,
    // which window.resize alone would miss.
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
  }, [visible, hasBars, paused])

  if (!visible || !hasBars) return null

  const clampedSize = clamp(Number(size) || 100, SPECTRUM_SIZE_MIN, SPECTRUM_SIZE_MAX)

  return (
    <div
      className="wallkit-spectrum__anchor"
      style={{ left: `${offsetX}%`, bottom: `${offsetY}%` }}
    >
      <div
        ref={hostRef}
        className={`wallkit-spectrum wallkit-spectrum--variant-${resolvedVariant}`}
        style={{ '--wallkit-spectrum-scale': clampedSize / 100 }}
        aria-hidden="true"
      >
        <canvas ref={canvasRef} className="wallkit-spectrum__canvas" />
      </div>
    </div>
  )
}
