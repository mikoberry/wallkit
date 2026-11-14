# AGENTS.md

## Project

WallKit 是 Wallpaper Engine 网页壁纸的**控件浮层库**，用 React 18 + 纯 JavaScript（JSX，无 TypeScript、无编译步骤）编写。仓库通过 GitHub git 引用分发，不发布 npm。

它只负责渲染控件（时钟等），**不包含背景渲染、不含数据采集**。设计细节见 [docs/architecture.md](docs/architecture.md)。

当前进度：P0–P4 均已完成。P0–P3 已在 Wallpaper Engine 中对接验证正常；P4（`wallkit/we` + Vite 插件）已实现，构建产物已部署到 WE 测试工程并完成实机接线复验，结果正常；P5（新项目验证）起未开始。P4 之后有三个增量：`PointerFx`（鼠标拖尾 / 点击特效，需在 WE 里开启鼠标交互才能实机看到）、`AmbientFx`（氛围粒子层），以及 `wallkit/we` 的 `properties` 段（`project.json` 用户属性 → `useWallpaperProperties()`；静态验证通过并已部署到 WE 测试工程，`accentColor` 实机确认生效，其余属性的渲染映射仍待逐项确认）。

## Execution rules

- **不要自行启动开发服务器。** 用户自己执行 `npm run dev`。需要验证渲染时，用无头浏览器截图，或在改动后直接报告，不要留下常驻进程。
- 不要留下挂起的命令、服务或验证步骤。使用明确的超时和有界等待；不运行交互式命令或开放式前台服务。
- 如果某步卡住或超时，终止它、检查输出，然后用更小的有界检查继续。不要等用户来打断。
- 报告完成前清理后台进程和临时依赖。
- 除非用户明确要求，不要运行浏览器自动化（Playwright 等）。用户会自己在 Wallpaper Engine 里逐项验证。
- **不要主动运行 `npm run build` 或任何打包命令**，除非用户明确要求。不要投机性构建；验证留给用户。
- 若 esbuild 在受限沙箱里报 `spawn EPERM`，那是沙箱管道限制，不是依赖或代码问题——把同一条命令拿到沙箱外重跑，不要改动依赖来绕过它。

## Commands

所有命令在 `playground/` 目录执行（这里才有 `node_modules`）：

- `npm install` — 首次安装 react / react-dom / vite / @vitejs/plugin-react。
- `npm run dev` — 启动 playground，默认 `http://localhost:5174/`。**由用户自行启动。**
- `npm run build` — 生产构建，输出到 `playground/dist/`。只在用户要求时执行。
- `npm run build:wallpaper` — 构建 WE 测试页，输出到 `playground/dist-wallpaper/`（含 `project.json`），可直接被 Wallpaper Engine 当作壁纸项目打开。用独立的 `vite.wallpaper.config.js`，与 playground 的构建互不干扰。
- `npm run deploy:wallpaper` — 构建 + 复制到 WE 项目目录（默认 `F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\wallpaper`，可用 `WE_PROJECT_DIR` 覆盖）。脚本是 `playground/scripts/deploy-wallpaper.mjs`。

库本身没有构建步骤，也没有依赖安装：`src/` 下的源码由使用方的 Vite 直接编译。

## WE testbed

`playground/wallpaper.html` 是**给 Wallpaper Engine 用的单页**，不是画廊：它把四个控件同时挂在一张壁纸尺寸的画面上，数据来自 `wallkitWE()` 注入 `<head>` 的内联脚本（音频 / 媒体 / 用户属性 / 暂停，timeline 可选），与真实壁纸的接线方式完全一致；React 侧由 `wallkit/we` 的 hooks 消费。

