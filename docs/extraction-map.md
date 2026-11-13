# 抽取映射：anime-model-viewer → WallKit

> 关联：[architecture.md](./architecture.md)
> 源项目：`D:\code\js\anime-model-viewer`（Spine 3.8 WE 壁纸）

本文记录现有的哪些代码会迁移进 WallKit、哪些留在应用层。**每一行都要有明确归属，不留"待定"。**

---

## 1. 归属总原则

| 判据 | 归属 |
|---|---|
| 纯渲染、只依赖 props | → WallKit |
| 采集 WE 数据 | → 应用层，或可选进 `wallkit/we` |
| 与 Spine / 画布相关 | → 应用层（永久） |
| 应用状态、偏好持久化 | → 应用层 |
| 业务脚本（模型导入打包） | → 应用层（永久） |
| i18n | → 应用层（永久） |

---

## 2. 迁移进 WallKit

### 2.1 组件

| 源文件 | 大小 | 目标 | 改动 | 状态 |
|---|---|---|---|---|
| `src/components/Clock.jsx` | 14.8 KB | `src/components/clock/` | **重写接口**：去掉 localStorage、去掉 i18n、去掉自身轮询，改为接收必需 `now`、可选 `visible`、字符串 `labels` | ✅ 已迁 |
| `src/components/Clock.css` | 15.2 KB | 同目录 | 颜色改为 `var(--wallkit-*)` | ✅ 已迁 |
| `src/components/Spectrum.jsx` | 6.6 KB | `src/components/spectrum/` | **重写接口**：接收 `bars` 而非读取源；定位改为 `offsetX`/`offsetY`/`size` | ✅ 已迁 |
| `src/components/Spectrum.css` | 2.0 KB | 同目录 | 同上 | ✅ 已迁 |
| `src/components/MiniSpectrum.jsx` | 6.5 KB | `src/components/mini-spectrum/` | 判断依据从 `kind` 改为 `bars == null`；音频采集移出，只收 `bars` | ✅ 已迁 |
| `src/components/MiniSpectrum.css` | 0.5 KB | 同目录 | 同上 | ✅ 已迁 |
| `src/components/AlbumArt.jsx` | 8.0 KB | `src/components/album-art/` | **重写接口**：接收 `track` / `bars`；去掉 1 秒轮询与 localStorage | ✅ 已迁 |
| `src/components/AlbumArt.css` | 18.5 KB | 同目录 | 同上 | ✅ 已迁 |

### 2.2 纯函数工具

| 源文件 | 目标 | 说明 | 状态 |
|---|---|---|---|
| `src/utils/clock.js`（`computeClockTilt` 等） | `src/core/clock.js` | 纯计算，可直接搬 | ✅ 已迁 |
| `src/utils/audio.js` 中的 `extractSpectrumBars` / `smoothAudioLevel` | `src/core/audio.js` | 柱状数据加工；`syntheticSpectrum` **不进库** | ✅ 已迁（另加 `resampleBars` / `shapeSpectrumLevel` / `bassLevel`） |
| `src/utils/spectrum.js`（18.8 KB） | 拆解 | 见 §2.4 | ✅ 已拆 |

### 2.3 可选模块 `wallkit/we`

| 源文件 | 目标 | 说明 |
|---|---|---|
| `src/utils/wallpaperAudio.js` | `src/we/audio.js` | 改为 hook 形式，返回 `Float32Array \| null` |
| `src/utils/wallpaperMedia.js` | `src/we/media.js` | 改为 hook，返回 `TrackInfo \| null` |
| `src/utils/wallpaperPause.js` | `src/we/pause.js` | 保留事件订阅模式 |
| `index.html` 三段内联脚本 | `src/we/inline/*.js` | 改写为字符串常量，供插件注入 |
| （新增） | `src/we/vite-plugin.js` | Vite 插件（当前为空占位） |

**注意**：`wallkit/we` 标记为可选，P4 阶段实现。组件不依赖它也能工作。两个占位文件的现状不同：`src/we/index.js` 只有 `export {}`（导入 hooks 会构建报错），`src/we/vite-plugin.js` 返回空 plugin（加了等于没加，静默不注入）。

