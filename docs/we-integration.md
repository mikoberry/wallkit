# Wallpaper Engine 集成指南

> 状态：**P4 已实现并完成 WE 实机接线复验（结果正常）**；之后新增 `properties` 桥与 `PointerFx` / `AmbientFx`。插件（§2.1）与 hooks 均可直接使用；不用 Vite 的项目按 §2.2 手动粘贴。
> 适用：使用 WallKit 控件库的 WE 网页壁纸项目
> 关联：[architecture.md](./architecture.md)

WallKit 的控件本身不依赖 WE。但要让控件拿到**真实**的音频频谱和媒体信息，需要把监听器正确注册到页面里。本文记录这件事的全部要点，以及对不生效时的排查路径。

---

## 1. 为什么需要内联脚本

WE 通过宿主注入的全局函数回调网页：

| 能力 | 宿主函数 | 时机要求 |
|---|---|---|
| 音频频谱 | `wallpaperRegisterAudioListener` | 必须在**模块脚本之前**注册 |
| 媒体信息 | `wallpaperRegisterMedia*Listener` | 同上 |
| 用户属性 | `wallpaperPropertyListener.applyUserProperties` | 必须在**加载期间就已存在**，否则会漏掉首次推送 |
| 暂停状态 | `wallpaperPropertyListener.setPaused` | 需在监听对象存在后再挂 |

### 关键约束：注册时机

监听器必须写在 `index.html` 的 `<head>` 中，使用 **classic script**（无 `type="module"`）。

原因：Vite 注入的入口脚本是 `type="module"`，默认 `defer`，在 HTML 解析完成后才执行。而 WE 在页面加载早期就会开始推送音频帧。如果等 React 挂载后再注册，会丢失最初的帧，且部分情况下回调干脆不触发。

**不要**在 React 代码里注册，**不要**放在 `window.onload` 处理器里。这两者都已验证为不可靠。

---

## 2. 接入方式

### 2.1 Vite 插件（推荐）

```js
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { wallkitWE } from 'wallkit/we/vite'

export default defineConfig({
  plugins: [
    react(),
    wallkitWE(),          // 默认注入 audio + media + properties + pause
  ],
})
```

按需注入（五段开关，前四项默认 `true`，`timeline` 默认 `false`）：

```js
wallkitWE({ audio: true, media: false, properties: true, pause: false, timeline: true })
```

插件通过 `transformIndexHtml` 的 `order: 'pre'` 把 classic script 插到 `<head>` 最前面（`head-prepend`），保证早于模块脚本；顺序 **audio → media → properties → timeline → pause**，每段带 `<!-- wallkit-we:* -->` 注释标记，**重复挂载插件或手工粘贴过某一段都不会重复注入**。`timeline` 默认关的理由见 §2.2 (4)；`properties` 排在 `pause` 之前，理由见 §2.3。接口细节见 [we-design.md](./we-design.md) §2.2。

> `project.json` 仍由使用方保证（§3）；插件只注入脚本，不碰工程配置。

### 2.2 手动粘贴（不使用 Vite 插件时）

把下面 (1)(2)(3)(5) 四段按顺序放入 `index.html` 的 `<head>` 中，位于所有 `type="module"` 脚本之前。(4) 是可选的播放进度桥接，只在确实需要时插入，位置在 (3) 之后、(5) 之前。这些文本与 `src/we/inline/*.js` 的字符串常量等价（仅注释语言不同），改动时两份要同步。

#### (1) 音频监听器

```html
<script>
  window.__wallkitAudioFrame = null;
  window.__wallkitAudioAt = 0;

  if (typeof window.wallpaperRegisterAudioListener === 'function') {
    window.wallpaperRegisterAudioListener(function (audioArray) {
      if (!audioArray || typeof audioArray.length !== 'number' || audioArray.length < 128) {
        return;
      }
      // 复制一份，宿主会复用自身缓冲区
      window.__wallkitAudioFrame = Float32Array.from(audioArray);
      window.__wallkitAudioAt = Date.now();
    });
  }
</script>
```

#### (2) 媒体监听器

