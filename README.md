# WallKit

Wallpaper Engine 网页壁纸的**控件浮层库**。

提供时钟、音频频谱、专辑卡片、指针特效等可复用控件，叠加在壁纸背景之上。不包含背景渲染，不包含音频 / 媒体数据采集。

---

## 定位

```
背景层（Spine / Live2D / video …）   ← 各游戏仓库自己实现
外壳层（WE 集成、部署脚本）           ← 各游戏仓库自建，走同一份模板
控件浮层（Clock / Spectrum / …）     ← WallKit 负责
数据采集（音频帧、媒体信息）          ← 各项目自己构建
```

**只做展示。** 组件接收纯数据 props，不读全局状态，不感知背景是什么。

### 不包含

- Spine / Live2D / WebGL 背景渲染
- 音频与媒体数据采集
- 设置抽屉、国际化
- 普通浏览器支持（浏览器读不到系统音频与媒体信息；`PointerFx` / `Spotlight` 只依赖指针事件，浏览器里可直接用，但库仍不为其它控件做浏览器降级）
- npm 发布

---

## 使用方式

WallKit 通过 GitHub git 引用分发，不发布 npm。

```json
{
  "dependencies": {
    "wallkit": "github:mikoberry/wallkit#<commit-sha>"
  }
}
```

固定 `<commit-sha>` 即锁定行为；各 commit 改了什么见 [CHANGELOG.md](CHANGELOG.md)。

```jsx
import { Clock } from 'wallkit/components/clock'

function Controls() {
  // The caller owns the tick: the component holds no timer, so pausing the
  // wallpaper stops the work here too.
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <Clock
      now={now}
      labels={{ locale: 'zh-CN', weekday: '周四', aria: '当前时间与日期' }}
    />
  )
}
```

数据由使用方构建。没有数据时组件不渲染——**不会用假数据兜底**。

`labels` 只承载**需要本地化的文本**，全部字段都是可选的：

| 字段 | 作用 |
|---|---|
| `locale` | 交给 `Intl` 决定月名与日期格式（默认 `en-GB`） |
| `weekday` | 星期文本，覆盖 `Intl` 的结果 |
| `dateWithWeekday` | 整行「日期 星期」，覆盖组件的拼接 |
| `aria` | 无障碍名称 |

日期文本由组件内部的 `formatClockDateParts(now, locale)` 生成，**没有 `date` 或 `dateFormat` 字段**——格式交给 `Intl`，要完全自定义就传 `dateWithWeekday`。

### 常用配置

```jsx
// 布局：card | bar | minimal | cyberpunk | infobar | split | poster | ring | segments | stamp
<Clock now={now} placement="minimal" />
<Clock now={now} placement="ring" />      // 环形进度：外环一天、内环一小时
<Clock now={now} placement="segments" />  // 三段进度条：时 / 分 / 秒
<Clock now={now} placement="stamp" />     // 记录卡：日期 + 年内天数 + 周数

// 主题：dark = 深色文字（配浅色壁纸），light = 浅色文字（配深色壁纸）
<Clock now={now} theme="light" />

// 位置：先选锚点，再从锚点向内偏移。0 = 完全贴角；偏移可以是 CSS 长度
<Clock now={now} anchor="top-right" offsetX={4} offsetY={4} />
<Clock now={now} anchor="top-left" offsetX="100px" offsetY="100px" />
<Clock now={now} anchor="bottom-left" size={120} />   // 默认锚点

// 指针倾斜：false 关闭，或传对象调强度
<Clock now={now} tilt={false} />
<Clock now={now} tilt={{ maxTilt: 25, speed: 4 }} />

// 音频响应：beat 是使用方算好的 0..1 数值
<Clock now={now} beat={bass} beatIntensity={150} beatCurve={1.2} />
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `now` | — | **必选**。`Date`，由使用方驱动，组件不持有定时器 |
| `visible` | `true` | `false` 时不渲染 DOM（倾斜的 rAF 也停止） |
| `placement` | `'card'` | 10 种布局之一，非法值回退 `card` |
| `theme` | `'dark'` | `dark` = 深色文字（配浅色壁纸），`light` = 浅色文字。需与壁纸底色相配 |
| `color` | — | `#rrggbb`，覆盖主文字色（优先于 `theme`），暗 / 淡两级文字从同一色派生。**布局强调色不受它影响**（`ring` / `segments` 的进度填充、`stamp` 刻线、`cyberpunk` 霓虹标题是刻意独立的另一色相）——要用文字同色或换强调色，在包裹层写 CSS 变量（`--wallkit-clock-seg-accent` / `--wallkit-clock-ring-accent` / `--wallkit-clock-stamp-accent` / `--wallkit-clock-cyber-accent`），变量继承进组件即生效 |
| `use24Hour` | `true` | 12 / 24 小时制 |
| `size` | `100` | 尺寸百分比，40–200 |
| `anchor` | `'bottom-left'` | 贴哪个锚点：四角 + 四边中点 + 居中，共 9 个，见下方「锚点与偏移」 |
| `offsetX` / `offsetY` | `0` | 从锚点**向内**的偏移。数字 = 视口百分比，字符串 = 任意 CSS 长度（`'100px'`）。0 完全贴边 |
| `beat` | `0` | 音频节拍 0..1，由使用方算好传入。组件按帧缓动它，直接把原始值喂进来即可 |
| `beatIntensity` | `100` | 音频响应的整体幅度，0–1000 |
| `beatCurve` | `0.62` | 音频响应曲线，0.2–2。越小越平坦，越大越尖锐 |
| `tilt` | `true` | `false` 关闭；`{ maxTilt, speed }` 调节；`maxTilt: 0` 等同关闭 |
| `labels` | `{}` | `{ locale, weekday, dateWithWeekday, aria }`，见上文 |
| `onToggleHourFormat` | — | 可选回调，参数为 `'12'` 或 `'24'` |

