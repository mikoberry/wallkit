// Audio hooks for the Wallpaper Engine bridge.
//
// The <head> script copies each host callback into a fresh Float32Array at
// window.__wallkitAudioFrame (see ./inline/audio.js). These hooks turn that into
// the two shapes the controls consume: a stable bar array and a bass level.

import { useEffect, useRef, useState } from 'react'
import { SPECTRUM_BARS, extractSpectrumBars, summarizeWallpaperAudio } from '../core/index.js'

// Smallest change in the bass level worth a re-render. Below this the difference
// cannot be seen, so silence (or a held note) costs no renders at all.
const BEAT_EPSILON = 0.004

// One rAF pump per page, shared by every hook that needs raw frames. Otherwise a
// wallpaper using both hooks would read the same global twice per frame. The
// loop only exists while somebody is subscribed, so it disappears on unmount.
const subscribers = new Set()
let rafId = 0
let lastFrame = null

function pump() {
  if (subscribers.size === 0) {
    rafId = 0
    return
  }

  const frame = window.__wallkitAudioFrame
  // The head script copies every callback into a fresh array, so a new identity
  // means a new frame. Silence still arrives as frames of zeros, which is why
  // this is not compared against "all zero".
  if (frame && frame !== lastFrame) {
    lastFrame = frame
    for (const subscriber of subscribers) subscriber(frame)
  }
  rafId = requestAnimationFrame(pump)
}

function subscribeFrame(subscriber) {
  subscribers.add(subscriber)
  if (rafId === 0) rafId = requestAnimationFrame(pump)

  return () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0 && rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
      // A later subscriber must see the current frame as new, not as stale.
      lastFrame = null
    }
  }
}

/**
 * Normalised spectrum bars.
 *
 * Returns a buffer that is created once and rewritten in place on every frame.
 * The spectrum widgets read `bars` inside their own draw loop, so 60 Hz audio
 * costs zero React re-renders — this is why the value is ref-like rather than
 * state. Keep the reference: do not clone it into state.
 *
 * With no host (a plain browser) the buffer simply stays all-zero. It is
 * deliberately NOT `null`: both spectrum components return `null` (no DOM at
 * all) for a null `bars`, while the behaviour verified in Wallpaper Engine is an
 * empty graph. An all-zero buffer is honest "no data", not synthetic data.
 *
 * @returns {Float32Array} Stable buffer of length SPECTRUM_BARS, values 0..1.
 */
export function useWallpaperAudio() {
  const barsRef = useRef(null)
  if (barsRef.current === null) barsRef.current = new Float32Array(SPECTRUM_BARS)
  const bars = barsRef.current

  useEffect(() => subscribeFrame((frame) => {
    extractSpectrumBars(frame, bars)
  }), [bars])

  return bars
}

/**
 * Bass level in 0..1, for `Clock.beat` and any whole-widget reaction.
 *
 * Separate from useWallpaperAudio on purpose: this one DOES re-render, and a
 * project with no beat-reactive clock should not pay for it. The epsilon keeps
 * quiet stretches free of renders.
 *
 * @returns {number}
 */
export function useWallpaperBeat() {
  const [beat, setBeat] = useState(0)

  useEffect(() => {
    let lastBeat = 0
    return subscribeFrame((frame) => {
      const summary = summarizeWallpaperAudio(frame)
      const next = summary ? summary.bass : 0
      if (Math.abs(next - lastBeat) > BEAT_EPSILON) {
        lastBeat = next
        setBeat(next)
      }
    })
  }, [])

  return beat
}
