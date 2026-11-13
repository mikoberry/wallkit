// User-property hooks for the Wallpaper Engine bridge.
//
// The <head> bridge (./inline/properties.js) owns window.__wallkitUserProperties
// and dispatches 'wallkit-properties-change'. These hooks only read it.
//
// Unlike audio, this data is a configuration channel: it changes when a human
// drags a slider in the engine's settings, not at 60 Hz. A plain state update is
// the right shape here — do not build a ref-like buffer for it.
//
// Values arrive in the engine's own formats:
//
//   color      "0.65 0.76 1"  (0..1 floats, space separated — bake ×255 yourself)
//   slider     number         (fractional when `fraction` is enabled)
//   bool       boolean
//   combo      the selected option's hidden `value` string
//   textinput  string
//   file       path; prepend 'file:///' before using it in the DOM
//   directory  path; the files themselves come from
//              window.wallpaperRequestRandomFileForProperty(key, cb) in
//              `ondemand` mode
//
// A missing key means the project.json does not declare it. Do not read that as
// `false`/`''` — pass an explicit fallback at the call site.

import { useEffect, useState } from 'react'

const SNAPSHOT = '__wallkitUserProperties'
const EVENT = 'wallkit-properties-change'

// Shared frozen empty map, so "no host" costs no allocation and keeps the
// snapshot identity stable between renders.
const EMPTY = Object.freeze({})

function readSnapshot() {
  if (typeof window === 'undefined') return EMPTY
  return window[SNAPSHOT] || EMPTY
}

/**
 * Every user property the engine has delivered, as `{ key: value }`.
 *
 * The object identity changes only when the engine pushes an update, so it is
 * safe to use in dependency arrays.
 *
 * @returns {Record<string, unknown>}
 */
export function useWallpaperProperties() {
  const [properties, setProperties] = useState(readSnapshot)

  useEffect(() => {
    const onChange = (event) => setProperties(event.detail || EMPTY)
    window.addEventListener(EVENT, onChange)
    // The first push happens during page load, possibly before React mounts.
    // Re-reading here is what makes that initial payload visible.
    setProperties(readSnapshot())
    return () => window.removeEventListener(EVENT, onChange)
  }, [])

  return properties
}

/**
 * One property with an explicit fallback for "not declared".
 *
 * @param {string} key Property key as written in project.json.
 * @param {unknown} fallback Returned when the host never sent that key.
 * @returns {unknown}
 */
export function useWallpaperProperty(key, fallback) {
  const properties = useWallpaperProperties()
  const value = properties[key]
  return value === undefined ? fallback : value
}
