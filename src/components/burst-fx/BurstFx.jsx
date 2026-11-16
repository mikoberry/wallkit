import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import { isHexColor, prefersReducedMotion } from '../../core/index.js'
import {
  BURST_INTENSITY_DEFAULT,
  BURST_SIZE_DEFAULT,
  BURST_SPEED_DEFAULT,
  burstCount,
  burstIntensityScale,
  burstRgb,
  burstSizeScale,
  burstSpeedScale,
  clearBursts,
  createBursts,
  fireBurst,
  normalizeBurstKind,
} from '../../core/burst.js'
import { drawBursts } from './renderers.js'
import './BurstFx.css'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Resolve the drawing colour for `spray`: an explicit prop wins, otherwise the
 * inherited theme token, otherwise the shared default. Confetti ignores this
 * and uses its own rainbow palette, unless the caller passes `colorHex` — in
 * which case the whole scatter recolours to that single tint.
 *
 * @param {string|undefined} colorHex
 * @param {HTMLElement|null} host
 * @returns {[number, number, number]}
 */
function resolveRgb(colorHex, host) {
  if (isHexColor(colorHex)) return burstRgb(colorHex)
  if (host && typeof window !== 'undefined') {
    const token = window.getComputedStyle(host).getPropertyValue('--wallkit-accent').trim()
    if (isHexColor(token)) return burstRgb(token)
  }
  return burstRgb(undefined)
}

/**
 * One-shot burst effects: confetti and water spray, fired on command.
 *
 * This is the third kind of effect layer. `AmbientFx` collects nothing and
 * loops forever; `PointerFx` samples pointer events continuously; `BurstFx`
 * plays a single, finite effect each time the host calls the imperative
 * `burst(kind, opts)` method exposed through the ref. It never reads
 * `window.wallpaper*`, never inspects the background, and never fires on its
 * own — no command, no effect, no loop.
 *
 * Each command pushes one record into a preallocated ring buffer. The draw loop
 * walks the records and recomputes every particle from `(seed, index)` on each
 * frame, so there is no particle array and 120 Hz of animation costs zero React
 * re-renders. The loop starts on the first command and stops as soon as the last
 * burst expires; `paused` cancels it outright and drops new commands.
 *
 * The overlay fills its positioning context, like `PointerFx` and `AmbientFx`:
 * give the parent `position: relative` and a definite size. There is no
 * `anchor` / `offsetX` / `offsetY` because an effect layer has no box of its
 * own to place.
 *
 * @param {Object} props
 * @param {boolean} [props.visible=true]      Render nothing when false.
 * @param {string} [props.colorHex]           `#rrggbb`. Recolours spray, and
 *   recolours confetti to a single tint. Defaults to `--wallkit-accent` for
 *   spray; confetti keeps its rainbow palette when left unset.
 * @param {number} [props.size=100]           Default scale percentage (20..300)
 *   applied to every burst that does not override it per-fire.
 * @param {number} [props.intensity=100]      Default launch-force percentage
 *   (0..300), the fallback for a fire that does not set its own. This is the
 *   *force* of the launch, not opacity: it drives launch velocity and, through
 *   projectile physics, reach, peak height and (for spray) how the water column
 *   breaks up into droplets.
 * @param {number} [props.speed=100]          Default motion-pace percentage
 *   (20..300). A fire may override it per-burst.
 * @param {boolean} [props.paused=false]      Freeze the canvas, drop new
 *   commands, and stop the draw loop while paused.
 *
 * The ref exposes `burst(kind, opts)` where `opts` may carry
 * `{ x, y, angle, size, intensity, count, speed }`. `x` / `y` are 0..1,
 * `angle` is radians, `size` / `intensity` / `speed` are percentages, `count`
 * is a particle count. Each field falls back to the component prop or the
 * kind's preset when omitted, so one fire can override just its own position,
 * size, intensity, count or speed without affecting the rest.
 */
