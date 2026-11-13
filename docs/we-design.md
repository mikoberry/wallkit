# `wallkit/we` 设计规格（P4）

> 状态：**P4 已完成（含 WE 实机接线复验，结果正常）**。库侧代码与 playground 接线已落地，构建产物已部署到 WE 测试工程并完成复验。本文保留原始决策，并在 §2 / §5 标注三处实现期修正。
> 触发条件：第二个壁纸项目已决定启动，架构 §14 为 P4 设的前置条件成立。
> 最后更新：2026-11-13
>
> 相关文档：[architecture.md](./architecture.md) · [we-integration.md](./we-integration.md) · [extraction-map.md](./extraction-map.md)

本文锁定 `wallkit/we` 与 `wallkit/we/vite` 的接口与实现方案。分层边界沿用 architecture.md §2 与 §7，内联脚本内容以 [we-integration.md §2.2](./we-integration.md) 为准。

---

## 1. 定位与范围

一句话：把 `we-integration.md` §2.2 里那三段手工粘贴的脚本、以及 `playground/wallpaper-data.js` 里的示范 hooks，收进库，成为一个**可选模块**。

- 物理上在 WallKit 包内，逻辑上属于**外壳层**（architecture.md §2.3）。`exports` 子路径提供隔离：只做控件的项目 import `wallkit/components/*`，不会触及它。
- 组件层**不依赖它**。控件只认 props，不读 `window.__wallkit*`、不感知数据来源。
- 它是**便利封装，不是必须**（§7.2）。使用方完全可以自己写采集层，或整个替换掉。
- **明确不在范围内**：
  - `now` 的 tick（`Clock` 的 `now` 由使用方驱动，停止更新即暂停语义）
  - `project.json` 的形状（`general.supportsaudioprocessing`、`"type": "Web"`）
  - 背景层、组件注册、Provider、运行时全局状态改写
  - 任何组件 API 变更

---

## 2. 三项已定决策

对应 `extraction-map.md` §7 留下的三项未决。

### 2.1 hook 返回形状

沿用 architecture.md §7.2 的基础形状，**不**照抄 `wallpaper-data.js` 的一把梭返回对象。

| hook | 返回 | 说明 |
|---|---|---|
| `useWallpaperAudio()` | `Float32Array` | 长期复用的缓冲区，**原地改写**，引用恒定；无数据时全零（实现期修正，见下） |
| `useWallpaperMedia()` | `TrackInfo \| null` | 2 Hz 轮询桥接对象，字段未变则保持引用 |
| `useWallpaperPaused()` | `boolean` | 订阅 `wallkit-pause-change` |
| `useWallpaperBeat()` | `number` | 0..1 bass 标量，供 `Clock.beat` 与未来的 `BeatGlow` |
| `useWallpaperTimeline()` | `{ position, duration } \| null` | 仅当插件开启 `timeline` 时可能有值 |
| `useWallpaperProperties()` | `Record<string, unknown>` | project.json 用户属性快照，引用仅在推送时变化 |
| `useWallpaperProperty(key, fallback)` | `unknown` | 单键读取，未声明时返回 `fallback` |

后两个是在 §7.2 三个 hooks 之上的**可选增量**，不改变前三个的语义。

理由：

- `status`（engine / frames / ageMs）与 `staleMs` 是 playground HUD 的调试信息，不是壁纸的数据契约，**留在 playground**，不进库 API。
- `beat` 单独拆出：音频帧 60 Hz，但 beat 变化会触发 React 重渲染（组件拿它按帧缓动）。不需要时钟的项目不该为这个付渲染成本。沿用 `wallpaper-data.js` 里已验证的 `BEAT_EPSILON = 0.004` 阈值，安静段落零重渲染。
- `bars` 必须是**稳定引用 + 原地改写**：控件在自己的 rAF 绘制循环里读它，因此 60 Hz 音频不需要任何 React 重渲染。这条路径已由 `wallpaper-data.js` 在 WE 实机验证过，不要在 hook 里改成每帧 `setState`。
- `useNow()` **不进库**。它是应用层计时器，留在 playground。

**实现期修正（2026-11-13）**：`useWallpaperAudio()` 最终返回 `Float32Array` 而非 `Float32Array | null`。原因：`Spectrum` / `MiniSpectrum` 对 `bars == null` 是 `return null`（连 DOM 都不渲染），而 P0–P3 在 WE 实机验证过的「无数据」表现是**画空图**。全零缓冲是诚实的「没有数据」，不是合成数据，且保留了「稳定引用、零 React 重渲染」这条核心契约。§6 的验收标准据此表述为「`null` / 全零」。

