import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Clock } from '../src/components/clock/index.js'
import { Spectrum, SPECTRUM_STYLES } from '../src/components/spectrum/index.js'
import { MiniSpectrum } from '../src/components/mini-spectrum/index.js'
import { AlbumArt, ALBUM_ART_VARIANTS } from '../src/components/album-art/index.js'
import {
  PointerFx,
  POINTER_TRAIL_VARIANTS,
  POINTER_CLICK_VARIANTS,
} from '../src/components/pointer-fx/index.js'
import {
  AmbientFx,
  AMBIENT_VARIANTS,
  AMBIENT_SIZE_MIN,
  AMBIENT_SIZE_MAX,
  AMBIENT_DENSITY_MIN,
  AMBIENT_DENSITY_MAX,
  AMBIENT_INTENSITY_MIN,
  AMBIENT_INTENSITY_MAX,
  AMBIENT_SPEED_MIN,
  AMBIENT_SPEED_MAX,
  AMBIENT_SPEED_DEFAULT,
} from '../src/components/ambient-fx/index.js'
import {
  Spotlight,
  SPOTLIGHT_SIZE_MIN,
  SPOTLIGHT_SIZE_MAX,
  SPOTLIGHT_FEATHER_DEFAULT,
  SPOTLIGHT_DIM_DEFAULT,
  SPOTLIGHT_GLOW_DEFAULT,
  SPOTLIGHT_SMOOTHING_MAX,
  SPOTLIGHT_SMOOTHING_DEFAULT,
} from '../src/components/spotlight/index.js'
import {
  Frame,
  FRAME_VARIANTS,
  FRAME_INSET_MIN,
  FRAME_INSET_DEFAULT,
  FRAME_INSET_MAX,
  FRAME_THICKNESS_MIN,
  FRAME_THICKNESS_DEFAULT,
  FRAME_THICKNESS_MAX,
  FRAME_LENGTH_MIN,
  FRAME_LENGTH_DEFAULT,
  FRAME_LENGTH_MAX,
  FRAME_SIZE_MIN,
  FRAME_SIZE_MAX,
  formatTimecode,
} from '../src/components/frame/index.js'
import {
  LightFx,
  LIGHT_VARIANTS,
  LIGHT_ANCHOR_DEFAULT,
  LIGHT_PRESETS,
  LIGHT_FOLLOW_DEFAULT,
  LIGHT_INTENSITY_DEFAULT,
  LIGHT_INTENSITY_MAX,
  LIGHT_INTENSITY_MIN,
  LIGHT_FLARE_MIN,
  LIGHT_FLARE_MAX,
  LIGHT_SIZE_MIN,
  LIGHT_SIZE_MAX,
  LIGHT_SMOOTHING_DEFAULT,
  LIGHT_SMOOTHING_MAX,
  LIGHT_SWAY_DEFAULT,
  LIGHT_SWAY_MAX,
  LIGHT_SWAY_MIN,
} from '../src/components/light-fx/index.js'
import { ANCHORS, SPECTRUM_BARS, resampleBars } from '../src/core/index.js'
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
  { id: 'mini', label: 'MiniSpectrum', hint: '填满父容器的频谱' },
  { id: 'album', label: 'AlbumArt', hint: '专辑卡片控件' },
  { id: 'pointer', label: 'PointerFx', hint: '鼠标拖尾与点击特效' },
  { id: 'ambient', label: 'AmbientFx', hint: '全屏氛围粒子层' },
  { id: 'spotlight', label: 'Spotlight', hint: '跟随鼠标的聚光灯' },
  { id: 'frame', label: 'Frame', hint: 'REC 取景框' },
  { id: 'light', label: 'LightFx', hint: '天气光照层' },
]

// Every trail / click combination gets its own cell. The lists come from the
// component entry, so adding a variant puts it in the gallery automatically.
const POINTER_COMBOS = POINTER_TRAIL_VARIANTS.flatMap((trailVariant) =>
  POINTER_CLICK_VARIANTS.map((clickVariant) => ({ trailVariant, clickVariant })),
)

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

// Chinese labels for the four corners, keyed by the library's anchor ids. The
// ids themselves come from `core`, so a new anchor shows up here as a blank
// button rather than silently disappearing from the picker.
const ANCHOR_LABELS = {
  'top-left': '左上',
  'top-center': '上中',
  'top-right': '右上',
  'center-left': '左中',
  center: '居中',
  'center-right': '右中',
  'bottom-left': '左下',
  'bottom-center': '下中',
  'bottom-right': '右下',
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
          color={view.color}
          use24Hour={view.use24Hour}
          size={sizeFor(placement, view.size)}
          anchor={view.anchor}
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

function AnchorPicker({ value, onChange }) {
  return (
    <div className="anchors" role="group" aria-label="锚点">
      {ANCHORS.map((id) => (
        <button
          key={id}
          type="button"
          className={value === id ? 'anchor anchor--on' : 'anchor'}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          title={`anchor="${id}"`}
        >
          {ANCHOR_LABELS[id] ?? id}
        </button>
      ))}
    </div>
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
  const [colorOn, setColorOn] = useState(false)
  const [color, setColor] = useState('#ff6b6b')
  const [use24Hour, setUse24Hour] = useState(true)
  const [size, setSize] = useState(100)
  const [locale, setLocale] = useState('zh-CN')
  const [visible, setVisible] = useState(true)

  // Placement.
  const [anchor, setAnchor] = useState('bottom-left')
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
      color: colorOn ? color : undefined,
      use24Hour,
      size,
      anchor,
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
    [now, theme, colorOn, color, use24Hour, size, anchor, offsetX, offsetY, beat, beatIntensity, beatCurve, tiltOn, maxTilt, tiltSpeed, visible, locale],
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
          <label className={`ctl ${colorOn ? '' : 'ctl--off'}`}>
            <span className="ctl__label">
              文字色 color <b>{colorOn ? color : '未覆盖'}</b>
            </span>
            <input
              type="color"
              value={color}
              disabled={!colorOn}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <Toggle label="覆盖 color" on={colorOn} onChange={setColorOn} />
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
            max={400}
            step={5}
            suffix="%"
            onChange={setSize}
          />
        </Row>

        <Row title="位置">
          <AnchorPicker value={anchor} onChange={setAnchor} />
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
              color={colorOn ? color : undefined}
              use24Hour={use24Hour}
              size={size}
              anchor={anchor}
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
              color={colorOn ? color : undefined}
              use24Hour={use24Hour}
              size={size}
              anchor={anchor}
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
  const [anchor, setAnchor] = useState('bottom-left')
  const [offsetX, setOffsetX] = useState(DEMO_OFFSET_X)
  const [offsetY, setOffsetY] = useState(DEMO_OFFSET_Y)
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)
  const [bpm, setBpm] = useState(120)
  const [intensity, setIntensity] = useState(100)
  const [curve, setCurve] = useState(1)
  // `width` / `height` override the per-variant base box (flat styles are a wide
  // strip, radial styles force a square). 0 keeps the axis unset so the
  // stylesheet's variant rule applies.
  const [widthOn, setWidthOn] = useState(false)
  const [widthVw, setWidthVw] = useState(40)
  const [heightOn, setHeightOn] = useState(false)
  const [heightVh, setHeightVh] = useState(40)
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
    anchor,
    offsetX,
    offsetY,
    visible,
    paused,
    intensity,
    curve,
    width: widthOn ? `${widthVw}vw` : undefined,
    height: heightOn ? `${heightVh}vh` : undefined,
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
          <AnchorPicker value={anchor} onChange={setAnchor} />
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

        <Row title="覆盖尺寸">
          <Toggle label="覆盖宽度 width" on={widthOn} onChange={setWidthOn} />
          <Slider
            label="宽度（vw）"
            value={widthVw}
            min={5}
            max={100}
            step={5}
            suffix="vw"
            disabled={!widthOn}
            onChange={setWidthVw}
          />
          <Toggle label="覆盖高度 height" on={heightOn} onChange={setHeightOn} />
          <Slider
            label="高度（vh）"
            value={heightVh}
            min={5}
            max={100}
            step={5}
            suffix="vh"
            disabled={!heightOn}
            onChange={setHeightVh}
          />
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
        <code>intensity</code> / <code>curve</code> 在绘制入口统一整形，对九种样式行为一致；
        盒子规则分两组——扁样式（bars / mirror / curve / pill / dots）是 <code>30vw × 15vh</code> 宽条，
        径向样式（ring / ringwave / ripples / aurora）强制方形 <code>min(30vw, 28vh)</code> 保正圆，
        所以同一 <code>size</code> 下环形显示范围比柱状小；显式 <code>width</code> / <code>height</code>
        可覆盖两组规则。
        柱数不是组件 prop：本页用 core 的 <code>resampleBars(bars, count)</code> 折叠后再传入。
      </footer>
    </>
  )
}

