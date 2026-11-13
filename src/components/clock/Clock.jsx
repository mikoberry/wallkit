import { useEffect, useRef, useState } from 'react'
import {
  CLOCK_BEAT_INTENSITY_MAX,
  CLOCK_BEAT_INTENSITY_MIN,
  CLOCK_SIZE_MAX,
  CLOCK_SIZE_MIN,
  calendarPosition,
  clockProgress,
  computeClockTilt,
  formatClockDateParts,
  formatClockTime,
  formatClockZone,
  prefersReducedMotion,
  ringDash,
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

// Default response curve for the beat level.
//
// Bass drives the response less than linearly: real music rarely pushes the
// low bands past half scale, so lifting the curve keeps ordinary levels inside
// the visible part of the range while true peaks still read as full strength.
//
// The exponent is exposed as the `beatCurve` prop. Raising it sharpens the
// response into distinct hits; lowering it flattens the motion into a steady
// swell that barely reacts to individual beats.
const BEAT_CURVE_DEFAULT = 0.62
const BEAT_CURVE_MIN = 0.2
const BEAT_CURVE_MAX = 2

function viewportBounds() {
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// Pointer tilt defaults. `maxTilt` is the angle reached at the viewport edge;
// `speed` is roughly how quickly the card catches up per second.
const TILT_DEFAULTS = { maxTilt: 14, speed: 8 }

// Bounds that keep a caller-supplied tilt physical: a large maxTilt would flip
// the card away from the viewer, and an extreme speed would either freeze the
// motion or remove the easing entirely.
const TILT_MAX_TILT_MAX = 45
const TILT_SPEED_MIN = 0.5
const TILT_SPEED_MAX = 30

/**
 * Resolve the `tilt` prop into concrete settings.
 *
 * Accepts `false` to disable, `true`/undefined for the defaults, or an object
 * to tune either value independently.
 *
 * @param {boolean|{ maxTilt?: number, speed?: number, enabled?: boolean }} [tilt]
 * @returns {{ enabled: boolean, maxTilt: number, speed: number }}
 */
function normalizeTilt(tilt) {
  if (tilt === false) return { ...TILT_DEFAULTS, enabled: false }
  if (tilt === true || tilt == null) return { ...TILT_DEFAULTS, enabled: true }
  if (typeof tilt !== 'object') return { ...TILT_DEFAULTS, enabled: true }

  const maxTilt = Number.isFinite(tilt.maxTilt)
    ? clamp(tilt.maxTilt, 0, TILT_MAX_TILT_MAX)
    : TILT_DEFAULTS.maxTilt
  const speed = Number.isFinite(tilt.speed)
    ? clamp(tilt.speed, TILT_SPEED_MIN, TILT_SPEED_MAX)
    : TILT_DEFAULTS.speed

  // A maxTilt of 0 is indistinguishable from "off", so treat it as such
  // instead of running a rAF loop that can never move.
  return {
    enabled: tilt.enabled !== false && maxTilt > 0,
    maxTilt,
    speed,
  }
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
 * @param {number} [props.beatCurve=0.62]       Response curve exponent for `beat`
 *   (clamped to 0.2..2). Lower lifts quiet levels into a steady swell; higher
 *   sharpens the swing into distinct hits.
 * @param {boolean|Object} [props.tilt=true]    Follow the pointer with a 3D tilt.
 *   `false` disables it. Pass an object to tune it:
 *   `{ maxTilt?: number, speed?: number }`, where `maxTilt` is the angle in
 *   degrees at the viewport edge (default 14) and `speed` is how quickly the
 *   card catches up per second (default 8; lower is softer, higher is snappier).
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
  beatCurve = BEAT_CURVE_DEFAULT,
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

  const { enabled: tiltEnabled, maxTilt, speed } = normalizeTilt(tilt)
  const active = visible && tiltEnabled

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
        { maxTilt },
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
  }, [active, maxTilt])

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
        rotateX: smoothStep(current.rotateX, target.rotateX, delta, speed),
        rotateY: smoothStep(current.rotateY, target.rotateY, delta, speed),
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
  }, [active, speed])

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

  // Geometry for the layouts that draw time rather than typeset it.
  const progress = clockProgress(now)
  const calendar = calendarPosition(now)
  const dayRing = ringDash(progress.day, 46)
  const hourRing = ringDash(progress.hour, 36)

  const clampedSize = clamp(Number(size) || 100, CLOCK_SIZE_MIN, CLOCK_SIZE_MAX)
  const intensity =
    clamp(Number(beatIntensity) || 0, CLOCK_BEAT_INTENSITY_MIN, CLOCK_BEAT_INTENSITY_MAX) / 100

  // Lift ordinary bass levels into the visible part of the range (see
  // BEAT_CURVE_DEFAULT). `beat` is clamped before the exponent so a stray frame
  // above 1 cannot overshoot and a negative value cannot invert the curve.
  const curve = Number.isFinite(beatCurve)
    ? clamp(beatCurve, BEAT_CURVE_MIN, BEAT_CURVE_MAX)
    : BEAT_CURVE_DEFAULT
  const response = clamp(Number(beat) || 0, 0, 1) ** curve

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

    case 'ring':
      content = (
        <div {...shared}>
          <svg
            className="wallkit-clock__ring-svg"
            viewBox="0 0 100 100"
            aria-hidden="true"
            focusable="false"
          >
            {/* Outer arc: progress through the whole day. */}
            <circle className="wallkit-clock__ring-track" cx="50" cy="50" r="46" />
            <circle
              className="wallkit-clock__ring-fill wallkit-clock__ring-fill--day"
              cx="50"
              cy="50"
              r="46"
              strokeDasharray={dayRing.dash}
              strokeDashoffset={dayRing.offset}
            />
            {/* Inner arc: progress through the current hour. */}
            <circle className="wallkit-clock__ring-track" cx="50" cy="50" r="36" />
            <circle
              className="wallkit-clock__ring-fill wallkit-clock__ring-fill--hour"
              cx="50"
              cy="50"
              r="36"
              strokeDasharray={hourRing.dash}
              strokeDashoffset={hourRing.offset}
            />
          </svg>
          <div className="wallkit-clock__ring-core">
            <span className="wallkit-clock__hm">
              {hours}:{minutes}
            </span>
            <span className="wallkit-clock__sec">{seconds}</span>
            <span className="wallkit-clock__ring-date">{parts.absolute}</span>
          </div>
        </div>
      )
      break

    case 'segments':
      content = (
        <div {...shared}>
          {[
            // Each bar shows how far the displayed value has advanced through
            // its own unit, so the number and the bar always agree: 09 hours
            // fills 9/24 of the day meter, 57 seconds fills 57/60.
            { key: 'hours', value: hours, fraction: Number(hours) / 24, count: 24 },
            { key: 'minutes', value: minutes, fraction: Number(minutes) / 60, count: 60 },
            { key: 'seconds', value: seconds, fraction: Number(seconds) / 60, count: 60 },
          ].map((row) => (
            <div className="wallkit-clock__seg-row" key={row.key}>
              <span className="wallkit-clock__seg-value">{row.value}</span>
              <span
                className="wallkit-clock__seg-bar"
                // Segment count drives the gradient pitch, so one bar reads as
                // 24 or 60 discrete cells without emitting those cells as DOM.
                style={{
                  '--wallkit-clock-seg-count': row.count,
                  '--wallkit-clock-seg-fill': `${(Number.isFinite(row.fraction) ? row.fraction : 0) * 100}%`,
                }}
                aria-hidden="true"
              />
            </div>
          ))}
          <div className="wallkit-clock__seg-foot">
            {parts.absolute} {weekday}
          </div>
        </div>
      )
      break

    case 'stamp':
      content = (
        <div {...shared}>
          <div className="wallkit-clock__stamp-top">
            <span className="wallkit-clock__stamp-month">{parts.month}</span>
            <span className="wallkit-clock__stamp-day">{parts.day}</span>
          </div>
          <div className="wallkit-clock__stamp-time">
            {hours}:{minutes}
            <span className="wallkit-clock__sec">{seconds}</span>
          </div>
          <div className="wallkit-clock__stamp-rule" aria-hidden="true" />
          <div className="wallkit-clock__stamp-meta">
            <span>
              第 <b>{calendar.dayOfYear}</b> 天
            </span>
            <span>
              第 <b>{calendar.weekOfYear}</b> 周
            </span>
          </div>
          <div className="wallkit-clock__stamp-foot">
            {parts.year} · {weekday}
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