**锚点与偏移**：三个浮动控件（`Clock` / `Spectrum` / `AlbumArt`）用同一套定位。`anchor` 描述**两个点重合**：视口上的一个点，和控件上的同名点。`top-left` 把控件左上角钉在视口左上角；`center-left` 把控件左中点钉在视口左中点；`center` 让两个中心重合——所以两个不同尺寸的控件写同一个 `anchor` + 同一个 `offsetX` 就必然同心。

```
top-left    top-center    top-right
center-left    center     center-right
bottom-left bottom-center bottom-right
```

`offsetX` / `offsetY` 从锚点向内计：数字是视口百分比，字符串是任意 CSS 长度（`'100px'`）。所以 `0` 永远等于“完全贴边”，把控件从左边换到右边不需要改偏移量的正负。居中轴上偏移是**带符号的位移**（正 = 右 / 下），这是唯一会用负值的方向；`offset` 一律支持负值，用于有意让控件出血到屏幕外。`ANCHORS` 从 `wallkit/core` 导出，按行排列，可直接拿来生成 3×3 选择器。

这套组合能表达三种常用几何：

```jsx
// 贴底满宽：宽度交给视口，厚度固定
<Spectrum bars={bars} anchor="bottom-center" width="100vw" height="14vh" />

// 距角固定像素：偏移量用 CSS 长度
<Clock now={now} anchor="top-left" offsetX="100px" offsetY="100px" />

// 同心：两个控件钉在同一个点，尺寸各写各的绝对长度
<AlbumArt track={track} variant="vinyl" anchor="center" offsetX={-30} size="34vh" />
<Spectrum bars={bars} variant="ring" anchor="center" offsetX={-30} width="46vh" height="46vh" />
```

### Spectrum

```jsx
import { Spectrum } from 'wallkit/components/spectrum'
import { extractSpectrumBars } from 'wallkit/core'

// 原始 128 帧（0..1）→ 128 根柱；没有数据时得到 null
const bars = frame ? extractSpectrumBars(frame) : null

<Spectrum bars={bars} variant="mirror" colorHex="#7dd3fc" size={100} />
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `bars` | — | **必选**。`Float32Array \| number[]`，各值 0..1。**长度即柱数**（规范 128）；`null` 时不渲染 |
| `visible` | `true` | `false` 不渲染 DOM，也不启动绘制循环 |
| `variant` | `'bars'` | `bars` / `mirror` / `curve` / `pill` / `ring` / `ringwave` / `dots` / `ripples` / `aurora` |
| `colorHex` | — | 只接受 `#rrggbb`；省略时读 `--wallkit-accent`，非法值回退 `#a8c4ff` |
| `size` | `100` | 20–500。100 = 正常大小（条状基准 `30vw × 15vh`）。两轴同比缩放 |
| `width` / `height` | — | 精确覆盖盒子尺寸，优先于 `size` 与各 variant 的规则。数字 = px，字符串 = 任意 CSS 长度。要“贴边满宽、厚度固定”就两个都给 |
| `anchor` | `'bottom-left'` | 同 Clock，9 个锚点 |
| `offsetX` / `offsetY` | `0` | 从锚点向内，0 完全贴边；可传 CSS 长度 |
| `intensity` | `100` | 0–1000。100 = 原始柱高 |
| `curve` | `1` | 0.2–2。响应曲线指数 |
| `paused` | `false` | `true` 冻结画面（取消 rAF），保留控件在屏上 |

**盒子规则分两组**：条状样式（`bars` / `mirror` / `curve` / `pill` / `dots`）用 `30vw × 15vh` 宽条；径向样式（`ring` / `ringwave` / `ripples` / `aurora`）强制方形 `min(30vw, 28vh)` 保正圆——所以同一 `size` 下环形显示范围比柱状小一圈，属刻意设计。`intensity` / `curve` 在绘制入口统一整形，九种样式行为一致；径向样式另有随时间的自转/涟漪/极光动画（`prefers-reduced-motion` 下冻结动画、保留电平响应）。

