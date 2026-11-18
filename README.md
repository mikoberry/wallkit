# WallKit

Reusable control overlays for Wallpaper Engine web wallpapers.

Clocks, audio spectrums, album cards, pointer effects and more, layered on top of a wallpaper background. WallKit does **not** render the background and does **not** collect audio or media data.

[中文文档](./README.zh-CN.md) · [Changelog](./CHANGELOG.md)

---

## Scope

```
Background layer (Spine / Live2D / video …)   ← implemented in each game repo
Shell layer (WE integration, deploy scripts)  ← built in each game repo
Control overlay (Clock / Spectrum / …)        ← WallKit
Data collection (audio frames, media info)    ← built by each project
```

**Rendering only.** Components take pure data props. They do not read global state and do not know what the background is.

### Out of scope

- Spine / Live2D / WebGL background rendering
- Audio and media data collection
- Settings drawers, internationalization
- General browser support for every widget (a browser cannot read system audio or media info; `PointerFx` and `Spotlight` only need pointer events and work in a browser, but the library does not provide browser fallbacks for the other widgets)
- npm publishing

---

## Usage

WallKit is distributed through a GitHub git reference; it is not published on npm.

```json
{
  "dependencies": {
    "wallkit": "github:mikoberry/wallkit#<commit-sha>"
  }
}
```

Pinning `<commit-sha>` pins the behavior. See [CHANGELOG.md](./CHANGELOG.md) for what changed in each commit.

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

  return <Clock now={now} />
}
```

Data is built by the caller. When there is no data, a component renders nothing — **no fake data fallback**.

`labels` only carries **text that needs localization**; every field is optional:

| Field | Purpose |
|---|---|
| `locale` | Passed to `Intl` for month names and date formatting (default `en-GB`) |
| `weekday` | Weekday text; overrides the `Intl` result |
| `dateWithWeekday` | Whole "date + weekday" line; overrides the component's own concatenation |
| `aria` | Accessible name |

Date text is produced internally by `formatClockDateParts(now, locale)`; **there is no `date` or `dateFormat` field**. Formatting is delegated to `Intl`; pass `dateWithWeekday` for full control.

### Common configuration

```jsx
// Placement: card | bar | minimal | cyberpunk | infobar | split | poster | ring | segments | stamp
<Clock now={now} placement="minimal" />
<Clock now={now} placement="ring" />      // Ring progress: outer = day, inner = hour
<Clock now={now} placement="segments" />  // Three segment bars: hours / minutes / seconds
<Clock now={now} placement="stamp" />     // Log card: date + day of year + week

// Theme: dark = dark text (for light wallpapers), light = light text (for dark wallpapers)
<Clock now={now} theme="light" />

// Position: pick an anchor first, then offset inwards from it. 0 = flush to the corner;
// offsets can also be CSS lengths.
<Clock now={now} anchor="top-right" offsetX={4} offsetY={4} />
<Clock now={now} anchor="top-left" offsetX="100px" offsetY="100px" />
<Clock now={now} anchor="bottom-left" size={120} />   // default anchor

// Pointer tilt: false disables it, or pass an object to tune it
<Clock now={now} tilt={false} />
<Clock now={now} tilt={{ maxTilt: 25, speed: 4 }} />

// Audio response: `beat` is a 0..1 value computed by the caller
<Clock now={now} beat={bass} beatIntensity={150} beatCurve={1.2} />
```

| Option | Default | Description |
|---|---|---|
| `now` | — | **Required.** A `Date`, driven by the caller; the component owns no timer |
| `visible` | `true` | `false` renders no DOM (and stops the tilt rAF) |
| `placement` | `'card'` | One of 10 layouts; invalid values fall back to `card` |
| `theme` | `'dark'` | `dark` = dark text (light wallpaper), `light` = light text. Match the wallpaper background |
| `color` | — | `#rrggbb`; overrides the main text color (wins over `theme`); dim/light text derived from it. **Layout accent colors are intentionally independent** (`ring` / `segments` progress fill, `stamp` ticks, `cyberpunk` neon title). To match or replace them, set CSS variables on a wrapper (`--wallkit-clock-seg-accent`, `--wallkit-clock-ring-accent`, `--wallkit-clock-stamp-accent`, `--wallkit-clock-cyber-accent`); they inherit into the component |
| `use24Hour` | `true` | 12 / 24-hour clock |
| `size` | `100` | Size percentage, 40–400 |
| `anchor` | `'bottom-left'` | Anchor point: four corners + four edge midpoints + center (9 total); see "Anchors and offsets" below |
| `offsetX` / `offsetY` | `0` | Offset **inwards** from the anchor. Number = percentage of the viewport; string = any CSS length (`'100px'`). 0 is fully flush |
| `beat` | `0` | Audio beat 0..1, computed by the caller. The component eases it per frame, so raw values are fine |
| `beatIntensity` | `100` | Overall amplitude of the audio response, 0–1000 |
| `beatCurve` | `0.62` | Response curve, 0.2–2. Lower is flatter, higher is sharper |
| `tilt` | `true` | `false` disables; `{ maxTilt, speed }` tunes it; `maxTilt: 0` also disables |
| `labels` | `{}` | `{ locale, weekday, dateWithWeekday, aria }`, see above |
| `onToggleHourFormat` | — | Optional callback, receives `'12'` or `'24'` |

**Anchors and offsets**: the three floating widgets (`Clock` / `Spectrum` / `AlbumArt`) share one positioning model. `anchor` means **two points coincide**: a point on the viewport and the same named point on the widget. `top-left` pins the widget's top-left corner to the viewport's; `center-left` pins the widget's left-middle to the viewport's; `center` aligns the two centers — so two differently sized widgets with the same `anchor` and `offsetX` are necessarily concentric.

```
top-left    top-center    top-right
center-left    center     center-right
bottom-left bottom-center bottom-right
```

`offsetX` / `offsetY` are measured inwards from the anchor: numbers are viewport percentages, strings are any CSS length (`'100px'`). `0` always means fully flush, so moving a widget from the left edge to the right does not require flipping the sign. On the centered axis the offset is a **signed displacement** (positive = right / down); that is the only direction where negatives are normally useful. Negative offsets are always allowed, e.g. to bleed a widget off-screen. `ANCHORS` is exported from `wallkit/core` in row order, ready for a 3×3 picker.

