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
 * The meridiem is lifted out so a layout can typeset the seconds small and
 * place the marker on its own. It is matched on either side of the clock
 * because locales disagree: `en-US` and `en-GB` append it ("08:46:28 AM"),
 * while `zh-CN` and `ja-JP` prefix it ("上午08:46:28"). Assuming a trailing
 * suffix left the day period glued to the digits for those locales, where it
 * rendered as a huge stray word.
 *
 * The match is case-insensitive because `en-GB` emits a lowercase "am".
 *
 * @param {string} timeString
 * @returns {{ hours: string, minutes: string, seconds: string, ampm: string }}
 */
export function splitClockTime(timeString) {
  // Clock markers: latin AM/PM, and the CJK day periods used by zh/ja/ko.
  const marker = /(am|pm|上午|下午|凌晨|早上|中午|晚上|早上|午前|午後|오전|오후)/i
  const match = marker.exec(timeString)
  const ampm = match ? match[0].toUpperCase() : ''
  const digits = timeString.replace(marker, '').trim()

  const chunks = digits.split(':')
  return {
    hours: chunks[0] || '00',
    minutes: chunks[1] || '00',
    seconds: chunks[2] || '00',
    ampm,
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
 * Progress through the current day, current hour, and current minute, each as
 * a 0..1 fraction. Drives the geometric layouts (ring, segments).
 *
 * Seconds are included in every fraction so a progress arc advances smoothly
 * instead of jumping once a minute.
 *
 * @param {Date} date
 * @returns {{ day: number, hour: number, minute: number, second: number }}
 */
export function clockProgress(date) {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = date.getSeconds()
  const millis = date.getMilliseconds()
  const secondFraction = (seconds + millis / 1000) / 60

  return {
    day: (hours * 3600 + minutes * 60 + seconds + millis / 1000) / 86400,
    hour: (minutes * 60 + seconds + millis / 1000) / 3600,
    minute: secondFraction,
    second: seconds / 60,
  }
}

/**
 * Dash geometry for a progress arc drawn on an SVG circle.
 *
 * The circle is stroked with `stroke-dasharray: dash gap; stroke-dashoffset:
 * offset`, where the gap is the full circumference. Offsetting by
 * `circumference * (1 - fraction)` reveals exactly `fraction` of the ring.
 *
 * @param {number} fraction  0..1
 * @param {number} radius
 * @returns {{ circumference: number, dash: number, offset: number }}
 */
export function ringDash(fraction, radius) {
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(Math.max(Number(fraction) || 0, 0), 1)
  return {
    circumference,
    dash: circumference,
    offset: circumference * (1 - clamped),
  }
}

/**
 * Day-of-year and ISO week number, for the record-stamp layout.
 *
 * These are derived values, not clock state. The library computes them here so
 * a caller does not have to re-implement the edge cases (week 1 can begin in
 * the previous calendar year, and day 1 is not always week 1).
 *
 * @param {Date} date
 * @returns {{ dayOfYear: number, weekOfYear: number, daysInYear: number }}
 */
export function calendarPosition(date) {
  const year = date.getFullYear()

  // Day of year, counted from the local calendar date so a timezone offset
  // cannot shift the result by a day.
  const startOfYear = new Date(year, 0, 1)
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayOfYear = Math.round((startOfDay - startOfYear) / 86400000) + 1

  const daysInYear = isLeapYear(year) ? 366 : 365

  return {
    dayOfYear,
    weekOfYear: isoWeekNumber(date),
    daysInYear,
  }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

// ISO 8601: the week containing the first Thursday is week 1, and weeks start
// on Monday.
function isoWeekNumber(date) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // Shift to the Thursday of this week; its year is the ISO week year.
  const dayOfWeek = (target.getDay() + 6) % 7
  target.setDate(target.getDate() - dayOfWeek + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const firstDayOfWeek = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayOfWeek + 3)
  return 1 + Math.round((target - firstThursday) / (7 * 86400000))
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