### 2.4 `Spectrum` 的迁移方式（P2 阶段，已完成）

P2 已迁移以下文件：

| 文件 | 处理 | 状态 |
|---|---|---|
| `src/components/Spectrum.jsx`（6.6 KB） | 重写接口后迁入 `src/components/spectrum/Spectrum.jsx` | ✅ |
| `src/components/Spectrum.css`（2.0 KB） | 同目录，颜色改 `var(--wallkit-*)` | ✅ |
| `src/utils/spectrum.js`（18.8 KB） | 按职责拆解 | ✅ |

`src/utils/spectrum.js` 内部混杂的四类职责，实际去向：

| 职责 | 去向 |
|---|---|
| 频谱数据加工（归一化、平滑、分桶） | `core/audio.js` 纯函数 + `Spectrum.jsx` 内部的逐帧平滑 |
| 合成数据生成（`syntheticSpectrum`） | **永久留在应用层 / playground**，不进库 |
| 定位计算（offset 百分比 → 实际像素） | 不需要了：`size` 乘进盒子宽高，浏览器直接算像素 |
| 绘制（9 种样式）与颜色计算 | `components/spectrum/renderers.js` + `core/audio.js` 的 `spectrumGradientStops()` |

**注意**：`Spectrum` 的定位参数（`offsetX/offsetY/scale`）是原应用层调参的结果，迁移时按 `offsetX`/`offsetY`/`size` 重新定义，不原样沿用（换算关系见 [spectrum-design.md](./spectrum-design.md) §11）。

---

## 3. 留在应用层（永久）

### 3.1 背景与画布

| 文件 | 原因 |
|---|---|
| `src/spine-webgl.js`（422 KB） | Spine 3.8.99 runtime，**背景层专属**，不进库 |
| `src/spineStage.js`（15.3 KB） | WebGL 渲染、资源释放、动画状态机，**背景层专属** |
| `src/App.jsx`（32.7 KB） | 应用状态与编排 |

### 3.2 应用逻辑

| 文件 | 原因 |
|---|---|
| `src/components/SettingsDrawer.jsx`（64.9 KB） | 抽屉，**明确不进库** |
| `src/components/SettingsDrawer.css`（22.7 KB） | 同上 |
| `src/i18n.js`（44.9 KB） | **明确不进库**，文案由使用方传入 |
| `src/utils/modelPreset.js` | 模型预设，应用业务 |
| `src/utils/clipboard.js` | 抽屉专用 |
| `src/base.css` / `src/App.css` | 应用外壳样式 |

### 3.3 构建与业务脚本

| 文件 | 原因 |
|---|---|
| `scripts/import-models.mjs` | 模型导入，业务 |
| `scripts/prepare-models.mjs` | 模型打包，业务 |
| `scripts/package-models.mjs` | 打包与部署，业务 |
| `scripts/copy-to-we.mjs` | 部署到 WE 目录，业务 |
| `scripts/dev-all.mjs` | 开发编排，业务 |
| `model-library/` / `model-presets.json` / `deploy-models.json` | 模型资产，业务 |
| `vercel.json` / `.github/workflows/` | 部署配置，业务 |

### 3.4 偏好持久化

所有 `spine-viewer:*` 键**留在应用层**，不进库：

| 键 | 含义 |
|---|---|
| `spine-viewer:model-views:v1` | 每模型视角记录 |
| `spine-viewer:clock:v1` | 时钟偏好 |
| `spine-viewer:spectrum:v1` | 频谱偏好 |
| `spine-viewer:album-art:v1` | 专辑卡片偏好 |
| `spine-viewer:language:v1` | 语言 |
| `spine-viewer:drawer-tab:v1` | 抽屉选中标签 |

保持键名不变 → 迁移后你调好的模型预设不丢失。

---

## 4. 逐组件接口迁移要点

### 4.1 Clock

