import { useEffect, useRef } from 'react'
import { isHexColor, prefersReducedMotion } from '../../core/index.js'
import {
  POINTER_CLICK_VARIANTS,
  POINTER_FX_DEFAULT_COLOR,
  POINTER_FX_INTENSITY_DEFAULT,
  POINTER_FX_INTENSITY_MAX,
  POINTER_FX_INTENSITY_MIN,
  POINTER_FX_SIZE_DEFAULT,
  POINTER_TRAIL_VARIANTS,
  clearPointerState,
  createPointerBursts,
  createPointerTrail,
  pointerRgb,
  pointerSizeScale,
  pointerTrailIndex,
  pushBurst,
  pushTrailPoint,
} from '../../core/pointer.js'
import { drawBursts, drawTrail } from './renderers.js'
import './PointerFx.css'

// Minimum travel between recorded samples. Pointer devices can report several
// events at the same position, and those would consume ring slots without
// adding any visible length to the trail.
const MIN_SAMPLE_DISTANCE = 1.2
const SPEED_CAP = 3000

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Resolve the drawing colour: an explicit prop wins, otherwise the inherited
 * theme token, otherwise the shared default. Kept here rather than in the
 * spectrum's shared module so this control does not depend on another widget's
 * implementation.
 *
 * @param {string|undefined} colorHex
 * @param {HTMLElement|null} host
 * @returns {[number, number, number]}
 */
function resolveRgb(colorHex, host) {
  if (isHexColor(colorHex)) return pointerRgb(colorHex)
  if (host && typeof window !== 'undefined') {
    const token = window.getComputedStyle(host).getPropertyValue('--wallkit-accent').trim()
    if (isHexColor(token)) return pointerRgb(token)
  }
  return pointerRgb(POINTER_FX_DEFAULT_COLOR)
}

/**
 * Pointer trail and click effects for a wallpaper overlay.
 *
 * This is the one WallKit control that collects its own input. It listens to
 * `pointermove` / `pointerdown` on `window` — the same precedent as `Clock`'s
 * tilt tracking, where the wallpaper canvas owns the pointer — and maps client
 * coordinates into its own overlay box. Events outside the box are ignored, so
 * several instances can coexist on one page. It never reads `window.wallpaper*`,
 * never inspects the background layer, and never invents a trail when the host
 * delivers no events.
 *
 * Samples go into preallocated ring buffers that are rewritten in place. The
 * draw loop reads them directly, so a 120 Hz pointer costs zero React
 * re-renders. The richer styles (bubbles, fireworks) work on both channels and
 * store no particle arrays: each sample carries a seed and every particle is
 * recomputed from `(seed, index)` on each frame. The loop is started on demand
 * and stops as soon as the last sample expires; `paused` cancels it outright
 * and freezes the canvas.
 *
 * The overlay fills its positioning context: give the parent `position:
 * relative` and a definite size. There is no `anchor` / `offsetX` / `offsetY`
 * because an effect layer has no box of its own to place.
 *
 * @param {Object} props
 * @param {boolean} [props.visible=true]   Render nothing when false.
 * @param {boolean} [props.trail=true]     Draw the pointer trail.
 * @param {boolean} [props.click=true]     Draw click effects.
 * @param {'glow'|'ribbon'|'bubble'|'firework'} [props.trailVariant='glow']
 *   `glow` lays down soft fading dots; `ribbon` strokes a connected path whose
 *   width follows pointer speed; `bubble` releases small rising glassy bubbles;
 *   `firework` emits sparse, short-lived mini bursts along the path (every 4th
 *   sample, so a fast cursor does not flood the canvas). Invalid values fall
 *   back to `glow`.
 * @param {'ripple'|'sparks'|'bubble'|'firework'} [props.clickVariant='ripple']
 *   `ripple` expands concentric rings; `sparks` scatters short-lived dots;
 *   `bubble` releases a fuller cluster of rising bubbles; `firework` bursts
 *   into glowing radial embers that fall under gravity, with a hot core.
 *   Invalid values fall back to `ripple`.
 *   `bubble` and `firework` are available on BOTH props; the channel only
 *   changes scale, density and lifetime. Try `bubble` + `firework` together.
 * @param {string} [props.colorHex]        `#rrggbb`. Defaults to `--wallkit-accent`.
 * @param {number} [props.size=100]        Shared scale percentage (20..300)
 *   applied to both channels when no per-channel size is given.
 * @param {number} [props.trailSize]       Overrides `size` for the trail only.
 * @param {number} [props.clickSize]       Overrides `size` for click bursts only.
 *   Sizing resolves as `trailSize ?? size` / `clickSize ?? size`; a nullish or
 *   invalid per-channel value inherits `size`. Scale affects radii, travel
 *   distances and line widths, never the overlay box or the sampling rate.
 * @param {number} [props.intensity=100]   Opacity percentage (0..300).
 * @param {boolean} [props.paused=false]   Freeze the canvas, drop new events,
 *   and stop the draw loop while paused.
 */
