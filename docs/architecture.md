# WallKit 架构方案

> 状态：P0–P3 已实现（Clock / Spectrum / MiniSpectrum / AlbumArt），P2–P3 待实机验证；P4 起未开始
> 最后更新：2026-11-13
>
> 相关文档：[WE 集成指南](./we-integration.md) · [抽取映射](./extraction-map.md) · [Spectrum 设计](./spectrum-design.md)
>
> 本文锁定的是**分层与接口原则**，具体 Props 以 `src/` 源码的 JSDoc 为准。阶段进度见 §14，与源码不一致时以源码为准。

## 1. 项目定位

**WallKit 是 Wallpaper Engine 网页壁纸的控件浮层库。**

它只负责一件事：在壁纸画布之上渲染信息控件（时钟、频谱、专辑封面等），并且**只接收纯数据**。

### 1.1 明确不做的事

| 不做 | 原因 |
|---|---|
| 背景渲染（Spine / Live2D / Three.js / 视频） | 每个项目的背景实现不同，由使用方自己实现 |
| 数据采集（音频帧、歌曲信息） | 由使用方构建，组件只消费 |
| 通用 Web 支持 | 浏览器读不到系统音频和媒体信息，降级只能是假数据 |
| 发布 npm | 仅通过 GitHub git 引用分发 |
| 抽屉 / 设置面板 | 体积大（原实现 65KB）、依赖重，属于应用层 |
| 国际化 | 由使用方传入文案，库内不内置语言包 |

### 1.2 目标用户

**主要使用者是作者本人**；仓库以 MIT 协议开源，允许他人使用和修改。

这个组合决定了设计取舍：

| 取舍点 | 结论 | 理由 |
|---|---|---|
| 向后兼容 | 不承诺 | 主用户是自己，破坏性变更是允许的 |
| 语义化版本 | 不严格 | 按 commit 引用，版本号仅作标记 |
| npm 发布 | 不做 | 主用户走 git 引用就够 |
| 文档站 | 不做 | 仓库内 Markdown 足够 |
| 抽象层 | 不做投机抽象 | 只有主用户自己的需求是真实需求 |
| 他人 PR | 欢迎但不承诺 | 合并由作者单方面判断，无 SLA |

**关键区分**：开源意味着"别人可以读、可以用、可以改"，**不意味着**作者承诺维护、响应 issue 或保持兼容。这一点在 README 中写明。

因此"不需要为假设的第三方使用者增加抽象层"这条依然成立——他人 fork 后自行修改的成本，由 fork 者承担。

---

## 2. 分层模型

WallKit 面向"同一作者的多款壁纸"。一个 WE 壁纸项目的完整构成是**三层**，而 WallKit 只承担其中一层：

```
一个 WE 壁纸项目 =
    背景层（游戏相关）        → 各自仓库实现
  + 外壳层（所有壁纸通用）    → 由使用方自建，建议走同一份模板
  + 控件层（所有壁纸通用）    → WallKit
```

### 2.1 三层职责