**柱数不由组件决定**：要画更少/更多柱子，先 `resampleBars(bars, count)` 折叠再传入。九种样式都遵守这一条，`aurora` 也不例外——每根柱子就是一个光晕，128 根就是 128 道细光，折到 7 根才是那几条宽光带。`dots` 是唯一例外：它按画布宽度自动折成 6–48 列。

`visible` 与 `paused` 的区别：前者完全不渲染，后者保留画面但冻结，两者都停止绘制循环。

### MiniSpectrum

填满父容器的频谱，**没有尺寸与位置 props**——盒子由父容器决定，所以能嵌进卡片。与 `Spectrum` 共用同一套绘制循环（`components/shared/`），像素完全一致，差别只在盒子怎么来的。

```jsx
import { MiniSpectrum } from 'wallkit/components/mini-spectrum'

<div style={{ height: 120 }}>
  <MiniSpectrum bars={bars} variant="curve" />
</div>
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `bars` | — | **必选**。同 `Spectrum`；`null` 时不渲染 |
| `variant` | `'bars'` | 同 `Spectrum` 的 9 种 |
| `colorHex` | — | 同 `Spectrum` |
| `barCount` | `32` | 折叠到几根柱子。小尺寸下 128 根会变成一条条线；传 `bars.length` 可关闭折叠 |
| `intensity` / `curve` | `100` / `1` | 同 `Spectrum` |
| `visible` / `paused` | `true` / `false` | 同 `Spectrum` |

> 父容器必须有确定高度，否则 `height: 100%` 会塌成 0。

### AlbumArt

```jsx
import { AlbumArt } from 'wallkit/components/album-art'

<AlbumArt
  track={track}        // { title, artist, albumTitle, thumbnail, primaryColor, playback }
  bars={bars}          // 可选，卡片内嵌频谱
  variant="classic"    // classic | glass | vinyl | minimal | type | bar | cassette | polaroid | cd | poster | ticket
  theme="light"        // light = 浅色文字（深色壁纸），dark = 深色文字（浅色壁纸）
  labels={{ aria: '正在播放' }}
/>
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `track` | — | **必选**。`null` 时不渲染 |
| `bars` | — | 可选。没有时卡片照常显示，只是少了频谱；预留槽位的布局（`bar` / `cassette` / `polaroid` / `ticket`）会连槽位一起收掉，`poster` 的均衡器区消失 |
| `variant` | `'classic'` | 11 种布局；`vinyl` 无频谱，`type` 不渲染封面。列表见 `ALBUM_ART_VARIANTS` |
| `theme` | `'light'` | 与 `Clock` 同一套约定：名字指文字色。`'dark'` 会把卡片自绘的表面（毛玻璃、胶囊、唱片标签）翻成浅色，并把默认 accent 压暗。纸面样式（磁带标签 / 拍立得 / 票根）用固定深色墨、海报用固定浅色墨，不随主题翻转 |
| `colorHex` | — | **只作用于内嵌频谱**；卡片主色来自 `track.primaryColor`。默认 `--wallkit-accent` |
| `size` | `100` | 数字：20–300（`ALBUM_ART_SIZE_MIN/MAX`），100 = 正常大小（封面直径基准 `18vh`）。字符串：封面直径的绝对长度（`'34vh'`），整张卡片都由它派生 |
| `anchor` | `'bottom-left'` | 同 Clock / Spectrum，9 个锚点 |
| `offsetX` / `offsetY` | `0` | 从锚点向内，0 完全贴边；可传 CSS 长度 |
| `paused` | `false` | 停转封面并冻结频谱 |
| `labels` | `{}` | `{ aria, coverAlt }`。`coverAlt` 原样使用（传 `''` 表示装饰图），否则回退到曲名、专辑名 |

内嵌频谱的强度与曲线是**内部常量**（130 / 0.7），不暴露成 props：这组值是为卡片尺寸定的，放出去只能把它改坏；要调响应请直接用 `MiniSpectrum`。

**两种"不渲染"**：`track == null` 不渲染；`track.playback === 'stopped'` 也不渲染。`playback === null` 表示**未知**，按正在播放处理——引擎只在切歌时推送，把未知当成停止会让封面永久消失。

十一种布局各自绑定频谱样式：classic→bars、glass→curve、minimal→bars、type→dots、bar→curve、cassette→bars、polaroid→dots、cd→curve、poster→bars、ticket→bars、vinyl 无图。`type` 是纯排版布局：完全不渲染封面，唯一图形是封面主色（`track.primaryColor`）的竖线和底部一排淡频谱点，卡片高度随内容走。封面每 24s 转一圈，`prefers-reduced-motion` 下不转。