```html
<script>
  window.__wallkitMedia = {
    thumbnail: '', title: '', artist: '', albumTitle: '',
    primaryColor: '', textColor: '',
    playback: null, enabled: null, updatedAt: 0,
  };

  var __wm = window.__wallkitMedia;

  if (typeof window.wallpaperRegisterMediaStatusListener === 'function') {
    window.wallpaperRegisterMediaStatusListener(function (event) {
      __wm.enabled = event ? event.enabled === true : null;
    });
  }

  if (typeof window.wallpaperRegisterMediaThumbnailListener === 'function') {
    window.wallpaperRegisterMediaThumbnailListener(function (event) {
      if (!event) return;
      __wm.thumbnail = event.thumbnail || '';
      __wm.primaryColor = event.primaryColor || '';
      __wm.textColor = event.textColor || '';
      __wm.updatedAt = Date.now();
    });
  }

  if (typeof window.wallpaperRegisterMediaPropertiesListener === 'function') {
    window.wallpaperRegisterMediaPropertiesListener(function (event) {
      if (!event) return;
      __wm.title = event.title || '';
      __wm.artist = event.artist || '';
      __wm.albumTitle = event.albumTitle || '';
      __wm.updatedAt = Date.now();
    });
  }

  if (typeof window.wallpaperRegisterMediaPlaybackListener === 'function') {
    window.wallpaperRegisterMediaPlaybackListener(function (event) {
      if (!event) return;
      var constants = window.wallpaperMediaIntegration;
      // 播放状态整数值由宿主定义，严禁硬编码。
      // 常量对象缺失时保持 null（未知），不要猜成 stopped，否则封面会永久隐藏。
      if (!constants) {
        __wm.playback = null;
        return;
      }
      if (event.state === constants.PLAYBACK_PLAYING) __wm.playback = 'playing';
      else if (event.state === constants.PLAYBACK_PAUSED) __wm.playback = 'paused';
      else __wm.playback = 'stopped';
    });
  }
</script>
```

#### (3) 用户属性桥

`project.json` 里声明的属性，由宿主在**页面加载时推一次全量**，之后只推用户改动的那几个 key。所以桥接必须做「合并进快照」，不能整体替换 —— 整体替换会把其余属性全部抹掉。取值格式见 §3.3。

```html
<script>
  (function () {
    window.__wallkitUserProperties = {};
    // 诊断用环形缓冲，最新在最后，最多 8 条。
    window.__wallkitPropertyLog = [];

    function __wallkitApplyUserProperties(properties) {
      if (!properties || typeof properties !== 'object') return;

      var previous = window.__wallkitUserProperties || {};
      var next = {};
      var key;
      var received = [];

      for (key in previous) {
        if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key];
      }

      for (key in properties) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
        var entry = properties[key];
        if (!entry || typeof entry !== 'object') continue;
        // group 是纯 UI 容器，没有值
        if (entry.type === 'group') continue;
        next[key] = entry.value;
        received.push(key);
      }

      window.__wallkitUserProperties = next;
      // 加载期那次推送早于 React 挂载，日志只能由桥接自己记，否则最想看的那一次看不到。
      window.__wallkitPropertyLog = window.__wallkitPropertyLog
        .concat([{ at: Date.now(), keys: received }])
        .slice(-8);
      window.dispatchEvent(new CustomEvent('wallkit-properties-change', { detail: next }));
    }

    var host = window.wallpaperPropertyListener;
    var listener = host && typeof host === 'object' ? host : {};

    listener.applyUserProperties = __wallkitApplyUserProperties;
    window.wallpaperPropertyListener = listener;
  })();
</script>
```

四点注意：

- 这里**无条件创建** `wallpaperPropertyListener`（官方要求「必须在任何事件之外全局初始化」，否则会漏掉加载期间的推送）。副作用是它在普通浏览器里也存在，因此**不能**再用它判断是否在 WE 中运行（见 §7）。
- 它必须排在暂停桥接**之前**：暂停桥接是把 `setPaused` 挂到「已存在的对象」上，而这里的写法是合并进已有对象，两者只有这个顺序才不会互相覆盖。
- `window.__wallkitPropertyLog` 只用于排查（§6）：每条记录是一次推送的 `{ at, keys }`，`keys` 是这次真正变化的 key。**不要**拿它做业务逻辑。
- 目录类属性（`directory`）的 `ondemand` 模式取文件名要用 `window.wallpaperRequestRandomFileForProperty(key, cb)`；`fetchall` 模式则改用 `userDirectoryFilesAddedOrChanged` / `userDirectoryFilesRemoved` 两个回调，**不经过** `applyUserProperties`。本项目当前只用 `ondemand`。

