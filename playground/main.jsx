import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Clock } from '../src/components/clock/index.js'
import { Spectrum, SPECTRUM_STYLES } from '../src/components/spectrum/index.js'
import { SPECTRUM_BARS, resampleBars } from '../src/core/index.js'
import '../src/styles/index.css'
import './playground.css'

// Synthetic spectrum for the demo only.
//
// The library never generates fake audio: it would hide the difference between
// real and simulated data, which is exactly the bug the "no synthetic fallback"
// rule exists to prevent. The playground needs *something* to draw in a browser
// (there is no system-audio tap), so the generator lives here and only here.
const DEMO_AUDIO_BANDS = 64

function syntheticSpectrum(timeSeconds, out, { beatsPerSecond = 2 } = {}) {
  const beat = (timeSeconds * beatsPerSecond) % 1
  const envelope = Math.exp(-beat * 5.5)
  const swell = 0.3 + 0.7 * envelope

  for (let i = 0; i < out.length; i += 1) {
    // Bass-heavy profile: low frequencies are loudest, tapering to the treble.
    const position = (i % DEMO_AUDIO_BANDS) / DEMO_AUDIO_BANDS
    const tilt = 1 - position * 0.62
    // Independent wobble per band so neighbours do not move in lockstep.
    const wobble =
      Math.sin(timeSeconds * 2.3 + i * 0.45) * 0.16 +
      Math.sin(timeSeconds * 5.7 + i * 1.31) * 0.1
    out[i] = Math.min(Math.max(swell * tilt + wobble * (0.35 + envelope), 0), 1)
  }

  return out
}

// The sidebar registry. Each entry mounts its own demo, so only the active
// component runs its timers and draw loops.
const COMPONENTS = [
  { id: 'clock', label: 'Clock', hint: '日期时间控件' },
  { id: 'spectrum', label: 'Spectrum', hint: '音频频谱控件' },
]

