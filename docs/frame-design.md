# Frame 设计（REC 取景框）

> 状态：已实现，待 WE 实机逐项验收
> 最后更新：2026-11-15
>
> 相关文档：[architecture.md](./architecture.md) · [backlog.md](./backlog.md)

本文锁定 `wallkit/components/frame` 的接口与实现方案。分层沿用 architecture.md §5，`theme` / `size` 语义沿用 Clock，`visible` / `paused` 沿用其余控件。

---

## 1. 目标与边界

`Frame` 是**画面级的取景框装饰**：四角括号（或整框 / 翼型括号 / 胶片齿孔）+ 取景器常见读数。它不承载任何数据、不感知背景、不排版。

| 做 | 不做 |
|---|---|
| 用纯 CSS 画出边线、括号、网格、刻度尺 | 读写 `window.wallpaper*`、采集音频 / 媒体 |
| 接收应用层给的 `timecode` 字符串并显示 | **自己计时**、自己数录制时长 |
| 尊重 `visible` / `paused` / `prefers-reduced-motion` | 读写 localStorage、内置语言文案 |
| 全屏铺满、`pointer-events: none` | 包裹子元素、参与布局、被 `anchor` 摆放 |

**核心判断：REC 感不是「一种边框」，而是「一条边 + 几件可开关的仪表」。** 所以变体只管**边怎么画**，`grid` / `ticks` / `rec` / `timecode` / `labels` 全部是正交开关。若让每个变体各带一套 HUD，就是 4×5 个组合，维护成本立刻超过收益。

---

## 2. 定位契约（backlog 里悬而未决的 A / B 两案已废）

backlog §2 曾把「它是不是布局容器」留成 A（独立装饰层）/ B（受限包裹层）两个方案。取景框的诉求把这个问题**绕开**了：

> 取景框装饰的是**整个画面**，不是某个控件。真实相机不会给时钟加角括号。

因此采用**方案 C：视口级装饰层**。

- `position: absolute; inset: 0; pointer-events: none`，与 `PointerFx` / `Spotlight` 同一写法；父容器必须是定位上下文且有确定尺寸。
- **不使用 `anchor` 三元组**：没有自己的盒子要放，边缘就是画幅边缘。
- **没有子元素**：不包裹控件、不改任何现有布局、不需要改写 AGENTS.md 里「不是布局容器」的表述——它连布局都不接触。

由此得到一条明确的否定结论：**控件级装饰（给某个卡片加角饰）不做**。那种需求在应用层写两行 `border` / 伪元素即可，为它引入 wrapper 语义会把整个 `anchor` 体系拖进来。

---

## 3. 接口

```jsx
<Frame
  variant="corners"              // corners | frame | bracket | film
  inset={28} thickness={1.5} length={56} size={1}
  grid="none"                    // none | thirds | cross
  ticks={false}
  rec={false}                    // true = 只有红点；'REC' = 红点 + 文字
  timecode=""                    // 已格式化字符串，空则不显示
  labels={{ tl, tr, bl, br }}    // 四角读数，纯字符串
  theme="dark" color={undefined} visible paused
/>
```

| Prop | 默认 | 范围 | 说明 |
|---|---|---|---|
| `visible` | `true` | — | `false` 时不渲染 DOM |
| `variant` | `'corners'` | 见 §4 | 非法值回退 `corners` |
| `inset` | `28` | 0–240 | 框线距画面边缘，px |
| `thickness` | `1.5` | 0.5–8 | 线宽，px。**默认不为 1**，理由见 §6 |
| `length` | `56` | 0–240 | 括号臂长，px。`frame` / `film` 不用 |
| `size` | `1` | 0.5–3 | 统一倍率，同时乘 `inset` / `thickness` / `length` 与字号 |
| `color` | — | `#rrggbb` | 省略时跟随 `theme`；非 `#rrggbb` 被忽略 |
| `grid` | `'none'` | `none` / `thirds` / `cross` | `true` 作为 `thirds` 的简写 |
| `ticks` | `false` | — | 底边刻度尺 |
| `rec` | `false` | `boolean \| string` | 红点；字符串额外画该文本 |
| `timecode` | `''` | 字符串 | 空串不渲染 |
| `labels` | — | `{tl,tr,bl,br}` | 逐项字符串，空项不渲染 |
| `theme` | `'dark'` | `light` / `dark` | **名字指线的颜色**：`light` = 浅色线（深壁纸），`dark` = 深色线 |
| `paused` | `false` | — | 冻结红点闪烁 |

**`rec` 为什么收字符串**：§5.4 明确「不内置任何语言文案」。`rec={true}` 只画红点，要 `REC` 三个字由调用方写 `rec="REC"`——顺便也解决了非英文壁纸要写「录制」的情况。

**`labels` 为什么是四个固定键**：取景器读数就四个角，位置是语义的一部分。收成数组就会逼着调用方用 `[null, 'x', null, 'y']` 表达「只有右上」，比对象更糟。

---

## 4. 变体

首批 4 个，正好卡在 backlog 的变体预算上限：