#### (4) 播放进度监听器（可选，默认不用）

WE 官方对 `MediaTimelineListener` 的警告是「不是所有播放器都支持，要假设这个回调永远不被调用」。所以 `window.__wallkitTimeline` 初始为 `null`，只有真实数字到达才写入；**不要**在应用层补 `0:00`、插值或假进度。插件默认不注入这一段，需要时用 `wallkitWE({ timeline: true })` 并配合 `useWallpaperTimeline()`。

```html
<script>
  window.__wallkitTimeline = null;

  if (typeof window.wallpaperRegisterMediaTimelineListener === 'function') {
    window.wallpaperRegisterMediaTimelineListener(function (event) {
      if (!event) return;
      // 不做强转、不做兜底：拿不到真实数字就保持 null。
      if (typeof event.position !== 'number' || typeof event.duration !== 'number') return;
      if (!isFinite(event.position) || !isFinite(event.duration) || event.duration <= 0) return;
      window.__wallkitTimeline = { position: event.position, duration: event.duration };
    });
  }
</script>
```

#### (5) 暂停桥接

```html
<script>
  window.__wallkitPaused = false;

  function __wallkitSetPaused(value) {
    var next = value === true;
    if (window.__wallkitPaused === next) return;
    window.__wallkitPaused = next;
    window.dispatchEvent(new CustomEvent('wallkit-pause-change', { detail: next }));
  }

  // 复用宿主或属性桥接已经创建的对象（默认顺序下是后者）。
  // 不要在这里无条件创建 —— 只有在音频宿主函数存在、即确定在 WE 里时才兜底。
  if (window.wallpaperPropertyListener) {
    window.wallpaperPropertyListener.setPaused = __wallkitSetPaused;
  } else if (typeof window.wallpaperRegisterAudioListener === 'function') {
    window.wallpaperPropertyListener = { setPaused: __wallkitSetPaused };
  }
</script>
```

### 2.3 顺序要求

默认四段的顺序是：**音频 → 媒体 → 属性 → 暂停**；启用 timeline 时为 **音频 → 媒体 → 属性 → timeline → 暂停**（与插件注入顺序一致）。

- 暂停桥接依赖 `wallpaperRegisterAudioListener` 的存在来判断"宿主是否已就绪"，所以必须放在音频监听器之后。
- 属性桥接要在暂停桥接之前：`wallpaperPropertyListener` 由属性桥接创建并写入 `applyUserProperties`，暂停桥接只是往同一个对象上补一个 `setPaused`。反过来则有可能让后写的整对象赋值抹掉先写的回调。

---

## 3. project.json 形状

**这是最容易出错的地方。**

```json
{
  "file": "index.html",
  "general": {
    "properties": {
      "schemecolor": {
        "order": 0,
        "text": "schemecolor",
        "type": "color",
        "value": "0 0 0"
      },
      "accentColor": {
        "order": 100,
        "text": "强调色",
        "type": "color",
        "value": "168 196 255"
      },
      "clockAnchor": {
        "order": 101,
        "text": "时钟锚点",
        "type": "combo",
        "value": "bottom-right",
        "options": [
          { "label": "左下", "value": "bottom-left" },
          { "label": "右下", "value": "bottom-right" }
        ]
      }
    },
    "supportsaudioprocessing": true
  },
  "title": "Your Wallpaper",
  "type": "Web"
}
```

编辑器（Change Project settings）写出的完整样例，包含全部属性类型，见 [docs/project.json](./project.json) —— 那份是**格式参考**，不是生效配置：真正被 `build:wallpaper` 带走的是 `playground/public/project.json`。

两件必须做到的事，外加一张取值格式表：

