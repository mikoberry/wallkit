// Self-check for the project.json tool (`wallkit/project`).
//
// Zero dependencies on purpose: the module under test is pure, so plain
// `node:assert` covers it and the repo stays free of a test framework. Run it
// after touching `src/project/`:
//
//   npm run test:project
//
// What this cannot cover: whether the engine actually accepts the file. That
// needs Wallpaper Engine, and the checklist is in docs/project-tool.md.

import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  defineProject,
  mergeProject,
  diffProject,
  stringifyProject,
  color,
  bool,
  slider,
  combo,
  text,
  html,
  directory,
  ENGINE_OWNED,
} from '../../src/project/index.js'

const PLAYGROUND_DIR = fileURLToPath(new URL('..', import.meta.url))

let passed = 0
const failed = []

function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failed.push(name)
    console.log(`  ✗ ${name}\n      ${error.message.split('\n')[0]}`)
  }
}

function throws(name, fn, pattern) {
  check(name, () => {
    assert.throws(fn, pattern)
  })
}

function group(title) {
  console.log(`\n${title}`)
}

// Shape --------------------------------------------------------------------

group('defineProject — 补齐引擎默认值')

check('schemecolor 自动加在首位，没有 index，text 是本地化 key', () => {
  const project = defineProject({ file: 'index.html', title: 'x' })
  const scheme = project.general.properties.schemecolor
  assert.deepEqual(scheme, {
    order: 0,
    text: 'ui_browse_properties_scheme_color',
    type: 'color',
    value: '0 0 0',
  })
  assert.equal(Object.keys(project.general.properties)[0], 'schemecolor')
})

check('supportsaudioprocessing 嵌在 general 内，顶层没有', () => {
  const project = defineProject({ file: 'index.html', title: 'x' })
  assert.equal(project.general.supportsaudioprocessing, true)
  assert.equal('supportsaudioprocessing' in project, false)
})

check('type 默认 "Web"', () => {
  assert.equal(defineProject({ file: 'index.html', title: 'x' }).type, 'Web')
})

check('可选字段没写就不出现（而不是 null）', () => {
  const project = defineProject({ file: 'index.html', title: 'x' })
  for (const key of ['description', 'tags', 'preview', 'contentrating', 'visibility']) {
    assert.equal(key in project, false, `${key} 不该出现`)
  }
})

check('description 数组用空行连接，空段落被丢弃', () => {
  const project = defineProject({
    file: 'index.html',
    title: 'x',
    description: ['  第一段  ', '', '第二段'],
  })
  assert.equal(project.description, '第一段\n\n第二段')
})

check('file / title 会 trim', () => {
  const project = defineProject({ file: '  index.html ', title: ' 标题 ' })
  assert.equal(project.file, 'index.html')
  assert.equal(project.title, '标题')
})

// Properties ---------------------------------------------------------------

group('属性构造器 — 量纲与编号')

check('color 把 #rrggbb 转成 0..255 三元组', () => {
  const spec = color({ text: '强调色', value: '#a8c4ff' })
  assert.equal(spec.value, '168 196 255')
  assert.equal(spec.type, 'color')
})

check('color 也接受已是三元组的写法', () => {
  assert.equal(color({ value: '168 196 255' }).value, '168 196 255')
})

check('index 从 0、order 从 100 按声明顺序递增', () => {
  const project = defineProject({
    file: 'index.html',
    title: 'x',
    properties: {
      a: bool({ text: 'A' }),
      b: slider({ text: 'B', value: 1, min: 0, max: 2 }),
      c: text({ text: 'C' }),
    },
  })
  const { a, b, c } = project.general.properties
  assert.deepEqual([a.index, a.order], [0, 100])
  assert.deepEqual([b.index, b.order], [1, 101])
  assert.deepEqual([c.index, c.order], [2, 102])
})

check('text 缺省取 key 名', () => {
  const project = defineProject({
    file: 'index.html',
    title: 'x',
    properties: { accent: color({}) },
  })
  assert.equal(project.general.properties.accent.text, 'accent')
})