- 浏览器预览：`npm run dev` 后打开 `http://localhost:5174/wallpaper.html`。此时没有 WE 宿主，音频帧为 `null`、`bars` 保持全零，频谱画的是空图 —— **这是正确行为，不要为了好看在这里掺合成数据**（合成数据只允许出现在 playground 的四个画廊里）。
- WE 预览：`npm run deploy:wallpaper`（构建 + 同步到 WE 项目目录）。**不要**把 Vite 的 `outDir` 指到 WE 目录：那里有编辑器写的 `preview.gif` 与改过的 `project.json`，`emptyOutDir` 会把它们吃掉。同步规则是「`assets/` 整体替换，其余文件只覆盖同名产物，`project.json` 只在缺失时创建」。
- 页面自己**按 8 秒轮换**布局：专辑 6 种、时钟 10 种、频谱 9 种，每跑完一圈换一次背景（2 深 2 亮），主题随背景走。原因很实际——WE 里没有鼠标和键盘焦点，任何控制面板都点不到。
- 键盘（仅浏览器有用）：`← →` 步进、`↑ ↓` 换背景、空格停/启轮换、`H` 显隐 HUD。HUD 里那几行（WE 探测、音频帧数、帧龄、媒体字段、paused、props、events）就是排查音频与属性时的第一手信息。`props` 是合并后的当前快照，`events` 是推送流水（`window.__wallkitPropertyLog`，写在内联桥里，因为加载期那次全量推送早于 React 挂载）。
- 用户属性**只在应用层映射**：`useWallpaperProperties()` 拿到的是宿主原值（颜色是 0–1 浮点、slider 是 0–1、file 缺 `file:///`），校验/换算/回落全部写在 `wallpaper.jsx`，组件只收干净的 props。判断「没收到」用 `undefined` 而不是 falsy；没有对应 prop 的属性宁可先不接，也不要把原值硬塞给组件（`showSeconds`、`captionText` 属于这一类）。
- 数据层已收进 `wallkit/we`：`useWallpaperAudio()` 返回长期复用、原地改写的 `Float32Array`（无数据时全零，**不是 `null`**，否则频谱组件连 DOM 都不画），控件在自己的绘制循环里读它，60Hz 音频零 React 重渲染；`useWallpaperBeat()` 单独拆出，不需要时钟的项目不付重渲染成本。`playground/wallpaper-data.js` 退役为应用层残留，只保留 `useNow()` 与 HUD 诊断采集。

`playground/layout.html` 是**几何验证页**，与测试页分开：一屏同时摆三种定位（贴底满宽频谱、距角 100px 的时钟、同心唱片 + 环形频谱），带参考线（`G` 显隐）。数据是合成的，所以不依赖 WE 回调、浏览器里就能看。`build:wallpaper` 会把两个页面一起打进 `dist-wallpaper/`；要在 WE 里看它，把 `project.json` 的 `"file"` 改成 `layout.html`。

## Architecture

### 分层边界（硬约束）

```
背景层（Spine / Live2D / video …）   ← 各游戏仓库自己实现，不进库
外壳层（WE 集成、部署脚本）           ← 各游戏仓库自建，走同一份模板
控件层（Clock / Spectrum / …）      ← WallKit 只负责这一层
数据采集（音频帧、媒体信息）          ← 使用方构建
```

**控件层不知道背景是什么，也不知道数据从哪来。** 任何让控件去读 `window.wallpaper*`、查 canvas 尺寸、感知背景层的设计都应被拒绝。

### 入口结构

`package.json` 的 `exports` 是**封闭映射**，只有列出的路径外部才可导入：

| 入口 | 文件 | 内容 |
|---|---|---|
| `.` | `src/index.js` | 根入口，re-export core + components |
| `./core` | `src/core/index.js` | 环境探测、存储、时钟纯函数 |
| `./components` | `src/components/index.js` | 组件便利 barrel |
| `./components/clock` | `src/components/clock/index.js` | Clock 组件 |
| `./components/spectrum` | `src/components/spectrum/index.js` | Spectrum 组件（浮动） |
| `./components/mini-spectrum` | `src/components/mini-spectrum/index.js` | MiniSpectrum 组件（填满父容器） |
| `./components/album-art` | `src/components/album-art/index.js` | AlbumArt 组件 |
| `./components/pointer-fx` | `src/components/pointer-fx/index.js` | PointerFx 组件（鼠标拖尾 + 点击特效） |
| `./components/ambient-fx` | `src/components/ambient-fx/index.js` | AmbientFx 组件（飘雪 / 樱花 / 气泡氛围层） |
| `./we` | `src/we/index.js` | WE 数据源 hooks（audio / beat / media / timeline / paused / properties） |
| `./we/vite` | `src/we/vite-plugin.js` | Vite 插件 `wallkitWE()`，注入 `<head>` 监听器 |
| `./styles` | `src/styles/index.css` | 主题变量 |

**新增组件时必须同时做两件事**：在 `exports` 加条目，并在 `src/components/index.js` 加 re-export。否则使用方无法导入。

### 当前文件

