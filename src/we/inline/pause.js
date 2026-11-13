// Wallpaper Engine pause bridge, as a string.
//
// Kept in sync with docs/we-integration.md §2.2. Must be injected after the
// audio bridge: the fallback branch uses the presence of
// wallpaperRegisterAudioListener to tell whether the host is ready.
//
// Never create wallpaperPropertyListener unconditionally — that makes a plain
// browser look like Wallpaper Engine to any environment probe.

export const pauseBridgeScript = `window.__wallkitPaused = false;

function __wallkitSetPaused(value) {
  var next = value === true;
  if (window.__wallkitPaused === next) return;
  window.__wallkitPaused = next;
  window.dispatchEvent(new CustomEvent('wallkit-pause-change', { detail: next }));
}

// Only attach to an object the host already created. Creating
// \`wallpaperPropertyListener\` unconditionally would make the environment
// probe report "inside Wallpaper Engine" in a plain browser.
if (window.wallpaperPropertyListener) {
  window.wallpaperPropertyListener.setPaused = __wallkitSetPaused;
} else if (typeof window.wallpaperRegisterAudioListener === 'function') {
  window.wallpaperPropertyListener = { setPaused: __wallkitSetPaused };
}
`
