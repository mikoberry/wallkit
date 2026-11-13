import { useEffect, useRef } from 'react'
import { isHexColor, prefersReducedMotion } from '../../core/index.js'
import {
  AMBIENT_DEFAULT_COLOR,
  AMBIENT_DENSITY_DEFAULT,
  AMBIENT_INTENSITY_DEFAULT,
  AMBIENT_INTENSITY_MAX,
  AMBIENT_INTENSITY_MIN,
  AMBIENT_PRESETS,
  AMBIENT_SIZE_DEFAULT,
  AMBIENT_SIZE_MAX,
  AMBIENT_SIZE_MIN,
  AMBIENT_STRIDE,
  ambientCount,
  ambientPresetColor,
  ambientRgb,
  fillAmbientParticles,
  normalizeAmbientVariant,
} from '../../core/ambient.js'
import { createAmbientSprite } from './sprites.js'
import { drawAmbient } from './renderers.js'
import './AmbientFx.css'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Resolve the particle tint: explicit prop, then the variant's own colour, then
 * the inherited theme accent, then the shared default.
 *
 * Snow and petals come first with their own colour on purpose — they are
 * recognisable objects, not abstract accents, and repainting them blue because
 * an album cover happens to be blue would look like a bug.
 *
 * @param {unknown} colorHex
 * @param {string} variant
 * @param {HTMLElement|null} host
 * @returns {[number, number, number]}
 */
function resolveRgb(colorHex, variant, host) {
  if (isHexColor(colorHex)) return ambientRgb(colorHex)
  const preset = ambientPresetColor(variant)
  if (isHexColor(preset)) return ambientRgb(preset)
  if (host && typeof window !== 'undefined') {
    const token = window.getComputedStyle(host).getPropertyValue('--wallkit-accent').trim()
    if (isHexColor(token)) return ambientRgb(token)
  }
  return ambientRgb(AMBIENT_DEFAULT_COLOR)
}

/**
 * Full-screen ambient particle layer: snow, cherry petals, or rising bubbles.
 *
 * This layer collects nothing. It has no input from the host, no pointer
 * listeners, no audio — a particle's position is a pure function of its
 * parameters and elapsed time, so the whole scene is rebuilt every frame from a
 * fixed table instead of being simulated. That is why there is no particle
 * array, and why `paused` simply stops advancing the clock: nothing can drift.
 *
 * The overlay fills its positioning context, like `PointerFx`, and has no
 * `anchor` / `offsetX` / `offsetY` — an effect layer has no box of its own. It
 * sits at `z-index: 1`, below every control, so flakes pass behind the clock
 * and text stays readable.
 *
 * Wallpapers differ: some backgrounds already ship their own snow in the Spine
 * or video layer. Whether to draw this layer at all is an application decision,
 * so `visible={false}` renders nothing and leaves no canvas behind.
 *
 * @param {Object} props
 * @param {'snow'|'sakura'|'bubble'} [props.variant='snow']
 *   `snow` falls slowly with a narrow sway; `sakura` falls with wind drift,
 *   wide swings and per-petal spin; `bubble` rises with a gentle wobble.
 *   Invalid values fall back to `snow`.
 * @param {boolean} [props.visible=true]     Render nothing when false.
 * @param {string} [props.colorHex]          `#rrggbb`. Snow and petals default
 *   to their preset colour; `bubble` falls back to `--wallkit-accent`.
 * @param {number} [props.density=100]       Percentage of the preset's particle
 *   count (10..300). Particles shrink the count but never the size.
 * @param {number} [props.size=100]          Shared scale percentage (20..300),
 *   relative to the preset's base particle radius.
 * @param {number} [props.intensity=100]     Opacity percentage (0..300).
 * @param {boolean} [props.paused=false]     Freeze the layer and stop the draw
 *   loop; the last frame stays on screen.
 */