// Synthetic cover art for the demo only. The library never invents artwork —
// it renders `track.thumbnail` or an empty placeholder — but the playground
// needs something to put in the card. A data-URI SVG keeps the demo
// self-contained: no binary assets, no network.
function coverDataUri(hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${hue} 74% 64%)"/>
        <stop offset="1" stop-color="hsl(${(hue + 52) % 360} 66% 32%)"/>
      </linearGradient>
    </defs>
    <rect width="320" height="320" fill="url(#g)"/>
    <circle cx="160" cy="160" r="74" fill="rgba(255,255,255,0.14)"/>
    <circle cx="160" cy="160" r="34" fill="rgba(255,255,255,0.26)"/>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// Three stands-ins so switching tracks shows the tint and cover swap.
const DEMO_TRACKS = [
  {
    title: '夜航',
    artist: 'Demo Artist',
    albumTitle: 'Synthwave Sessions',
    thumbnail: coverDataUri(212),
    primaryColor: '#6f8bff',
    textColor: '#ffffff',
    playback: 'playing',
  },
  {
    title: 'Late Train Home',
    artist: 'Placeholder Quartet',
    albumTitle: 'Nocturne',
    thumbnail: coverDataUri(18),
    primaryColor: '#ff9a5c',
    textColor: '#ffffff',
    playback: 'playing',
  },
  {
    title: '未命名曲目',
    artist: '',
    albumTitle: '',
    thumbnail: '',
    primaryColor: '',
    textColor: '',
    playback: null,
  },
]

const ALBUM_VARIANT_LABELS = {
  classic: '经典圆形',
  glass: '毛玻璃',
  vinyl: '黑胶唱片',
  minimal: '极简文字',
  type: '纯文字排版',
  bar: '横向胶囊',
  cassette: '磁带',
  polaroid: '拍立得',
  cd: 'CD 光碟',
  poster: '竖版海报',
  ticket: '票根',
}

// The layout list comes from the library, so a new variant shows up here without
// editing this file — only an unknown id falls back to the raw name.
const ALBUM_VARIANTS = ALBUM_ART_VARIANTS.map((id) => ({
  id,
  label: ALBUM_VARIANT_LABELS[id] ?? id,
}))

function MiniSpectrumDemo() {
  const [variant, setVariant] = useState('bars')
  const [paused, setPaused] = useState(false)
  const [barCount, setBarCount] = useState(32)
  const [intensity, setIntensity] = useState(130)
  const [curve, setCurve] = useState(0.7)

  const rawBars = useBars(!paused, 120)

  return (
    <>
      <header className="head">
        <h1>MiniSpectrum</h1>
        <p className="hint">
          填满父容器的频谱，没有尺寸与位置 props——盒子由父容器决定，所以能嵌进卡片。
          <code>bars == null</code> 时不渲染；柱数默认折叠到 <code>32</code>（小尺寸下 128 根柱子会变成一条条线）。
          与 <code>Spectrum</code> 共用同一套绘制循环，差别只在盒子怎么来的。
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
        </Row>

        <Row title="数据与响应">
          <Slider
            label="柱数 barCount"
            value={barCount}
            min={8}
            max={SPECTRUM_BARS}
            step={4}
            onChange={setBarCount}
          />
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

        <Row title="运行">
          <Toggle label="暂停 paused" on={paused} onChange={setPaused} />
        </Row>
      </section>

      {/* The selected variant gets a larger box, so the difference between
          `variant` and the box it fills is visible: the widget never sizes
          itself, only the parent does. */}
      <div className="mini-hero">
        <MiniSpectrum
          bars={rawBars}
          variant={variant}
          barCount={barCount}
          intensity={intensity}
          curve={curve}
          paused={paused}
        />
      </div>

      <section className="grid">
        {SPECTRUM_STYLES.map((id, i) => (
          <figure className="cell" key={id}>
            <div className={`mini-box mini-box--${i % 2 === 0 ? 'a' : 'b'}`}>
              <MiniSpectrum
                bars={rawBars}
                variant={id}
                barCount={barCount}
                intensity={intensity}
                curve={curve}
                paused={paused}
              />
            </div>
            <figcaption>mini-spectrum · {id}</figcaption>
          </figure>
        ))}
      </section>

      <footer className="foot">
        库的默认值：<code>variant="bars"</code>、<code>barCount=32</code>、<code>intensity=100</code>、
        <code>curve=1</code>、<code>paused=false</code>。本页的 130% / 0.7 只是卡片尺寸下的观感取值。
        柱数由 <code>barCount</code> 决定，在绘制循环里用 core 的 <code>resampleBars</code> 折叠。
      </footer>
    </>
  )
}

