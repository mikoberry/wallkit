import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
// Vite bundles the config file before `resolve.alias` is in effect, so the
// plugin itself must come in through a relative path. Application code
// (wallpaper.jsx) uses the `wallkit/we` alias below instead.
import { wallkitWE } from '../src/we/vite-plugin.js'

// The playground imports the library straight from ../src so the demo always
// exercises the working tree, with no build step and no link round-trip.
// `base: './'` keeps the built demo portable, matching what a wallpaper needs.
export default defineConfig({
  // Pinned to this folder so index.html and the two testbed pages are served
  // from `playground/` regardless of the launching directory.
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Injects the WE listener bridges into every HTML entry here, including
  // wallpaper.html. The gallery and layout.html have no host callbacks, so the
  // scripts take their "host absent" branch and register nothing.
  plugins: [react(), wallkitWE()],
  base: './',
  // `public/` holds the Wallpaper Engine project.json, which belongs to the
  // wallpaper build only — the gallery build must not inherit it.
  publicDir: false,
  resolve: {
    alias: {
      // Exact entries must come first: Vite's alias matcher also treats
      // `wallkit` as a prefix of `wallkit/we`, so a broad entry first would
      // swallow these. `./we/vite` resolves to vite-plugin.js, not vite.js.
      'wallkit/we/vite': fileURLToPath(new URL('../src/we/vite-plugin.js', import.meta.url)),
      'wallkit/we': fileURLToPath(new URL('../src/we/index.js', import.meta.url)),
      wallkit: fileURLToPath(new URL('../src/index.js', import.meta.url)),
      'wallkit/': fileURLToPath(new URL('../src/', import.meta.url)),
    },
  },
  server: {
    port: 5174,
  },
})
