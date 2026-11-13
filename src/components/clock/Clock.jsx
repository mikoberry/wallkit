import { useEffect, useRef, useState } from 'react'
import {
  CLOCK_BEAT_INTENSITY_MAX,
  CLOCK_BEAT_INTENSITY_MIN,
  CLOCK_SIZE_MAX,
  CLOCK_SIZE_MIN,
  computeClockTilt,
  formatClockDateParts,
  formatClockTime,
  formatClockZone,
  prefersReducedMotion,
  smoothStep,
  splitClockTime,
} from '../../core/clock.js'
import './Clock.css'

// Idle tilt eases back to flat when the pointer leaves the window.
const FLAT = { rotateX: 0, rotateY: 0 }

// Maximum scale added by a full-strength beat, before the caller's intensity
// setting scales it down or up.
const BEAT_SCALE = 0.34
// Extra glow spread at full beat. Kept at 1 so the whole musical range keeps a
// gradient: a larger factor saturates by mid volume and the halo stops
// responding exactly when the music gets loud.
const BEAT_GLOW = 1
// Bass drives the response less than linearly: real music rarely pushes the
// low bands past half scale, so lifting the curve keeps ordinary levels inside
// the visible part of the range while true peaks still read as full strength.
const BEAT_CURVE = 0.62

