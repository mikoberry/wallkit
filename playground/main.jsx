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
const WEEKDAYS_BY_LOCALE = {
  'zh-CN': WEEKDAYS,
  'en-GB': ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  'en-US': ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  'ja-JP': ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
  'ko-KR': ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
}

// The clock anchors to the bottom-left of its positioning context, and the
// library's default offsets are 0 — meaning it sits flush against the edge.
// The demo nudges it in so the whole widget is visible instead of being
// clipped by the cell's rounded corners. This is demo framing, not a library
// default: a wallpaper picks whatever offset suits its artwork.
const DEMO_OFFSET_X = 4
const DEMO_OFFSET_Y = 4

// Horizontal layouts carry a long single line, so at the full 100% type scale
// they overflow a gallery cell even at a generous width. Real wallpapers give
// them a full viewport; the demo renders them a step smaller so the whole line
// stays visible. Everything else shows at the shipped size.
const WIDE_LAYOUTS = new Set(['infobar', 'bar'])
const WIDE_LAYOUT_SIZE = 55

function sizeFor(placement, size) {
  return WIDE_LAYOUTS.has(placement) ? Math.min(size, WIDE_LAYOUT_SIZE) : size
}

/**
 * The clock is a pure view, so the demo owns the tick exactly as a wallpaper
 * would. Pausing the demo stops the interval, which mirrors how a wallpaper
 * should stop polling while Wallpaper Engine has it paused.
 */
function useNow(running) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!running) return undefined
    // Updating immediately avoids showing a stale second after resuming.
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [running])

  return now
}

function labelsFor(now, locale) {
  return {
    locale,
    weekday: (WEEKDAYS_BY_LOCALE[locale] ?? WEEKDAYS)[now.getDay()],
    aria: '当前时间与日期',
  }
}

/**
 * One gallery cell. Every cell renders the same widget with the demo-wide
 * settings, so a difference between cells always comes from `placement` alone.
 */
function ClockCard({ placement, index, view }) {
  return (
    <figure className="cell">
      <div className={`stage stage--${index % 2 === 0 ? 'a' : 'b'}`}>
        <Clock
          now={view.now}
          placement={placement}
          theme={view.theme}
          use24Hour={view.use24Hour}
          size={sizeFor(placement, view.size)}
          offsetX={view.offsetX}
          offsetY={view.offsetY}
          beat={view.beat}
          beatIntensity={view.beatIntensity}
          beatCurve={view.beatCurve}
          tilt={view.tilt}
          visible={view.visible}
          labels={labelsFor(view.now, view.locale)}
          onToggleHourFormat={view.onToggleHourFormat}
        />
      </div>
      <figcaption>
        {placement}
        {WIDE_LAYOUTS.has(placement) ? ` · 尺寸封顶 ${WIDE_LAYOUT_SIZE}%` : ''}
      </figcaption>
    </figure>
  )
}

