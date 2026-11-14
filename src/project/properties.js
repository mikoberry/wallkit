// Builders for Wallpaper Engine user properties (`general.properties`).
//
// The engine declares a property in *manifest* units but delivers it to the page
// in different ones: a colour is "168 196 255" here and "0.66 0.77 1" there; a
// slider carries min / max / step here and arrives as a bare number. Writing the
// manifest side by hand is where "the slider does nothing" comes from, so every
// builder takes the value a human would write and emits the engine shape.
//
// Unlike the components, this module throws on bad input. A control that gets a
// malformed prop degrades quietly (deliberate — see `core/`), but a malformed
// manifest fails *silently inside the engine*, and that is the exact failure
// mode this tool exists to remove. Use `wallkit/project` at build time only: it
// never runs inside the wallpaper.

// A manifest colour, already in the engine's 0..255 space-separated form.
const TRIPLET = /^\d{1,3}(?: \d{1,3}){2}$/

const HEX = /^#?([0-9a-f]{6})$/i

/**
 * Convert a colour to the triple the manifest expects.
 *
 * Accepts `#rrggbb`, `rrggbb`, or an already-converted `"168 196 255"`. The page
 * receives 0..1 floats instead — that conversion is the engine's job, and
 * `useWallpaperProperty()` is where you undo it.
 *
 * @param {string} value
 * @returns {string} `"r g b"`, 0..255 integers
 */
export function colorTriplet(value) {
  const raw = String(value).trim().replace(/\s+/g, ' ')

  if (TRIPLET.test(raw)) {
    const parts = raw.split(' ').map(Number)
    if (parts.every((n) => n >= 0 && n <= 255)) return raw
    throw new Error(`颜色分量超出 0..255：${raw}`)
  }

  const match = HEX.exec(raw)
  if (!match) {
    throw new Error(`颜色必须是 '#rrggbb' 或 'r g b' 三元组，收到：${value}`)
  }
  const int = parseInt(match[1], 16)
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`
}

// Shared tail for every builder: `text` is the label the engine shows, `order`
// and `index` are assigned later by `defineProject()` unless pinned here.
//
// Every builder also forwards `condition`, which hides the control unless another
// property has a given value — `"showAudio.value == 1"` for a bool,
// `"mode.value == 'grid'"` for a combo. The engine evaluates it against the
// property's *value*, so the string must name a key declared in the same file;
// `defineProject()` checks that. Use it to keep a long settings panel readable
// instead of shipping twenty always-visible rows.
function finish(type, { value, ...rest }) {
  return { ...rest, type, value }
}

/**
 * Colour picker. Write the colour you want (`#a8c4ff`); the manifest gets the
 * 0..255 triplet, and the page receives 0..1 floats.
 *
 * @param {{ text?: string, value?: string, order?: number, index?: number }} [spec]
 */
export function color({ value = '#000000', ...rest } = {}) {
  return finish('color', { ...rest, value: colorTriplet(value) })
}

/**
 * On / off switch.
 *
 * @param {{ text?: string, value?: boolean, order?: number, index?: number }} [spec]
 */
export function bool({ value = false, ...rest } = {}) {
  if (typeof value !== 'boolean') {
    throw new Error(`bool 属性的 value 必须是 true / false，收到：${value}`)
  }
  return finish('bool', { ...rest, value })
}

/**
 * Range slider. `fraction: true` gives a fractional value (the engine sends a
 * float, so do not round it on the page).
 *
 * @param {{ text?: string, value?: number, min?: number, max?: number,
 *   step?: number, precision?: number, fraction?: boolean,
 *   order?: number, index?: number }} [spec]
 */
export function slider({
  value = 0,
  min = 0,
  max = 1,
  step,
  precision,
  fraction = false,
  ...rest
} = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    throw new Error(`slider 需要有限的 min < max，收到 min=${min} max=${max}`)
  }
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`slider 的 value 必须在 ${min}..${max} 之间，收到：${value}`)
  }

  const spec = finish('slider', { ...rest, value, min, max })

  if (fraction) {
    // A fractional slider without a step moves in invisible jumps, so both
    // numbers are always written.
    spec.fraction = true
    spec.step = step ?? 0.01
    spec.precision = precision ?? 2
  } else {
    if (step !== undefined) spec.step = step
    if (precision !== undefined) spec.precision = precision
  }

  return spec
}