```
src/
├── index.js
├── core/
│   ├── index.js          # 统一 re-export
│   ├── env.js            # isWallpaperEngine / isWallpaperAudioAvailable
│   ├── storage.js        # createStore(namespace)
│   ├── clock.js          # 时间格式化、倾斜计算、缓动、进度/周数计算
│   ├── audio.js          # 频谱数据纯函数（抽取、平滑、bass、渐变色）
│   ├── pointer.js        # 指针特效纯函数（环形缓冲、衰减、气泡/烟花粒子、弹道、生命周期映射）
│   ├── ambient.js        # 氛围粒子纯函数（预设表、参数填充、位置/旋转/透明度）
│   ├── anchor.js         # 四角锚点：ANCHORS / anchorStyle / anchorOrigin
│   ├── length.js         # toLength
│   └── types.js          # JSDoc 类型约定（无运行时导出）
├── components/
│   ├── index.js
│   ├── shared/           # 内部模块，不进 exports
│   │   ├── renderers.js          # 9 种绘制函数 + SPECTRUM_RENDERERS
│   │   └── SpectrumCanvas.jsx    # 两个频谱控件共用的画布与绘制循环
│   ├── clock/
│   │   ├── index.js
│   │   ├── Clock.jsx
│   │   └── Clock.css
│   ├── spectrum/
│   │   ├── index.js
│   │   ├── Spectrum.jsx          # 定位外壳
│   │   └── Spectrum.css
│   ├── mini-spectrum/
│   │   ├── index.js
│   │   ├── MiniSpectrum.jsx
│   │   └── MiniSpectrum.css
│   ├── album-art/
│   │   ├── index.js
│   │   ├── AlbumArt.jsx
│   │   └── AlbumArt.css
│   ├── pointer-fx/
│   │   ├── index.js
│   │   ├── PointerFx.jsx     # 全容器覆盖层、事件映射、按需 rAF
│   │   ├── renderers.js      # 4 种绘制函数（内部模块）
│   │   └── PointerFx.css
│   └── ambient-fx/
│       ├── index.js
│       ├── AmbientFx.jsx     # 全容器覆盖层、纯函数驱动、常驻 rAF
│       ├── renderers.js      # 3 种绘制函数（内部模块）
│       ├── sprites.js        # 离屏精灵预渲染（内部模块）
│       └── AmbientFx.css
├── styles/index.css      # --wallkit-* 变量
└── we/                   # 可选外壳层（控件层不依赖）
    ├── index.js          # hooks 统一 re-export
    ├── audio.js          # useWallpaperAudio / useWallpaperBeat + 共享 rAF 泵
    ├── media.js          # useWallpaperMedia / useWallpaperTimeline
    ├── properties.js     # useWallpaperProperties / useWallpaperProperty（project.json 用户属性）
    ├── pause.js          # useWallpaperPaused
    ├── vite-plugin.js    # wallkitWE()
    └── inline/           # 五段可注入 / 可粘贴的脚本字符串常量
```

### Clock 组件

纯展示组件，**不持有定时器、不读 storage、不读全局**。

```jsx
<Clock
  now={now}                    // 必选，使用方驱动
  labels={{ date, weekday, aria, locale }}
  placement="card"             // card | bar | minimal | cyberpunk | infobar | split | poster | ring | segments | stamp
  theme="dark"                 // dark = 深色文字（用于浅色壁纸）
  use24Hour size offsetX offsetY
  anchor="bottom-left"         // top-left | top-right | bottom-left | bottom-right
  beat beatIntensity beatCurve  // 音频响应走 prop
  tilt                         // 见下方
  onToggleHourFormat           // 可选回调，参数为 '12' | '24'
/>
```

- `now` **必须由使用方传入**。轮询属于数据层，WE 暂停时要能停止。
- `labels` 是**字符串对象**，不是函数。格式化逻辑在使用方（它有语言包）。
- `beat` 由使用方计算传入，组件不读音频。`beatCurve`（默认 0.62，钳制 0.2–2）是响应曲线指数：越小越平坦饱和，越大越尖锐；它与 `beatIntensity` 同属渲染参数，一起暴露。
- **`beat` 只在 prop 里给目标值，组件自己按帧缓动**（与 tilt 共用同一个 rAF 循环，因为两者最终都进同一个 `transform`）。上升用 26/s、下降用 7/s 的非对称速率：鼓点要立刻起，回落要有余韵。所以调用方可以直接把音频源的原始值喂进来，**不必先做平滑**，喂的频率低（WE 的 10Hz）也会被插值成 60fps 的连续运动——但采样太稀会丢失峰值，能每帧给就每帧给。`beat` 一旦非零，循环会一直跑到值归零为止，否则音乐会停时卡片会卡在半途。
- `tilt` 接受三种形态，由 `normalizeTilt()` 归一化：
  - `false` — 关闭跟随
  - `true` / 不传 — 默认 14° / 8
  - `{ maxTilt, speed }` — `maxTilt` 是窗口边缘处的最大角度（钳制到 0–45），`speed` 是每秒追上速度（钳制到 0.5–30，越大越跟手）
  - `maxTilt: 0` 等同于关闭，此时不启动 rAF 循环

