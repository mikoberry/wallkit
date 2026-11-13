// Data layer for the Wallpaper Engine test page.
//
// WallKit's components take data as props; collecting it is the caller's job.
// The library's own hooks (`wallkit/we`) are still a P4 placeholder, so this
// file is the app-side collector the integration guide describes: it reads the
// globals that the `<head>` scripts in `wallpaper.html` fill, and hands plain
// values to React.
//
// Nothing here fabricates audio. Opened in a normal browser there is no
// `wallpaperRegisterAudioListener`, so `bars` stays all-zero and the widgets
// draw an empty graph — which is the honest answer to "no data".

import { useEffect, useRef, useState } from 'react'
import { SPECTRUM_BARS, extractSpectrumBars, summarizeWallpaperAudio } from '../src/core/index.js'

// A frame older than this makes the HUD call the audio stale.
const STALE_MS = 1500

/**
 * Raw audio frames, converted in place.
 *
 * The bars array is created once and mutated on every new frame. The spectrum
 * widgets read `bars` inside their own draw loop instead of during render, so a
 * stable Float32Array lets the audio update at 60 Hz without a single React
 * re-render — which is the whole reason this hook returns a ref-like value
 * instead of state.
 *
 * @returns {{
 *   bars: Float32Array,
 *   beat: number,
 *   status: { engine: boolean, frames: number, ageMs: number | null },
 * }}
 */
export function useWallpaperAudio() {
  const barsRef = useRef(null)
  if (barsRef.current === null) barsRef.current = new Float32Array(SPECTRUM_BARS)

  const [beat, setBeat] = useState(0)
  const [status, setStatus] = useState({ engine: false, frames: 0, ageMs: null })

  useEffect(() => {
    let raf = 0
    let frames = 0
    let lastFrame = null
    let lastBeatAt = 0
    let lastStatusAt = 0

    const tick = (time) => {
      const frame = window.__wallkitAudioFrame
      // The head script copies every callback into a fresh Float32Array, so a
      // new identity means a new frame. Silence still arrives as frames of
      // zeros, which is why this is not compared against "all zero".
      if (frame && frame !== lastFrame) {
        lastFrame = frame
        frames += 1
        if (extractSpectrumBars(frame, barsRef.current)) {
          // 10 Hz is plenty for a value that ends up in a CSS variable; going
          // per-frame would re-render the clock 60 times a second for nothing.
          if (time - lastBeatAt > 100) {
            lastBeatAt = time
            const summary = summarizeWallpaperAudio(frame)
            setBeat(summary ? summary.bass : 0)
          }
        }
      }
      if (time - lastStatusAt > 500) {
        lastStatusAt = time
        const at = window.__wallkitAudioAt || 0
        setStatus({
          engine: Boolean(
            typeof window.wallpaperRegisterAudioListener === 'function' ||
              window.wallpaperPropertyListener,
          ),
          frames,
          ageMs: at ? Date.now() - at : null,
        })
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return { bars: barsRef.current, beat, status, staleMs: STALE_MS }
}

function readMedia() {
  const raw = window.__wallkitMedia
  if (!raw) return null
  const track = {
    title: raw.title || '',
    artist: raw.artist || '',
    albumTitle: raw.albumTitle || '',
    thumbnail: raw.thumbnail || '',
    primaryColor: raw.primaryColor || '',
    textColor: raw.textColor || '',
    playback: raw.playback ?? null,
  }
  // An object with every field empty means "media integration is on but nothing
  // is playing". Handing that to the card would draw an empty placeholder, so
  // it collapses to null — the same shape as "no media bridge at all".
  const hasContent = track.title || track.artist || track.albumTitle || track.thumbnail
  return hasContent ? track : null
}

function sameTrack(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.title === b.title &&
    a.artist === b.artist &&
    a.albumTitle === b.albumTitle &&
    a.thumbnail === b.thumbnail &&
    a.primaryColor === b.primaryColor &&
    a.playback === b.playback
  )
}

/**
 * Now-playing metadata.
 *
 * The engine only pushes on change, so this polls the bridged object at 2 Hz —
 * the same "cheap poll lives where the data is produced" split the components
 * document. Re-renders only happen when a field actually changed.
 *
 * @returns {import('../src/core/types.js').TrackInfo | null}
 */
export function useWallpaperMedia(paused) {
  const [track, setTrack] = useState(() => readMedia())

  useEffect(() => {
    // A paused wallpaper is frozen by the engine anyway; skipping the poll keeps
    // the "do nothing while paused" promise honest.
    if (paused) return undefined
    const id = setInterval(() => {
      const next = readMedia()
      setTrack((prev) => (sameTrack(prev, next) ? prev : next))
    }, 500)
    return () => clearInterval(id)
  }, [paused])

  return track
}

/** Wallpaper pause state, as dispatched by the `<head>` pause bridge. */
export function useWallpaperPaused() {
  const [paused, setPaused] = useState(() => window.__wallkitPaused === true)

  useEffect(() => {
    const onChange = (event) => setPaused(event.detail === true)
    window.addEventListener('wallkit-pause-change', onChange)
    return () => window.removeEventListener('wallkit-pause-change', onChange)
  }, [])

  return paused
}

/**
 * A ticking `Date` for the clock.
 *
 * `Clock` has no `paused` prop on purpose: the caller drives `now`, so stopping
 * the update *is* the pause. The timer is torn down instead of running behind a
 * frozen UI.
 */
export function useNow(paused) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (paused) return undefined
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [paused])

  return now
}