| 当前 | 迁移后 |
|---|---|
| 内部 `setInterval` 每秒轮询 | 接收**必需** `now: Date`，使用方驱动 |
| 读 `spine-viewer:clock:v1` | 无状态，全部经 props |
| 中/英/日/韩 硬编码文案 | `labels` **字符串对象**由使用方传入（不用函数）。实际字段：`locale` / `weekday` / `dateWithWeekday` / `aria` |
| 监听 `visibilitychange` / WE 暂停 | 无 `paused` prop：**组件不感知暂停**。使用方在暂停时停止更新 `now`，或传 `visible={false}` 摘掉 DOM |
| 指针 3D 倾斜内部计算 | 保留计算，`tilt` 可覆盖 |

保留的视觉细节：`pointer-events: none`、左下角默认位置、`computeClockTilt` 的倾斜算法。

### 4.2 Spectrum

| 当前 | 迁移后 |
|---|---|
| 从 `wallpaperAudio` 读帧 | 接收 `bars` |
| `kind` 决定真实 / 合成 | `bars == null` 即不渲染 |
| `offsetX/offsetY` 视口百分比 + `scale` CSS transform | **改为** `offsetX` / `offsetY` / `size` 平铺 prop，左下锚点；`size` 乘进盒子尺寸，不再用 `transform: scale()`（见 [spectrum-design.md](./spectrum-design.md) §4） |
| `spine-viewer:spectrum:v1` 状态 | 无状态 |
| 尺寸用 `offsetWidth/offsetHeight` 测量 | **保留**这条约束（`getBoundingClientRect` 会双重缩放） |
| 128 柱 Canvas 2D | 保留 |

**必须保留的约束**：Canvas 尺寸必须用 `offsetWidth` / `offsetHeight` 测量，不能用 `getBoundingClientRect`——后者返回缩放后的尺寸，会导致双重缩放。

### 4.3 AlbumArt

| 当前 | 迁移后 |
|---|---|
| 每秒轮询 `__weMedia` | 接收 `track` prop；轮询留在应用层（引擎只在变化时推送，读桥是廉价的，但库不碰） |
| `playback === 'stopped'` 才隐藏 | 保留同一语义；`null`（未知）视为播放中，否则封面会永久消失 |
| 内部渲染 `MiniSpectrum` | 保留，`bars` 可选透传；无 `bars` 时卡片照常显示，只是少了图 |
| 封面 24s 旋转 | 保留；`paused` 或 `playback="paused"` 停转，`prefers-reduced-motion` 下不转 |
| `spine-viewer:album-art:v1` | 无状态，位置经 `offsetX/offsetY/size` |
| `corner` + `size`（vh） | 弃用：与 Clock/Spectrum 统一为左下锚点 + 百分比 |
| `t={...}` 国际化 + `lang` | 全部移除；只留 `labels.aria` / `labels.coverAlt` |
| 封面缺失时的占位块 | 保留（`thumbnail` 为空串时） |
| 无媒体集成时的提示文案 | 不保留：`track == null` 直接不渲染，空态由使用方决定 |

### 4.4 MiniSpectrum

| 当前 | 迁移后 |
|---|---|
| 判断 `kind` 决定真实 / 合成 | `bars == null` 时不渲染；合成数据不进库 |
| 自己读音频帧、自己折叠 128 → 32 | 只收 `bars`；折叠由组件内部用 `resampleBars` 完成（默认 32 柱） |
| 填满父容器（`position:absolute; inset:0`） | 保留"填满父容器"，改为 `width/height:100%`；**绝对定位由宿主决定**（AlbumArt 里才 absolute） |
| 用 `getBoundingClientRect` 量尺寸 | 改为 `offsetWidth/offsetHeight`（双重缩放约束） |
| 与 AlbumArt 共享 `readBars` | 与 `Spectrum` 共享 `shared/SpectrumCanvas` 的绘制循环 |

---

## 5. 已知技术债（迁移时保持原状，不在库中修）

这些是原项目已知但**尚未修复**的问题。迁移时**保持行为一致**，单独记录，不在抽取过程中顺手改：

