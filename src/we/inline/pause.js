// Wallpaper Engine pause bridge, as a string.
//
// Kept in sync with docs/we-integration.md §2.2. Must be injected after the
// audio bridge: the fallback branch uses the presence of
// wallpaperRegisterAudioListener to tell whether the host is ready.
//
// Never create wallpaperPropertyListener unconditionally — that makes a plain
// browser look like Wallpaper Engine to any environment probe. In the default
// segment order the properties bridge has already installed the object, so the
// first branch is the one that runs; the second covers that segment being
// disabled.

export const pauseBridgeScript = `window.__wallkitPaused = false;

function __wallkitSetPaused(value) {
  var next = value === true;
  if (window.__wallkitPaused === next) return;
  window.__wallkitPaused = next;
  window.dispatchEvent(new CustomEvent('wallkit-pause-change', { detail: next }));
}

// Reuse the object the host — or the properties bridge — already created.
if (window.wallpaperPropertyListener) {
  window.wallpaperPropertyListener.setPaused = __wallkitSetPaused;
} else if (typeof window.wallpaperRegisterAudioListener === 'function') {
  window.wallpaperPropertyListener = { setPaused: __wallkitSetPaused };
}
`
