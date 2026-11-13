/**
 * Corner anchoring for floating widgets.
 *
 * Every widget pins itself to one of the four viewport corners. Offsets are
 * viewport percentages that always grow *inward*, so `offsetX: 0, offsetY: 0`
 * puts the widget flush against the corner and any positive value pulls it
 * toward the middle of the screen. That keeps one meaning for both axes on
 * every corner, instead of flipping signs between left and right anchors.
 *
 * Only two CSS edges are ever written. Setting all four would over-constrain
 * the box and the browser would stretch it between them.
 */

export const ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

export const ANCHOR_DEFAULT = 'bottom-left'

const INSETS = {
  'top-left': ['left', 'top'],
  'top-right': ['right', 'top'],
  'bottom-left': ['left', 'bottom'],
  'bottom-right': ['right', 'bottom'],
}

/**
 * @param {string} value
 * @returns {'top-left'|'top-right'|'bottom-left'|'bottom-right'}
 */
export function normalizeAnchor(value) {
  return INSETS[value] ? value : ANCHOR_DEFAULT
}

/**
 * Inline style pinning a box to `anchor`.
 *
 * @param {string} anchor
 * @param {number} [offsetX=0]  Distance from the anchored side, viewport percentage.
 * @param {number} [offsetY=0]  Distance from the anchored side, viewport percentage.
 * @returns {Object} Two inset properties, e.g. `{ right: '4%', top: '0%' }`.
 */
export function anchorStyle(anchor, offsetX = 0, offsetY = 0) {
  const [horizontal, vertical] = INSETS[normalizeAnchor(anchor)]
  return {
    [horizontal]: `${Number(offsetX) || 0}%`,
    [vertical]: `${Number(offsetY) || 0}%`,
  }
}

/**
 * Vertical edge a 3D transform should originate from.
 *
 * A widget anchored to the top has to grow downward, otherwise a scale above 1
 * pushes it off the screen: the beat pulse and the pointer tilt both scale the
 * same box. Bottom anchors keep the origin on the bottom edge, which is also
 * what makes the tilt read as a panel standing on a desk.
 *
 * @param {string} anchor
 * @returns {string} A `transform-origin` value.
 */
export function anchorOrigin(anchor) {
  return normalizeAnchor(anchor).startsWith('top') ? '50% 0%' : '50% 100%'
}
