# AGENTS.md

## Project

WallKit 是 Wallpaper Engine 网页壁纸的**控件浮层库**，用 React 18 + 纯 JavaScript（JSX，无 TypeScript、无编译步骤）编写。仓库通过 GitHub git 引用分发，不发布 npm。

它只负责渲染控件（时钟等），**不包含背景渲染、不含数据采集**。设计细节见 [docs/architecture.md](docs/architecture.md)。

当前进度：P0（基础层）和 P1（Clock）已完成。

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

库本身没有构建步骤，也没有依赖安装：`src/` 下的源码由使用方的 Vite 直接编译。

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
| `./we` | `src/we/index.js` | WE 数据源 hooks（P4 占位） |
| `./we/vite` | `src/we/vite-plugin.js` | Vite 插件（P4 占位） |
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
│   ├── clock.js          # 时间格式化、倾斜计算、缓动
│   └── types.js          # JSDoc 类型约定（无运行时导出）
├── components/
│   ├── index.js
│   └── clock/
│       ├── index.js
│       ├── Clock.jsx
│       └── Clock.css
├── styles/index.css      # --wallkit-* 变量
└── we/                   # P4 占位
```

### Clock 组件

纯展示组件，**不持有定时器、不读 storage、不读全局**。

```jsx
<Clock
  now={now}                    // 必选，使用方驱动
  labels={{ date, weekday, aria, locale }}
  placement="card"             // card | bar | minimal | cyberpunk | infobar | split | poster
  theme="dark"                 // dark = 深色文字（用于浅色壁纸）
  use24Hour size offsetX offsetY
  beat beatIntensity           // 音频响应走 prop
  tilt                         // 指针倾斜开关
  onToggleHourFormat           // 可选回调，参数为 '12' | '24'
/>
```

- `now` **必须由使用方传入**。轮询属于数据层，WE 暂停时要能停止。
- `labels` 是**字符串对象**，不是函数。格式化逻辑在使用方（它有语言包）。
- `beat` 由使用方计算传入，组件不读音频。

## Conventions

### 样式

- 类名统一 `wallkit-clock__*`（BEM），主题修饰 `wallkit-clock--theme-dark` / `--theme-light`。
- **`--theme-light` 是默认态，没有专门规则**；只有 `--theme-dark` 做覆盖。这是原设计，不是遗漏。
- CSS 变量全部 `--wallkit-` 前缀。组件内部的局部变量用 `--wallkit-clock-*`。
- 引用共享主题变量时**必须给回退值**，例如 `var(--wallkit-gutter, clamp(14px, 1.2vh, 22px))`，保证使用方只引入组件 CSS 也能正确渲染。
- 每个组件自带同名 CSS 并由组件自身 import。不要新增共享样式表。
- 组件内部只用局部 z-index，不设全局层级。时钟锚点用 `z-index: 5`。

### 数据约定

- 数据缺失时组件**返回 `null`，不用合成数据兜底**。合成数据只允许出现在 `playground/`。
- `playback` 为 `null` 表示未知，**应视为正在播放**。WE 只在切歌时推送，猜成 `stopped` 会让封面永久消失。

### 语言

- 代码注释用英文；文档和面向用户的文案用中文。

### 已知技术债（保持现状，不要顺手改）

- 无 TypeScript：用 JSDoc 标注类型，没有编译步骤。
- 无测试套件：验收依赖用户在实际环境目视。
- `Spectrum` 暂未实现（P2）：原项目的实现仍在 anime-model-viewer 中运行。

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
- [docs/extraction-map.md](docs/extraction-map.md) — 与 anime-model-viewer 的抽取映射