```
┌─────────────────────────────────────────────────────┐
│  游戏仓库（如 anime-model-viewer）× N                 │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ 背景层：Spine / Live2D / 静态图 / 3D / 视频     │  │  ← 各游戏不同
│  │ 模型资产、点击区域、动作映射、是否带背景         │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ 外壳层：WE 公共集成                             │  │  ← 每个游戏相同
│  │ 内联脚本、环境探测、暂停分发、点击骨架、          │  │
│  │ project.json 校验、部署脚本、Vite 配置          │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ 控件层：<Clock/> <Spectrum/> <AlbumArt/>       │  │  ← WallKit 提供
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 2.2 控件层的硬约束

**控件层不知道背景是什么，也不知道数据从哪来。** 它只认 props。

任何让控件层去读 `window.wallpaper*`、去查 canvas 尺寸、去感知背景层的设计都应被拒绝。

### 2.3 外壳层为什么没有独立成库

外壳层的全部内容（内联脚本注入、环境探测、暂停分发、`project.json` 校验）已经在 `wallkit/we` 与 `wallkit/we/vite` 中提供。**物理上它在 WallKit 包内，逻辑上它是外壳层**。

不拆成独立仓库的理由：

- 只有一名维护者，两个仓库的同步成本高于收益。
- `exports` 子路径已提供物理隔离：只做控件的项目 import `wallkit/components/*`，不会触及 `wallkit/we`。
- 未来若 `wallkit/we` 体量增长到需要独立演进，因为有子路径边界，拆分成本很低。

**划分原则**：判断某段代码属于哪层，看它是否**依赖模型格式或具体游戏**。依赖 → 游戏仓库；不依赖 → WallKit 或外壳层。

---

## 3. 分发方式：单包 + 子路径导出

### 3.1 为什么不是 monorepo

npm 的 git 依赖（`github:user/repo`）**只能指向仓库根**，无法指向 `packages/xxx`。

如果采用 pnpm workspace 多包结构，要让其他项目引用就必须：

- 每个包拆成独立 GitHub 仓库（维护成本高），或
- 使用 git submodule（引用方体验差）。

而"不发 npm、靠 git 引用"是本项目的既定前提，所以多包结构无法使用。

**结论：单包 + `exports` 子路径导出。**

### 3.2 package.json

```json
{
  "name": "wallkit",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".":                        "./src/index.js",
    "./core":                   "./src/core/index.js",
    "./components":             "./src/components/index.js",
    "./components/clock":       "./src/components/clock/index.js",
    "./components/spectrum":    "./src/components/spectrum/index.js",
    "./components/mini-spectrum": "./src/components/mini-spectrum/index.js",
    "./components/album-art":   "./src/components/album-art/index.js",
    "./we":                     "./src/we/index.js",
    "./we/vite":                "./src/we/vite-plugin.js",
    "./styles":                 "./src/styles/index.css"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  }
}
```

`exports` 是封闭的：未列出的路径外部无法 import。内部文件结构可以自由重构，不影响使用方。

### 3.3 使用方接入

```json
{
  "dependencies": {
    "wallkit": "github:mikoberry/wallkit"
  }
}
```

锁定版本（推荐）：

```json
"wallkit": "github:mikoberry/wallkit#<commit-sha>"
```

代码：

```js
import { Clock } from 'wallkit/components/clock'
import { Spectrum } from 'wallkit/components/spectrum'
```

### 3.4 单包方案的代价

| 代价 | 影响 | 缓解 |
|---|---|---|
| 无法独立版本化 | 组件不能各自打版本 | 按 commit 引用即可，个人使用无影响 |
| 依赖无法按入口隔离 | 装了 wallkit 就有全部依赖 | 保持零重依赖；需要时用 `optionalDependencies` |
| tree-shaking 依赖打包器 | barrel 入口可能多引入 | 主路径使用深路径导入，`wallkit/components` 仅作便利入口 |
| 无构建步骤 | 源码即产物 | 保持 `.jsx` 源码，由使用方 Vite 编译 |

**关于构建**：本项目**不设编译步骤**。`src/` 下的源码直接被使用方的 Vite 编译。这样 git 安装时无需 `prepare` 脚本，也没有构建产物与源码不同步的风险。

---

## 4. 仓库结构

```
wallkit/
├── package.json              # 唯一
├── README.md
├── AGENTS.md                 # 给 AI / 协作者的执行规则与边界
├── LICENSE
├── docs/
│   ├── architecture.md       # 本文件
│   ├── spectrum-design.md    # Spectrum 接口与渲染方案
│   ├── we-integration.md     # WE 工程集成与排查
│   └── extraction-map.md     # 与原项目的抽取映射
├── src/
│   ├── index.js              # "." 入口，re-export core + components
│   ├── core/                 # 纯函数与工具，无 React
│   │   ├── index.js          # 统一 re-export
│   │   ├── env.js            # isWallpaperEngine / isWallpaperAudioAvailable
│   │   ├── storage.js        # createStore(namespace)
│   │   ├── clock.js          # 时间格式化、倾斜、缓动、进度 / 周数
│   │   ├── audio.js          # 频谱数据纯函数（抽取、平滑、重采样、整形）
│   │   └── types.js          # JSDoc 类型约定（无运行时导出）
│   ├── components/
│   │   ├── index.js          # 便利 barrel
│   │   ├── shared/           # 内部模块，不进 exports
│   │   │   ├── renderers.js          # 9 种绘制函数 + SPECTRUM_RENDERERS
│   │   │   └── SpectrumCanvas.jsx    # Spectrum / MiniSpectrum 共用画布与循环
│   │   ├── clock/
│   │   │   ├── index.js
│   │   │   ├── Clock.jsx
│   │   │   └── Clock.css
│   │   ├── spectrum/
│   │   │   ├── index.js
│   │   │   ├── Spectrum.jsx          # 定位外壳：视口锚点 + size + variant 类名
│   │   │   └── Spectrum.css
│   │   ├── mini-spectrum/
│   │   │   ├── index.js
│   │   │   ├── MiniSpectrum.jsx      # 填满父容器，默认折叠到 32 柱
│   │   │   └── MiniSpectrum.css
│   │   └── album-art/
│   │       ├── index.js
│   │       ├── AlbumArt.jsx          # 6 种布局，内嵌 MiniSpectrum
│   │       └── AlbumArt.css
│   ├── we/                   # P4 占位：WE 数据源 hooks + 内联脚本
│   │   ├── index.js
│   │   └── vite-plugin.js
│   └── styles/
│       └── index.css         # CSS 变量与基础 token
└── playground/               # 本地开发预览（不参与分发）
```

**尚未创建**（计划中，不要在不存在的目录里放代码）：`we/audio.js`、`we/media.js`、`we/pause.js`、`we/inline/`（P4）。

`components/shared/` 是两个频谱控件的共同实现，**有意不进 `exports`**：它不是对外接口，外部只认 `spectrum` / `mini-spectrum`。

早前设计里的 `core/pausable.js` **不会实现**：暂停感知统一由 `wallkit/we` 的 hook 承担（见 §10），`core` 保持纯函数、不订阅事件。

---

## 5. 组件接口

### 5.1 设计原则

1. **纯展示**：组件不做数据采集、不做持久化、不发网络请求。
2. **数据即 props**：所有可变数据通过 props 传入。
3. **无数据即不渲染**：数据缺失时返回 `null`，**不使用合成数据兜底**。

第 3 条是硬约束。原实现中浏览器会用 `syntheticSpectrum` 生成假数据，作为库这会造成极难排查的误解（用户以为在看真实音频）。合成数据只允许出现在 `playground/` 中，并且显式构造。

4. **命名与 Props 重新设计**：不沿用原项目的命名。原项目的 `offsetX/offsetY/scale` 等参数是应用层的调参结果，库接口应从通用性出发重新定义。

### 5.2 数据形状约定

```js
/**
 * @typedef {Float32Array|number[]} SpectrumBars
 *   归一化到 0..1 的柱状值。长度即柱数（规范 128），
 *   null/空数组表示无数据，组件直接返回 null。
 */

