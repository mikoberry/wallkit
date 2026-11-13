// Audio data helpers.
//
// The library never collects audio itself: these are pure functions the caller
// runs over a raw Wallpaper Engine frame (128 values, 64 bands per channel) to
// produce the normalised bar array a Spectrum consumes. Keeping the processing
// here means the component stays a pure view, and a caller that already has
// bars can ignore all of this.
//
// Indices 0-63 are the left channel, 64-127 the right; low index is bass and
// each value is roughly 0..1.

// Frequency bands per channel, matching the Wallpaper Engine contract.
export const AUDIO_BANDS = 64

// Canonical bar count drawn by the spectrum visualiser. Mirrors the engine
// layout so the same renderer works for both channels.
export const SPECTRUM_BARS = AUDIO_BANDS * 2

// Default bar colour, matching the --wallkit-accent theme token.
export const DEFAULT_SPECTRUM_COLOR = '#a8c4ff'

// Response-shaping bounds. `intensity` is a percentage multiplier (100 = 1x, the
// raw bars); `curve` is the exponent applied to each level before the gain
// (1 = linear, below 1 lifts quiet bands, above 1 sharpens into distinct peaks).
export const SPECTRUM_INTENSITY_MIN = 0
export const SPECTRUM_INTENSITY_MAX = 1000
export const SPECTRUM_INTENSITY_DEFAULT = 100
export const SPECTRUM_CURVE_MIN = 0.2
export const SPECTRUM_CURVE_MAX = 2
export const SPECTRUM_CURVE_DEFAULT = 1

// Bass covers the lowest bands; kick drums and bass lines live here, which is
// what makes an element feel like it reacts to the beat.
const BASS_BANDS = 8

// Rises fast so a beat is visible immediately, decays slowly so the bars do not
// flicker between frames. Time constants in 1/second.
const ATTACK = 60
const RELEASE = 6

// Quiet samples carry residual noise that would otherwise show up as a constant
// shimmer. The engine keeps reporting small non-zero values even in silence, so
// a low-but-visible floor is needed or every bar drifts downward forever.
const NOISE_FLOOR = 0.06

// Wallpaper Engine occasionally reports values slightly above 1.
function clampUnit(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 1)
}

function denoise(value) {
  const clamped = clampUnit(value)
  if (clamped <= NOISE_FLOOR) return 0
  // Rescale so the floor does not create a visible step.
  return (clamped - NOISE_FLOOR) / (1 - NOISE_FLOOR)
}

/**
 * Whether a value is a plain `#rrggbb` colour string.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
}

/**
 * Split a `#rrggbb` colour into the two gradient stops the bars are drawn with:
 * a solid top and a translucent bottom. Returns `null` for invalid input so the
 * caller can fall back instead of painting nothing.
 *
 * @param {string} hex
 * @returns {{ top: string, bottom: string } | null}
 */