const PLACEMENTS = [
  { id: 'card', label: '竖排经典' },
  { id: 'bar', label: '单行经典' },
  { id: 'minimal', label: '极简数显' },
  { id: 'cyberpunk', label: '赛博朋克' },
  { id: 'infobar', label: '横向状态条' },
  { id: 'split', label: '双行分层' },
  { id: 'poster', label: '大字海报' },
  { id: 'ring', label: '环形进度' },
  { id: 'segments', label: '分段进度条' },
  { id: 'stamp', label: '纪元记录卡' },
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

function useBars(running, bpm) {
  const [bars, setBars] = useState(() => new Float32Array(SPECTRUM_BARS))

  useEffect(() => {
    if (!running) return undefined
    let frame = 0
    let last = 0
    const started = performance.now()
    const tick = (t) => {
      // The engine pushes ~30 frames a second; throttling keeps the demo's cost
      // in the same ballpark and stops the state churn from re-rendering faster
      // than the audio could ever change.
      if (t - last >= 33) {
        last = t
        const out = new Float32Array(SPECTRUM_BARS)
        syntheticSpectrum((t - started) / 1000, out, { beatsPerSecond: bpm / 60 })
        setBars(out)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, bpm])

  return bars
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

function ClockDemo() {
  const [running, setRunning] = useState(true)

  // Audio reactivity.
  const [beatOn, setBeatOn] = useState(false)
  const [beat, setBeat] = useState(0)
  const [beatIntensity, setBeatIntensity] = useState(100)
  const [beatCurve, setBeatCurve] = useState(0.62)
  // Tempo of the synthetic waveform. 120 BPM is a typical pop tempo.
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
    <>
      <header className="head">
        <h1>Clock</h1>
        <p className="hint">
          纯展示组件：时间、文案、节拍都由本页提供。<code>beat</code> 的合成数据只存在于本页——
          库本身不会生成假数据。点击任意时钟可切换 12/24 小时制（
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
    </>
  )
}

function SpectrumDemo() {
  // The demo sizes it down so a viewport-relative stage fits inside a gallery
  // cell; a wallpaper would pick whatever `size` suits its artwork.
  const [variant, setVariant] = useState('bars')
  const [colorHex, setColorHex] = useState('#a8c4ff')
  const [size, setSize] = useState(80)
  const [offsetX, setOffsetX] = useState(DEMO_OFFSET_X)
  const [offsetY, setOffsetY] = useState(DEMO_OFFSET_Y)
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)
  const [bpm, setBpm] = useState(120)
  const [intensity, setIntensity] = useState(100)
  const [curve, setCurve] = useState(1)
  // Bar count is a data-shaping choice, not a component prop: the demo folds the
  // 128 raw bars down with the core helper before handing them over.
  const [barCount, setBarCount] = useState(SPECTRUM_BARS)

  // Pausing the spectrum also stops the demo's data pump, mirroring a wallpaper
  // that stops producing bars while Wallpaper Engine has it paused.
  const rawBars = useBars(!paused, bpm)
  const bars = useMemo(() => resampleBars(rawBars, barCount) ?? rawBars, [rawBars, barCount])

  const shared = {
    bars,
    colorHex,
    size,
    offsetX,
    offsetY,
    visible,
    paused,
    intensity,
    curve,
  }

  return (
    <>
      <header className="head">
        <h1>Spectrum</h1>
        <p className="hint">
          纯展示组件：柱状数据由本页提供，<code>bars == null</code> 时不渲染。合成频谱只存在于本页——
          库本身不会生成假数据，也不会自己读取音频。<code>visible</code> 隐藏（不渲染 DOM），
          <code>paused</code> 冻结但仍在屏上。
        </p>
      </header>

      <section className="panel">
        <Row title="样式">
          <label className="ctl">
            <span className="ctl__label">
              样式 variant <b>{variant}</b>
            </span>
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              {SPECTRUM_STYLES.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="ctl">
            <span className="ctl__label">
              颜色 colorHex <b>{colorHex}</b>
            </span>
            <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} />
          </label>
        </Row>

        <Row title="响应">
          <Slider
            label="强度 intensity"
            value={intensity}
            min={0}
            max={1000}
            step={10}
            suffix="%"
            onChange={setIntensity}
          />
          <Slider
            label="曲线 curve"
            value={curve}
            min={0.2}
            max={2}
            step={0.02}
            onChange={setCurve}
          />
        </Row>

        <Row title="尺寸与位置">
          <Slider
            label="尺寸 size"
            value={size}
            min={20}
            max={200}
            step={5}
            suffix="%"
            onChange={setSize}
          />
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
        </Row>

        <Row title="数据">
          <Slider
            label="柱数 bars.length"
            value={barCount}
            min={8}
            max={SPECTRUM_BARS}
            step={8}
            onChange={setBarCount}
          />
          <Slider label="节奏 BPM" value={bpm} min={40} max={200} step={2} onChange={setBpm} />
        </Row>

        <Row title="运行">
          <Toggle label="显示 visible" on={visible} onChange={setVisible} />
          <Toggle label="暂停 paused" on={paused} onChange={setPaused} />
        </Row>
      </section>

      <section className="grid">
        {SPECTRUM_STYLES.map((id, i) => (
          <figure className="cell" key={id}>
            <div className={`stage stage--${i % 2 === 0 ? 'a' : 'b'}`}>
              <Spectrum {...shared} variant={id} />
            </div>
            <figcaption>spectrum · {id}</figcaption>
          </figure>
        ))}
      </section>

      <footer className="foot">
        库的默认值：<code>variant="bars"</code>、<code>colorHex</code> 省略时取
        <code>--wallkit-accent</code>、<code>size=100</code>（正常大小）、
        <code>offsetX=0, offsetY=0</code>（贴边）、<code>intensity=100</code>、<code>curve=1</code>、
        <code>paused=false</code>。本页初始的 4% 偏移与 80% 尺寸只为演示取景。
        柱数不是组件 prop：本页用 core 的 <code>resampleBars(bars, count)</code> 折叠后再传入。
      </footer>
    </>
  )
}

function App() {
  const [active, setActive] = useState('clock')

  return (
    <div className="page">
      <aside className="sidebar">
        <div className="sidebar__brand">WallKit</div>
        <nav className="sidebar__nav">
          {COMPONENTS.map((component) => (
            <button
              key={component.id}
              type="button"
              className={
                active === component.id
                  ? 'sidebar__item sidebar__item--active'
                  : 'sidebar__item'
              }
              aria-current={active === component.id ? 'page' : undefined}
              onClick={() => setActive(component.id)}
            >
              <span className="sidebar__label">{component.label}</span>
              <span className="sidebar__hint">{component.hint}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar__foot">
          <span>纯展示组件</span>
          <span>合成数据仅在本页</span>
        </div>
      </aside>

      <main className="content">
        {active === 'clock' ? <ClockDemo /> : <SpectrumDemo />}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
