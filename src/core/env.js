// Wallpaper Engine environment detection.
//
// The engine injects host functions into the page before any module runs, so
// presence of one of those globals is the only reliable signal.
//
// Never create these globals yourself and then test for them: a bridge that
// unconditionally assigned `window.wallpaperPropertyListener` once made the
// app believe it was running inside the engine while served in a plain
// browser, which hid the model picker and collapsed the settings drawer.

const AUDIO_GLOBAL = 'wallpaperRegisterAudioListener'
const PROPERTY_LISTENER = 'wallpaperPropertyListener'
const MEDIA_GLOBAL = 'wallpaperRegisterMediaStatusListener'

/**
 * True when the page is running inside Wallpaper Engine.
 *
 * @returns {boolean}
 */
export function isWallpaperEngine() {
  if (typeof window === 'undefined') return false
  return (
    typeof window[AUDIO_GLOBAL] === 'function' ||
    Boolean(window[PROPERTY_LISTENER]) ||
    typeof window[MEDIA_GLOBAL] === 'function'
  )
}

/**
 * True when real system audio frames can be read from the host.
 *
 * Being inside the engine is not enough: `supportsaudioprocessing` has to be
 * enabled in the project manifest, and that flag is silently ignored when it
 * is misplaced (see docs/we-integration.md).
 *
 * @returns {boolean}
 */
export function isWallpaperAudioAvailable() {
  if (typeof window === 'undefined') return false
  return typeof window[AUDIO_GLOBAL] === 'function'
}
