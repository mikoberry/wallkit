// Dev-server only: replay the manifest through the real property bridge.
//
// Why this exists — in a browser nothing ever calls `applyUserProperties`, so
// every row on the testbed HUD reads "—" and the thing the page is supposed to
// test (a manifest that actually drives the controls) is invisible. Opening
// Wallpaper Engine for every tweak is not a workflow.
//
// What it is not — a fixture of made-up values. It builds the payload from
// `project.config.js` through the same `defineProject()` the shipped file comes
// from, so what the page receives is the manifest you are about to publish.
// Two conversions are applied because the engine applies them and nothing else
// does: colours go from the manifest's 0..255 triplet to the page's 0..1
// floats, and `text` / `group` entries are dropped (no value of their own).
//
// It can never run inside the engine: `wallpaper.jsx` reaches this module behind
// `import.meta.env.DEV`, which is false in `build:wallpaper`'s production build.
//
// This is still a simulation. The HUD labels it as one — a green "12 项" here
// means "the bridge accepts the payload", not "the engine sends it".

import config from './project.config.js'
import { defineProject } from '../src/project/index.js'

// Types with no value of their own. The engine never reports them, so a page
// that saw them would be reading a key that means nothing.
const VALUELESS = new Set(['text', 'group'])

// Guards React StrictMode's double effect run: two pushes would show up as
// "events 2 次" and make the log look like a real settings change.
let alreadyPushed = false

/**
 * The engine's colour conversion: `"168 196 255"` → `"0.6588 0.7686 1"`.
 *
 * Six decimals is what the engine writes. Rounding further makes a slider drag
 * look like it does nothing on the page.
 *
 * @param {string} triplet
 * @returns {string}
 */
function toPageColor(triplet) {
  return String(triplet)
    .trim()
    .split(/\s+/)
    .map((part) => Number((Number(part) / 255).toFixed(6)))
    .join(' ')
}

/**
 * Push the manifest's declared values the way the engine would, once.
 *
 * @returns {number} How many properties were pushed; 0 when nothing happened.
 */
export function simulateUserProperties() {
  if (alreadyPushed) return 0

  const listener = window.wallpaperPropertyListener
  if (!listener || typeof listener.applyUserProperties !== 'function') return 0

  const { properties } = defineProject(config).general
  const payload = {}

  for (const [key, spec] of Object.entries(properties)) {
    if (VALUELESS.has(spec.type)) continue
    payload[key] = {
      type: spec.type,
      value: spec.type === 'color' ? toPageColor(spec.value) : spec.value,
    }
  }

  listener.applyUserProperties(payload)
  alreadyPushed = true

  console.info(
    `[wallkit] 开发模拟：按下 project.config.js 推送了 ${Object.keys(payload).length} 个属性。` +
      '这不是引擎推送，真机验收仍需在 WE 里看。',
  )

  return Object.keys(payload).length
}
