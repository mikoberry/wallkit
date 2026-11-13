// Wallpaper Engine test page.
//
// This is not a demo gallery — it is a single wallpaper-sized composition that
// mounts every control at once, wired to the engine's real audio and media
// callbacks. Build it with `npm run build:wallpaper` and point Wallpaper Engine
// at `playground/dist-wallpaper`.
//
// The <head> bridges are injected by wallkitWE() from the Vite configs; the
// React-side data comes from `wallkit/we`. Only the app-owned clock and the HUD
// diagnostics live in ./wallpaper-data.js.
//
// Two reasons it auto-cycles instead of showing a control panel:
//
//   - Wallpaper Engine has no mouse or keyboard focus, so nothing on screen can
//     be clicked. Every variant has to be reachable on a timer.
//   - Judging contrast means seeing the same card on several backdrops, not
//     after editing a constant and rebuilding.

import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Clock } from '../src/components/clock/index.js'
import { Spectrum, SPECTRUM_STYLES } from '../src/components/spectrum/index.js'
import { MiniSpectrum } from '../src/components/mini-spectrum/index.js'
import { AlbumArt, ALBUM_ART_VARIANTS } from '../src/components/album-art/index.js'
import {
  useWallpaperAudio,
  useWallpaperBeat,
  useWallpaperMedia,
  useWallpaperPaused,
} from 'wallkit/we'
import { useNow, useWallpaperAudioStatus, STALE_MS } from './wallpaper-data.js'
import { accentFromTrack, toHexColor, DEFAULT_ACCENT } from './accent.js'
import '../src/styles/index.css'
import './wallpaper.css'

// ---------------------------------------------------------------------------
// Knobs
// ---------------------------------------------------------------------------

// How long each combination stays up. 8s is long enough to watch a slow
// spectrum fill the card and short enough to walk all six album layouts in
// under a minute. `0` freezes the cycle on the first step.
const CYCLE_MS = 8000

// The debug overlay. Press H to hide it; it also dims itself after a few
// seconds so the contrast judgement is not made through a white rectangle.
const SHOW_HUD = true

// Synthetic cover colours, reachable only by pressing A.
//
// They exist because no host ever pushes `primaryColor` in a browser, so the
// accent experiment would be invisible outside the engine. They are **never**
// applied automatically — `previewCover` starts at null, and the engine has no
// keyboard, so a real wallpaper can't reach this path by accident.
//
// The three formats are deliberate: hex, bare `r g b`, and `rgb()`. Cycling them
// doubles as a smoke test for `parseColor()`.
const PREVIEW_COVERS = [
  { label: '暖橙', primaryColor: '#c8613c' },
  { label: '青绿', primaryColor: '38 168 148' },
  { label: '紫', primaryColor: 'rgb(138, 92, 214)' },
]

// Accent policy. `follow` derives the colour from the cover, `fixed` pins it to
// `fixedColor`, `off` leaves the theme default alone.
//
// This constant is what a real wallpaper ships with: the engine gives the page no
// keyboard, so the M key below only works in a browser. Tuning the numbers here is
// the in-engine knob; `options` is forwarded to `accentFromTrack`, and every field
// is documented in ACCENT_DEFAULTS.
const ACCENT = {
  mode: 'follow',
  fixedColor: '#a8c4ff',
  options: {
    minSourceSaturation: 0.12,
    saturationFloor: 0.42,
    saturationCeiling: 0.92,
  },
}

const ACCENT_MODES = ['follow', 'fixed', 'off']

/**
 * @param {{ primaryColor?: string } | null} track
 * @param {'light' | 'dark'} theme
 * @param {'follow' | 'fixed' | 'off'} mode
 * @returns {string | null}
 */
