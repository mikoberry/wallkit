// Core utilities shared by every component.

export { isWallpaperEngine, isWallpaperAudioAvailable } from './env.js'
export { createStore } from './storage.js'
export { ANCHORS, ANCHOR_DEFAULT, normalizeAnchor, anchorStyle, anchorOrigin } from './anchor.js'
export {
  AUDIO_BANDS,
  SPECTRUM_BARS,
  DEFAULT_SPECTRUM_COLOR,
  SPECTRUM_INTENSITY_MIN,
  SPECTRUM_INTENSITY_MAX,
  SPECTRUM_INTENSITY_DEFAULT,
  SPECTRUM_CURVE_MIN,
  SPECTRUM_CURVE_MAX,
  SPECTRUM_CURVE_DEFAULT,
  isHexColor,
  spectrumGradientStops,
  extractSpectrumBars,
  resampleBars,
  summarizeWallpaperAudio,
  bassLevel,
  smoothAudioLevel,
  shapeSpectrumLevel,
} from './audio.js'
export {
  CLOCK_SIZE_MIN,
  CLOCK_SIZE_MAX,
  CLOCK_BEAT_INTENSITY_MIN,
  CLOCK_BEAT_INTENSITY_MAX,
  weekdayKey,
  formatClockTime,
  splitClockTime,
  formatClockDateParts,
  formatClockZone,
  clockProgress,
  ringDash,
  calendarPosition,
  computeClockTilt,
  smoothStep,
  prefersReducedMotion,
} from './clock.js'
