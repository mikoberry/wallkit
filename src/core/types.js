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
 * Overlay placement — described here, but deliberately **not** a typedef:
 * there is no `Placement` object in the API.
 *
 * Every overlay component takes three flat props instead:
 *
 *   offsetX   viewport percentage from the left edge (0 = left, 100 = right)
 *   offsetY   viewport percentage from the bottom edge (0 = bottom, 100 = top)
 *   size      percentage of the component's own reference size, 100 = normal
 *
 * There is no `anchor` and no `scale` object: the anchor is always the
 * bottom-left corner, which keeps the coordinates of two overlays in the same
 * wallpaper directly comparable. `size` bounds differ per component
 * (`CLOCK_SIZE_MIN/MAX`, `SPECTRUM_SIZE_MIN/MAX`, `ALBUM_ART_SIZE_MIN/MAX`).
 */

/**
 * A rendered 3D tilt in degrees.
 *
 * @typedef {Object} Tilt
 * @property {number} rotateX
 * @property {number} rotateY
 */

export {}