### PointerFx

把鼠标拖尾和点击特效合成一个覆盖层，共用一块 canvas 和一条**按需** rAF 循环。父容器既决定尺寸，也决定指针坐标的原点。

```jsx
import { PointerFx } from 'wallkit/components/pointer-fx'

// 壁纸里：让定位上下文铺满视口，特效就铺满视口
<div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
  <PointerFx trailVariant="glow" clickVariant="ripple" />
</div>

// 想更热闹：上浮气泡拖尾 + 点击烟花（两者叠在同一块 canvas 上）
<div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
  <PointerFx trailVariant="bubble" clickVariant="firework" />
</div>

// 反过来也成立：气泡和烟花在拖尾、点击两个通道都能用
<div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
  <PointerFx trailVariant="firework" clickVariant="bubble" />
</div>

// 拖尾精细、点击张扬：两个通道分别设定尺寸
<div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
  <PointerFx trailVariant="bubble" clickVariant="firework" trailSize={60} clickSize={180} />
</div>
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `visible` | `true` | `false` 不渲染 DOM |
| `trail` / `click` | `true` | 分别开关拖尾与点击特效 |
| `trailVariant` | `'glow'` | `glow` 柔光粒子 / `ribbon` 丝带轨迹 / `bubble` 气泡（小簇上浮、摆动）/ `firework` 烟花（沿途每 4 个采样点一朵小烟花，稀疏轻量） |
| `clickVariant` | `'ripple'` | `ripple` 点击涟漪 / `sparks` 星尘碎点 / `bubble` 气泡（更饱满的一簇上浮）/ `firework` 烟花（中心闪光 + 20 道放射余烬 + 重力下坠） |
| `colorHex` | — | `#rrggbb`；省略时读 `--wallkit-accent`，非法值回退 `#a8c4ff` |
| `size` | `100` | 20–300，拖尾与点击**共用**的默认尺寸，缩放半径、位移与线宽 |
| `trailSize` | 继承 `size` | 20–300，只覆盖拖尾通道；省略 / `null` / 非法值时回退到 `size` |
| `clickSize` | 继承 `size` | 20–300，只覆盖点击通道；省略 / `null` / 非法值时回退到 `size` |
| `intensity` | `100` | 0–300，不透明度百分比（仍是两个通道共用） |
| `paused` | `false` | 冻结画面、丢弃新事件、停掉绘制循环 |

**它和另外四个控件有一处不同**：这是唯一自己采集输入的控件——在 `window` 上监听 `pointermove` / `pointerdown`，与 `Clock` 的 `tilt` 跟随用的是同一套先例（壁纸画布持有指针事件）。事件坐标会映射到覆盖层自身的盒子，落在盒子外的一律忽略，所以一页挂多个实例互不干扰。它**不读 `window.wallpaper*`、不感知背景层、也不生成假轨迹**。

**`bubble` 和 `firework` 在两个通道里都能用**：`trailVariant` 与 `clickVariant` 各接受 4 种取值，共 16 种组合。渲染代码只有一套——`paintBubbles()` / `paintFirework()` 只认「原点 + 种子 + 归一化进度 + 预设」，拖尾与点击各自遍历自己的缓冲调用它，差别只在密度、尺寸和时长：拖尾每 1.2px 就有一个采样点，所以每点只出 2 个气泡、烟花每 4 个 slot 才出 1 朵且只有 8 道余烬；点击是单一事件，气泡出 7 个、烟花出 20 道并带热核。

高频采样写进预分配的环形缓冲，绘制循环只在有新事件时启动、最后一个粒子消亡后立即停止，**不触发任何 React 重渲染**。两种粒子形态也**不存数组**：每个采样点带一个种子，`pointerBubble()` / `pointerFireworkSpark()` 每帧按 `(seed, index)` 重算出同一批粒子，缓冲始终是固定大小。`pointerLife(channel, variant, reduced)` 集中管理 4 类时长（拖尾气泡 1.05s / 点击气泡 1.25s / 拖尾烟花 0.8s / 点击烟花 1.35s，另有扁平形态 0.55s / 0.72s），渲染器用它同时驱动动画与 `alive` 判断。烟花用 `globalCompositeOperation = 'lighter'` 让重叠的光点发亮而不是发灰，`pointerFall()` 做二次下坠。

**两个通道可以分别设定尺寸**：`size` 是共同默认值，`trailSize` / `clickSize` 各覆盖一个通道（`trailSize ?? size`、`clickSize ?? size`，三者都限制在 20–300）。`core` 的 `pointerSizeScale(value, fallback)` 把它们解析成 `trailScale` / `clickScale` 存进绘制设置；`drawTrail` 只读 `trailScale`、`drawBursts` 只读 `clickScale`，共用绘制函数接的是数值 `scale` 而不是整份 settings，所以渲染代码没有按通道复制。尺寸只乘到半径、位移和线宽上，**不改变覆盖层盒子、1.2px 的采样密度和生命周期**，放大点击特效不会连带放大拖尾。