/**
 * @typedef {Object} TrackInfo
 * @property {string} title
 * @property {string} artist
 * @property {string} albumTitle
 * @property {string} thumbnail      封面图 URL，可为空字符串
 * @property {string} primaryColor   宿主提供的主色，可为空
 * @property {string} textColor      宿主提供的文字色，可为空
 * @property {'playing'|'paused'|'stopped'|null} playback  null 表示未知
 */
```

**定位不走 `Placement` 对象。** 早前设想的 `{ anchor, offsetX, offsetY, scale }` 未采用：所有浮层控件统一用三个平铺 prop，锚点固定为定位上下文的**左下角**。

| prop | 含义 |
|---|---|
| `offsetX` / `offsetY` | 距左边缘 / 底边缘的视口百分比，0 贴边 |
| `size` | 整体缩放百分比，100 = 正常大小（Clock 40–200，Spectrum 20–500，AlbumArt 20–300） |

这样同一壁纸里挂两块控件时坐标心智一致，也不必为"锚点在右上角"维护一套换算。细节见 [spectrum-design.md](./spectrum-design.md) §4。

### 5.3 组件清单

| 组件 | 入口 | 职责 | 阶段 | 状态 |
|---|---|---|---|---|
| `Clock` | `wallkit/components/clock` | 日期时间显示，10 种布局，可选 3D 指针倾斜 | P1 | ✅ |
| `Spectrum` | `wallkit/components/spectrum` | 独立浮动的柱状频谱，9 种样式 | P2 | ✅ 待实机验证 |
| `MiniSpectrum` | `wallkit/components/mini-spectrum` | 填满父容器的紧凑频谱 | P3 | ✅ |
| `AlbumArt` | `wallkit/components/album-art` | 专辑卡片：封面 + 曲目信息 + 迷你频谱 | P3 | ✅ |

**实现顺序：Clock 优先，完成并验证后再做 Spectrum。**（已按此顺序落地：P1 Clock → P2 Spectrum → P3 MiniSpectrum/AlbumArt。）

`Spectrum` 排在 `MiniSpectrum` / `AlbumArt` 之前，因为它与 `Clock` 同属「独立浮层」类控件，各自需要自己的定位与挂载方式；而 `MiniSpectrum` 是被 `AlbumArt` 内部消费的子组件，一起做更合理。

已落地的 Props 以源码 JSDoc 为准：`Clock` 见 `src/components/clock/Clock.jsx`，`Spectrum` 见 `src/components/spectrum/Spectrum.jsx` 与 [spectrum-design.md](./spectrum-design.md)，`MiniSpectrum` / `AlbumArt` 见各自目录。

**P3 的两个取舍**（原「未决事项」，现已定）：

- **共享绘图层**：`MiniSpectrum` 是第二个消费者，因此 `renderers.js` 提到 `components/shared/`，并把绘制循环一并抽成 `SpectrumCanvas`。两个控件像素一致，差别只在盒子怎么来的。
- **`AlbumArt` 的 `bars` 可选**：没有频谱时卡片仍显示封面与文字；`vinyl` 布局本来就没有图，`bar` 布局会把那条 38% 的频谱槽位一起收掉。

**`AlbumArt` 的 `theme`**（P3 补齐）：与 `Clock` 同一套约定——名字指**文字色**，`light` 是浅色文字（深色壁纸），`dark` 是深色文字（浅色壁纸）。`--theme-dark` 除了换 ink 变量，还会把卡片自绘的表面（毛玻璃、胶囊、唱片标签、纸套）翻成浅色，并把 `--wallkit-accent` 压暗，否则浅底上的频谱看不见。唱片本体与木架保持深色：它们是物件，不是文字底板。

### 5.4 组件不做的事

- 不读写 `localStorage`（如需要，由使用方持有状态）
- 不感知 WE 暂停状态（由使用方传入或暂停 hooks 处理）
- 不设置全局 z-index 层级
- 不内置任何语言文案（文案通过 props 传入）
- 不引入除 React 外的运行时依赖
- **不内置定时器**：时间等随时间变化的数据由使用方驱动传入

### 5.5 已确定的设计决策

以下决策在 P1 之前锁定，避免实现过程中反复摇摆。

#### Clock：时间必须由使用方传入

```jsx
<Clock now={new Date()} />
```

`now` 为 **必需 prop**，组件内部**不持有定时器**。

理由：

- 组件保持纯粹，便于测试和复用。
- 轮询节奏由使用方控制（WE 暂停时需要停止轮询以省电）。
- 多个控件共享同一时间源时不会各自走表。

使用方写法：

```jsx
const [now, setNow] = useState(() => new Date())

useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 1000)
  return () => clearInterval(id)
}, [])
```

后续可由 `wallkit/we` 提供 `useClock()` 便利 hook，但组件本身不内置。

#### Clock：文案通过字符串传入

`labels` 为**字符串对象**，不使用格式化函数：

```jsx
<Clock
  now={now}
  labels={{
    locale: 'zh-CN',
    weekday: '周四',
    aria: '当前时间与日期',
  }}
/>
```

| 字段 | 作用 |
|---|---|
| `locale` | 交给 `Intl.DateTimeFormat` 决定月名与日期格式（`zh-CN` → `2026年11月13日`，`en-GB` → `13 November 2026`） |
| `weekday` | 星期文本，覆盖 `Intl` 的结果 |
| `dateWithWeekday` | 直接给出「日期 星期」整行，覆盖组件的拼接结果 |
| `aria` | 无障碍名称 |

**不要传 `date`**：该字段不存在，会被静默忽略。日期文本由 core 的 `formatClockDateParts(now, locale)` 生成，`labels.dateWithWeekday` 是唯一的一行级覆盖手段。

理由：

- 时间 / 日期的数值永不通过 `labels` 传：它们从 `now` 派生，重复传入会让两块数据互相打架。
- 需要承载语言差异的只有文本与格式：`locale` 决定格式，`weekday` / `dateWithWeekday` 兜住 `Intl` 表达不了的写法（如「周四」这种中文简写）。
- 传函数会让组件承担调用时机与缓存的责任，增加不必要的耦合。

#### Clock：指针倾斜可配置

`tilt` 接受布尔或配置对象，由 `normalizeTilt()` 归一化：

```jsx
<Clock now={now} tilt={false} />                       // 关闭
<Clock now={now} />                                    // 默认 14° / 8
<Clock now={now} tilt={{ maxTilt: 25 }} />             // 更大的倾角
<Clock now={now} tilt={{ maxTilt: 8, speed: 4 }} />    // 轻微、更慢
```

| 字段 | 默认 | 范围 | 含义 |
|---|---|---|---|
| `maxTilt` | 14 | 0–45 | 鼠标位于窗口边缘时的最大倾角（度） |
| `speed` | 8 | 0.5–30 | 每秒追上目标的速度，越大越跟手 |

设计要点：

- **向后兼容**：`tilt={false}` 与 `tilt`（布尔）行为不变，对象形态是纯增量。
- **`maxTilt: 0` 等同关闭**：此时不启动 rAF 循环，避免跑一个永远不动的动画。
- **钳制上下限**：`maxTilt` 超过 45 度会让卡片翻向观察者之外；`speed` 过小接近冻结，过大则失去缓动效果。
- **尊重 `prefers-reduced-motion`**：系统要求减弱动效时直接不跟随，不看配置值。

底层 `computeClockTilt(point, bounds, { maxTilt })` 本身已支持该参数，组件只是把它透出。

#### Clock：三种几何布局（P1 补充）

原有 7 种布局都是「文字排版的变体」。新增的 3 种改用**图形结构**表达时间，视觉语言与前 7 种不同：

| 布局 | 表达方式 | 依赖数据 |
|---|---|---|
| `ring` | SVG 双环：外环 = 一天已过比例，内环 = 一小时已过比例，文字位于环心 | `clockProgress()` |
| `segments` | 三段离散进度条：时/分/秒，各自表示当前值在本单位中的占比 | 时/分/秒 数值 |
| `stamp` | 记录卡：月日大字 + 分隔线 + 年内第几天 / 第几周 | `calendarPosition()` |

设计约束：

- **派生数据放在 core**：`clockProgress()`、`ringDash()`、`calendarPosition()` 都是纯函数，组件只负责调用与排版。年内天数和 ISO 周数的边界情况（第 1 周可能跨年、第 1 天不一定是第 1 周）在 core 中处理，使用方不必重写。
- **格段用渐变而非 DOM**：60 个格子会产生 180 个元素。`segments` 用一个 `repeating-linear-gradient` 画出格段，填充部分用 `clip-path` 裁切。伪元素必须**铺满整条宽度**再做裁切——若用 `width` 缩放到比例，渐变百分比会随之缩放，格子全部错位。
- **数字与条必须同义**：`segments` 的数字表示当前值，条表示该值在本单位中的占比（`09` 时 → 9/24 = 37.5%），不是「本小时内已过多少分钟」。后者会让 `09` 配 3.3% 的条，视觉上自相矛盾。
- **`ring` 的文字要避让内环**：内环半径 36%，环心文字块限制在 64% 宽度内，否则文字压到描边上。

#### Clock：音频响应曲线可配置

`beatCurve` 是 `beat` 的幂指数，决定响应曲线形状：

```jsx
<Clock now={now} beat={bass} beatCurve={0.62} />  // 默认，中等
<Clock now={now} beat={bass} beatCurve={0.3} />   // 平坦饱满，细微变化也明显
<Clock now={now} beat={bass} beatCurve={1.5} />   // 尖锐，弱信号几乎不响应
```

同一 `beat` 值在不同曲线下的响应：

| beat | curve 0.2 | curve 0.62 | curve 1 | curve 2 |
|---|---|---|---|---|
| 0.1 | 0.631 | 0.240 | 0.100 | 0.010 |
| 0.3 | 0.786 | 0.474 | 0.300 | 0.090 |
| 0.5 | 0.871 | 0.651 | 0.500 | 0.250 |
| 1.0 | 1.000 | 1.000 | 1.000 | 1.000 |

设计理由：

- **它是渲染参数，不是数据加工**：`beatIntensity` 已经暴露，曲线同属「响应怎么呈现」，留在硬编码里不一致。
- **钳制 0.2–2**：低于 0.2 时几乎所有输入都饱和到 1（失去动态），高于 2 时中等音量几乎无响应。
- **默认 0.62 沿用原项目值**：真实音乐的低频很少超过半幅，抬升曲线让普通音量落在可见区间，同时让真峰值仍读作满强度。

#### Spectrum：排在 Clock 之后实现

`Spectrum` **在计划内**，实现顺序排在 `Clock` 之后：先完成并验证 Clock 的接口设计，再做 Spectrum。（已完成。）

顺序安排的理由：

- Clock 是最简单的独立浮层控件，适合用来验证「纯 props、无状态」的接口模式。
- 该模式确认有效后，Spectrum 沿同一套模式实现，风险更低。
- Spectrum 的定位方式较复杂，等 Clock 验证过基础模式后再定，能避免一上来就抽象错误。

**定位设计已定（原三选一方案作废）**：没有 `Placement` 对象、没有 `anchor`，直接用 `offsetX` / `offsetY` / `size` 三个平铺 prop，锚点固定左下角（见 §5.2）。当初列的三个方案（`{anchor,…}` / `position + offset` / 视口中心 `{x,y,scale}`）都引入了"锚点在哪"的换算，而两种控件实际只需要一个锚点，平铺三个数字更短也更好记。

**必须保留的约束**：Canvas 尺寸必须用 `offsetWidth` / `offsetHeight` 测量，不能用 `getBoundingClientRect`——后者返回缩放后的尺寸，会导致双重缩放。

---

## 6. 样式与主题

控件通过 **CSS 变量**暴露主题接口，前缀 `--wallkit-`：

```css
/* 使用方覆盖 */
:root {
  --wallkit-accent: #7dd3fc;
  --wallkit-text: #f8fafc;
  --wallkit-font: 'Noto Sans SC', system-ui, sans-serif;
}
```

- 每个组件自带同名 CSS，由组件自身 import，使用方无需手动引入。
- `wallkit/styles` 仅提供 token 定义与基础重置，可选。
- 不使用 CSS-in-JS，不引入样式框架。

### 层级约定

组件内部只使用**局部** z-index（相对自身的层叠上下文），不设全局层级。控件与背景层的相对层级由使用方通过包裹容器的 `position` / `z-index` 决定。

---

## 7. WE 集成的边界

### 7.1 由使用方负责

- `project.json` 的形状（`general.supportsaudioprocessing` 必须嵌套在 `general` 内，`type` 必须是 `"Web"`）
- 背景层实现与画布管理
- 数据构建（音频帧、媒体信息）
- 应用状态（选中模型、偏好持久化）

### 7.2 由 WallKit 负责（可选模块 `wallkit/we`，P4 未实现）

> 现状：`src/we/index.js` 只有 `export {}`（导入 hooks 会在构建期报错），`src/we/vite-plugin.js` 返回空 plugin（不注入脚本、也不报错）。**目前唯一可用路径是手动粘贴内联脚本**，见 [we-integration.md](./we-integration.md) §2.2。

**数据源 hooks**（计划中，第二个壁纸项目会需要）：

```js
import { useWallpaperAudio, useWallpaperMedia, useWallpaperPaused } from 'wallkit/we'

