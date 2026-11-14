# Changelog

面向使用方的修改记录。本仓库通过 git 引用分发、不发 npm，所以每条记录以
**日期 + commit 短哈希** 为锚点——固定引用某个 commit 即可锁定行为，例如
`"wallkit": "github:mikoberry/wallkit#9b29b10"`。

格式参考 [Keep a Changelog](https://keepachangelog.com/)，只记录影响使用方的
变化（新增能力 / 行为变化 / 破坏性改动），内部重构与纯文档修正从简。

## 2026-11-14

### Added

- **新增构建期工具 `wallkit/project`**（`701eedf`）：按声明生成 / 合并 `project.json`，不再每次手抄
  工程清单。`defineProject({ file, title, description, tags, preview, properties })` 补
  齐引擎默认值（`schemecolor`、`general.supportsaudioprocessing`、`type: "Web"`），属性
  用构造器声明——`color('#a8c4ff')` 自动转成 manifest 要的 `"168 196 255"`，
  `slider` / `bool` / `combo` / `text` / `html` / `file` / `directory` / `group` 各自校验
  必填项，`index` / `order` 按声明顺序自动编号。`html()` 产出 `type: "text"` 区块：
  引擎把它的 `text` 当 HTML 渲染，这是 `project.json` 里唯一能放分区标题、分隔线、
  主页链接与图标的位置（没有 homepage / icon 字段）；`condition: 'showAudio.value == 1'`
  可让控制项随另一个属性显隐，工具会校验格式，并拒绝引用未声明的 key。
  `mergeProject()` 是合并而非覆盖：未声明的键与
  属性保留，`workshopid` / `version` / `snapshotformat` / `snapshotoverlay` 无条件保留
  （丢了 `workshopid`，下次发布会变成新建 Workshop 条目）。`diffProject()` 供 `--check`
  做语义比较（`type` 大小写、键顺序、缩进都不算漂移）。**这是纯函数模块，不进运行时、
  不进 Vite 插件、不自动跑**：编辑器会整份重写该文件，所以只作为手动步骤使用。
  用法见 [docs/project-tool.md](docs/project-tool.md)，playground 里有一份示例配置
  （`npm run gen:project` / `check:project`），并带 50 条断言的自测
  `npm run test:project`（`node:assert`，不需要 WE）。开发服务器里
  `playground/dev-properties.js` 会把该配置按引擎的格式推给页面，HUD 上标为
  `sim`——用来在不打开 WE 的情况下看属性是否真的接到了控件。

- **新增 `Spotlight` 控件（`wallkit/components/spotlight`）**（`7bfee31`）：跟随指针的聚光灯 / 关灯
  效果——一个亮圈跟着鼠标，圈外压暗。`size`（直径 80–3000px）、`feather`（边缘软硬
  0–1，0 为硬边）、`dim`（遮罩浓度）、`glow`（圈内高光，`screen` 混合只提亮）、
  `darkColor` / `lightColor`、`smoothing`（跟随延迟，时间常数秒，0 为逐事件直贴）、
  `visible` / `paused`。整层是两层 CSS 径向渐变，**没有 canvas、没有绘制循环**：
  指针移动只改写 `--wallkit-spotlight-x` / `-y` 两个变量，零 React 重渲染，
  `smoothing=0` 时连 rAF 都不开。收到第一个指针事件前遮罩**保持全透明**，
  不会把没有鼠标输入的 WE 桌面压成黑屏。`z-index: 6`，压在全部控件之上
  （遮罩本来就要压住时钟与专辑卡，想让某个控件始终亮着可在自己的样式表里降级）。
  层级链更新为 ambient 1 → spectrum 3 → 指针特效 4 → clock / album 5 → spotlight 6。
  与 `PointerFx` 同一条 WE 限制：桌面壁纸默认不投递鼠标事件，实机需开启鼠标交互。

- **AlbumArt 新增 `type` 纯排版布局**（`33078bb`）：完全不渲染封面，衬线大字曲名 +
  字距拉开的 artist + 斜体专辑行；唯一图形是封面主色（`track.primaryColor`）
  染色的竖线和底部一小块 LED 点阵频谱。卡片高度随内容走，文字跟随 `theme`。
  现共 11 种布局。
- **AlbumArt 新增五种布局**（`33078bb`）：`cassette`（磁带，卷轴随播放转动、带芯取封面主色）/
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

### Changed

- **Spectrum `ripples` 改为「一鼓一波」的随机水波**（`89f5ace`）：发射改为**瞬态检测**（低频相对
  上一帧的上升量 + 不应期），恒定的低频长音只在起音时发一道波，静音段完全不发——
  原来按平均电平每 0.5s 补一道源，听感是节拍器，已删除。每道波在出生时随机掷出
  自己的波形（3–5 波 + 2–4 波两条反向正弦、权重、初相、幅度），沿途保持不变，只
  缓慢漂移与随扩散变平；轮廓不再是 `arc()` 画的圆，峰值起伏约 ±14% 半径。中心保留
  一圈不扩张的静态水面，静音时不至于空掉。参数与数据通路未变，使用方无需改动。
- **Clock `segments` 进度填充改为连续实心 + 中性灰默认色**（`36ecfae`；浅色文字主题
  `#e9ecf1` 近白实心，深色文字主题 `#3f444c` 近黑实心）：已走部分渲染为一整条
  不间断的实心灰，未走部分保持格纹轨道，「实心 vs 格纹」+ 明度差双重区分；
  原填充曾与轨道共用格纹渐变，走时和没走的部分看起来一样碎。默认色不再回落
  全局淡蓝 accent（与偏白的文字色拉不开差距）。要自定义仍可在包裹层写
  `--wallkit-clock-seg-accent`。
- **AlbumArt `cassette` 的频谱移入磁带透明窗**（`33078bb`）：原壳外细条删除，透明窗兼作
  电平表（频谱在带芯上、卷轴之下），窗口因此略高。频谱仍随 `hasBars` 与
  `colorHex` 走。
- **`steam` 形态定稿**（`9b29b10`）：与 `fog` 同款大团缓移运动、方向改为竖直
  上升；尺寸沿用雾的预设（count 12 / baseSize 110），精灵与雾共用同一形状，
  仅颜色不同（`#eef1f4`）。
- **`fog` 加大一号**（`9b29b10`）：`baseSize` 110 → 140。
- **`fog` / `steam` 更浓**（`da340ba`）：基础 alpha 0.08–0.16 → 0.14–0.30。
  此前即使 `intensity` 拉满 300%，中心有效浓度也只有约 0.29；现在默认浓度
  约翻倍，且 `intensity` 旋钮有真实可感的调节余量。

### Removed

- **AlbumArt 移除 `wall`（封面墙）布局**（`33078bb`）。`variant="wall"` 会回退到 `classic`；
  想要类似效果请改用其它布局。

### Fixed

- **AlbumArt `type` 的点阵频谱看不清**（`e867b5f`）：容器只有 8px 高时 `drawDots`
  只能画出一行亚像素小点。现为 0.32 unit / min-height 32px，约 8 行 LED 网格。
- **AlbumArt `polaroid` 三处**（`e867b5f`）：曲名/歌手被截断（白边高度不足 + 单行省略，
  标题改为最多两行折行）；相纸旋转 -3° 的四角被卡片 `overflow: hidden` 裁掉
  （根节点留出旋转余量、body 放行溢出）；曝光条加高到 0.16 unit 且手写区
  文字垂直居中，短标题不再在底部堆空白。

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
