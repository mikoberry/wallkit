import { toLength } from './length.js'

/**
 * Anchoring for floating widgets.
 *
 * An anchor names **two points that are made to coincide**: one on the viewport
 * and the same one on the widget. `top-left` puts the widget's top-left corner
 * on the viewport's top-left corner; `center-left` puts the widget's left-middle
 * point on the viewport's left-middle point; `center` makes the two centres
 * coincide, which is what lets two widgets share an exact centre regardless of
 * how large either of them is.
 *
 * Offsets are measured from that shared point and a *number* always grows
 * inward: on a left anchor positive moves right, on a right anchor positive
 * moves left, on a centred axis positive moves right/down. That keeps one
 * meaning for both axes on every corner instead of flipping signs between left
 * and right anchors. The centred axis is therefore the one case where a
 * negative number is the useful direction.
 *
 * A corner is written as two insets. An axis that centres the widget also needs
 * a `translate` to pull the box back by half its own size, because an inset can
 * only pin an edge. Only the axes that need it are shifted, so corner anchors
 * still produce exactly the two properties they always did.
 */

export const ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

export const ANCHOR_DEFAULT = 'bottom-left'

// `[horizontal, vertical]` position of both the viewport point and the widget
// point, as a fraction of the box. 0 = start edge, 0.5 = centre, 1 = end edge.
const POINTS = {
  'top-left': [0, 0],
  'top-center': [0.5, 0],
  'top-right': [1, 0],
  'center-left': [0, 0.5],
  center: [0.5, 0.5],
  'center-right': [1, 0.5],
  'bottom-left': [0, 1],
  'bottom-center': [0.5, 1],
  'bottom-right': [1, 1],
}

/**
 * @param {string} value
 * @returns {string} One of `ANCHORS`.
 */
export function normalizeAnchor(value) {
  return POINTS[value] ? value : ANCHOR_DEFAULT
}

/**
 * Resolve one axis: which inset to write, what value, and whether the widget
 * still has to be shifted by half of itself.
 *
 * @param {number} fraction 0, 0.5 or 1.
 * @param {number|string} offset
 * @param {[string, string]} sides `[start, end]`, e.g. `['left', 'right']`.
 */
function placeAxis(fraction, offset, [start, end]) {
  const length = toLength(offset)

  if (fraction === 0) return { side: start, value: length, shift: null }
  if (fraction === 1) return { side: end, value: length, shift: null }
  // Centred: the anchor point is the middle, so the offset is a signed
  // displacement from it. `calc(50% + -30%)` is legal CSS; the `+ -` form is
  // what keeps negative numbers working without arithmetic here.
  return { side: start, value: `calc(50% + ${length})`, shift: '-50%' }
}

/**
 * Inline style pinning a box to `anchor`.
 *
 * @param {string} anchor
 * @param {number|string} [offsetX=0] Distance from the anchor point, growing
 *   inward. A number is a viewport percentage; a string is any CSS length.
 * @param {number|string} [offsetY=0] Same, vertically.
 * @returns {Object} Inset properties, plus a `transform` on the axes that
 *   centre the widget, e.g. `{ left: '50%', top: '0%', transform: 'translate(-50%, 0)' }`.
 */
export function anchorStyle(anchor, offsetX = 0, offsetY = 0) {
  const [ax, ay] = POINTS[normalizeAnchor(anchor)]
  const horizontal = placeAxis(ax, offsetX, ['left', 'right'])
  const vertical = placeAxis(ay, offsetY, ['top', 'bottom'])

  const style = {
    [horizontal.side]: horizontal.value,
    [vertical.side]: vertical.value,
  }

  if (horizontal.shift || vertical.shift) {
    style.transform = `translate(${horizontal.shift ?? '0'}, ${vertical.shift ?? '0'})`
  }

  return style
}

/**
 * Point a 3D transform should originate from.
 *
 * A widget anchored to the top has to grow downward, otherwise a scale above 1
 * pushes it off the screen: the beat pulse and the pointer tilt both scale the
 * same box. Bottom anchors keep the origin on the bottom edge, which is also
 * what makes the tilt read as a panel standing on a desk. A centred widget
 * grows from its middle, so a pulse stays symmetrical.
 *
 * @param {string} anchor
 * @returns {string} A `transform-origin` value.
 */
export function anchorOrigin(anchor) {
  const [, ay] = POINTS[normalizeAnchor(anchor)]
  if (ay === 0) return '50% 0%'
  if (ay === 1) return '50% 100%'
  return '50% 50%'
}