check('fraction 的 slider 自动补 step / precision', () => {
  const spec = slider({ text: '倍率', value: 1, min: 0, max: 2, fraction: true })
  assert.equal(spec.fraction, true)
  assert.equal(spec.step, 0.01)
  assert.equal(spec.precision, 2)
})

check('非 fraction 的 slider 不带 step', () => {
  const spec = slider({ text: '倍率', value: 1, min: 0, max: 2 })
  assert.equal('step' in spec, false)
})

check('directory 默认 ondemand', () => {
  assert.equal(directory({ text: '目录' }).mode, 'ondemand')
})

check('combo 省略 value 时取第一个选项', () => {
  const spec = combo({ text: '锚点', options: ['a', 'b'] })
  assert.equal(spec.value, 'a')
  assert.deepEqual(spec.options, [
    { label: 'a', value: 'a' },
    { label: 'b', value: 'b' },
  ])
})

group('属性构造器 — 面板里的 HTML 与条件显示')

check('html 生成 type "text"，value 固定 false', () => {
  const spec = html({ text: '<h3>音频</h3>' })
  assert.equal(spec.type, 'text')
  assert.equal(spec.value, false)
  assert.equal(spec.text, '<h3>音频</h3>')
})

check('condition 原样落到 manifest 上', () => {
  const project = defineProject({
    file: 'index.html',
    title: 'x',
    properties: {
      showAudio: bool({ text: '启用音频' }),
      audioColor: color({ text: '音频色', value: '#ffffff', condition: 'showAudio.value == 1' }),
    },
  })
  assert.equal(
    project.general.properties.audioColor.condition,
    'showAudio.value == 1',
  )
})

check('combo 的 condition 可以用字符串值', () => {
  const project = defineProject({
    file: 'index.html',
    title: 'x',
    properties: {
      mode: combo({ text: '模式', options: ['grid', 'list'] }),
      gap: slider({ text: '间距', min: 0, max: 1, condition: "mode.value == 'list'" }),
    },
  })
  assert.equal(project.general.properties.gap.condition, "mode.value == 'list'")
})

group('属性构造器 — 坏输入必须报错')

throws('缺 file', () => defineProject({ title: 'x' }), /file/)
throws('缺 title', () => defineProject({ file: 'index.html' }), /title/)
throws('颜色写成 red', () => color({ value: 'red' }), /rrggbb/)
throws('颜色分量越界', () => color({ value: '300 0 0' }), /0\.\.255/)
throws('combo 的 value 不在选项里', () => combo({ options: ['a'], value: 'z' }), /不在 options/)
throws('combo 没有选项', () => combo({ options: [] }), /至少一个 option/)
throws('slider 越界', () => slider({ min: 0, max: 2, value: 3 }), /0\.\.2/)
throws('slider 的 min >= max', () => slider({ min: 2, max: 2 }), /min < max/)
throws('bool 收到字符串', () => bool({ value: 'true' }), /true \/ false/)
throws(
  '属性缺 value',
  () => defineProject({ file: 'i.html', title: 'x', properties: { k: { type: 'color' } } }),
  /缺少 value/,
)
throws(
  '属性 type 引擎不认识',
  () => defineProject({ file: 'i.html', title: 'x', properties: { k: { type: 'nope', value: 1 } } }),
  /不是引擎支持的类型/,
)
throws('html 的 value 不是 false', () => html({ value: 1 }), /固定为 false/)
throws(
  'condition 写成自由表达式',
  () =>
    defineProject({
      file: 'i.html',
      title: 'x',
      properties: { a: bool({}), b: bool({ condition: 'a == true' }) },
    }),
  /condition 必须是/,
)
throws(
  'condition 引用未声明的 key',
  () =>
    defineProject({
      file: 'i.html',
      title: 'x',
      properties: { a: bool({ condition: 'nope.value == 1' }) },
    }),
  /未声明的属性 "nope"/,
)

// Merge --------------------------------------------------------------------

group('mergeProject — 合并而不是覆盖')