export default function PointerFx({
  visible = true,
  trail = true,
  click = true,
  trailVariant = 'glow',
  clickVariant = 'ripple',
  colorHex,
  size = POINTER_FX_SIZE_DEFAULT,
  trailSize,
  clickSize,
  intensity = POINTER_FX_INTENSITY_DEFAULT,
  paused = false,
}) {
  const canvasRef = useRef(null)

  // Created once and reused for the component's whole life. The draw loop and
  // the event handlers both read these buffers through refs.
  const trailRef = useRef(null)
  const burstsRef = useRef(null)
  if (trailRef.current === null) trailRef.current = createPointerTrail()
  if (burstsRef.current === null) burstsRef.current = createPointerBursts()

  const settingsRef = useRef({
    trail: true,
    click: true,
    trailVariant: 'glow',
    clickVariant: 'ripple',
    trailScale: 1,
    clickScale: 1,
    gain: 1,
    reduced: false,
  })
  const colorRef = useRef(pointerRgb(POINTER_FX_DEFAULT_COLOR))
  // Set by the main effect so prop changes can restart an idle loop without
  // rebuilding the listeners or losing in-flight samples.
  const startRef = useRef(null)

  const resolvedTrailVariant = POINTER_TRAIL_VARIANTS.includes(trailVariant)
    ? trailVariant
    : 'glow'
  const resolvedClickVariant = POINTER_CLICK_VARIANTS.includes(clickVariant)
    ? clickVariant
    : 'ripple'
  // `size` is the shared fallback; each channel may override just its own
  // geometry. Both resolve to plain multipliers here so the draw loop reads
  // numbers from the settings ref and never has to reason about props.
  const sharedSize = Number.isFinite(Number(size))
    ? Number(size)
    : POINTER_FX_SIZE_DEFAULT
  const trailScale = pointerSizeScale(trailSize, sharedSize)
  const clickScale = pointerSizeScale(clickSize, sharedSize)
  const clampedIntensity = clamp(
    Number.isFinite(intensity) ? intensity : POINTER_FX_INTENSITY_DEFAULT,
    POINTER_FX_INTENSITY_MIN,
    POINTER_FX_INTENSITY_MAX,
  )

  // Props reach the loop through a ref: switching style or theme while a trail
  // is on screen must not tear the animation down.
  useEffect(() => {
    settingsRef.current = {
      trail: trail !== false,
      click: click !== false,
      trailVariant: resolvedTrailVariant,
      clickVariant: resolvedClickVariant,
      trailScale,
      clickScale,
      gain: clampedIntensity / 100,
      reduced: prefersReducedMotion(),
    }
    if (startRef.current) startRef.current()
  }, [
    trail,
    click,
    resolvedTrailVariant,
    resolvedClickVariant,
    trailScale,
    clickScale,
    clampedIntensity,
  ])

  // Colour is read from the DOM, so it has to wait for the element to exist.
  useEffect(() => {
    colorRef.current = resolveRgb(colorHex, canvasRef.current)
    if (startRef.current) startRef.current()
  }, [colorHex, visible, resolvedTrailVariant, resolvedClickVariant])

  useEffect(() => {
    if (!visible) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined
    const context = canvas.getContext('2d')
    if (!context) return undefined

    const trailState = trailRef.current
    const burstState = burstsRef.current

    // Timestamps written while the loop was paused would be far in the past,
    // so drop them rather than painting a flash of already-expired samples.
    if (!paused) clearPointerState(trailState, burstState)

    const resize = () => {
      // offsetWidth/offsetHeight describe the layout box and ignore any
      // transform on an ancestor. getBoundingClientRect would report the scaled
      // size, doubling the backing store on a zoom change.
      const width = Math.max(1, Math.round(canvas.offsetWidth))
      const height = Math.max(1, Math.round(canvas.offsetHeight))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
    }

    let frameId = 0

    const tick = (nowMs) => {
      const now = nowMs / 1000
      const settings = settingsRef.current
      context.clearRect(0, 0, canvas.width, canvas.height)

      let alive = false
      if (settings.trail && !settings.reduced) {
        alive = drawTrail(context, trailState, now, settings, colorRef.current) || alive
      }
      if (settings.click) {
        alive = drawBursts(context, burstState, now, settings, colorRef.current) || alive
      }

      frameId = alive ? window.requestAnimationFrame(tick) : 0
    }

    const ensureLoop = () => {
      if (paused || frameId !== 0) return
      frameId = window.requestAnimationFrame(tick)
    }
    startRef.current = ensureLoop

    // Only left/top are taken from the client rect, and only to translate the
    // pointer into the overlay's local space. Sizing still uses offsetWidth /
    // offsetHeight, so a transformed ancestor cannot double-scale the canvas.
    const localPoint = (event) => {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      if (x < 0 || y < 0 || x > canvas.offsetWidth || y > canvas.offsetHeight) return null
      return { x, y }
    }

    const handleMove = (event) => {
      const settings = settingsRef.current
      if (paused || !settings.trail || settings.reduced) return
      const point = localPoint(event)
      if (!point) return

      const now = performance.now() / 1000
      let speed = 0
      if (trailState.count > 0) {
        const last = pointerTrailIndex(trailState, trailState.count - 1)
        const dx = point.x - trailState.xs[last]
        const dy = point.y - trailState.ys[last]
        const distance = Math.hypot(dx, dy)
        if (distance < MIN_SAMPLE_DISTANCE) return
        const delta = Math.max(0.001, now - trailState.born[last])
        speed = Math.min(distance / delta, SPEED_CAP)
      }

      pushTrailPoint(trailState, point.x, point.y, now, speed)
      ensureLoop()
    }

    const handleDown = (event) => {
      const settings = settingsRef.current
      if (paused || !settings.click || event.button !== 0) return
      const point = localPoint(event)
      if (!point) return
      pushBurst(burstState, point.x, point.y, performance.now() / 1000)
      ensureLoop()
    }

    resize()
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize)
      observer.observe(canvas)
    }
    window.addEventListener('resize', resize)

    if (!paused) {
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerdown', handleDown)
      // One frame clears any pixels left over from a previous mount or resize.
      ensureLoop()
    }

    return () => {
      startRef.current = null
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerdown', handleDown)
      window.removeEventListener('resize', resize)
      if (observer) observer.disconnect()
      if (frameId !== 0) window.cancelAnimationFrame(frameId)
    }
  }, [visible, paused])

  if (!visible) return null

  return (
    <div className="wallkit-pointer-fx" aria-hidden="true">
      <canvas ref={canvasRef} className="wallkit-pointer-fx__canvas" />
    </div>
  )
}
