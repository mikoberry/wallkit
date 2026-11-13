import MiniSpectrum from '../mini-spectrum/MiniSpectrum.jsx'
import './AlbumArt.css'

// Every layout draws from the same data; they differ only in how they arrange
// the cover, the metadata and the inline spectrum.
//
// Exported so a caller can build a layout picker without hardcoding the list.
export const ALBUM_ART_VARIANTS = ['classic', 'glass', 'vinyl', 'minimal', 'bar', 'wall']

// Size percentage bounds. 100 is the reference card (cover diameter 18vh).
// Below 20 the two-line metadata stops being legible; a card much past 300 is
// clamped by the viewport width before the scale matters, so the upper bound
// only exists to keep the number honest.
export const ALBUM_ART_SIZE_MIN = 20
export const ALBUM_ART_SIZE_MAX = 300

// The spectrum style each card layout is built around. The card picks its own
// visual so it stays coherent regardless of what the floating spectrum is set
// to; the choice follows the shape of the space the graph has to fill.
//
//   classic  tall column behind the text      bars
//   glass    same tall column, softer panel    curve
//   minimal  tall column under the type        bars
//   bar      wide, short strip                 curve
//   wall     small palette tile                dots
//
// `vinyl` is deliberately absent: that layout is a clean record with no graph.
const SPECTRUM_VARIANT_BY_CARD = {
  classic: 'bars',
  glass: 'curve',
  minimal: 'bars',
  bar: 'curve',
  wall: 'dots',
}

// Card-size bars look cramped with the full band count, so the inline spectrum
// folds to chunky columns. The lift makes quiet music still fill the strip: at
// card size an unshaped plot reads as an empty box.
//
// Deliberately not exposed as props: this pair is what makes the graph readable
// at card size, so a caller override would only be able to break it. Use
// `MiniSpectrum` directly when you want to tune the response.
const CARD_SPECTRUM_INTENSITY = 130
const CARD_SPECTRUM_CURVE = 0.7

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function Cover({ track, variant, labels }) {
  if (!track?.thumbnail) {
    return (
      <div
        className={`wallkit-album-art__placeholder wallkit-album-art__placeholder--${variant}`}
        aria-hidden="true"
      />
    )
  }
  const alt = labels.coverAlt ?? track.title ?? track.albumTitle ?? ''
  return (
    <img
      className={`wallkit-album-art__cover wallkit-album-art__cover--${variant}`}
      src={track.thumbnail}
      alt={alt}
      draggable="false"
    />
  )
}

// The metadata block. `compact` drops the album line so the tighter layouts
// (bar, wall) keep a single readable line per field.
function Meta({ track, compact = false }) {
  const title = track.title || track.albumTitle || ''
  const showAlbum = !compact && track.albumTitle && track.albumTitle !== track.title

  return (
    <>
      {title && (
        <p className="wallkit-album-art__title" title={title}>
          {title}
        </p>
      )}
      {track.artist && (
        <p className="wallkit-album-art__artist" title={track.artist}>
          {track.artist}
        </p>
      )}
      {showAlbum && (
        <p className="wallkit-album-art__album" title={track.albumTitle}>
          {track.albumTitle}
        </p>
      )}
    </>
  )
}

/**
 * Album card: cover, track metadata, and an inline spectrum.
 *
 * Pure view: it takes the current `track` as a prop and holds no poll, no
 * storage and no translations. The caller keeps reading the media bridge (the
 * engine pushes updates, so a cheap poll lives where the data is produced) and
 * only re-renders this card when something changed.
 *
 * Renders nothing when there is no track, and also when the player reports
 * `stopped` — that is the only state that hides the card. `playback: null`
 * means unknown and is treated as playing: the engine pushes only on track
 * change, so treating unknown as stopped would make the cover vanish.
 *
 * @param {Object} props
 * @param {Object|null} props.track   `TrackInfo` (see types.js). `null` renders nothing.
 * @param {Float32Array|number[]|null} [props.bars]  Optional bar magnitudes for
 *   the inline spectrum. Without them the card still renders, minus the graph
 *   (and the `bar` layout drops the strip instead of leaving it blank).
 * @param {boolean} [props.visible=true]
 * @param {'classic'|'glass'|'vinyl'|'minimal'|'bar'|'wall'} [props.variant='classic']
 *   Invalid values fall back to `classic`. `ALBUM_ART_VARIANTS` has the list.
 * @param {'light'|'dark'} [props.theme='light']  Text colour, same convention as
 *   `Clock`: `light` renders light text (dark wallpaper), `dark` renders dark
 *   text and flips the surfaces the card paints itself (glass panel, bar pill,
 *   record label, sleeves) so the ink stays readable on bright artwork.
 * @param {string} [props.colorHex]   `#rrggbb` for the **inline spectrum only**;
 *   the card's own tint comes from `track.primaryColor`. Defaults to
 *   `--wallkit-accent`.
 * @param {number} [props.size=100]   Size percentage, range 20..300. 100 is the
 *   normal card (cover diameter is 18vh).
 * @param {number} [props.offsetX=0]  Horizontal offset, viewport percentage.
 * @param {number} [props.offsetY=0]  Vertical offset, viewport percentage.
 * @param {boolean} [props.paused=false] Freeze the cover rotation and spectrum.
 * @param {{ aria?: string, coverAlt?: string }} [props.labels]  Caller-supplied
 *   strings. `coverAlt` is used verbatim when set (pass `''` for a decorative
 *   cover); otherwise it falls back to the track title, then the album title.
 */
