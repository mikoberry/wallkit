// Wallpaper Engine user-property bridge, as a string.
//
// Injected by the Vite plugin at the top of <head>; projects without the plugin
// can paste the copy in docs/we-integration.md §2.2 (5). Keep the two in sync.
//
// The engine calls `applyUserProperties` once during page load with every
// declared property, then again with only the keys the user changed. That is why
// the bridge merges into a snapshot instead of replacing it: replacing would
// throw away every other property on the first slider drag.
//
// The values are stored exactly as the host sends them. Colour values arrive as
// space-separated 0..1 floats ("0.65 0.76 1"), NOT the 0..255 integers written
// into project.json — normalising here would hide that difference from the
// consumer, and every consumer would still need to handle a CSS-unready string.

export const propertiesBridgeScript = `(function () {
  window.__wallkitUserProperties = {};
  // Diagnostics ring buffer, newest last, capped at 8. It has to live in the
  // bridge: the payload WE sends while the page loads arrives before React
  // mounts, so an on-screen log filled from React alone would miss the push
  // people most often want to confirm.
  window.__wallkitPropertyLog = [];

  function __wallkitApplyUserProperties(properties) {
    if (!properties || typeof properties !== 'object') return;

    var previous = window.__wallkitUserProperties || {};
    var next = {};
    var key;
    var received = [];

    for (key in previous) {
      if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key];
    }

    for (key in properties) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
      var entry = properties[key];
      if (!entry || typeof entry !== 'object') continue;
      // "group" is a UI container with no value of its own. Storing its empty
      // string would look like real configuration on the consumer side.
      if (entry.type === 'group') continue;
      next[key] = entry.value;
      received.push(key);
    }

    window.__wallkitUserProperties = next;
    window.__wallkitPropertyLog = window.__wallkitPropertyLog
      .concat([{ at: Date.now(), keys: received }])
      .slice(-8);
    window.dispatchEvent(new CustomEvent('wallkit-properties-change', { detail: next }));
  }

  // Created unconditionally and outside any event handler: WE's documentation
  // warns that a listener installed later misses the update sent while the page
  // is still loading. The consequence is that this object also exists in a plain
  // browser, so core/env.js must never use it as proof of running in the engine.
  var host = window.wallpaperPropertyListener;
  var listener = host && typeof host === 'object' ? host : {};

  listener.applyUserProperties = __wallkitApplyUserProperties;
  window.wallpaperPropertyListener = listener;
})();
`
