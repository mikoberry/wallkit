// Media hooks for the Wallpaper Engine bridge.
//
// The engine pushes only on change, so polling the bridged object at 2 Hz is
// cheaper than trying to register a React-side listener — and it keeps the
// "cheap poll lives where the data is produced" split the components document.

import { useEffect, useState } from 'react'

const POLL_MS = 500

function readMedia() {
  const raw = typeof window === 'undefined' ? null : window.__wallkitMedia
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

function sameTimeline(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return a.position === b.position && a.duration === b.duration
}

/**
 * Now-playing metadata.
 *
 * Re-renders only when a field actually changed. Pass the paused flag to stop
 * the poll while the engine has the wallpaper frozen.
 *
 * @param {boolean} [paused=false]
 * @returns {import('../core/types.js').TrackInfo | null}
 */
export function useWallpaperMedia(paused = false) {
  const [track, setTrack] = useState(() => readMedia())

  useEffect(() => {
    if (paused) return undefined
    const id = setInterval(() => {
      const next = readMedia()
      setTrack((prev) => (sameTrack(prev, next) ? prev : next))
    }, POLL_MS)
    return () => clearInterval(id)
  }, [paused])

  return track
}

/**
 * Playback position, in seconds. Requires `wallkitWE({ timeline: true })`.
 *
 * Wallpaper Engine warns that most players never fire the timeline listener, so
 * the value stays `null` unless real numbers arrive. It is never interpolated
 * or ticked locally — a missing timeline stays missing.
 *
 * @param {boolean} [paused=false]
 * @returns {{ position: number, duration: number } | null}
 */
export function useWallpaperTimeline(paused = false) {
  const [timeline, setTimeline] = useState(() =>
    typeof window === 'undefined' ? null : window.__wallkitTimeline ?? null,
  )

  useEffect(() => {
    if (paused) return undefined
    const id = setInterval(() => {
      const raw = window.__wallkitTimeline
      const next =
        raw && Number.isFinite(raw.position) && Number.isFinite(raw.duration)
          ? { position: raw.position, duration: raw.duration }
          : null
      setTimeline((prev) => (sameTimeline(prev, next) ? prev : next))
    }, POLL_MS)
    return () => clearInterval(id)
  }, [paused])

  return timeline
}