export default function AlbumArt({
  track,
  bars,
  visible = true,
  variant = 'classic',
  theme = 'light',
  colorHex,
  size = 100,
  offsetX = 0,
  offsetY = 0,
  paused = false,
  labels = {},
}) {
  // `stopped` is the only state that hides the card; `null` (unknown) counts as
  // playing, because the engine only pushes on track change.
  if (!visible || !track || track.playback === 'stopped') return null

  const resolvedVariant = ALBUM_ART_VARIANTS.includes(variant) ? variant : 'classic'
  const resolvedTheme = theme === 'dark' ? 'dark' : 'light'
  // Playback pause dims the cover and stops the record even when the wallpaper
  // itself is not paused, so the card reflects the player, not just the engine.
  const isPaused = paused || track.playback === 'paused'

  // The spectrum is optional, so the layouts that reserve a slot for it must
  // check first — a fixed-width empty box would read as a broken card.
  const hasBars = bars != null && bars.length > 0

  const rootClass = [
    'wallkit-album-art',
    `wallkit-album-art--variant-${resolvedVariant}`,
    `wallkit-album-art--theme-${resolvedTheme}`,
    isPaused ? 'wallkit-album-art--paused' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const style = {
    left: `${offsetX}%`,
    bottom: `${offsetY}%`,
    '--wallkit-album-art-scale':
      clamp(Number(size) || 100, ALBUM_ART_SIZE_MIN, ALBUM_ART_SIZE_MAX) / 100,
  }
  // The cover's dominant colour tints the glass panel and the wall's edge.
  if (track.primaryColor) style['--wallkit-album-art-tint'] = track.primaryColor

  const cover = <Cover track={track} variant={resolvedVariant} labels={labels} />
  const meta = (
    <Meta
      track={track}
      compact={
        resolvedVariant === 'bar' || resolvedVariant === 'minimal' || resolvedVariant === 'wall'
      }
    />
  )
  const spectrum = (
    <MiniSpectrum
      bars={bars}
      variant={SPECTRUM_VARIANT_BY_CARD[resolvedVariant]}
      colorHex={colorHex}
      intensity={CARD_SPECTRUM_INTENSITY}
      curve={CARD_SPECTRUM_CURVE}
      paused={isPaused}
    />
  )

  let body
  switch (resolvedVariant) {
    case 'vinyl':
      // One big record. The sleeve notes sit on the centre label and the whole
      // widget turns as a single piece; no spectrum, so it stays a clean disc.
      body = (
        <div className="wallkit-album-art__vinyl">
          <div className="wallkit-album-art__vinyl-cover">
            <Cover track={track} variant="vinyl" labels={labels} />
          </div>
          <div className="wallkit-album-art__vinyl-label">
            <div className="wallkit-album-art__meta">{meta}</div>
          </div>
        </div>
      )
      break

    case 'minimal':
      // Text-first: a small square thumbnail above oversized type.
      body = (
        <div className="wallkit-album-art__body wallkit-album-art__body--minimal">
          <div className="wallkit-album-art__thumb">{cover}</div>
          <div className="wallkit-album-art__meta">{meta}</div>
          {spectrum}
        </div>
      )
      break

    case 'bar':
      // One horizontal strip: thumbnail, title, artist, then a wide spectrum.
      // The strip takes 38% of the width, so without bars the slot is dropped
      // rather than left as a hole.
      body = (
        <div className="wallkit-album-art__body wallkit-album-art__body--bar">
          <div className="wallkit-album-art__thumb">{cover}</div>
          <div className="wallkit-album-art__meta">{meta}</div>
          {hasBars && <div className="wallkit-album-art__bar-spectrum">{spectrum}</div>}
        </div>
      )
      break

    case 'wall':
      // A shelf of covers with the current one enlarged and highlighted.
      body = (
        <div className="wallkit-album-art__wall">
          <div className="wallkit-album-art__wall-card is-current">
            <div className="wallkit-album-art__wall-art">{cover}</div>
            <div className="wallkit-album-art__meta">{meta}</div>
            <div className="wallkit-album-art__wall-spectrum">{spectrum}</div>
          </div>
          <div className="wallkit-album-art__wall-card" aria-hidden="true" />
          <div className="wallkit-album-art__wall-card" aria-hidden="true" />
          <div className="wallkit-album-art__wall-card" aria-hidden="true" />
        </div>
      )
      break

    case 'classic':
    case 'glass':
    default:
      // The chrome-less card: circular cover, metadata column, spectrum behind
      // it. `classic` is that look untouched; `glass` keeps the arrangement and
      // adds the frosted panel.
      body = (
        <>
          <div className="wallkit-album-art__disc">{cover}</div>
          <div className="wallkit-album-art__body">
            <div className="wallkit-album-art__meta">{meta}</div>
            {spectrum}
          </div>
        </>
      )
  }

  return (
    // `role="group"` without a name would be a landmark with nothing to
    // announce, so the role only appears when the caller supplies a label.
    <div
      className={rootClass}
      style={style}
      role={labels.aria ? 'group' : undefined}
      aria-label={labels.aria || undefined}
    >
      {body}
    </div>
  )
}
