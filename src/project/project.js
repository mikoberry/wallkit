// project.json generation for Wallpaper Engine web wallpapers.
//
// `project.json` is the engine's own manifest: it names the entry page, declares
// the user-facing settings, and carries the Workshop metadata (title,
// description, tags, preview). Every wallpaper repo needs one, and the same
// handful of mistakes keep coming back (see docs/we-integration.md §3):
//
//   - `supportsaudioprocessing` written at the top level instead of inside
//     `general` → the audio listener registers but never fires, silently
//   - `type` missing or misspelled → the project does not open
//   - colour values written as 0..1 floats → the engine shows black
//
// This module fixes those by construction: you declare only what varies, and it
// emits the shape the engine expects.
//
// Two rules shape the API:
//
// 1. **The library owns the mechanism, not your profile.** Your homepage, your
//    fixed blurb, your default tags belong in a config file in your own wallpaper
//    repo. Baking them in here would ship one person's links to every consumer
//    of an MIT-licensed library.
// 2. **Generation merges, never replaces.** The editor rewrites this file when
//    you change project settings, adding `preview`, `version`, `snapshotformat`
//    and — for a published wallpaper — `workshopid`. Losing `workshopid` makes
//    the engine treat the next upload as a brand-new Workshop item, so the
//    existing subscribers never receive the update. Those keys are preserved
//    unconditionally.

import { colorTriplet } from './properties.js'

// Keys the engine (or the editor) writes itself. Never generated, always kept.
export const ENGINE_OWNED = ['workshopid', 'version', 'snapshotformat', 'snapshotoverlay']

// Every project needs a scheme colour; the engine adds it by default and the
// browse page uses it to tint the card. Order 0 keeps it above the user
// properties, matching what the editor writes.
//
// The text is a localisation key, not a label: the engine translates `ui_*`
// strings in the panel, and this is the key its own editor writes. Spelling it
// `schemecolor` makes the panel show that bare word in every language.
const SCHEME_COLOR = {
  order: 0,
  text: 'ui_browse_properties_scheme_color',
  type: 'color',
  value: '0 0 0',
}

const PROPERTY_TYPES = new Set([
  'bool',
  'slider',
  'color',
  'combo',
  'textinput',
  'text',
  'file',
  'directory',
  'group',
])

// `condition` is a small expression, not a general one: the engine compares
// `<key>.value` against a literal. Anything else is silently ignored by the
// engine, which looks exactly like a typo in the key, so reject it here.
const CONDITION = /^([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*value\s*(==|!=)\s*(.+)$/

// Alphabetical, so a regenerated file lines up with what the editor writes and
// diffs stay readable. `undefined` values are dropped here, which is how the
// optional top-level keys stay out of the output.
function sortKeys(object) {
  const sorted = {}
  for (const key of Object.keys(object).sort()) {
    if (object[key] !== undefined) sorted[key] = object[key]
  }
  return sorted
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`defineProject: \`${field}\` 必须是非空字符串`)
  }
  return value.trim()
}

// One property entry. `index` / `order` follow the editor's own convention:
// sequential from 0 / 100 in declaration order, unless pinned explicitly.
function normalizeProperty(key, spec, index) {
  if (!spec || typeof spec !== 'object') {
    throw new Error(
      `属性 "${key}" 必须是对象——用 bool / slider / color / combo / text / file / directory / group 构造`,
    )
  }
  if (!PROPERTY_TYPES.has(spec.type)) {
    throw new Error(
      `属性 "${key}" 的 type "${spec.type}" 不是引擎支持的类型——用对应的 builder 构造`,
    )
  }
  if (spec.value === undefined) {
    throw new Error(`属性 "${key}" 缺少 value——builder 一定会带上它，手写定义则必须补上`)
  }
  if (spec.condition !== undefined) {
    if (typeof spec.condition !== 'string' || !CONDITION.test(spec.condition.trim())) {
      throw new Error(
        `属性 "${key}" 的 condition 必须是 "其他key.value == 1" 形式，收到：${JSON.stringify(spec.condition)}`,
      )
    }
  }

  const { text, order, index: pinnedIndex, ...rest } = spec
  return sortKeys({
    ...rest,
    index: pinnedIndex ?? index,
    order: order ?? 100 + index,
    text: text ?? key,
  })
}

