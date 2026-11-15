// Frame helpers — a REC-style viewfinder drawn around the whole picture.
//
// The effect is pure CSS: hairline borders on a full-bleed overlay, plus a
// handful of monospaced readouts. There is no canvas, no draw loop and no timer
// here, which is also why nothing in this file touches the DOM.
//
// The timecode is the one thing that looks stateful and is not. A wallpaper
// freezes when the host pauses (§5.4: components hold no timers), so a readout
// that advanced on its own would end up disagreeing with the picture. The
// component takes a finished string; `formatTimecode()` is only the formatter
// for the caller that owns the clock.

export const FRAME_VARIANTS = ['corners', 'frame', 'bracket', 'film']
export const FRAME_VARIANT_DEFAULT = 'corners'

// Distance from the picture edge to the frame line, in px. Also the gutter the
// corner readouts sit in.
export const FRAME_INSET_MIN = 0
export const FRAME_INSET_MAX = 240
export const FRAME_INSET_DEFAULT = 28

// Hairline weight. Defaults above 1px on purpose: Wallpaper Engine runs at the
// desktop's DPR, where a 1px line straddles two device pixels and reads as a
// grey smear rather than a crisp edge.
export const FRAME_THICKNESS_MIN = 0.5
export const FRAME_THICKNESS_MAX = 8
export const FRAME_THICKNESS_DEFAULT = 1.5

// Length of a corner bracket arm, in px.
export const FRAME_LENGTH_MIN = 0
export const FRAME_LENGTH_MAX = 240
export const FRAME_LENGTH_DEFAULT = 56

// Uniform visual multiplier applied to inset / thickness / length / type. The
// same knob `Clock` calls `size`: 1 is the intended look at 1080p.
export const FRAME_SIZE_MIN = 0.5
export const FRAME_SIZE_MAX = 3
export const FRAME_SIZE_DEFAULT = 1

export const FRAME_GRIDS = ['none', 'thirds', 'cross']
export const FRAME_GRID_DEFAULT = 'none'

// Timecode frame rate. 24 is the film default; 30 and 60 are common for video.
export const FRAME_FPS_MIN = 1
export const FRAME_FPS_MAX = 120
export const FRAME_FPS_DEFAULT = 24

/**
 * @param {string} value
 * @returns {string} One of `FRAME_VARIANTS`.
 */
export function normalizeFrameVariant(value) {
  return FRAME_VARIANTS.includes(value) ? value : FRAME_VARIANT_DEFAULT
}

/**
 * Accepts `false` as a synonym for `'none'`, because that is how a boolean
 * switch is naturally written at the call site.
 *
 * @param {string|boolean} value
 * @returns {string} One of `FRAME_GRIDS`.
 */
export function normalizeFrameGrid(value) {
  if (value === false || value == null) return FRAME_GRID_DEFAULT
  if (value === true) return 'thirds'
  return FRAME_GRIDS.includes(value) ? value : FRAME_GRID_DEFAULT
}

/**
 * Clamp a numeric prop, falling back on anything that is not a finite number.
 * Strings are accepted because `Number('28')` is 28 and `Number('28px')` is
 * NaN — the latter falls back rather than rendering nothing.
 *
 * @param {*} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function normalizeFrameNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

function pad(value) {
  return String(value).padStart(2, '0')
}

/**
 * Format elapsed seconds as a camera timecode: `HH:MM:SS:FF`.
 *
 * Hours are not wrapped, so a wallpaper left on for 30 hours reads `30:00:00:00`
 * instead of silently restarting. Negative and non-finite inputs read as zero
 * rather than throwing, matching the "degrade quietly" rule the control layer
 * follows everywhere else.
 *
 * @param {number} seconds Elapsed seconds, may be fractional.
 * @param {number} [fps=24] Frames per second, clamped to 1..120.
 * @returns {string}
 */
export function formatTimecode(seconds, fps = FRAME_FPS_DEFAULT) {
  const rate = Math.min(Math.max(Math.round(Number(fps)) || FRAME_FPS_DEFAULT, FRAME_FPS_MIN), FRAME_FPS_MAX)
  const safe = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0

  const totalFrames = Math.floor(safe * rate)
  const frames = totalFrames % rate
  const totalSeconds = Math.floor(totalFrames / rate)

  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(
    totalSeconds % 60,
  )}:${pad(frames)}`
}