### Spectrum 组件

纯展示组件，**不读音频、不持有数据定时器**；自己持有 rAF 绘制循环做逐帧平滑与动画。

```jsx
<Spectrum
  bars={bars}                  // 必选，Float32Array | number[] | null，各值 0..1
  visible
  variant="bars"               // bars | mirror | curve | pill | ring | ringwave | dots | ripples | aurora
  colorHex                     // #rrggbb，省略时读 --wallkit-accent
  size={100}                   // 100 = 正常大小（基准 30vw × 15vh）
  offsetX={0} offsetY={0}      // 从锚点角落向内，0 = 贴角（同 Clock）
  anchor="bottom-left"         // 四个视角角落
  intensity={100} curve={1}    // 响应强度 / 响应曲线
  paused
/>
```

- `bars` **必须由使用方传入**：用 `extractSpectrumBars(frame)` 从原始 128 帧加工。`bars == null`（或空）时返回 `null`，不渲染。
- **柱数 = `bars.length`**，组件不自带 `barCount`。要调整柱数，用 core 的 `resampleBars(bars, count)` 折叠后再传入（数据加工归 core）。
- `visible` 与 `paused` 不同：`visible={false}` 不渲染 DOM；`paused` 保留在屏上但冻结。两者都停止绘制循环。
- `variant` 是形态（不是 `style`，避免与 DOM `style` 冲突）；`colorHex` 只接受 `#rrggbb`，非法值回退 `--wallkit-accent` → `#a8c4ff`。
- `intensity`（0–1000，默认 100）/ `curve`（0.2–2，默认 1）：组件把 `intensity` 百分比换算成倍数，连同 `curve` 交给 core 的 `shapeSpectrumLevel()`；默认值等于原始柱高。
- 绘制循环 effect 只依赖 `[visible, hasBars, paused]`；`elapsed` 与 renderer state 存 ref，`variant` 在循环内切换——暂停恢复与切换样式都不重置相位。

### MiniSpectrum 组件

填满父容器的频谱。与 `Spectrum` **共用** `shared/SpectrumCanvas.jsx` 的绘制循环，像素完全一致，差别只在盒子怎么来的：`Spectrum` 自己算视口尺寸，`MiniSpectrum` 交给父容器。

```jsx
<MiniSpectrum
  bars={bars}                  // 必选，同 Spectrum
  variant="curve"              // 同 Spectrum 的 9 种
  colorHex barCount={32}       // barCount 默认 32：小尺寸下 128 根柱子会变成细线
  intensity={100} curve={1}
  visible paused
/>
```

- **没有 `size` / `offsetX` / `offsetY`**：父容器决定盒子，组件是 `width/height: 100%`。父容器必须有确定高度，否则塌成 0。
- `barCount` 是**唯一的例外**：`Spectrum` 坚持"柱数由调用方决定"，而 `MiniSpectrum` 的折叠是它存在的前提（否则在小盒子里不可读），所以在组件内部用 `resampleBars` 逐帧折叠。传 `bars.length` 可关闭。
- 折叠必须在**绘制循环内**做，不能在 render 里 memo：调用方通常原地复用同一个 `Float32Array`，memo 会永远画第一帧。

### AlbumArt 组件

专辑卡片。纯展示：接收 `track`，**不轮询、不读 storage、不含 i18n**。

```jsx
<AlbumArt
  track={track}                // 必选，TrackInfo | null
  bars={bars}                  // 可选，卡片内嵌频谱
  variant="classic"            // classic | glass | vinyl | minimal | bar | wall
  theme="light"                // light = 浅色文字，dark = 深色文字（名字指文字色）
  colorHex size={100} offsetX={0} offsetY={0}
  anchor="bottom-left"         // 四个视角角落
  paused
  labels={{ aria, coverAlt }}
/>
```

