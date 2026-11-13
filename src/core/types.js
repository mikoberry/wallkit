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
 * `primaryColor` tints `AlbumArt`'s glass panel and shelf edge. `textColor` is
 * **not** consumed by any component: the host's guess is often wrong on its own
 * UI, so text colour is chosen explicitly through the `theme` prop instead.
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
 * Corner anchoring for every floating overlay.
 *
 * Each component takes an `anchor` and two offsets, all flat props — there is
 * no `{ anchor, offsetX, offsetY }` object to build.
 *
 * Both offsets grow **inward** from the anchored side, so `0` always means
 * "flush with the corner" and a positive value pulls the widget toward the
 * middle of the screen. Moving a widget from the left to the right does not
 * flip the sign of `offsetX`; only the anchor changes.
 *
 * `ANCHORS` (from `wallkit/core`) lists the four ids in reading order, which is
 * also the order a 2x2 picker wants. Invalid values fall back to `bottom-left`.
 *
 * `size` is a separate prop: it scales the widget's own reference box, and its
 * bounds differ per component (`CLOCK_SIZE_MIN/MAX`, `SPECTRUM_SIZE_MIN/MAX`,
 * `ALBUM_ART_SIZE_MIN/MAX`).
 *
 * @typedef {'top-left'|'top-right'|'bottom-left'|'bottom-right'} Anchor
 */

/**
 * A rendered 3D tilt in degrees.
 *
 * @typedef {Object} Tilt
 * @property {number} rotateX
 * @property {number} rotateY
 */

export {}