// A condition naming a key that is not declared hides the control forever, with
// no error anywhere. The file is small enough to check every reference.
function assertConditionsResolve(properties) {
  for (const [key, spec] of Object.entries(properties)) {
    if (!spec || typeof spec.condition !== 'string') continue
    const referenced = CONDITION.exec(spec.condition.trim())[1]
    if (!(referenced in properties)) {
      throw new Error(`属性 "${key}" 的 condition 引用了未声明的属性 "${referenced}"`)
    }
  }
}

// The scheme colour is not a user property: the editor gives it order 0 and no
// index, and it is always present.
function normalizeScheme(spec) {
  const merged = { ...SCHEME_COLOR, ...(spec || {}) }
  const { index: _ignored, ...rest } = merged
  return sortKeys({ ...rest, value: colorTriplet(rest.value) })
}

function normalizeProperties(properties) {
  if (properties != null && typeof properties !== 'object') {
    throw new Error('defineProject: `properties` 必须是对象')
  }

  const source = properties || {}
  const { schemecolor, ...userProperties } = source

  const out = { schemecolor: normalizeScheme(schemecolor) }
  Object.entries(userProperties).forEach(([key, spec], index) => {
    out[key] = normalizeProperty(key, spec, index)
  })
  assertConditionsResolve(out)
  return out
}

function normalizeDescription(description) {
  if (description == null) return undefined
  const paragraphs = Array.isArray(description) ? description : [description]

  const text = paragraphs
    .map((paragraph) => {
      if (typeof paragraph !== 'string') {
        throw new Error('defineProject: `description` 只能包含字符串')
      }
      return paragraph.trim()
    })
    .filter(Boolean)
    .join('\n\n')

  return text || undefined
}

function normalizeTags(tags) {
  if (tags == null) return undefined
  if (!Array.isArray(tags)) throw new Error('defineProject: `tags` 必须是数组')

  return tags.map((tag) => {
    if (typeof tag !== 'string' || tag.trim() === '') {
      throw new Error('defineProject: `tags` 只能包含非空字符串')
    }
    return tag.trim()
  })
}

/**
 * Build a `project.json` object.
 *
 * Returns a plain object — writing the file is the caller's job, because only
 * the caller knows when the engine's copy may be overwritten. See
 * `docs/project-tool.md`.
 *
 * `contentrating` and `visibility` deliberately have no defaults: silently
 * regenerating a published wallpaper's rating or visibility is worse than
 * leaving the current value alone. Omit them and `mergeProject()` keeps what is
 * already in the file.
 *
 * @param {Object} input
 * @param {string} input.file                     Entry page, e.g. `'wallpaper.html'`.
 * @param {string} input.title                    Workshop title.
 * @param {string|string[]} [input.description]   Paragraphs, joined with a blank line.
 * @param {string[]} [input.tags]                 Workshop tags, as the engine spells them.
 * @param {string} [input.preview]                Preview file name, e.g. `'preview.gif'`.
 * @param {string} [input.contentrating]          `'Everyone'`, `'Questionable'`, … Omit to keep.
 * @param {string} [input.visibility]             `'public'`, `'friends'`, `'private'`. Omit to keep.
 * @param {boolean} [input.audioprocessing=true]  → `general.supportsaudioprocessing`.
 * @param {'Web'|'web'} [input.type='Web']        Hand-written form; the editor lowercases it.
 *   This tool only emits web wallpapers: a `Scene` project takes a compiled
 *   `scene.pkg`, writes colours as 0..1 floats, and is not something a Vite
 *   build can produce.
 * @param {Object} [input.properties]             Built with the `color` / `slider` / … helpers.
 * @returns {Object} Engine-shaped manifest.
 */