function AlbumArtDemo() {
  const [trackIndex, setTrackIndex] = useState(0)
  const [playback, setPlayback] = useState('playing')
  const [withBars, setWithBars] = useState(true)
  // Tri-state: `auto` omits the prop so each layout uses its own default
  // (`vinyl` off, everything else on); the other two force it either way.
  const [spectrum, setSpectrum] = useState('auto')
  const [paused, setPaused] = useState(false)
  const [size, setSize] = useState(70)
  const [anchor, setAnchor] = useState('bottom-left')
  const [offsetX, setOffsetX] = useState(DEMO_OFFSET_X)
  const [offsetY, setOffsetY] = useState(DEMO_OFFSET_Y)
  const [visible, setVisible] = useState(true)
  const [theme, setTheme] = useState('light')
  const [colorOn, setColorOn] = useState(false)
  const [color, setColor] = useState('#ff6b6b')
  // `colorHex` recolours only the inline spectrum; the card's own tint still
  // comes from `track.primaryColor`, so the two pickers never fight.
  const [specOn, setSpecOn] = useState(false)
  const [specColor, setSpecColor] = useState('#a8c4ff')

  const pausedBars = useBars(!paused, 120)
  const base = DEMO_TRACKS[trackIndex]
  // `playback` is a demo control: `stopped` is the only state that hides the
  // card, and `null` (unknown) must render — so the select exposes both.
  const track = { ...base, playback: playback === 'null' ? null : playback }

  return (
    <>
      <header className="head">
        <h1>AlbumArt</h1>
        <p className="hint">
          纯展示组件：<code>track</code> 由本页提供（原本的媒体轮询留在应用层）。
          <code>track == null</code> 或 <code>playback === 'stopped'</code> 时不渲染；
          <code>playback === null</code> 表示未知，**按正在播放处理**——引擎只在切歌时推送，
          把未知当成停止会让封面永久消失。<code>bars</code> 可选，没有它卡片仍然显示，只是少了频谱
          （<code>bar</code> 布局会把那条 38% 的频谱槽位一起收掉，不留空洞）。
          <code>spectrum</code> 是另一个开关，可选三态：省略时跟随布局——<code>vinyl</code> 默认关
          （干净碟面）、其余默认开；传 <code>true</code> / <code>false</code> 则强制显示或隐藏。
        </p>
      </header>

      <section className="panel">
        <Row title="曲目">
          <label className="ctl">
            <span className="ctl__label">
              曲目 track <b>{trackIndex + 1}</b>
            </span>
            <select value={trackIndex} onChange={(e) => setTrackIndex(Number(e.target.value))}>
              {DEMO_TRACKS.map((t, i) => (
                <option key={t.title} value={i}>
                  {t.title || '(无标题)'}
                </option>
              ))}
            </select>
          </label>
          <label className="ctl">
            <span className="ctl__label">
              播放状态 playback <b>{String(track.playback)}</b>
            </span>
            <select value={playback} onChange={(e) => setPlayback(e.target.value)}>
              <option value="playing">playing</option>
              <option value="paused">paused</option>
              <option value="stopped">stopped（不渲染）</option>
              <option value="null">null（未知，视为播放中）</option>
            </select>
          </label>
        </Row>

        <Row title="尺寸与位置">
          <Slider
            label="尺寸 size"
            value={size}
            min={20}
            max={150}
            step={5}
            suffix="%"
            onChange={setSize}
          />
          <AnchorPicker value={anchor} onChange={setAnchor} />
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

        <Row title="配色">
          <label className="ctl">
            <span className="ctl__label">
              文字色 theme <b>{theme}</b>
            </span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="light">light — 浅色文字（深色壁纸）</option>
              <option value="dark">dark — 深色文字（浅色壁纸）</option>
            </select>
          </label>
          <label className={`ctl ${colorOn ? '' : 'ctl--off'}`}>
            <span className="ctl__label">
              文字色 color <b>{colorOn ? color : '未覆盖'}</b>
            </span>
            <input
              type="color"
              value={color}
              disabled={!colorOn}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <Toggle label="覆盖 color" on={colorOn} onChange={setColorOn} />
          <label className={`ctl ${specOn ? '' : 'ctl--off'}`}>
            <span className="ctl__label">
              频谱色 colorHex <b>{specOn ? specColor : '未覆盖'}</b>
            </span>
            <input
              type="color"
              value={specColor}
              disabled={!specOn}
              onChange={(e) => setSpecColor(e.target.value)}
            />
          </label>
          <Toggle label="覆盖 colorHex" on={specOn} onChange={setSpecOn} />
        </Row>

        <Row title="运行">
          <Toggle label="显示 visible" on={visible} onChange={setVisible} />
          <Toggle label="暂停 paused" on={paused} onChange={setPaused} />
          <Toggle label="频谱 bars" on={withBars} onChange={setWithBars} />
          <label className="ctl">
            <span className="ctl__label">
              频谱 spectrum <b>{spectrum}</b>
            </span>
            <select value={spectrum} onChange={(e) => setSpectrum(e.target.value)}>
              <option value="auto">默认（vinyl 关，其余开）</option>
              <option value="on">true（强制显示）</option>
              <option value="off">false（强制隐藏）</option>
            </select>
          </label>
        </Row>
      </section>

      <section className="grid">
        {ALBUM_VARIANTS.map((v, i) => (
          <figure className="cell" key={v.id}>
            <div
              className={`stage stage--${
                theme === 'dark' ? 'light' : i % 2 === 0 ? 'photo' : 'dark'
              }`}
            >
              <AlbumArt
                track={track}
                bars={withBars ? pausedBars : null}
                spectrum={spectrum === 'auto' ? undefined : spectrum === 'on'}
                variant={v.id}
                theme={theme}
                color={colorOn ? color : undefined}
                colorHex={specOn ? specColor : undefined}
                size={size}
                anchor={anchor}
                offsetX={offsetX}
                offsetY={offsetY}
                visible={visible}
                paused={paused}
                labels={{ aria: '正在播放', coverAlt: base.title }}
              />
            </div>
            <figcaption>album-art · {v.id}</figcaption>
          </figure>
        ))}
      </section>

      <footer className="foot">
        库的默认值：<code>variant="classic"</code>、<code>theme="light"</code>、<code>size=100</code>、
        <code>offsetX=0, offsetY=0</code>、<code>paused=false</code>、<code>bars</code> 可省略、
        <code>spectrum</code> 省略时跟随布局（<code>vinyl</code> 关、其余开）。
        <code>color</code> 覆盖文字色，<code>colorHex</code> 只覆盖内嵌频谱（省略时取
        <code>--wallkit-accent</code>，卡片自身染色仍来自 <code>track.primaryColor</code>）。
        <code>theme="dark"</code> 会把卡片自绘的表面（毛玻璃、胶囊、唱片标签）一并翻成浅色，
        并把默认 accent 压暗，否则浅底上的频谱看不见；纸面样式（磁带标签、拍立得、票根）用固定深色墨、
        海报用固定浅色墨，不随主题翻转。`type` 纯排版不渲染封面，唯一图形是封面主色的竖线与频谱点。
        十一种布局各自绑定频谱样式：
        classic→bars、glass→curve、vinyl→ring、minimal→bars、type→dots、bar→curve、cassette→bars、
        polaroid→dots、cd→curve、poster→bars、ticket→bars。
        vinyl 的环形柱状图从碟缘外侧约 3% 直径处往外长（与唱片之间留一圈空隙，柱数 128），随唱片一起转、一起暂停；
        它默认不画（传 <code>spectrum</code> 才出现），
        覆盖层四周出血 22%，所以它的视觉范围比 size 大一圈，贴边锚点会裁掉柱尖。
        封面每 24s 转一圈，<code>paused</code> 或 <code>playback="paused"</code> 时停转；
        <code>prefers-reduced-motion</code> 下不转。
      </footer>
    </>
  )
}

function PointerFxDemo() {
  // No synthetic input here: this gallery consumes real pointer events. Move
  // the mouse into a cell for the trail, click inside it for the burst.
  const [colorHex, setColorHex] = useState('#a8c4ff')
  const [size, setSize] = useState(100)
  const [trailSize, setTrailSize] = useState(70)
  const [clickSize, setClickSize] = useState(170)
  const [splitSize, setSplitSize] = useState(false)
  const [intensity, setIntensity] = useState(100)
  const [trail, setTrail] = useState(true)
  const [click, setClick] = useState(true)
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)

  // Either the single shared `size`, or two per-channel overrides. Passing all
  // three would shadow `size` and make that slider look broken, so the demo
  // switches between the two shapes of the prop contract.
  const shared = {
    colorHex,
    size,
    intensity,
    trail,
    click,
    visible,
    paused,
    ...(splitSize ? { trailSize, clickSize } : {}),
  }

  return (
    <>
      <header className="head">
        <h1>PointerFx</h1>
        <p className="hint">
          拖尾 + 点击共用一个覆盖层：把鼠标<b>移进下方格子</b>看拖尾，<b>在格子里点击</b>看点击特效。
          每个格子是一种拖尾 × 点击组合，共 {POINTER_COMBOS.length} 格，每行共用一种拖尾。
          <code>bubble</code> 和 <code>firework</code> 在<b>拖尾和点击两个通道都能用</b>：拖尾版小而稀疏、点击版饱满耐久，共用同一套绘制函数，差别只在预设；粒子都由种子逐帧重算、不存数组。
          组件自己监听 <code>window</code> 的指针事件，坐标映射到各自盒子，
          盒子外的事件忽略；采样走预分配环形缓冲，<b>零 React 重渲染</b>，空闲时 rAF 自动停止。
          <code>size</code> 是两个通道共用的默认尺寸，打开「分别设定尺寸」后
          <code>trailSize</code> / <code>clickSize</code> 各自只覆盖一个通道；尺寸只缩放笔触，
          不改变采样密度、强度或覆盖层盒子。
          <code>visible=false</code> 不渲染 DOM，<code>paused</code> 冻结画面。
          WE 桌面壁纸默认收不到鼠标事件，实机需开启鼠标交互；没有事件时画布保持空白，不画假轨迹。
        </p>
      </header>

      <section className="panel">
        <Row title="样式">
          <label className="ctl">
            <span className="ctl__label">
              颜色 colorHex <b>{colorHex}</b>
            </span>
            <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} />
          </label>
          <span className="ctl ctl--note">
            拖尾：<code>{POINTER_TRAIL_VARIANTS.join(' / ')}</code> · 点击：
            <code>{POINTER_CLICK_VARIANTS.join(' / ')}</code>，
            共 {POINTER_COMBOS.length} 格各展示一种组合（试试 <code>bubble + firework</code>）
          </span>
        </Row>

        <Row title="表现">
          <Toggle label="分别设定尺寸" on={splitSize} onChange={setSplitSize} />
          {splitSize ? (
            <>
              <Slider
                label="拖尾尺寸 trailSize"
                value={trailSize}
                min={20}
                max={300}
                step={10}
                suffix="%"
                onChange={setTrailSize}
              />
              <Slider
                label="点击尺寸 clickSize"
                value={clickSize}
                min={20}
                max={300}
                step={10}
                suffix="%"
                onChange={setClickSize}
              />
            </>
          ) : (
            <Slider
              label="尺寸 size（两个通道共用）"
              value={size}
              min={20}
              max={300}
              step={10}
              suffix="%"
              onChange={setSize}
            />
          )}
          <Slider
            label="强度 intensity"
            value={intensity}
            min={0}
            max={300}
            step={10}
            suffix="%"
            onChange={setIntensity}
          />
        </Row>

        <Row title="运行">
          <Toggle label="拖尾 trail" on={trail} onChange={setTrail} />
          <Toggle label="点击 click" on={click} onChange={setClick} />
          <Toggle label="显示 visible" on={visible} onChange={setVisible} />
          <Toggle label="暂停 paused" on={paused} onChange={setPaused} />
        </Row>
      </section>

      <section className="grid grid--pointer">
        {POINTER_COMBOS.map((combo, i) => (
          <figure className="cell" key={`${combo.trailVariant}-${combo.clickVariant}`}>
            <div className={`stage stage--${i % 2 === 0 ? 'b' : 'dark'}`}>
              <PointerFx {...shared} {...combo} />
            </div>
            <figcaption>
              pointer-fx · {combo.trailVariant} + {combo.clickVariant}（移入 / 点击）
            </figcaption>
          </figure>
        ))}
      </section>

      <footer className="foot">
        库的默认值：<code>trailVariant="glow"</code>、<code>clickVariant="ripple"</code>、
        <code>size=100</code>、<code>intensity=100</code>、
        <code>trailSize</code> / <code>clickSize</code> 省略时继承 <code>size</code>（三者都是 20–300），
        <code>colorHex</code> 省略时取 <code>--wallkit-accent</code>。
        覆盖层没有 <code>anchor</code> / <code>offsetX</code> / <code>offsetY</code>：它铺满定位上下文，
        本页的 <code>.stage</code> 就是那个容器。<code>prefers-reduced-motion</code> 下拖尾关闭，
        点击退化成静态圆环。
      </footer>
    </>
  )
}

