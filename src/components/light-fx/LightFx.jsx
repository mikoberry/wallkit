import { useEffect, useMemo, useRef } from 'react'
import { prefersReducedMotion } from '../../core/index.js'
import { spotlightApproach } from '../../core/spotlight.js'
import {
  LIGHT_ANCHOR_DEFAULT,
  LIGHT_FOLLOW_DEFAULT,
  LIGHT_INTENSITY_DEFAULT,
  LIGHT_INTENSITY_MAX,
  LIGHT_INTENSITY_MIN,
  LIGHT_PRESETS,
  LIGHT_RAYS_MAX,
  LIGHT_RAYS_MIN,
  LIGHT_SIZE_MAX,
  LIGHT_SIZE_MIN,
  LIGHT_SMOOTHING_DEFAULT,
  LIGHT_SMOOTHING_MAX,
  LIGHT_VARIANT_DEFAULT,
  lightAnchorOrigin,
  lightBeamAngle,
  lightBeamGradient,
  lightBeamMask,
  lightFollowOrigin,
  lightLayers,
  lightNumber,
  lightWashGradient,
  normalizeLightAnchor,
  normalizeLightVariant,
} from '../../core/light.js'
import './LightFx.css'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * LightFx — a directional light over the whole picture: sunlight, moonlight,
 * dusk, or a flat overcast sky.
 *
 * The look is a stack of CSS gradients, exactly like `Spotlight`: a wide wash
 * plus a hotspot, and a masked fan of shafts. There is no canvas and no draw
 * loop. Moving the light rewrites two custom properties — `--wallkit-light-x`
 * / `-y` — which the gradient strings already reference, so a pointer move
 * costs a style write instead of a repaint of new gradient text. With
 * `smoothing` at 0 that happens right inside the event; above 0 a rAF eases the
 * light towards the pointer with the same catch-up curve the spotlight uses and
 * stops the moment it arrives.
 *
 * **It shows from the first frame, unlike `Spotlight`.** A wallpaper with no
 * pointer input still has weather, so the light rests where `from` / `anchor`
 * puts it and simply stops following. `Spotlight` hides until an event arrives
 * because a full-screen dark mask with no light in it is a black screen; a
 * light with no pointer is just light. The follow is an enhancement, not the
 * effect.
 *
 * The light never drops below the horizon (`LIGHT_ORIGIN_MAX_Y`): a sun that
 * chased the pointer into the bottom half would be lighting the picture from
 * below, which reads as a floor lamp. Pointer motion is therefore remapped into
 * the top band and blended by `follow`.
 *
 * Like `PointerFx` and `Spotlight` it fills its positioning context, so the
 * `anchor` prop means something narrower here than it does on a widget: it
 * places the light *centre* (a point), not a corner of this element. It never reads
 * `window.wallpaper*`: sunshine is decoration, not data, so nothing here
 * pretends to know the real weather. Which variant matches the scene is the
 * application's decision.
 *
 * @param {Object} props
 * @param {boolean} [props.visible=true]  Render nothing when false.
 * @param {'sun'|'moon'|'dusk'|'overcast'} [props.variant='sun']
 *   `sun` is a warm midday wash with distinct shafts; `moon` is cool, dim and
 *   much softer; `dusk` is a low orange sun raking across the frame; `overcast`
 *   has no shafts at all, just a huge flat cool wash.
 * @param {string} [props.anchor='top-left'] Where the light comes from: one of
 *   the nine anchors, with `offsetX` / `offsetY` measured from that point. It
 *   places the **light centre**, not a box corner, and it is also what the
 *   shaft direction is derived from — light always throws its shafts away from
 *   the source, so there is no second prop that could contradict it. Offsets
 *   grow inward, exactly like a widget's: positive on `top-right` moves the
 *   light left, on `bottom-*` it moves up.
 * @param {number|string} [props.offsetX=0] Distance from the anchor point
 *   towards the box interior, as a percentage of its width (a `'18%'` string
 *   works too). Negative pushes the source outside the frame, which is a legal
 *   look — a window just out of shot.
 * @param {number|string} [props.offsetY=0] Same, vertically.
 * @param {number} [props.intensity=100]  Brightness of the whole light, as a
 *   percentage of the preset's own alphas (0..200). One gain over all three
 *   layers — wide wash, hotspot and shafts — so dimming it thins the light as
 *   one thing instead of leaving a bright pool around a faded sun. Above 100
 *   the alphas climb towards opaque and the hotspot blows out first.
 * @param {number} [props.size]  Radius of the wide wash in px (200..4000).
 *   Omitted, the variant picks one.
 * @param {number} [props.rays=1]  How much of the light is shafts rather than
 *   flat pool (0..1) — a ratio, not a brightness. 0 gives flat light;
 *   `overcast` has none to scale. Use `intensity` to make the light dimmer.
 * @param {number} [props.follow=0.45]  How far the light travels towards the
 *   pointer (0..1). 0 pins it to the anchor.
 * @param {number} [props.smoothing=0.12]  Follow lag as a time constant in
 *   seconds (0..0.5). 0 snaps to the pointer. Ignored under
 *   `prefers-reduced-motion`, which removes the easing, not the effect.
 * @param {string} [props.colorHex]  `#rrggbb` override of the light colour.
 *   The hotspot stays a pale version of it.
 * @param {boolean} [props.paused=false]  Keep the current frame, stop
 *   listening to the pointer.
 */