export function defineProject(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('defineProject: 需要传入配置对象')
  }

  const {
    file,
    title,
    description,
    tags,
    preview,
    contentrating,
    visibility,
    audioprocessing = true,
    type = 'Web',
    properties,
  } = input

  // `sortKeys` also drops the optional keys that were not provided, so the
  // returned object never carries `undefined` slots — a key that is absent must
  // mean "leave whatever the file has", and an `undefined` value is exactly the
  // ambiguity that made merging erase `preview` before.
  return sortKeys({
    contentrating,
    description: normalizeDescription(description),
    file: nonEmptyString(file, 'file'),
    general: {
      properties: normalizeProperties(properties),
      // Must live inside `general` — at the top level it is ignored without a
      // word, and the audio bridge never receives a frame.
      supportsaudioprocessing: Boolean(audioprocessing),
    },
    preview: preview === undefined ? undefined : nonEmptyString(preview, 'preview'),
    tags: normalizeTags(tags),
    title: nonEmptyString(title, 'title'),
    type,
    visibility,
  })
}

/**
 * Merge a generated manifest into the one on disk.
 *
 * Generated keys win; keys the generator does not mention are kept as-is. That
 * split is what lets you add a property in the engine's settings UI without it
 * disappearing the next time you regenerate — pass `prune` when you actually
 * want the file to match the config exactly.
 *
 * @param {Object|undefined|null} existing  Parsed current file, if any.
 * @param {Object} generated               Output of `defineProject()`.
 * @param {{ prune?: boolean }} [options]
 * @returns {Object}
 */
export function mergeProject(existing, generated, { prune = false } = {}) {
  const base = existing && typeof existing === 'object' ? existing : {}
  const baseGeneral = base.general && typeof base.general === 'object' ? base.general : {}
  const generatedGeneral = generated.general || {}

  const merged = prune ? {} : { ...base }

  for (const [key, value] of Object.entries(generated)) {
    // `defineProject()` writes optional keys as `undefined` so the object shape
    // stays stable. Copying those would erase whatever the file already had.
    if (key === 'general' || value === undefined) continue
    merged[key] = value
  }

  merged.general = {
    properties: prune
      ? { ...generatedGeneral.properties }
      : { ...(baseGeneral.properties || {}), ...(generatedGeneral.properties || {}) },
    supportsaudioprocessing:
      generatedGeneral.supportsaudioprocessing ?? baseGeneral.supportsaudioprocessing ?? true,
  }

  // Never lost, never generated.
  for (const key of ENGINE_OWNED) {
    if (base[key] !== undefined) merged[key] = base[key]
  }

  return sortKeys(merged)
}

/**
 * Compare a generated manifest against the one on disk.
 *
 * Reports leaves that are missing or different, plus properties that exist in
 * the file but not in the config — the usual leftovers after renaming a key.
 *
 * @param {Object} expected
 * @param {Object|undefined|null} actual
 * @returns {{ mismatches: Array<{path: string, expected: unknown, actual: unknown}>, extra: string[] }}
 */
export function diffProject(expected, actual) {
  const mismatches = []

  const walk = (expectedValue, actualValue, path) => {
    const isPlainObject =
      expectedValue !== null && typeof expectedValue === 'object' && !Array.isArray(expectedValue)

    if (isPlainObject) {
      const source = actualValue !== null && typeof actualValue === 'object' ? actualValue : {}
      for (const [key, value] of Object.entries(expectedValue)) {
        // Optional keys are written as `undefined`; they are not part of the
        // expectation, so they must not read as "expected: nothing".
        if (value === undefined) continue
        walk(value, source[key], path ? `${path}.${key}` : key)
      }
      return
    }

    // The editor lowercases the project type; both spellings open normally, so
    // a case difference is not drift.
    const equal =
      path === 'type'
        ? String(expectedValue).toLowerCase() === String(actualValue).toLowerCase()
        : JSON.stringify(expectedValue) === JSON.stringify(actualValue)

    if (!equal) {
      mismatches.push({ path, expected: expectedValue, actual: actualValue })
    }
  }

  walk(expected, actual, '')

  const expectedProperties = expected?.general?.properties || {}
  const actualProperties = actual?.general?.properties || {}
  const extra = Object.keys(actualProperties).filter((key) => !(key in expectedProperties))

  return { mismatches, extra }
}

/**
 * Serialize a manifest the way the file on disk should look.
 *
 * @param {Object} project
 * @returns {string}
 */
export function stringifyProject(project) {
  return `${JSON.stringify(project, null, 2)}\n`
}
