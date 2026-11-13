// Pure clock helpers: formatting, tilt maths, and easing.
//
// Extracted from the wallpaper project so the component can stay stateless.
// Everything here is deterministic and free of DOM access except where noted,
// which keeps it testable and reusable.

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Minimum clock size percentage. */
export const CLOCK_SIZE_MIN = 40
/** Maximum clock size percentage. */
export const CLOCK_SIZE_MAX = 200
/** Minimum beat-response intensity percentage. */
export const CLOCK_BEAT_INTENSITY_MIN = 0
/** Maximum beat-response intensity percentage. */
export const CLOCK_BEAT_INTENSITY_MAX = 1000

/**
 * Weekday key ('sun'..'sat') for a date.
 *
 * @param {Date} date
 * @returns {string}
 */
export function weekdayKey(date) {
  return WEEKDAY_KEYS[date.getDay()]
}

function localeFor(locale) {
  return locale || 'en-GB'
}

/**
 * Format the time of day.
 *
 * @param {Date} date
 * @param {{ use24Hour?: boolean, locale?: string }} [options]
 * @returns {string}
 */
export function formatClockTime(date, { use24Hour = true, locale = 'en-GB' } = {}) {
  try {
    return new Intl.DateTimeFormat(localeFor(locale), {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: !use24Hour,
    }).format(date)
  } catch {
    const pad = (value) => String(value).padStart(2, '0')
    if (use24Hour) {
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    }
    const hour = date.getHours() % 12 || 12
    const ampm = date.getHours() >= 12 ? 'PM' : 'AM'
    return `${pad(hour)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`
  }
}

/**
 * Split a formatted time string into its display parts.
 *
 * The AM/PM suffix is lifted out so a layout can typeset the seconds small
 * without re-deriving the meridiem.
 *
 * The match is case-insensitive on purpose: `en-GB` (the default locale)
 * renders a lowercase `am`/`pm`, while the fallback path below emits uppercase.
 * Matching only `[AP]M` would silently drop the meridiem for every 12-hour
 * clock — the suffix would stay glued to the seconds instead of being lifted.
 *
 * @param {string} timeString
 * @returns {{ hours: string, minutes: string, seconds: string, ampm: string }}
 */
export function splitClockTime(timeString) {
  const ampm = /[ap]m$/i.exec(timeString)?.[0] ?? ''
  const chunks = timeString.replace(/\s*[ap]m$/i, '').split(':')
  return {
    hours: chunks[0] || '00',
    minutes: chunks[1] || '00',
    seconds: chunks[2] || '00',
    ampm: ampm.toUpperCase(),
  }
}

/**
 * Format the calendar date, plus decomposed parts for calendar layouts.
 *
 * @param {Date} date
 * @param {string} [locale]
 * @returns {{ absolute: string, weekday: string, year: number, month: string, monthNum: number, day: number }}
 */
export function formatClockDateParts(date, locale) {
  const weekday = weekdayKey(date)
  const year = date.getFullYear()
  const monthNum = date.getMonth() + 1
  const day = date.getDate()

  try {
    return {
      absolute: new Intl.DateTimeFormat(localeFor(locale), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date),
      weekday,
      year,
      month: new Intl.DateTimeFormat(localeFor(locale), { month: 'short' }).format(date),
      monthNum,
      day,
    }
  } catch {
    return {
      absolute: date.toDateString(),
      weekday,
      year,
      month: String(monthNum),
      monthNum,
      day,
    }
  }
}

/**
 * Resolve the viewer's time zone names.
 *
 * @param {Date} date
 * @returns {{ iana: string, short: string, display: string }}
 */
export function formatClockZone(date) {
  try {
    const iana = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: 'short',
    }).formatToParts(date)
    const short = parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
    return {
      iana,
      short,
      display: iana && short ? `${iana} · ${short}` : iana || short,
    }
  } catch {
    return { iana: '', short: '', display: '' }
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Map a pointer position to a 3D tilt.
 *
 * The card behaves like a physical panel: pointing at its top-right corner
 * lifts that corner toward the viewer while the opposite one sinks away. That
 * needs a positive rotateX for the top edge and a positive rotateY for the
 * right edge.
 *
 * Normalisation uses the viewport rather than the card. Normalising by the
 * card made the tilt saturate the moment the pointer left it and then jump
 * between extremes, while the full viewport keeps the angle changing
 * linearly across the whole screen.
 *
 * @param {{ x: number, y: number }} point  pointer in client coordinates
 * @param {{ left: number, top: number, width: number, height: number }} bounds
 * @param {{ maxTilt?: number }} [options]
 * @returns {{ rotateX: number, rotateY: number }}
 */
export function computeClockTilt(point, bounds, { maxTilt = 14 } = {}) {
  if (!point || !bounds || !(bounds.width > 0) || !(bounds.height > 0)) {
    return { rotateX: 0, rotateY: 0 }
  }

  const centerX = bounds.left + bounds.width / 2
  const centerY = bounds.top + bounds.height / 2

  const horizontal = clamp((point.x - centerX) / (bounds.width / 2), -1, 1)
  const vertical = -clamp((point.y - centerY) / (bounds.height / 2), -1, 1)

  return {
    rotateX: vertical * maxTilt,
    rotateY: horizontal * maxTilt,
  }
}

/**
 * Ease a value toward a target by a frame-independent fraction.
 *
 * Stepping with `1 - e^(-k*t)` keeps the response independent of frame rate
 * and stops it snapping; the value settles once the remaining distance is
 * imperceptible.
 *
 * @param {number} current
 * @param {number} target
 * @param {number} deltaSeconds  time since the previous frame
 * @param {number} [speed]       roughly "how quickly it catches up" per second
 * @returns {number}
 */
export function smoothStep(current, target, deltaSeconds, speed = 8) {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return target
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current
  const alpha = 1 - Math.exp(-speed * deltaSeconds)
  const next = current + (target - current) * alpha
  return Math.abs(target - next) < 0.01 ? target : next
}

/**
 * Whether the viewer asked for reduced motion.
 *
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