This combination expresses three common geometries:

```jsx
// Full-width, bottom-docked: the viewport owns the width, the height is fixed
<Spectrum bars={bars} anchor="bottom-center" width="100vw" height="14vh" />

// Fixed pixel distance from a corner: use a CSS length as the offset
<Clock now={now} anchor="top-left" offsetX="100px" offsetY="100px" />

// Concentric: same anchor, independent absolute sizes
// (vinyl has its own ring spectrum, so use a classic disc + a separate floating ring)
<AlbumArt track={track} anchor="center" offsetX={-30} size="34vh" />
<Spectrum bars={bars} variant="ring" anchor="center" offsetX={-30} width="46vh" height="46vh" />
```

### Spectrum

```jsx
import { Spectrum } from 'wallkit/components/spectrum'
import { extractSpectrumBars } from 'wallkit/core'

// Raw 128-frame array (0..1) → 128 bars; null when there is no data
const bars = frame ? extractSpectrumBars(frame) : null

<Spectrum bars={bars} variant="mirror" colorHex="#7dd3fc" size={100} />
```

| Option | Default | Description |
|---|---|---|
| `bars` | — | **Required.** `Float32Array \| number[]`, values 0..1. **Length = bar count** (128 by convention); `null` renders nothing |
| `visible` | `true` | `false` renders no DOM and starts no draw loop |
| `variant` | `'bars'` | `bars` / `mirror` / `curve` / `pill` / `ring` / `ringwave` / `dots` / `ripples` / `aurora` |
| `colorHex` | — | Accepts `#rrggbb` only; falls back to `--wallkit-accent`, then `#a8c4ff` |
| `size` | `100` | 20–500. 100 = normal size (base bar box `30vw × 15vh`); scales both axes |
| `width` / `height` | — | Exact box override, wins over `size` and variant rules. Number = px, string = any CSS length. Supply both for "full-width, fixed-thickness" |
| `anchor` | `'bottom-left'` | Same 9 anchors as `Clock` |
| `offsetX` / `offsetY` | `0` | Inwards from the anchor, 0 = fully flush; CSS lengths accepted |
| `intensity` | `100` | 0–1000. 100 = original bar height |
| `curve` | `1` | 0.2–2. Response curve exponent |
| `paused` | `false` | `true` freezes the image (cancels rAF) but keeps the widget on screen |

**Box rules fall into two groups**: bar styles (`bars` / `mirror` / `curve` / `pill` / `dots`) use a wide `30vw × 15vh` box; radial styles (`ring` / `ringwave` / `ripples` / `aurora`) force a square `min(30vw, 28vh)` to stay circular — so at the same `size`, radial styles cover a smaller area by design. `intensity` / `curve` are applied once at the draw entry, so all nine styles behave consistently; radial styles also have time-based rotation / ripple / aurora animation (frozen under `prefers-reduced-motion`, with level response kept).

**The component does not decide the bar count**: to draw fewer/more bars, call `resampleBars(bars, count)` before passing them in. All nine styles follow this rule, including `aurora` — each bar is one glow, so 128 bars are 128 thin rays and only 7 bars produce a few broad bands. `dots` is the exception: it folds itself into 6–48 columns based on canvas width.

`visible` vs `paused`: the former renders nothing, the latter keeps the image but freezes it; both stop the draw loop.

### MiniSpectrum

A spectrum that fills its parent, with **no size or position props** — the box comes from the parent, so it can be embedded in a card. It shares the draw loop and renderer with `Spectrum` (`components/shared/`) and is pixel-identical; only the box source differs.

```jsx
import { MiniSpectrum } from 'wallkit/components/mini-spectrum'

<div style={{ height: 120 }}>
  <MiniSpectrum bars={bars} variant="curve" />
</div>
```

| Option | Default | Description |
|---|---|---|
| `bars` | — | **Required.** Same as `Spectrum`; `null` renders nothing |
| `variant` | `'bars'` | Same nine styles as `Spectrum` |
| `colorHex` | — | Same as `Spectrum` |
| `barCount` | `32` | Fold to this many bars. At small sizes 128 bars become thin lines; pass `bars.length` to disable folding |
| `intensity` / `curve` | `100` / `1` | Same as `Spectrum` |
| `ringBase` | — | `ring` / `ringwave` only: empty center as a fraction of the radius (0.05–0.98). Larger pushes bars towards the edge — this is how the album card's ring sits outside the record, with a gap. Omitted = renderer default `0.46` |
| `ringSpin` | `true` | `ring` / `ringwave` only: whether the ring rotates. Pass `false` when the parent already animates, or the two speeds fight |
| `visible` / `paused` | `true` / `false` | Same as `Spectrum` |

> The parent must have a definite height; otherwise `height: 100%` collapses to 0.

### AlbumArt

```jsx
import { AlbumArt } from 'wallkit/components/album-art'

<AlbumArt
  track={track}        // { title, artist, albumTitle, thumbnail, primaryColor, playback }
  bars={bars}          // optional embedded spectrum
  variant="classic"    // classic | glass | vinyl | minimal | type | bar | cassette | polaroid | cd | poster | ticket
  theme="light"        // light = light text (dark wallpaper), dark = dark text (light wallpaper)
  labels={{ aria: 'Now playing' }}
/>
```

