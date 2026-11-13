# WallKit

Wallpaper Engine 网页壁纸的**控件浮层库**。

提供时钟、音频频谱、专辑卡片等可复用控件，叠加在壁纸背景之上。不包含背景渲染，不包含数据采集。

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
- 普通浏览器支持（浏览器读不到系统音频与媒体信息）
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

// 位置：相对左下角的百分比，0 贴边
<Clock now={now} offsetX={4} offsetY={4} size={120} />

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
| `use24Hour` | `true` | 12 / 24 小时制 |
| `size` | `100` | 尺寸百分比，40–200 |
| `offsetX` / `offsetY` | `0` | 距左 / 底边缘的视口百分比，0 贴边 |
| `beat` | `0` | 音频节拍 0..1，由使用方算好传入。组件按帧缓动它，直接把原始值喂进来即可 |
| `beatIntensity` | `100` | 音频响应的整体幅度，0–1000 |
| `beatCurve` | `0.62` | 音频响应曲线，0.2–2。越小越平坦，越大越尖锐 |
| `tilt` | `true` | `false` 关闭；`{ maxTilt, speed }` 调节；`maxTilt: 0` 等同关闭 |
| `labels` | `{}` | `{ locale, weekday, dateWithWeekday, aria }`，见上文 |
| `onToggleHourFormat` | — | 可选回调，参数为 `'12'` 或 `'24'` |

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
| `size` | `100` | 20–500。100 = 正常大小（条状基准 `30vw × 15vh`） |
| `offsetX` / `offsetY` | `0` | 同 Clock，左下锚点 |
| `intensity` | `100` | 0–1000。100 = 原始柱高 |
| `curve` | `1` | 0.2–2。响应曲线指数 |
| `paused` | `false` | `true` 冻结画面（取消 rAF），保留控件在屏上 |

**柱数不由组件决定**：要画更少/更多柱子，先 `resampleBars(bars, count)` 折叠再传入。`dots` 按画布宽度自动折成 6–48 列，`aurora` 固定 7 条带。

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
  variant="classic"    // classic | glass | vinyl | minimal | bar | wall
  theme="light"        // light = 浅色文字（深色壁纸），dark = 深色文字（浅色壁纸）
  labels={{ aria: '正在播放' }}
/>
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `track` | — | **必选**。`null` 时不渲染 |
| `bars` | — | 可选。没有时卡片照常显示，只是少了频谱；`bar` 布局会连频谱槽位一起收掉 |
| `variant` | `'classic'` | 6 种布局；`vinyl` 无频谱。列表见 `ALBUM_ART_VARIANTS` |
| `theme` | `'light'` | 与 `Clock` 同一套约定：名字指文字色。`'dark'` 会把卡片自绘的表面（毛玻璃、胶囊、唱片标签、纸套）翻成浅色，并把默认 accent 压暗 |
| `colorHex` | — | **只作用于内嵌频谱**；卡片主色来自 `track.primaryColor`。默认 `--wallkit-accent` |
| `size` | `100` | 20–300（`ALBUM_ART_SIZE_MIN/MAX`）。100 = 正常大小（封面直径基准 `18vh`） |
| `offsetX` / `offsetY` | `0` | 同 Clock / Spectrum |
| `paused` | `false` | 停转封面并冻结频谱 |
| `labels` | `{}` | `{ aria, coverAlt }`。`coverAlt` 原样使用（传 `''` 表示装饰图），否则回退到曲名、专辑名 |

内嵌频谱的强度与曲线是**内部常量**（130 / 0.7），不暴露成 props：这组值是为卡片尺寸定的，放出去只能把它改坏；要调响应请直接用 `MiniSpectrum`。

**两种"不渲染"**：`track == null` 不渲染；`track.playback === 'stopped'` 也不渲染。`playback === null` 表示**未知**，按正在播放处理——引擎只在切歌时推送，把未知当成停止会让封面永久消失。

六种布局各自绑定频谱样式：classic→bars、glass→curve、minimal→bars、bar→curve、wall→dots、vinyl 无图。封面每 24s 转一圈，`prefers-reduced-motion` 下不转。