### 3.1 `supportsaudioprocessing` 必须在 `general` 内部

```json
// 错误：顶层写了会被静默忽略
{ "supportsaudioprocessing": true, "general": { ... } }
```

**症状**：监听器注册成功，但回调**永远不触发**（0 次回调）。这个错误不报错、不警告，只表现为"音频没反应"。

### 3.2 `type` 的大小写

```json
"type": "Web"     // 手写时用这个
"type": "web"     // 编辑器会写成这个，同样能跑
```

**不要**把这两行当排查方向：编辑器保存时会自己把 `type` 改写成小写 `"web"`，而 `playground/scripts/deploy-wallpaper.mjs` 也因此把 `project.json` 列为「引擎自有文件」、只创建不覆盖。手写大写、编辑器小写，两种都正常。真正敏感的只有 §3.1 的嵌套位置。

### 3.3 属性类型与取值格式

`applyUserProperties` 里的 `value` 格式与 manifest 里写的**不是同一套量纲**：

| 类型 | manifest 里的 `value` | 推给页面的 `value` |
|---|---|---|
| `color` | 0–255 整数，空格分隔（`"168 196 255"`） | **0–1 浮点**，空格分隔（`"0.66 0.77 1"`），需 ×255 |
| `slider` | number；`fraction: true` 时带小数（配合 `precision` / `step`） | number，**可能是小数**，别 `Math.round` |
| `bool` | `true` / `false` | boolean |
| `combo` | 选中项的 `value` | 该 `value` 字符串（`label` 通过同级 `.text` 给，一般不消费） |
| `textinput` | 字符串（注意类型名是 `textinput`，不是 `text`） | string |
| `file` | 空串或路径 | 路径，用前必须拼 `'file:///' + value` |
| `directory` | 空串或目录路径 | 路径；文件列表要用 `wallpaperRequestRandomFileForProperty(key, cb)`（`ondemand`）或 `userDirectoryFilesAddedOrChanged` / `…Removed`（`fetchall`） |
| `group` | 空串 | **不会推送**，它是纯 UI 容器 |

颜色这一条是最容易写错的：manifest 里写 `"1 0 0"` 是**接近纯黑的红**（0–255 量纲），不是纯红；而页面拿到的是 `"0.0039 0 0"`。两个量纲共用 `value` 这个名字。

`file` / `directory` 的默认值都是空串，所以控件**必须**有回退路径 —— 与音频「没有数据就画空图」同理，不要为了让画面好看塞一张占位图装作是用户选的。

读取这些值用 `wallkit/we` 的两个 hook（组件本身仍然只认 props）：

```jsx
import { useWallpaperProperties, useWallpaperProperty } from 'wallkit/we'

const props = useWallpaperProperties()          // { accentColor: "0.66 0.77 1", ... }
const anchor = useWallpaperProperty('clockAnchor', 'bottom-right')

// 颜色要自己归一：宿主给的是 0..1 浮点，"0.66 0.77 1"
const rgb = String(props.accentColor || '').split(' ').map((c) => Math.round(Number(c) * 255))
```

快照只在宿主推送时换引用，所以可以安全地放进依赖数组。**未声明的 key 是 `undefined`，不是 `false`** —— 回退值必须在调用处显式给出，不能靠桥接替你猜。

### 3.4 从值到组件 props

映射是**单向纯函数**，全部写在应用层，组件不知道 WE 的存在：

```
project.json key → 桥接快照 → useWallpaperProperties() → 应用层换算 → 组件 props
```

三种常见形态（`playground/wallpaper.jsx` 里各有一个实例）：

| 形态 | 例 | 写法 |
|---|---|---|
| 格式转换 | `color` 的 0–1 浮点 → `#rrggbb` | `toHexColor(props.accentColor)`，非法返回 `null` 再回落 |
| 校验 + 回落 | `combo` 必须是认识的枚举值 | `ANCHORS.includes(v) ? v : fallback` |
| 量纲换算 | `slider` 的 0–1 → 百分比 | `Math.round(100 * v)` |

四条规则：

