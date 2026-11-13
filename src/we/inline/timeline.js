// Optional Wallpaper Engine media timeline bridge, as a string.
//
// WE docs: "Not all media players support this feature, make sure your
// wallpaper also works fine when this function is never called." So the global
// starts as null and only ever receives real, finite values — a player without
// timeline support leaves it null forever. Nothing here ticks or interpolates.
//
// Off by default in wallkitWE({ timeline }). Enable it only when a consumer
// actually needs position/duration.

export const timelineBridgeScript = `window.__wallkitTimeline = null;

if (typeof window.wallpaperRegisterMediaTimelineListener === 'function') {
  window.wallpaperRegisterMediaTimelineListener(function (event) {
    if (!event) return;
    // No coercion and no fallback: an event without real numbers is not data.
    if (typeof event.position !== 'number' || typeof event.duration !== 'number') return;
    if (!isFinite(event.position) || !isFinite(event.duration) || event.duration <= 0) return;
    window.__wallkitTimeline = { position: event.position, duration: event.duration };
  });
}
`