| 问题 | 说明 |
|---|---|
| 无 `devicePixelRatio` 处理 | Canvas 后备存储按 CSS 像素设置，高 DPI 会模糊。背景层的画布留在应用层；`Spectrum` 的 Canvas 把这条债**带进了库**，登记在 [spectrum-design.md](./spectrum-design.md) §8，不在迁移时顺手改 |
| 无 TypeScript | 库使用 JS + JSDoc，无编译步骤 |
| 无测试套件 | 验收依赖人工在 WE 中目视 |
| `action` 动画仅两种 | `idle` / `action`，属于背景层 |

**`Spectrum` 的 Canvas 测量是例外**：`offsetWidth/offsetHeight` 的约束必须带进库，否则会引入缩放 bug。

---

## 6. 迁移顺序

每步都要求 **anime-model-viewer 切换后视觉与行为完全不变**。

| 步骤 | 动作 | 验证 | 状态 |
|---|---|---|---|
| 1 | 建 `core` + `styles` 骨架，应用接入 `wallkit`（git 依赖） | 应用能构建启动 | ✅ 库侧完成；应用侧接入由使用方执行 |
| 2 | 抽 `Clock`，应用改用 `<Clock now={...} />` | 时钟外观、倾斜、语言切换不变 | ✅ 库侧完成；待实机验证 |
| 3 | 抽 `Spectrum` | 频谱外观、位置、缩放行为不变（按新 `offsetX`/`offsetY`/`size` 换算后） | ✅ 库侧完成；待实机验证 |
| 4 | 抽 `MiniSpectrum` + `AlbumArt` | 专辑卡片外观、迷你频谱、旋转不变 | ✅ 库侧完成；待实机验证 |
| 5 | 实现 `wallkit/we` + 插件，应用改用插件注入 | 音频、媒体、暂停行为不变 | ⬜ 未开始（P4） |
| 6 | 移除应用内已迁移的旧文件 | 无重复代码 | ⬜ 待步骤 5 |

**应用内永久保留**：`SettingsDrawer.*`、`i18n.js`、`src/utils/wallpaper*.js`（若未启用 `wallkit/we`）。

**步骤 5（`wallkit/we`）可以延后**：前面的组件不依赖它，应用继续用自己的 `src/utils/wallpaper*.js` 直接出数据。

**Clock 必须先完成并验证，才进入步骤 3。** Clock 用来验证「纯 props、无状态」的接口模式；该模式确认后，Spectrum 再沿用，避免定位抽象设计错误。

---

## 7. 未决事项

### 已定（P1 / P2 / P3 落地时确认）

| 事项 | 结论 | 出处 |
|---|---|---|
| `Clock` 的 `labels` 字段 | `locale` / `weekday` / `dateWithWeekday` / `aria`。**没有 `date`、没有 `dateFormat`** | `src/components/clock/Clock.jsx` JSDoc、[architecture.md](./architecture.md) §9 |
| `Clock` 的 `tilt` 覆盖形状 | `false` / `true` / `{ maxTilt, speed }`，`maxTilt: 0` 等同关闭 | `src/core/clock.js` `computeClockTilt` |
| 定位设计 | 无 `Placement` 对象：`offsetX` / `offsetY` / `size` 平铺，左下锚点 | [spectrum-design.md](./spectrum-design.md) §4 |
| `Clock` 是否需要 `paused` | 不需要。暂停由使用方停止更新 `now` 处理，组件不感知 | [architecture.md](./architecture.md) §5.4 |
| `MiniSpectrum` 与 `AlbumArt` 是否共享内部柱状渲染 | **是**：`renderers.js` 与绘制循环提到 `components/shared/`（`SpectrumCanvas.jsx`） | `src/components/shared/` |
| `AlbumArt` 的 `bars` 必传还是可选 | **可选**：没有 `bars` 时卡片照常显示，`vinyl` 布局本就无频谱 | `src/components/album-art/AlbumArt.jsx` |

### 仍待定

无。P3 的两个开口已随实现关闭；P4 的三项（`wallkit/we` 的 hook 形态、插件注入方式、内联脚本要不要做成字符串常量）留到动手时再定，见 [we-integration.md](./we-integration.md) §2。
