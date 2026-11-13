// App-side helpers that deliberately stay OUTSIDE the library.
//
// Audio / media / pause now come from `wallkit/we` (P4). Two things remain here
// because they are not part of the wallpaper's data contract:
//
//   - `useNow()` — the Clock's time is driven by the caller; stopping the update
//     IS the pause. A library tick would take that control away.
//   - `useWallpaperAudioStatus()` / STALE_MS — debug HUD internals (engine
//     probe, frame counter, frame age). They are diagnostics, not props, so
//     they never entered the public API (see docs/we-design.md §2.1).
//
// Nothing here fabricates audio. In a plain browser there is no host, the frame
// stays null, and the widgets draw an empty graph — the honest answer to "no
// data".

import { useEffect, useState } from 'react'

// A frame older than this makes the HUD call the audio stale.
export const STALE_MS = 1500

/**
 * HUD-only diagnostics about the raw audio bridge.
 *
 * Reads the globals written by the injected <head> script. It keeps its own rAF
 * loop so the frame counter stays exact; the library hooks deliberately do not
 * expose this state, and the HUD is not part of the library's API.
 *
 * @returns {{ engine: boolean, frames: number, ageMs: number | null }}
 */
export function useWallpaperAudioStatus() {
  const [status, setStatus] = useState({ engine: false, frames: 0, ageMs: null })

  useEffect(() => {
    let raf = 0
    let frames = 0
    let lastFrame = null
    let lastStatusAt = 0

    const tick = (time) => {
      const frame = window.__wallkitAudioFrame
      // The head script copies every callback into a fresh Float32Array, so a
      // new identity means a new frame.
      if (frame && frame !== lastFrame) {
        lastFrame = frame
        frames += 1
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

  return status
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
