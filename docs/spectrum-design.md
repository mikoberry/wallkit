# Spectrum 设计（P2）

> 状态：已实现，待实机验证
> 最后更新：2026-11-13
>
> 相关文档：[architecture.md](./architecture.md) · [extraction-map.md](./extraction-map.md)

本文锁定 `wallkit/components/spectrum` 的接口与实现方案。数据边界沿用 architecture.md §5，定位语义沿用 Clock 的约定。

---

## 1. 目标与边界

`Spectrum` 是**独立浮动的柱状/环形频谱**，纯展示控件。

| 做 | 不做 |
|---|---|
| 接收归一化后的 `bars` 并绘制 | 读取 `window.wallpaper*`、音频帧、全局状态 |
| 自己做逐帧平滑与动画 | 生成合成数据兜底 |
| 尊重 `paused` / `visible` / `prefers-reduced-motion` | 读写 localStorage、内置定时器、i18n |
| Canvas 2D 渲染 9 种样式 | 感知背景层或画布尺寸 |

**数据缺失即不渲染**：`bars == null` 时返回 `null`。合成数据只允许出现在 `playground/`。

---

## 2. 接口

```jsx
<Spectrum
  bars={bars}                 // 必选。Float32Array | number[] | null，各值 0..1
  visible={true}
  variant="bars"              // 9 种样式之一
  colorHex={undefined}        // 省略时读 --wallkit-accent
  size={100}                  // 尺寸百分比，100 = 正常大小
  offsetX={0} offsetY={0}     // 视口百分比，左下锚点（同 Clock）
  intensity={100} curve={1}   // 响应强度 / 响应曲线
  paused={false}
/>
```

| Prop | 默认 | 范围 | 说明 |
|---|---|---|---|
| `bars` | — | 必选 | 每根柱子的幅度，0..1。**长度即柱数**（规范值 128） |
| `visible` | `true` | — | `false` 时不渲染 DOM，也不启动循环 |
| `variant` | `'bars'` | 见 §5 | 无效值回退 `bars` |
| `colorHex` | `undefined` | `#rrggbb` | 省略时从 `--wallkit-accent` 解析，失败回退 `#a8c4ff` |
| `size` | `100` | 20–500 | 整体缩放百分比，**100 = 正常控件大小**（见 §4） |
| `offsetX` | `0` | 0–100 | 距左边缘的视口百分比 |
| `offsetY` | `0` | 0–100 | 距下边缘的视口百分比 |
| `intensity` | `100` | 0–1000 | 响应强度百分比。100 = 原始柱高，>100 抬升弱信号，0 = 压平 |
| `curve` | `1` | 0.2–2 | 响应曲线指数。<1 抬升安静段（更敏感），>1 收紧成尖峰，1 = 线性 |
| `paused` | `false` | — | `true` 时冻结画面（见 §6） |

**`visible` 与 `paused` 的区别**：`visible={false}` 完全不渲染（无 DOM、无 rAF）；`paused` 保留控件在屏上但冻结。两者都停止绘制循环，所以隐藏或暂停时都不耗电。

**为什么 `variant` 而不是 `style`**：`style` 与 DOM/React 的 `style` 属性语义冲突，且 Clock 用 `placement` 表示形态，`variant` 与之对齐。

**为什么 `colorHex` 而不是 `color`**：组件需要一个可解析的十六进制值来推导渐变停靠点（见 §7），只接受 `#rrggbb`。用 `colorHex` 把契约写进名字，避免 `color="red"` 被静默忽略的意外。

**响应参数怎么归一化**：`intensity` / `curve` 的钳制与整型走 `shapeSpectrumLevel()`（§3），组件只持有最终倍数；默认值 `{ intensity: 100, curve: 1 }` 与原实现（直接用原始柱高）完全一致。

**为什么 `bars` 而不是原始帧**：抽取、降噪、左右声道镜像属于数据加工，放在 core 纯函数里由使用方调用（§3）。组件只消费最终柱高，和 Clock 只消费 `now` 是同一个模式。

**柱数怎么调**：柱数由 `bars.length` 决定，组件本身固定不了，也没有 `barCount` prop。想画更少/更多柱子时，使用方在传入前调用 `resampleBars(bars, count)` 折叠（数据加工归 core，组件保持无状态）。特例：`dots` 不看柱数，按画布宽度自动折叠成 6–48 列；`aurora` 固定折成 7 条带。

