import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// The playground imports the library straight from ../src so the demo always
// exercises the working tree, with no build step and no link round-trip.
// `base: './'` keeps the built demo portable, matching what a wallpaper needs.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      wallkit: fileURLToPath(new URL('../src/index.js', import.meta.url)),
      'wallkit/': fileURLToPath(new URL('../src/', import.meta.url)),
    },
  },
  server: {
    port: 5174,
  },
})
