// Layout proof page.
//
// Three compositions that the earlier 4-corner / percentage-offset model could
// not express, rendered together so the geometry can be judged in one look:
//
//   1. a spectrum spanning the bottom edge at a fixed thickness,
//   2. a clock at the top-left with a fixed 100px gutter,
//   3. a vinyl record and a ring spectrum sharing one exact centre.
//
// Data is synthetic on purpose (this is the playground): the page is about
// placement, and it has to render identically in a browser and in Wallpaper
// Engine. Press G to hide the guides, R to reload.

import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Clock } from '../src/components/clock/index.js'
import { Spectrum } from '../src/components/spectrum/index.js'
import { AlbumArt } from '../src/components/album-art/index.js'
import '../src/styles/index.css'
import './layout.css'

// Static sample levels. A moving spectrum would distract from the edges and
// the centre, which are the only things this page exists to show.
const BARS = Array.from({ length: 48 }, (_, index) => {
  const wave = Math.sin(index * 0.42) * 0.5 + 0.5
  return 0.18 + wave * 0.72
})

const TRACK = {
  title: 'Layout Proof',
  artist: 'wallkit',
  albumTitle: '',
  // No thumbnail: the card's own dashed placeholder is clearer for judging the
  // size and the centre than artwork would be.
  thumbnail: '',
  primaryColor: '#5a82dc',
  textColor: '',
  playback: 'playing',
}

// The shared centre used by scene 3: `center` anchor, 30% of the viewport to
// the left of the middle. Both widgets take the same anchor and the same
// offset, so their centres coincide no matter how differently they are sized.
const CENTRE_OFFSET_X = -30
const CENTRE_LEFT = `${50 + CENTRE_OFFSET_X}%`

function useTickingClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function Guides() {
  return (
    <div className="lp-guides" aria-hidden="true">
      {/* Scene 2: the fixed 100px gutter, drawn as a square from the corner. */}
      <div className="lp-gutter" style={{ width: '100px', height: '100px' }} />
      {/* Scene 3: the shared vertical axis and the viewport's mid line. */}
      <div className="lp-line lp-line--v" style={{ left: CENTRE_LEFT }} />
      <div className="lp-line lp-line--h" style={{ top: '50%' }} />
      <div className="lp-dot" style={{ left: CENTRE_LEFT, top: '50%' }} />
    </div>
  )
}

function LayoutProof() {
  const now = useTickingClock()
  const [guides, setGuides] = useState(true)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'g' || event.key === 'G') setGuides((value) => !value)
      if (event.key === 'r' || event.key === 'R') window.location.reload()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="lp-stage">
      {guides && <Guides />}

      {/* 1 · bottom edge, full width, fixed thickness. */}
      <Spectrum
        bars={BARS}
        variant="bars"
        anchor="bottom-center"
        width="100vw"
        height="14vh"
        colorHex="#5a82dc"
      />

      {/* 2 · top-left, 100px in from both edges. */}
      <Clock
        now={now}
        placement="bar"
        theme="light"
        anchor="top-left"
        offsetX="100px"
        offsetY="100px"
        labels={{ locale: 'zh-CN', aria: '当前时间' }}
      />

      {/* 3 · one shared centre: record 34vh across, ring 46vh, so the bars
          radiate out past the record's rim instead of hiding behind it. */}
      <AlbumArt
        track={TRACK}
        variant="vinyl"
        theme="light"
        anchor="center"
        offsetX={CENTRE_OFFSET_X}
        size="34vh"
        labels={{ aria: '正在播放' }}
      />
      <Spectrum
        bars={BARS}
        variant="ring"
        anchor="center"
        offsetX={CENTRE_OFFSET_X}
        width="46vh"
        height="46vh"
        colorHex="#8fb4ff"
      />

      <div className="lp-caption lp-caption--bottom">
        1 · anchor="bottom-center" width="100vw" height="14vh"
      </div>
      <div className="lp-caption lp-caption--top">
        2 · anchor="top-left" offsetX/Y="100px"
      </div>
      <div className="lp-caption lp-caption--centre">
        3 · anchor="center" offsetX={-30} size="34vh" / "46vh"
      </div>
      <div className="lp-hint">G 显隐参考线 · R 重载</div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LayoutProof />
  </StrictMode>,
)
