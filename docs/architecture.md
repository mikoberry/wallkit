# WallKit 架构方案

> 状态：设计定稿，未开始实现
> 最后更新：2026-11-13
>
> 相关文档：[WE 集成指南](./we-integration.md) · [抽取映射](./extraction-map.md)

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
├── docs/
│   ├── architecture.md       # 本文件
│   ├── we-integration.md     # WE 工程集成与排查
│   └── extraction-map.md     # 与原项目的抽取映射
├── src/
│   ├── index.js              # "." 入口
│   ├── core/                 # 环境探测、hooks 工具、存储、类型约定
│   │   ├── index.js
│   │   ├── env.js            # isWallpaperEngine()
│   │   ├── storage.js        # createStore(namespace)
│   │   ├── pausable.js       # 暂停感知工具
│   │   └── types.js          # JSDoc 类型约定
│   ├── components/
│   │   ├── index.js          # 便利 barrel
│   │   ├── clock/
│   │   │   ├── index.js
│   │   │   ├── Clock.jsx
│   │   │   └── Clock.css
│   │   ├── spectrum/
│   │   ├── mini-spectrum/
│   │   └── album-art/
│   ├── we/                   # 可选：WE 数据源 hooks + 内联脚本
│   │   ├── index.js
│   │   ├── audio.js
│   │   ├── media.js
│   │   ├── pause.js
│   │   ├── vite-plugin.js
│   │   └── inline/
│   │       ├── audio.js      # 内联脚本原文（字符串常量）
│   │       ├── media.js
│   │       └── pause.js
│   └── styles/
│       └── index.css         # CSS 变量与基础 token
└── playground/               # 本地开发预览（不参与分发）
```

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
 * @typedef {Object} SpectrumBars
 * @property {Float32Array|number[]} values   归一化到 0..1 的柱状值
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

/**
 * @typedef {Object} Placement
 * @property {'top-left'|'top-right'|'bottom-left'|'bottom-right'|'center'} anchor
 * @property {number} offsetX        相对锚点的百分比偏移
 * @property {number} offsetY
 */
```

### 5.3 组件清单

| 组件 | 入口 | 职责 |
|---|---|---|
| `Clock` | `wallkit/components/clock` | 日期时间显示，可选 3D 指针倾斜 |
| `Spectrum` | `wallkit/components/spectrum` | 独立浮动的柱状频谱 |
| `MiniSpectrum` | `wallkit/components/mini-spectrum` | 填满父容器的紧凑频谱 |
| `AlbumArt` | `wallkit/components/album-art` | 专辑卡片：封面 + 曲目信息 + 迷你频谱 |

具体 Props 在实现阶段定义，本方案只锁定原则与数据形状。

### 5.4 组件不做的事

- 不读写 `localStorage`（如需要，由使用方持有状态）
- 不感知 WE 暂停状态（由使用方传入或暂停 hooks 处理）
- 不设置全局 z-index 层级
- 不内置任何语言文案（文案通过 props 传入）
- 不引入除 React 外的运行时依赖

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

### 7.2 由 WallKit 负责（可选模块 `wallkit/we`）

**数据源 hooks**（保留，第二个壁纸项目会需要）：

```js
import { useWallpaperAudio, useWallpaperMedia, useWallpaperPaused } from 'wallkit/we'

const bars = useWallpaperAudio()   // Float32Array | null
const track = useWallpaperMedia()  // TrackInfo | null
const paused = useWallpaperPaused() // boolean
```

这些 hooks **只是便利封装**，不是必须的。使用方完全可以自己实现数据采集，组件不关心数据来源。

**Vite 插件**：自动向 `index.html` 的 `<head>` 最前面注入 WE 监听器内联脚本。

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

**库内不提供 i18n。**

所有面向用户的文案通过 props 传入：

```jsx
<Clock
  now={date}
  labels={{ locale: 'zh-CN', dateFormat: 'yyyy-MM-dd' }}
/>
<AlbumArt
  track={track}
  emptyLabel="暂无播放"
/>
```

使用方自己维护语言包（如原项目的 `src/i18n.js`，44KB，保留在应用层）。

---

## 10. 暂停与功耗

控件层自身不轮询 WE 暂停状态。使用方需要处理时：

- 传入 `paused` prop 让组件停止动画，或
- 使用 `wallkit/we` 的 `useWallpaperPaused()`，或
- 在应用层卸载 / 隐藏控件

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

| 阶段 | 内容 | 说明 |
|---|---|---|
| P0 | `core` + `styles` + 组件骨架 | 环境探测、存储工具、主题变量、LICENSE |
| P1 | `Clock` | 首个组件，验证接口设计 |
| P2 | `MiniSpectrum` + `AlbumArt` | 两者共用柱状渲染逻辑 |
| P3 | `Spectrum` | 独立定位系统，较复杂 |
| P4 | `wallkit/we` + Vite 插件 | 第二个壁纸项目开始时再做 |
| P5 | 新项目验证 | 用非 Spine 背景的项目验证解耦 |
| P6 | 模板仓库 | **等第二个游戏的外壳共性暴露后再建**，不提前 |

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
