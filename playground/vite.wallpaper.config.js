import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
// Config files are bundled before `resolve.alias` applies — see vite.config.js.
import { wallkitWE } from '../src/we/vite-plugin.js'

// Build config for the Wallpaper Engine test page.
//
// Kept separate from `vite.config.js` because the two have different outputs:
// the playground is a dev gallery (`index.html`), while this builds exactly one
// page plus the `project.json` Wallpaper Engine needs, into a folder you can
// point the engine at directly.
//
//   npm run build:wallpaper   →  playground/dist-wallpaper/
//   npm run deploy:wallpaper  →  the same build, then copied into the WE project
//
// The output deliberately stays local instead of pointing at the Wallpaper
// Engine folder: the engine writes `preview.gif` and rewrites `project.json`
// there, and `emptyOutDir` would delete both. `scripts/deploy-wallpaper.mjs`
// does the copy and leaves those two alone.
//
// In development you do not need this file: `npm run dev` already serves
// `playground/wallpaper.html` at http://localhost:5174/wallpaper.html.
export default defineConfig({
  // Pinned to this folder so `outDir` and `publicDir` below resolve to
  // `playground/…` no matter which directory the build is launched from.
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Same plugin as vite.config.js: dev preview and the built wallpaper must go
  // through the identical injection path.
  plugins: [react(), wallkitWE()],
  // Relative asset paths so the folder works no matter how the host serves it.
  base: './',
  publicDir: 'public',
  resolve: {
    alias: {
      // Exact entries first — see vite.config.js for why.
      'wallkit/we/vite': fileURLToPath(new URL('../src/we/vite-plugin.js', import.meta.url)),
      'wallkit/we': fileURLToPath(new URL('../src/we/index.js', import.meta.url)),
      wallkit: fileURLToPath(new URL('../src/index.js', import.meta.url)),
      'wallkit/': fileURLToPath(new URL('../src/', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-wallpaper',
    emptyOutDir: true,
    // Wallpaper Engine's embedded Chromium lags stable Chrome, so downleveling
    // to ES2019 costs nothing here and removes a whole class of "blank page"
    // failures. The library uses optional chaining, which esbuild lowers.
    target: 'es2019',
    rollupOptions: {
      // Two pages, one build: the cycling testbed and the geometry proof. Both
      // land in `dist-wallpaper/`, so `deploy:wallpaper` copies them together
      // and Wallpaper Engine can show either by pointing `project.json` → "file"
      // at `wallpaper.html` or `layout.html`.
      input: {
        wallpaper: fileURLToPath(new URL('./wallpaper.html', import.meta.url)),
        layout: fileURLToPath(new URL('./layout.html', import.meta.url)),
      },
    },
  },
})
