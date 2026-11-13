// Wallpaper Engine test page.
//
// This is not a demo gallery — it is a single wallpaper-sized composition that
// mounts every control at once, wired to the engine's real audio and media
// callbacks (see the inline scripts in `wallpaper.html`). Build it with
// `npm run build:wallpaper` and point Wallpaper Engine at
// `playground/dist-wallpaper`.
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
import { isHexColor } from '../src/core/index.js'
import {
  useNow,
  useWallpaperAudio,
  useWallpaperMedia,
  useWallpaperPaused,
} from './wallpaper-data.js'
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

function Hud({ scene, clock, anchor, album, spectrum, audio, media, paused, hidden }) {
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
    `paused   ${paused}`,
    `keys     ← → 步进 · ↑ ↓ 换场景 · 空格 停/启循环 · H 显隐`,
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

  const paused = useWallpaperPaused()
  const now = useNow(paused)
  const { bars, beat, status, staleMs } = useWallpaperAudio()
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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The cover's tint is handed to the card through `primaryColor`; validating it
  // here keeps a garbage value out of the CSS variable.
  const themedTrack =
    track && isHexColor(track.primaryColor) ? track : track ? { ...track, primaryColor: '' } : null

  return (
    <div className={`tb-stage tb-scene--${scene.id}`}>
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
        <MiniSpectrum bars={bars} variant={spectrumVariant} paused={paused} />
      </div>

      <AlbumArt
        track={themedTrack}
        bars={bars}
        variant={albumVariant}
        theme={scene.theme}
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
        audio={{ ...status, beat, staleMs }}
        media={track}
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
