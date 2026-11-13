// Wallpaper Engine environment detection.
//
// The engine injects host functions into the page before any module runs, so
// presence of one of those globals is the only reliable signal.
//
// Never create these globals yourself and then test for them: a bridge that
// unconditionally assigned `window.wallpaperPropertyListener` once made the
// app believe it was running inside the engine while served in a plain
// browser, which hid the model picker and collapsed the settings drawer.
//
// `wallpaperPropertyListener` is deliberately NOT part of the evidence any
// more. The user-property bridge in src/we/inline/properties.js has to install
// that object unconditionally (the engine's docs warn that a later assignment
// misses the payload sent during page load), so its presence says "a bridge is
// loaded", not "a host is present".

const AUDIO_GLOBAL = 'wallpaperRegisterAudioListener'
const MEDIA_GLOBAL = 'wallpaperRegisterMediaStatusListener'
// Injected only by the engine, never by us: present as soon as the project has
// any `directory` property, which keeps property-only wallpapers detectable.
const DIRECTORY_GLOBAL = 'wallpaperRequestRandomFileForProperty'

/**
 * True when the page is running inside Wallpaper Engine.
 *
 * @returns {boolean}
 */
export function isWallpaperEngine() {
  if (typeof window === 'undefined') return false
  return (
    typeof window[AUDIO_GLOBAL] === 'function' ||
    typeof window[MEDIA_GLOBAL] === 'function' ||
    typeof window[DIRECTORY_GLOBAL] === 'function'
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
