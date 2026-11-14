import { useEffect, useMemo, useRef } from 'react'
import { prefersReducedMotion } from '../../core/index.js'
import {
  SPOTLIGHT_DARK_DEFAULT,
  SPOTLIGHT_DIM_DEFAULT,
  SPOTLIGHT_FEATHER_DEFAULT,
  SPOTLIGHT_GLOW_DEFAULT,
  SPOTLIGHT_LIGHT_DEFAULT,
  SPOTLIGHT_SIZE_DEFAULT,
  SPOTLIGHT_SMOOTHING_DEFAULT,
  SPOTLIGHT_SMOOTHING_MAX,
  spotlightApproach,
  spotlightGlowGradient,
  spotlightMaskGradient,
} from '../../core/spotlight.js'
import './Spotlight.css'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Spotlight — a lit circle that follows the pointer while everything outside it
 * is darkened.
 *
 * The whole effect is two CSS radial gradients, so there is no canvas and no
 * draw loop: the gradients are built once per prop change and the only thing
 * that moves is their origin, written as the `--wallkit-spotlight-x` / `-y`
 * custom properties on pointer events. With `smoothing` at 0 that is a plain
 * style write per event — zero React re-renders, zero idle cost. With a
 * smoothing time constant the light lerps towards the pointer inside a rAF that
 * stops the moment it catches up.
 *
 * Like `PointerFx` this listens on `window` and maps client coordinates into
 * its own box: the pointer is a render parameter, not data the control invents.
 * Events outside the box are ignored, so several instances can coexist. It never
 * reads `window.wallpaper*` and never inspects the background layer — the mask
 * simply darkens whatever is behind it, which is also why it sits above the
 * other controls.
 *
 * Wallpaper Engine delivers no pointer events to a desktop wallpaper unless
 * mouse interaction is enabled for it, exactly like `PointerFx`. Until an event
 * arrives the mask stays fully transparent rather than covering the wallpaper in
 * black, and there is no synthetic cursor that fakes one.
 *
 * @param {Object} props
 * @param {boolean} [props.visible=true]   Render nothing when false.
 * @param {number} [props.size=420]        Diameter of the lit circle, px (80..3000).
 * @param {number} [props.feather=0.45]    Edge softness as a fraction of the
 *   radius (0..1). 0 is a hard rim, 1 makes the falloff as wide as the circle.
 * @param {number} [props.dim=0.72]        Opacity of the darkened area (0..1).
 * @param {number} [props.glow=0.22]       Strength of the highlight inside the
 *   circle (0..1). Painted on a `screen` layer so it brightens instead of
 *   veiling; 0 drops the layer entirely.
 * @param {string} [props.darkColor='#000000']  `#rrggbb` of the dark area.
 * @param {string} [props.lightColor='#ffffff'] `#rrggbb` of the highlight.
 * @param {number} [props.smoothing=0.05]  Follow lag as a time constant in
 *   seconds (0..0.5). 0 snaps to the pointer; larger values give the light
 *   weight. Ignored under `prefers-reduced-motion`.
 * @param {boolean} [props.paused=false]   Keep the current frame, stop listening.
 */