| Option | Default | Description |
|---|---|---|
| `track` | — | **Required.** `null` renders nothing |
| `bars` | — | Optional. Without it the card still renders, just without a spectrum; layouts with a reserved slot (`bar` / `cassette` / `polaroid` / `ticket`) drop the slot, and `poster` drops its equalizer area |
| `spectrum` | By layout | Whether to draw the embedded spectrum. Omitted follows the layout: `vinyl` defaults to `false` (clean disc), all others to `true`. Pass `true` to restore the vinyl ring, `false` to silence any layout |
| `variant` | `'classic'` | 11 layouts; `type` renders no cover; with a spectrum on, `vinyl`'s ring extends beyond `size`. See `ALBUM_ART_VARIANTS` |
| `theme` | `'light'` | Same convention as `Clock`: the name describes the **text** color. `'dark'` also flips self-drawn surfaces (frosted glass, pills, record label) to light and darkens the default accent. Paper styles (cassette label / polaroid / ticket) use fixed dark ink, posters fixed light ink, and do not flip |
| `colorHex` | — | **Embedded spectrum only**; the card's main color comes from `track.primaryColor`. Default `--wallkit-accent` |
| `size` | `100` | Number: 20–300 (`ALBUM_ART_SIZE_MIN/MAX`), 100 = normal (base cover diameter `18vh`). String: absolute cover diameter (`'34vh'`), and the whole card derives from it |
| `anchor` | `'bottom-left'` | Same as Clock / Spectrum, 9 anchors |
| `offsetX` / `offsetY` | `0` | Inwards from the anchor, 0 = fully flush; CSS lengths accepted |
| `paused` | `false` | Stops cover rotation and freezes the spectrum |
| `labels` | `{}` | `{ aria, coverAlt }`. `coverAlt` is used verbatim (`''` means decorative), otherwise it falls back to track and album names |

The embedded spectrum's intensity and curve are **internal constants** (130 / 0.7), not props: they are tuned for a card, and exposing them would only break that. Use `MiniSpectrum` directly to tweak the response.

**Two ways to render nothing**: `track == null` renders nothing; `track.playback === 'stopped'` also renders nothing. `playback === null` means **unknown** and is treated as playing — the engine only pushes on track changes, so treating unknown as stopped would hide the cover permanently.

Each layout binds a spectrum style: classic→bars, glass→curve, vinyl→ring, minimal→bars, type→dots, bar→curve, cassette→bars, polaroid→dots, cd→curve, poster→bars, ticket→bars. **`vinyl` is the only layout that skips the spectrum by default** (omitting `spectrum` gives a clean record); pass `spectrum` explicitly for the ring, or `spectrum={false}` on any layout to silence it. Vinyl's `ring` is a row of **bars growing outwards from the disc edge**: a gap of `0.03 ×` the diameter (about 9px at 300px, kept even at rest) separates the bar bases from the edge, and tips reach at most `0.22 ×` the diameter, so travel is about `0.19 ×` the diameter. The bar count is fixed at 128 (`VINYL_RING_BARS`) — the full frequency range; 32 bars are fine in a straight strip but become a sparse fence around a circle (the canvas is still 1.44× the record). The overlay bleeds 22% on every side, so with a spectrum on, this layout's **visual footprint is larger than `size`** — the record and anchor are unchanged, only the drawing leaves the box; an edge anchor (`offsetX/Y = 0`) will clip the bar tips. The ring is a child of the record element, inheriting its 24s rotation and pause, so its own spin is disabled (`ringSpin={false}`). `type` is pure typography: no cover at all, only a vertical line in the cover's primary color (`track.primaryColor`) and a faint row of spectrum dots at the bottom; the card height follows its content. The cover rotates once every 24s and stops under `prefers-reduced-motion`.

### PointerFx

Pointer trails and click effects merged into one overlay, sharing a canvas and an **on-demand** rAF loop. The parent decides both the size and the origin of pointer coordinates.

```jsx
import { PointerFx } from 'wallkit/components/pointer-fx'

// In a wallpaper: make the positioning context fill the viewport
<div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
  <PointerFx trailVariant="glow" clickVariant="ripple" />
</div>

// Busier: rising bubble trail + firework clicks (both on the same canvas)
<PointerFx trailVariant="bubble" clickVariant="firework" />

// The reverse works too: bubbles and fireworks are valid on both channels
<PointerFx trailVariant="firework" clickVariant="bubble" />

// Fine trail, loud clicks: size each channel separately
<PointerFx trailVariant="bubble" clickVariant="firework" trailSize={60} clickSize={180} />
```

| Option | Default | Description |
|---|---|---|
| `visible` | `true` | `false` renders no DOM |
| `trail` / `click` | `true` | Toggle trail and click effects independently |
| `trailVariant` | `'glow'` | `glow` soft particles / `ribbon` ribbon trail / `bubble` small rising, swaying clusters / `firework` one small firework every 4 samples (sparse and light) |
| `clickVariant` | `'ripple'` | `ripple` click ripple / `sparks` sparks / `bubble` fuller rising cluster / `firework` center flash + 20 radial embers with gravity / `heart` a small cluster of rising hearts (click only) |
| `colorHex` | — | `#rrggbb`; falls back to `--wallkit-accent`, then `#a8c4ff` |
| `size` | `100` | 20–300, shared default for trail and click; scales radius, displacement and line width |
| `trailSize` | inherits `size` | 20–300, trail channel only; omitted / `null` / invalid falls back to `size` |
| `clickSize` | inherits `size` | 20–300, click channel only; omitted / `null` / invalid falls back to `size` |
| `intensity` | `100` | 0–300, opacity percentage (shared by both channels) |
| `paused` | `false` | Freezes the image, discards new events, stops the draw loop |

**It differs from the other widgets in one way**: this is the only control that collects its own input — it listens to `pointermove` / `pointerdown` on `window`, the same precedent as `Clock`'s tilt following (the wallpaper canvas owns pointer events). Coordinates are mapped to the overlay's own box; events outside it are ignored, so multiple instances on one page do not interfere. It **does not read `window.wallpaper*`**, does not inspect the background, and **never generates fake trails**.

**`bubble` and `firework` work on both channels**: `trailVariant` takes four values and `clickVariant` five (adding `heart`), giving 20 combinations. There is still only one rendering path — `paintBubbles()` / `paintFirework()` take "origin + seed + normalized progress + preset"; each channel walks its own buffer and calls them, differing only in density, size and lifetime. Trails sample every 1.2px, so each sample emits 2 bubbles or one firework every 4 slots with 8 embers; a click is a single event, emitting 7 bubbles or a 20-ember firework with a hot core. `heart` is click-only: a few hearts rise, drift apart, sway and fade; they are drawn from two mirrored cubic Bézier curves (no emoji glyph, so canvas can tint them).

High-frequency samples go into a preallocated ring buffer; the loop only runs while something is alive and **causes no React re-renders**. Neither particle form stores an array: every sample carries a seed, and `pointerBubble()` / `pointerFireworkSpark()` / `pointerHeart()` recompute the same particles each frame from `(seed, index)`. `pointerLife(channel, variant, reduced)` centralizes all lifetimes and drives both animation and the `alive` check. Fireworks use `globalCompositeOperation = 'lighter'` so overlapping light adds up instead of graying out, and `pointerFall()` adds quadratic descent.