const ENGINE_FILE = {
  workshopid: '12345678',
  version: 0,
  snapshotformat: 1,
  snapshotoverlay: '',
  preview: 'preview.jpg',
  contentrating: 'Questionable',
  visibility: 'private',
  title: '旧标题',
  type: 'web',
  general: {
    properties: {
      schemecolor: { order: 0, text: 'schemecolor', type: 'color', value: '0 0 0' },
      editorAdded: { order: 200, text: '编辑器加的', type: 'bool', value: true },
    },
    supportsaudioprocessing: true,
  },
}

const GENERATED = defineProject({
  file: 'index.html',
  title: '新标题',
  properties: { accent: color({ text: '强调色', value: '#ff8800' }) },
})

check('引擎自有字段全部保留', () => {
  const merged = mergeProject(ENGINE_FILE, GENERATED)
  for (const key of ENGINE_OWNED) {
    assert.equal(merged[key], ENGINE_FILE[key], `${key} 丢了`)
  }
})

check('配置没写的顶层键保留（preview / contentrating / visibility）', () => {
  const merged = mergeProject(ENGINE_FILE, GENERATED)
  assert.equal(merged.preview, 'preview.jpg')
  assert.equal(merged.contentrating, 'Questionable')
  assert.equal(merged.visibility, 'private')
})

check('配置写了的键被覆盖', () => {
  const merged = mergeProject(ENGINE_FILE, GENERATED)
  assert.equal(merged.title, '新标题')
  assert.equal(merged.type, 'Web')
  assert.equal(merged.file, 'index.html')
})

check('编辑器手加的属性默认保留', () => {
  const merged = mergeProject(ENGINE_FILE, GENERATED)
  assert.equal('editorAdded' in merged.general.properties, true)
  assert.equal('accent' in merged.general.properties, true)
})

check('prune 删掉未声明属性，但仍保住 workshopid', () => {
  const merged = mergeProject(ENGINE_FILE, GENERATED, { prune: true })
  assert.equal('editorAdded' in merged.general.properties, false)
  assert.equal(merged.workshopid, '12345678')
})

check('没有原文件时直接可用', () => {
  const merged = mergeProject(null, GENERATED)
  assert.equal(merged.file, 'index.html')
  assert.equal(merged.general.supportsaudioprocessing, true)
})

// Diff ---------------------------------------------------------------------

group('diffProject — 只算真实漂移')

check('完全一致时没有差异', () => {
  const merged = mergeProject(ENGINE_FILE, GENERATED)
  assert.deepEqual(diffProject(merged, merged), { mismatches: [], extra: [] })
})

check('type 大小写不算漂移', () => {
  const { mismatches } = diffProject(defineProject({ file: 'a.html', title: 'x' }), {
    file: 'a.html',
    title: 'x',
    general: { properties: { schemecolor: { order: 0, text: 'schemecolor', type: 'color', value: '0 0 0' } }, supportsaudioprocessing: true },
    type: 'web',
  })
  assert.equal(mismatches.some((m) => m.path === 'type'), false)
})

check('漏写的字段报成 mismatch', () => {
  const { mismatches } = diffProject(
    defineProject({ file: 'a.html', title: '新' }),
    { file: 'a.html', title: '旧', general: { properties: {}, supportsaudioprocessing: true } },
  )
  const paths = mismatches.map((m) => m.path)
  assert.ok(paths.includes('title'))
  assert.ok(paths.includes('general.properties.schemecolor.order'))
})

check('文件里多出来的属性进 extra，不算 mismatch', () => {
  const { mismatches, extra } = diffProject(GENERATED, ENGINE_FILE)
  assert.ok(extra.includes('editorAdded'))
  assert.equal(mismatches.some((m) => m.path.includes('editorAdded')), false)
})

// Serialization ------------------------------------------------------------

group('stringifyProject — 文件格式')

check('顶层键按字母序，结尾有换行', () => {
  const output = stringifyProject(defineProject({ file: 'a.html', title: 'x' }))
  assert.ok(output.endsWith('}\n'))
  const keys = Object.keys(JSON.parse(output))
  assert.deepEqual(keys, [...keys].sort())
})