| 变体 | 画法 | 视觉来源 |
|---|---|---|
| `corners` | 4 个 L 形括号 | 监视器 / 手机相机的取景范围标记，最像 REC |
| `frame` | 整条 hairline 框 + 内缩虚线安全框 | 电影摄影机的 action-safe 框 |
| `bracket` | 上下两条长横轨，两端短竖翼 | 宽银幕 / 取景器翼型括号 |
| `film` | 左右竖线 + 两侧齿孔 | 35mm 片基 |

`splits`（分割线）不在这里：它没有「框」的语义，属于另一种控件。

**DOM 形状恒定**：所有绘制原语（edge / rail / perf / corner）都渲染，由 `data-variant` 决定显示哪几件。变体切换不重建节点，也不会留下半套元素。

---

## 5. 层级

`z-index: 7`，**比 `Spotlight` 的 6 还高**：

```
ambient 1 → spectrum 3 → pointer 4 → clock / album 5 → spotlight 6 → frame 7
```

理由是语义而非美观：取景线与曝光读数是**叠加在画面上的仪表**，真实摄影机里它们不会跟着曝光压暗一起消失。应用层若想让聚光灯连框一起压暗，降低这个值即可。

这条打破了「6 是最上层」的既有约定，所以写进 [architecture.md §6](./architecture.md#层级约定)。

---

## 6. 实现要点

**全部 CSS，零 JS 运行时。** 没有 canvas、没有 rAF、没有事件监听，唯一的动画是红点的 `@keyframes`（硬切，不是呼吸——真实的 tally light 是开关）。`paused` 用 `animation-play-state: paused`；`prefers-reduced-motion` 下不闪、常亮。

**尺寸只经 CSS 变量流下去。** 组件把 `inset` / `thickness` / `length` / 字号算成 `px` 写进根元素，另外写一个裸倍率 `--wallkit-frame-unit`，让 CSS 能自己算点、齿孔间距、刻度步长（`calc(9px * var(--wallkit-frame-unit))`）。使用方因此可以不碰组件、只覆盖变量来微调。

**`thickness` 默认 1.5px 而不是 1px**：WE 跑在桌面 DPR 下，1px 线会跨两个设备像素，读起来是一条灰糊边而不是一条硬线。这是取值理由，不是审美偏好。

**齿孔是矩形**：`repeating-linear-gradient` 只能画矩形，圆角齿孔需要每个孔一个元素。这个尺寸下看不出差别，不值得为它把 DOM 翻十倍——与 AmbientFx「软边不进绘制循环」是同一类取舍。

**线色不做 `mix-blend-mode: difference`。** 那种写法能让线在任何背景上自动反色，但会夺走 `color` / `theme` 的全部控制权，把可调的仪表变成不可预测的滤镜。宁可要求调用方按壁纸明暗选 `theme`。

**`data-*` 铺开状态**：`data-variant` / `data-grid` / `data-theme` / `data-rec` / `data-tc` / `data-paused` 让 CSS 成为唯一真相，JSX 里没有按变体分叉的分支（唯一的条件渲染是 `rec` / `timecode` / `labels` 这些真的可能缺席的读数）。

**角落让位**：`rec` 占左上、`timecode` 占右下，同位置的四角读数由 `[data-rec]` / `[data-tc]` 规则自动下移 / 上移一行，不需要调用方自己错开。

---

## 7. 确认不做

- **不内置计时**（§3 已述），`formatTimecode(seconds, fps)` 只做格式化，`fps` 钳制 1–120，小时不取模。
- **不做 glow / 发光描边**：柔光是另一种气质（霓虹），而取景线要的是硬边清晰。要做也得先解决颜色透明度推导，成本不对等。
- **不做 letterbox（上下黑边）**：那是画幅遮罩，不是边框，会与背景层的构图打架。
- **不做电平表 / 电池 / 存储读数**：这些是假数据。库不声称反映任何外部状态（§5.1 第 3 条），要显示就由 `labels` 传真值。
- **不做入场动画**：淡入由应用层一行 CSS 完成。

---

## 8. 验证

`playground/frame.html` 是观感验证页（`build:wallpaper` 会一起打进 `dist-wallpaper/`，把 `project.json` 的 `"file"` 改成 `frame.html` 就能在 WE 里看）。

- 一页一个全屏舞台——取景框只能在壁纸尺寸下判断边距与线宽。
- `← →` 切变体，`↑ ↓` 切深/浅背景（同时切 `theme`），`G` 网格、`T` 刻度、`R` 录制点、`C` 时间码、空格暂停、`H` 提示。
- 时间码由页面自己累计——正好演示「应用层拥有时钟」这条约束。

---

## 9. 成本

`Frame.jsx` 约 130 行（多为 JSDoc），`Frame.css` 约 330 行，`core/frame.js` 约 100 行（4 个归一化函数 + `formatTimecode`），`frame.html/jsx/css` 约 210 行。

无新增依赖、无构建步骤变化，运行时开销可忽略（静态 CSS 层 + 一个 7px 圆点的闪烁）。
