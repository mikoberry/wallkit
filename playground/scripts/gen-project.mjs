// Generates `public/project.json` from `project.config.js`.
//
// The engine rewrites this file whenever you change project settings (it adds
// `preview`, `version`, `snapshotformat`, and `workshopid` once published), so
// this is a deliberate, manual step — not a build hook. Writing on every build
// would fight the editor and, on a published wallpaper, risk detaching the
// Workshop item.
//
//   npm run gen:project                write public/project.json
//   npm run check:project              report drift only; exits 1 when out of date
//   npm run gen:project -- --prune     also drop properties the config no longer declares
//   npm run gen:project -- --config x  use another config file
//   npm run gen:project -- --target y  write somewhere else
//
// Reading is safe in every mode. `--check` never writes, which is what you want
// before committing or before a release build.

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { defineProject, mergeProject, diffProject, stringifyProject } from '../../src/project/index.js'

const PLAYGROUND_DIR = fileURLToPath(new URL('..', import.meta.url))

function printUsage() {
  console.log(
    [
      '用法：node scripts/gen-project.mjs [选项]',
      '',
      '  --check          只报告差异，不写文件（不一致时退出码 1）',
      '  --prune          同时删除配置里未声明的属性（默认保留）',
      '  --config <path>  配置文件的路径（默认 playground/project.config.js）',
      '  --target <path>  输出路径（默认 playground/public/project.json）',
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const options = { check: false, prune: false, config: null, target: null }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--check') options.check = true
    else if (arg === '--prune') options.prune = true
    else if (arg === '--config') options.config = argv[++i]
    else if (arg === '--target') options.target = argv[++i]
    else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }

  return options
}

// A missing file is normal (first run). A malformed one is not: it means
// something else wrote it, and silently overwriting that would hide the problem.
async function readExisting(file) {
  if (!existsSync(file)) return null

  const raw = await readFile(file, 'utf8')
  if (raw.trim() === '') return null

  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`${file} 不是合法 JSON，先备份再修：${error.message}`)
  }
}

function formatValue(value) {
  if (value === undefined) return '（无）'
  const text = JSON.stringify(value)
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const configPath = path.resolve(options.config || path.join(PLAYGROUND_DIR, 'project.config.js'))
  const targetPath = path.resolve(
    options.target || path.join(PLAYGROUND_DIR, 'public', 'project.json'),
  )

  const loaded = await import(pathToFileURL(configPath).href)
  const generated = defineProject(loaded.default)
  const existing = await readExisting(targetPath)
  const merged = mergeProject(existing, generated, { prune: options.prune })

  const propertyCount = Object.keys(merged.general?.properties || {}).length
  const summary = `${propertyCount} 个属性（含 schemecolor），入口 ${merged.file}`

  if (options.check) {
    // Compared against the generated manifest, not the merged one: that is what
    // tells "the config disagrees with the file" apart from "the file holds
    // something the config never mentions". Only the first is drift.
    const { mismatches, extra } = diffProject(generated, existing)
    const blocking = mismatches.length > 0 || (options.prune && extra.length > 0)

    if (!blocking) {
      console.log(`已同步：${summary}`)
      for (const key of extra) {
        console.log(`  · general.properties.${key} 未在配置中声明（保留）`)
      }
      return
    }

    console.log(`与配置不一致：${path.relative(process.cwd(), targetPath)}`)

    for (const item of mismatches) {
      console.log(`  改 ${item.path}: ${formatValue(item.actual)} → ${formatValue(item.expected)}`)
    }
    for (const key of extra) {
      console.log(`  删 general.properties.${key}（配置里没有，--prune 才会删）`)
    }

    console.log('\n运行 npm run gen:project 写入。')
    process.exitCode = 1
    return
  }

  await writeFile(targetPath, stringifyProject(merged), 'utf8')

  const { extra } = diffProject(generated, existing)
  console.log(`${existing ? '已更新' : '已创建'}：${path.relative(process.cwd(), targetPath)}`)
  console.log(summary)

  if (extra.length && !options.prune) {
    console.log(
      `\n保留未声明的属性：${extra.join(', ')}（要删掉就加 --prune）`,
    )
  }
  console.log('在 WE 里重新应用一次壁纸即可看到改动。')
}

main().catch((error) => {
  console.error(String(error?.message || error))
  process.exitCode = 1
})