check('能原样解析回来', () => {
  const project = defineProject({ file: 'a.html', title: 'x', description: ['甲', '乙'] })
  assert.deepEqual(JSON.parse(stringifyProject(project)), project)
})

// Against the real file ----------------------------------------------------

group('与仓库内现有文件对照')

const existingPath = path.join(PLAYGROUND_DIR, 'public', 'project.json')
const configPath = path.join(PLAYGROUND_DIR, 'project.config.js')

const existing = JSON.parse(await readFile(existingPath, 'utf8'))
const config = (await import(pathToFileURL(configPath).href)).default
const generated = defineProject(config)

check('playground 配置与 public/project.json 语义一致', () => {
  const { mismatches } = diffProject(generated, existing)
  assert.deepEqual(mismatches.map((m) => m.path), [])
})

// Script-level behaviour ---------------------------------------------------

group('gen-project.mjs — 写入与 --check')

const { spawn } = await import('node:child_process')

function run(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/gen-project.mjs', ...args], { cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

const scratch = await mkdtemp(path.join(tmpdir(), 'wallkit-project-'))

try {
  const target = path.join(scratch, 'project.json')

  const created = await run(['--target', target], PLAYGROUND_DIR)
  check('目标不存在时创建（退出码 0）', () => {
    assert.equal(created.code, 0)
    assert.match(created.stdout, /已创建/)
  })

  const inSync = await run(['--check', '--target', target], PLAYGROUND_DIR)
  check('刚写完 --check 通过', () => {
    assert.equal(inSync.code, 0)
    assert.match(inSync.stdout, /已同步/)
  })

  // Simulate the editor: different title, an extra property, engine fields.
  const drifted = JSON.parse(await readFile(target, 'utf8'))
  drifted.title = '编辑器改的标题'
  drifted.workshopid = '999'
  drifted.general.properties.editorAdded = { order: 300, text: '手加', type: 'bool', value: true }
  await writeFile(target, JSON.stringify(drifted, null, 2))

  const diffRun = await run(['--check', '--target', target], PLAYGROUND_DIR)
  check('漂移时 --check 退出码 1 并指名 title', () => {
    assert.equal(diffRun.code, 1)
    assert.match(diffRun.stdout, /title/)
    assert.match(diffRun.stdout, /editorAdded/)
  })

  const rewrite = await run(['--target', target], PLAYGROUND_DIR)
  const afterRewrite = JSON.parse(await readFile(target, 'utf8'))
  check('默认合并：title 被改回，editorAdded 与 workshopid 保留', () => {
    assert.equal(rewrite.code, 0)
    assert.equal(afterRewrite.title, generated.title)
    assert.equal('editorAdded' in afterRewrite.general.properties, true)
    assert.equal(afterRewrite.workshopid, '999')
  })

  await run(['--prune', '--target', target], PLAYGROUND_DIR)
  const afterPrune = JSON.parse(await readFile(target, 'utf8'))
  check('--prune 删掉 editorAdded，但 workshopid 仍在', () => {
    assert.equal('editorAdded' in afterPrune.general.properties, false)
    assert.equal(afterPrune.workshopid, '999')
  })

  await writeFile(target, '{ 坏 JSON ')
  const broken = await run(['--check', '--target', target], PLAYGROUND_DIR)
  const brokenContents = await readFile(target, 'utf8')
  check('文件不是合法 JSON 时报错且不覆盖', () => {
    assert.notEqual(broken.code, 0)
    assert.match(broken.stderr, /不是合法 JSON/)
    assert.equal(brokenContents, '{ 坏 JSON ')
  })
} finally {
  await rm(scratch, { recursive: true, force: true })
}

// Summary ------------------------------------------------------------------

console.log(`\n${failed.length === 0 ? '全部通过' : '有失败'}：${passed} 通过 / ${failed.length} 失败`)
if (failed.length) {
  for (const name of failed) console.log(`  - ${name}`)
  process.exitCode = 1
}