- **两种不渲染**：`track == null`；`track.playback === 'stopped'`。`playback === null`（未知）**必须渲染**，见下方数据约定。
- `bars` 可选：没有时卡片照常显示，只是少了频谱（`vinyl` 布局永远没有图）。`bar` 布局的频谱槽位是 `flex: 0 0 38%`，**没有 bars 时必须不渲染那个槽位**，否则条子右侧空出一截。
- 六种布局各自绑定频谱样式：classic→bars、glass→curve、minimal→bars、bar→curve、wall→dots、vinyl 无图。绑定表在 `AlbumArt.jsx` 的 `SPECTRUM_VARIANT_BY_CARD`，不要在 CSS 里做这种判断。
- 封面 24s 转一圈；`paused` 或 `playback === 'paused'` 停转；`prefers-reduced-motion` 下不转。卡片里的频谱用绝对定位铺满 body，文字浮在其上——这个覆盖写在 `AlbumArt.css`，`MiniSpectrum` 自己只管 100% 填充。
- `theme` 与 `Clock` 同一套约定（类名指**文字色**）：`--theme-dark` 只换 `--wallkit-album-art-fg*` 等变量，**外加**把卡片自绘的表面（毛玻璃、胶囊、唱片标签、纸套）翻成浅色，并把 `--wallkit-accent` 压暗让频谱在浅底上可见。唱片本体与木架刻意保持深色——它们是物件，不是文字底板。
- 内嵌频谱的 `intensity` / `curve` 是内部常量（130 / 0.7），**不要暴露成 props**：这组值是为卡片尺寸定的，放出去只能被改坏。
- `ALBUM_ART_VARIANTS`、`ALBUM_ART_SIZE_MIN/MAX` 从 `components/album-art` 导出；新增布局时改那一处，调用方的选择器就会自动跟上。

### PointerFx 组件

鼠标拖尾 + 点击特效，**合并为一个覆盖层组件**，共用一块 canvas 和一条 rAF 循环。

```jsx
<PointerFx
  visible trail click
  trailVariant="glow"        // glow | ribbon | bubble | firework
  clickVariant="ripple"      // ripple | sparks | bubble | firework
  colorHex size={100} intensity={100}
  trailSize={60} clickSize={180}  // 可选：各覆盖一个通道，省略时继承 size
  paused
/>
```

**这是库里唯一自己采集输入的控件，属于登记在案的特例**：它在 `window` 上监听 `pointermove` / `pointerdown`，与 `Clock.tilt` 的指针跟随是同一套先例（壁纸画布持有指针事件）。它消费的只是「指针位置」这种渲染参数，**不读 `window.wallpaper*`、不查背景层、不读取业务数据**，所以没有破坏「控件不知道数据从哪来」的边界。事件坐标按 `getBoundingClientRect()` 的 `left/top` 映射进覆盖层盒子，**盒子外的事件一律忽略**——一页挂十六个实例（playground 4×4 画廊）互不干扰。

- 高频采样写入 `core/pointer.js` 的预分配环形缓冲（`createPointerTrail` / `createPointerBursts`），绘制循环直接读，**零 React 重渲染**；`pushBurst` 存种子，`pointerSpark()` 每帧确定性重算粒子方向，不存粒子数组、不在循环里调随机数。
- **`bubble` / `firework` 在拖尾和点击两个通道都能用**，两个 variant 数组各有 4 种取值、共 16 种组合。`renderers.js` 的 `paintBubbles()` / `paintFirework()` **与 buffer 无关**（只认 x/y/seed/progress/预设），`drawTrail` / `drawBursts` 各自遍历自己的缓冲调用它，通道只选预设：拖尾气泡 2 个 / 点击 7 个，拖尾烟花 8 道余烬且**每 4 个 ring slot 才出 1 朵**（slot 索引稳定，不会闪烁）/ 点击 20 道带热核。拖尾版更短更小，因为指针每 1.2px 就产生一个采样点，不稀疏化会刷屏。
- `pushTrailPoint` 也写 `seeds`；`pointerBubble()` 重算气泡的偏移 / 半径 / 浮力 / 摆动相位（奇数 index 为小气泡，所以大簇也有大小错落），`pointerFireworkSpark()` 重算余烬的角度 / 射程 / 重力 / 色偏 / 闪烁相位。`pointerRise()` 缓出上浮、`pointerFall()` 二次下坠、`pointerTint()` 往白色混色（可传 scratch 数组原地改写，避免每帧分配）。烟花在 `ctx.save()` / `restore()` 之间用 `globalCompositeOperation = 'lighter'`，不污染其它形态。
- `pointerLife(channel, variant, reduced)` 集中管理时长，`drawTrail` / `drawBursts` 用同一个返回值驱动动画与 `alive`，最后一个粒子消亡才停 rAF。扁平形态 `POINTER_TRAIL_LIFE` 0.55s / `POINTER_BURST_LIFE` 0.72s；粒子形态拖尾气泡 1.05s、点击气泡 1.25s、拖尾烟花 0.8s、点击烟花 1.35s。
- **尺寸按通道分开**：`size` 是共用默认值，`trailSize` / `clickSize` 各覆盖一个通道（`trailSize ?? size`、`clickSize ?? size`，都是 20–300）。`core` 的 `pointerSizeScale(value, fallback)` 解析成 `trailScale` / `clickScale` 写进 settingsRef，`drawTrail` 只读 `trailScale`、`drawBursts` 只读 `clickScale`，互不串扰；`paintBubbles()` / `paintFirework()` 接数值 `scale` + `gain` 而不是整份 settings，省掉每帧的临时对象。尺寸只乘到半径 / 位移 / 线宽，**不动覆盖层盒子、1.2px 采样密度、生命周期和强度**；`intensity` 仍是两通道共用。playground 用「分别设定尺寸」开关在两种 props 形态之间切换，**不同时传** `size` 与两个覆盖值，否则 `size` 会被完全遮蔽、滑块看起来失灵。
- **rAF 按需启停**：有新事件才启动，最后一个样本过期后立刻停（清屏后 `frameId = 0`）。空闲壁纸不付功耗。`paused` 取消循环与监听、保留画面；恢复时清空缓冲，避免过期时间戳画出闪帧。
- 尺寸测量仍用 `offsetWidth` / `offsetHeight`；`getBoundingClientRect()` **只取 `left/top` 做坐标映射**，不参与后备存储尺寸，不触碰「缩放双重计算」那条约束。
- `prefers-reduced-motion` 下关掉拖尾，点击退化成一个短寿命、固定半径的静态圆环。
- **没有 `anchor` / `offsetX` / `offsetY`**：覆盖层是 `position: absolute; inset: 0; pointer-events: none`，铺满定位上下文。父容器必须是定位上下文且有确定尺寸（同 `MiniSpectrum` 的契约，外加坐标原点）。局部 `z-index: 4`。

