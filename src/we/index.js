// Wallpaper Engine data hooks — the optional bridge from host callbacks to
// React props.
//
// The components never depend on this module: they take plain props, so a
// project can build its own data and skip this entirely. It exists only to
// avoid re-writing the same listener plumbing in every wallpaper project.
//
// It does NOT cover `now` (a Clock's time is driven by the caller), project.json,
// or any background rendering. Pair it with `wallkit/we/vite` to inject the
// matching <head> scripts, or paste them from docs/we-integration.md §2.2.

export { useWallpaperAudio, useWallpaperBeat } from './audio.js'
export { useWallpaperMedia, useWallpaperTimeline } from './media.js'
export { useWallpaperPaused } from './pause.js'