export default function AmbientFx({
  variant = 'snow',
  visible = true,
  colorHex,
  density = AMBIENT_DENSITY_DEFAULT,
  size = AMBIENT_SIZE_DEFAULT,
  intensity = AMBIENT_INTENSITY_DEFAULT,
  paused = false,
}) {
  const canvasRef = useRef(null)
  const particlesRef = useRef(null)
  const spriteRef = useRef(null)
  const paintRef = useRef(null)
  // Kept across pauses so freezing and resuming continue the same scene rather
  // than restarting it from the top of the screen.
  const elapsedRef = useRef(0)

  const settingsRef = useRef({ variant: 'snow', count: 0, baseSize: 9, scale: 1, gain: 1 })

  const resolvedVariant = normalizeAmbientVariant(variant)
  const count = ambientCount(resolvedVariant, density)
  const preset = AMBIENT_PRESETS[resolvedVariant]
  const scale =
    clamp(
      Number.isFinite(Number(size)) ? Number(size) : AMBIENT_SIZE_DEFAULT,
      AMBIENT_SIZE_MIN,
      AMBIENT_SIZE_MAX,
    ) / 100
  const gain =
    clamp(
      Number.isFinite(Number(intensity)) ? Number(intensity) : AMBIENT_INTENSITY_DEFAULT,
      AMBIENT_INTENSITY_MIN,
      AMBIENT_INTENSITY_MAX,
    ) / 100

  // Parameters depend on the variant and the count only, so they are written
  // once here and never touched by the draw loop.
  useEffect(() => {
    const needed = count * AMBIENT_STRIDE
    if (!particlesRef.current || particlesRef.current.length < needed) {
      particlesRef.current = new Float32Array(needed)
    }
    fillAmbientParticles(resolvedVariant, count, particlesRef.current)

    // The viewport scale is only known inside the loop, so the preset radius
    // and the caller's scale travel separately and are multiplied there.
    settingsRef.current = {
      variant: resolvedVariant,
      count,
      baseSize: preset.baseSize,
      scale,
      gain,
    }
  }, [resolvedVariant, count, preset.baseSize, scale, gain])

  // Sprites are bitmaps, so they are rebuilt only when the look changes.
  useEffect(() => {
    if (!visible) return
    spriteRef.current = createAmbientSprite(
      resolvedVariant,
      resolveRgb(colorHex, resolvedVariant, canvasRef.current),
    )
    // A paused loop is not painting, so a colour change has to be pushed
    // through by hand or the canvas keeps the old tint until it resumes.
    if (paintRef.current) paintRef.current()
  }, [colorHex, resolvedVariant, visible])

  useEffect(() => {
    if (!visible) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined
    const context = canvas.getContext('2d')
    if (!context) return undefined

    let width = 1
    let height = 1
    let viewScale = 1

    const resize = () => {
      // offsetWidth/offsetHeight describe the layout box and ignore any
      // transform on an ancestor, the same contract the other canvases use.
      width = Math.max(1, Math.round(canvas.offsetWidth))
      height = Math.max(1, Math.round(canvas.offsetHeight))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      // Particles are sized in px, so a 4K wallpaper would otherwise show
      // 1080p-sized flakes. Area is the wrong basis: doubling both axes should
      // not double every particle, so the geometric mean is used and clamped.
      viewScale = clamp(Math.sqrt(Math.min(width / 1920, height / 1080)), 0.7, 2)
    }

    const paint = () => {
      const settings = settingsRef.current
      const particles = particlesRef.current
      context.clearRect(0, 0, width, height)
      if (!particles || settings.count <= 0 || settings.gain <= 0) return

      drawAmbient(
        context,
        particles,
        settings.count,
        settings.variant,
        elapsedRef.current,
        settings.baseSize * viewScale * settings.scale,
        width,
        height,
        spriteRef.current,
        settings.gain,
      )
    }
    paintRef.current = paint

    let frameId = 0
    let lastMs = 0

    const tick = (nowMs) => {
      if (lastMs === 0) lastMs = nowMs
      // A hidden tab or a long frame would otherwise hand us a multi-second
      // delta and teleport every particle to a new position in one step.
      const delta = Math.min((nowMs - lastMs) / 1000, 0.1)
      lastMs = nowMs
      elapsedRef.current += delta
      paint()
      frameId = window.requestAnimationFrame(tick)
    }

    resize()
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize)
      observer.observe(canvas)
    }
    window.addEventListener('resize', resize)

    if (paused || prefersReducedMotion()) {
      // One still frame. Reduced motion keeps the composition but removes the
      // movement, which is the part that can make people ill.
      paint()
    } else {
      frameId = window.requestAnimationFrame(tick)
    }

    return () => {
      paintRef.current = null
      window.removeEventListener('resize', resize)
      if (observer) observer.disconnect()
      if (frameId !== 0) window.cancelAnimationFrame(frameId)
    }
  }, [visible, paused])

  if (!visible) return null

  return (
    <div className="wallkit-ambient-fx" aria-hidden="true">
      <canvas ref={canvasRef} className="wallkit-ambient-fx__canvas" />
    </div>
  )
}