**The channels have separate sizes**: `size` is the shared default; `trailSize` / `clickSize` override one channel each (`trailSize ?? size`, `clickSize ?? size`, all clamped to 20–300). `pointerSizeScale(value, fallback)` in `core` resolves them into `trailScale` / `clickScale` in the draw settings; `drawTrail` reads only `trailScale`, `drawBursts` only `clickScale`, and shared paint functions take a numeric `scale` rather than the whole settings object, so no rendering code is duplicated per channel. Size only multiplies radius, displacement and line width — **not** the overlay box, the 1.2px sampling density or lifetimes.

Under `prefers-reduced-motion` the trail is disabled and clicks degrade to a short static ring (all click variants).

> **WE note**: Wallpaper Engine desktop wallpapers do not deliver mouse events by default ("there is no mouse and keyboard focus in WE", as recorded in `AGENTS.md`). With no events the canvas stays blank, which is correct. To see the effect in a real wallpaper, enable mouse interaction for it in WE; the browser and WE preview window work directly. For this reason the `wallpaper.html` test page **does not** mount this component — it rotates layouts every 8 seconds and has no mouse to click anyway.

The overlay is `position: absolute; inset: 0; pointer-events: none` and has **no** `anchor` / `offsetX` / `offsetY` — it fills its positioning context and the parent decides where it is (`size` / `trailSize` / `clickSize` only scale strokes). The parent needs a definite size and a positioning context. Local `z-index: 4`; raise the parent to place it above other widgets.

### AmbientFx

A full-screen ambient particle layer: snow, sakura petals, rising bubbles, steam, rain, fog, falling leaves and stardust. Like `PointerFx`, it fills the positioning context and has **no** `anchor` / `offsetX` / `offsetY`.

```jsx
import { AmbientFx } from 'wallkit/components/ambient-fx'

<div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
  <AmbientFx variant="snow" />          {/* falling snow */}
  <AmbientFx variant="sakura" />        {/* cherry petals */}
  <AmbientFx variant="bubble" />        {/* rising bubbles, following the theme accent */}
  <AmbientFx variant="steam" />         {/* steam: the vertical twin of fog */}
  <AmbientFx variant="rain" />          {/* fast, fine rain, slanted by wind */}
  <AmbientFx variant="fog" />           {/* broad, thin mist drifting sideways */}
  <AmbientFx variant="leaves" />        {/* tumbling leaves with per-leaf spin */}
  <AmbientFx variant="stars" />         {/* starry sky: twinkle only, no falling */}
  <Clock now={now} />                  {/* widgets sit above this layer */}
</div>
```

| Option | Default | Description |
|---|---|---|
| `variant` | `'snow'` | `snow` steady fall + narrow sway / `sakura` wind offset, wide sway, per-petal spin / `bubble` steady rise + slight sway / `steam` fog's vertical twin: big soft plumes rising slowly / `rain` fast fine streaks, slanted together by wind / `fog` broad thin mist drifting sideways / `leaves` falling at an angle, zig-zag tumble, per-leaf spin / `stars` fixed points that only twinkle. Invalid values fall back to `snow` |
| `visible` | `true` | `false` renders no DOM and leaves no canvas |
| `colorHex` | — | `#rrggbb`. Every form except `bubble` has its own fixed color (snow `#dbe9ff` / sakura `#f5b8cd` / steam `#eef1f4` / rain `#a8c0dc` / fog `#dfe6ee` / leaves `#d98a4f` / stars `#e8efff`); only `bubble` falls back to `--wallkit-accent` |
| `density` | `100` | 10–300, particle count as a percentage of the preset; changes count only, not size |
| `size` | `100` | 20–300, particle radius scale |
| `intensity` | `100` | 0–300, opacity percentage |
| `speed` | `100` | 20–300, motion speed. Scales the whole layer clock: displacement, sway and lifetime together; `stars` has no displacement, so only twinkling speeds up |
| `paused` | `false` | Freezes the image and stops the loop, leaving the last frame on screen |

**`stars` is a starry sky, not falling particles**: points are pinned to the picture and only their brightness changes (two incommensurable sine waves squared, so an occasional flash rather than a whole-sky breathe); `speed` only speeds up the twinkle, `density` defaults to 200 with a hard cap of 240. Stars use additive blending, so they only add light and never darken the wallpaper; larger stars are brighter too, to avoid a field of gray blobs. Best on dark backgrounds.

```jsx
<AmbientFx variant="stars" density={160} intensity={130} />   {/* denser night sky */}
<AmbientFx variant="stars" speed={40} />                      {/* nearly still, slow twinkle */}
```

**Light / heavy rain (or snow) needs no new variant** — combine the existing knobs:

```jsx
<AmbientFx variant="rain" density={45} size={75} intensity={60} speed={70} />   {/* drizzle: sparse, short, faint, slow */}
<AmbientFx variant="rain" />                                                    {/* moderate rain: default */}
<AmbientFx variant="rain" density={250} intensity={150} speed={160} />          {/* downpour */}
```

**This layer collects nothing**: no pointer listeners, no audio, no host callbacks. Particle positions are pure functions of `(parameters, time)`, so each frame is recomputed from one fixed parameter table — **no particle array** (`fillAmbientParticles()` in `core/ambient.js` writes once; the draw loop only reads).

Three practical consequences: `paused` just stops advancing time, so resuming continues from the same place without a jump; after a resize the next frame maps correctly (positions are normalized, no stored pixels); and a run of many hours has no state drift. Each particle has a different fall duration, so there is no mechanical "row of snow landing together" look.

**Soft edges are not computed in the draw loop**: `shadowBlur` and per-frame gradients are too costly at 60fps for hours, so each form is pre-rendered once into a 64px offscreen sprite (`sprites.js`); drawing is only `drawImage` + rotation (sakura uses `setTransform`, skipping per-petal `save` / `restore`).

Under `prefers-reduced-motion` a single static frame is drawn and nothing moves.