### AmbientFx 组件

全屏氛围粒子层，纯装饰，**不采集任何输入**——没有指针监听、没有音频、没有宿主回调。它比 PointerFx 更干净：位置是 `(参数, 时间)` 的纯函数。

```jsx
<AmbientFx
  variant="snow"             // snow | sakura | bubble | steam | rain | fog | leaves
  colorHex                   // 省略：除 bubble 外每种形态都有自己的固有色，bubble 读 --wallkit-accent
  density={100}              // 10-300，数量百分比（相对预设数）；只改数量不改尺寸
  size={100}                 // 20-300，半径缩放
  intensity={100}            // 0-300，不透明度
  speed={100}                // 20-300，运动速度百分比
  visible paused
/>
```

- **不存粒子数组**：`core/ambient.js` 的 `fillAmbientParticles(variant, count, out)` 只在 variant / count 变化时写一次扁平 `Float32Array`（固定 `AMBIENT_STRIDE = 10`），绘制循环用 `ambientOffset()` 原地算 `[x01, y01, rotation, alpha]`，60fps 零分配。加粒子形态时往预设表加一条 + `renderers.js` 加一个循环，不要另起一套系统。
- **`paused` 只是停止推进时间**（`elapsedRef`），恢复时从原处继续而不是重头播；位置全部归一化，**不存像素**，所以窗口缩放后下一帧自动正确映射。樱花片的 `drift` 在 wrap 时会跳一段横移，但那时它已经在屏幕上下方之外的 pad 区里，看不见。
- **每片的下落时长各不相同**（`travel` 9–17s / 12–20s），所以不会出现整排同步下落的机械感——这是「长度必须随机」而不是「位置必须随机」的差别，`fillAmbientParticles` 里每一项都要独立取随机数。
- **软边不进绘制循环**：`shadowBlur` / 每帧新建渐变在 60fps × 数小时下不可接受。`sprites.js` 用离屏 canvas 预渲染一张 64px 精灵（雪=径向渐变、樱=带缺口的贝塞尔花瓣 + `destination-out` 切角、气泡=双环 + 高光、蒸气=与雾共用同一张横向大团软雾、雨=竖向渐隐雨丝、雾=横向大团软雾、落叶=带中脉的透镜叶形；蒸气与雾在绘制时还要非等比拉伸），循环里只做 `drawImage`；樱花用 `setTransform(cos, sin, -sin, cos, x, y)` 代替每片 `save` / `rotate` / `restore`，`drawAmbient` 末尾统一复位。
- **`steam` 是 `fog` 的竖直孪生**：同一套 bank 运动（`ambientOffset` 有各自分支但形状相同）——雾横向漂移、蒸气竖直上升，锚点轴带慢摆，`bankLife()` 生命期 alpha 在进出边缘淡入淡出、顺带把 wrap 藏掉。蒸气数量 / 尺寸沿用雾的预设（count 12 / baseSize 110），雾则再大一号（baseSize 140）；精灵也共用同一张弥散团形状，只有颜色不同。`twinkle` 对两者不生效。
- **`speed` 是时钟缩放，不是改参数表**：`tick` 里 `elapsedRef += delta * pace`，位移、摆动、twinkle、steam/fog 的生命期曲线全部同步快慢——不会出现「粒子跑得快但消散曲线还是老速度」的错位。走 `settingsRef.pace` 而不是 loop effect 的依赖：运行中调速不重建 canvas 接线，下一帧直接生效。小雨/大雨这类区分靠 `density` + `size` + `intensity` + `speed` 组合，不为单一形态加专用 prop。
- **`rain` / `fog` / `leaves` 的分工**：rain 走通用路径，但雨丝按风向整体倾斜（`atan2(drift * width, span)`，`travel` 在比值里约掉）；fog 在 `ambientOffset` 有横向漂移专用分支（X 槽复用为纵向锚点、phase 兼作横向起点，一半向左一半向右，`bankLife()` 双端淡入淡出藏 wrap），绘制时不旋转、横向拉伸；leaves 与樱花共用同一个绘制循环（`drawTumbling`），但走双频摆动分支得到之字翻滚，自转幅度也大得多。
- `prefers-reduced-motion` 下**只画一帧**静止构图（保留构图、去掉运动）；`paused` 连这一帧都不重画，最后一帧留在屏上。
- 粒子尺寸按视口缩放（`sqrt(min(w/1920, h/1080))` 钳到 0.7–2），否则 4K 壁纸会是 1080p 大小的雪。数量有 `AMBIENT_COUNT_MAX = 240` 的硬上限，预设另有更低的 `max`。
- **没有 `anchor` 三元组**，覆盖层 `position: absolute; inset: 0; pointer-events: none`。局部 **`z-index: 1`**，在全部控件之下（ambient 1 → spectrum 3 → 指针特效 4 → clock / album 5），所以雪从时钟背后穿过、文字不被压住。
- **背景里已有粒子时不要叠这一层**：WE 编辑器自带粒子效果层，两层不同步的雪比没有更难看。该不该显示是应用层判断，`visible={false}` 既不渲染 DOM 也不留 canvas。
- **WE 环境**：桌面壁纸默认不投递鼠标事件，收不到事件时画布保持空白，**不生成假轨迹**。要实机看到需在 WE 里开启鼠标交互；浏览器 / 预览窗口可直接看。因此 **`wallpaper.html` 不挂 PointerFx**（那页按 8 秒自动轮换，本来也没鼠标）。
- `POINTER_TRAIL_VARIANTS` / `POINTER_CLICK_VARIANTS` 与尺寸 / 强度边界从 `components/pointer-fx` 和 `core` 导出；`renderers.js` 是内部模块，不进 `exports`。

