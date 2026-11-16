# Changelog

面向使用方的修改记录。本仓库通过 git 引用分发、不发 npm，所以每条记录以
**日期 + commit 短哈希** 为锚点——固定引用某个 commit 即可锁定行为，例如
`"wallkit": "github:mikoberry/wallkit#9b29b10"`。

格式参考 [Keep a Changelog](https://keepachangelog.com/)，只记录影响使用方的
变化（新增能力 / 行为变化 / 破坏性改动），内部重构与纯文档修正从简。

## 2026-11-16

### Added

- **`PointerFx` 新增 `heart` 点击变体**（`clickVariant="heart"`）：**点击专属**的「点赞」反应——
  点一下从点击点浮起一小簇爱心，向外漂散、微微摆动 + 轻旋、渐隐消失。爱心用两条镜像三次贝塞尔
  曲线画成（不依赖 emoji 字形，可被 canvas 着色、随 `size` / `colorHex` / `intensity` 缩放），
  每颗由 `pointerHeart(seed, index)` 逐帧确定性重算、不存粒子数组；`prefers-reduced-motion` 下
  与其它点击变体一样退化成静态圆环。`heart` 只在点击通道生效，拖尾通道不变（`POINTER_CLICK_VARIANTS`
  现为 `ripple / sparks / bubble / firework / heart`）。
- **新增 `BurstFx` 组件**（`wallkit/components/burst-fx`）：**命令触发的一次性爆发特效**。
  这是 WallKit 里第三种特效层，也是**唯一接受命令式调用**的控件——`AmbientFx` 什么都不收、
  无限循环，`PointerFx` 采样指针事件，`BurstFx` 则每次由接入方**主动下一道命令**，播一段有限效果、
  播完自动消失。就是「点一下开关，撒彩带 / 喷水」的小游戏。
  ```jsx
  import { BurstFx } from 'wallkit/components/burst-fx'

  const fx = useRef(null)
  // 接入方在 project.json 挂个开关，用户点一下，应用层调：
  <BurstFx ref={fx} />
  fx.current.burst('confetti')                 // 彩带：右侧居中向左上 45° 喷出彩虹纸条
  fx.current.burst('spray', { x: 0.5, y: 0.2, angle: -Math.PI / 4 })  // 喷水：指定原点与方向
  ```
  `burst(kind, opts)` 是组件通过 `ref` 暴露的命令：`kind` 为 `confetti` / `spray`，`opts` 可选
  `{ x, y, angle, size, intensity, count, speed }`（0–1 归一化坐标 + 弧度 + 百分比 +
  粒子数），**每一项都可单独覆盖、省略则回落组件 prop / 形态预设**——所以一次调用只改自己想改的
  那一项，不会牵动别的触发。每次调用往预分配环形缓冲压一条记录，粒子由 `(seed, index)` 逐帧重算、
  **不存粒子数组**，空闲时 rAF 自动停。
- **三种形态**：`confetti`（彩虹纸条向上喷出、翻转 + 摆动 + 自转下落，庆祝语义）、`spray`
  （扇形喷出液滴，带拖尾、抛物线坠落）、`yogurt`（黏稠团块甩出、拉丝坠落、比水更重更快落地）。
  粒子数彩带 90 / 喷水 110 / 酸奶 60（默认），生命周期彩带 2.4s / 喷水 1.6s / 酸奶 1.9s
  （`prefers-reduced-motion` 下缩短）。
- **逐发可调**：`opts.size`（20–300%）、`opts.intensity`（0–300%）、`opts.count`（4–400）、
  `opts.speed`（20–300%）在每次触发时单独覆盖，爆发记录按条存
  `size` / `intensity` / `count` / `speed`，两发不同参数的爆发互不串扰；组件级
  `size` / `intensity` / `speed` prop 只是命令未指定时的默认值。
- **`intensity` 是「爆发力」，不是透明度**：它决定**初速度**，进而通过斜抛物理决定
  **喷多远、喷多高**（强度越高初速度越大，射程越远、顶点越高；斜着发射比竖直发射更高——
  这是抛物线的自然结果，`dy ∝ v₀·sinθ·t + ½·g·t²`）。对喷水还决定**聚散形态**：强度高时水柱
  **一开始聚成一股、后段才破碎成水珠**（`burstBreakup` 把散开时间点往后推、且更陡），强度低时
  一上来就是散水珠。彩带则让强度驱动「喷多高 + 撒多散」，保留纸片的飘落质感。
- **配色**：彩带默认**内置彩虹多色**（`BURST_CONFETTI_PALETTE`，7 色，每片按种子取色）——单色彩带像 bug；
  喷水默认水蓝 `#7fc8f0`，跟随 `--wallkit-accent`；喷酸奶默认乳白 `#f6efe0`（黏稠乳品色，非纯白）。
  传 `colorHex` 则三者都换成单色。
- **尺寸接口沿用其它特效层**：`size`（20–300%）、`intensity`（0–300%）、`speed`（20–300%）、
  `visible`、`paused`。覆盖层铺满定位上下文（`position: absolute; inset: 0; pointer-events: none`），
  没有 `anchor` / `offsetX` / `offsetY`；`z-index: 4` 与 `PointerFx` 平级。
- **`paused` 时丢弃新命令并清空在飞记录**：暂停期间写入的时间戳会远在过去，恢复时不能画出一片
  已经过期的爆发，所以冻结时 `burst()` 直接 return、恢复时先清一次。
- **playground 画廊新增 BurstFx 页**：hero 大画面放「触发彩带 / 触发喷水 / 触发喷酸奶」三个命令按钮
  + 尺寸 / 强度 / 颜色 / 显示 / 暂停滑块；下面三格各放一个实例，每格带一个「放一发」按钮，用于单独观察。
  侧栏 `COMPONENTS` 与 `App` 分支已加 `burst` 入口。

## 2026-11-15

### Added

- **新增 `stars` 星尘形态**（`a8bb61b`，`wallkit/components/ambient-fx`）：满天星点，**位置固定、只闪不落**。
  ```jsx
  <AmbientFx variant="stars" />                                   // 默认 200 颗，深色背景上最好看
  <AmbientFx variant="stars" density={160} intensity={130} speed={40} />   // 更密、更亮、慢闪
  ```
  这是氛围层里唯一没有位移的形态——会下落的天空就是雪。所以 `ambientOffset` 的 stars 分支把整个运动预算给亮度：两路不可通约的正弦叠加后再取平方，星点大部分时间偏暗、偶尔短暂一闪；`speed` 只缩放闪烁频率，不再改变任何位置。亮度与星点尺寸绑定，避免满屏「大而发灰的糊点」。
- **星点用加色叠加（`'lighter'`）画**：只给画面加光，不会压暗底下的壁纸，相邻光晕叠起来更亮；`drawAmbient` 末尾统一复位混合模式，不污染后续帧。星点精灵仍是 64px 离屏预渲染的「白热小核 + 紧光晕 + 十字衍射芒」，绘制循环只做 `drawImage`，芒只在放大到 hero 星时才显形。
- **星尘自带固有色 `#e8efff`**，默认 200 颗、`density` 最高 300% 也封在全局上限 240；`colorHex` 照旧可覆盖。`paused` / `visible` / `prefers-reduced-motion` 的行为与其余七种形态完全一致。
- **playground 的 AmbientFx 页多出 `stars` 一格**（配最深的背景），标签、数量封顶与固有色说明同步更新；`AMBIENT_VARIANTS` 现为 8 项。

- **新增 `sway` prop：光在移动时扇面会跟着转一点**（`306154e`，`wallkit/components/light-fx`）。
  以前光源只做平移——光束方向固定，画面看起来像一张贴纸在滑动。现在光源一旦离开锚点，
  `lightBeamSway()` 就按「光当前位置 → 画面中心」重算扇面角度，偏转量由 `sway`（度，默认 **16**，
  0–60）软饱和（`tanh`），写进第三个自定义属性 `--wallkit-light-angle`。
  ```jsx
  <LightFx variant="sun" sway={16} />   // 默认：移动时最多偏 16°
  <LightFx variant="dusk" sway={0} />   // 关掉，回到纯平移
  ```
  `sway` 是**上限**，不是一个可以直接指定方向的角度：方向永远由光源位置推出来，所以不会出现
  「光在左上、光束却朝左下」。变体的 `angleOffset`（黄昏 -20° 横扫）照旧保留，不会被 sway 抵掉；
  `overcast` 没有光束，转了也看不见。
- **`--wallkit-light-angle` 现在会被实时改写**：静止时由锚点算出（与之前一致），指针移动时按光源
  实际位置重算；容器上仍然只改自定义属性，没有字符串重建、没有 canvas。
- **playground 的 LightFx 页新增「光束旋转 sway」滑块**（`overcast` 下置灰），属性适用表补了这一行，
  hero 的说明改成「光池平移 + 扇面转动」。

- **新增 `clear-sky` 变体：大晴天正午的大太阳**（`d873095`，`wallkit/components/light-fx`）。和前面四种「一片光池 + 一束光束」
  不同，它的光源本身是一块**硬白盘**，并且因为这么亮，光在镜头里散成一串**光斑 + 光圈环**横穿画面。
  ```jsx
  <LightFx variant="clear-sky" anchor="top-left" />
  <LightFx variant="clear-sky" anchor="center-left" flare={0.8} />   // 光圈链横穿整幅
  ```
  两个新预设字段：`disc`（0–1，热点的**硬度**——内圈外推、alpha 抬高、热点半径收小）与 `flare`
  （0–1，光圈链强度，0 就整层不画）。两者绑在同一个变体里，不做成交叉开关：光圈是「这盏灯够硬」
  的后果，配出「软光 + 一圈光环」没有意义。`flareSpread` 控制光圈链铺多远。
- **光圈链现在紧贴太阳也有几圈**：光斑与光圈环除了沿轴线往对面铺，还在**光源附近**（`t<1`）加了一组
  ——紧贴太阳两枚小光斑、三个由密到疏的空心光圈环，像镜头在大太阳下收光圈时太阳周围挤出的同心环。
  靠近太阳的光圈保持暖色，越往对面越偏淡蓝（那是镜头镀膜的颜色，不是太阳的颜色），与暖色的光池形成冷暖对比。
- **光圈不排成一条直线，而是往轴线两侧散开**：每个光斑 / 光圈环带一个固定的 `ox` / `oy` 偏移（画面百分比，
  符号沿链交替、幅度在 4–13% 间起伏，偏离轴线的角度可到约 ±40°），叠在轴线坐标上——真实的眩光会往
  「光源→中心」这条线的两侧散射，不会列队成单行。半径和间距也刻意错落：靠近太阳簇拥着一群极小的光斑
  （0.016R 起），中间适中，**最大的环挪到链的远端**（环 0.04R–0.2R），读起来像随机散开的一簇而不是中间
  卡一个靶心。偏移折进同一个 `calc()` 里，所以依旧不新增任何状态。
- **光圈层不新增状态**：每个光斑的坐标写成 `calc(var(--wallkit-light-x) * (1 - t) + 50% * t)`，
  落在「光源 → 画面中心」这条轴线上，所以移动光源仍然只改那两个自定义属性，光圈**白拿指针跟随**。
  光斑与光圈环的颜色朝淡蓝偏（那是镜头镀膜的颜色，不是太阳的颜色），与暖色的光池形成冷暖对比。
- **新增 `flare` prop**（0–1，默认 1）：光圈层的倍率，和 `rays` 同一类（效果占比，不是亮度），
  同样被 `intensity` 一起缩放；`clear-sky` 以外的变体没有这层，乘了也没有。
- **playground 的 LightFx 页现在会说明「哪些属性不通用」**（`c352db1`）：`rays` 在 `overcast` 上没有对应图层、
  `flare` 只有 `clear-sky` 有，这类滑块在当前变体下**直接置灰**；下面还有一张**属性适用表**
  （属性 × 变体，单元格读的就是 `LIGHT_PRESETS` 里的预设值，`—` 表示该变体没有这一层、
  传了也不会有效果）。加变体不用改这张表，它会自己多一列。
- **`disc` 也让 `dusk` 稍微硬一点**（`disc: 0.25`）：傍晚的太阳本来就比正午的漫射光更像一个点。
- **新增 `Frame` 组件**（`wallkit/components/frame`，`db4ace5`）：REC 相机式的**画面级**取景框。
  四种边线：`corners`（四角括号，默认）/ `frame`（整框 + 内嵌虚线安全框）/ `bracket`（上下翼型轨）/
  `film`（左右竖线 + 胶片齿孔）。取景器的其余部件全是**正交开关**，不与变体耦合：`grid`
  （`none` / `thirds` / `cross`）、`ticks`（底边刻度尺）、`rec`（录制红点）、`timecode`（时间码）、
  `labels`（四角读数）。之所以不按「变体各带一套 HUD」来做，是因为那会变成 4×5 个组合——变体只负责
  「边怎么画」。
- **它是画面级装饰层，不是布局容器**：铺满定位上下文（`position: absolute; inset: 0;
  pointer-events: none`），**没有子元素、不使用 `anchor`**，因此不包裹任何控件、不改现有布局。
  给某张卡片加角饰是应用层两行 `border` 的事，这一项明确不做。
- **`timecode` 收已格式化字符串，组件不计时**：壁纸暂停时读数必须跟着停，`formatTimecode(seconds,
  fps = 24)` 只把秒数写成 `HH:MM:SS:FF`（小时不取模）。`rec` 同理不内置文案——`rec={true}` 只画红点，
  要 `REC` 三个字就传 `rec="REC"`。
- **尺寸接口**：`inset`（0–240 px）、`thickness`（默认 **1.5**，1px 在桌面 DPR 下会糊成
  灰边）、`length`（括号臂长）、`size`（统一倍率，同乘尺寸与字号）、`color`（`#rrggbb` 覆盖线色）。
  `theme` 沿用 Clock 语义：`light` = 浅色线（深壁纸）、`dark` = 深色线，默认 `dark`。
- **纯 CSS，没有 canvas / rAF / 事件监听**：矩阵、刻度尺用 `linear-gradient`，齿孔用
  `repeating-linear-gradient`，唯一动画是 7px 录制点的硬切闪烁（`paused` 停、`prefers-reduced-motion`
  下常亮）。零空闲功耗。
- **`z-index: 7`，比 `Spotlight` 的 6 再高一层**：取景线与读数是叠加在画面上的仪表，不该跟着曝光压暗
  一起消失。这条写进了层级约定（ambient 1 → spectrum 3 → pointer 4 → clock/album 5 → spotlight 6 →
  frame 7）。
- **新增观感验证页** `playground/frame.html`：`← →` 切变体、`↑ ↓` 切深/浅背景与 `theme`、`G` 网格、
  `T` 刻度、`R` 红点、`C` 时间码、空格暂停、`H` 提示；时间码由页面自己累计，正好演示「应用层拥有
  时钟」。`build:wallpaper` 现在一起打三个页面，把 `project.json` 的 `"file"` 指向 `frame.html` 即可在
  WE 里查看。
- **playground 画廊新增 Frame 页**：侧栏 `Frame` 一栏里，hero 舞台跑**全部 14 个 prop**（变体 / 内缩 /
  线宽 / 臂长 / 倍率 / 线色 / 网格 / 刻度 / 红点三态 / 时间码 / 四角读数 / 主题 / 显示 / 暂停），下面四格
  关掉仪表只看四种边线的画法。

### Added — LightFx

- **新增 `LightFx` 组件**（`wallkit/components/light-fx`，`d25e23b`）：一层**天气光照**叠在画面上。
  四种预设：`sun`（晴天正午，暖光从某个上角斜射，带清晰光束）、`moon`（月光，冷、暗、几乎没有光束）、
  `dusk`（黄昏低角度，光束被拉长）、`overcast`（阴天，没有光束，只有一片巨大的平光）。
  `from` 选 `top-left` / `top-right`，光朝指针偏移一点（`follow` 控制偏移多远，`smoothing` 控制跟得多重）。
- **纯 CSS，没有 canvas、没有绘制循环**：一层宽阔光池 + 一个热点（径向渐变），加一束
  `repeating-conic-gradient` 的光束；指针事件只改写 `--wallkit-light-x` / `-y` 两个自定义属性，
  渐变字符串在 `useMemo` 里构建、不进事件处理函数。`smoothing=0` 时连 rAF 都不开。
- **和 `Spotlight` 刻意相反的一点：它第一帧就在。** 聚光灯没有指针输入时必须藏起来，否则整屏是黑的；
  光不能藏——没有鼠标的壁纸照样有天气。所以光默认停在 `from` 指定的那个角，**跟随是加分项不是前提**。
  光也**不会掉到地平线以下**：指针的 y 先被夹到上半区（`LIGHT_ORIGIN_MAX_Y`）再按 `follow` 混合，
  否则把鼠标拖到底就变成从脚底打光。
- **`intensity` 是整盏灯唯一的亮度旋钮**（`b0eb4fd`，0–200%）：光池、热点、光束乘同一个系数，拉低时三者一起暗，
  不会留下一圈亮光池配一束淡光束。三层 alpha 由 `core/light.js` 的 `lightLayers(preset, { gain, rays })`
  一次算出，新增变体只往 `LIGHT_PRESETS` 加数，自动被同一个 gain 覆盖。超过 100% 时 alpha 向不透明
  饱和（热点先到顶，画面读作过曝）；`rays`（0–1）**不是亮度，是分配**——这盏灯里多少比例走成光束，
  `0` 就是一片平光，`overcast` 本身没有光束可乘。
- **光束必须遮罩**：锥形渐变在原点收成一个点，不遮就是星芒镜。被遮罩藏掉顶点、池子中段最亮、
  到边缘消失；引擎不支持 `mask-image` 时整层不画（而不是画个半对的东西）。光束方向每次渲染只算一次，
  **不跟着指针转**——太阳移动是平移光束，不是旋转它。
- **接口**：`size` 是光池半径（px，200–4000），**省略时跟随预设**（`sun` 1400 / `moon` 1100 /
  `dusk` 1750 / `overcast` 2400）；`colorHex` 覆盖光色（光池与光束一起换，只换一半会像两盏灯）。所有预设数值都在 `core/light.js` 的 `LIGHT_PRESETS` 里，CSS 不认识任何一个。
- **`z-index: 2`：在氛围粒子之上、控件之下**（ambient 1 → 光照 2 → spectrum 3 → pointer 4 →
  clock/album 5 → spotlight 6 → frame 7）。画面被打亮而文字不被糊掉；想让阳光扫过时钟的应用层
  自己抬高这个值。和 `PointerFx` / `Spotlight` 一样铺满定位上下文、`pointer-events: none`、
  **不用 `anchorStyle()` 给自己找位置**；`z-index` 挂在两个子层而非根节点，否则根节点一成为层叠上下文，`screen`
  就够不到壁纸，光会退化成一层平蒙版。
- **定位只有一套词汇：`anchor` + `offsetX` / `offsetY`**（`59a5c6c`）。九个锚点之一（`top-left` …
  `bottom-right`）加偏移，和浮动控件完全同一套——但**基准点是光源中心**：这一层铺满定位上下文、
  没有自己的盒子，所以「锚点」在这里放的是一个点，不是盒子的角。偏移沿用同一套符号规则：数字永远
  **朝盒内为正**（`top-right` 下正数往左、`bottom-*` 下正数往上），换角不用翻符号。
- **光束方向由锚点推出来，没有第二个 prop。** 光永远朝背向光源的一侧打（`top-left` → 135°、
  `top-right` → 225°、`bottom-left` → 45°），所以「光源在右下、光束却往下」这种自相矛盾写不出来。
  变体的低角度加成照旧叠在上面（黄昏 -20°，让光横扫画面）。
- **负偏移可以把光源推出画面**（`top-left` 配 `-40` 就是一盏画外的路灯），最远到 `LIGHT_ORIGIN_EXTENT`
  （±100%）——越界的光源正是这种定位方式最常见的用法。偏移只接受数字（= 盒子百分比）和 `'18%'`
  这类百分比字符串；`px` / `vh` 需要量盒子，明确不支持。
- **定位仍然靠父容器**：`anchor` 放的是光源中心，不是给这一层找位置——根节点照旧 `inset: 0`，
  `anchorStyle()` 不参与。要把光限制在一块区域，给它一个 `position: relative` 的父盒子即可：
  渐变画在自身盒内不会溢出，指针映射也以盒子为准。
- **playground 画廊新增 LightFx 页**：hero 全宽舞台跑全部 prop，下面五格对比四种预设 +
  同一个太阳换到右上角（格子里的 `size` 按 0.35 缩小，否则 1400px 会把整格糊白）。
  WE 桌面壁纸默认不投递鼠标事件，实机要看到跟随需开启鼠标交互，**但光本身不依赖指针**。

### Changed

- **`LightFx` 的数值参数不再设上限，限制交给接入方**（`07751a9`）。原来的 `clamp` 把「定义域」
  和「口味」混成了一套 `MIN/MAX`，结果既挡住了合理用法，又让人以为区间外无效：
  - `intensity` 不设上限（100 = 预设本身的强度，超过只是更早过曝，alpha 自己会饱和；负值等于灯灭）
  - `smoothing` 不设上限（两秒的拖尾是合法观感；负值等同于「不延迟」）
  - `sway` 放开为**带符号**无上限：负数让扇面朝远离画面中心的方向偏，极大值趋近「正对中心」
  - `size` 上不封顶（4K / 8K 光池可能需要比 4000 更大）
  - `offsetX` / `offsetY` 可把光源推到画面外 ±300%（原 ±100%）
  ```jsx
  <LightFx intensity={320} smoothing={1.4} sway={-20} size={5200} offsetX={-260} />
  ```
  `LIGHT_*_MIN/MAX` 从此是**画廊滑块的推荐区间**，不是接受范围。
- **仍然夹着 0–1 的三个参数是定义域，不是保护**：`rays` / `flare` / `follow`。1 就是「全部」，
  传 2 没有意义；夹住它是为了让 `rgba()` 的静默截断不要伪装成「参数生效了」。
- **唯一保留的硬规矩是「无效值回落」**：`size` 必须有限且 `> 0`，否则回落到预设。因为
  `radial-gradient(circle -5px …)` 是**无效声明**，浏览器会丢掉整条 `background-image`——
  光不是变小，而是整层消失，控制台还没有提示。`undefined` / `null` / `''` 同样按「用预设」处理。
  新增 `lightRadius()` 承担这条判断。

## 2026-11-14

### Added

- **AlbumArt 的 `vinyl` 布局新增外圈柱状环**（`86fe749`）：唱片不再是一张干净的空碟，
  频谱以 `ring` 形态**从碟缘往外长**——基准圆正好落在唱片边缘，柱子从碟缘往外伸缩，
  安静时几乎贴着碟缘、最大探出 `0.22 ×` 直径，柱数固定 128（`VINYL_RING_BARS`；卡片默认的
  32 根摊到整个圆周会显得稀疏，而这张画布还是唱片的 1.44 倍）。为此覆盖层四周各向外出血 22%，
  所以这个布局的**视觉范围比 `size` 大一圈**：唱片本身与锚点位置都没变（出血是对称的），
  只是光画到了盒子外面；`offsetX/Y = 0` 贴边时柱尖会被视口裁掉。
  环是唱片元素的子节点，跟着 24s 一起转、跟着 `paused` 一起停，圈内文字照旧反向自转保持直立。
  **这个布局默认不画频谱**：省略 `spectrum` 就是一张干净唱片，要环得显式传 `spectrum`（同时要有 `bars`）。
- **AlbumArt 新增 `spectrum` 开关**（`86fe749`）：可选三态——省略时跟随布局，
  `vinyl` 默认关、其余十种默认开；传 `true` 强制显示、`false` 强制隐藏。
  所有布局的频谱槽位都由它和 `bars` 共同决定，所以 `spectrum={false}` 不会在已经排好的位置留一块空画布。
- **MiniSpectrum 新增 `ringBase` / `ringSpin`**（`86fe749`）：环形样式此前只有固定的
  中心空白（0.46）和强制自转，做不了「贴边 / 出血」「不转」。`ringBase`（0.05–0.98，
  越界会被夹住）调中心空白占半径的比例——唱片环用它把基准圆推到自己的碟缘上；
  `ringSpin={false}` 关掉自转，父容器自己已经在转时必须关，否则两个转速会互相追成抖动。
  `ringwave` 也接受 `baseRatio` 了，之前它把中心固定死在 0.46。

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

- **AlbumArt `vinyl` 的外圈频谱与唱片之间留出一圈空隙**（`b2a00f5`）：柱基从
  `0.50 ×` 直径外推到 `0.53 ×`（`VINYL_RING_GAP = 0.03`，300px 唱片约 9px），
  柱子不再像刻在碟面上的沟槽。**间隔是从原有 22% 出血里扣的**——画布尺寸、
  柱尖最外缘、唱片直径、锚点全都不变，只有柱子最长行程从 `0.22 ×` 缩到 `0.19 ×`
  直径。`VINYL_RING_BASE` 现在由 `gap` 与 `bleed` 一起推导，要调宽窄只改
  `VINYL_RING_GAP` 一个常量。
- **Clock 的 `size` 上限从 200 提到 400**（`86fe749`）：`CLOCK_SIZE_MAX` 改为 `400`，
  所以 `size={400}` 是现在允许的最大值而不是被夹回 200。低音增强的缩放同一个变量，
  不必额外配置。超过 400 仍会被夹住；40 的下限没变。
- **Spectrum `aurora` 不再隐式聚合柱子，改为「一根柱子一个光晕」**（`82c1bf5`），与其余八种样式一致。
  `bars.length` 现在对九种样式都是同一个意思：柱数。原来 `aurora` 内部把柱子按频带平均成
  固定的 7 条宽光带，而那段折叠与 `resampleBars()` 逐位等价（实测最大差异 0），等于把 core
  的算法在渲染器里重写了一遍。想要那 7 条宽光带的观感，传入前自己
  `resampleBars(bars, 7)`；不折就按 128 根画成一片细密光幕——密度是使用方的选择，不是渲染器
  的隐藏行为。**观感会变**：默认 `bars` 长度下 `aurora` 从 7 条宽光带变成 128 道细光，
  需要旧观感请补一次折叠。

- **`aurora` 的扫描幅度改为随柱宽缩放**（`82c1bf5`）：原来是固定 `width * 0.02`，128 根柱子时相邻光晕
  会互相穿插成一片糊；现在按列宽取 `0.35`，密集输入读作整体微光，稀疏输入（如 7 根）仍保留
  原来的飘动幅度。

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