`z-index: 1`, **below all widgets** (layer order: ambient 1 → light 2 → spectrum 3 → pointer/burst 4 → clock / album 5 → spotlight 6 → frame 7), so snow passes behind the clock and text stays readable. **Do not stack this layer when the background already has particles** — WE's editor has its own particle layer, and two out-of-sync snows look worse than none; visibility is the application's decision, use `visible` to turn it off.

### Spotlight

A pointer-following spotlight / lights-out effect: a bright circle follows the mouse and darkens everything outside it. Like `PointerFx` / `AmbientFx`, it fills the positioning context and has **no** `anchor` / `offsetX` / `offsetY`.

```jsx
import { Spotlight } from 'wallkit/components/spotlight'

<Spotlight />                                      {/* default: 420px circle, soft edge, 72% dim outside */}
<Spotlight size={240} feather={0.1} />             {/* small spot, nearly hard edge */}
<Spotlight dim={0.92} glow={0.35} />               {/* almost black, only the ring is lit */}
<Spotlight darkColor="#0b1020" lightColor="#ffd9a0" />  {/* night mask + warm light */}
<Spotlight smoothing={0} />                        {/* snap to each event, no rAF at all */}
```

| prop | Default | Description |
|---|---|---|
| `size` | `420` | Circle diameter in px, 80–3000 |
| `feather` | `0.45` | Edge softness as a fraction of the radius, 0–1; `0` hard edge, `1` a transition as wide as the circle |
| `dim` | `0.72` | Darkness outside the circle, 0–1 |
| `glow` | `0.22` | Highlight inside the circle, 0–1; `screen` blend, brightens only, and the highlight layer is skipped at `0` |
| `darkColor` | `'#000000'` | Dark color (`#rrggbb`) |
| `lightColor` | `'#ffffff'` | Highlight color (`#rrggbb`) |
| `smoothing` | `0.05` | Follow lag as a time constant in seconds, 0–0.5; `0` snaps per event |
| `visible` | `true` | `false` renders no DOM |
| `paused` | `false` | Freezes the image and stops listening to the pointer |

**The whole layer is two CSS radial gradients — no canvas, no draw loop.** Pointer moves only rewrite `--wallkit-spotlight-x` / `-y` (percentages, so resizing keeps the circle in place) with zero React re-renders; at `smoothing: 0` no rAF is opened.

**The mask stays fully transparent until the first pointer event**: WE desktop wallpapers do not deliver mouse events by default, and starting fully dark would black out the wallpaper. There is no synthetic cursor "simulating" this — same principle as `PointerFx`. To see it in a real wallpaper, enable mouse interaction in WE; browser / preview window works directly.

`z-index: 6`, **above all widgets** (ambient 1 → light 2 → spectrum 3 → pointer/burst 4 → clock / album 5 → spotlight 6 → frame 7): the point of a mask is to darken what is below. To keep the clock always lit, lower this value in your own stylesheet.

### Frame

A REC-camera viewfinder: corner brackets / thin full frame / wing rails / film perforations, with optional rule-of-thirds grid, tick scale, red record dot, corner readouts and timecode.

It decorates **the whole picture**, fills the positioning context, and therefore has **no** `anchor` / `offsetX` / `offsetY` — and **no children**: do not wrap a widget in it (to add corner accents to a card, write two `border` lines in your app).

```jsx
import { Frame, formatTimecode } from 'wallkit/components/frame'

<Frame />                                     {/* default: corner brackets, inset 28 */}
<Frame variant="frame" grid="thirds" />       {/* thin frame + dashed safe area + thirds grid */}
<Frame variant="bracket" ticks />             {/* upper/lower wing rails + bottom tick scale */}
<Frame variant="film" theme="light" />        {/* film perforations; light lines on a dark wallpaper */}

<Frame
  rec="REC"
  timecode={formatTimecode(elapsed)}
  labels={{ tl: 'cam a', tr: '35mm', bl: 'iso 800', br: '2026-11-15' }}
/>
```

`rec="REC"`'s dot and text, `timecode` and the four `labels` are all optional: `rec="REC"` alone draws just the dot and text; timecode content is entirely computed by the caller (the component owns no timer); missing corners stay empty.

| prop | Default | Description |
|---|---|---|
| `variant` | `'corners'` | `corners` / `frame` / `bracket` / `film`; invalid values fall back to `corners` |
| `inset` | `28` | Distance from the frame lines to the picture edge, px, 0–240 |
| `thickness` | `1.5` | Line width, px, 0.5–8. Not 1 by default: at WE's desktop DPR a 1px line blurs into gray |
| `length` | `56` | Bracket arm length, px, 0–240; unused by `frame` / `film` |
| `size` | `1` | Global multiplier applied to `inset` / `thickness` / `length` and font size, 0.5–3 |
| `color` | — | `#rrggbb` line color override, wins over `theme` |
| `grid` | `'none'` | `'none'` / `'thirds'` / `'cross'`; `true` means `thirds` |
| `ticks` | `false` | Bottom tick scale |
| `rec` | `false` | `true` draws only the red dot; a string adds that text (e.g. `rec="REC"`) |
| `timecode` | `''` | Preformatted string; empty hides it |
| `labels` | — | `{ tl, tr, bl, br }`, individual strings; empty entries are skipped |
| `theme` | `'dark'` | Same meaning as `Clock`: `'light'` = light lines (dark wallpaper), `'dark'` = dark lines |
| `visible` | `true` | `false` renders no DOM |
| `paused` | `false` | Freezes the record dot's blink |

**The component does not run a timecode clock**: `timecode` takes a finished string, and `formatTimecode(seconds, fps = 24)` only formats seconds as `HH:MM:SS:FF`. When WE pauses the wallpaper, readout and blink stop together — another reason the component owns no timer.

**Variants only decide "how the border is drawn"**; grid / ticks / record dot / readouts are orthogonal switches. `rec` and `timecode` each claim a corner, and a `labels` entry at the same position automatically moves down a line.

`z-index: 7`, **one layer above `Spotlight`'s 6**: framing lines and readouts are instruments over the picture and should not vanish with the exposure mask. To have the spotlight dim the frame too, lower this value in your own stylesheet.

### LightFx