1. **用 `undefined` 判断「没收到」**，不要用 falsy。`false` 和 `0` 是合法值 —— `sizeScale: 0` 被 `|| 100` 吃掉就变成 100。
2. **非法值回落，不要透传**。组件拿到不认识的 `anchor` 会画出错位布局，比「属性没生效」更难查。
3. **换算只在应用层**。组件拿到的必须已经是干净的 props（分层规则见 `AGENTS.md`）。
4. **不回写**。WE 没有回写通道，属性是只读的，不要做双向绑定。

没有对应 prop 的属性**不要硬塞**：`showSeconds`（秒由 `placement` 决定，没有单独开关）和 `captionText`（`Clock.labels` 只有 `locale` / `aria` / `weekday` / `dateWithWeekday`）要先给组件加 prop 才能接；`customImage` / `imageDir` 在应用层就能接（拼 `file:///` 后塞进 `AlbumArt` 的 `track.thumbnail`；目录要先在桥接里调 `wallpaperRequestRandomFileForProperty`）。

---

## 4. 排查清单

音频频谱没反应时，按以下顺序排查：

### 第 1 步：确认 project.json

- `general.supportsaudioprocessing` 是否为 `true`，且确实**嵌套在 `general` 内**
- 属性没生效时看 `general.properties` 的 key 是否与代码里读的一致（改名等于换配置）

### 第 2 步：确认脚本注册成功

在 WE 的调试控制台执行：

```js
typeof window.wallpaperRegisterAudioListener   // 应为 "function"
window.__wallkitAudioFrame                     // 应随时间不断变化
window.__wallkitAudioAt                        // 应接近 Date.now()
```

如果 `__wallkitAudioFrame` 一直是 `null`，说明回调没触发 → 回到第 1 步。

### 第 3 步：确认 WE 的音频来源

- Wallpaper Engine 设置 → **性能 / 媒体** → 确认已选择正确的**音频录制设备**
- 计算机没有任何声音播放时，音频帧才会是静音值（全 0），这不代表失败

### 第 4 步：确认系统层面未静音

- Windows 音量合成器中，Wallpaper Engine 是否被静音
- 是否选择了错误的输出设备

### 第 5 步：确认环境判定

```js
typeof window.wallpaperRegisterAudioListener      // WE 中为 "function"
window.__wallkitUserProperties                    // 属性桥接写入的快照
```

**不要**用 `window.wallpaperPropertyListener` 判断环境：属性桥接会无条件创建它（§2.2 (3)），浏览器里同样存在。`core/env.js` 的 `isWallpaperEngine()` 已改为只认宿主注入的函数（音频 / 媒体 / `wallpaperRequestRandomFileForProperty`）。

---

## 5. 媒体信息排查

```js
window.__wallkitMedia   // 检查各字段是否被填充
```

常见情况：

| 现象 | 原因 |
|---|---|
| 全字段为空 | 宿主没有启用媒体集成，或当前没有播放器输出 |
| 只有封面没有文字 | 只注册了 thumbnail 监听器，漏了 properties 监听器 |
| 切换到无封面歌曲后封面残留 | 正常行为——WE 只在切换时推送，空封面不会主动清空 |
| 播放状态一直是 `null` | `window.wallpaperMediaIntegration` 常量对象缺失 |

**关于播放状态**：封面**不能**按时效过期隐藏。WE 只在歌曲切换时推送，如果按时间戳判断"过期"，暂停播放时封面会自己消失。只应在明确收到 `stopped` 时隐藏，`null`（未知）应视为正在播放。

---

## 6. 用户属性排查

在 WE 的调试控制台执行：

```js
typeof window.wallpaperPropertyListener.applyUserProperties   // 应为 "function"
window.__wallkitUserProperties                                // 应含 project.json 里声明的 key
window.__wallkitPropertyLog                                   // 每次推送一条 { at, keys }
```

`__wallkitPropertyLog` 是判断「到底有没有收到事件」的唯一可靠依据：值为空（`0 次`）说明桥接没生效或 `general.properties` 是空的；有记录但值不对，才是量纲/映射的问题。测试页 HUD 的 `events` 行就是读它。