function viewportBounds() {
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Wallpaper Engine style clock overlay.
 *
 * Pure view: the component holds no timer and reads no storage. The caller
 * owns the clock tick and every piece of text, so pause handling, power
 * saving, and localisation stay where the data is produced.
 *
 * @param {Object} props
 * @param {Date} props.now                      Current time. Required: the caller drives it.
 * @param {boolean} [props.visible=true]        Render nothing when false.
 * @param {'card'|'minimal'|'cyberpunk'|'infobar'|'bar'|'split'|'poster'} [props.placement='card']
 * @param {'light'|'dark'} [props.theme='dark'] Text colour. 'dark' renders dark
 *   text over bright artwork; 'light' renders light text. Each layout that
 *   paints its own card reinterprets the theme against that card instead.
 * @param {boolean} [props.use24Hour=true]      24-hour or 12-hour clock.
 * @param {number} [props.size=100]             Size percentage.
 * @param {number} [props.offsetX=0]            Horizontal offset, viewport percentage.
 * @param {number} [props.offsetY=0]            Vertical offset, viewport percentage.
 * @param {number} [props.beat]                 Audio beat level 0..1, when reactive.
 * @param {number} [props.beatIntensity=100]    How strongly `beat` scales the card.
 * @param {boolean} [props.tilt=true]           Follow the pointer with a 3D tilt.
 * @param {Object} [props.labels]               Caller-supplied strings.
 * @param {string} [props.labels.locale]        Locale for date/time formatting.
 * @param {string} [props.labels.aria]          Accessible name.
 * @param {string} [props.labels.weekday]       Weekday text, when the layout shows it.
 * @param {string} [props.labels.dateWithWeekday] Pre-composed "date weekday" line.
 * @param {(hourFormat: '12'|'24') => void} [props.onToggleHourFormat]
 */
export default function Clock({
  now,
  visible = true,
  placement = 'card',
  theme = 'dark',
  use24Hour = true,
  size = 100,
  offsetX = 0,
  offsetY = 0,
  beat = 0,
  beatIntensity = 100,
  tilt = true,
  labels = {},
  onToggleHourFormat,
}) {
  const [renderedTilt, setRenderedTilt] = useState(FLAT)

  // The rendered tilt is driven by a rAF loop easing `current` toward the
  // pointer-derived `target`. A CSS transition alone stutters while the target
  // keeps changing, because every new value restarts the transition.
  const targetRef = useRef(FLAT)
  const currentRef = useRef(FLAT)
  const frameRef = useRef(0)
  const lastTimeRef = useRef(0)

  const active = visible && tilt

  // Pointer tracking drives the tilt target. It listens on window because the
  // wallpaper's canvas owns the pointer events.
  useEffect(() => {
    if (!active) return undefined

    const reduced = prefersReducedMotion()
    if (reduced) {
      targetRef.current = FLAT
      currentRef.current = FLAT
      setRenderedTilt(FLAT)
      return undefined
    }

    const handlePointerMove = (event) => {
      targetRef.current = computeClockTilt(
        { x: event.clientX, y: event.clientY },
        viewportBounds(),
      )
    }

    const handleLeave = () => {
      targetRef.current = FLAT
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerleave', handleLeave)
    document.addEventListener('pointerleave', handleLeave)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handleLeave)
      document.removeEventListener('pointerleave', handleLeave)
    }
  }, [active])

  // Ease the rendered tilt toward the target every frame.
  useEffect(() => {
    if (!active) return undefined

    lastTimeRef.current = performance.now()

    const tick = (nowMs) => {
      const delta = clamp((nowMs - lastTimeRef.current) / 1000, 0, 0.05)
      lastTimeRef.current = nowMs

      const current = currentRef.current
      const target = targetRef.current
      const next = {
        rotateX: smoothStep(current.rotateX, target.rotateX, delta),
        rotateY: smoothStep(current.rotateY, target.rotateY, delta),
      }

      // Only re-render when the angle actually moved; a settled card costs
      // nothing. The threshold is finer than a hundredth of a degree.
      if (
        Math.abs(next.rotateX - current.rotateX) > 0.001 ||
        Math.abs(next.rotateY - current.rotateY) > 0.001
      ) {
        currentRef.current = next
        setRenderedTilt(next)
      }

      frameRef.current = window.requestAnimationFrame(tick)
    }

    frameRef.current = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [active])

  // Reset the eased state when the overlay is hidden so it reappears flat.
  useEffect(() => {
    if (active) return
    targetRef.current = FLAT
    currentRef.current = FLAT
    setRenderedTilt(FLAT)
  }, [active])

  if (!visible) return null

  const time = formatClockTime(now, { use24Hour, locale: labels.locale })
  const parts = formatClockDateParts(now, labels.locale)
  const zoneInfo = formatClockZone(now)
  const zone = zoneInfo.display || zoneInfo.short || zoneInfo.iana
  const { hours, minutes, seconds, ampm } = splitClockTime(time)

  const weekday = labels.weekday ?? ''
  const dateLabel =
    labels.dateWithWeekday ?? [parts.absolute, weekday].filter(Boolean).join(' ')

  const clampedSize = clamp(Number(size) || 100, CLOCK_SIZE_MIN, CLOCK_SIZE_MAX)
  const intensity =
    clamp(Number(beatIntensity) || 0, CLOCK_BEAT_INTENSITY_MIN, CLOCK_BEAT_INTENSITY_MAX) / 100

  // Lift ordinary bass levels into the visible part of the range (see
  // BEAT_CURVE). Clamped so a stray frame above 1 cannot overshoot.
  const response = clamp(Number(beat) || 0, 0, 1) ** BEAT_CURVE

  // The glow is multiplied into a spread radius and an alpha. Keep it at or
  // below 1 so the alpha term never saturates: past 1 the halo stops gaining
  // contrast and the pulse reads as a constant bloom.
  const glow = Math.min(1, response * BEAT_GLOW * intensity)

  const themeClass = theme === 'dark' ? 'wallkit-clock--theme-dark' : 'wallkit-clock--theme-light'

  const tiltStyle = {
    transform: `perspective(900px) rotateX(${renderedTilt.rotateX.toFixed(3)}deg) rotateY(${renderedTilt.rotateY.toFixed(3)}deg) scale(${(1 + response * BEAT_SCALE * intensity).toFixed(3)})`,
    '--wallkit-clock-scale': clampedSize / 100,
    '--wallkit-clock-glow': glow.toFixed(3),
  }

  const anchorStyle = {
    left: `${offsetX}%`,
    bottom: `${offsetY}%`,
  }

  const shared = {
    className: `wallkit-clock__${placement} ${themeClass}`,
    role: 'timer',
    'aria-label': labels.aria,
    title: zoneInfo.iana || zone || undefined,
    onClick: onToggleHourFormat
      ? () => onToggleHourFormat(use24Hour ? '12' : '24')
      : undefined,
  }

  let content = null

  switch (placement) {
    case 'minimal':
      content = (
        <div {...shared}>
          <div className="wallkit-clock__time">
            <span className="wallkit-clock__hm">
              {hours}:{minutes}
            </span>
            <span className="wallkit-clock__colon">:</span>
            <span className="wallkit-clock__sec">{seconds}</span>
            {ampm && <span className="wallkit-clock__ampm">{ampm}</span>}
          </div>
          <div className="wallkit-clock__date">
            {parts.absolute} {weekday}
          </div>
          <div className="wallkit-clock__zone">
            {zoneInfo.iana ? `${zoneInfo.iana} · ${zoneInfo.short}` : zone}
          </div>
        </div>
      )
      break

    case 'cyberpunk':
      content = (
        <div {...shared}>
          <div className="wallkit-clock__scanline" aria-hidden="true" />
          <div className="wallkit-clock__time">
            <span className="wallkit-clock__hm">
              {hours}:{minutes}
            </span>
            <span className="wallkit-clock__colon">:</span>
            <span className="wallkit-clock__sec">{seconds}</span>
            {ampm && <span className="wallkit-clock__ampm">{ampm}</span>}
          </div>
          <div className="wallkit-clock__divider" />
          <div className="wallkit-clock__footer">
            <span className="wallkit-clock__date">{parts.absolute}</span>
            <span className="wallkit-clock__weekday">{weekday}</span>
            <span className="wallkit-clock__zone">
              {zoneInfo.short || zoneInfo.iana || zone}
            </span>
          </div>
        </div>
      )
      break

    case 'infobar':
      content = (
        <div {...shared}>
          <span className="wallkit-clock__zone">{zoneInfo.iana || zone}</span>
          <span className="wallkit-clock__sep">|</span>
          <span className="wallkit-clock__date">
            {weekday} {parts.absolute}
          </span>
          <span className="wallkit-clock__sep">|</span>
          <span className="wallkit-clock__time">{time}</span>
        </div>
      )
      break

    case 'bar':
      content = (
        <div {...shared}>
          <span className="wallkit-clock__time">{time}</span>
          <span className="wallkit-clock__separator" aria-hidden="true">
            ·
          </span>
          <span className="wallkit-clock__date">{dateLabel}</span>
          <span className="wallkit-clock__zone">{zone}</span>
        </div>
      )
      break

    case 'split':
      content = (
        <div {...shared}>
          <div className="wallkit-clock__header">
            <span className="wallkit-clock__badge">{weekday}</span>
            <span className="wallkit-clock__date">{parts.absolute}</span>
            {zone && <span className="wallkit-clock__zone">{zone}</span>}
          </div>
          <div className="wallkit-clock__time">{time}</div>
        </div>
      )
      break

    case 'poster':
      content = (
        <div {...shared}>
          <div className="wallkit-clock__main">
            <span className="wallkit-clock__hm">
              {hours}:{minutes}
            </span>
            <span className="wallkit-clock__sec">{seconds}</span>
          </div>
          <div className="wallkit-clock__footer">
            <span className="wallkit-clock__date">{parts.absolute}</span>
            <span className="wallkit-clock__weekday">{weekday}</span>
            {zone && <span className="wallkit-clock__zone">{zone}</span>}
          </div>
        </div>
      )
      break

    default:
      content = (
        <div {...shared}>
          <span className="wallkit-clock__date">{dateLabel}</span>
          <span className="wallkit-clock__time">{time}</span>
          <span className="wallkit-clock__zone">{zone}</span>
        </div>
      )
      break
  }

  return (
    <div className="wallkit-clock__anchor" style={anchorStyle}>
      <div className="wallkit-clock__tilt" style={tiltStyle}>
        {content}
      </div>
    </div>
  )
}
