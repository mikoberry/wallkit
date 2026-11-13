# Wallpaper Engine 集成指南

> 状态：**P4 已实现并完成 WE 实机接线复验（结果正常）**。插件（§2.1）与 hooks（§7）均可直接使用；不用 Vite 的项目按 §2.2 手动粘贴。
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
    wallkitWE(),          // 默认注入 audio + media + pause
  ],
})
```

按需注入（四段开关，前三默认 `true`，`timeline` 默认 `false`）：

```js
wallkitWE({ audio: true, media: false, pause: false, timeline: true })
```

插件通过 `transformIndexHtml` 的 `order: 'pre'` 把 classic script 插到 `<head>` 最前面（`head-prepend`），保证早于模块脚本；顺序 audio → media → timeline → pause，每段带 `<!-- wallkit-we:* -->` 注释标记，**重复挂载插件或手工粘贴过某一段都不会重复注入**。`timeline` 默认关的理由见 §2.2 (3)。接口细节见 [we-design.md](./we-design.md) §2.2。

> `project.json` 仍由使用方保证（§3）；插件只注入脚本，不碰工程配置。

### 2.2 手动粘贴（不使用 Vite 插件时）

把下面 (1)(2)(4) 三段按顺序放入 `index.html` 的 `<head>` 中，位于所有 `type="module"` 脚本之前。(3) 是可选的播放进度桥接，只在确实需要时插入。这些文本与 `src/we/inline/*.js` 的字符串常量等价（仅注释语言不同），改动时两份要同步。

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

#### (3) 播放进度监听器（可选，默认不用）

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

#### (4) 暂停桥接

```html
<script>
  window.__wallkitPaused = false;

  function __wallkitSetPaused(value) {
    var next = value === true;
    if (window.__wallkitPaused === next) return;
    window.__wallkitPaused = next;
    window.dispatchEvent(new CustomEvent('wallkit-pause-change', { detail: next }));
  }

  // 只挂到宿主已创建的监听对象上。
  // 无条件创建 wallpaperPropertyListener 会让环境探测在普通浏览器里误判为 WE。
  if (window.wallpaperPropertyListener) {
    window.wallpaperPropertyListener.setPaused = __wallkitSetPaused;
  } else if (typeof window.wallpaperRegisterAudioListener === 'function') {
    window.wallpaperPropertyListener = { setPaused: __wallkitSetPaused };
  }
</script>
```

### 2.3 顺序要求

默认三段的顺序是：**音频 → 媒体 → 暂停**；启用 timeline 时为 **音频 → 媒体 → timeline → 暂停**（与插件注入顺序一致）。

暂停桥接依赖 `wallpaperRegisterAudioListener` 的存在来判断"宿主是否已就绪"，所以必须放在音频监听器之后。

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
      }
    },
    "supportsaudioprocessing": true
  },
  "title": "Your Wallpaper",
  "type": "Web"
}
```

两个必须满足的点：

### 3.1 `supportsaudioprocessing` 必须在 `general` 内部

```json
// 错误：顶层写了会被静默忽略
{ "supportsaudioprocessing": true, "general": { ... } }
```

**症状**：监听器注册成功，但回调**永远不触发**（0 次回调）。这个错误不报错、不警告，只表现为"音频没反应"。

### 3.2 `type` 必须是大写 `"Web"`

```json
"type": "Web"     // 正确
"type": "web"     // 错误
```

---

## 4. 排查清单

音频频谱没反应时，按以下顺序排查：

### 第 1 步：确认 project.json

- `general.supportsaudioprocessing` 是否为 `true`，且确实**嵌套在 `general` 内**
- `type` 是否为 `"Web"`（大写 W）

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
window.wallpaperPropertyListener   // WE 中存在，浏览器中通常不存在
```

如果浏览器里也有这个对象，说明某处无条件创建了它 → 会导致环境误判。

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

## 6. 环境探测的坑

判定"是否在 WE 中运行"时，必须依赖宿主**真实注入**的对象，例如：

```js
Boolean(window.wallpaperPropertyListener) || Boolean(window.wallpaperRegisterAudioListener)
```

**不要**自己无条件创建 `wallpaperPropertyListener` 后再用它判断。

原项目曾因此踩坑：暂停桥接脚本为了挂 `setPaused` 而无条件创建了 `wallpaperPropertyListener`，结果普通浏览器也判定为 WE 环境，导致调试用的模型选择器被隐藏、抽屉默认收起。

正确的写法见本文 §2.2 (3)：优先复用宿主已创建的对象，只有在"宿主确定存在但还没创建该对象"时才补建。

---

## 7. 暂停与功耗

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

## 8. 结论速查

| 事项 | 责任方 | 当前可用 |
|---|---|---|
| `<head>` 内联脚本 | `wallkitWE()` 自动注入；不装插件则手动粘贴 | ✅ §2.1 / §2.2 |
| `project.json` 形状 | **使用方**（库不碰） | — |
| 音频 / 媒体数据采集 | `wallkit/we` hooks；也可使用方自己写 | ✅ 读 `window.__wallkit*` |
| 控件渲染 | WallKit | ✅ Clock / Spectrum / MiniSpectrum / AlbumArt |
| 暂停状态传递 | `useWallpaperPaused()`，或应用层监听 `wallkit-pause-change` | ✅ |
| 播放进度（可选） | `wallkitWE({ timeline: true })` + `useWallpaperTimeline()` | ✅ 默认关闭 |
| 背景层渲染 | 使用方（各项目实现不同） | — |
