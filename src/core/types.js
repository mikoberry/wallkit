// Shared data-shape conventions.
//
// These are JSDoc-only: the library ships plain JavaScript with no compile
// step, so types are documentation rather than enforcement. They exist so the
// caller building data and the component consuming it agree on one shape.

/**
 * Normalised spectrum bars.
 *
 * @typedef {Object} SpectrumBars
 * @property {Float32Array|number[]} values  Bar magnitudes, each 0..1.
 */

/**
 * Now-playing metadata.
 *
 * `primaryColor` and `textColor` come from the host (Wallpaper Engine derives
 * them from the album art) and may be empty.
 *
 * `playback` is `null` when the state is unknown. Treat unknown as playing:
 * the engine only pushes on track change, so guessing "stopped" would hide the
 * cover for good.
 *
 * @typedef {Object} TrackInfo
 * @property {string} title
 * @property {string} artist
 * @property {string} albumTitle
 * @property {string} thumbnail                        Cover image URL, may be ''
 * @property {string} primaryColor                     May be ''
 * @property {string} textColor                        May be ''
 * @property {'playing'|'paused'|'stopped'|null} playback
 */

/**
 * Placement of a free-floating overlay.
 *
 * Offsets are viewport percentages measured from the anchor: 0 sits on the
 * anchor edge, 100 on the opposite edge. `scale` sizes the whole widget.
 *
 * @typedef {Object} Placement
 * @property {'top-left'|'top-right'|'bottom-left'|'bottom-right'|'center'} anchor
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 */

/**
 * A rendered 3D tilt in degrees.
 *
 * @typedef {Object} Tilt
 * @property {number} rotateX
 * @property {number} rotateY
 */

export {}
