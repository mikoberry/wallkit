// Accent colour derived from the current cover.
//
// Experiment only: this lives in the playground, not in the library. The library
// keeps a fixed `--wallkit-accent` token; whether a wallpaper should let the
// album art repaint its whole palette is an application-level decision, and this
// file exists so that decision can be judged against a real WE session before
// anything is frozen into an API.
//
// Two things it deliberately does *not* do:
//
//   - Trust the host's format. `primaryColor` arrives as whatever the engine
//     derived from the cover; `#rrggbb` is only one of the shapes seen. Anything
//     unparseable returns null so the caller falls back to the theme default.
//   - Pass a raw colour through. A near-black or desaturated cover yields an
//     accent that disappears into the backdrop, so lightness is clamped into a
//     legible band per theme and saturation gets a floor.

/** The token the controls fall back to when nothing overrides it. */
export const DEFAULT_ACCENT = '#a8c4ff'

/**
 * Every knob in one place, so the experiment can be tuned without touching the
 * maths. Pass a partial object as the third argument of `accentFromTrack` —
 * `lightness` is replaced whole, not merged key by key.
 *
 * @type {{
 *   enabled: boolean,
 *   minSourceSaturation: number,
 *   saturationFloor: number,
 *   saturationCeiling: number,
 *   lightness: { light: [number, number], dark: [number, number] },
 * }}
 */
export const ACCENT_DEFAULTS = {
  enabled: true,
  // Covers below this saturation read as grey; following them buys nothing.
  minSourceSaturation: 0.12,
  // A muted cover should still produce a colour with some presence.
  saturationFloor: 0.42,
  saturationCeiling: 0.92,
  // `theme` names the text colour, so it is the inverse of the backdrop:
  // `light` = light text over a dark wallpaper, which needs a brighter accent.
  lightness: { light: [0.56, 0.74], dark: [0.36, 0.56] },
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function hex2(value) {
  return value.toString(16).padStart(2, '0')
}

/**
 * Parse the handful of colour shapes a host might hand us.
 *
 * Accepts `#rgb`, `#rrggbb`, `rgb(r, g, b)`, and bare `r g b` — the last one
 * either 0..255 integers or 0..1 floats (the `schemecolor` convention). Anything
 * else returns null rather than guessing.
 *
 * @param {unknown} raw
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function parseColor(raw) {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null

  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return {
      r: parseInt(text[1] + text[1], 16),
      g: parseInt(text[2] + text[2], 16),
      b: parseInt(text[3] + text[3], 16),
    }
  }

  if (/^#[0-9a-f]{6}$/i.test(text)) {
    return {
      r: parseInt(text.slice(1, 3), 16),
      g: parseInt(text.slice(3, 5), 16),
      b: parseInt(text.slice(5, 7), 16),
    }
  }

  const functional = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (functional) {
    const [r, g, b] = functional.slice(1, 4).map(Number)
    if (![r, g, b].every(Number.isFinite)) return null
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) }
  }

  const bare = text.split(/[\s,]+/).map(Number)
  if (bare.length >= 3 && bare.slice(0, 3).every(Number.isFinite)) {
    const [r, g, b] = bare
    // All three at or below 1 means the engine used normalized floats. `1 1 1`
    // is white under either reading, so the ambiguity costs nothing.
    const scale = r <= 1 && g <= 1 && b <= 1 ? 255 : 1
    return {
      r: clamp(r * scale, 0, 255),
      g: clamp(g * scale, 0, 255),
      b: clamp(b * scale, 0, 255),
    }
  }

  return null
}

/**
 * Normalize any accepted colour shape to `#rrggbb`.
 *
 * `AlbumArt` writes `primaryColor` straight into a CSS variable, so a host value
 * in `r g b` form would be dropped by the browser. Running it through this first
 * keeps the card's tint working whatever the engine sends.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function toHexColor(raw) {
  const rgb = parseColor(raw)
  if (!rgb) return null
  return `#${hex2(Math.round(rgb.r))}${hex2(Math.round(rgb.g))}${hex2(Math.round(rgb.b))}`
}

/** @param {{ r: number, g: number, b: number }} rgb */
function rgbToHsl({ r, g, b }) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const delta = max - min

  if (delta === 0) return { h: 0, s: 0, l }

  const s = delta / (1 - Math.abs(2 * l - 1))
  let h
  if (max === rn) h = ((gn - bn) / delta) % 6
  else if (max === gn) h = (bn - rn) / delta + 2
  else h = (rn - gn) / delta + 4

  return { h: (h * 60 + 360) % 360, s, l }
}

/** @param {{ h: number, s: number, l: number }} hsl */
function hslToHex({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  const sector = Math.floor(h / 60) % 6
  const table = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector]

  const [r, g, b] = table.map((channel) => Math.round((channel + m) * 255))
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`
}

/**
 * Turn a track's cover colour into an accent that is safe to paint with.
 *
 * The lightness band flips with the theme, because the theme is the background:
 * `theme="light"` means light text over a dark backdrop, so the accent has to sit
 * high enough to read; `theme="dark"` is the opposite. Saturation gets a floor so
 * a muted cover does not wash the controls out.
 *
 * `options.enabled === false` is the switch: it returns null, which every caller
 * treats as "keep the theme default".
 *
 * @param {{ primaryColor?: string } | null} track
 * @param {'light' | 'dark'} theme
 * @param {Partial<typeof ACCENT_DEFAULTS>} [options]
 * @returns {string | null} `#rrggbb`, or null when the caller should keep the default
 */
export function accentFromTrack(track, theme, options) {
  const config = { ...ACCENT_DEFAULTS, ...options }
  if (!config.enabled) return null

  const rgb = parseColor(track && track.primaryColor)
  if (!rgb) return null

  const { h, s, l } = rgbToHsl(rgb)
  // Grey covers have no hue worth spreading across the wallpaper.
  if (s < config.minSourceSaturation) return null

  const band = theme === 'dark' ? config.lightness.dark : config.lightness.light

  return hslToHex({
    h,
    s: clamp(s, config.saturationFloor, config.saturationCeiling),
    l: clamp(l, band[0], band[1]),
  })
}