/**
 * Drop-down list. `value` must be one of the options; when omitted the first
 * option becomes the default.
 *
 * Options may be plain strings (`'左下'`, value equals label) or
 * `{ label, value }` pairs.
 *
 * @param {{ text?: string, value?: string, options: Array<string|{label: string, value: string}>,
 *   order?: number, index?: number }} spec
 */
export function combo({ value, options, ...rest } = {}) {
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error('combo 需要至少一个 option')
  }

  const normalized = options.map((option) =>
    typeof option === 'string'
      ? { label: option, value: option }
      : { label: String(option.label ?? option.value), value: String(option.value) },
  )

  const selected = value === undefined ? normalized[0].value : String(value)
  if (!normalized.some((option) => option.value === selected)) {
    throw new Error(
      `combo 的 value "${selected}" 不在 options 里（${normalized
        .map((o) => o.value)
        .join(' / ')}）`,
    )
  }

  return { ...finish('combo', { ...rest, value: selected }), options: normalized }
}

/**
 * Single-line text input.
 *
 * @param {{ text?: string, value?: string, order?: number, index?: number }} [spec]
 */
export function text({ value = '', ...rest } = {}) {
  return finish('textinput', { ...rest, value: String(value) })
}

/**
 * Display-only HTML block in the settings panel — a heading, a divider, a link,
 * an image. The engine renders the string as HTML and never sends a value for
 * it back to the page, so it is UI, not configuration.
 *
 * This is the only way to put a homepage or a logo inside `project.json`: there
 * is no `homepage` field, and `preview` is a file name the editor fills in.
 * Published wallpapers use it heavily — section headers (`<h3>音频 Audio</h3>`),
 * `<hr>` separators, and `<a href>` credit blocks are all `type: "text"`.
 *
 * `value` stays `false` because that is what the editor writes; it is never
 * meaningful. Keep the body small: it is a settings panel, not a page.
 *
 * @param {{ text?: string, value?: boolean, alerttype?: string,
 *   condition?: string, order?: number, index?: number }} [spec]
 */
export function html({ value = false, ...rest } = {}) {
  if (typeof value !== 'boolean') {
    throw new Error(`html 属性的 value 由引擎固定为 false，不要传：${value}`)
  }
  return finish('text', { ...rest, value })
}

/**
 * File picker. The page receives a path and must prepend `file:///`.
 *
 * @param {{ text?: string, value?: string, order?: number, index?: number }} [spec]
 */
export function file({ value = '', ...rest } = {}) {
  return finish('file', { ...rest, value: String(value) })
}

/**
 * Directory picker.
 *
 * `ondemand` hands the page one random file per call
 * (`wallpaperRequestRandomFileForProperty`); `fetchall` delivers the whole list
 * and change notifications.
 *
 * @param {{ text?: string, value?: string, mode?: 'ondemand'|'fetchall',
 *   order?: number, index?: number }} [spec]
 */
export function directory({ value = '', mode = 'ondemand', ...rest } = {}) {
  if (mode !== 'ondemand' && mode !== 'fetchall') {
    throw new Error(`directory 的 mode 只能是 'ondemand' / 'fetchall'，收到：${mode}`)
  }
  return { ...finish('directory', { ...rest, value: String(value) }), mode }
}

/**
 * Visual group header. A pure UI container: the engine never pushes a value for
 * it, so never read this key from `useWallpaperProperties()`.
 *
 * @param {{ text?: string, order?: number, index?: number }} [spec]
 */
export function group({ ...rest } = {}) {
  return finish('group', { ...rest, value: '' })
}