const AMBIENT_VARIANT_LABELS = {
  snow: '飘雪 — 匀速下落 + 窄摆',
  sakura: '樱花 — 风斜、大幅摆动、逐片自转',
  bubble: '气泡 — 匀速上浮，颜色跟随强调色',
  steam: '水蒸气 — 雾的竖直孪生：大团缓升、边缘涨消',
  rain: '雨 — 高速细雨丝，随风斜落',
  fog: '雾 — 大团薄雾横向漂移、边缘涨消',
  leaves: '落叶 — 强风斜落、之字翻滚、逐叶自转',
}

// Each variant is judged against the backdrop it will actually be used on:
// flakes need a dark night, petals read best over dusk, bubbles need something
// with contrast or they disappear, steam and rain are pale and need dark too,
// fog reads over any busy backdrop, leaves carry their own warm colour.
const AMBIENT_STAGES = {
  snow: 'stage--dark',
  sakura: 'stage--photo',
  bubble: 'stage--b',
  steam: 'stage--dark',
  rain: 'stage--dark',
  fog: 'stage--photo',
  leaves: 'stage--photo',
}

function AmbientFxDemo() {
  // Closed by default: this layer covers the whole stage, so leaving it on
  // would hide whatever is being compared. It has its own menu entry instead of
  // being sprinkled onto the other demos for the same reason.
  const [on, setOn] = useState(false)
  const [paused, setPaused] = useState(false)
  const [variant, setVariant] = useState('snow')

  // `colorHex` is omitted entirely unless overridden, so the preset colour path
  // (snow #dbe9ff / petals #f5b8cd / bubble → --wallkit-accent) stays visible.
  const [customColor, setCustomColor] = useState(false)
  const [colorHex, setColorHex] = useState('#dbe9ff')

  const [density, setDensity] = useState(100)
  const [size, setSize] = useState(100)
  const [intensity, setIntensity] = useState(100)
  const [pace, setPace] = useState(AMBIENT_SPEED_DEFAULT)

  const shared = {
    visible: on,
    paused,
    density,
    size,
    intensity,
    speed: pace,
    ...(customColor ? { colorHex } : {}),
  }

  return (
    <>
      <header className="head">
        <h1>AmbientFx</h1>
        <p className="hint">
          全屏氛围粒子层：<b>不看指针、不读音频、不查背景</b>，粒子的位置只是
          <code>f(种子, 时间)</code> 的纯函数——所以没有粒子数组，<code>paused</code> 只是停止推进时间，
          恢复时从原处继续。覆盖层的层级在控件之下（<code>z-index: 1</code>），雪花从时钟背后穿过。
          <code>visible=false</code> 不渲染 DOM；<b>本页默认关闭</b>，打开开关才会覆盖舞台。
          没有 <code>anchor</code> / <code>offsetX</code> / <code>offsetY</code>：它铺满定位上下文。
        </p>
      </header>

      <section className="panel">
        <Row title="运行">
          <Toggle label="氛围层" on={on} onChange={setOn} />
          <Toggle label="暂停 paused" on={paused} onChange={setPaused} disabled={!on} />
        </Row>

        <Row title="形态">
          <label className="ctl">
            <span className="ctl__label">
              形态 variant <b>{variant}</b>
            </span>
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              {AMBIENT_VARIANTS.map((id) => (
                <option key={id} value={id}>
                  {id} · {AMBIENT_VARIANT_LABELS[id]}
                </option>
              ))}
            </select>
          </label>
          <Toggle
            label="自定义颜色"
            on={customColor}
            disabled={!on}
            onChange={setCustomColor}
          />
          <label className={customColor && on ? 'ctl' : 'ctl ctl--off'}>
            <span className="ctl__label">
              颜色 colorHex <b>{customColor ? colorHex : '(预设)'}</b>
            </span>
            <input
              type="color"
              value={colorHex}
              disabled={!customColor || !on}
              onChange={(e) => setColorHex(e.target.value)}
            />
          </label>
        </Row>

        <Row title="参数">
          <Slider
            label="密度 density"
            value={density}
            min={AMBIENT_DENSITY_MIN}
            max={AMBIENT_DENSITY_MAX}
            step={10}
            suffix="%"
            disabled={!on}
            onChange={setDensity}
          />
          <Slider
            label="尺寸 size"
            value={size}
            min={AMBIENT_SIZE_MIN}
            max={AMBIENT_SIZE_MAX}
            step={10}
            suffix="%"
            disabled={!on}
            onChange={setSize}
          />
          <Slider
            label="不透明度 intensity"
            value={intensity}
            min={AMBIENT_INTENSITY_MIN}
            max={AMBIENT_INTENSITY_MAX}
            step={10}
            suffix="%"
            disabled={!on}
            onChange={setIntensity}
          />
          <Slider
            label="速度 speed"
            value={pace}
            min={AMBIENT_SPEED_MIN}
            max={AMBIENT_SPEED_MAX}
            step={10}
            suffix="%"
            disabled={!on}
            onChange={setPace}
          />
        </Row>
      </section>

      {/* A wall-sized box on purpose: at 260px the flakes read as a postcard and
          the density / speed judgement does not transfer to a real wallpaper. */}
      <div className="ambient-hero">
        <AmbientFx {...shared} variant={variant} />
        {!on && (
          <p className="ambient-off">
            <b>氛围层已关闭</b>
            <span>打开上方「氛围层」开关查看当前形态；默认关闭，避免遮挡其他控件的对比。</span>
          </p>
        )}
      </div>

      <section className="grid grid--ambient">
        {AMBIENT_VARIANTS.map((id) => (
          <figure className="cell" key={id}>
            <div className={`stage ${AMBIENT_STAGES[id]}`}>
              <AmbientFx {...shared} variant={id} />
              {!on && <span className="ambient-off ambient-off--cell">关闭</span>}
            </div>
            <figcaption>ambient-fx · {id}（{AMBIENT_VARIANT_LABELS[id]}）</figcaption>
          </figure>
        ))}
      </section>

      <footer className="foot">
        库的默认值：<code>variant="snow"</code>、<code>visible=true</code>、<code>density=100</code>、
        <code>size=100</code>、<code>intensity=100</code>、<code>speed=100</code>、<code>paused=false</code>。
        数量按预设基数乘 <code>density</code> 后封顶（共 240 上限：snow 220 / sakura 90 / bubble 80 / steam 30 / rain 220 / fog 30 / leaves 70），
        <code>size</code> 只缩放粒子、不改数量。<code>speed</code> 缩放整层时钟，运动、摆动、生命期全部同步快慢。
        <code>colorHex</code> 省略时各形态用自己的固有色
        （雪 <code>#dbe9ff</code> / 樱 <code>#f5b8cd</code> / 蒸气 <code>#eef1f4</code> / 雨 <code>#a8c0dc</code> /
        雾 <code>#dfe6ee</code> / 落叶 <code>#d98a4f</code>），气泡才回落到 <code>--wallkit-accent</code>——
        具象物件跟着封面色变会像 bug。
        <code>prefers-reduced-motion</code> 下只画一帧静止画面。
      </footer>
    </>
  )
}

// Three backdrops, one set of props: the spotlight has to be judged against the
// wallpaper it will actually sit on, so the cells differ only in the artwork
// behind them while every slider still drives all three at once.
const SPOTLIGHT_STAGES = [
  { stage: 'stage--dark', caption: 'spotlight · 深色壁纸' },
  { stage: 'stage--light', caption: 'spotlight · 亮色壁纸（遮罩同样压得住）' },
  { stage: 'stage--photo', caption: 'spotlight · 彩色壁纸（高光最容易看出来）' },
]