Weather lighting over the whole picture: sunny, moonlight, dusk, overcast, or a hard midday sun with lens flare. Like the other effect layers it fills the positioning context, with **no** `anchor` / `offsetX` / `offsetY` in the widget sense — here `anchor` places the **light source point**.

```jsx
import { LightFx } from 'wallkit/components/light-fx'

<LightFx variant="sun" />                                  {/* warm midday sun, top-left */}
<LightFx variant="moon" intensity={70} />                   {/* dimmer moonlight */}
<LightFx variant="dusk" anchor="top-right" sway={0} />     {/* low sun, no shaft lean */}
<LightFx variant="overcast" rays={0} />                    {/* flat cool wash, no shafts */}
<LightFx variant="clear-sky" flare={0.8} />                {/* blown-out disc + lens-flare chain */}
<LightFx variant="sun" smoothing={0.12} follow={0.45} />  {/* tune pointer following */}
```

| prop | Default | Description |
|---|---|---|
| `variant` | `'sun'` | `sun` warm wash + distinct shafts / `moon` cool, dim, soft / `dusk` low orange sun raking across the frame / `overcast` huge flat cool wash, no shafts / `clear-sky` hard white disc + lens ghosts and aperture rings |
| `anchor` | `'top-left'` | Where the light comes from: one of nine anchors. It places the **light center**, not a box corner, and is also what the base shaft direction is derived from, so no second prop can contradict it. Offsets grow inwards just like a widget's |
| `offsetX` / `offsetY` | `0` | Distance from the anchor point towards the interior. Negative pushes the source out of frame, which is legal — a window just out of shot |
| `intensity` | `100` | Brightness of the whole light as a percentage of the preset's alphas. One gain over wash + hotspot + shafts + flare. **No upper bound** (alphas saturate on their own); a negative value means no light |
| `size` | preset | Radius of the wide wash in px, any positive number; omitted uses the preset (sun 1400 / moon 1100 / dusk 1750 / overcast 2400). A non-positive or non-finite value falls back to the preset rather than being clamped: an invalid CSS radius silently drops the whole `background-image` |
| `rays` | `1` | 0–1, share of the light that becomes shafts rather than a flat pool — a **ratio, not brightness**. `0` is flat light; `overcast` has no shafts to scale. Use `intensity` to dim |
| `flare` | `1` | 0–1, multiplier on the lens-flare chain. `0` removes it; variants without a flare ignore this. Same axis as `rays`: a share of the effect, also scaled by `intensity` |
| `follow` | `0.45` | 0–1, how far the light travels towards the pointer. `0` pins it to the anchor |
| `smoothing` | `0.12` | Follow lag as a time constant in seconds. `0` snaps per event; no upper bound (a slow two-second drag is a legitimate look), negative also means no lag |
| `sway` | `16` | Degrees the shaft fan may lean while the light moves. `0` keeps shafts parallel to the anchor-derived direction; negative leans the other way; large values approach aiming at the frame center. Direction is always derived from the light's actual position, and variants without shafts (`overcast`) ignore it |
| `colorHex` | — | `#rrggbb` override of the light color; the hotspot stays a pale version of it |
| `visible` | `true` | `false` renders no DOM |
| `paused` | `false` | Keeps the current frame and stops listening to the pointer |

**It is visible from the first frame, unlike `Spotlight`.** A wallpaper with no pointer input still has weather, so the light rests at the anchor and simply stops following; follow is an enhancement, not a prerequisite. A spotlight without a pointer would be a black screen, so it hides. The light never drops below the horizon: the pointer's y is clamped to the top band (`LIGHT_ORIGIN_MAX_Y`) before mixing by `follow`, or dragging to the bottom would light the picture from below like a floor lamp.

**Three custom properties, no canvas and no gradient string rebuilds**: moving the light rewrites `--wallkit-light-x` / `-y` / `-angle`; the gradient strings already reference them. At `smoothing: 0` the write happens right in the event handler. The fan is not merely dragged — `lightBeamSway()` leans it towards the frame center from the light's position, capped by `sway`, so translation reads as a distant source rather than a sliding decal. Beam direction is derived from the anchor (with the preset's `angleOffset`, e.g. dusk −20°), never specified by a separate angle prop.

**Parameter domains**: `rays` / `flare` / `follow` are clamped to 0–1 (a share cannot exceed the whole); `intensity` / `smoothing` have no upper bound and `sway` is signed; `size` has no ceiling. The `LIGHT_*_MIN/MAX` constants are only recommended **playground slider ranges**, not component limits — leave limiting to the caller. The one hard rule is invalid-value fallback, because negative / NaN gradient radii silently kill the whole layer.

Shafts are **masked** (unmasked, the cone converges into a star-filter artifact); if `mask-image` is unsupported the layer is not drawn at all. `z-index: 2`, above ambient particles and below widgets (ambient 1 → light 2 → spectrum 3 → pointer/burst 4 → clock / album 5 → spotlight 6 → frame 7). `clear-sky`'s `disc` and `flare` are bound to that preset, not exposed as cross-cutting toggles: a soft light with aperture rings makes no sense.

### BurstFx

One-shot burst effects fired by command: confetti, water spray and yogurt. This is the third kind of effect layer and the **only component with an imperative API**. `AmbientFx` collects nothing and loops forever; `PointerFx` samples pointer events; `BurstFx` plays a finite effect each time the host explicitly fires a command — no command, no effect, no loop. The parent supplies the positioning context and size; like the other effect layers there is no `anchor` / `offsetX` / `offsetY`.

```jsx
import { BurstFx } from 'wallkit/components/burst-fx'

const fx = useRef(null)

<BurstFx ref={fx} />

// App layer fires a command when a project.json switch is toggled:
fx.current.burst('confetti')
fx.current.burst('spray', { x: 0.5, y: 0.2, angle: -Math.PI / 4 })
fx.current.burst('yogurt', { x: 0.3, y: 0.1, count: 80 })
```

`burst(kind, opts)`:

| Field | Description |
|---|---|
| `kind` | `confetti` rainbow streamers / `spray` fan of droplets with trails / `yogurt` thick blobs with strings, heavier and faster to the ground |
| `opts.x` / `opts.y` | 0–1 normalized origin within the overlay |
| `opts.angle` | Launch angle in radians; omitted uses the kind's preset |
| `opts.size` | 20–300% scale |
| `opts.intensity` | 0–300% launch force |
| `opts.count` | 4–400 particles |
| `opts.speed` | 20–300% motion pace |