`prefers-reduced-motion` 下拖尾关闭，点击只留一个短暂的静态圆环（四种点击形态统一降级）。

> **WE 环境提醒**：Wallpaper Engine 的桌面壁纸默认不向网页投递鼠标事件（`AGENTS.md` 里也记着「WE 里没有鼠标和键盘焦点」）。收不到事件时画布保持空白，这是正确行为。要在实机看到效果，需要在 WE 里为该壁纸开启鼠标交互；浏览器与 WE 预览窗口可直接看到。因此 `wallpaper.html` 测试页**没有**挂这个组件——那里按 8 秒自动轮换布局，本来也没有鼠标可点。

覆盖层是 `position: absolute; inset: 0; pointer-events: none`，**没有** `anchor` / `offsetX` / `offsetY`——它铺满定位容器，位置由容器决定（`size` / `trailSize` / `clickSize` 只缩放笔触，不移动盒子）。父容器必须有确定尺寸且是定位上下文。局部 `z-index: 4`，需要压在别的控件之上时抬高父容器。

### AmbientFx

全屏氛围粒子层：飘雪、樱花、上浮气泡、水蒸气、雨、雾、落叶。和 `PointerFx` 一样铺满定位容器，也**没有** `anchor` / `offsetX` / `offsetY`。

```jsx
import { AmbientFx } from 'wallkit/components/ambient-fx'

<div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
  <AmbientFx variant="snow" />          {/* 飘雪 */}
  <AmbientFx variant="sakura" />        {/* 樱花瓣 */}
  <AmbientFx variant="bubble" />       {/* 上浮气泡，跟随主题强调色 */}
  <AmbientFx variant="steam" />        {/* 水蒸气：雾的竖直孪生，大团缓升 */}
  <AmbientFx variant="rain" />         {/* 雨：高速细雨丝，随风斜落 */}
  <AmbientFx variant="fog" />          {/* 雾：大团薄雾横向漂移 */}
  <AmbientFx variant="leaves" />       {/* 落叶：之字翻滚、逐叶自转 */}
  <Clock now={now} />                  {/* 控件在它的上层 */}
</div>
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `variant` | `'snow'` | `snow` 匀速下落 + 窄幅横摆 / `sakura` 带风向偏移、大幅摆动、逐片自转 / `bubble` 匀速上浮 + 轻微摇摆 / `steam` 雾的竖直孪生：大团薄雾缓升、边缘淡入淡出 / `rain` 高速细雨丝、随风整体倾斜 / `fog` 大团薄雾横向漂移、边缘淡入淡出 / `leaves` 强风斜落、之字翻滚、逐叶自转。非法值回退 `snow` |
| `visible` | `true` | `false` 不渲染 DOM，也不留 canvas |
| `colorHex` | — | `#rrggbb`。除 `bubble` 外每种形态都有自己的固有色（雪 `#dbe9ff` / 樱 `#f5b8cd` / 蒸气 `#eef1f4` / 雨 `#a8c0dc` / 雾 `#dfe6ee` / 落叶 `#d98a4f`），只有 `bubble` 省略时才回退 `--wallkit-accent` |
| `density` | `100` | 10–300，粒子数量的百分比（相对该形态的预设数量），只改数量不改尺寸 |
| `size` | `100` | 20–300，粒子半径的缩放百分比 |
| `intensity` | `100` | 0–300，不透明度百分比 |
| `speed` | `100` | 20–300，运动速度百分比。缩放整层时钟：位移、摆动、生命期全部同步快慢 |
| `paused` | `false` | 冻结画面并停掉绘制循环，最后一帧留在屏上 |

**小雨 / 大雨（以及大雪小雪）不需要新的变体**，组合现有旋钮即可：

```jsx
<AmbientFx variant="rain" density={45} size={75} intensity={60} speed={70} />   {/* 毛毛雨：稀、短、淡、慢 */}
<AmbientFx variant="rain" />                                                    {/* 中雨：默认 */}
<AmbientFx variant="rain" density={250} intensity={150} speed={160} />          {/* 暴雨：密、浓、急 */}
```

**这一层不采集任何东西**：没有指针监听、没有音频、没有宿主回调。粒子的位置是 `(参数, 时间)` 的纯函数，所以整幅画面每帧从一张固定的参数表重算，**不存粒子数组**（`core/ambient.js` 的 `fillAmbientParticles()` 只写一次，绘制循环只读）。

由此带来三个实际好处：`paused` 只是停止推进时间，恢复时从原处继续、不会跳；窗口缩放后下一帧自动正确映射（位置全部归一化，不存像素）；连续跑十几个小时也不会有状态漂移。每个粒子的下落时长各不相同，所以不会出现「一排雪同时落下」的机械感。