export function spectrumGradientStops(hex) {
  if (!isHexColor(hex)) return null

  const value = parseInt(hex.trim().slice(1), 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255

  return {
    top: `rgba(${r}, ${g}, ${b}, 0.95)`,
    bottom: `rgba(${r}, ${g}, ${b}, 0.45)`,
  }
}

/**
 * Turn a raw 128-length frame into per-bar heights.
 *
 * The layout mirrors the physical channels: the left channel fills bars 0-63
 * and the right channel fills bars 64-127 in reverse, so the two channels meet
 * in the middle like a mirrored equaliser. Returns `null` for unusable frames.
 *
 * @param {Float32Array|number[]} audioArray
 * @param {Float32Array} [out]  Buffer of length SPECTRUM_BARS.
 * @returns {Float32Array | null}
 */
export function extractSpectrumBars(audioArray, out = new Float32Array(SPECTRUM_BARS)) {
  if (!audioArray || typeof audioArray.length !== 'number') return null
  if (audioArray.length < SPECTRUM_BARS) return null
  if (out.length !== SPECTRUM_BARS) return null

  for (let i = 0; i < AUDIO_BANDS; i += 1) {
    out[i] = denoise(audioArray[i])
    // Mirror the right channel so low frequencies sit at both outer edges.
    out[AUDIO_BANDS + i] = denoise(audioArray[SPECTRUM_BARS - 1 - i])
  }

  return out
}

/**
 * Reduce a raw 128-length frame to one level plus a left/right split. Useful to
 * callers that want a single "beat" value rather than the full bar array.
 *
 * @param {Float32Array|number[]} audioArray
 * @returns {{ bass: number, left: number, right: number } | null}
 */
export function summarizeWallpaperAudio(audioArray) {
  if (!audioArray || typeof audioArray.length !== 'number') return null
  if (audioArray.length < SPECTRUM_BARS) return null

  let bassSum = 0
  let leftSum = 0
  let rightSum = 0

  for (let i = 0; i < AUDIO_BANDS; i += 1) {
    const left = clampUnit(audioArray[i])
    const right = clampUnit(audioArray[i + AUDIO_BANDS])
    leftSum += left
    rightSum += right
    if (i < BASS_BANDS) bassSum += (left + right) / 2
  }

  return {
    bass: bassSum / BASS_BANDS,
    left: leftSum / AUDIO_BANDS,
    right: rightSum / AUDIO_BANDS,
  }
}

/**
 * Fold a bar array into a different number of bars by averaging adjacent
 * buckets.
 *
 * The bar count is a rendering-density choice, not part of the audio contract:
 * `extractSpectrumBars` always returns SPECTRUM_BARS (128), and this collapses
 * that to whatever the caller wants to draw (for example 32 chunky columns, or
 * 64 for a calmer ring). Order is preserved, so bass stays at the low indices
 * and a mirrored input stays mirrored. Upsampling is allowed and simply repeats
 * the nearest source bucket.
 *
 * @param {Float32Array|number[]} bars
 * @param {number} [count=SPECTRUM_BARS]  Desired bar count.
 * @param {Float32Array} [out]  Buffer of length `count` to fill.
 * @returns {Float32Array | null}
 */
export function resampleBars(bars, count = SPECTRUM_BARS, out) {
  if (!bars || typeof bars.length !== 'number' || bars.length === 0) return null

  const target = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : SPECTRUM_BARS
  const buffer = out ?? new Float32Array(target)
  if (buffer.length !== target) return null

  const source = bars.length
  for (let c = 0; c < target; c += 1) {
    const start = Math.floor((c * source) / target)
    const end = Math.max(start + 1, Math.floor(((c + 1) * source) / target))
    let sum = 0
    for (let i = start; i < end; i += 1) sum += clampUnit(bars[i])
    buffer[c] = sum / (end - start)
  }

  return buffer
}

/**
 * Average energy of the lowest bands, 0..1. Used by the renderers that react to
 * the beat as a whole (rings, ripples, aurora) rather than to individual bands.
 *
 * @param {Float32Array|number[]} bars
 * @param {Object} [options]
 * @param {number} [options.bands=8]
 * @returns {number}
 */
export function bassLevel(bars, { bands = BASS_BANDS } = {}) {
  if (!bars || bars.length === 0) return 0
  const count = Math.max(1, Math.min(bands, bars.length))
  let sum = 0
  for (let i = 0; i < count; i += 1) sum += clampUnit(bars[i])
  return sum / count
}

/**
 * Frame-rate independent smoothing with asymmetric attack/release, so a beat
 * punches in quickly and fades out gently.
 *
 * @param {number} current
 * @param {number} target
 * @param {number} deltaSeconds
 * @returns {number}
 */
export function smoothAudioLevel(current, target, deltaSeconds) {
  if (!Number.isFinite(current)) return clampUnit(target)
  if (!Number.isFinite(target)) return current
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current

  const rising = target > current
  const rate = rising ? ATTACK : RELEASE
  const alpha = 1 - Math.exp(-rate * deltaSeconds)
  const next = current + (target - current) * alpha
  return Math.abs(target - next) < 0.002 ? clampUnit(target) : clampUnit(next)
}

/**
 * Apply the caller's response settings to one bar level.
 *
 * This is presentation shaping, not data processing: the same normalised bar can
 * be drawn flat, lifted, or pushed to the top of the range. `intensity` is a
 * multiplier (1 = unchanged) and `curve` is the exponent applied first, so the
 * defaults `{ intensity: 1, curve: 1 }` reproduce the raw bar exactly. The
 * result is clamped to 0..1 so a boost cannot overshoot the canvas.
 *
 * @param {number} level  Normalised bar magnitude.
 * @param {Object} [options]
 * @param {number} [options.intensity=1]
 * @param {number} [options.curve=1]
 * @returns {number}
 */
export function shapeSpectrumLevel(level, { intensity = 1, curve = 1 } = {}) {
  const gain = Number.isFinite(intensity) ? intensity : 1
  const exponent = Number.isFinite(curve) && curve > 0 ? curve : 1
  return clampUnit(Math.pow(clampUnit(level), exponent) * gain)
}