### WE 集成（可选）

> ⚠️ **`wallkit/we` 与 `wallkit/we/vite` 目前是空占位（P4 未实现）。**
>
> - `wallkit/we/vite` 可以导入，但插件是空的：**不注入任何脚本，也不报错**，音频会静默不工作。
> - `wallkit/we` 目前只有 `export {}`，导入 hooks 会在构建期报 `does not provide an export named 'useWallpaperAudio'`。
>
> 现在要拿真实音频，请手动把内联脚本粘进 `index.html` 的 `<head>`，见 [WE 集成指南](./docs/we-integration.md) §2.2。

P4 完成后的用法是安装 Vite 插件自动注入监听器：

```js
// vite.config.js
import { wallkitWE } from 'wallkit/we/vite'

export default defineConfig({
  plugins: [react(), wallkitWE()],
})
```

或使用便利 hooks：

```jsx
import { useWallpaperAudio, useWallpaperMedia } from 'wallkit/we'

const bars = useWallpaperAudio()
const track = useWallpaperMedia()
```

详见 [WE 集成指南](./docs/we-integration.md)。

---

## 入口一览

| 入口 | 内容 |
|---|---|
| `wallkit` | 根入口 |
| `wallkit/core` | 环境探测、存储工具、时钟与音频纯函数、类型约定 |
| `wallkit/components/clock` | 日期时间控件 |
| `wallkit/components/spectrum` | 独立浮动的音频频谱控件 |
| `wallkit/components/mini-spectrum` | 填满父容器的频谱（卡片内嵌用） |
| `wallkit/components/album-art` | 专辑卡片控件 |
| `wallkit/we` | WE 数据源 hooks（P4 计划中，暂无实现） |
| `wallkit/we/vite` | Vite 插件（P4 计划中，暂无实现） |
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

演示页分四个画廊：**Clock**（10 种布局、深浅主题、尺寸缩放、合成节拍）、**Spectrum**（9 种 `variant`）、**MiniSpectrum**（填满父容器的 9 种样式）和 **AlbumArt**（6 种卡片布局、3 组合成曲目、6 种运行状态）。**合成数据只存在于 playground**，库本身不会生成假数据。

### Wallpaper Engine 测试页

画廊之外还有一个**给 WE 用的单页**：同一屏同时挂载四个控件，音频与媒体数据来自真实的宿主回调，按 8 秒轮换布局并更换背景（2 深 2 亮，主题随背景走），左上角 HUD 显示 WE 探测、音频帧龄、媒体字段与暂停状态。

```bash
cd playground
npm run dev                    # 浏览器预览 http://localhost:5174/wallpaper.html
npm run build:wallpaper        # 产出 dist-wallpaper/，含 project.json
npm run deploy:wallpaper       # 构建并直接同步到 WE 项目目录
```

`deploy:wallpaper` 默认同步到 `F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\wallpaper`，换机器时用环境变量覆盖：

```bash
WE_PROJECT_DIR="D:\path\to\your\we\project" npm run deploy:wallpaper
```

同步只覆盖构建产物（`assets/`、`wallpaper.html`），**不动** WE 编辑器写的 `preview.gif` 和 `project.json`；`assets/` 会整体替换，避免旧 hash 文件堆积。壁纸正在运行时文件被占用，先切走再重试。`deploy:wallpaper` 只负责拷贝，所以第一次仍需要在 WE 里新建 Web 壁纸并让它指向那个目录。

内联脚本与 `project.json` 的坑（`supportsaudioprocessing` 必须嵌在 `general` 内、`type` 必须大写）见 [WE 集成指南](./docs/we-integration.md)。

---

## 状态

P0–P3 已完成，P2–P3 待实机验证；P4 起未开始。

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | `core` + `styles` 骨架 | ✅ 完成 |
| P1 | `Clock` | ✅ 完成 |
| P2 | `Spectrum` | ✅ 实现完成，待实机验证 |
| P3 | `MiniSpectrum` + `AlbumArt` | ✅ 实现完成，待实机验证 |
| P4 | `wallkit/we` + Vite 插件 | 未开始（`exports` 占位入口已存在） |
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