export default function LightFx({
  visible = true,
  variant = LIGHT_VARIANT_DEFAULT,
  anchor = LIGHT_ANCHOR_DEFAULT,
  offsetX = 0,
  offsetY = 0,
  intensity = LIGHT_INTENSITY_DEFAULT,
  size,
  rays = 1,
  follow = LIGHT_FOLLOW_DEFAULT,
  smoothing = LIGHT_SMOOTHING_DEFAULT,
  colorHex,
  paused = false,
}) {
  const rootRef = useRef(null)
  // Percentages of the overlay box, so a resize keeps the light where the
  // pointer left it instead of drifting off.
  const targetRef = useRef(null)
  const currentRef = useRef(null)
  // Set on the first pointer event. Until then the light sits at the anchor, and a
  // pause must not snap it back there.
  const movedRef = useRef(false)
  const frameRef = useRef(0)
  const lastRef = useRef(0)
  const tauRef = useRef(0)
  const followRef = useRef(LIGHT_FOLLOW_DEFAULT)

  const resolvedVariant = normalizeLightVariant(variant)
  // Normalised through the light's own default, not `ANCHOR_DEFAULT`: for a
  // light, "unknown" must not mean bottom-left, which would light the picture
  // from below.
  const resolvedAnchor = normalizeLightAnchor(anchor)
  // Resolved once per geometry change. Memoised rather than rebuilt every
  // render: it is an effect dependency, and a fresh object each time would
  // tear the pointer listener down and put it back on every unrelated render.
  const baseOrigin = useMemo(
    () => lightAnchorOrigin(resolvedAnchor, offsetX, offsetY),
    [resolvedAnchor, offsetX, offsetY],
  )
  const preset = LIGHT_PRESETS[resolvedVariant]

  const gain = clamp(
    Number.isFinite(Number(intensity)) ? Number(intensity) : LIGHT_INTENSITY_DEFAULT,
    LIGHT_INTENSITY_MIN,
    LIGHT_INTENSITY_MAX,
  ) / 100
  const resolvedSize = lightNumber(size, preset.size, LIGHT_SIZE_MIN, LIGHT_SIZE_MAX)
  const rayStrength = lightNumber(rays, 1, LIGHT_RAYS_MIN, LIGHT_RAYS_MAX)

  // One gain over the whole light: wash, hotspot and shafts come out of the
  // same call, so `intensity` can never dim one layer and leave another.
  const layers = useMemo(
    () => lightLayers(preset, { gain, rays: rayStrength }),
    [preset, gain, rayStrength],
  )

  const color = colorHex

  // A colour override tints the wash and the shafts together: half-tinting one
  // and leaving the other preset-warm reads as two lights, not one.
  //
  // Built once per prop change; per-event updates only touch the custom
  // properties these strings reference.
  const washImage = useMemo(
    () =>
      lightWashGradient({
        size: resolvedSize,
        color: color ?? preset.color,
        coreColor: preset.coreColor,
        washAlpha: layers.washAlpha,
        coreAlpha: layers.coreAlpha,
      }),
    [resolvedSize, preset, layers, color],
  )

  const beamImage = useMemo(
    () =>
      lightBeamGradient({
        color: color ?? preset.color,
        rayAlpha: layers.rayAlpha,
        wedge: preset.wedge,
        period: preset.period,
      }),
    [preset, layers, color],
  )

  const beamMask = useMemo(
    () => lightBeamMask({ size: resolvedSize, maskInner: preset.maskInner, maskOuter: preset.maskOuter }),
    [resolvedSize, preset],
  )

  const angle = `${lightBeamAngle(resolvedAnchor, preset.angleOffset)}deg`

  useEffect(() => {
    followRef.current = clamp(
      Number.isFinite(Number(follow)) ? Number(follow) : LIGHT_FOLLOW_DEFAULT,
      0,
      1,
    )
  }, [follow])

  // Reduced motion removes the trailing, not the effect: the light still
  // follows, it just stops easing behind the pointer.
  useEffect(() => {
    const value = Number.isFinite(Number(smoothing)) ? Number(smoothing) : LIGHT_SMOOTHING_DEFAULT
    tauRef.current = prefersReducedMotion() ? 0 : clamp(value, 0, LIGHT_SMOOTHING_MAX)
  }, [smoothing])

  // Seed the resting position. Runs even when paused, which is what makes
  // `paused` at mount show light at the configured origin rather than at the
  // stylesheet's fallback point. The deps only change when the geometry really
  // does, so a new `anchor` / offset also wins over wherever the
  // pointer had dragged the light, while an unrelated re-render leaves it put.
  useEffect(() => {
    const host = rootRef.current
    if (!host) return
    movedRef.current = false
    targetRef.current = null
    const rest = lightFollowOrigin(baseOrigin, null)
    currentRef.current = rest
    host.style.setProperty('--wallkit-light-x', `${rest.x.toFixed(2)}%`)
    host.style.setProperty('--wallkit-light-y', `${rest.y.toFixed(2)}%`)
  }, [baseOrigin, visible])

  useEffect(() => {
    if (!visible || paused) return undefined
    const host = rootRef.current
    if (!host) return undefined

    const base = baseOrigin

    const write = (x, y) => {
      host.style.setProperty('--wallkit-light-x', `${x.toFixed(2)}%`)
      host.style.setProperty('--wallkit-light-y', `${y.toFixed(2)}%`)
    }

    const tick = (nowMs) => {
      const delta = Math.min(0.05, Math.max(0, (nowMs - lastRef.current) / 1000))
      lastRef.current = nowMs

      const target = targetRef.current
      if (!target) {
        frameRef.current = 0
        return
      }

      const current = currentRef.current || target
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
      // Only left/top come from the client rect, to translate the pointer into
      // this box; the extent comes from offsetWidth / offsetHeight so a
      // transformed ancestor cannot skew it.
      const rect = host.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const width = host.offsetWidth
      const height = host.offsetHeight
      if (x < 0 || y < 0 || x > width || y > height) return

      movedRef.current = true
      const pointer = { x: x / Math.max(1, width), y: y / Math.max(1, height) }
      const next = lightFollowOrigin(base, pointer, followRef.current)
      targetRef.current = next

      if (tauRef.current <= 0) {
        currentRef.current = next
        write(next.x, next.y)
        return
      }
      startLoop()
    }

    window.addEventListener('pointermove', handlePointer)
    // A click with no preceding move (touch, or a pointer that entered without
    // reporting movement) should still move the light.
    window.addEventListener('pointerdown', handlePointer)

    return () => {
      window.removeEventListener('pointermove', handlePointer)
      window.removeEventListener('pointerdown', handlePointer)
      if (frameRef.current !== 0) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = 0
      }
    }
  }, [visible, paused, baseOrigin])

  if (!visible) return null

  return (
    <div
      ref={rootRef}
      className="wallkit-light"
      data-variant={resolvedVariant}
      data-anchor={resolvedAnchor}
      style={{ '--wallkit-light-angle': angle }}
      aria-hidden="true"
    >
      <div className="wallkit-light__wash" style={{ backgroundImage: washImage }} />
      {beamImage ? (
        <div
          className="wallkit-light__beams"
          style={{ backgroundImage: beamImage, WebkitMaskImage: beamMask, maskImage: beamMask }}
        />
      ) : null}
    </div>
  )
}
