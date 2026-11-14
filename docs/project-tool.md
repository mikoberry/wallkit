# project.json 生成工具

> 状态：已实现（`wallkit/project`）。构建期工具，**不进壁纸运行时**。
> 最后更新：2026-11-14

`project.json` 是 Wallpaper Engine 的工程清单：入口页面、用户属性、Workshop 元数据都在里面。每个壁纸仓库都需要一份，而它恰好是**最容易静默失败**的一份配置。

这个工具让人只声明会变的部分，剩下的形状与默认值由代码兜住。

## 为什么需要它

手写这份文件有三个坑，且全都不报错：

| 坑 | 症状 |
|---|---|
| `supportsaudioprocessing` 写在顶层而非 `general` 内 | 音频监听器注册成功，回调 0 次，只表现为「音频没反应」 |
| 颜色写成 0–1 浮点 | 引擎显示黑色；manifest 要的是 0–255 整数 |
| 属性改名后忘改应用层 | `useWallpaperProperties()` 拿到 `undefined`，控件走回落值，看起来「设置没生效」 |

外加一个更贵的：**已发布壁纸的 `workshopid` 丢失**。引擎会把它当成新工程，下次发布变成新建 Workshop 条目，旧条目的订阅者永远收不到更新。

工具用两条规则消掉这些：形状由构造器保证，`workshopid` 等引擎自有字段永远保留。

## 归属：机制在库，个人信息在你的仓库

