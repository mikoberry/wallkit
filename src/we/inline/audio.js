// Wallpaper Engine audio bridge, as a string.
//
// The Vite plugin injects this as a classic script at the top of <head>; projects
// without the plugin can paste the copy in docs/we-integration.md §2.2 instead.
// Keep the two in sync — this text is the one that was verified in the engine.
//
// The host reuses its audio buffer between callbacks, so the frame has to be
// copied. Registering from a module script (or on window.onload) loses the
// first frames and sometimes prevents the callback from firing at all.

export const audioBridgeScript = `window.__wallkitAudioFrame = null;
window.__wallkitAudioAt = 0;

if (typeof window.wallpaperRegisterAudioListener === 'function') {
  window.wallpaperRegisterAudioListener(function (audioArray) {
    if (!audioArray || typeof audioArray.length !== 'number' || audioArray.length < 128) {
      return;
    }
    // Copy: the host reuses its own buffer.
    window.__wallkitAudioFrame = Float32Array.from(audioArray);
    window.__wallkitAudioAt = Date.now();
  });
}
`