function SpotlightDemo() {
  // Real pointer input, no synthetic cursor: move the mouse into a cell.
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)
  const [size, setSize] = useState(420)
  const [feather, setFeather] = useState(SPOTLIGHT_FEATHER_DEFAULT)
  const [dim, setDim] = useState(SPOTLIGHT_DIM_DEFAULT)
  const [glow, setGlow] = useState(SPOTLIGHT_GLOW_DEFAULT)
  const [smoothing, setSmoothing] = useState(SPOTLIGHT_SMOOTHING_DEFAULT)
  const [warm, setWarm] = useState(false)

  const shared = {
    visible,
    paused,
    size,
    feather,
    dim,
    glow,
    smoothing,
    ...(warm ? { darkColor: '#1a1030', lightColor: '#ffd9a0' } : {}),
  }

  return (
    <>
      <header className="head">
        <h1>Spotlight</h1>
        <p className="hint">
          把鼠标<b>移进下方格子</b>：一个亮圈跟着指针走，圈外被压暗，像关灯后打一盏手电。
          整层是两层 CSS 径向渐变（暗罩 + <code>mix-blend-mode: screen</code> 的高光），
          <b>没有 canvas、没有绘制循环</b>——鼠标每次移动只改写两个 CSS 变量，
          零 React 重渲染；<code>smoothing=0</code> 时连 rAF 都不开。
          <code>size</code> 是光圈直径，<code>feather</code> 是边缘软硬（0 为硬边），
          <code>dim</code> 是圈外遮罩浓度，<code>glow</code> 是圈内高光强度（0 则整层不挂）。
          <code>paused</code> 冻结画面并停止监听；没有收到任何指针事件前遮罩<b>保持全透明</b>，
          不会把壁纸糊成黑屏——WE 桌面壁纸默认不投递鼠标事件，实机需开启鼠标交互。
        </p>
      </header>

      <section className="panel">
        <Row title="几何">
          <Slider
            label="直径 size"
            value={size}
            min={SPOTLIGHT_SIZE_MIN}
            max={1200}
            step={20}
            suffix="px"
            onChange={setSize}
          />
          <Slider
            label="边缘 feather"
            value={feather}
            min={0}
            max={1}
            step={0.05}
            suffix=""
            onChange={setFeather}
          />
          <Slider
            label="遮罩浓度 dim"
            value={dim}
            min={0}
            max={1}
            step={0.02}
            suffix=""
            onChange={setDim}
          />
        </Row>

        <Row title="光">
          <Slider
            label="高光 glow"
            value={glow}
            min={0}
            max={1}
            step={0.02}
            suffix=""
            onChange={setGlow}
          />
          <Slider
            label="跟随延迟 smoothing"
            value={smoothing}
            min={0}
            max={SPOTLIGHT_SMOOTHING_MAX}
            step={0.01}
            suffix="s"
            onChange={setSmoothing}
          />
          <Toggle label="暖色光" on={warm} onChange={setWarm} />
        </Row>

        <Row title="运行">
          <Toggle label="显示 visible" on={visible} onChange={setVisible} />
          <Toggle label="暂停 paused" on={paused} onChange={setPaused} />
          <span className="ctl ctl--note">
            上限 <code>{SPOTLIGHT_SIZE_MAX}</code>px；<code>dim</code> / <code>glow</code> /
            <code>feather</code> 都是 0–1 的比例，不是百分比
          </span>
        </Row>
      </section>

      <section className="grid grid--spotlight">
        {SPOTLIGHT_STAGES.map((entry) => (
          <figure className="cell" key={entry.stage}>
            <div className={`stage ${entry.stage}`}>
              <Spotlight {...shared} />
            </div>
            <figcaption>{entry.caption}</figcaption>
          </figure>
        ))}
      </section>

      <footer className="foot">
        库的默认值：<code>size=420</code>、<code>feather=0.45</code>、<code>dim=0.72</code>、
        <code>glow=0.22</code>、<code>darkColor="#000000"</code>、<code>lightColor="#ffffff"</code>、
        <code>smoothing=0.05</code>、<code>visible=true</code>、<code>paused=false</code>。
        覆盖层铺满定位上下文（<code>position: absolute; inset: 0</code>），
        <b>不使用 <code>anchor</code> 三元组</b>；<code>z-index: 6</code> 在所有控件之上
        （ambient 1 → spectrum 3 → 指针特效 4 → clock / album 5），因为效果本来就要压住控件，
        想让某个控件始终亮着可在自己的样式表里降低层级。
        和 <code>PointerFx</code> 一样，组件自己监听 <code>window</code> 的指针事件并把坐标映射进自身盒子，
        盒子外的事件忽略，一页可挂多个实例。
        <code>prefers-reduced-motion</code> 下去掉跟随延迟（只停缓动，不停效果）。
      </footer>
    </>
  )
}

// Frame gallery.
//
// The viewfinder is judged at wallpaper scale, so the hero is a full-width
// stage running every switch from the panel above; the four stages below keep
// the furniture off, so what you compare is the shape of each variant.
const FRAME_STAGES = [
  { variant: 'corners', className: 'stage stage--photo', theme: 'light', caption: 'corners — 四角括号（默认）' },
  { variant: 'frame', className: 'stage stage--light', theme: 'dark', caption: 'frame — 整框 + 虚线安全区' },
  { variant: 'bracket', className: 'stage stage--dark', theme: 'light', caption: 'bracket — 上下翼型轨' },
  { variant: 'film', className: 'stage stage--a', theme: 'dark', caption: 'film — 胶片齿孔' },
]

const FRAME_GRIDS = ['none', 'thirds', 'cross']

// Readouts that also exercise the slot rules: `tl` steps down when the record
// dot is on, `br` steps up when the timecode is on. Editable from the panel so
// the empty slot can be seen too.
const FRAME_LABELS = { tl: 'cam a', tr: '35mm · f2.0', bl: 'iso 800 · 1/50', br: '2026-11-15' }