另外两处编码时补齐的细节：`useWallpaperMedia(paused)` / `useWallpaperTimeline(paused)` 保留可选 `paused` 参数，暂停时停掉 2 Hz 轮询（沿用原 `wallpaper-data.js` 的功耗语义）；两个音频 hook 共用一个带引用计数的 rAF 泵，避免同一页面开两个循环重复读同一个全局。

### 2.2 插件选项

```js
wallkitWE({ audio: true, media: true, properties: true, pause: true, timeline: false })
```

- 前四项默认 `true`，`timeline` 默认 **`false`**。
- `timeline` 默认关的理由：WE 官方 `wallpaperRegisterMediaTimelineListener` 提供 `position` / `duration`，但文档明确警告「不是所有播放器支持，要假设这个回调永远不被调用」；当前四个控件都不消费它。默认开等于凭空多一路很可能永远为空的数据源。它是后续 `TrackTimeline` 组件的前置，需要时显式打开。
- 用 `transformIndexHtml` 的 `order: 'pre'`，以 `injectTo: 'head-prepend'` 注入 `<script>` tag（`children` 里放脚本正文，**不带** `type="module"`），保证早于 Vite 的 module 入口。
- **幂等**：每段脚本带一个 HTML 注释标记（`<!-- wallkit-we:audio -->` 等），钩子先检查 `html.includes(MARKER)`，已存在就原样返回。**实现细节**：标记必须写回 `transformIndexHtml` 返回的 `html` 字符串，而不只是放进 tag descriptor —— 否则第二个插件实例收到的仍是原始 HTML，会重复注入。最终返回 `{ html, tags }`：`html` 只多出注释标记，`tags` 才是 classic script。
- dev / prod 行为一致；不注册组件、不做 Provider、不改运行时全局状态、不碰 `project.json`（§7.3）。
- 不装插件的项目继续用 `we-integration.md` §2.2 的可粘贴脚本。

### 2.3 内联脚本做成字符串常量

- 放 `src/we/inline/`，按 audio / media / properties / timeline / pause 分文件，每个导出一个字符串常量；插件 import 后拼接。
- 内容与 `playground/wallpaper.html` 现有各段**逐字等价**（那段是从 `we-integration.md` 复制、并已在 WE 实机验证过的）：边界检查、`Float32Array.from()` 缓冲区复制、`wallpaperMediaIntegration` 常量判断全部原样保留。
- 注入顺序固定 **audio → media → properties → timeline → pause**。暂停桥接靠 `wallpaperRegisterAudioListener` 是否存在判断宿主就绪，必须在音频脚本之后；属性桥接要在暂停之前，因为暂停段只是往前者创建的对象上补 `setPaused`。顺序要求见 `we-integration.md` §2.3。
- `we-integration.md` 保留人类可读的可粘贴版本，作为「不用插件」路径与排查依据。**两份内容必须一致**，改动时同步。

---

## 3. 数据契约

桥接脚本写出的全局沿用现有名称，避免破坏 HUD 与排查流程：

| 全局 | 形状 | 写入方 |
|---|---|---|
| `window.__wallkitAudioFrame` | `Float32Array \| null`，每次回调换新引用 | audio 脚本 |
| `window.__wallkitAudioAt` | `number`（`Date.now()`） | audio 脚本 |
| `window.__wallkitMedia` | `{ thumbnail, title, artist, albumTitle, primaryColor, textColor, playback, enabled, updatedAt }` | media 脚本 |
| `window.__wallkitTimeline` | `{ position, duration } \| null`（仅开启时） | timeline 脚本 |
| `window.__wallkitUserProperties` | `Record<string, unknown>`，每次推送换新对象（合并后的全量快照） | properties 脚本 |
| `window.__wallkitPropertyLog` | `{ at, keys }[]`，最多 8 条（诊断用） | properties 脚本 |
| `window.__wallkitPaused` | `boolean` | pause 脚本 |
| `wallkit-pause-change` | `CustomEvent<boolean>` | pause 脚本 |

**不可妥协的几条**（全部来自实机踩坑，见 `we-integration.md` §4–§6）：

- 宿主复用自身音频缓冲区 → 必须 `Float32Array.from(audioArray)` 复制一份。
- 播放状态整数由 `window.wallpaperMediaIntegration` 定义 → 严禁硬编码；常量对象缺失时保持 `playback = null`（未知），**绝不能猜成 `stopped`**。
- 不能无条件创建 `wallpaperPropertyListener` → 否则普通浏览器会被误判为 WE 环境。
- `playback === null` 视为播放中，只有明确的 `stopped` 才隐藏封面（WE 只在切歌时推送）。
- `track == null` 或字段全空时不渲染卡片；**任何情况下不掺合成数据兜底**，合成数据只在 playground 画廊里显式构造。

