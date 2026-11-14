// Wallpaper Engine manifest for this repo's testbed page.
//
// Everything that repeats across wallpapers lives here; the generator fills in
// the shape and the defaults the engine needs (`schemecolor`,
// `general.supportsaudioprocessing`, `type`).
//
//   npm run gen:project           → write public/project.json
//   npm run check:project         → report drift, write nothing
//
// The engine rewrites this file when you change project settings, so see
// docs/project-tool.md before running the generator on a published wallpaper.
//
// The layout below follows what published wallpapers do with the settings panel
// — section headings, `<hr>` separators, an inline link — because `project.json`
// has no homepage or icon field. Those are `type: "text"` blocks (`html()`),
// which the engine renders as HTML in the panel; they carry no value and the
// page never receives them.

import { color, slider, bool, combo, text, html, file, directory } from '../src/project/index.js'

export default {
  file: 'wallpaper.html',
  title: 'WallKit Testbed',

  // Paragraphs are joined with a blank line. Only the first two matter for
  // search; the rest is where links and credits belong, because `project.json`
  // has no homepage field.
  description: [
    '测试页：一屏同时摆四个控件，按 8 秒轮换布局，用来验证 WallKit 的视觉效果。',
    'Testbed: four widgets on one screen, cycling their layout every 8 seconds — a visual check for WallKit.',
    '主页 Homepage: https://github.com/mikoberry',
    '源码与文档 Source & docs: https://github.com/mikoberry/wallkit',
  ],

  tags: ['Abstract'],
  contentrating: 'Everyone',
  // visibility: 'private',

  audioprocessing: true,

  properties: {
    // ── Top banner: avatar + call to action ─────────────────────────────
    // The engine renders a `text` block as HTML in the settings panel, so this
    // is the only place an image or a link can live — `project.json` has no
    // homepage and no icon field.
    //
    // **Links only open for allowlisted domains** (Steam / Bilibili / YouTube
    // were confirmed working; GitHub is not, and the text stays but is not
    // clickable). So the homepage is written out as plain text to copy, and the
    // call to action points at something that needs no link at all: the Workshop
    // page's own 点赞 / 订阅 buttons.
    followBanner: html({
      text:
        '<center>' +
        '<img src="https://github.com/mikoberry.png?size=140" width="140" alt="mikoberry" />' +
        '<h2>⭐ 喜欢就点个赞 + 订阅 ⭐</h2>' +
        '<h5>在创意工坊页面点「点赞」和「订阅」，就是最大的支持 🙏</h5>' +
        '<h3>github.com/mikoberry</h3>' +
        '<h6>新版 / 源码 / 问题反馈都在上面的地址（面板里的链接无法点击，请复制到浏览器打开）</h6>' +
        '</center>' +
        '<hr>' +
        '<center>' +
        '<h4>⭐ Like &amp; Subscribe if you enjoy it ⭐</h4>' +
        '<h6>Hitting Like / Subscribe on the Workshop page is the best way to help.</h6>' +
        '<h6>New versions, source and the issue tracker live at github.com/mikoberry' +
        ' — panel links cannot be clicked, please copy the address into your browser.</h6>' +
        '</center>',
    }),

    // ── Panel sections are HTML, not settings ────────────────────────────
    // The engine shows `text` as HTML and never sends a value for it. Order
    // follows declaration, so a section header is just another entry in place.
    sectionClock: html({ text: '<hr><h3>🕒 时钟 Clock</h3>' }),

    // `accentColor` is the one key the testbed actually recolours with. The
    // rest exist to prove the bridge carries each engine type end to end.
    accentColor: color({ text: '强调色 Accent color', value: '#a8c4ff' }),
    sizeScale: slider({
      text: '尺寸倍率 Size scale',
      value: 1,
      min: 0,
      max: 2,
      step: 0.1,
      fraction: true,
    }),
    clockAnchor: combo({
      text: '时钟锚点 Clock anchor',
      value: 'bottom-right',
      options: [
        { label: '左下 Bottom left', value: 'bottom-left' },
        { label: '右下 Bottom right', value: 'bottom-right' },
        { label: '左上 Top left', value: 'top-left' },
        { label: '右上 Top right', value: 'top-right' },
      ],
    }),
    showSeconds: bool({ text: '显示秒 Show seconds', value: true }),

    // ── Conditions: keep the panel short ────────────────────────────────
    // `captionText` is only meaningful while `showCaption` is on, so it is
    // hidden otherwise instead of sitting in the list doing nothing.
    sectionCaption: html({ text: '<h3>📝 文案 Caption</h3>' }),
    showCaption: bool({ text: '显示副标题 Show caption', value: false }),
    captionText: text({
      text: '副标题 Caption text',
      value: 'WallKit · 四个控件同屏',
      condition: 'showCaption.value == 1',
    }),

    // ── Media sources ───────────────────────────────────────────────────
    sectionMedia: html({ text: '<hr><h3>🖼 图像 Image</h3>' }),
    customImage: file({ text: '自定义图片 Custom image' }),
    imageDir: directory({ text: '图片目录 Image folder' }),

    // ── Standing text ───────────────────────────────────────────────────
    // Plain text, not an anchor: GitHub is outside the panel's link allowlist,
    // so an `<a>` here would look clickable and do nothing.
    sectionAbout: html({ text: '<hr><h3>ℹ️ 关于 About</h3>' }),
    credits: html({
      text:
        'WallKit · 源码与文档 Source &amp; docs: github.com/mikoberry/wallkit' +
        '<br/><h6>测试页，非发布壁纸。Testbed, not a published wallpaper.</h6>',
    }),
  },
}