const bars = useWallpaperAudio()   // Float32Array | null
const track = useWallpaperMedia()  // TrackInfo | null
const paused = useWallpaperPaused() // boolean
```

这些 hooks **只是便利封装**，不是必须的。使用方完全可以自己实现数据采集，组件不关心数据来源。

**Vite 插件**：计划自动向 `index.html` 的 `<head>` 最前面注入 WE 监听器内联脚本。

详见 [we-integration.md](./we-integration.md)。

### 7.3 插件的行为约束

- 只注入脚本，不注册组件、不做 Provider、不改全局状态。
- 必须幂等（用 HTML 注释标记去重）。
- 支持按需注入（`audio` / `media` / `pause`）。
- 开发与生产模式行为必须一致。
- 不触碰 `project.json`。
- 不安装插件时，文档提供可直接粘贴的 `<script>` 块。

---

## 8. 环境探测

`wallkit/core/env.js` 提供：

```js
export function isWallpaperEngine(): boolean
```

判定依据必须与现有实现一致（见 [extraction-map.md](./extraction-map.md)）：通过 `window.wallpaperPropertyListener` 等宿主注入标识判断，**不能在浏览器中误判为 WE 环境**。

这条很关键：原项目曾因无条件创建 `wallpaperPropertyListener` 导致浏览器里也判定为 WE，隐藏了模型选择器并让抽屉收起。

---

## 9. 国际化

**库内不提供 i18n**：没有语言包、没有语言切换、没有 `t()`。

库只提供两件事：`locale` 透传给 `Intl`，以及几个可覆盖的文本字段。其余全部由使用方传入：

```jsx
<Clock
  now={now}
  labels={{
    locale: 'zh-CN',            // 决定 Intl 的日期 / 月名格式
    weekday: '周四',            // 覆盖 Intl 的星期文本
    aria: '当前时间与日期',
  }}