---

## 4. 计划文件

```
src/we/                     ✅ 已落地
├── index.js                 # hooks 的统一 re-export
├── vite-plugin.js           # wallkitWE()
├── audio.js                 # useWallpaperAudio / useWallpaperBeat + 共享 rAF 泵
├── media.js                 # useWallpaperMedia / useWallpaperTimeline
├── properties.js            # useWallpaperProperties / useWallpaperProperty
├── pause.js                 # useWallpaperPaused
└── inline/                  # 五段字符串常量
    ├── audio.js
    ├── media.js
    ├── properties.js
    ├── timeline.js
    └── pause.js
```

`properties` 是 P4 收口后追加的一段（2026-11-13），它不改动 `exports`，仅给 `wallkitWE()` 多一个开关和 `wallkit/we` 多两个 hook。

这正对应 architecture.md §4 原有的「尚未创建」清单，现已全部落地。`package.json` 的 `exports` 原已备好 `./we` 与 `./we/vite` 两个条目，**只填实现，未新增子路径**。

---

## 5. 接线改造（playground）

| 步骤 | 动作 |
|---|---|
| 1 | 实现 inline 常量 + 插件 + hooks |
| 2 | `vite.config.js` 与 `vite.wallpaper.config.js` **两份都**加 `wallkitWE()` |
| 3 | 两份 config 的 `resolve.alias` 补一条精确映射（见下方坑） |
| 4 | 删掉 `wallpaper.html` `<head>` 里的三段脚本及那段说明注释 |
| 5 | `wallpaper.jsx` 的 hooks import 从 `./wallpaper-data.js` 换成 `wallkit/we`；`useNow()` 与 HUD 的 `status` 采集留在 playground |
| 6 | `wallpaper-data.js` 退役：只保留 `useNow` 与 HUD 状态采集，音频 / 媒体 / 暂停三段删除 |
| 7 | 在 WE 里再验一次，这次验的是**接线**而不是控件（✅ 已完成，复验通过） |
| 8 | 撤掉文档里所有「P4 未实现」的警告（清单见 §7） |

### 三个必须注意的接线细节

**(1) 两份 Vite 配置都要挂插件。** `npm run dev` 走 `vite.config.js`，它同时服务 `index.html`、`wallpaper.html`、`layout.html`；`build:wallpaper` 走 `vite.wallpaper.config.js`，输入是 `wallpaper.html` + `layout.html`。只在后者挂插件，dev 预览与构建产物就走了两条不同的路径，§7.3 的「dev / prod 行为一致」不成立。插件会对所有 HTML 入口注入 —— 画廊与 `layout.html` 用合成数据、浏览器里没有宿主函数，脚本走 `typeof ... === 'function'` 的 false 分支不注册任何监听器，无害。`layout.html` 是几何验证页，**不要**让它依赖 WE 回调。

**(2) playground 的 alias 解析不了 `wallkit/we/vite`。** 两份 config 现在只有：

```js
wallkit:  ../src/index.js
'wallkit/': ../src/
```

而 `./we/vite` 在 exports 里指向 `src/we/vite-plugin.js`，文件名不是 `vite.js`，按前缀替换会找不到文件。实现时需在两份 config 里、`'wallkit/'` **之前**加一条精确映射：

```js
'wallkit/we/vite': fileURLToPath(new URL('../src/we/vite-plugin.js', import.meta.url)),
```

真实使用方走 node_modules 的 `exports` 解析，不存在这个问题；这是 playground「直接引用 ../src 源码」的近似别名带来的局限，不要误以为是库的路径设计有误。实现时除了 `wallkit/we/vite`，还补了 `wallkit/we` 的精确映射，两条都排在宽条目之前。

**(3) 两份 config 自己必须用相对路径 import 插件。** Vite 会在 `resolve.alias` 生效**之前**先把 config 文件打包，所以 `import { wallkitWE } from 'wallkit/we/vite'` 在 config 里走的是 Node 模块解析 —— 而 playground 并未安装 `wallkit` 包（它只通过 alias 引用 `../src`），会直接解析失败。因此两份 config 都写 `import { wallkitWE } from '../src/we/vite-plugin.js'`；alias 精确映射只服务于应用源码（例如 `wallpaper.jsx` 里的 `import ... from 'wallkit/we'`）。另外精确条目必须排在 `wallkit` / `wallkit/` 之前：Vite 的字符串 alias 会把 `wallkit` 也当作 `wallkit/we` 的前缀匹配。

**进度**：步骤 1–8 全部完成。步骤 7 已通过 `npm run deploy:wallpaper` 把新接线部署到 WE 测试工程，并在 WE 中复验通过。

---

## 6. 验收