const BurstFx = forwardRef(function BurstFx(
  {
    visible = true,
    colorHex,
    size = BURST_SIZE_DEFAULT,
    intensity = BURST_INTENSITY_DEFAULT,
    speed = BURST_SPEED_DEFAULT,
    paused = false,
  },
  ref,
) {
  const canvasRef = useRef(null)

  // Created once and reused for the component's whole life. The draw loop and
  // the imperative `burst` method both read this buffer through refs.
  const burstsRef = useRef(null)
  if (burstsRef.current === null) burstsRef.current = createBursts()

  const settingsRef = useRef({
    reduced: false,
    rgb: burstRgb(undefined),
    singleColor: false,
    colorHex: undefined,
  })
  const colorRef = useRef(burstRgb(undefined))
  // The live draw-loop handle, owned by a single ref so the imperative command
  // and the mount effect never fight over two copies. `frameRef` doubles as the
  // "is the loop running" flag: 0 = idle, non-zero = a rAF is scheduled.
  const frameRef = useRef(0)
  // Live `paused` value for the imperative command to read, avoiding a stale
  // closure capture in `useImperativeHandle`.
  const pausedRef = useRef(paused)

  const sharedSize = Number.isFinite(Number(size)) ? Number(size) : BURST_SIZE_DEFAULT
  const scale = burstSizeScale(sharedSize)
  const defaultForce = burstIntensityScale(intensity)
  const defaultSpeed = burstSpeedScale(speed)

  // Reduced-motion preference reaches the loop through a ref so toggling it
  // does not rebuild the canvas plumbing.
  useEffect(() => {
    settingsRef.current = {
      ...settingsRef.current,
      reduced: prefersReducedMotion(),
    }
  }, [])

  // Keep the imperative command's paused flag in sync with the prop, so
  // `burst()` drops commands immediately after `paused` flips true.
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // Colour is read from the DOM, so it has to wait for the element to exist.
  useEffect(() => {
    colorRef.current = resolveRgb(colorHex, canvasRef.current)
    settingsRef.current = {
      ...settingsRef.current,
      rgb: colorRef.current,
      singleColor: isHexColor(colorHex),
      colorHex,
    }
  }, [colorHex, visible])

  // The self-scheduling draw loop. It lives as a single stable function created
  // here, at render time, so the imperative `burst()` can wake it up even before
  // (or during) React 18 StrictMode's double-mount teardown — the previous bug
  // was that the starter was only assigned inside a `useEffect`, leaving a null
  // window on first mount where the first command wrote a record but nothing
  // drew it. Every DOM access is deferred to tick time via `canvasRef`, so this
  // function never depends on effect ordering.
  const ensureLoopRef = useRef(null)
  if (ensureLoopRef.current === null) {
    ensureLoopRef.current = () => {
      if (pausedRef.current || frameRef.current !== 0) {
        return
      }
      const canvas = canvasRef.current
      if (!canvas) {
        return
      }
      const context = canvas.getContext('2d')
      if (!context) return

      const tick = (nowMs) => {
        const now = nowMs / 1000
        context.clearRect(0, 0, canvas.width, canvas.height)
        const alive = drawBursts(
          context,
          burstsRef.current,
          now,
          settingsRef.current,
          canvas.width,
          canvas.height,
        )
        // Self-scheduling: stay alive while any burst is in flight, park
        // (frameRef → 0) the moment the last one expires.
        frameRef.current = alive ? window.requestAnimationFrame(tick) : 0
      }
      frameRef.current = window.requestAnimationFrame(tick)
    }
  }

  useEffect(() => {
    if (!visible) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined

    const burstState = burstsRef.current

    // Timestamps written while the loop was paused would be far in the past,
    // so drop them rather than painting a flash of already-expired bursts.
    if (!paused) clearBursts(burstState)

    const resize = () => {
      const width = Math.max(1, Math.round(canvas.offsetWidth))
      const height = Math.max(1, Math.round(canvas.offsetHeight))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
    }

    resize()
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize)
      observer.observe(canvas)
    }
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      if (observer) observer.disconnect()
      if (frameRef.current !== 0) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [visible, paused])

  // The imperative command. `opts` accepts `{ x, y, angle, size, intensity,
  // count, speed }` — `x` / `y` in normalised 0..1 coordinates, `angle` in
  // radians, `size` / `intensity` / `speed` as percentages, `count` as a
  // particle count. Every field falls back to the component's prop or the
  // kind's preset default when omitted, so `burst('confetti')` still fires the
  // shipped look. With no `opts`, the burst fires from the right-centre
  // (`x: 1`, `y: 0.5`) up-left at 45° (`angle: -3π/4`). `kind` falls back to
  // `confetti`.
  useImperativeHandle(ref, () => ({
    burst(kind = 'confetti', opts = {}) {
      // Read the live paused state through a ref (set below) rather than a
      // closure capture, so a burst fired in the same tick a prop change lands
      // never races a stale `paused` value.
      if (pausedRef.current) return
      const resolved = normalizeBurstKind(kind)
      const canvas = canvasRef.current
      const x = Number.isFinite(Number(opts.x)) ? clamp(Number(opts.x), 0, 1) : 1
      const y = Number.isFinite(Number(opts.y)) ? clamp(Number(opts.y), 0, 1) : 0.5
      const angle = Number.isFinite(Number(opts.angle)) ? Number(opts.angle) : -Math.PI * 3 / 4
      // Per-burst size / intensity fall back to the component props, which in
      // turn fall back to the defaults — so a single `opts.size` override does
      // not drag the other fires along with it.
      const perSize = opts.size == null ? scale : burstSizeScale(opts.size)
      const perForce = opts.intensity == null ? defaultForce : burstIntensityScale(opts.intensity)
      const perCount = burstCount(opts.count)
      const perSpeed = opts.speed == null ? defaultSpeed : burstSpeedScale(opts.speed)
      fireBurst(
        burstsRef.current,
        resolved,
        x,
        y,
        angle,
        performance.now() / 1000,
        perSize,
        perForce,
        perCount,
        perSpeed,
      )
      if (canvas) {
        // Make sure the canvas is sized before the first command lands on a
        // just-mounted (and therefore 0-sized) element.
        const width = Math.max(1, Math.round(canvas.offsetWidth))
        const height = Math.max(1, Math.round(canvas.offsetHeight))
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
      }
      // Start the draw loop directly through the stable starter created at
      // render time. This is the whole fix for "first click does nothing": the
      // starter is a single function that defers DOM access to call time, so it
      // is always available — no dependence on a `useEffect` having assigned it
      // yet (which, under StrictMode's double mount, leaves a null window).
      if (ensureLoopRef.current) ensureLoopRef.current()
    },
  }), [scale, defaultForce, defaultSpeed])

  if (!visible) return null

  return (
    <div className="wallkit-burst-fx" aria-hidden="true">
      <canvas ref={canvasRef} className="wallkit-burst-fx__canvas" />
    </div>
  )
})

export default BurstFx
