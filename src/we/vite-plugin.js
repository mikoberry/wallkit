// Vite plugin that injects the Wallpaper Engine listener bridges into <head>.
//
// WE starts pushing audio frames very early in page load. Vite's entry script is
// `type="module"` (deferred), so registering listeners from React or from
// window.onload loses the first frames and in some builds stops the callback
// from firing at all. These bridges therefore have to be classic scripts at the
// very top of <head>, ahead of every module tag.
//
// The plugin only injects scripts. It does not register components, create a
// Provider, touch runtime global state, or write project.json. Projects that do
// not use it can paste the equivalent scripts from docs/we-integration.md §2.2.

import { audioBridgeScript } from './inline/audio.js'
import { mediaBridgeScript } from './inline/media.js'
import { timelineBridgeScript } from './inline/timeline.js'
import { propertiesBridgeScript } from './inline/properties.js'
import { pauseBridgeScript } from './inline/pause.js'

// Order is part of the contract. The pause bridge decides whether the host is
// ready by looking for wallpaperRegisterAudioListener, so it follows the audio
// bridge; it also attaches `setPaused` to whatever `wallpaperPropertyListener`
// object already exists, which is the one the properties bridge installs. Both
// bridges merge into that object, so properties has to come first — otherwise
// the per-property payload would land on an object pause created.
// timeline is off by default — WE warns most players never call it.
const SEGMENTS = [
  { key: 'audio', defaultOn: true, marker: '<!-- wallkit-we:audio -->', script: audioBridgeScript },
  { key: 'media', defaultOn: true, marker: '<!-- wallkit-we:media -->', script: mediaBridgeScript },
  { key: 'properties', defaultOn: true, marker: '<!-- wallkit-we:properties -->', script: propertiesBridgeScript },
  { key: 'timeline', defaultOn: false, marker: '<!-- wallkit-we:timeline -->', script: timelineBridgeScript },
  { key: 'pause', defaultOn: true, marker: '<!-- wallkit-we:pause -->', script: pauseBridgeScript },
]

/**
 * Inject the WE bridges into every HTML entry, in dev and in build alike.
 *
 * @param {{ audio?: boolean, media?: boolean, properties?: boolean, pause?: boolean, timeline?: boolean }} [options]
 *   The first four default to true. `timeline` defaults to false: WE's
 *   `wallpaperRegisterMediaTimelineListener` is unsupported by most players and
 *   the current controls do not consume it. Enable it only when needed.
 * @returns {import('vite').Plugin}
 */
export function wallkitWE(options = {}) {
  const enabled = SEGMENTS.filter((segment) => {
    const value = options[segment.key]
    return value === undefined ? segment.defaultOn : Boolean(value)
  })

  return {
    name: 'wallkit-we',

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (typeof html !== 'string') return html

        const missing = enabled.filter((segment) => !html.includes(segment.marker))
        if (missing.length === 0) return html

        // Markers go into the HTML *string*, not just into the tag descriptors.
        // That is what makes this transform idempotent: a second wallkitWE()
        // instance — or a page where one bridge was pasted by hand — receives
        // the markers and skips that segment instead of injecting it twice.
        const markerBlock = missing.map((segment) => segment.marker).join('\n')
        const headMatch = html.match(/<head[^>]*>/i)
        const nextHtml = headMatch
          ? html.replace(headMatch[0], () => `${headMatch[0]}\n${markerBlock}`)
          : `${markerBlock}\n${html}`

        // No `type` attribute: these must stay classic scripts. Vite serialises
        // head-prepend tags in array order right after the <head> tag.
        const tags = missing.map((segment) => ({
          tag: 'script',
          attrs: { 'data-wallkit-we': segment.key },
          injectTo: 'head-prepend',
          children: segment.script,
        }))

        return { html: nextHtml, tags }
      },
    },
  }
}
