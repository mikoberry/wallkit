import {
  FRAME_GRID_DEFAULT,
  FRAME_INSET_DEFAULT,
  FRAME_INSET_MAX,
  FRAME_INSET_MIN,
  FRAME_LENGTH_DEFAULT,
  FRAME_LENGTH_MAX,
  FRAME_LENGTH_MIN,
  FRAME_SIZE_DEFAULT,
  FRAME_SIZE_MAX,
  FRAME_SIZE_MIN,
  FRAME_THICKNESS_DEFAULT,
  FRAME_THICKNESS_MAX,
  FRAME_THICKNESS_MIN,
  FRAME_VARIANT_DEFAULT,
  normalizeFrameGrid,
  normalizeFrameNumber,
  normalizeFrameVariant,
} from '../../core/frame.js'
import { isHexColor } from '../../core/audio.js'
import './Frame.css'

// Corner readouts in DOM order. Keeping the keys here means the JSX stays a
// map instead of four near-identical blocks.
const LABEL_SLOTS = ['tl', 'tr', 'bl', 'br']

/**
 * Frame — REC-style viewfinder chrome around the whole picture.
 *
 * It draws four corner brackets (or a full hairline, a bracket rail, or film
 * perforations) plus optional lens-like furniture: a thirds grid, a tick ruler,
 * a blinking record dot and monospaced corner readouts. Everything except the
 * record dot is static, all of it is CSS, and there is no canvas or animation
 * loop — so this layer costs nothing while the picture is idle.
 *
 * **It is not a layout container.** It fills its positioning context
 * (`position: absolute; inset: 0; pointer-events: none`) exactly like
 * `PointerFx` and `Spotlight`, takes no children, and never reflows anything.
 * The frame decorates the *picture*, which is why it takes no `anchor`: a
 * viewfinder is pinned to the edges of the shot, not to a widget. If you want
 * brackets around one card, that belongs in the wallpaper's own stylesheet.
 *
 * `timecode` is a finished string on purpose — see `core/frame.js` and §5.4:
 * the component holds no timers, so the caller owns the clock and the readout
 * stops when the host pauses. `formatTimecode()` turns seconds into
 * `HH:MM:SS:FF` if that is all you need.
 *
 * @param {Object} props
 * @param {boolean} [props.visible=true]   Render nothing when false.
 * @param {string} [props.variant='corners'] `corners` | `frame` | `bracket` | `film`.
 * @param {number} [props.inset=28]        Edge gutter in px (0..240).
 * @param {number} [props.thickness=1.5]   Line weight in px (0.5..8).
 * @param {number} [props.length=56]       Bracket arm length in px (0..240).
 *   Ignored by `frame` and `film`.
 * @param {number} [props.size=1]          Uniform multiplier for every length
 *   and for the type size (0.5..3).
 * @param {string} [props.color]           `#rrggbb` override. Omitted, the line
 *   follows `theme`.
 * @param {string|boolean} [props.grid='none'] `'none' | 'thirds' | 'cross'`;
 *   `true` is shorthand for `thirds`.
 * @param {boolean} [props.ticks=false]    Tick ruler under the bottom edge.
 * @param {boolean|string} [props.rec=false] Record dot. A string also draws
 *   that text next to it — no copy is built in, so `rec="REC"` is the caller's
 *   decision.
 * @param {string} [props.timecode='']     Already-formatted timecode; nothing
 *   is shown when empty.
 * @param {{ tl?: string, tr?: string, bl?: string, br?: string }} [props.labels]
 *   Corner readouts, uppercased by CSS.
 * @param {'light'|'dark'} [props.theme='dark'] Same contract as `Clock`:
 *   `light` is a light line (for a dark wallpaper), `dark` a dark line.
 * @param {boolean} [props.paused=false]   Freeze the record dot.
 */