**bass 不单列 prop**：`ripples` / `aurora` 等需要整体低频能量，由组件从 `bars` 的低频段内部推导（`bassLevel()`），保持单一数据输入。

---

## 3. core 纯函数（`src/core/audio.js`）

从原 `src/utils/audio.js` 迁入，去掉合成部分。

| 导出 | 作用 |
|---|---|
| `AUDIO_BANDS = 64` | 每声道频段数（WE 契约） |
| `SPECTRUM_BARS = 128` | 规范柱数 |
| `DEFAULT_SPECTRUM_COLOR = '#a8c4ff'` | 回退色，与 `--wallkit-accent` 一致 |
| `SPECTRUM_INTENSITY_MIN/MAX/DEFAULT` | 响应强度百分比边界（0 / 1000 / 100） |
| `SPECTRUM_CURVE_MIN/MAX/DEFAULT` | 响应曲线指数边界（0.2 / 2 / 1） |
| `shapeSpectrumLevel(level, { intensity, curve })` | 对单根柱应用响应强度与曲线，结果钳到 0..1；默认值下等于原值 |
| `spectrumGradientStops(hex)` | `#rrggbb` → `{ top, bottom }` 渐变停靠点；非法输入返回 `null` |
| `extractSpectrumBars(frame, out?)` | 原始 128 帧 → 128 柱（降噪 + 左右声道镜像），不可用返回 `null` |
| `resampleBars(bars, count?, out?)` | 把柱数组折叠成 `count` 根（相邻求平均，顺序保持），用于调整绘制密度；不可用返回 `null` |
| `summarizeWallpaperAudio(frame)` | 原始帧 → `{ bass, left, right }`（Clock 的 `beat` 等使用方可用） |
| `smoothAudioLevel(current, target, delta)` | 帧率无关的非对称攻击/释放平滑 |
| `bassLevel(bars, { bands = 8 })` | 从柱数组低频段求整体能量，供环形/涟漪样式用 |

**不进库**：`syntheticSpectrum`、`syntheticAudioLevel`、`DEFAULT_SPECTRUM_COLOR` 之外的合成逻辑——永久留在 `playground/`（复制一份即可）。

`denoise` / `clampUnit` / `NOISE_FLOOR` / `SILENT_FRAME_PEAK` 等实现细节留在 `audio.js` 内部。

---

## 4. 定位与尺寸（Clock 约定）

与 Clock 完全一致，便于同一壁纸里两块控件用同一套坐标心智：

```
锚点：定位上下文（position 不为 static 的父元素）的左下角
offsetX / offsetY：视口百分比，0 贴边
size：整体缩放百分比，100 = 正常大小
```

DOM 结构：

```jsx
<div className="wallkit-spectrum__anchor" style={{ left: `${offsetX}%`, bottom: `${offsetY}%` }}>
  <div className={`wallkit-spectrum wallkit-spectrum--variant-${variant}`} style={{ '--wallkit-spectrum-scale': size/100 }}>
    <canvas className="wallkit-spectrum__canvas" />
  </div>
</div>
```

关键差异（相对原实现）：

- **不用 `transform: scale()`**。原实现靠 CSS transform 缩放、再用 `offsetWidth` 量尺寸，因此必须避开 `getBoundingClientRect`（会双重缩放）。新方案把 `size` 乘进盒子的 `width` / `height`，**Canvas 后备存储直接等于渲染像素**，`offsetWidth/offsetHeight` 量到的就是最终尺寸。原来的双重缩放隐患从结构上消除，但 §8 的 `offsetWidth` 约束仍然保留。
- **基准盒子 = 正常大小（`size = 100`）**。原实现的 `scale=1` 是近全屏（`90vw × 40vh`），现在把基准缩到正常控件量级，量级与 Clock 默认尺寸相近；`size` 放大到 500 仍可当全屏背景视觉。盒子尺寸按样式区分：
  - 条形类（`bars` / `mirror` / `curve` / `pill` / `dots`）：宽扁舞台，基准 `width: 30vw; height: 15vh`。
  - 环形类（`ring` / `ringwave` / `ripples` / `aurora`）：正方形，基准 `width/height: min(30vw, 28vh)`，保证圆不被视口拉伸。
  - 均乘以 `--wallkit-spectrum-scale`；小屏（≤640px）另有一组更大的比例。
- `position: absolute; pointer-events: none; z-index: 3`（局部层级，不设全局）。

---

## 5. 渲染架构

Canvas 2D，单次 paint，不用 128 个 DOM 节点。

