// Copies `dist-wallpaper/` into a Wallpaper Engine project folder after a build.
//
// Why not just point Vite's `outDir` at the WE folder?
//
// The engine owns files in that folder that the build knows nothing about:
// `preview.gif`, a rewritten `project.json` (the editor adds `preview`,
// `snapshotformat`, `version` and lowercases `type`). Running Vite there with
// `emptyOutDir` would eat the preview and reset the metadata the editor wrote.
//
// So: the build stays local and disposable, and this script only pushes the
// files the build actually produced. `project.json` is written once, when the
// target does not have one yet.
//
//   npm run deploy:wallpaper    (build + copy)
//   node scripts/deploy-wallpaper.mjs          (copy only)
//   WE_PROJECT_DIR=/somewhere node ...         (override the target)

import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLAYGROUND_DIR = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_DIR = path.join(PLAYGROUND_DIR, 'dist-wallpaper')

const DEFAULT_TARGET =
  'F:\\SteamLibrary\\steamapps\\common\\wallpaper_engine\\projects\\myprojects\\wallpaper'
const TARGET_DIR = path.resolve(process.env.WE_PROJECT_DIR || DEFAULT_TARGET)

// Files the engine may rewrite. We create them only when missing, never
// overwrite: the editor's version is the authoritative one.
const ENGINE_OWNED = new Set(['project.json'])

// The Vite output folder. Everything inside is ours and is replaced wholesale,
// so a build does not leave stale content-hashed files behind.
const OWNED_DIRS = new Set(['assets'])

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
}

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    throw new Error(
      `找不到构建产物：${SOURCE_DIR}\n先运行 npm run build:wallpaper`,
    )
  }

  if (!existsSync(TARGET_DIR)) {
    await mkdir(TARGET_DIR, { recursive: true })
    console.log(`新建目标目录：${TARGET_DIR}`)
  } else {
    const info = await stat(TARGET_DIR)
    if (!info.isDirectory()) throw new Error(`目标不是文件夹：${TARGET_DIR}`)
  }

  const entries = await listFiles(SOURCE_DIR)
  const copied = []
  const skipped = []
  const created = []

  for (const entry of entries) {
    const from = path.join(SOURCE_DIR, entry.name)
    const to = path.join(TARGET_DIR, entry.name)

    if (entry.isDirectory()) {
      if (OWNED_DIRS.has(entry.name) && existsSync(to)) {
        await rm(to, { recursive: true, force: true })
      }
      await cp(from, to, { recursive: true })
      copied.push(`${entry.name}/`)
      continue
    }

    if (ENGINE_OWNED.has(entry.name) && existsSync(to)) {
      skipped.push(entry.name)
      continue
    }

    if (ENGINE_OWNED.has(entry.name)) created.push(entry.name)
    await cp(from, to)
    copied.push(entry.name)
  }

  console.log(`\n源：${SOURCE_DIR}`)
  console.log(`目标：${TARGET_DIR}`)
  console.log(`已复制：${copied.join(', ')}`)
  if (created.length) console.log(`首次写入：${created.join(', ')}`)
  if (skipped.length) {
    console.log(
      `保留目标版本：${skipped.join(', ')}（包含编辑器写入的 preview / 元数据）`,
    )
  }
  if (!existsSync(path.join(TARGET_DIR, 'project.json'))) {
    console.log(
      '\n注意：目标里没有 project.json，Wallpaper Engine 需要它才能识别这个项目。',
    )
  }
  console.log('\n在 WE 里重新应用一次壁纸即可看到改动。')
}

main().catch((error) => {
  const message = String(error?.message || error)
  // A running wallpaper holds the old assets open on Windows; that is a
  // "close it and retry" situation, not a bug in the script.
  if (/EBUSY|EPERM|EACCES/.test(message)) {
    console.error(
      `写入失败，文件被占用：\n${message}\n\n壁纸可能正在 WE 中运行，先切到别的壁纸或退出 WE 再重试。`,
    )
  } else {
    console.error(message)
  }
  process.exitCode = 1
})