按 [§12.3 代码归属判定规则](./architecture.md#123-代码归属判定规则)，`project.json` 属于外壳层。这里再拆一层：

| 内容 | 放哪 | 原因 |
|---|---|---|
| 生成/合并逻辑、属性构造器 | `wallkit/project`（本库） | 与具体壁纸无关，第二个仓库能直接复用 |
| 你的主页、固定文案、默认 tags、预览图文件名 | 游戏仓库的 `project.config.js` | 属于个人信息；写进 MIT 库会分发给每个使用者 |

**不要**把自己的主页写进库里的任何文件。

## 在壁纸仓库里怎么接

两个文件：

```
your-wallpaper/
├── project.config.js          # 你的 profile + 属性声明
├── public/project.json        # 生成产物
└── scripts/gen-project.mjs    # 约 140 行，照抄 playground 那份
```

`project.config.js`：

```js
import { color, slider, bool, combo, text } from 'wallkit/project'

export default {
  file: 'index.html',
  title: '你的壁纸名',
  description: [
    '第一段：这是什么、有什么可调。',
    '第二段：主页 https://… · 源码 https://…',
  ],
  tags: ['Anime'],
  audioprocessing: true,
  properties: {
    accentColor: color({ text: '强调色', value: '#a8c4ff' }),
    sizeScale: slider({ text: '尺寸倍率', value: 1, min: 0, max: 2, step: 0.1, fraction: true }),
    showSeconds: bool({ text: '显示秒', value: true }),
    clockAnchor: combo({
      text: '时钟锚点',
      value: 'bottom-right',
      options: [
        { label: '左下', value: 'bottom-left' },
        { label: '右下', value: 'bottom-right' },
      ],
    }),
    captionText: text({ text: '副标题', value: '' }),
  },
}
```

脚本可以直接抄 [`playground/scripts/gen-project.mjs`](../playground/scripts/gen-project.mjs)——它只有读、合并、写三件事，不依赖 Vite。参考配置见 [`playground/project.config.js`](../playground/project.config.js)：它声明的就是仓库里现有的 `playground/public/project.json`，`npm run check:project` 报「已同步」（语义一致；`combo` 的 `options` 排版会在首次生成时展开成多行）。

## API

```js
import { defineProject, mergeProject, diffProject, stringifyProject } from 'wallkit/project'
```

| 函数 | 作用 |
|---|---|
| `defineProject(input)` | 生成引擎形状的 manifest 对象，不写盘 |
| `mergeProject(existing, generated, { prune })` | 合并到磁盘上那份；未声明的键保留 |
| `diffProject(expected, actual)` | 返回 `{ mismatches, extra }`，用于 `--check` |
| `stringifyProject(project)` | 2 空格缩进 + 结尾换行 |

`defineProject` 的输入：

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `file` | ✅ | — | 入口页面，如 `'index.html'` |
| `title` | ✅ | — | Workshop 标题 |
| `description` | — | 不写 | 字符串或段落数组，数组用空行连接 |
| `tags` | — | 不写 | 引擎认的 tag 名，工具不校验合法值 |
| `preview` | — | 保留原值 | 预览图**文件名**，图本身由编辑器截 |
| `contentrating` | — | **保留原值** | `'Everyone'` / `'Questionable'` … |
| `visibility` | — | **保留原值** | `'public'` / `'friends'` / `'private'` |
| `audioprocessing` | — | `true` | → `general.supportsaudioprocessing` |
| `type` | — | `'Web'` | 编辑器会改写成小写 `'web'`，两种都能跑 |
| `properties` | — | 只有 `schemecolor` | 用构造器声明，见下 |

`contentrating` 与 `visibility` 故意**没有默认值**：已发布壁纸被重新生成时，悄悄改掉分级或可见性比留空更糟。不写就保留文件里原有的值。

### 属性构造器

| 构造器 | 产出 `type` | 必填 | 页面拿到的量纲 |
|---|---|---|---|
| `color({ value: '#a8c4ff' })` | `color` | — | **0–1 浮点**，`"0.66 0.77 1"`，需 ×255 |
| `slider({ min, max, value })` | `slider` | — | number，`fraction: true` 时带小数，别 `Math.round` |
| `bool({ value })` | `bool` | — | boolean |
| `combo({ options, value })` | `combo` | `options` | 选中项的 `value` 字符串 |
| `text({ value })` | `textinput` | — | string |
| `html({ text })` | `text` | — | **不会推送**，面板里的 HTML 区块（标题 / 分隔线 / 链接 / 图）；`value` 固定 `false` |
| `file({ value })` | `file` | — | 路径，用前拼 `file:///` |
| `directory({ mode })` | `directory` | — | 目录路径；`ondemand` 一个文件一个文件取 |
| `group({ text })` | `group` | — | **不会推送**，只是 UI 分组标题 |

自动补齐的部分：`text` 缺省取 key 名；`index` 从 0、`order` 从 100 按声明顺序递增（可显式钉住）；`schemecolor` 自动加在首位（order 0、无 index，`text` 用本地化 key `ui_browse_properties_scheme_color`）；`fraction: true` 且没给 `step` 时补 `step: 0.01` / `precision: 2`。

与组件层相反，**这个模块对坏输入直接抛错**。控件拿到坏 prop 会安静降级（那是刻意的），但 manifest 写错是在引擎里静默失效——正是要消灭的失败模式。

### 面板排版：`html()` 与 `condition`

`project.json` **没有主页字段、也没有图标字段**（`preview` 是编辑器截的文件名）。已发布壁纸的做法是把这些东西写进设置面板本身：`type: "text"` 的条目会被引擎当作 HTML 渲染，于是分区标题、分隔线、二维码、主页链接全都长在属性列表里。参考一份 workshop 上真实发布的场景壁纸，它的 40 多个属性里有近一半是这种纯展示块（`<h3>🎵音频 Audio</h3>`、`<hr>`、`<a href>` 致谢栏），真正的开关只有十来个。

```js
properties: {
  sectionAudio: html({ text: '<h3>🎵 音频 Audio</h3>' }),
  showAudio: bool({ text: '启用音频', value: true }),
  audioColor: color({ text: '音频色', value: '#ffffff', condition: 'showAudio.value == 1' }),
  sectionAbout: html({ text: '<hr><a href="https://example.com">主页</a>' }),
}
```

两条边界：

- `condition` 只写引擎支持的形式：`"key.value == 1"`（bool）、`"key.value == 'grid'"`（combo）。写成别的表达式引擎不报错，只是那条控制项再也不出现——所以 `defineProject()` 会校验格式，并**校验被引用的 key 确实声明在同一份文件里**（引用错一个字母，控制项就永久隐藏，且没有任何提示）。
- HTML 块**不会推送给页面**，所以别把它的 key 当成数据源读。

### 面板里的链接与图片有白名单（实测）

这一条是踩过的坑，写在这里省得下次又试一遍：**`<a href>` 写得再标准，只有允许列表里的域名点得开**，其余链接照常显示文字、但没有可点的动作。

| 实测结果 | 域名 |
|---|---|
| ✅ 能点开（2026-11 实测） | `steamcommunity.com`、`space.bilibili.com`、`youtube.com` |
| ❌ 只显示文字、点不动 | `github.com` |

图片的白名单比链接宽：`github.com/mikoberry.png`（实际 302 到 `avatars.githubusercontent.com`）**在面板里能正常显示**，不需要换图床。

所以在面板里做「求关注」时：

- **别把 CTA 建立在白名单外的链接上**。点赞 / 订阅 / 收藏这种动作本来就发生在创意工坊页面上，不需要链接，最稳。
- 主页地址**写成纯文本**（用户可复制），或放进 `description`——那里在创意工坊页面里是浏览器渲染的，链接可点。
- 需要真能点的入口时，用白名单内的域名做跳板（例如 Steam 个人资料页、B 站主页）。

## 合并语义

`mergeProject` 不是覆盖：

| 字段 | 规则 |
|---|---|
| 配置里声明的键 | 覆盖文件里的同名键 |
| 配置里**没提**的顶层键 | 保留文件原值（含 `contentrating` / `visibility` / `preview`） |
| `general.properties` 里配置没声明的属性 | 保留（在编辑器里手加的不至于消失） |
| `workshopid` / `version` / `snapshotformat` / `snapshotoverlay` | **无条件保留**，永不生成 |
| `--prune` | 让文件与配置完全一致，但上一条的引擎自有字段仍保留 |

`--check` 是**语义比较**，不是文本 diff：`type` 的大小写差异不算漂移，键顺序和缩进也不算。文件里有、配置里没有的属性只作提示，不判失败——除非加了 `--prune`（那才是真的会删）。

首次生成会把 `combo` 的 `options` 展开成多行（标准 JSON 格式），之后稳定。

## 命令

在 `playground/`（或你自己的壁纸仓库）执行：

```bash
npm run gen:project                       # 生成/更新 public/project.json
npm run check:project                     # 只报告漂移，不写盘；不一致时退出码 1
npm run gen:project -- --prune            # 同时删除配置未声明的属性
npm run gen:project -- --config other.js  # 换配置文件
npm run gen:project -- --target /tmp/x.json
```

`--check` 适合放在提交前或发布构建前，当一道闸门。

## 怎么测

四层，从便宜到贵。前三层不需要 Wallpaper Engine。

### 第一层：纯函数自测

```bash
cd playground && npm run test:project
```

`scripts/test-project.mjs` 用 `node:assert` 覆盖 50 条断言，零依赖、不启动任何服务：

| 组 | 覆盖内容 |
|---|---|
| `defineProject` 默认值 | `schemecolor` 位置与无 `index`、`supportsaudioprocessing` 嵌在 `general`、`type: "Web"`、可选键不出现（而非 `null`）、段落拼接、trim |
| 属性构造器 | 颜色量纲转换、`index` / `order` 递增、`text` 回退 key、`fraction` 补 `step`、`combo` 默认选项 |
| 面板 HTML 与条件 | `html()` 的 `type: "text"` / `value: false`、`condition` 原样落到 manifest、bool 与 combo 两种写法 |
| 坏输入 | 15 条报错路径（缺 file/title、颜色非法、combo 选项不匹配、slider 越界、`condition` 写错或引用不存在的 key…）——**这类断言比正例更重要**，静默失败正是它要消灭的东西 |
| `mergeProject` | 引擎字段保留、未声明字段保留、`--prune` 只删属性、无原文件可用 |
| `diffProject` | `type` 大小写不算漂移、漏写报 mismatch、多余属性只进 `extra` |
| 序列化 | 键序、结尾换行、可原样解析 |
| 与真实文件对照 | `playground/project.config.js` 生成的 manifest 与 `public/project.json` 语义一致 |
| 脚本层 | 真的 spawn 一遍 `gen-project.mjs`：创建、`--check` 通过、漂移返回 1、合并保留 `workshopid`、`--prune` 删除、坏 JSON 拒绝覆盖 |

改 `src/project/` 之后跑这个，比在 WE 里试快一个数量级。

### 第二层：对着你的真实配置跑 `--check`

```bash
npm run check:project
```

它只报告、不写盘。看到「已同步」说明配置与文件一致；看到「改 xxx」说明要重跑生成。适合放在 `git commit` 前。

### 第三层：在浏览器里看属性真的生效

```bash
npm run dev     # 打开 http://localhost:5174/wallpaper.html
```

浏览器里没有任何宿主会调 `applyUserProperties`，所以测试页的 `props` 行默认全是 `—`。`playground/dev-properties.js` 在**开发服务器**里补上这一步：它把 `project.config.js` 过一遍 `defineProject()`，再把结果按引擎的方式推给桥接，于是 HUD 的 `props` / `events` 行会立刻填满，界面也按属性值变化。

它只证明一件事：**这份 manifest 的 key、类型、默认值能被桥接和页面接住**。三处它做不到：

| 做不到 | 只能靠真机 |
|---|---|
| 引擎是否接受这份文件 | 第三层 |
| 面板里 `html()` 的 HTML 长什么样、`condition` 是否真的隐藏 | 第三层 |
| 拖动控制项时的增量推送 | 第三层 |

它施加的两次转换就是引擎自己做的：颜色从 manifest 的 `0..255` 三元组转成页面的 `0..1` 浮点（六位小数），`text` / `group` 条目不推送。HUD 上那行 `sim N 项 · 按 project.config.js 模拟` 是刻意的——填满的 `props` 行与真机推送长得一模一样，不标出来就会误导。

它不会进壁纸产物：`wallpaper.jsx` 只在 `import.meta.env.DEV` 为真时动态 import，`build:wallpaper` 是生产构建，整段连同模块一起被裁掉（构建后 `dist-wallpaper` 里搜不到该模块）。

### 第四层：真机（只有这一步需要 WE）

**这层有个坑必须先知道**：`deploy:wallpaper` 把 `project.json` 列为引擎自有文件，**目标已存在时不会覆盖**。所以想验证生成的那份，要么先删掉 WE 工程目录里的 `project.json`，要么换一个干净目录：

```bash
# 干净目录部署：目标没有 project.json，deploy 会「首次写入」它
WE_PROJECT_DIR=/d/tmp/we-test npm run build:wallpaper
node scripts/deploy-wallpaper.mjs
```

在 WE 里打开那个项目、重新应用壁纸，然后看 HUD：

| 看什么 | 期望 |
|---|---|
| WE 的「壁纸属性」面板 | 出现了你在 `project.properties` 里声明的项，标签文字与 `text` 一致 |
| HUD 的 `props` 行 | 包含所有声明的 key（`group` 除外——它不会推送） |
| 拖动一个 slider / 改一个颜色 | HUD 的 `events` 行只新增该 key 一条，`props` 对应值变化 |
| HUD 的音频帧数 | 不是 0（说明 `general.supportsaudioprocessing` 生效了） |

最后一项是这份文件最容易出错的地方的直接指标。若音频帧数恒为 0，而页面本身正常，先回来查 `general.supportsaudioprocessing` 是不是被放到了顶层。

真实配置第一次接管现有工程时，**先备份 `project.json`**：编辑器写过的那份里有 `preview` / `version` / `workshopid`。

## 什么时候不要跑它

**这一条最重要。** 编辑器改「工程设置」时会整份重写 `project.json`，写入 `preview` / `version` / `snapshotformat`（以及发布后的 `workshopid`）。所以：

- **不要**把它接成 `build:wallpaper` 的钩子。构建不该碰这份文件；`deploy-wallpaper.mjs` 正是因此把 `project.json` 列为「引擎自有文件、只创建不覆盖」。
- 已发布壁纸要改内容时，先跑 `--check` 看差异，确认 `workshopid` 在原文件里，再决定写不写。合并语义会保住它，但你自己别手工删。
- 编辑器已经写过之后，文件格式与工具输出不完全一致（`options` 展开方式），这是正常现象，`--check` 不会因此报错。

## 不做的事

| 不做 | 原因 |
|---|---|
| 生成 `preview.gif` / 缩略图 | 那是编辑器截图，工具只能承担文件名 |
| 生成主页字段 | **`project.json` 没有这个字段**；链接写进 `description`，或用 `html()` 做成面板里的一行 |
| 生成图标 / 二维码 | 同上，没有字段；能做的只有 `preview` 的文件名，或 `html()` 里挂一张已托管的图 |
| 校验 `tags` 的合法值 | 引擎的 tag 列表会变，写死只会误报 |
| 发布到 Workshop | 属于人操作；工具只准备文件 |
| 在运行时读 project.json | 页面侧只有 `useWallpaperProperties()`，不解析 manifest |

## 对照别人已发布的壁纸

Workshop 目录里能直接读到发布者的 `project.json`（`steamapps/workshop/content/431960/<id>/`），那是学面板排版最省事的样本。读的时候注意两处**格式差异**，否则会以为自己写错了：

| 差异 | 说明 |
|---|---|
| `type: "Scene"` | 场景壁纸（`file` 指向 `scene.pkg`）。本工具只产 Web 壁纸，`directory` / `file` 之外的东西它也接不住 |
| 颜色写成 `"0.65 0.76 1"` | 场景壁纸的 manifest 用 0–1 浮点；**Web 壁纸用 0–255 整数**。两者的 `value` 同名不同量纲，工具按 Web 生成 |

`condition`、`alerttype`、`index` 的乱序编号、`text` 当 HTML 用，这几点在两边是一致的。

## 与既有文档的关系

- 形状与坑的原始说明：[`we-integration.md`](./we-integration.md) §3（内容不重复，本文只讲工具怎么用）
- 编辑器导出的全类型样例：[`docs/project.json`](./project.json)
- 分层归属：[`architecture.md`](./architecture.md) §7.1 / §12.3
