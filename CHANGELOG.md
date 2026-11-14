# Changelog

面向使用方的修改记录。本仓库通过 git 引用分发、不发 npm，所以每条记录以
**日期 + commit 短哈希** 为锚点——固定引用某个 commit 即可锁定行为，例如
`"wallkit": "github:mikoberry/wallkit#9b29b10"`。

格式参考 [Keep a Changelog](https://keepachangelog.com/)，只记录影响使用方的
变化（新增能力 / 行为变化 / 破坏性改动），内部重构与纯文档修正从简。

## 2026-11-14

### Added

- **AlbumArt 新增 `type` 纯排版布局**：完全不渲染封面，衬线大字曲名 +
  字距拉开的 artist + 斜体专辑行；唯一图形是封面主色（`track.primaryColor`）
  染色的竖线和底部一排淡频谱点。卡片高度随内容走，文字跟随 `theme`。
  现共 11 种布局。
- **AlbumArt 新增五种布局**：`cassette`（磁带，卷轴随播放转动、带芯取封面主色）/
  `polaroid`（拍立得，白框微倾 + 手写风注释）/ `cd`（银色碟面 + 彩虹衍射光泽）/
  `poster`（唯一竖版：封面压暗做底图 + 衬线大字 + 底部均衡器）/ `ticket`
  （票根：封面 stub + 打孔线 + 条码状频谱）。
  纸面样式（磁带标签 / 拍立得 / 票根）用固定深色墨、海报用固定浅色墨，
  不随 `theme` 翻转。
- **AmbientFx 新增四种形态**（`9b29b10`），现有七种：
  `snow` / `sakura` / `bubble` / `steam` / `rain` / `fog` / `leaves`
  - `rain` — 高速细雨丝，随风整体倾斜（倾斜角由预设 drift 推导）
  - `fog` — 大团薄雾横向漂移，左右边缘淡入淡出
  - `leaves` — 强风斜落、之字翻滚、逐叶自转
  - `steam` — 水蒸气（见下方 Changed，最终为雾的竖直孪生）
- **AmbientFx 新增通用 `speed` prop**（`9b29b10`）：20–300%（默认 100），
  缩放整层的时钟。位移、摆动、闪烁、生命期曲线同步快慢；对全部七种形态生效。
  小雨/大雨这类区分建议用 `density` + `size` + `intensity` + `speed` 组合表达。

### Removed

- **AlbumArt 移除 `wall`（封面墙）布局**。`variant="wall"` 会回退到 `classic`；
  想要类似效果请改用其它布局。

### Changed

- **AlbumArt `cassette` 的频谱移入磁带透明窗**：原壳外细条删除，透明窗兼作
  电平表（频谱在带芯上、卷轴之下），窗口因此略高。频谱仍随 `hasBars` 与
  `colorHex` 走。
- **`steam` 形态定稿**（`9b29b10`）：与 `fog` 同款大团缓移运动、方向改为竖直
  上升；尺寸沿用雾的预设（count 12 / baseSize 110），精灵与雾共用同一形状，
  仅颜色不同（`#eef1f4`）。
- **`fog` 加大一号**（`9b29b10`）：`baseSize` 110 → 140。
- **`fog` / `steam` 更浓**（`da340ba`）：基础 alpha 0.08–0.16 → 0.14–0.30。
  此前即使 `intensity` 拉满 300%，中心有效浓度也只有约 0.29；现在默认浓度
  约翻倍，且 `intensity` 旋钮有真实可感的调节余量。

## 2026-11-13

### Added

- **控件层四件套全部落地**：
  - `Clock`（`6f3ed1e`）：12 种布局（card / bar / minimal / cyberpunk /
    infobar / split / poster / ring / segments / stamp 等），音频响应
    `beat` / `beatIntensity` / `beatCurve`，指针跟随 `tilt`（`b9d5c1f`），
    12/24 小时切换回调。
  - `Spectrum`（`48ebdfb`）与 `MiniSpectrum` / `AlbumArt`（`2321aed`）：
    9 种频谱绘制形态，浮动漫挂与父容器填满两种定位模型。
  - `PointerFx`（`b16ecaa`）：鼠标拖尾 + 点击特效覆盖层（bubble / firework
    形态），需宿主开启鼠标交互。
  - `AmbientFx` 初版（`c3a4a66`）：飘雪 / 樱花 / 气泡三种氛围粒子层。
- **锚点体系**（`357517a` → `f83426b`）：四角锚点扩展为九点锚点，
  `offsetX` / `offsetY` 接受 CSS 长度与百分比。
- **`wallkit/we` 数据源层**（`10003fb`）：`useWallpaperAudio` /
  `useWallpaperBeat` / `useWallpaperMedia` / `useWallpaperTimeline` /
  `useWallpaperPaused` 等 hooks，Vite 插件 `wallkitWE()` 注入 `<head>` 桥接。
- **用户属性接入**（`5e7572b`）：`project.json` 用户属性 →
  `useWallpaperProperties()`，编辑器里调属性实时生效。
- **强调色自动取色**（`94cc7e3`）：playground 从专辑封面推导
  `--wallkit-accent`。

### Changed

- `Clock` / `AlbumArt` 支持任意文字颜色 `color` prop（`793a51d`）。
- 频谱抽取与绘制循环抽成共享模块 `shared/SpectrumCanvas.jsx`（`ddd268f`），
  `Spectrum` 与 `MiniSpectrum` 共用。
- 时钟节拍响应由阶梯改为按帧平滑（`7eb2111`）。

### 备注

- 项目首日奠基：核心工具层（env / storage / clock / audio）、P0–P2 组件、
  playground 本地预览与 WE 测试页（`6323b58`）同日完成，细节见
  `docs/architecture.md`。
