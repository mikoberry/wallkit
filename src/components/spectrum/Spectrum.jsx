import { SPECTRUM_CURVE_DEFAULT, SPECTRUM_INTENSITY_DEFAULT } from '../../core/index.js'
import SpectrumCanvas from '../shared/SpectrumCanvas.jsx'
import { SPECTRUM_STYLES } from '../shared/renderers.js'
import './Spectrum.css'

// Size percentage bounds. 100 is the reference ("normal") widget size defined by
// the CSS base box; 500 lets a caller blow it up to a full-background visual, and
// below 20 it stops being legible.
export const SPECTRUM_SIZE_MIN = 20
export const SPECTRUM_SIZE_MAX = 500

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Wallpaper Engine style audio spectrum overlay.
 *
 * Pure view: the component reads no audio itself and holds no data timer. The
 * caller produces the normalised `bars` (see `extractSpectrumBars`) and drives
 * pause handling; the component only paints a canvas.
 *
 * `visible` and `paused` are different: `visible={false}` renders nothing at all
 * (no DOM, no loop), while `paused` keeps the widget on screen but freezes it.
 * Both stop the draw loop, so a paused/hidden wallpaper costs nothing.
 *
 * This is the floating variant: it anchors to the bottom-left corner and sizes
 * itself from the viewport. For a spectrum that fills its parent, use
 * `MiniSpectrum`.
 *
 * @param {Object} props
 * @param {Float32Array|number[]|null} props.bars  Bar magnitudes, each 0..1.
 *   Required: when `null` (or empty) nothing is rendered — there is no
 *   synthetic fallback.
 * @param {boolean} [props.visible=true]        Render nothing when false.
 * @param {'bars'|'mirror'|'curve'|'pill'|'ring'|'ringwave'|'dots'|'ripples'|'aurora'} [props.variant='bars']
 *   Visual style. Invalid values fall back to `bars`.
 * @param {string} [props.colorHex]             `#rrggbb`. Defaults to `--wallkit-accent`.
 * @param {number} [props.size=100]             Size percentage. 100 is the normal
 *   widget size; range 20..500.
 * @param {number} [props.offsetX=0]            Horizontal offset, viewport percentage.
 * @param {number} [props.offsetY=0]            Vertical offset, viewport percentage.
 * @param {number} [props.intensity=100]        Response strength, percent (0..1000).
 *   100 leaves the bars unchanged, higher boosts quiet bands, 0 flattens them.
 * @param {number} [props.curve=1]              Response curve exponent (0.2..2).
 *   Below 1 lifts quiet bands into a steady swell; above 1 sharpens the motion
 *   into distinct peaks. 1 is linear.
 * @param {boolean} [props.paused=false]        Freeze the draw loop while paused.
 */
export default function Spectrum({
  bars,
  visible = true,
  variant = 'bars',
  colorHex,
  size = 100,
  offsetX = 0,
  offsetY = 0,
  intensity = SPECTRUM_INTENSITY_DEFAULT,
  curve = SPECTRUM_CURVE_DEFAULT,
  paused = false,
}) {
  const hasBars = bars != null && bars.length > 0
  const resolvedVariant = SPECTRUM_STYLES.includes(variant) ? variant : 'bars'

  if (!visible || !hasBars) return null

  const clampedSize = clamp(Number(size) || 100, SPECTRUM_SIZE_MIN, SPECTRUM_SIZE_MAX)

  return (
    <div
      className="wallkit-spectrum__anchor"
      style={{ left: `${offsetX}%`, bottom: `${offsetY}%` }}
    >
      <div
        className={`wallkit-spectrum wallkit-spectrum--variant-${resolvedVariant}`}
        style={{ '--wallkit-spectrum-scale': clampedSize / 100 }}
      >
        <SpectrumCanvas
          className="wallkit-spectrum__canvas"
          bars={bars}
          variant={resolvedVariant}
          colorHex={colorHex}
          intensity={intensity}
          curve={curve}
          paused={paused}
        />
      </div>
    </div>
  )
}