**软边不在绘制循环里算**：`shadowBlur` 和每帧新建渐变的开销在 60fps × 数小时下不可接受，所以每种形态只在离屏 canvas 里画一张 64px 精灵（`sprites.js`），绘制时只做 `drawImage` + 旋转（樱花用 `setTransform`，省掉每片的 `save` / `restore`）。

`prefers-reduced-motion` 下只画一帧静止构图，不动。

`z-index: 1`，**在全部控件之下**（库的层级是 ambient 1 → spectrum 3 → 指针特效 4 → clock / album 5 → spotlight 6），所以雪从时钟背后穿过，文字始终可读。**背景里已经有粒子时不要叠这一层**——WE 编辑器自带粒子效果层，两层不同步的雪比没有更难看；该不该显示由应用层决定，用 `visible` 关掉。

### Spotlight

跟随指针的聚光灯 / 关灯效果：一个亮圈跟着鼠标走，圈外被压暗。和 `PointerFx` / `AmbientFx` 一样铺满定位容器，**没有** `anchor` / `offsetX` / `offsetY`。

```jsx
import { Spotlight } from 'wallkit/components/spotlight'

<Spotlight />                                      {/* 默认：直径 420、软边、圈外压暗 72% */}
<Spotlight size={240} feather={0.1} />             {/* 小光斑 + 接近硬边 */}
<Spotlight dim={0.92} glow={0.35} />               {/* 几乎全黑，只有光圈那点亮 */}
<Spotlight darkColor="#0b1020" lightColor="#ffd9a0" />  {/* 夜色遮罩 + 暖光 */}
<Spotlight smoothing={0} />                        {/* 逐事件直贴，连 rAF 都不开 */}
```

| prop | 默认 | 说明 |
|---|---|---|
| `size` | `420` | 光圈直径，px，80–3000 |
| `feather` | `0.45` | 边缘软硬，占半径的比例 0–1；`0` 是硬边，`1` 的过渡区和一个光圈一样宽 |
| `dim` | `0.72` | 圈外遮罩浓度 0–1 |
| `glow` | `0.22` | 圈内高光强度 0–1；`screen` 混合，只提亮不遮盖，`0` 时不渲染高光层 |
| `darkColor` | `'#000000'` | 暗部颜色（`#rrggbb`） |
| `lightColor` | `'#ffffff'` | 高光颜色（`#rrggbb`） |
| `smoothing` | `0.05` | 跟随延迟，时间常数（秒）0–0.5；`0` 逐事件直贴 |
| `visible` | `true` | `false` 不渲染 DOM |
| `paused` | `false` | 冻结画面并停止监听指针 |

**整层是两层 CSS 径向渐变，没有 canvas、没有绘制循环。** 鼠标移动只改写 `--wallkit-spotlight-x` / `-y` 两个 CSS 变量（百分比，窗口缩放后光圈不跑），零 React 重渲染；`smoothing: 0` 时连 rAF 都不开。

**收到第一个指针事件前遮罩保持全透明**：WE 桌面壁纸默认不投递鼠标事件，若首帧就压黑，整张壁纸会黑屏。没有合成光标来「模拟」这件事——和 `PointerFx` 同一条原则。要在实机看到效果必须在 WE 里为该壁纸开启鼠标交互，浏览器 / 预览窗口可直接看。

`z-index: 6`，**压在全部控件之上**（ambient 1 → spectrum 3 → 指针特效 4 → clock / album 5 → spotlight 6）：遮罩的意义就是把下面的一切压暗。想让时钟始终亮着，在自己的样式表里调低这个值。

### WE 集成（可选）

安装 Vite 插件即可自动把 WE 监听器注入 `index.html` 的 `<head>` 最前面（classic script，早于模块入口）：

```js
// vite.config.js
import { wallkitWE } from 'wallkit/we/vite'

export default defineConfig({
  plugins: [react(), wallkitWE()],  // 默认 audio + media + pause
  // plugins: [react(), wallkitWE({ timeline: true })],  // 需要播放进度时
})
```

React 侧用便利 hooks 把桥接数据变成 props（组件本身仍只认 props，不依赖这层）：

```jsx
import {
  useWallpaperAudio, useWallpaperBeat,
  useWallpaperMedia, useWallpaperPaused,
  useWallpaperProperties,
} from 'wallkit/we'

const bars = useWallpaperAudio()       // Float32Array：稳定引用、原地改写；无数据时全零
const beat = useWallpaperBeat()        // 0..1，供 Clock.beat
const paused = useWallpaperPaused()
const track = useWallpaperMedia(paused)
const props = useWallpaperProperties() // project.json 里声明的用户属性快照
```

