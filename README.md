# WallKit

Wallpaper Engine 网页壁纸的**控件浮层库**。

提供时钟、音频频谱、专辑封面等可复用控件，叠加在壁纸背景之上。不包含背景渲染，不包含数据采集。

---

## 定位

```
背景层（Spine / Live2D / video …）   ← 各游戏仓库自己实现
外壳层（WE 集成、部署脚本）           ← 各游戏仓库自建，走同一份模板
控件浮层（Clock / Spectrum / …）     ← WallKit 负责
数据采集（音频帧、媒体信息）          ← 各项目自己构建
```

**只做展示。** 组件接收纯数据 props，不读全局状态，不感知背景是什么。

### 不包含

- Spine / Live2D / WebGL 背景渲染
- 音频与媒体数据采集
- 设置抽屉、国际化
- 普通浏览器支持（浏览器读不到系统音频与媒体信息）
- npm 发布

---

## 使用方式

WallKit 通过 GitHub git 引用分发，不发布 npm。

```json
{
  "dependencies": {
    "wallkit": "github:mikoberry/wallkit#<commit-sha>"
  }
}
```

```jsx
import { Clock } from 'wallkit/components/clock'

function Controls() {
  // The caller owns the tick: the component holds no timer, so pausing the
  // wallpaper stops the work here too.
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <Clock
      now={now}
      labels={{ date: '2026年11月13日', weekday: '周四', aria: '当前时间与日期' }}
    />
  )
}
```

数据由使用方构建。没有数据时组件不渲染——**不会用假数据兜底**。

### WE 集成（可选）

若需要拿到真实的音频频谱与媒体信息，安装 Vite 插件自动注入 WE 监听器：

```js
// vite.config.js
import { wallkitWE } from 'wallkit/we/vite'

export default defineConfig({
  plugins: [react(), wallkitWE()],
})
```

或使用便利 hooks：

```jsx
import { useWallpaperAudio, useWallpaperMedia } from 'wallkit/we'

const bars = useWallpaperAudio()
const track = useWallpaperMedia()
```

详见 [WE 集成指南](./docs/we-integration.md)。

---

## 入口一览

| 入口 | 内容 |
|---|---|
| `wallkit` | 根入口 |
| `wallkit/core` | 环境探测、存储工具、时钟纯函数、类型约定 |
| `wallkit/components/clock` | 日期时间控件 |
| `wallkit/we` | WE 数据源 hooks（P4 计划中，暂无实现） |
| `wallkit/we/vite` | Vite 插件（P4 计划中，暂无实现） |
| `wallkit/styles` | 主题变量 |

---

## 主题

通过 CSS 变量覆盖：

```css
:root {
  --wallkit-accent: #7dd3fc;
  --wallkit-text: #f8fafc;
  --wallkit-font: 'Noto Sans SC', system-ui, sans-serif;
}
```

---

## 文档

- [架构方案](./docs/architecture.md) — 定位、分层、接口原则、阶段计划
- [WE 集成指南](./docs/we-integration.md) — 内联脚本、`project.json`、音频排查
- [抽取映射](./docs/extraction-map.md) — 从现有壁纸项目迁移的代码归属

---

## 状态

设计中，尚未实现。

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | `core` + `styles` 骨架 | ✅ 完成 |
| P1 | `Clock` | ✅ 完成 |
| P2 | `Spectrum` | 未开始 |
| P3 | `MiniSpectrum` + `AlbumArt` | 未开始 |
| P4 | `wallkit/we` + Vite 插件 | 未开始 |
| P6 | 模板仓库 | 未开始（等第二个游戏落地后） |

---

## 使用与修改

### 直接使用

git 引用即可，无需其他操作。见上文「使用方式」。

### 修改 WallKit 本身

`node_modules` 中的副本是只读安装结果，直接改不会生效。需要：

1. Fork 本仓库到自己账号
2. 在自己的 fork 上修改
3. 把依赖改为 fork 地址：

```json
"wallkit": "github:<你的用户名>/wallkit#<commit>"
```

注意：fork 之后**不会自动获得上游更新**，需手动 rebase 或 cherry-pick。这是 git 引用模式的固有特性。

### 提交改动

欢迎提 PR，但是否合并完全由作者判断，没有响应时间承诺。

---

## 许可

代码以 [MIT](./LICENSE) 协议开源，可自由使用、修改、分发、商用，需保留版权与许可声明。

### 模型资产不在许可范围内

**MIT 只覆盖本仓库的代码。**

Wallpaper Engine 壁纸所使用的模型、贴图、音频等资产，版权通常属于原游戏或其发行方，**不属于本项目**。本仓库不包含任何此类资产。

如果你要用本库制作壁纸，你需要自行确保所使用资产的合法来源与使用权限。

---

## 维护说明

本项目主要服务于作者自己的壁纸项目。

- 没有 issue 响应时间承诺
- 没有向后兼容承诺
- 没有固定的发布节奏

开源目的是让他人可以自由使用，而非提供支持服务。
