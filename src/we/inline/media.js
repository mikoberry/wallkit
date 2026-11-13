// Wallpaper Engine media bridge, as a string.
//
// Kept in sync with docs/we-integration.md §2.2. Playback states are host-defined
// integers: never hardcode them, and keep the state unknown when
// window.wallpaperMediaIntegration is missing. Guessing "stopped" there would
// hide the album cover for good, because the engine only pushes on change.
//
// The engine only pushes on change, so there is no clock here: the React side
// polls this object at 2 Hz (see useWallpaperMedia).

export const mediaBridgeScript = `window.__wallkitMedia = {
  thumbnail: '',
  title: '',
  artist: '',
  albumTitle: '',
  primaryColor: '',
  textColor: '',
  playback: null,
  enabled: null,
  updatedAt: 0,
};

var __wm = window.__wallkitMedia;

if (typeof window.wallpaperRegisterMediaStatusListener === 'function') {
  window.wallpaperRegisterMediaStatusListener(function (event) {
    __wm.enabled = event ? event.enabled === true : null;
  });
}

if (typeof window.wallpaperRegisterMediaThumbnailListener === 'function') {
  window.wallpaperRegisterMediaThumbnailListener(function (event) {
    if (!event) return;
    __wm.thumbnail = event.thumbnail || '';
    __wm.primaryColor = event.primaryColor || '';
    __wm.textColor = event.textColor || '';
    __wm.updatedAt = Date.now();
  });
}

if (typeof window.wallpaperRegisterMediaPropertiesListener === 'function') {
  window.wallpaperRegisterMediaPropertiesListener(function (event) {
    if (!event) return;
    __wm.title = event.title || '';
    __wm.artist = event.artist || '';
    __wm.albumTitle = event.albumTitle || '';
    __wm.updatedAt = Date.now();
  });
}

if (typeof window.wallpaperRegisterMediaPlaybackListener === 'function') {
  window.wallpaperRegisterMediaPlaybackListener(function (event) {
    if (!event) return;
    var constants = window.wallpaperMediaIntegration;
    // Playback states are host-defined integers; never hardcode them.
    // With no constants object the state stays unknown rather than being
    // guessed as "stopped", which would hide the cover for good.
    if (!constants) {
      __wm.playback = null;
      return;
    }
    if (event.state === constants.PLAYBACK_PLAYING) __wm.playback = 'playing';
    else if (event.state === constants.PLAYBACK_PAUSED) __wm.playback = 'paused';
    else __wm.playback = 'stopped';
  });
}
`
