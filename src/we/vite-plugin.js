// Vite plugin that injects the Wallpaper Engine listener scripts — planned for P4.
//
// It will add the audio, media and pause bridges to <head> ahead of Vite's
// module script, which is the timing the engine requires. Until then, paste
// the scripts documented in docs/we-integration.md manually.

/**
 * @param {{ audio?: boolean, media?: boolean, pause?: boolean }} [options]
 * @returns {import('vite').Plugin}
 */
export function wallkitWE(options = {}) {
  void options
  return {
    name: 'wallkit-we',
  }
}