用户属性是 `project.json` → 页面的单向推送，没有双向绑定：在 `general.properties` 声明 key，`wallpaperPropertyListener.applyUserProperties` 推给页面（加载时全量，之后只推变化的 key），`useWallpaperProperties()` 读快照。值的量纲要留神——`color` 推下来是 `0..1` 浮点（manifest 里写的是 `0..255`），`file` / `directory` 的路径要拼 `file:///`，未声明的 key 是 `undefined` 而不是 `false`。

`timeline` 默认关闭：WE 官方明确警告 `wallpaperRegisterMediaTimelineListener` 可能永不触发。需要 `useWallpaperTimeline()` 时显式打开；取不到值就保持 `null`，不要用 `0:00` 兜底。

不使用 Vite 的项目仍可手动粘贴四段（加可选 timeline 共五段）内联脚本，见 [WE 集成指南](./docs/we-integration.md) §2.2；`project.json` 的形状仍由使用方保证，库不碰。接口与接线细节见 [`wallkit/we` 设计规格](./docs/we-design.md)。

### project.json 生成（可选，构建期）

`project.json` 里三个坑都是静默失败：`supportsaudioprocessing` 写在顶层（音频回调 0 次）、颜色写成 0–1 浮点（显示黑色）、属性改名后忘改应用层。`wallkit/project` 把形状收进代码，只留会变的部分让人写：

```js
// project.config.js —— 放在你自己的壁纸仓库里
import { color, slider, bool } from 'wallkit/project'

export default {
  file: 'index.html',
  title: '你的壁纸名',
  description: ['这是什么、有什么可调。', '主页 https://… · 源码 https://…'],
  properties: {
    accentColor: color({ text: '强调色', value: '#a8c4ff' }),
    sizeScale: slider({ text: '尺寸倍率', value: 1, min: 0, max: 2, fraction: true }),
    showSeconds: bool({ text: '显示秒', value: true }),
  },
}
```

```bash
node scripts/gen-project.mjs           # 合并写入 public/project.json
node scripts/gen-project.mjs --check   # 只报告漂移，不一致时退出码 1
npm run test:project                   # 工具自测（50 条断言，不需要 WE）
```

这是**手动步骤，不是构建钩子**：编辑器会整份重写这份文件，构建期覆盖会和它打架。合并时 `workshopid` / `version` / `snapshotformat` / `snapshotoverlay` 无条件保留——丢了 `workshopid`，下次发布会变成新建 Workshop 条目。完整规则与属性构造器表见 [project.json 生成工具](./docs/project-tool.md)。

---

## 入口一览

| 入口 | 内容 |
|---|---|
| `wallkit` | 根入口 |
| `wallkit/core` | 环境探测、存储工具、时钟与音频纯函数、锚点常量、类型约定 |
| `wallkit/components/clock` | 日期时间控件 |
| `wallkit/components/spectrum` | 独立浮动的音频频谱控件 |
| `wallkit/components/mini-spectrum` | 填满父容器的频谱（卡片内嵌用） |
| `wallkit/components/album-art` | 专辑卡片控件 |
| `wallkit/components/pointer-fx` | 鼠标拖尾 + 点击特效覆盖层 |
| `wallkit/components/ambient-fx` | 全屏氛围粒子层（飘雪 / 樱花 / 气泡） |
| `wallkit/components/spotlight` | 跟随指针的聚光遮罩（亮圈 + 圈外压暗） |
| `wallkit/we` | WE 数据源 hooks（audio / beat / media / timeline / paused / properties） |
| `wallkit/we/vite` | Vite 插件 `wallkitWE()`，注入 `<head>` 监听器 |
| `wallkit/project` | project.json 生成工具（构建期纯函数，不进运行时） |
| `wallkit/styles` | 主题变量 |

---

## 主题

通过 CSS 变量覆盖：

```css
:root {
  --wallkit-accent: #7dd3fc;
  --wallkit-text: #f8fafc;
  --wallkit-font: 'Noto Sans SC', system-ui, sans-serif;
}
```

---

## 文档

- [架构方案](./docs/architecture.md) — 定位、分层、接口原则、阶段计划
- [Spectrum 设计](./docs/spectrum-design.md) — 频谱组件的接口、定位与渲染方案
- [WE 集成指南](./docs/we-integration.md) — 内联脚本、`project.json`、音频排查
- [抽取映射](./docs/extraction-map.md) — 从现有壁纸项目迁移的代码归属

---

## 本地预览

`playground/` 是一个独立的小 Vite 工程，直接引用 `../src` 的源码，用来查看组件的实际渲染。

```bash
cd playground
npm install
npm run dev          # http://localhost:5174/
```

演示页分五个画廊：**Clock**（10 种布局、深浅主题、尺寸缩放、合成节拍）、**Spectrum**（9 种 `variant`）、**MiniSpectrum**（填满父容器的 9 种样式）、**AlbumArt**（6 种卡片布局、3 组合成曲目、6 种运行状态）和 **PointerFx**（4 种拖尾 × 4 种点击 = 16 组组合，4×4 排布、每行共用一种拖尾，把鼠标移进格子看拖尾、点击看爆点；控制面板可在共用 `size` 与分别设定 `trailSize` / `clickSize` 之间切换）。**合成数据只存在于 playground**，库本身不会生成假数据；PointerFx 不需要合成数据，它消费的是你真实的鼠标事件。

