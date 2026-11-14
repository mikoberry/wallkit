import { ANCHOR_DEFAULT, anchorStyle } from '../../core/anchor.js'
import { isHexColor } from '../../core/audio.js'
import MiniSpectrum from '../mini-spectrum/MiniSpectrum.jsx'
import './AlbumArt.css'

// Every layout draws from the same data; they differ only in how they arrange
// the cover, the metadata and the inline spectrum.
//
// Exported so a caller can build a layout picker without hardcoding the list.
export const ALBUM_ART_VARIANTS = [
  'classic',
  'glass',
  'vinyl',
  'minimal',
  'type',
  'bar',
  'cassette',
  'polaroid',
  'cd',
  'poster',
  'ticket',
]

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
//   classic   tall column behind the text       bars
//   glass     same tall column, softer panel    curve
//   minimal   tall column under the type        bars
//   type      small LED dot grid under notes    dots
//   bar       wide, short strip                 curve
//   cassette  thin strip under the shell        bars
//   polaroid  faint dotted line in the margin   dots
//   cd        same tall column as classic       curve
//   poster    low equalizer over the backdrop   bars
//   ticket    barcode-like block on the stub    bars
//
// `vinyl` is deliberately absent: that layout is a clean record with no graph.
const SPECTRUM_VARIANT_BY_CARD = {
  classic: 'bars',
  glass: 'curve',
  minimal: 'bars',
  type: 'dots',
  bar: 'curve',
  cassette: 'bars',
  polaroid: 'dots',
  cd: 'curve',
  poster: 'bars',
  ticket: 'bars',
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

// Same dim / faint tier derivation as the clock: the two fg variables are real
// colours, so they carry their own alpha rather than leaning on `opacity`.
function hexToRgba(hex, alpha) {
  const value = parseInt(hex.slice(1), 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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
// (bar, cassette, polaroid, poster, ticket, minimal) keep a single readable
// line per field. `type` stays out of this list on purpose: its height is
// content-driven, so the third italic line is part of the composition.
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
 * @param {'classic'|'glass'|'vinyl'|'minimal'|'type'|'bar'|'cassette'|'polaroid'|'cd'|'poster'|'ticket'} [props.variant='classic']
 *   Invalid values fall back to `classic`. `ALBUM_ART_VARIANTS` has the list.
 *   `type` renders no cover at all — pure typography with a tinted rule.
 *   The paper layouts (`cassette` label, `polaroid` note, `ticket` stub) print
 *   their text in fixed dark ink regardless of `theme` / `color` — it is ink on
 *   paper, not text on a wallpaper. `poster` is the mirror case: its backdrop
 *   is always darkened, so its text is always light.
 * @param {'light'|'dark'} [props.theme='light']  Text colour, same convention as
 *   `Clock`: `light` renders light text (dark wallpaper), `dark` renders dark
 *   text and flips the surfaces the card paints itself (glass panel, bar pill,
 *   record label, sleeves) so the ink stays readable on bright artwork.
 * @param {string} [props.color]   `#rrggbb` override for the card's text colour,
 *   taking precedence over `theme`. The dim / faint tiers derive their alpha
 *   from it. The card's own tint (glass wash, cassette tape) still comes from
 *   `track.primaryColor`; use `colorHex` to recolour the inline spectrum.
 * @param {string} [props.colorHex]   `#rrggbb` for the **inline spectrum only**;
 *   the card's own tint comes from `track.primaryColor`. Defaults to
 *   `--wallkit-accent`.
 * @param {number|string} [props.size=100]   Size. A number is a percentage of the
 *   normal card (cover diameter 18vh), range 20..300. A string is an **absolute
 *   cover diameter** in any CSS length (`'34vh'`, `'320px'`) — the whole card
 *   derives from that one length, so this is the way to pin the record to an
 *   exact size and make two widgets line up.
 * @param {'top-left'|'top-center'|'top-right'|'center-left'|'center'|'center-right'|'bottom-left'|'bottom-center'|'bottom-right'} [props.anchor='bottom-left']
 *   Viewport point the card pins to. `center` makes two centre-anchored widgets
 *   share an exact centre. Invalid values fall back to the default.
 * @param {number|string} [props.offsetX=0]  Distance from the anchored side. A
 *   number is a viewport percentage growing inward; a string is any CSS length
 *   (`'100px'`). 0 sits flush against the corner.
 * @param {number|string} [props.offsetY=0]  Same, vertically.
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
  color,
  colorHex,
  size = 100,
  anchor = ANCHOR_DEFAULT,
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

  // `size` is either a scale percentage or, when it is a string, the cover
  // diameter itself. The CSS derives every other dimension from
  // `--wallkit-album-art-unit`, so overriding that single variable is enough —
  // the scale multiplier is dropped in that case rather than compounding with
  // it, which would make `size="34vh"` mean something nobody asked for.
  const style = anchorStyle(anchor, offsetX, offsetY)
  if (typeof size === 'string' && size.trim()) {
    style['--wallkit-album-art-unit'] = size.trim()
  } else {
    style['--wallkit-album-art-scale'] =
      clamp(Number(size) || 100, ALBUM_ART_SIZE_MIN, ALBUM_ART_SIZE_MAX) / 100
  }
  // The cover's dominant colour tints the glass panel and the cassette tape.
  if (track.primaryColor) style['--wallkit-album-art-tint'] = track.primaryColor

  // An explicit `color` wins over the theme. The text-colour variables live on
  // this same root node, so overriding them here covers every layout (and beats
  // the `--theme-dark` re-declaration by inline specificity).
  if (isHexColor(color)) {
    const c = color.trim().toLowerCase()
    style.color = c
    style['--wallkit-album-art-fg'] = c
    style['--wallkit-album-art-fg-dim'] = hexToRgba(c, 0.82)
    style['--wallkit-album-art-fg-faint'] = hexToRgba(c, 0.62)
  }

  const cover = <Cover track={track} variant={resolvedVariant} labels={labels} />
  const meta = (
    <Meta
      track={track}
      compact={
        resolvedVariant === 'bar' ||
        resolvedVariant === 'minimal' ||
        resolvedVariant === 'cassette' ||
        resolvedVariant === 'polaroid' ||
        resolvedVariant === 'poster' ||
        resolvedVariant === 'ticket'
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

    case 'type':
      // Pure typography: no cover is rendered at all. The only graphics are a
      // vertical rule tinted by the artwork's dominant colour and a small LED
      // dot grid under the notes — for wallpapers where even a thumbnail is
      // one image too many.
      body = (
        <div className="wallkit-album-art__body wallkit-album-art__body--type">
          <div className="wallkit-album-art__meta">{meta}</div>
          {hasBars && <div className="wallkit-album-art__type-spectrum">{spectrum}</div>}
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

    case 'cassette':
      // A cassette shell: cream label with a mini cover on top, a window
      // showing the tinted tape and two slowly turning reels below. The
      // spectrum lives inside the window, behind the reels — it reads as the
      // level meter printed on the tape shell.
      body = (
        <div className="wallkit-album-art__body wallkit-album-art__body--cassette">
          <div className="wallkit-album-art__cassette-shell">
            <div className="wallkit-album-art__cassette-label">
              <div className="wallkit-album-art__cassette-mini">
                <Cover track={track} variant="cassette" labels={labels} />
              </div>
              <div className="wallkit-album-art__meta">{meta}</div>
            </div>
            <div className="wallkit-album-art__cassette-window">
              {hasBars && spectrum}
              <span className="wallkit-album-art__reel wallkit-album-art__reel--left" />
              <span className="wallkit-album-art__reel wallkit-album-art__reel--right" />
            </div>
          </div>
        </div>
      )
      break

    case 'polaroid':
      // An instant photo: white frame, square print, handwritten note in the
      // bottom margin, tilted a few degrees like it was dropped on the desk.
      body = (
        <div className="wallkit-album-art__body wallkit-album-art__body--polaroid">
          <div className="wallkit-album-art__polaroid-frame">
            <div className="wallkit-album-art__polaroid-photo">{cover}</div>
            <div className="wallkit-album-art__polaroid-note">{meta}</div>
            {hasBars && <div className="wallkit-album-art__polaroid-strip">{spectrum}</div>}
          </div>
        </div>
      )
      break

    case 'poster':
      // A vertical gig poster: the artwork fills the sheet behind a darkened
      // gradient, serif headline and a low equalizer sit at the foot.
      body = (
        <div className="wallkit-album-art__poster">
          <div className="wallkit-album-art__poster-bg">{cover}</div>
          <div className="wallkit-album-art__poster-body">
            <div className="wallkit-album-art__meta">{meta}</div>
            {spectrum}
          </div>
        </div>
      )
      break

    case 'ticket':
      // An admission ticket: cover stub on the left, perforation line, then
      // the notes and a barcode-like spectrum block.
      body = (
        <div className="wallkit-album-art__body wallkit-album-art__body--ticket">
          <div className="wallkit-album-art__thumb">{cover}</div>
          <div className="wallkit-album-art__ticket-divider" />
          <div className="wallkit-album-art__meta">{meta}</div>
          {hasBars && <div className="wallkit-album-art__ticket-spectrum">{spectrum}</div>}
        </div>
      )
      break

    case 'classic':
    case 'glass':
    case 'cd':
    default:
      // The chrome-less card: circular cover, metadata column, spectrum behind
      // it. `classic` is that look untouched; `glass` adds the frosted panel;
      // `cd` keeps the arrangement and paints the disc as a silver CD-R with
      // the artwork printed on its face.
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