/>
```

- **没有 `dateFormat` 之类的格式串**：格式由 `Intl.DateTimeFormat` 按 `locale` 决定，不手写 `yyyy-MM-dd` 这种模板。要完全自定义日期行，用 `labels.dateWithWeekday` 给整行字符串。
- 字段清单见 §5.5「文案通过字符串传入」。
- `AlbumArt` 只认 `labels.aria` / `labels.coverAlt` 两个字段。**没有空态文案**：`track == null` 时整块不渲染，要不要显示"暂无播放"由使用方在自己的容器里决定。

使用方自己维护语言包（如原项目的 `src/i18n.js`，44KB，保留在应用层）。

---

## 10. 暂停与功耗

控件层自身不轮询 WE 暂停状态。使用方需要处理时，按组件能力选：

| 组件 | 手段 |
|---|---|
| `Clock` | 停止更新 `now`（它没有 `paused`，也没有数据定时器）；`visible={false}` 摘掉 DOM |
| `Spectrum` | `paused` prop：`true` 时取消 rAF，循环完全停止 |
| 通用 | 使用 `wallkit/we` 的 `useWallpaperPaused()`（P4），或在应用层卸载控件 |

原实现中 `Clock` 每秒轮询一次，`AlbumArt` 每秒轮询一次媒体状态——这些轮询属于数据构建层，随数据构建一起迁移到应用层。

---

## 11. 存储

库内**不直接使用 localStorage**。

`wallkit/core/storage.js` 提供可选工具，供使用方持有偏好：

```js
import { createStore } from 'wallkit/core'
const store = createStore('my-wallpaper')   // 使用方定义 namespace
```

原项目所有偏好键（`spine-viewer:*`）继续留在应用层，保持现有数据兼容。

---

## 12. 多壁纸仓库协作规范

WallKit 服务于 N 个游戏壁纸仓库（如 anime-model-viewer 及后续项目）。N 个仓库引用同一个库仓库时，有三条规范必须遵守，否则一次推送可能同时弄坏所有壁纸。

### 12.1 引用锁定 commit，不用分支名

```json
// 正确：锁定 commit
"wallkit": "github:mikoberry/wallkit#a1b2c3d"

