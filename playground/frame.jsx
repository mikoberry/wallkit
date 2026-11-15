// Frame proof page.
//
// One full-screen stage, because a viewfinder is an overlay on the whole
// picture: gutters, line weight and readout positions can only be judged at
// wallpaper size. Keys switch the variant and every toggle:
//
//   ← →   variant        ↑ ↓   backdrop (and theme)
//   G     grid           T     tick ruler
//   R     record dot     C     timecode
//   Space paused         H     hint
//
// The timecode is advanced here, in the application, exactly as a wallpaper
// would: `Frame` takes a finished string and holds no timer of its own.

import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FRAME_VARIANTS, Frame, formatTimecode } from '../src/components/frame/index.js'
import '../src/styles/index.css'
import './frame.css'

const GRIDS = ['none', 'thirds', 'cross']

// Readouts that also exercise the slot rules: `tl` has to step down when the
// record dot is on, `br` has to step up when the timecode is on.
const LABELS = {
  tl: 'cam a',
  tr: '35mm · f2.0',
  bl: 'iso 800 · 1/50',
  br: '2026-11-15',
}

function cycle(list, current, step) {
  const index = list.indexOf(current)
  return list[(index + step + list.length) % list.length]
}

function FrameProof() {
  const [variant, setVariant] = useState(FRAME_VARIANTS[0])
  const [grid, setGrid] = useState('none')
  const [ticks, setTicks] = useState(true)
  const [rec, setRec] = useState(true)
  const [timecode, setTimecode] = useState(true)
  const [lightBackdrop, setLightBackdrop] = useState(false)
  const [paused, setPaused] = useState(false)
  const [hint, setHint] = useState(true)
  const [elapsed, setElapsed] = useState(0)

  // Application-owned clock: it stops with `paused`, which is what a frozen
  // wallpaper has to do.
  useEffect(() => {
    if (paused) return undefined
    const id = setInterval(() => setElapsed((value) => value + 0.25), 250)
    return () => clearInterval(id)
  }, [paused])

  useEffect(() => {
    const onKey = (event) => {
      switch (event.key) {
        case 'ArrowLeft':
          setVariant((current) => cycle(FRAME_VARIANTS, current, -1))
          break
        case 'ArrowRight':
          setVariant((current) => cycle(FRAME_VARIANTS, current, 1))
          break
        case 'ArrowUp':
        case 'ArrowDown':
          setLightBackdrop((value) => !value)
          break
        case 'g':
        case 'G':
          setGrid((current) => cycle(GRIDS, current, 1))
          break
        case 't':
        case 'T':
          setTicks((value) => !value)
          break
        case 'r':
        case 'R':
          setRec((value) => !value)
          break
        case 'c':
        case 'C':
          setTimecode((value) => !value)
          break
        case 'h':
        case 'H':
          setHint((value) => !value)
          break
        case ' ':
          event.preventDefault()
          setPaused((value) => !value)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={lightBackdrop ? 'fp-stage fp-stage--light' : 'fp-stage fp-stage--dark'}>
      <Frame
        variant={variant}
        // The theme names the ink, so a light backdrop needs the dark line.
        theme={lightBackdrop ? 'dark' : 'light'}
        grid={grid}
        ticks={ticks}
        rec={rec ? 'REC' : false}
        timecode={timecode ? formatTimecode(elapsed) : ''}
        labels={LABELS}
        paused={paused}
      />

      {hint ? (
        <div className="fp-hint">
          <b>{variant}</b> · grid {grid} · ticks {ticks ? 'on' : 'off'} · rec {rec ? 'on' : 'off'} ·{' '}
          {paused ? 'paused' : timecode ? formatTimecode(elapsed) : 'no tc'}
          <span className="fp-keys">← → 变体 · ↑ ↓ 背景 · G 网格 · T 刻度 · R 录制点 · C 时间码 · 空格 暂停 · H 提示</span>
        </div>
      ) : null}
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FrameProof />
  </StrictMode>,
)