- **WE 中**：HUD 音频帧数持续增长、帧龄接近 0、媒体字段被填充；暂停切换时频谱冻结、`now` 停止更新；四个控件视觉与行为与 P3 实机验证结果一致（本次不改任何组件 API）。✅ 已复验通过。
- **浏览器中（无宿主）**：`bars` 保持 `null` / 全零，频谱画空图、不掺合成数据 —— **这是正确行为**，不要为了好看兜底。
- **插件幂等**：重复调用不重复注入；dev 预览与 `build:wallpaper` 产物里，脚本都在 `<head>` 最前且是 classic script。✅ 已在真实构建产物中确认。
- **隔离开关**：只 import `wallkit/components/*` 的页面不出现任何 `wallkit/we` 代码。

**当前状态**：全部通过。实现阶段用静态验证确认了插件幂等 / classic script / 注入顺序 / 隔离开关 / 四段脚本语法 / 两份 config 可加载（直接调用 `transformIndexHtml.handler()`、`node --check`、esbuild 语法解析，未跑浏览器自动化）。随后经用户确认执行 `npm run deploy:wallpaper`：在真实 `build:wallpaper` 产物中确认 3 段 classic script 位于 `<head>` 最前、顺序 `audio → media → pause`、`timeline` 按默认关闭、`Float32Array.from` 等约束保留，`dist-wallpaper/wallpaper.html` 与 WE 工程文件 md5 一致；最后在 WE 中复验，用户确认结果正常。这次验的是**接线**，不是控件。

**追加段（2026-11-13）**：`properties` 段与其 hooks 是在 P4 收口之后加进来的。已完成静态验证（esbuild 解析内联脚本与 hook 源码、`project.json` JSON 解析、`env.js` 证据链复查、插件注入顺序 `audio → media → properties → pause` 与二次注入 0 段）；并已 `deploy:wallpaper` 到 WE 测试工程，同时把 `playground/public/project.json` 覆盖过去（原编辑器导出的那份备份为 `project.json.bak`）。**WE 实机行为待用户确认**，待验项：改一项设置后 `window.__wallkitUserProperties` 只更新对应 key、HUD 的 `events` 行新增一条且只列该 key；`applyUserProperties` 与 `setPaused` 共存于同一个监听对象上；`accentColor` / `clockAnchor` / `sizeScale` 三项能改变画面。

诊断手段：桥接自带 `window.__wallkitPropertyLog`（`{ at, keys }[]`，上限 8 条，只记本次推送带来的 key）。它必须写在内联桥里而不是 React 侧——加载期那次全量推送早于 React 挂载。测试页用 `useWallpaperPropertyLog()` 轮询数组引用读取，HUD 的 `events` 行显示总次数与最近 3 条。

验证按 AGENTS.md 的规矩执行：不自行启动 dev server、不跑浏览器自动化；`build:wallpaper` / `deploy:wallpaper` 是在用户确认后才运行的，用于生成 WE 实际加载的产物。需要渲染检查时用无头截图并立即关闭。

---

## 7. 文档同步清单（已完成）

| 文件 | 改动 |
|---|---|
| `AGENTS.md` | 入口表的「P4 占位」改为正式 hooks；Reference documents 加本文件 |
| `README.md` | 撤掉 §WE 集成 的 ⚠️ 警告块，改为正式用法；状态表 P4 标完成 |
| `docs/architecture.md` | §7.2 状态、§14 阶段表、§4「尚未创建」备注 |
| `docs/we-integration.md` | 文首状态、§2.1「现在不要用」、§8 的 P4 提示、§9 速查表 |
| `docs/extraction-map.md` | §2.3、§6 步骤 5、§7 未决项 |
| `docs/spectrum-design.md` | 不受影响 |

以上六处已在实现落地、静态验证通过后同步完成，所有「P4 未实现 / 插件静默失败」警告均已撤销；WE 实机接线复验通过后，状态统一改为「P4 完成（WE 实机接线复验通过）」。

---

## 8. 风险与不做的事

- **插件绑定 Vite。** 第二个项目若换构建工具，重写范围只限 `vite-plugin.js`；inline 常量与 hooks 不依赖构建工具，风险可控。这是相对 §14 原计划（P4 等第二个项目再做）提前落地的主要代价。
- 不修 `devicePixelRatio` 技术债（AGENTS.md 明确「保持现状，不要顺手改」）。
- 不新增组件、不改现有 `exports` 条目形状。
- `timeline` 虽预留脚本与 hook，但**不新增组件消费它**；`TrackTimeline` 仍属后续阶段，且必须遵守「数据缺失返回 `null`」的硬约束。
- 不把 `status` / `staleMs` / 合成数据带进库。