// 危险：跟随分支
"wallkit": "github:mikoberry/wallkit#main"
```

固定 commit 的效果：改 WallKit 后，任何仓库都不会自动受影响；需要升级时在单个仓库手动 bump。**这是多仓库模式最重要的实践。**

升级流程：

1. 在 WallKit 改代码并提交。
2. 挑一个游戏仓库 bump 到新 commit，实际验证。
3. 确认无问题后，再逐个 bump 其他仓库。

### 12.2 用模板仓库兜住外壳层

外壳层内容（`vite.config.js`、`index.html`、`project.json`、部署脚本、`src/main.jsx` 骨架）在每个游戏仓库中相同。为避免逐份重写：

- 建一个模板仓库（如 `we-wallpaper-template`）。
- 新游戏通过 GitHub 的 "Use this template" 创建。
- 模板固定 Vite / React 版本，升级时统一走一遍，避免版本漂移。

**模板仓库不在当前阶段建立**，等第二个游戏开始开发、外壳层的真实共性暴露后再建。见 §14 阶段计划。

### 12.3 代码归属判定规则

出现以下情况时按下表决定代码放哪：

| 情况 | 归属 |
|---|---|
| 第二个游戏也会用到 | → 提升到 WallKit |
| 依赖 WE 集成（内联脚本、环境探测、project.json） | → 外壳层 / 模板仓库 |
| 依赖模型格式、点击区域、资产 | → 永久留在游戏仓库 |
| 只在这一个游戏用 | → 留在该游戏仓库 |

**默认位置是游戏仓库。** 只有当"第二个游戏确实需要"时才提升。这条规则防止过早抽象。

### 12.4 外部使用者

仓库开源后，他人使用 WallKit 的方式：

| 场景 | 做法 |
|---|---|
| 基于 WallKit 做自己的壁纸 | 直接 git 引用，无需任何操作 |
| 修改 WallKit 本身 | fork → 改 fork → 引用自己的 fork 地址 |
| 把自己的改动回馈 | 提 PR，由作者决定是否合并 |

fork 后引用的写法：

```json
"wallkit": "github:<他的用户名>/wallkit#<commit>"
```

代价：fork 后**无法自动获得上游更新**，需手动 rebase 或 cherry-pick。这是 git 引用模式的固有特性，README 中已说明。

---

## 13. 许可与资产版权

### 13.1 代码许可：MIT

WallKit 仓库以 **MIT** 协议开源，`LICENSE` 文件置于仓库根。

MIT 的效果：他人可以使用、修改、分发、商用本仓库代码，只需保留版权声明与许可声明，作者不承担任何责任。

**必须存在 `LICENSE` 文件。** 公开仓库如果没有 LICENSE，按著作权法默认"保留所有权利"，他人即使技术上能 clone，法律上也无权使用——这是"看起来开源、实际上不能用"的常见状态，必须避免。

### 13.2 不承诺维护

开源不等于承诺维护。库没有 issue 响应 SLA、没有向后兼容承诺、没有定期发布节奏。

该声明写入 README，避免外部使用者产生"提了 issue 就会被处理"的预期。

### 13.3 模型资产不在许可范围内

**这是最重要的一条。**

游戏壁纸使用的模型、贴图、音频等资产，版权通常不属于作者，而是属于原游戏或其发行方。

因此：

- MIT 协议**仅覆盖 WallKit 仓库中的代码**。
- **不覆盖**游戏仓库中的模型资产、贴图、音频、字体等。
- **不覆盖**从游戏中提取的 `spine-webgl.js` runtime 之外的内容（Spine runtime 本身另有其许可条款）。

README 与游戏仓库的 README 都必须声明这一点，避免他人误以为模型资产也可自由使用。相关风险（涉及第三方资产的公开分发）由各仓库自行评估。

---

## 14. 阶段计划

每个阶段的验收标准相同：**anime-model-viewer 切换过去后视觉效果与行为不变**。它是唯一的事实来源。

| 阶段 | 内容 | 说明 | 状态 |
|---|---|---|---|
| P0 | `core` + `styles` + 组件骨架 | 环境探测、存储工具、主题变量、LICENSE | ✅ 完成 |
| P1 | `Clock` | 首个组件，验证接口设计 | ✅ 完成 |
| P2 | `Spectrum` | 独立浮层频谱，沿用 Clock 验证过的模式 | ✅ 实现完成，待实机验证 |
| P3 | `MiniSpectrum` + `AlbumArt` | 两者共用柱状渲染逻辑 | ✅ 实现完成，待实机验证 |
| P4 | `wallkit/we` + Vite 插件 | 第二个壁纸项目开始时再做 | 未开始（占位入口已存在） |
| P5 | 新项目验证 | 用非 Spine 背景的项目验证解耦 | 未开始 |
| P6 | 模板仓库 | **等第二个游戏的外壳共性暴露后再建**，不提前 | 未开始 |

**顺序原则：Clock 先做完并验证，再动 Spectrum。** Clock 是最简单的独立浮层控件，用它确认「纯 props、无状态」的接口模式是否成立；确认后再实现 Spectrum，避免定位抽象设计错误。

`SettingsDrawer` **不在计划内**，永久留在应用层。

**关于模板仓库（P6）**：不要在第二个游戏落地之前建立。第一个游戏可能含特例，第二个游戏才会暴露真实共性。过早建模板会把特例固化成"标准"，后续返工成本更高。

---

## 15. 与原方案的差异

| 原方案 | 本方案 | 理由 |
|---|---|---|
| 双 Adapter（WE + Browser） | 无 Adapter，纯 props | 浏览器拿不到真实数据，降级是假数据 |
| pnpm workspace 多包 | 单包 + `exports` | git 依赖只能指向仓库根 |
| 8 个包含 weather / visual | 4 个组件 | 无实现基础，不设空包 |
| `@wallkit/*` npm 包名 | 包名 `wallkit` | 不发 npm |
| 全量 TypeScript | 纯 JS + JSDoc 类型约定 | 避免重写，无编译步骤 |
| 包含 Spine stage | 不含 Spine | 背景层各项目实现不同 |
| 包含 SettingsDrawer | 不含抽屉 | 65KB 应用层逻辑 |
| 内置 i18n | 文案由 props 传入 | 应用层职责 |
| 浏览器可用 | 仅 WE | 明确定位 |
| 未提开源 | MIT + 不承诺维护 | 许可明确，期望明确 |
| 未提多仓库 | 三层职责 + fixed commit + 模板仓库 | 服务多个游戏壁纸 |