| 现象 | 原因 |
|---|---|
| `__wallkitUserProperties` 是 `{}` | 桥接没注入，或 `project.json` 的 `general.properties` 是空的 |
| 改一项设置，其他项被清空 | 桥接用了整体替换而不是合并（§2.2 (3) 的写法是合并） |
| 只收到第一次推送 | 属性桥接排在暂停桥接之后，或写在 `window.onload` 里 |
| 颜色明显偏暗 | 把 0–1 的浮点当成 0–255 用了，或反过来（§3.3） |
| 图片不显示 | `value` 少了 `file:///` 前缀 |
| `group` 出现在快照里 | 桥接没跳过 `type: "group"` |

用户改设置时 WE 只推送**变化的 key**，所以「没变的那几个还在」本身就是合并逻辑正常工作的证据。

---

## 7. 环境探测的坑

判定"是否在 WE 中运行"时，必须依赖宿主**真实注入**的对象，且只认**函数**——它们不可能由页面自己造出来：

```js
typeof window.wallpaperRegisterAudioListener === 'function' ||
typeof window.wallpaperRegisterMediaStatusListener === 'function' ||
typeof window.wallpaperRequestRandomFileForProperty === 'function'
```

**不要**用 `Boolean(window.wallpaperPropertyListener)` 判断。属性桥（§2.2 (3)）出于官方要求必须无条件创建这个对象，所以它在普通浏览器里也存在；把它当证据等于把「桥装好了」误读成「在引擎里」。

原项目曾因此踩坑：暂停桥接为了挂 `setPaused` 无条件创建了 `wallpaperPropertyListener`，结果普通浏览器也判定为 WE 环境，导致调试用的模型选择器被隐藏、抽屉默认收起。`core/env.js` 里 `isWallpaperEngine()` 的最终形态就是上面三条函数判断。

暂停桥本身的写法见 §2.2 (5)：优先复用已存在的对象，只有在"宿主确定存在但还没创建该对象"时才补建。

---

## 8. 暂停与功耗

WE 暂停时**冻结渲染进程**，但页面的 `requestAnimationFrame`、定时器、音频处理仍会运行。壁纸一天要跑十几个小时，不处理会持续耗电。

各组件的实际接口（**不是所有组件都有 `paused`**）：

| 组件 | 暂停怎么做 |
|---|---|
| `Clock` | **没有 `paused` prop**。停止更新 `now` 即可（组件本身不持有定时器）；要彻底摘掉 DOM 用 `visible={false}` |
| `Spectrum` | 有 `paused`。`true` 时 `cancelAnimationFrame`，循环完全停止；恢复时沿用暂停前的相位 |

库已提供 `useWallpaperPaused()`（订阅 §2.2 暂停桥接派发的事件）：

```jsx
import { useWallpaperPaused } from 'wallkit/we'

function Controls() {
  const paused = useWallpaperPaused()
  return <Spectrum bars={bars} paused={paused} />
}
```

不想引入 `wallkit/we` 时，在应用层直接监听即可：

```js
// 不依赖 wallkit/we 的写法
let paused = window.__wallkitPaused === true
window.addEventListener('wallkit-pause-change', (e) => {
  paused = e.detail
})
```

---

## 9. 结论速查

| 事项 | 责任方 | 当前可用 |
|---|---|---|
| `<head>` 内联脚本 | `wallkitWE()` 自动注入；不装插件则手动粘贴 | ✅ §2.1 / §2.2 |
| `project.json` 形状 | **使用方**（库不碰） | — |
| 音频 / 媒体数据采集 | `wallkit/we` hooks；也可使用方自己写 | ✅ 读 `window.__wallkit*` |
| 控件渲染 | WallKit | ✅ Clock / Spectrum / MiniSpectrum / AlbumArt |
| 暂停状态传递 | `useWallpaperPaused()`，或应用层监听 `wallkit-pause-change` | ✅ |
| 用户属性（project.json 配置） | `useWallpaperProperties()` / `useWallpaperProperty()` + `properties` 段 | ✅ 读 `window.__wallkitUserProperties` |
| 播放进度（可选） | `wallkitWE({ timeline: true })` + `useWallpaperTimeline()` | ✅ 默认关闭 |
| 背景层渲染 | 使用方（各项目实现不同） | — |