function pickAccent(track, theme, mode) {
  if (mode === 'off') return null
  if (mode === 'fixed') return ACCENT.fixedColor
  return accentFromTrack(track, theme, ACCENT.options)
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const CLOCK_PLACEMENTS = [
  'card',
  'bar',
  'minimal',
  'cyberpunk',
  'infobar',
  'split',
  'poster',
  'ring',
  'segments',
  'stamp',
]

// The clock alternates between the two top corners, so one cycle shows all four
// anchors at once: the card owns the bottom-left, the spectrum the bottom-right.
const CLOCK_ANCHORS = ['top-left', 'top-right']

// Backdrops, each tied to the theme that suits it. A bright backdrop with light
// text is the exact failure `theme="dark"` exists to prevent, so the cycle pairs
// them instead of letting the theme float free.
const SCENES = [
  { id: 'night', label: '深夜（深底 → 浅字）', theme: 'light' },
  { id: 'dusk', label: '暮色（深底 → 浅字）', theme: 'light' },
  { id: 'day', label: '白昼（亮底 → 深字）', theme: 'dark' },
  { id: 'paper', label: '浅纸（亮底 → 深字）', theme: 'dark' },
]

// The scene advances once every album layout has been shown.
const LAYOUTS_PER_SCENE = ALBUM_ART_VARIANTS.length

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function Hud({ scene, clock, anchor, album, spectrum, audio, media, paused, accent, mode, preview, hidden }) {
  const lines = [
    `scene    ${SCENES.indexOf(scene) + 1}/${SCENES.length}  ${scene.label}`,
    `clock    ${clock} · anchor ${anchor}`,
    `album    ${album} · anchor bottom-left`,
    `spectrum ${spectrum} · anchor bottom-right`,
    `WE       ${audio.engine ? 'yes' : 'no'} · frames ${audio.frames} · beat ${audio.beat.toFixed(2)} · age ${
      audio.ageMs == null ? '—' : `${audio.ageMs}ms`
    }${audio.ageMs != null && audio.ageMs > audio.staleMs ? ' (stale)' : ''}`,
    `media    ${
      media
        ? `${String(media.playback)} · ${media.title || '(无标题)'} · cover ${
            media.thumbnail ? media.thumbnail.slice(0, 42) : '(无)'
          }`
        : 'null'
    }`,
    // The raw value is printed next to the derived one on purpose: it is the only
    // way to see which format the engine actually sends, and whether the clamp
    // moved the colour or the parse bailed out. When a preview cover is selected
    // but the mode is not `follow`, say so — otherwise it looks like A is broken.
    preview
      ? `accent   ${mode} · 预览「${preview.label}」raw "${preview.primaryColor}" → ${
          accent || `${DEFAULT_ACCENT} (默认)`
        }${mode === 'follow' ? '' : ' （非 follow，封面被忽略）'}`
      : `accent   ${mode} · ${accent || `${DEFAULT_ACCENT} (默认)`} · raw "${
          (media && media.primaryColor) || '—'
        }"`,
    `paused   ${paused}`,
    `keys     ← → 步进 · ↑ ↓ 换场景 · 空格 停/启循环 · H 显隐 · A 预览封面色 · M 强调色模式`,
  ]

  return (
    <div className={hidden ? 'tb-hud tb-hud--hidden' : 'tb-hud'}>
      {lines.map((line) => (
        <div key={line} className="tb-hud__line">
          {line}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

function Wallpaper() {
  const [step, setStep] = useState(0)
  const [cycling, setCycling] = useState(CYCLE_MS > 0)
  const [hudVisible, setHudVisible] = useState(SHOW_HUD)
  // null = follow the engine; an index = a synthetic cover chosen with A.
  const [previewCover, setPreviewCover] = useState(null)
  const [accentMode, setAccentMode] = useState(ACCENT.mode)

  const paused = useWallpaperPaused()
  const now = useNow(paused)
  const bars = useWallpaperAudio()
  const beat = useWallpaperBeat()
  const status = useWallpaperAudioStatus()
  const track = useWallpaperMedia(paused)

  const albumVariant = ALBUM_ART_VARIANTS[step % ALBUM_ART_VARIANTS.length]
  const clockPlacement = CLOCK_PLACEMENTS[step % CLOCK_PLACEMENTS.length]
  const clockAnchor = CLOCK_ANCHORS[step % CLOCK_ANCHORS.length]
  const spectrumVariant = SPECTRUM_STYLES[step % SPECTRUM_STYLES.length]
  const scene = SCENES[Math.floor(step / LAYOUTS_PER_SCENE) % SCENES.length]

  useEffect(() => {
    if (!cycling || CYCLE_MS <= 0) return undefined
    const id = setInterval(() => setStep((value) => value + 1), CYCLE_MS)
    return () => clearInterval(id)
  }, [cycling])

  // Keyboard is useless inside the engine, but it makes the page practical in a
  // browser: step through variants without waiting for the timer.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowRight') setStep((value) => value + 1)
      else if (event.key === 'ArrowLeft') setStep((value) => Math.max(0, value - 1))
      // Jumping a whole scene keeps the album layout while the backdrop changes,
      // which is what you want when judging contrast.
      else if (event.key === 'ArrowDown') setStep((value) => value + LAYOUTS_PER_SCENE)
      else if (event.key === 'ArrowUp') setStep((value) => Math.max(0, value - LAYOUTS_PER_SCENE))
      else if (event.key === ' ') {
        event.preventDefault()
        setCycling((value) => !value)
      } else if (event.key === 'h' || event.key === 'H') {
        setHudVisible((value) => !value)
      } else if (event.key === 'a' || event.key === 'A') {
        // Cycles off → 1 → 2 → 3 → off, so there is always a way back to "real".
        setPreviewCover((value) => {
          if (value == null) return 0
          return value + 1 < PREVIEW_COVERS.length ? value + 1 : null
        })
      } else if (event.key === 'm' || event.key === 'M') {
        setAccentMode((value) => ACCENT_MODES[(ACCENT_MODES.indexOf(value) + 1) % ACCENT_MODES.length])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The cover's tint is handed to the card through `primaryColor`; normalizing it
  // here keeps a garbage value out of the CSS variable, and lets a host that sends
  // `r g b` still tint the card.
  const coverHex = toHexColor(track && track.primaryColor)
  const themedTrack = track ? { ...track, primaryColor: coverHex || '' } : null

  // One policy, two sources. The mode decides *whether* the accent follows the
  // cover; the preview cover only swaps *which* cover is consulted (a browser has
  // none). Letting the preview bypass the mode was wrong: pressing A under `fixed`
  // or `off` still produced three colours, which reads as "M does nothing".
  const preview = previewCover == null ? null : PREVIEW_COVERS[previewCover]
  const accentSource = preview ? { primaryColor: preview.primaryColor } : themedTrack
  const accent = pickAccent(accentSource, scene.theme, accentMode)

  return (
    <div
      className={`tb-stage tb-scene--${scene.id}`}
      // Only the CSS-driven controls read this (Clock's ring / segments / stamp).
      // The canvases resolve their colour from the `colorHex` prop instead: their
      // `resolveColor` effect does not re-read the variable when it changes.
      style={accent ? { '--wallkit-accent': accent } : undefined}
    >
      <Clock
        now={now}
        placement={clockPlacement}
        theme={scene.theme}
        size={100}
        anchor={clockAnchor}
        offsetX={6}
        offsetY={6}
        beat={beat}
        labels={{ locale: 'zh-CN', aria: '当前时间与日期' }}
      />

      <div className="tb-mini">
        <MiniSpectrum
          bars={bars}
          variant={spectrumVariant}
          colorHex={accent || undefined}
          paused={paused}
        />
      </div>

      <AlbumArt
        track={themedTrack}
        bars={bars}
        variant={albumVariant}
        theme={scene.theme}
        colorHex={accent || undefined}
        size={90}
        anchor="bottom-left"
        offsetX={5}
        offsetY={6}
        paused={paused}
        labels={{ aria: '正在播放' }}
      />

      <Spectrum
        bars={bars}
        variant={spectrumVariant}
        colorHex={accent || undefined}
        size={100}
        anchor="bottom-right"
        offsetX={6}
        offsetY={6}
        paused={paused}
      />

      <Hud
        scene={scene}
        clock={clockPlacement}
        album={albumVariant}
        spectrum={spectrumVariant}
        anchor={clockAnchor}
        audio={{ ...status, beat, staleMs: STALE_MS }}
        media={track}
        accent={accent}
        mode={accentMode}
        preview={preview}
        paused={paused}
        hidden={!hudVisible}
      />
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Wallpaper />
  </StrictMode>,
)