```
组件
├── 逐帧：读 bars（ref）→ 求 bass → smoothAudioLevel 得 levels
├── 调 renderer(ctx, levels, w, h, color, state, { time, bass })
└── renderer 表按 style 索引，避免每帧判断字符串
```

9 种样式，其中 8 种与原实现一一对应、名称不变（预设兼容，作为 `variant` 取值）；`pill` 是抽取后新增的样式：

| variant | 形态 | 需要 bass / 时间 |
|---|---|---|
| `bars` | 经典柱状（默认） | 否 |
| `mirror` | 中线镜像柱 | 否 |
| `curve` | 平滑波形填充 | 否 |
| `pill` | 中线镜像柱，两端圆角胶囊 + 实色（无渐变） | 否 |
| `ring` | 柱状弯成环，整体缓慢自转 | 时间（自转） |
| `ringwave` | 波形弯成环 | 时间（自转） |
| `dots` | LED 点阵 | 否 |
| `ripples` | 低频驱动的同心涟漪 | bass + 时间 |
| `aurora` | 低频驱动的柔光带 | bass + 时间 |

- **renderer 归属**：暂放 `src/components/spectrum/renderers.js`，组件内部模块，不导出。P3 的 `MiniSpectrum` / `AlbumArt` 若要复用 `drawBars`，届时再抽共享模块（**不提前抽象**）。
- **state bag**：`ripples` 需要跨帧保留涟漪数组，由组件持有并在 `variant` 变化时重建（`createRendererState(variant)`）。
- **自转速度**：`ring` / `ringwave` 共用 `RING_SPIN`。`variant` 不再进入绘制循环的依赖，切换时在循环内换 renderer 与 state，`elapsed` 保留，因此相位**确实**连续。
- **渐变**：柱子用 `createLinearGradient`，环用 `createRadialGradient`；每帧每柱单独建渐变是浪费，按原实现复用。
- **响应整形**：绘制前对每根柱调用 `shapeSpectrumLevel(level, { intensity, curve })`，再由 `smoothAudioLevel` 平滑。

---

## 6. 动画循环与功耗

组件**持有 rAF 绘制循环**（渲染职责，与 Clock 持有倾斜 rAF 同理），但**不持有数据定时器**。

- `bars` 通过 ref 传入循环，避免每帧重建 effect。
- `elapsed` 只在真正绘制的帧累加，并写入 ref；暂停后恢复不会让环形自转跳到任意角度。
- `variant`、`colorHex`、`intensity`/`curve` 都经 ref 送入循环，改变它们不重建 effect。
- 每帧 `delta` 钳制到 `0.05s`，切回标签页不会产生巨大跳变。

### paused（已定：暂停即取消 rAF）

- `paused === true`：`cancelAnimationFrame`，循环完全停止，`elapsed` 与 state bag 留在 ref 里。
- `paused` 变回 `false`：以 `lastTime = performance.now()` 重启循环，`elapsed` 与渲染 state **沿用暂停前的值**——恢复时环形自转和已有涟漪不跳变。
- 绘制循环的 effect 依赖只有 `[visible, hasBars, paused]`；`variant` 变化在循环内处理（见 §5），因此既省电又保持相位连续。
- 这是相对原实现的**行为改动**（原来保持 rAF 但跳过绘制），目的是真正省电；视觉上不可见，只影响暂停时的 CPU。

### prefers-reduced-motion

系统要求减弱动效时，冻结**时间驱动**的装饰动画（`ring`/`ringwave` 自转、`ripples` 扩散、`aurora` 摆动），保留电平驱动的柱高响应。理由：频谱的意义就是跟随音乐，完全冻结等于失效；但自转/涟漪属于纯装饰，可以停。

---

## 7. 颜色与主题

- `color` 省略时，从渲染元素上读 `--wallkit-accent`（`getComputedStyle`），失败回退 `DEFAULT_SPECTRUM_COLOR`。
- 传入 `#rrggbb` 时经 `spectrumGradientStops()` 转成上下两个停靠点；非法值同样回退默认色，绝不画空。
- 颜色变化经 ref 送进循环，不重建动画（沿用原实现）。
- CSS 变量全部 `--wallkit-spectrum-*` 前缀；引用共享变量时给回退值。

---

## 8. 必须保留的约束