Every `opts` field is optional and falls back to the component prop or the kind's preset, so one fire can change just what it needs without affecting others. Defaults: 90 confetti pieces / 110 droplets / 60 blobs, with lifetimes 2.4s / 1.6s / 1.9s (shortened under `prefers-reduced-motion`).

| prop | Default | Description |
|---|---|---|
| `colorHex` | — | `#rrggbb`; recolors spray and forces confetti to a single tint. By default spray uses `--wallkit-accent` (or `#7fc8f0`) and confetti uses its built-in 7-color rainbow; yogurt is creamy `#f6efe0` |
| `size` | `100` | Default scale percentage (20–300) for fires that do not override it |
| `intensity` | `100` | Default launch-force percentage (0–300), **not opacity**: it sets initial velocity and therefore reach, peak height and (for spray) how the water column breaks up. Higher force keeps the column together longer before it breaks into droplets |
| `speed` | `100` | Default motion-pace percentage (20–300) |
| `visible` | `true` | `false` renders no DOM |
| `paused` | `false` | Freezes the canvas, drops new commands and stops the loop |

Each command pushes one record into a preallocated ring buffer; particles are recomputed from `(seed, index)` every frame — **no particle array**, zero React re-renders. The loop starts on the first command and stops as soon as the last burst expires. While paused, `burst()` returns immediately and the loop is torn down; on resume, stale records are cleared first. Overlay `z-index: 4`, level with `PointerFx`.

### WE integration (optional)

Adding the Vite plugin injects the WE listeners at the very start of `index.html`'s `<head>` (classic script, before the module entry):

```js
// vite.config.js
import { wallkitWE } from 'wallkit/we/vite'

export default defineConfig({
  plugins: [react(), wallkitWE()],  // audio + media + pause by default
  // plugins: [react(), wallkitWE({ timeline: true })],  // playback progress
})
```

On the React side, convenience hooks turn bridge data into props (the components themselves still only take props):

```jsx
import {
  useWallpaperAudio, useWallpaperBeat,
  useWallpaperMedia, useWallpaperPaused,
  useWallpaperProperties,
} from 'wallkit/we'

const bars = useWallpaperAudio()       // Float32Array: stable reference, mutated in place; all zeros with no data
const beat = useWallpaperBeat()        // 0..1, for Clock.beat
const paused = useWallpaperPaused()
const track = useWallpaperMedia(paused)
const props = useWallpaperProperties() // snapshot of user properties declared in project.json
```

User properties are a one-way push from `project.json` to the page, with no two-way binding: declare keys in `general.properties`, push them via `wallpaperPropertyListener.applyUserProperties` (all keys on load, then only changed keys), and read the snapshot with `useWallpaperProperties()`. Watch the units — `color` arrives as `0..1` floats (the manifest uses `0..255`), `file` / `directory` paths need `file:///`, and undeclared keys are `undefined`, not `false`.

`timeline` is off by default: WE officially warns that `wallpaperRegisterMediaTimelineListener` may never fire. Enable it explicitly if you need `useWallpaperTimeline()`; keep `null` when no value arrives, do not substitute `0:00`.

Projects not using Vite can paste the four (or five with timeline) inline scripts manually; see [WE integration guide](./docs/we-integration.md) §2.2. The shape of `project.json` remains the caller's responsibility; the library does not touch it. See the [`wallkit/we` design spec](./docs/we-design.md) for interface and wiring details.

### project.json generation (optional, build-time)

Three `project.json` mistakes fail silently: `supportsaudioprocessing` placed at the top level (zero audio callbacks), colors as `0..1` floats (displayed black), and forgetting to update the app layer after renaming a property. `wallkit/project` encodes the shape so only changing parts are written by hand:

```js
// project.config.js — in your own wallpaper repo
import { color, slider, bool } from 'wallkit/project'

export default {
  file: 'index.html',
  title: 'Your wallpaper name',
  description: ['What it is and what can be configured.', 'Homepage https://… · Source https://…'],
  properties: {
    accentColor: color({ text: 'Accent color', value: '#a8c4ff' }),
    sizeScale: slider({ text: 'Size scale', value: 1, min: 0, max: 2, fraction: true }),
    showSeconds: bool({ text: 'Show seconds', value: true }),
  },
}
```

```bash
node scripts/gen-project.mjs           # merge into public/project.json
node scripts/gen-project.mjs --check   # only report drift; exit 1 if out of date
npm run test:project                   # tool self-test (50 assertions, no WE needed)
```

This is a **manual step, not a build hook**: the editor rewrites this file wholesale, and a build-time overwrite would fight it. Merging always preserves `workshopid` / `version` / `snapshotformat` / `snapshotoverlay` — losing `workshopid` would publish a new Workshop entry instead of updating the existing one. Full rules and property constructors: [project.json tool](./docs/project-tool.md).

---

## Entry points

| Entry | Contents |
|---|---|
| `wallkit` | Root entry |
| `wallkit/core` | Environment detection, storage helpers, clock / audio pure functions, anchor constants, type conventions |
| `wallkit/components/clock` | Date and time widget |
| `wallkit/components/spectrum` | Standalone floating spectrum |
| `wallkit/components/mini-spectrum` | Parent-filling spectrum (for cards) |
| `wallkit/components/album-art` | Album card widget |
| `wallkit/components/pointer-fx` | Pointer trails + click effects overlay |
| `wallkit/components/ambient-fx` | Full-screen ambient particles (snow / sakura / bubbles / stars …) |
| `wallkit/components/spotlight` | Pointer-following spotlight mask (lit circle + dimmed outside) |
| `wallkit/components/frame` | Picture-level REC viewfinder (brackets / full frame / wings / perforations + grid, ticks, record dot, readouts) |
| `wallkit/components/light-fx` | Weather lighting layer (sun / moon / dusk / overcast / clear sky) |
| `wallkit/components/burst-fx` | Command-triggered one-shot burst effects (confetti / spray / yogurt) |
| `wallkit/we` | WE data hooks (audio / beat / media / timeline / paused / properties) |
| `wallkit/we/vite` | Vite plugin `wallkitWE()`, injects `<head>` listeners |
| `wallkit/project` | project.json generator (build-time pure functions, not in runtime) |
| `wallkit/styles` | Theme variables |