function Row({ title, children }) {
  return (
    <div className="row">
      <span className="row__title">{title}</span>
      <div className="row__items">{children}</div>
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, disabled, suffix = '', onChange }) {
  return (
    <label className={disabled ? 'ctl ctl--off' : 'ctl'}>
      <span className="ctl__label">
        {label} <b>{value}{suffix}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Toggle({ label, on, disabled, onChange }) {
  return (
    <button
      type="button"
      className={on ? 'ctl ctl--btn ctl--on' : 'ctl ctl--btn'}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      {label}: {on ? '开' : '关'}
    </button>
  )
}

function App() {
  const [running, setRunning] = useState(true)

  // Audio reactivity.
  const [beatOn, setBeatOn] = useState(false)
  const [beat, setBeat] = useState(0)
  const [beatIntensity, setBeatIntensity] = useState(100)
  const [beatCurve, setBeatCurve] = useState(0.62)
  // Tempo of the synthetic waveform. 120 BPM is a typical pop tempo; the
  // 2.6 s cycle the demo originally used worked out to roughly 46 BPM.
  const [bpm, setBpm] = useState(120)

  // Appearance.
  const [theme, setTheme] = useState('dark')
  const [use24Hour, setUse24Hour] = useState(true)
  const [size, setSize] = useState(100)
  const [locale, setLocale] = useState('zh-CN')
  const [visible, setVisible] = useState(true)

  // Placement.
  const [offsetX, setOffsetX] = useState(DEMO_OFFSET_X)
  const [offsetY, setOffsetY] = useState(DEMO_OFFSET_Y)

  // Pointer tilt: `tilt` takes false, true, or a settings object.
  const [tiltOn, setTiltOn] = useState(true)
  const [maxTilt, setMaxTilt] = useState(14)
  const [tiltSpeed, setTiltSpeed] = useState(8)

  const now = useNow(running)

  // A synthetic beat drives the audio-reactive path so the swell and glow can
  // be inspected without a Wallpaper Engine audio source. The library itself
  // never synthesises data: the demo does, and only here.
  //
  // The shape is a decaying envelope rather than a sine: real audio arrives as
  // distinct hits, and a sine reads as slow breathing even at a dance tempo.
  // `beatsPerBar` of 1 keeps it simple; the exponent controls how sharply each
  // hit decays.
  useEffect(() => {
    if (!beatOn) {
      setBeat(0)
      return undefined
    }
    let frame = 0
    const started = performance.now()
    const fullBeatMs = 60000 / bpm
    const tick = (t) => {
      const elapsed = t - started
      // Position within the current beat, 0..1.
      const phase = (elapsed % fullBeatMs) / fullBeatMs
      // Sharp attack, quick decay: full at the hit, near zero by the next one.
      setBeat(Math.pow(1 - phase, 2.5))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [beatOn, bpm])

  // Clicking a clock flips the hour format, exactly what a wallpaper would wire
  // its `onToggleHourFormat` callback to.
  const onToggleHourFormat = () => setUse24Hour((v) => !v)

  const view = useMemo(
    () => ({
      now,
      theme,
      use24Hour,
      size,
      offsetX,
      offsetY,
      beat,
      beatIntensity,
      beatCurve,
      tilt: tiltOn ? { maxTilt, speed: tiltSpeed } : false,
      visible,
      locale,
      onToggleHourFormat,
    }),
    [now, theme, use24Hour, size, offsetX, offsetY, beat, beatIntensity, beatCurve, tiltOn, maxTilt, tiltSpeed, visible, locale],
  )

  return (
    <div className="page">
      <header className="head">
        <h1>WallKit Playground</h1>
        <p className="hint">
          时钟是纯展示组件：时间、文案、节拍都由本页提供。<code>beat</code> 的合成数据只存在于
          本页——库本身不会生成假数据。点击任意时钟可切换 12/24 小时制（
          <code>onToggleHourFormat</code>）。
        </p>
      </header>

      <section className="panel">
        <Row title="运行">
          <Toggle label="时钟" on={running} onChange={setRunning} />
          <Toggle label="显示 visible" on={visible} onChange={setVisible} />
          <Toggle label="节拍 beat" on={beatOn} onChange={setBeatOn} />
          <Toggle label="倾斜 tilt" on={tiltOn} onChange={setTiltOn} />
        </Row>

        <Row title="布局">
          <label className="ctl">
            <span className="ctl__label">
              主题 theme <b>{theme}</b>
            </span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="dark">dark（深色文字）</option>
              <option value="light">light（浅色文字）</option>
            </select>
          </label>
          <label className="ctl">
            <span className="ctl__label">
              制式 use24Hour <b>{use24Hour ? '24h' : '12h'}</b>
            </span>
            <select
              value={use24Hour ? '24' : '12'}
              onChange={(e) => setUse24Hour(e.target.value === '24')}
            >
              <option value="24">24 小时</option>
              <option value="12">12 小时</option>
            </select>
          </label>
          <label className="ctl">
            <span className="ctl__label">
              语言 labels.locale <b>{locale}</b>
            </span>
            <select value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="zh-CN">zh-CN</option>
              <option value="en-GB">en-GB</option>
              <option value="en-US">en-US</option>
              <option value="ja-JP">ja-JP</option>
              <option value="ko-KR">ko-KR</option>
            </select>
          </label>
          <Slider
            label="尺寸 size"
            value={size}
            min={40}
            max={200}
            step={5}
            suffix="%"
            onChange={setSize}
          />
        </Row>

        <Row title="位置">
          <Slider
            label="水平 offsetX"
            value={offsetX}
            min={0}
            max={90}
            suffix="%"
            onChange={setOffsetX}
          />
          <Slider
            label="垂直 offsetY"
            value={offsetY}
            min={0}
            max={90}
            suffix="%"
            onChange={setOffsetY}
          />
          <button type="button" className="ctl ctl--btn" onClick={() => { setOffsetX(0); setOffsetY(0) }}>
            重置为库默认 0/0
          </button>
        </Row>

        <Row title="倾斜 tilt">
          <Slider
            label="最大倾角 maxTilt"
            value={maxTilt}
            min={0}
            max={45}
            suffix="°"
            disabled={!tiltOn}
            onChange={setMaxTilt}
          />
          <Slider
            label="跟手速度 speed"
            value={tiltSpeed}
            min={1}
            max={20}
            disabled={!tiltOn}
            onChange={setTiltSpeed}
          />
          <button
            type="button"
            className="ctl ctl--btn"
            onClick={() => {
              setMaxTilt(14)
              setTiltSpeed(8)
            }}
          >
            重置为 14° / 8
          </button>
        </Row>

        <Row title="音频 beat">
          <Slider
            label="节奏 BPM"
            value={bpm}
            min={40}
            max={200}
            step={2}
            disabled={!beatOn}
            onChange={setBpm}
          />
          <Slider
            label="响应强度 beatIntensity"
            value={beatIntensity}
            min={0}
            max={1000}
            step={10}
            suffix="%"
            disabled={!beatOn}
            onChange={setBeatIntensity}
          />
          <Slider
            label="响应曲线 beatCurve"
            value={beatCurve}
            min={0.2}
            max={2}
            step={0.02}
            disabled={!beatOn}
            onChange={setBeatCurve}
          />
          <span className="ctl ctl--note">
            当前 beat <b>{beat.toFixed(2)}</b>
          </span>
        </Row>
      </section>

      <section className="grid">
        {PLACEMENTS.map((p, i) => (
          <ClockCard key={p.id} placement={p.id} index={i} view={view} />
        ))}
      </section>

      <section className="grid grid--wide">
        <figure className="cell">
          <div className="stage stage--photo">
            <Clock
              now={now}
              placement="poster"
              theme={theme}
              use24Hour={use24Hour}
              size={size}
              offsetX={offsetX}
              offsetY={offsetY}
              beat={beat}
              beatIntensity={beatIntensity}
              beatCurve={beatCurve}
              tilt={tiltOn ? { maxTilt, speed: tiltSpeed } : false}
              visible={visible}
              labels={labelsFor(now, locale)}
              onToggleHourFormat={onToggleHourFormat}
            />
          </div>
          <figcaption>poster · 全尺寸 {size}%</figcaption>
        </figure>
        <figure className="cell">
          <div className="stage stage--dark">
            <Clock
              now={now}
              placement="card"
              theme={theme === 'dark' ? 'light' : 'dark'}
              use24Hour={use24Hour}
              size={size}
              offsetX={offsetX}
              offsetY={offsetY}
              beat={beat}
              beatIntensity={beatIntensity}
              beatCurve={beatCurve}
              tilt={tiltOn ? { maxTilt, speed: tiltSpeed } : false}
              visible={visible}
              labels={labelsFor(now, locale)}
              onToggleHourFormat={onToggleHourFormat}
            />
          </div>
          <figcaption>card · 反转主题</figcaption>
        </figure>
      </section>

      <footer className="foot">
        库的默认值：<code>offsetX=0, offsetY=0</code>（贴边）、
        <code>tilt=true</code>（14° / 8）、<code>size=100</code>、
        <code>theme="dark"</code>、<code>use24Hour=true</code>。本页初始的 4% 偏移只为留出边距。
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
