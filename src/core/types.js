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
 * Anchoring for every floating overlay.
 *
 * Each component takes an `anchor` and two offsets, all flat props — there is
 * no `{ anchor, offsetX, offsetY }` object to build.
 *
 * An anchor names two points that are made to coincide: one on the viewport and
 * the same one on the widget. `bottom-left` puts the widget's bottom-left corner
 * on the viewport's bottom-left corner; `center-left` puts the widget's
 * left-middle point on the viewport's left-middle point; `center` makes the two
 * centres coincide, so two centre-anchored widgets share an exact centre no
 * matter how differently sized they are.
 *
 * A numeric offset grows **inward** from the anchor point, so `0` always means
 * "flush with the edge" and a positive value pulls the widget toward the middle
 * of the screen. Moving a widget from the left to the right does not flip the
 * sign of `offsetX`; only the anchor changes. On a centred axis the offset is a
 * signed displacement from the centre (positive = right / down), which is where
 * a negative number is useful. An offset can also be any CSS length string, so
 * a fixed `'100px'` gutter is expressible.
 *
 * `ANCHORS` (from `wallkit/core`) lists the nine ids row by row, which is also
 * the order a 3x3 picker wants. Invalid values fall back to `bottom-left`.
 *
 * `size` is a separate prop: it scales the widget's own reference box, and its
 * bounds differ per component (`CLOCK_SIZE_MIN/MAX`, `SPECTRUM_SIZE_MIN/MAX`,
 * `ALBUM_ART_SIZE_MIN/MAX`). Where a single length is enough it also accepts a
 * CSS string — `AlbumArt` treats it as the cover diameter — and `Spectrum` adds
 * `width`/`height` for a box of a specific shape.
 *
 * @typedef {'top-left'|'top-center'|'top-right'|'center-left'|'center'|'center-right'|'bottom-left'|'bottom-center'|'bottom-right'} Anchor
 */

/**
 * A rendered 3D tilt in degrees.
 *
 * @typedef {Object} Tilt
 * @property {number} rotateX
 * @property {number} rotateY
 */

/**
 * Pointer-effect samples.
 *
 * `PointerFx` is the one control that collects its own input: it listens to
 * `pointermove` / `pointerdown` on `window`, exactly like `Clock`'s tilt
 * tracking, and maps client coordinates into its own overlay box. Samples are
 * held in preallocated ring buffers that are rewritten in place and read from
 * the draw loop, so a 120 Hz pointer costs zero React re-renders.
 *
 * A wallpaper that receives no pointer events keeps an empty canvas. There is
 * deliberately no synthetic trail fallback, for the same reason the spectrum
 * controls have no synthetic audio.
 *
 * Richer styles (rising bubbles, falling firework embers) do not allocate a
 * particle array, and both work on either channel (`trailVariant` or
 * `clickVariant`). Each sample carries a `seed`, and the draw loop recomputes
 * every particle's direction, size and timing from `(seed, index)` on each
 * frame. That keeps the buffers fixed-size and the scatter perfectly stable.
 * `pointerLife(channel, variant)` decides how long a sample stays alive, which
 * is also what allows the rAF loop to stop.
 *
 * @typedef {Object} PointerSample
 * @property {number} x       Local x inside the overlay box, in CSS pixels.
 * @property {number} y       Local y inside the overlay box, in CSS pixels.
 * @property {number} time    Seconds on the performance.now() clock.
 * @property {number} speed   Pointer speed in px/s, used only for styling.
 * @property {number} seed    Deterministic scatter seed for this sample.
 */

/**
 * The overlay fills its positioning context instead of using the anchor
 * triple. A parent with `position: relative` and a definite size is required —
 * the same contract as `MiniSpectrum`, except the parent also owns the
 * coordinate origin for pointer mapping.
 *
 * @typedef {'glow'|'ribbon'|'bubble'|'firework'} PointerTrailVariant
 */

/**
 * @typedef {'ripple'|'sparks'|'bubble'|'firework'} PointerClickVariant
 */

/**
 * Sizing is per channel but keeps one shared default. `size` sets both; a
 * supplied `trailSize` / `clickSize` overrides just its own channel. All three
 * are percentages in `POINTER_FX_SIZE_MIN..MAX`, resolved by
 * `pointerSizeScale(value, fallback)` into `trailScale` / `clickScale` on the
 * draw settings. Neither scale changes the overlay box or the sampling rate —
 * it only multiplies painted radii, travel distances and line widths.
 *
 * @typedef {Object} PointerSizeProps
 * @property {number} [size=100]        Shared default percentage.
 * @property {number} [trailSize]       Overrides `size` for the trail.
 * @property {number} [clickSize]       Overrides `size` for click bursts.
 */

export {}
