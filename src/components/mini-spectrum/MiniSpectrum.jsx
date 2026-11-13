import { SPECTRUM_CURVE_DEFAULT, SPECTRUM_INTENSITY_DEFAULT } from '../../core/index.js'
import SpectrumCanvas from '../shared/SpectrumCanvas.jsx'
import { SPECTRUM_STYLES } from '../shared/renderers.js'
import './MiniSpectrum.css'

// Default column count. A dense 128-bar spectrum is unreadable at card size —
// each bar lands a couple of pixels wide with visible gaps — so the mini widget
// folds to chunky columns by default. The fold averages neighbouring bands, so
// the total energy is preserved; bass stays at the low indices.
export const MINI_SPECTRUM_BARS = 32

/**
 * A spectrum that fills its parent box.
 *
 * Same data contract as `Spectrum` (the caller passes normalised `bars`), but
 * no positioning or sizing props: the parent decides both, which is what makes
 * it usable inside a card. Use `Spectrum` for a free-floating overlay.
 *
 * The parent must have a definite size — the widget is `width/height: 100%`, so
 * an auto-height parent collapses it to nothing.
 *
 * @param {Object} props
 * @param {Float32Array|number[]|null} props.bars  Bar magnitudes, 0..1. `null`
 *   (or empty) renders nothing.
 * @param {boolean} [props.visible=true]        Render nothing when false.
 * @param {'bars'|'mirror'|'curve'|'pill'|'ring'|'ringwave'|'dots'|'ripples'|'aurora'} [props.variant='bars']
 * @param {string} [props.colorHex]             `#rrggbb`. Defaults to `--wallkit-accent`.
 * @param {number} [props.barCount=32]          Fold to this many columns.
 *   Pass `bars.length` to draw one column per incoming bar.
 * @param {number} [props.intensity=100]        Response strength, percent (0..1000).
 * @param {number} [props.curve=1]              Response curve exponent (0.2..2).
 * @param {boolean} [props.paused=false]        Freeze the draw loop while true.
 */
export default function MiniSpectrum({
  bars,
  visible = true,
  variant = 'bars',
  colorHex,
  barCount = MINI_SPECTRUM_BARS,
  intensity = SPECTRUM_INTENSITY_DEFAULT,
  curve = SPECTRUM_CURVE_DEFAULT,
  paused = false,
}) {
  const hasBars = bars != null && bars.length > 0
  const resolvedVariant = SPECTRUM_STYLES.includes(variant) ? variant : 'bars'

  // Never fold to more columns than there are source bars: upsampling would
  // repeat the nearest bucket and turn a 16-bar input into visible banding.
  const sourceCount = hasBars ? bars.length : 0
  const foldTarget = Math.floor(Number(barCount) || MINI_SPECTRUM_BARS)
  const columns = Math.max(1, Math.min(foldTarget, sourceCount))

  if (!visible || !hasBars) return null

  return (
    <div className={`wallkit-mini-spectrum wallkit-mini-spectrum--variant-${resolvedVariant}`}>
      <SpectrumCanvas
        className="wallkit-mini-spectrum__canvas"
        bars={bars}
        variant={resolvedVariant}
        colorHex={colorHex}
        intensity={intensity}
        curve={curve}
        barCount={columns}
        paused={paused}
      />
    </div>
  )
}
