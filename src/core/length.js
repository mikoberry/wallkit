/**
 * Normalise a caller-supplied length into a CSS value.
 *
 * Every sizing and offset prop accepts two shapes:
 *
 *   - a number, which means the component's natural unit (a viewport percentage
 *     for offsets, pixels for box dimensions), or
 *   - any CSS length string (`'100px'`, `'22vh'`, `'calc(50vw - 2rem)'`), which
 *     is passed through untouched.
 *
 * Doing the conversion in one place keeps the components from each inventing
 * their own "is it a number or a string" branch, and keeps a rejected value
 * falling back to zero instead of emitting `NaN` into a stylesheet. The zero is
 * written with a unit because `calc()` refuses to add a bare number to a
 * percentage.
 *
 * @param {number|string} value
 * @param {{ number?: string }} [options] Suffix a bare number gets. `'%'` for
 *   offsets, `'px'` for widths and heights.
 * @returns {string} A CSS length; never empty.
 */
export function toLength(value, { number = '%' } = {}) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return Number.isFinite(value) ? `${value}${number}` : `0${number}`
}