export default function Frame({
  visible = true,
  variant = FRAME_VARIANT_DEFAULT,
  inset = FRAME_INSET_DEFAULT,
  thickness = FRAME_THICKNESS_DEFAULT,
  length = FRAME_LENGTH_DEFAULT,
  size = FRAME_SIZE_DEFAULT,
  color,
  grid = FRAME_GRID_DEFAULT,
  ticks = false,
  rec = false,
  timecode = '',
  labels,
  theme = 'dark',
  paused = false,
}) {
  if (!visible) return null

  const scale = normalizeFrameNumber(size, FRAME_SIZE_DEFAULT, FRAME_SIZE_MIN, FRAME_SIZE_MAX)
  const resolvedInset = normalizeFrameNumber(inset, FRAME_INSET_DEFAULT, FRAME_INSET_MIN, FRAME_INSET_MAX) * scale
  const resolvedThickness =
    normalizeFrameNumber(thickness, FRAME_THICKNESS_DEFAULT, FRAME_THICKNESS_MIN, FRAME_THICKNESS_MAX) * scale
  const resolvedLength =
    normalizeFrameNumber(length, FRAME_LENGTH_DEFAULT, FRAME_LENGTH_MIN, FRAME_LENGTH_MAX) * scale

  // Only the values CSS cannot derive on its own are written here; everything
  // else is `calc()` against `--wallkit-frame-unit`, so a stylesheet override
  // stays possible without going through the component.
  const style = {
    '--wallkit-frame-unit': String(scale),
    '--wallkit-frame-inset': `${resolvedInset}px`,
    '--wallkit-frame-thickness': `${resolvedThickness}px`,
    '--wallkit-frame-length': `${resolvedLength}px`,
    '--wallkit-frame-font': `${11 * scale}px`,
  }
  // The theme supplies the default line colour; an explicit `#rrggbb` wins.
  if (isHexColor(color)) style['--wallkit-frame-color'] = color

  const showTimecode = typeof timecode === 'string' && timecode.length > 0
  const recText = typeof rec === 'string' ? rec : ''

  return (
    <div
      className="wallkit-frame"
      data-variant={normalizeFrameVariant(variant)}
      data-grid={normalizeFrameGrid(grid)}
      data-theme={theme === 'light' ? 'light' : 'dark'}
      data-rec={rec ? 'true' : 'false'}
      data-tc={showTimecode ? 'true' : 'false'}
      data-paused={paused ? 'true' : 'false'}
      style={style}
      aria-hidden="true"
    >
      {/* One child per drawing primitive; the variant lives in `data-variant`
          and the stylesheet shows only the pieces that variant uses, so the
          DOM never changes shape between variants. */}
      <div className="wallkit-frame__edge" />
      <div className="wallkit-frame__rail wallkit-frame__rail--top" />
      <div className="wallkit-frame__rail wallkit-frame__rail--bottom" />
      <div className="wallkit-frame__perf" />
      <span className="wallkit-frame__corner wallkit-frame__corner--tl" />
      <span className="wallkit-frame__corner wallkit-frame__corner--tr" />
      <span className="wallkit-frame__corner wallkit-frame__corner--bl" />
      <span className="wallkit-frame__corner wallkit-frame__corner--br" />
      <div className="wallkit-frame__grid" />
      {ticks ? <div className="wallkit-frame__ticks" /> : null}

      {rec ? (
        <div className="wallkit-frame__rec">
          <i className="wallkit-frame__dot" />
          {recText ? <span>{recText}</span> : null}
        </div>
      ) : null}

      {showTimecode ? <div className="wallkit-frame__tc">{timecode}</div> : null}

      {labels
        ? LABEL_SLOTS.map((slot) =>
            typeof labels[slot] === 'string' && labels[slot] ? (
              <span key={slot} className={`wallkit-frame__label wallkit-frame__label--${slot}`}>
                {labels[slot]}
              </span>
            ) : null,
          )
        : null}
    </div>
  )
}
