import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Clock } from '../src/components/clock/index.js'
import '../src/styles/index.css'
import './playground.css'

const PLACEMENTS = [
  { id: 'card', label: '竖排经典' },
  { id: 'bar', label: '单行经典' },
  { id: 'minimal', label: '极简数显' },
  { id: 'cyberpunk', label: '赛博朋克' },
  { id: 'infobar', label: '横向状态条' },
  { id: 'split', label: '双行分层' },
  { id: 'poster', label: '大字海报' },
]

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// The clock anchors to the bottom-left of its positioning context, and the
// library's default offsets are 0 — meaning it sits flush against the edge.
// The demo nudges it in so the whole widget is visible instead of being
// clipped by the cell's rounded corners. This is demo framing, not a library
// default: a wallpaper picks whatever offset suits its artwork.
const DEMO_OFFSET_X = 4
const DEMO_OFFSET_Y = 4

/**
 * The clock is a pure view, so the demo owns the tick exactly as a wallpaper
 * would. Pausing the demo stops the interval, which mirrors how a wallpaper
 * should stop polling while Wallpaper Engine has it paused.
 */
function useNow(running) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [running])

  return now
}

function labelsFor(now, locale) {
  return {
    locale,
    weekday: WEEKDAYS[now.getDay()],
    aria: '当前时间与日期',
  }
}

// Horizontal layouts carry a long single line, so at the full 100% type scale
// they overflow a gallery cell even at a generous width. Real wallpapers give
// them a full viewport; the demo renders them a step smaller so the whole line
// stays visible. Everything else shows at the shipped size.
const WIDE_LAYOUTS = new Set(['infobar', 'bar'])
const WIDE_LAYOUT_SIZE = 55

function sizeFor(placement, size) {
  return WIDE_LAYOUTS.has(placement) ? Math.min(size, WIDE_LAYOUT_SIZE) : size
}

function ClockCard({ placement, title, it, beat, theme = 'dark', size = 100, tilt }) {
  return (
    <figure className="cell">
      <div className={`stage stage--${title % 2 === 0 ? 'a' : 'b'}`}>
        <Clock
          now={it.now}
          placement={placement}
          theme={theme}
          size={sizeFor(placement, size)}
          beat={beat}
          tilt={tilt}
          offsetX={DEMO_OFFSET_X}
          offsetY={DEMO_OFFSET_Y}
          labels={labelsFor(it.now, 'zh-CN')}
        />
      </div>
      <figcaption>{placement}</figcaption>
    </figure>
  )
}

function App() {
  const [running, setRunning] = useState(true)
  const [beatOn, setBeatOn] = useState(false)
  const [beat, setBeat] = useState(0)
  const [theme, setTheme] = useState('dark')
  const [tiltOn, setTiltOn] = useState(true)
  // Start from the library defaults so the first render matches a bare <Clock />.
  const [maxTilt, setMaxTilt] = useState(14)
  const [tiltSpeed, setTiltSpeed] = useState(8)
  // 100% is the real wallpaper default. The cell is sized large enough to hold
  // the full type scale at that setting, so the demo shows the widget as it
  // actually ships rather than a shrunken approximation.
  const [size, setSize] = useState(100)
  const now = useNow(running)

  // A synthetic beat drives the audio-reactive path so the swell and glow can
  // be inspected without a Wallpaper Engine audio source. The library itself
  // never synthesises data: the demo does, and only here.
  useEffect(() => {
    if (!beatOn) {
      setBeat(0)
      return undefined
    }
    let frame = 0
    const started = performance.now()
    const tick = (t) => {
      const elapsed = (t - started) / 1000
      const wobble = 0.5 + 0.5 * Math.sin(elapsed * 2.4)
      const pulse = Math.pow(wobble, 2)
      setBeat(pulse)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [beatOn])

  const it = useMemo(() => ({ now }), [now])

  // `tilt` accepts false, true, or a settings object. The demo passes the
  // object form so both dials can be felt; the library defaults to 14° / 8.
  const tilt = tiltOn ? { maxTilt, speed: tiltSpeed } : false

  return (
    <div className="page">
      <header className="bar">
        <h1>WallKit Playground</h1>
        <div className="controls">
          <button type="button" onClick={() => setRunning((v) => !v)}>
            {running ? '暂停时钟' : '继续时钟'}
          </button>
          <button type="button" onClick={() => setBeatOn((v) => !v)}>
            {beatOn ? '关闭节拍' : '模拟节拍'}
          </button>
          <button type="button" onClick={() => setTiltOn((v) => !v)}>
            {tiltOn ? '关闭倾斜' : '开启倾斜'}
          </button>
          <label>
            主题
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="dark">dark</option>
              <option value="light">light</option>
            </select>
          </label>
          <label>
            尺寸 {size}%
            <input
              type="range"
              min="40"
              max="200"
              step="10"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </label>
          <label title="鼠标移到窗口边缘时的最大倾斜角度">
            最大倾角 {maxTilt}°
            <input
              type="range"
              min="0"
              max="45"
              step="1"
              value={maxTilt}
              disabled={!tiltOn}
              onChange={(e) => setMaxTilt(Number(e.target.value))}
            />
          </label>
          <label title="越大越跟手，越小越柔和">
            跟手速度 {tiltSpeed}
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={tiltSpeed}
              disabled={!tiltOn}
              onChange={(e) => setTiltSpeed(Number(e.target.value))}
            />
          </label>
        </div>
      </header>

      <p className="hint">
        时钟是纯展示组件：时间由本页驱动，指针倾斜跟随鼠标。节拍数据由本页合成——库本身不会
        生成假数据。每格背景左右交替，用来检查深浅两种壁纸底下的可读性。
        倾斜可在右上角调整：<code>maxTilt</code> 是窗口边缘处的最大角度，
        <code>speed</code> 是跟手快慢（库默认 14° / 8）。
      </p>

      <section className="grid">
        {PLACEMENTS.map((p, i) => (
          <ClockCard
            key={p.id}
            placement={p.id}
            title={i}
            it={it}
            beat={beat}
            theme={theme}
            size={size}
            tilt={tilt}
          />
        ))}
      </section>

      <section className="grid grid--wide">
        <figure className="cell">
          <div className="stage stage--photo">
            <Clock
              now={now}
              placement="poster"
              theme={theme}
              size={size}
              beat={beat}
              tilt={tilt}
              offsetX={DEMO_OFFSET_X}
              offsetY={DEMO_OFFSET_Y}
              labels={labelsFor(now, 'zh-CN')}
            />
          </div>
          <figcaption>poster · 大尺寸（{size}%）</figcaption>
        </figure>
        <figure className="cell">
          <div className="stage stage--dark">
            <Clock
              now={now}
              placement="card"
              theme={theme === 'dark' ? 'light' : 'dark'}
              use24Hour={false}
              size={size}
              beat={beat}
              tilt={tilt}
              offsetX={DEMO_OFFSET_X}
              offsetY={DEMO_OFFSET_Y}
              labels={labelsFor(now, 'zh-CN')}
            />
          </div>
          <figcaption>card · 12 小时制 · 反转主题</figcaption>
        </figure>
      </section>

      <footer className="foot">
        <span>
          时钟锚定在定位容器的左下角。库的默认偏移是{' '}
          <code>offsetX=0, offsetY=0</code>（紧贴边缘），本页统一传{' '}
          <code>offsetX={DEMO_OFFSET_X}, offsetY={DEMO_OFFSET_Y}</code> 留出边距，方便完整查看。
        </span>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