function FrameDemo() {
  const [variant, setVariant] = useState('corners')
  const [inset, setInset] = useState(FRAME_INSET_DEFAULT)
  const [thickness, setThickness] = useState(FRAME_THICKNESS_DEFAULT)
  const [length, setLength] = useState(FRAME_LENGTH_DEFAULT)
  const [size, setSize] = useState(1)
  const [grid, setGrid] = useState('thirds')
  const [ticks, setTicks] = useState(true)
  // `rec` has three states, not two: false draws nothing, true draws only the
  // dot, a string adds that text. The panel has to show all three or the
  // "no built-in copy" contract is impossible to verify.
  const [rec, setRec] = useState('text')
  const [tc, setTc] = useState(true)
  const [labelsOn, setLabelsOn] = useState(true)
  const [labels, setLabels] = useState(FRAME_LABELS)
  const [colorOn, setColorOn] = useState(false)
  const [color, setColor] = useState('#7dd3fc')
  const [theme, setTheme] = useState('light')
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(12)

  // The page owns the clock, exactly like a wallpaper does. `Frame` only renders
  // the string it is handed, so the readout stops here when paused.
  useEffect(() => {
    if (paused) return undefined
    const id = setInterval(() => setElapsed((value) => value + 0.25), 250)
    return () => clearInterval(id)
  }, [paused])

  const shared = {
    variant,
    inset,
    thickness,
    length,
    size,
    grid,
    theme,
    visible,
    paused,
    ticks,
    color: colorOn ? color : undefined,
    rec: rec === 'off' ? false : rec === 'dot' ? true : 'REC',
    timecode: tc ? formatTimecode(elapsed) : '',
    labels: labelsOn ? labels : undefined,
  }

  return (
    <>
      <header className="head">
        <h1>Frame</h1>
        <p className="hint">
          REC 相机式的取景框：四角括号 / 整框 / 翼型轨 / 胶片齿孔，加上取景器常见的几件仪表。
          它是<b>画面级装饰层</b>——铺满定位上下文、<b>没有子元素</b>、<b>不使用 <code>anchor</code></b>，
          所以不会包裹或位移任何控件；想给某张卡片加角饰，那是应用层两行 <code>border</code> 的事。
          <b>变体只管「边怎么画」</b>，<code>grid</code> / <code>ticks</code> / <code>rec</code> /
          <code>timecode</code> / <code>labels</code> 全是正交开关——让每个变体各带一套 HUD 会立刻变成
          4×5 个组合。整层是纯 CSS，<b>没有 canvas、没有 rAF、没有事件监听</b>；唯一的动画是 7px 红点的硬切闪烁。
          时间码由<b>本页</b>累计后交给 <code>formatTimecode()</code> 格式化，组件自己不计时，
          <code>paused</code> 时读数与红点一起停。
        </p>
      </header>

      <section className="panel">
        <Row title="边线">
          <label className="ctl">
            <span className="ctl__label">
              变体 variant <b>{variant}</b>
            </span>
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              {FRAME_VARIANTS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <Slider
            label="内缩 inset"
            value={inset}
            min={FRAME_INSET_MIN}
            max={FRAME_INSET_MAX}
            step={2}
            suffix="px"
            onChange={setInset}
          />
          <Slider
            label="线宽 thickness"
            value={thickness}
            min={FRAME_THICKNESS_MIN}
            max={FRAME_THICKNESS_MAX}
            step={0.5}
            suffix="px"
            onChange={setThickness}
          />
          <Slider
            label="臂长 length"
            value={length}
            min={FRAME_LENGTH_MIN}
            max={FRAME_LENGTH_MAX}
            step={4}
            suffix="px"
            onChange={setLength}
          />
          <Slider
            label="倍率 size"
            value={size}
            min={FRAME_SIZE_MIN}
            max={FRAME_SIZE_MAX}
            step={0.1}
            suffix="×"
            onChange={setSize}
          />
        </Row>

        <Row title="线色">
          <label className={`ctl ${colorOn ? '' : 'ctl--off'}`}>
            <span className="ctl__label">
              线色 color <b>{colorOn ? color : '未覆盖'}</b>
            </span>
            <input
              type="color"
              value={color}
              disabled={!colorOn}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <Toggle label="覆盖 color" on={colorOn} onChange={setColorOn} />
          <span className="ctl ctl--note">
            只在传入合法 <code>#rrggbb</code> 时生效，否则整层跟随 <code>theme</code>
          </span>
        </Row>

        <Row title="取景器">
          <label className="ctl">
            <span className="ctl__label">
              网格 grid <b>{grid}</b>
            </span>
            <select value={grid} onChange={(e) => setGrid(e.target.value)}>
              {FRAME_GRIDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="ctl">
            <span className="ctl__label">
              录制点 rec <b>{rec}</b>
            </span>
            <select value={rec} onChange={(e) => setRec(e.target.value)}>
              <option value="off">false（不画）</option>
              <option value="dot">true（只画红点）</option>
              <option value="text">"REC"（红点 + 文字）</option>
            </select>
          </label>
          <Toggle label="刻度 ticks" on={ticks} onChange={setTicks} />
          <Toggle label="时间码 timecode" on={tc} onChange={setTc} />
          <span className="ctl ctl--note">
            <code>rec</code> 传字符串才画文字，库不内置文案；<code>grid</code> 也接受
            <code>true</code>（= thirds）
          </span>
        </Row>

        <Row title="角标">
          <Toggle label="labels 角标" on={labelsOn} onChange={setLabelsOn} />
          {['tl', 'tr', 'bl', 'br'].map((slot) => (
            <label key={slot} className={`ctl ${labelsOn ? '' : 'ctl--off'}`}>
              <span className="ctl__label">{slot}</span>
              <input
                type="text"
                value={labels[slot]}
                disabled={!labelsOn}
                placeholder="（空则不画）"
                onChange={(e) => setLabels((current) => ({ ...current, [slot]: e.target.value }))}
              />
            </label>
          ))}
        </Row>

        <Row title="主题">
          <label className="ctl">
            <span className="ctl__label">
              线色 theme <b>{theme}</b>
            </span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="light">light（浅色线 / 深壁纸）</option>
              <option value="dark">dark（深色线 / 浅壁纸）</option>
            </select>
          </label>
          <Toggle label="显示 visible" on={visible} onChange={setVisible} />
          <Toggle label="暂停 paused" on={paused} onChange={setPaused} />
        </Row>
      </section>

      <figure className="cell frame-hero-cell">
        <div className="stage stage--photo frame-hero">
          <Frame {...shared} />
        </div>
        <figcaption>hero：上面所有开关都在这一格里生效，时间码真的在走</figcaption>
      </figure>

      <section className="grid">
        {FRAME_STAGES.map((entry) => (
          <figure className="cell" key={entry.variant}>
            <div className={entry.className}>
              <Frame
                variant={entry.variant}
                theme={entry.theme}
                inset={inset}
                thickness={thickness}
                length={length}
                size={0.8}
              />
            </div>
            <figcaption>{entry.caption}</figcaption>
          </figure>
        ))}
      </section>

      <footer className="foot">
        面板覆盖<b>全部 14 个 prop</b>：<code>variant</code>、<code>inset</code>、<code>thickness</code>、
        <code>length</code>、<code>size</code>、<code>color</code>、<code>grid</code>、<code>ticks</code>、
        <code>rec</code>（三态）、<code>timecode</code>、<code>labels</code>（四槽可清空）、<code>theme</code>、
        <code>visible</code>、<code>paused</code>。下面四格刻意只传尺寸、关掉仪表，用来对比四种边线的形状。
        库的默认值：<code>variant="corners"</code>、<code>inset=28</code>、<code>thickness=1.5</code>、
        <code>length=56</code>、<code>size=1</code>、<code>grid="none"</code>、<code>ticks=false</code>、
        <code>rec=false</code>、<code>timecode=""</code>、<code>theme="dark"</code>、<code>paused=false</code>。
        <code>thickness</code> 的默认值不是 1px：WE 跑在桌面 DPR 下，1px 线跨两个设备像素，看起来是一条灰糊边。
        <code>theme</code> 与 Clock 同义，名字指<b>线的颜色</b>：<code>light</code> 是浅色线（深壁纸），
        <code>dark</code> 是深色线（浅壁纸）。
        层级是 <code>z-index: 7</code>，<b>比 Spotlight 的 6 还高</b>（ambient 1 → spectrum 3 → 指针特效 4 →
        clock / album 5 → spotlight 6 → frame 7）：取景线与曝光读数是叠加在画面上的仪表，不该跟着压暗一起消失；
        想让聚光灯连框一起压暗，在自己的样式表里调低这个值。
        网格与刻度尺用 <code>linear-gradient</code> 画，齿孔用 <code>repeating-linear-gradient</code>——
        只能画矩形，但这个尺寸看不出差别，不值得为圆角把 DOM 翻十倍。
      </footer>
    </>
  )
}

// Light gallery.
//
// A light is judged at wallpaper scale and it answers the pointer, so the hero
// is a full-width stage: run the mouse across it and the sun leans towards the
// cursor. The cells below compare the four variants, plus the same sun on the
// other side; their `size` is scaled down because a cell is a third of a
// wallpaper — at 1400px the wash would fill the whole card and the shaft fan
// would not be visible at all.
const LIGHT_STAGES = [
  { variant: 'sun', anchor: 'top-left', className: 'stage stage--light', caption: 'sun — 晴天正午，左上角' },
  { variant: 'sun', anchor: 'top-right', className: 'stage stage--dark', caption: 'sun — 同一个太阳换到右上角' },
  { variant: 'moon', anchor: 'top-right', className: 'stage stage--dark', caption: 'moon — 月光：冷、暗、几乎没有光束' },
  { variant: 'dusk', anchor: 'top-left', className: 'stage stage--photo', caption: 'dusk — 黄昏低角度，光束被拉长' },
  { variant: 'overcast', anchor: 'top-left', className: 'stage stage--light', caption: 'overcast — 阴天：没有光束，只有一片平光' },
  { variant: 'beach', anchor: 'top-left', className: 'stage stage--photo', caption: 'beach — 海边晴天：硬光盘 + 镜头光圈' },
  { variant: 'beach', anchor: 'center-left', className: 'stage stage--dark', caption: 'beach — 光源挪到画面中段，光圈链横穿整幅' },
]

// A cell is roughly a third of a 1080p frame, so the preset radius is scaled to
// match. The light does not "auto fit" — `size` is px, exactly like Spotlight's
// diameter, and picking the number for the target screen is the caller's job.
const LIGHT_CELL_SCALE = 0.35

// Which prop works on which variant — the full picture, read off
// `LIGHT_PRESETS` rather than written by hand. Adding a variant adds a column
// and setting its `flare` to 0 turns that cell into a dash, so the table cannot
// drift away from the component the way a prose note would.
//
// A number means "this variant has that layer, and this is its preset strength";
// `null` means "no such layer here, passing the prop does nothing".
const LIGHT_FIT_ROWS = [
  {
    prop: 'rays',
    detail: '光束占比。overcast 本身没有光束，传了等于 0',
    cell: (preset) => (preset.rayAlpha > 0 ? preset.rayAlpha.toFixed(2) : null),
  },
  {
    prop: 'flare',
    detail: '光圈链倍率。只有 beach 带这一层，其余变体传了没反应',
    cell: (preset) => (preset.flare > 0 ? preset.flare.toFixed(2) : null),
  },
  {
    prop: 'disc',
    detail: '预设字段、不是 prop：热点硬度（0 = 柔光晕，1 = 硬白盘）',
    cell: (preset) => (preset.disc > 0 ? preset.disc.toFixed(2) : null),
  },
  {
    prop: 'size',
    detail: '光池半径 px，省略取预设；beach 下太阳盘与光圈跟着一起缩放',
    cell: (preset) => preset.size,
  },
  {
    prop: 'intensity',
    detail: '整盏灯的亮度倍率（0–200%），光池 / 热点 / 光束 / 光圈同一个 gain；0 = 全灭，超过 100% 热点先饱和',
    universal: true,
  },
  {
    prop: 'anchor / offsetX / offsetY',
    detail: '光源中心的位置（光束方向由它推导）；负偏移可以把光源推出画面，正数一律朝盒内',
    universal: true,
  },
  {
    prop: 'follow / smoothing',
    detail: '跟随距离与延迟；paused 时停止跟随（画面保留），reduced-motion 下延迟归零；指针的 y 被夹在上半区',
    universal: true,
  },
  {
    prop: 'sway',
    detail: '移动时扇面的额外偏转上限（度，0–60），偏转量由「光当前位置 → 画面中心」推导；overcast 没有光束，转了看不见',
    universal: true,
  },
  {
    prop: 'colorHex',
    detail: '光池 / 热点 / 光束 / 光圈一起换色，热点取它的淡色版；只换一半会像两盏灯',
    universal: true,
  },
  {
    prop: 'visible / paused',
    detail: 'visible=false 整层不渲染；paused 保留当前画面、停止跟随',
    universal: true,
  },
]


function LightFitTable({ variant }) {
  return (
    <section className="fit">
      <table>
        <thead>
          <tr>
            <th scope="col">属性</th>
            {LIGHT_VARIANTS.map((id) => (
              <th key={id} scope="col" className={id === variant ? 'fit__now' : undefined}>
                {id}
              </th>
            ))}
            <th scope="col">特殊情况</th>
          </tr>
        </thead>
        <tbody>
          {LIGHT_FIT_ROWS.map((row) => (
            <tr key={row.prop}>
              <th scope="row">
                <code>{row.prop}</code>
              </th>
              {row.universal ? (
                // One cell instead of five identical ones: these rows are not
                // about a variant at all, and repeating "通用" five times
                // buries the rows that *are* variant-specific.
                <td className="fit__all" colSpan={LIGHT_VARIANTS.length}>
                  全部变体
                </td>
              ) : (
                LIGHT_VARIANTS.map((id) => {
                  const value = row.cell(LIGHT_PRESETS[id])
                  const missing = value == null
                  return (
                    <td
                      key={id}
                      className={`${missing ? 'fit__off' : ''} ${id === variant ? 'fit__now' : ''}`}
                    >
                      {missing ? '—' : value}
                    </td>
                  )
                })
              )}
              <td className="fit__why">{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fit__legend">
        <b>通用</b> = 任何变体都生效 · <b>数字</b> = 该变体预设里的强度/尺寸（不是 prop 的默认值）·
        <b>—</b> = 这个变体没有这一层，<b>传了也不会有效果</b>。高亮列是当前变体。
      </p>
    </section>
  )
}

function LightFxDemo() {
  const [variant, setVariant] = useState('sun')
  const [intensity, setIntensity] = useState(LIGHT_INTENSITY_DEFAULT)
  // One positioning prop, as it is in the component: the anchor names the
  // point, the offsets displace it. Starts at the component's own defaults so
  // the page shows the shipped look rather than a tuned one.
  const [anchor, setAnchor] = useState(LIGHT_ANCHOR_DEFAULT)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [size, setSize] = useState(LIGHT_PRESETS.sun.size)
  // Off = the prop is omitted, so the variant's own radius is used. Worth a
  // switch of its own: "every variant owns a size" is part of the contract.
  const [sizeOn, setSizeOn] = useState(false)
  const [rays, setRays] = useState(1)
  const [flare, setFlare] = useState(1)
  const [follow, setFollow] = useState(LIGHT_FOLLOW_DEFAULT)
  const [smoothing, setSmoothing] = useState(LIGHT_SMOOTHING_DEFAULT)
  const [sway, setSway] = useState(LIGHT_SWAY_DEFAULT)
  const [colorOn, setColorOn] = useState(false)
  const [color, setColor] = useState('#ffd9a0')
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)

  // What this variant actually ships. The two multipliers below are no-ops on a
  // variant without the matching layer, so the demo disables them instead of
  // letting a slider look broken — that *is* the special case the fit table
  // documents one line at a time.
  const preset = LIGHT_PRESETS[variant]
  const hasShafts = preset.rayAlpha > 0
  const hasFlare = preset.flare > 0

  const shared = {
    variant,
    anchor,
    offsetX,
    offsetY,
    intensity,
    size: sizeOn ? size : undefined,
    rays,
    flare,
    follow,
    smoothing,
    sway,
    visible,
    paused,
    colorHex: colorOn ? color : undefined,
  }

  return (
    <>
      <header className="head">
        <h1>LightFx</h1>
        <p className="hint">
          一层<b>天气光照</b>：晴天正午的暖光从画面某一点斜射下来，夜里换成又冷又柔的月光，
          另有黄昏的低角度长光束、阴天的一片平光，以及<b>海边晴天</b>——
          太阳本身被吹成一个硬光盘，镜头里拖出一串光圈。<b>把鼠标移到下面的大画面里</b>，
          光会朝指针偏一点（<code>follow</code> 控制偏移多远，<code>smoothing</code> 控制跟得多重），
          移动途中<b>整束扇面还会朝画面中心微微转过去</b>（<code>sway</code> 控制最多转几度）——
          只有平移的话光像一张贴纸在画面上滑。
          它和 <code>Spotlight</code> 一样是<b>纯 CSS 渐变</b>：一层宽阔的光池 + 一个热点 + 一束被遮罩的
          锥形光束，指针每次移动只改写 <code>--wallkit-light-x</code> / <code>-y</code> 两个变量，
          <b>没有 canvas、没有绘制循环</b>。
          和 <code>Spotlight</code> 相反的一点：<b>它第一帧就在</b>——没有指针输入的壁纸照样有天气，
          光就停在 <code>anchor</code> 指定的那个点；跟随只是加分项，不是效果本身。
          光<b>不会掉到地平线以下</b>（指针的 y 先被夹在上半区再混合），否则会变成从脚底打光。
          位置只有一套词汇：时钟那套 <code>anchor</code> + <code>offsetX</code> / <code>offsetY</code>，
          但<b>基准点是光源中心</b>（这一层没有自己的盒子），偏移照旧<b>朝盒内为正</b>。
          光束方向由锚点推出来——光永远朝背向光源的一侧打；光源移开之后，扇面再朝<b>画面中心</b>
          偏一点（<code>sway</code>，软饱和），所以不存在第二个能跟它打架的方向参数。
          <b>不是所有属性都通用</b>：<code>rays</code> 在 <code>overcast</code> 上、<code>flare</code>
          在 <code>beach</code> 之外都没有对应图层，下面的<b>属性适用表</b>逐条列了出来，控制面板里
          这类滑块会直接置灰。
        </p>
      </header>

      <section className="panel">
        <Row title="天气 · 通用">
          <label className="ctl">
            <span className="ctl__label">
              变体 variant <b>{variant}</b>
            </span>
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              {LIGHT_VARIANTS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <Slider
            label="整体强度 intensity"
            value={intensity}
            min={LIGHT_INTENSITY_MIN}
            max={LIGHT_INTENSITY_MAX}
            step={5}
            suffix="%"
            onChange={setIntensity}
          />
          <span className="ctl ctl--note">
            <code>intensity</code> 是<b>整盏灯</b>的亮度：光池、热点、光束乘同一个系数，
            拉低时三者一起暗下去，不会留下一圈亮光池配一束淡光束
          </span>
        </Row>

        <Row title="光源位置 · 通用">
          <label className="ctl">
            <span className="ctl__label">
              锚点 anchor <b>{anchor}</b>
            </span>
            <select value={anchor} onChange={(e) => setAnchor(e.target.value)}>
              {ANCHORS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <Slider
            label="偏移 offsetX"
            value={offsetX}
            min={-50}
            max={100}
            step={1}
            suffix="%"
            onChange={setOffsetX}
          />
          <Slider
            label="偏移 offsetY"
            value={offsetY}
            min={-50}
            max={100}
            step={1}
            suffix="%"
            onChange={setOffsetY}
          />
          <span className="ctl ctl--note">
            基准点是<b>光源中心</b>（这一层没有自己的盒子）。<code>offsetX</code> / <code>offsetY</code>{' '}
            沿用时钟那套符号：数字永远<b>朝盒子内部为正</b>——<code>top-right</code> 下正数往左、
            <code>bottom-*</code> 下正数往上，所以同一个数在每个角都表示「再往里一点」。
            负值把光源推出画面（<code>top-left</code> + <code>-40</code> 就是一盏画外的路灯），
            最远到 <code>LIGHT_ORIGIN_EXTENT</code>（±100%）。光束方向跟着光源走——
            <code>anchor</code> 决定静止方向，移动时 <code>sway</code> 再让它朝画面中心偏一点，
            <b>没有可以直接指定方向的角度 prop</b>
          </span>
        </Row>

        <Row title="光线 · 随变体">
          <Slider
            label="光池半径 size"
            value={sizeOn ? size : LIGHT_PRESETS[variant].size}
            min={LIGHT_SIZE_MIN}
            max={LIGHT_SIZE_MAX}
            step={50}
            suffix="px"
            disabled={!sizeOn}
            onChange={setSize}
          />
          <Toggle label="覆盖 size" on={sizeOn} onChange={setSizeOn} />
          <Slider
            label="光束占比 rays"
            value={rays}
            min={0}
            max={1}
            step={0.05}
            suffix="×"
            disabled={!hasShafts}
            onChange={setRays}
          />
          <Slider
            label="光圈 flare"
            value={flare}
            min={LIGHT_FLARE_MIN}
            max={LIGHT_FLARE_MAX}
            step={0.05}
            suffix="×"
            disabled={!hasFlare}
            onChange={setFlare}
          />
          <span className="ctl ctl--note">
            <code>size</code> 省略时跟随变体（
            {LIGHT_VARIANTS.map((id) => `${id} ${LIGHT_PRESETS[id].size}`).join(' / ')}px）；
            <code>rays</code> <b>不是亮度</b>，是「这盏灯里有多少比例走成光束」——0 就是一片平光，
            1 是预设最大值；<code>overcast</code> 本身没有光束，乘什么都没用。
            <code>flare</code> 是同一类倍率，乘在<b>镜头光圈</b>上——只有 <code>beach</code> 预设带这层
            （一串光斑 + 两个光圈环，沿「光源 → 画面中心」的轴线往对面铺）。
            <b>当前变体没有的层，滑块会直接置灰</b>：
            {hasShafts ? '' : ' 这个变体没有光束（overcast 就是一片平光）；'}
            {hasFlare ? '' : ' 这个变体没有光圈层，flare 传了也不会有效果。'}
          </span>
        </Row>

        <Row title="跟随 · 通用（paused 时停）">
          <Slider
            label="跟随 follow"
            value={follow}
            min={0}
            max={1}
            step={0.01}
            suffix="×"
            onChange={setFollow}
          />
          <Slider
            label="光束旋转 sway"
            value={sway}
            min={LIGHT_SWAY_MIN}
            max={LIGHT_SWAY_MAX}
            step={1}
            suffix="°"
            disabled={!hasShafts}
            onChange={setSway}
          />
          <Slider
            label="延迟 smoothing"
            value={smoothing}
            min={0}
            max={LIGHT_SMOOTHING_MAX}
            step={0.01}
            suffix="s"
            onChange={setSmoothing}
          />
          <span className="ctl ctl--note">
            <code>sway</code> 是<b>移动时</b>扇面额外偏转的上限（度），不是另一个方向参数：
            它只决定「光源走开后，光束朝画面中心转过去多少」，<code>0</code> 就是纯平移（旧行为），
            越大越「活」。偏转量由光源<b>当前所在的位置</b>推出来，所以永远指向画面中心，
            不会出现「光在左上、光束却朝左下」这种自相矛盾。接近上限时是<b>软饱和</b>
            （<code>tanh</code>），快速划过不会突然撞墙。<code>overcast</code> 没有光束，转了也看不见 → 置灰。
          </span>
        </Row>

        <Row title="光色与运行 · 通用">
          <label className={`ctl ${colorOn ? '' : 'ctl--off'}`}>
            <span className="ctl__label">
              光色 colorHex <b>{colorOn ? color : '未覆盖'}</b>
            </span>
            <input
              type="color"
              value={color}
              disabled={!colorOn}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <Toggle label="覆盖光色" on={colorOn} onChange={setColorOn} />
          <Toggle label="显示 visible" on={visible} onChange={setVisible} />
          <Toggle label="暂停 paused" on={paused} onChange={setPaused} />
        </Row>
      </section>

      <figure className="cell light-hero-cell">
        <div className="stage light-hero">
          <LightFx {...shared} />
          {/* A stand-in for the control layer (the real clock / album art sits at
              z-index 5). It is here to show the light does not wash the text
              out: the wash is below the controls on purpose. */}
          <p className="light-probe">控件层的文字留在这里检查可读性 · z-index 5</p>
        </div>
        <figcaption>hero：上面所有开关都在这一格里生效；鼠标划过时注意光池平移、扇面同时转动</figcaption>
      </figure>

      <LightFitTable variant={variant} />

      <section className="grid grid--light">
        {LIGHT_STAGES.map((entry) => (
          <figure className="cell" key={`${entry.variant}-${entry.anchor}`}>
            <div className={entry.className}>
              <LightFx
                variant={entry.variant}
                anchor={entry.anchor}
                intensity={entry.intensity ?? intensity}
                rays={entry.rays ?? rays}
                flare={entry.flare ?? flare}
                follow={follow}
                smoothing={smoothing}
                sway={sway}
                size={Math.round(LIGHT_PRESETS[entry.variant].size * LIGHT_CELL_SCALE)}
              />
            </div>
            <figcaption>{entry.caption}</figcaption>
          </figure>
        ))}
      </section>

      <footer className="foot">
        默认值：<code>variant="sun"</code>、<code>anchor="top-left"</code>、<code>offsetX</code> /{' '}
        <code>offsetY</code>（省略 → 0）、<code>intensity=100</code>、
        <code>size</code>（省略 → 跟随变体）、<code>rays=1</code>、<code>follow=0.45</code>、
        <code>smoothing=0.12</code>、<code>sway=16</code>、<code>visible=true</code>、<code>paused=false</code>。
        覆盖层铺满定位上下文（<code>position: absolute; inset: 0</code>），<b>不用 <code>anchorStyle</code>
        给自己定位</b>——锚点在这里只用来放<b>光源中心</b>，因为这一层没有自己的盒子；
        层级是 <code>z-index: 2</code>，在氛围粒子（1）之上、控件（spectrum 3 → 指针特效 4 →
        clock / album 5）之下——画面被打亮，文字仍然压得住；想让阳光也扫过时钟，在自己的样式表里抬高这个值。
        最多三层（光池 + 光束 + 光圈），都是 <code>mix-blend-mode: screen</code>，只加亮不蒙版；
        <code>beach</code> 的硬光盘来自预设的 <code>disc=1</code>（把热点的两个内圈往外推、调硬），
        光圈层的位置写成 <code>calc()</code> 引用光源变量，所以它也白拿指针跟随；光束是
        <code>repeating-conic-gradient</code>，角度写在 <code>--wallkit-light-angle</code> 上——
        静止时由锚点推出，移动时按光源<b>当前位置</b>重算并软饱和在 <code>sway</code> 里，靠一层径向
        <code>mask-image</code> 藏掉锥形顶点——
        不遮的话它就是个星芒镜而不是日光。没有 <code>mask-image</code> 的引擎里光束整层不画。
        和 <code>PointerFx</code> / <code>Spotlight</code> 一样自己监听 <code>window</code> 指针事件并把坐标
        映射进自身盒子，盒子外的事件忽略；WE 桌面壁纸默认不投递鼠标事件，实机要看到跟随需开启鼠标交互，
        <b>但光本身不依赖指针</b>。<code>prefers-reduced-motion</code> 下只去掉跟随延迟。
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
        {active === 'clock' && <ClockDemo />}
        {active === 'spectrum' && <SpectrumDemo />}
        {active === 'mini' && <MiniSpectrumDemo />}
        {active === 'album' && <AlbumArtDemo />}
        {active === 'pointer' && <PointerFxDemo />}
        {active === 'ambient' && <AmbientFxDemo />}
        {active === 'spotlight' && <SpotlightDemo />}
        {active === 'frame' && <FrameDemo />}
        {active === 'light' && <LightFxDemo />}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