---

## Theming

Override CSS variables:

```css
:root {
  --wallkit-accent: #7dd3fc;
  --wallkit-text: #f8fafc;
  --wallkit-font: 'Noto Sans SC', system-ui, sans-serif;
}
```

---

## Documentation

Documentation is currently written in Chinese.

- [Architecture](./docs/architecture.md) — scope, layering, interface principles, phase plan
- [Spectrum design](./docs/spectrum-design.md) — spectrum interfaces, positioning and rendering
- [Frame design](./docs/frame-design.md) — the viewfinder's positioning contract, variants and layering trade-offs
- [WE integration guide](./docs/we-integration.md) — inline scripts, `project.json`, audio troubleshooting
- [Extraction map](./docs/extraction-map.md) — where migrated code came from in the original wallpaper project
- [project.json tool](./docs/project-tool.md) — property constructors and merge rules
- [WE design spec](./docs/we-design.md) — hook and bridge design

---

## Local preview

`playground/` is a standalone Vite project that imports source directly from `../src`, for viewing actual rendering.

```bash
cd playground
npm install
npm run dev          # http://localhost:5174/
```

There are ten galleries: **Clock** (10 layouts, light/dark themes, size scaling, synthetic beat), **Spectrum** (9 variants), **MiniSpectrum** (9 parent-filling styles), **AlbumArt** (6 card layouts, 3 synthetic tracks, 6 playback states), **PointerFx** (4 trails × 5 clicks; move the mouse into a cell for the trail, click for the burst), **AmbientFx** (8 particle forms), **Spotlight**, **Frame**, **LightFx** (with a prop × variant applicability table so a grayed-out slider tells you a variant has no such layer) and **BurstFx** (three command buttons in the hero plus one instance per cell). **Synthetic data exists only in the playground**; the library never invents data. PointerFx and BurstFx use your real pointer events / commands.

### Wallpaper Engine test page

Besides the galleries there is a **single page for WE**: four widgets on one screen, audio and media from real host callbacks, layouts rotating every 8 seconds with changing backgrounds (2 dark, 2 light, theme following the background), and a top-left HUD showing WE detection, audio frame age, media fields and pause state.

```bash
cd playground
npm run dev                    # browser preview: http://localhost:5174/wallpaper.html
npm run build:wallpaper        # dist-wallpaper/, including project.json
npm run deploy:wallpaper       # build and sync directly to the WE project directory
```

The same build also contains **`layout.html`** (geometry verification): it shows a full-width bottom spectrum, a clock 100px from a corner, and a concentric record + ring spectrum, with reference lines (`G` toggles) and anchor crosses. Its data is synthetic, so it works in a browser without WE callbacks:

```bash
cd playground
npm run dev                    # http://localhost:5174/layout.html
```

`build:wallpaper` produces both pages. To view `layout.html` in WE, change `"file"` in the project's `project.json` to `"layout.html"`.

`deploy:wallpaper` syncs to `F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\wallpaper` by default; override it on another machine:

```bash
WE_PROJECT_DIR="D:\path\to\your\we\project" npm run deploy:wallpaper
```

Sync only overwrites build outputs (`assets/`, `wallpaper.html`); it does **not** touch the WE editor's `preview.gif` and `project.json`. `assets/` is replaced wholesale so old hashed files do not pile up. Switch away from the running wallpaper first, since its files are locked. `deploy:wallpaper` only copies files, so the first time you still need to create a Web wallpaper in WE pointing at that directory.

The inline-script and `project.json` pitfalls (`supportsaudioprocessing` must be nested inside `general`; property value units) are covered in the [WE integration guide](./docs/we-integration.md).

---

## Status

P0–P4 are complete and verified in Wallpaper Engine. P4 verified the plugin injection + hooks wiring; the widget APIs were unchanged. P5 onward has not started.

Since P4, `wallkit/we` gained the `properties` section (`project.json` user properties → `useWallpaperProperties()`): static verification passed and it was deployed to the WE test project, where `accentColor` was confirmed to change the picture. Rendering mappings for the other properties, plus the added `PointerFx` / `AmbientFx` / `Spotlight` / `Frame` / `LightFx` / `BurstFx` components, are described in their sections above and in the changelog.

| Phase | Contents | Status |
|---|---|---|
| P0 | `core` + `styles` skeleton | ✅ Done |
| P1 | `Clock` | ✅ Done |
| P2 | `Spectrum` | ✅ Done (verified in WE) |
| P3 | `MiniSpectrum` + `AlbumArt` | ✅ Done (verified in WE) |
| P4 | `wallkit/we` + Vite plugin | ✅ Done (wiring re-verified in WE) |
| P5 | New-project validation | Not started |
| P6 | Template repository | Not started (after a second game lands) |

---

## Use and modify

### Just use it

A git reference is all you need; see "Usage" above.

### Modify WallKit itself

The copy in `node_modules` is a read-only install result; editing it directly will not stick. You need to:

1. Fork this repository to your account
2. Make changes in your fork
3. Point the dependency at your fork:

```json
"wallkit": "github:<your-username>/wallkit#<commit>"
```

Note: after forking, **upstream updates are not automatic**; rebase or cherry-pick manually. That is inherent to git-reference distribution.

### Contributing changes

PRs are welcome, but whether to merge is entirely at the author's discretion and no response time is promised.

---

## License

The code is open source under [MIT](./LICENSE): use, modify, distribute and commercialize freely, keeping the copyright and license notice.

### Model assets are not covered

**MIT covers only the code in this repository.**

Models, textures, audio and other assets used by Wallpaper Engine wallpapers are usually owned by the original game or its publisher, **not by this project**. This repository contains no such assets.

If you build a wallpaper with this library, you are responsible for the legal provenance and usage rights of the assets you use.

---

## Maintenance notes

This project mainly serves the author's own wallpaper projects.

- No issue response time commitment
- No backward compatibility commitment
- No fixed release cadence

The point of open sourcing is to let others use it freely, not to provide a support service.
