// Pause state hook for the Wallpaper Engine bridge.
//
// The <head> pause bridge owns window.__wallkitPaused and dispatches
// 'wallkit-pause-change'. This hook only subscribes; it never decides what
// "paused" means. Clock has no `paused` prop — stopping its `now` is the pause.

import { useEffect, useState } from 'react'

/**
 * @returns {boolean} Whether the engine currently has the wallpaper paused.
 */
export function useWallpaperPaused() {
  const [paused, setPaused] = useState(() =>
    typeof window !== 'undefined' && window.__wallkitPaused === true,
  )

  useEffect(() => {
    const onChange = (event) => setPaused(event.detail === true)
    window.addEventListener('wallkit-pause-change', onChange)
    return () => window.removeEventListener('wallkit-pause-change', onChange)
  }, [])

  return paused
}