## Conventions

### 定位

三个浮动控件（`Clock` / `Spectrum` / `AlbumArt`）共用 `src/core/anchor.js`，**不要在组件里自己算 left/bottom**。

- `anchor` 选角落，`offsetX` / `offsetY` 永远**从该角落向内**。所以 `0` 恒等于“贴角”，从左下换到右下不需要翻转正负号。
- 只写两个 CSS inset（一个水平 + 一个垂直）。写四个会把盒子拉伸到四条边之间。
- 定位由 JSX 的 inline style 给出，**CSS 里不要再写 `left` / `bottom`**——inline 会覆盖它，而且这种覆盖是静默的（`--wallkit-gutter` 就是这么变成死变量的）。
- `anchorOrigin(anchor)` 给 `Clock` 提供 `transform-origin`：`top-*` 用 `50% 0%`，否则 `50% 100%`，保证 beat 放大是向画面内侧生长而不是冲出屏幕。它是 inline 值，CSS 里不再写。
- `MiniSpectrum` **不参与**：它填满父容器，位置由父容器决定。
- `PointerFx` **也不参与**：它是铺满定位上下文的特效层，没有自己的盒子可放（见上方组件说明）。
- `AmbientFx` **同理**：氛围粒子层同样铺满定位上下文，`z-index: 1` 压在控件之下。
- 新增控件时复用这套三元组，并把 `anchor` 加进 `ANCHORS`（`core` 导出，顺序为阅读顺序，正好对应 2x2 选择器）。

### 样式