- **Canvas 尺寸用 `offsetWidth` / `offsetHeight`**，不用 `getBoundingClientRect`。后者返回缩放后的尺寸，若使用方把控件包在带 transform 的容器里会双重缩放。
- 后备存储按 CSS 像素（不处理 `devicePixelRatio`）——与背景层 WebGL 画布一致，属于已知技术债，不在库中修。
- `pointer-events: none`，不拦截点击。

---

## 9. 文件结构与入口改动

```
src/
├── core/
│   ├── audio.js                 # 新增：纯函数（§3）
│   └── index.js                 # 追加 audio.js 的 re-export
├── components/
│   ├── index.js                 # 追加 Spectrum re-export
│   └── spectrum/
│       ├── index.js
│       ├── Spectrum.jsx
│       ├── Spectrum.css
│       └── renderers.js
```

`package.json` 的 `exports` 新增：

```json
"./components/spectrum": "./src/components/spectrum/index.js"
```

（封闭映射，必须显式添加，否则外部无法导入。）

---

## 10. playground

- 新增 Spectrum 画廊：9 种样式各一格，深浅两种背景。
- 合成数据（`syntheticSpectrum` / `syntheticAudioLevel`）复制进 playground，**只在 playground 存在**。
- 控制项：`variant`、`colorHex`、`size`、`offsetX/offsetY`、`intensity`/`curve`、柱数（`resampleBars` 折叠）、`visible`、`paused`、合成 BPM。
- 沿用现有 Clock 演示的 `useNow` 式写法：数据由页面驱动，组件不生成。

---

## 11. 迁移与验收

anime-model-viewer 切换后视觉与行为不变（`extraction-map.md` §6 步骤 3）。旧字段映射：

| 旧（应用层） | 新（库） |
|---|---|
| `offsetX/offsetY`（50 = 中心） | 左下锚点百分比，需重映射 |
| `scale`（0.5–5，基准 90vw） | `size`（基准 30vw，100 = 正常大小）。维持原尺寸约需 `size = scale * 300`，但上限 500，实际按新基准重挑 |
| `color` | `colorHex`（一致） |
| `style` | `variant`（原 8 个名称一致，新增 `pill`） |
| `visible` | `visible`（一致） |

- 应用层继续负责：从 `wallpaperAudio` 取帧 → `extractSpectrumBars` → 作为 `bars` 传入。
- 应用层继续持有 `spine-viewer:spectrum:v1` 偏好与 SettingsDrawer，库不碰。
- 验收：原 8 种样式的外观、位置、缩放与切换行为与旧实现一致；`pill` 为新增，单独目视。

---

## 12. 实现时确定的事项

- `size` 上下限取 **20–500**（`SPECTRUM_SIZE_MIN` / `SPECTRUM_SIZE_MAX`）；**100 = 正常大小**，基准盒子 `30vw × 15vh`（环形 `min(30vw, 28vh)` 正方形）。
- 形态 prop 命名为 **`variant`**（弃用 `style`，避免与 DOM `style` 冲突、与 Clock 的 `placement` 对齐）；颜色 prop 命名为 **`colorHex`**，明确只接受 `#rrggbb`。
- 响应接口 **`intensity`（0–1000，默认 100）/ `curve`（0.2–2，默认 1）**，经 `shapeSpectrumLevel()` 应用；默认值等于原实现的原始柱高。
- 绘制循环的 effect 依赖只有 `[visible, hasBars, paused]`；`elapsed` 与 renderer state 存 ref，`variant` 在循环内切换。暂停恢复与样式切换都不重置相位（修正了早期实现与本文档不符的行为）。
- bass 取 `bars` 最低 8 段的平均（`bassLevel()`，可用 `{ bands }` 覆盖）。
- **柱数调节走 core**：不加 `barCount` prop，使用方用 `resampleBars(bars, count)` 折叠后传入，保持「数据加工归 core、组件只消费最终柱高」的边界。
- **`pill` 为新增样式**（非原实现）：布局同 `mirror`（从中线向上下生长），每根柱画成两端圆角的胶囊（`roundedRectPath` + `arcTo`，不依赖 `ctx.roundRect`），填充直接用已解析的 `#rrggbb` 实色、不走渐变；因此它是唯一不建渐变的柱状样式。
- reduced-motion 冻结 `elapsed`，装饰性时间动画停止；电平响应仍在 rAF 循环里更新，因此不需要额外补帧。
- **已知技术债**：Canvas 后备存储按 CSS 像素（不处理 `devicePixelRatio`，见 §8），HiDPI 下会比 DOM 文字的 Clock 略糊。