### Wallpaper Engine 测试页

画廊之外还有一个**给 WE 用的单页**：同一屏同时挂载四个控件，音频与媒体数据来自真实的宿主回调，按 8 秒轮换布局并更换背景（2 深 2 亮，主题随背景走），左上角 HUD 显示 WE 探测、音频帧龄、媒体字段与暂停状态。

```bash
cd playground
npm run dev                    # 浏览器预览 http://localhost:5174/wallpaper.html
npm run build:wallpaper        # 产出 dist-wallpaper/，含 project.json
npm run deploy:wallpaper       # 构建并直接同步到 WE 项目目录
```

同一份构建里还有第二个页面 **`layout.html`**（几何验证页）：它同时展示「贴底满宽频谱」「距角 100px 的时钟」「同心唱片 + 环形频谱」三种定位，带参考线（`G` 显隐）和锚点十字。数据是合成的，所以浏览器里就能看，不依赖 WE 回调：

```bash
cd playground
npm run dev                    # http://localhost:5174/layout.html
```

`build:wallpaper` 会把两个页面一起打进 `dist-wallpaper/`。想在 WE 里看这一页，把项目里 `project.json` 的 `"file"` 改成 `"layout.html"`。

`deploy:wallpaper` 默认同步到 `F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\wallpaper`，换机器时用环境变量覆盖：

```bash
WE_PROJECT_DIR="D:\path\to\your\we\project" npm run deploy:wallpaper
```

同步只覆盖构建产物（`assets/`、`wallpaper.html`），**不动** WE 编辑器写的 `preview.gif` 和 `project.json`；`assets/` 会整体替换，避免旧 hash 文件堆积。壁纸正在运行时文件被占用，先切走再重试。`deploy:wallpaper` 只负责拷贝，所以第一次仍需要在 WE 里新建 Web 壁纸并让它指向那个目录。

内联脚本与 `project.json` 的坑（`supportsaudioprocessing` 必须嵌在 `general` 内、属性值的量纲）见 [WE 集成指南](./docs/we-integration.md)。

---

## 状态

P0–P4 已完成，并全部在 Wallpaper Engine 中对接验证正常。P4 验的是插件注入 + hooks 这条新接线，控件 API 未变；P5 起未开始。

P4 之后追加了 `wallkit/we` 的 `properties` 段（`project.json` 用户属性 → `useWallpaperProperties()`）：静态验证通过并已部署到 WE 测试工程，`accentColor` 实机确认能改画面颜色，其余属性的渲染映射与 `PointerFx` / `AmbientFx` / `Spotlight` 三个增量组件见各自设计文档。

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | `core` + `styles` 骨架 | ✅ 完成 |
| P1 | `Clock` | ✅ 完成 |
| P2 | `Spectrum` | ✅ 完成（WE 实机验证通过） |
| P3 | `MiniSpectrum` + `AlbumArt` | ✅ 完成（WE 实机验证通过） |
| P4 | `wallkit/we` + Vite 插件 | ✅ 完成（WE 实机接线复验通过） |
| P5 | 新项目验证 | 未开始 |
| P6 | 模板仓库 | 未开始（等第二个游戏落地后） |

---

## 使用与修改

### 直接使用

git 引用即可，无需其他操作。见上文「使用方式」。

### 修改 WallKit 本身

`node_modules` 中的副本是只读安装结果，直接改不会生效。需要：

1. Fork 本仓库到自己账号
2. 在自己的 fork 上修改
3. 把依赖改为 fork 地址：

```json
"wallkit": "github:<你的用户名>/wallkit#<commit>"
```

注意：fork 之后**不会自动获得上游更新**，需手动 rebase 或 cherry-pick。这是 git 引用模式的固有特性。

### 提交改动

欢迎提 PR，但是否合并完全由作者判断，没有响应时间承诺。

---

## 许可

代码以 [MIT](./LICENSE) 协议开源，可自由使用、修改、分发、商用，需保留版权与许可声明。

### 模型资产不在许可范围内

**MIT 只覆盖本仓库的代码。**

Wallpaper Engine 壁纸所使用的模型、贴图、音频等资产，版权通常属于原游戏或其发行方，**不属于本项目**。本仓库不包含任何此类资产。

如果你要用本库制作壁纸，你需要自行确保所使用资产的合法来源与使用权限。

---

## 维护说明

本项目主要服务于作者自己的壁纸项目。

- 没有 issue 响应时间承诺
- 没有向后兼容承诺
- 没有固定的发布节奏

开源目的是让他人可以自由使用，而非提供支持服务。