- 类名统一 `<组件>__*`（BEM），前缀 `wallkit-`：`wallkit-clock__*`、`wallkit-spectrum__*`、`wallkit-mini-spectrum__*`、`wallkit-album-art__*`。主题修饰如 `wallkit-clock--theme-dark`。
- **`--theme-light` 是默认态，没有专门规则**；只有 `--theme-dark` 做覆盖。这是原设计，不是遗漏。
- CSS 变量全部 `--wallkit-` 前缀。组件内部的局部变量用 `--wallkit-clock-*`。
- 引用共享主题变量时**必须给回退值**，例如 `var(--wallkit-space-3, 12px)`，保证使用方只引入组件 CSS 也能正确渲染。
- **没有全局边距变量**。曾经的 `--wallkit-gutter` 已删除：它只影响 AlbumArt 的视口钳制，Clock 与 Spectrum 的 `left` / `bottom` 由 inline style 给出，CSS 里写边距会被静默覆盖。需要留白请用 `offsetX` / `offsetY`（视口百分比），或用 `size` 缩小盒子。
- 每个组件自带同名 CSS 并由组件自身 import。不要新增共享样式表。
- 组件内部只用局部 z-index，不设全局层级。时钟锚点用 `z-index: 5`。

### 数据约定

- 数据缺失时组件**返回 `null`，不用合成数据兜底**。合成数据只允许出现在 `playground/`。
- `PointerFx` 的等价规则是「无指针事件 → 画布空白」：WE 桌面壁纸默认收不到鼠标，绝不画假轨迹。
- `playback` 为 `null` 表示未知，**应视为正在播放**。WE 只在切歌时推送，猜成 `stopped` 会让封面永久消失。

### 语言

- 代码注释用英文；文档和面向用户的文案用中文。

### 已知技术债（保持现状，不要顺手改）

- 无 TypeScript：用 JSDoc 标注类型，没有编译步骤。
- 无测试套件：验收依赖用户在实际环境目视。
- Spectrum / MiniSpectrum / PointerFx / AmbientFx 的 Canvas 后备存储按 CSS 像素，不处理 `devicePixelRatio`（HiDPI 下比 DOM 文字的 Clock 略糊）。两个频谱共用同一个绘制循环；PointerFx 与 AmbientFx 是独立循环，但沿用同一套 `offsetWidth` / `offsetHeight` 测量约定，所以保持现状、不要顺手改。`AmbientFx` 的雪与气泡是软边，看不出来；**樱花花瓣的边缘会明显发虚**——真要修就单独提一次，作为 DPR 的统一整改，别在这个组件里局部开后门。

## Migration reference

从 `D:\code\js\anime-model-viewer` 抽取。逐文件归属见 [docs/extraction-map.md](docs/extraction-map.md)。

**永久留在应用层**（不迁入库）：

- `spine-webgl.js`（422 KB，Spine 3.8.99 runtime）、`spineStage.js` — 背景层
- `App.jsx` — 应用编排
- `SettingsDrawer.jsx`（64.9 KB）与 `SettingsDrawer.css` — 抽屉，明确不进库
- `i18n.js`（44.9 KB） — 文案由使用方传入
- `modelPreset.js`、`clipboard.js` — 应用业务
- `scripts/*.mjs`、`model-library/`、`model-presets.json` — 模型打包业务
- 所有 `spine-viewer:*` localStorage 键 — 保持键名不变，用户调好的预设才不会丢

## Verification

改完代码后的自查方式（按成本从低到高）：

1. **语法与导入**：用相邻项目的 esbuild 打包校验，不安装任何东西。
   ```powershell
   D:\code\js\anime-model-viewer\node_modules\.bin\esbuild.cmd `
     D:\code\js\wallkit\src\index.js `
     --bundle --external:react --external:react-dom `
     --loader:.css=css --outfile=$env:TEMP\check.js --format=esm
   ```
   退出码 0 表示语法和所有 import 路径都解析成功。

2. **纯函数**：`src/core/*.js` 可以直接用 node 动态 import 验证行为，不需要 DOM。

3. **渲染**：用无头 Chrome 截图，然后**立即关闭**，不要留下服务器。
   ```powershell
   & 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
     --headless=new --disable-gpu --hide-scrollbars `
     --window-size=1700,1600 --screenshot=$env:TEMP\shot.png `
     --virtual-time-budget=5000 'http://localhost:5174/'
   ```
   这要求用户已经启动了 dev server。

4. **不要**在未要求时运行 `npm run build`。

## Reference documents

- [README.md](README.md) — 项目简介、git 引用方式、入口一览
- [docs/architecture.md](docs/architecture.md) — 定位、分层、接口原则、阶段计划
- [docs/we-integration.md](docs/we-integration.md) — 内联脚本、`project.json` 形状、音频排查清单
- [docs/we-design.md](docs/we-design.md) — `wallkit/we` 的 hooks / 插件接口规格与 playground 接线改造（P4）
- [docs/extraction-map.md](docs/extraction-map.md) — 与 anime-model-viewer 的抽取映射