export default function Spotlight({
  visible = true,
  size = SPOTLIGHT_SIZE_DEFAULT,
  feather = SPOTLIGHT_FEATHER_DEFAULT,
  dim = SPOTLIGHT_DIM_DEFAULT,
  glow = SPOTLIGHT_GLOW_DEFAULT,
  darkColor = SPOTLIGHT_DARK_DEFAULT,
  lightColor = SPOTLIGHT_LIGHT_DEFAULT,
  smoothing = SPOTLIGHT_SMOOTHING_DEFAULT,
  paused = false,
}) {
  const rootRef = useRef(null)
  // Both positions are stored as percentages of the overlay box, so a window
  // resize keeps the light where the pointer left it instead of drifting off.
  const targetRef = useRef(null)
  const currentRef = useRef({ x: 50, y: 50 })
  const frameRef = useRef(0)
  const lastRef = useRef(0)
  const tauRef = useRef(0)

  // Built once per prop change; per-event updates only touch the custom
  // properties inside these strings.
  const maskImage = useMemo(
    () => spotlightMaskGradient({ size, feather, dim, darkColor }),
    [size, feather, dim, darkColor],
  )
  const glowImage = useMemo(
    () => spotlightGlowGradient({ size, feather, glow, lightColor }),
    [size, feather, glow, lightColor],
  )

  // Reduced motion removes the trailing, not the effect: the light still
  // follows, it just stops easing behind the pointer.
  useEffect(() => {
    const value = Number.isFinite(smoothing) ? smoothing : SPOTLIGHT_SMOOTHING_DEFAULT
    tauRef.current = prefersReducedMotion() ? 0 : clamp(value, 0, SPOTLIGHT_SMOOTHING_MAX)
  }, [smoothing])

  useEffect(() => {
    if (!visible || paused) return undefined
    const host = rootRef.current
    if (!host) return undefined

    const write = (x, y) => {
      host.style.setProperty('--wallkit-spotlight-x', `${x.toFixed(2)}%`)
      host.style.setProperty('--wallkit-spotlight-y', `${y.toFixed(2)}%`)
    }

    const tick = (nowMs) => {
      const delta = Math.min(0.05, Math.max(0, (nowMs - lastRef.current) / 1000))
      lastRef.current = nowMs

      const target = targetRef.current
      if (!target) {
        frameRef.current = 0
        return
      }

      const current = currentRef.current
      const tau = tauRef.current
      const next = {
        x: spotlightApproach(current.x, target.x, tau, delta),
        y: spotlightApproach(current.y, target.y, tau, delta),
      }
      currentRef.current = next
      write(next.x, next.y)

      const settled = Math.abs(target.x - next.x) < 0.35 && Math.abs(target.y - next.y) < 0.35
      frameRef.current = settled ? 0 : window.requestAnimationFrame(tick)
    }

    const startLoop = () => {
      if (frameRef.current !== 0) return
      lastRef.current = performance.now()
      frameRef.current = window.requestAnimationFrame(tick)
    }

    const handlePointer = (event) => {
      // Only left/top come from the client rect, and only to translate the
      // pointer into this box's coordinate space; the extent still comes from
      // offsetWidth / offsetHeight so a transformed ancestor cannot skew it.
      const rect = host.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const width = host.offsetWidth
      const height = host.offsetHeight
      if (x < 0 || y < 0 || x > width || y > height) return

      // The reveal is a data attribute rather than state: it must not cause a
      // render on the first move of the session.
      if (host.dataset.active !== 'true') host.dataset.active = 'true'

      targetRef.current = { x: (x / Math.max(1, width)) * 100, y: (y / Math.max(1, height)) * 100 }

      if (tauRef.current <= 0) {
        currentRef.current = targetRef.current
        write(currentRef.current.x, currentRef.current.y)
        return
      }
      startLoop()
    }

    window.addEventListener('pointermove', handlePointer)
    // A click with no preceding move (touch, or a pointer that entered without
    // reporting movement) should still light the spot.
    window.addEventListener('pointerdown', handlePointer)

    return () => {
      window.removeEventListener('pointermove', handlePointer)
      window.removeEventListener('pointerdown', handlePointer)
      if (frameRef.current !== 0) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = 0
      }
    }
  }, [visible, paused])

  if (!visible) return null

  return (
    <div ref={rootRef} className="wallkit-spotlight" aria-hidden="true">
      <div className="wallkit-spotlight__mask" style={{ backgroundImage: maskImage }} />
      {Number(glow) > 0 ? (
        <div className="wallkit-spotlight__glow" style={{ backgroundImage: glowImage }} />
      ) : null}
    </div>
  )
}
