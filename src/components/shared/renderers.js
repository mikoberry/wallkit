// Spectrum renderers.
//
// Every style shares the same data path (the caller's normalised bars) and the
// same canvas surface. A renderer only decides how to turn the smoothed bar
// heights into pixels, so switching style never touches the audio plumbing.
//
// Each renderer receives a state bag it may keep between frames (particles,
// ripple rings). The component owns that bag, so a style change can reset it.

import { DEFAULT_SPECTRUM_COLOR, spectrumGradientStops } from '../../core/audio.js'

// Resolve a colour into gradient stops, falling back to the default so an
// invalid value never paints nothing.
export function resolveStops(hex) {
  return spectrumGradientStops(hex) ?? spectrumGradientStops(DEFAULT_SPECTRUM_COLOR)
}

// Mix the base colour towards a target channel value. Used by renderers that
// need a second hue (wave arcs, aurora bands) without a second colour input.
export function tintStops(hex, { r = 1, g = 1, b = 1 } = {}) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex ?? '')
  const base = match ? parseInt(match[1], 16) : 0xa8c4ff
  const br = (base >> 16) & 255
  const bg = (base >> 8) & 255
  const bb = base & 255
  const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)))
  return {
    top: `rgba(${clamp(br * r)}, ${clamp(bg * g)}, ${clamp(bb * b)}, 0.95)`,
    bottom: `rgba(${clamp(br * r)}, ${clamp(bg * g)}, ${clamp(bb * b)}, 0.25)`,
  }
}

// A monotone cubic path through the bar heights, scaled into the canvas. Using
// the midpoints as control points keeps the curve smooth without overshooting
// back below the baseline on quiet frames.
export function buildSmoothPath(levels, width, height, { scale = 1, floor = 0 } = {}) {
  const count = levels.length
  if (count === 0) return new Path2D()

  const step = width / (count - 1 || 1)
  const pointAt = (i) => {
    const x = i * step
    const h = Math.max(0, Math.min(1, levels[i])) * height * scale
    return { x, y: height - floor - h }
  }

  const path = new Path2D()
  const first = pointAt(0)
  path.moveTo(first.x, first.y)

  for (let i = 1; i < count; i += 1) {
    const prev = pointAt(i - 1)
    const curr = pointAt(i)
    const midX = (prev.x + curr.x) / 2
    path.bezierCurveTo(midX, prev.y, midX, curr.y, curr.x, curr.y)
  }

  return path
}

// ---------------------------------------------------------------------------
// 1. Bars (the original look)
// ---------------------------------------------------------------------------
export function drawBars(ctx, levels, width, height, color) {
  const stops = resolveStops(color)
  const count = levels.length
  const gap = Math.max(1, Math.round(width / count / 4))
  const barWidth = width / count

  for (let i = 0; i < count; i += 1) {
    const barHeight = Math.max(1, levels[i] * height)
    const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
    gradient.addColorStop(0, stops.bottom)
    gradient.addColorStop(1, stops.top)
    ctx.fillStyle = gradient
    ctx.fillRect(i * barWidth, height - barHeight, Math.max(1, barWidth - gap), barHeight)
  }
}

// ---------------------------------------------------------------------------
// 2. Mirror — the same bars reflected across the vertical centre.
// ---------------------------------------------------------------------------
export function drawMirror(ctx, levels, width, height, color) {
  const stops = resolveStops(color)
  const count = levels.length
  const gap = Math.max(1, Math.round(width / count / 4))
  const barWidth = width / count
  // Each half is drawn from the midline outward, so peaks grow both up and down.
  const mid = height / 2
  const half = mid

  for (let i = 0; i < count; i += 1) {
    const barHeight = Math.max(1, levels[i] * half)
    const x = i * barWidth
    const w = Math.max(1, barWidth - gap)

    const gradient = ctx.createLinearGradient(0, mid - barHeight, 0, mid + barHeight)
    gradient.addColorStop(0, stops.top)
    gradient.addColorStop(0.5, stops.bottom)
    gradient.addColorStop(1, stops.top)
    ctx.fillStyle = gradient
    ctx.fillRect(x, mid - barHeight, w, barHeight * 2)
  }
}

// ---------------------------------------------------------------------------
// 3. Curve — a smooth filled waveform.
// ---------------------------------------------------------------------------
export function drawCurve(ctx, levels, width, height, color) {
  const stops = resolveStops(color)
  const path = buildSmoothPath(levels, width, height, { scale: 0.92 })

  const gradient = ctx.createLinearGradient(0, height, 0, 0)
  gradient.addColorStop(0, stops.bottom)
  gradient.addColorStop(1, stops.top)

  // Close the path along the baseline so the area under the curve fills.
  const filled = new Path2D(path)
  filled.lineTo(width, height)
  filled.lineTo(0, height)
  filled.closePath()

  ctx.fillStyle = gradient
  ctx.fill(filled)

  // A brighter stroke on top sells the edge of the wave.
  ctx.strokeStyle = stops.top
  ctx.lineWidth = Math.max(1.5, height * 0.012)
  ctx.stroke(path)
}

// ---------------------------------------------------------------------------
// 4. Ring — the classic bars bent into a circle.
//
// This is literally the straight bar chart rotated around the centre: each band
// owns one angular slice, and its bar grows outward from a shared base radius.
// Drawing rectangles in a rotated coordinate system (rather than arcs) keeps the
// bars crisp and gives them the same rectangular body they have on a flat edge.
// ---------------------------------------------------------------------------
// Rotation speed, in radians per second. A full turn takes roughly 36 seconds:
// slow enough to read as a drifting record rather than a spinning loader, but
// clearly alive. Both ring styles share it so they feel like one family.
const RING_SPIN = (Math.PI * 2) / 36

export function drawRing(ctx, levels, width, height, color, options = {}) {
  const stops = resolveStops(color)
  const { time = 0, baseRatio = 0.46 } = options
  const cx = width / 2
  const cy = height / 2
  // Leave a little padding so the longest bar does not clip on the bounding box.
  const outer = Math.min(width, height) / 2 - 1
  // `baseRatio` sets how much of the radius the empty centre takes. The default
  // leaves a large hole so the ring reads as a standalone widget; the album card
  // passes a larger one so the bars clear its centre label.
  const base = outer * baseRatio
  const reach = outer - base
  const count = levels.length
  const step = (Math.PI * 2) / count
  // The bar body spans most of its slice, leaving a thin seam between bands.
  const bodyWidth = base * step * 0.82

  // One gradient reused by every bar; a per-bar gradient would mean 128
  // allocations per frame for no visible difference.
  const gradient = ctx.createRadialGradient(cx, cy, base, cx, cy, outer)
  gradient.addColorStop(0, stops.bottom)
  gradient.addColorStop(1, stops.top)
  ctx.fillStyle = gradient

  // The whole ring turns; the bars keep their own heights while the pattern
  // drifts around the circle. Drawing in one rotated transform for the entire
  // ring is cheaper than adding the angle per bar.
  const spin = time * RING_SPIN
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(spin)

  for (let i = 0; i < count; i += 1) {
    const level = Math.max(0.02, Math.min(1, levels[i]))
    const barLength = level * reach

    // Rotate to this band's angle, then draw the bar as a plain upright
    // rectangle sitting on the base circle.
    ctx.save()
    ctx.rotate(i * step - Math.PI / 2)
    ctx.fillRect(-bodyWidth / 2, -base - barLength, bodyWidth, barLength)
    ctx.restore()
  }

  ctx.restore()
}

// ---------------------------------------------------------------------------
// 5. Ring wave — the curve renderer bent into a circle. The band levels are
// smoothed into a closed loop and the area between the base circle and that
// loop is filled, so the ring looks like a circular waveform rather than bars.
// ---------------------------------------------------------------------------
export function drawRingWave(ctx, levels, width, height, color, { time = 0 } = {}) {
  const stops = resolveStops(color)
  const cx = width / 2
  const cy = height / 2
  const outer = Math.min(width, height) / 2 - 1
  const base = outer * 0.46
  const reach = outer - base
  const count = levels.length
  const step = (Math.PI * 2) / count

  // The wave turns with the same speed as the bar ring, so the two styles stay
  // in step when switching between them.
  const spin = time * RING_SPIN

  // Sample the band levels onto the circle. Sampling twice as many points as
  // bands gives the curve enough resolution to look smooth.
  const points = count * 2
  const ring = (i) => {
    const t = (i % points) / points
    // Map the sample back onto the band array (wrapping around the loop).
    const bandLevel = levels[Math.floor(t * count) % count]
    const radius = base + Math.max(0.02, Math.min(1, bandLevel)) * reach
    const angle = t * Math.PI * 2 - Math.PI / 2 + spin
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }
  }

  // Build a smooth closed path through the ring points using the midpoints of
  // neighbouring samples as control points, which avoids overshoot.
  const path = new Path2D()
  const start = ring(0)
  path.moveTo(start.x, start.y)
  for (let i = 1; i <= points; i += 1) {
    const prev = ring(i - 1)
    const curr = ring(i)
    const midX = (prev.x + curr.x) / 2
    const midY = (prev.y + curr.y) / 2
    path.quadraticCurveTo(prev.x, prev.y, midX, midY)
  }
  path.closePath()

  // Fill between the base circle and the wave. The base circle is drawn in the
  // opposite winding direction so the two rings form a band rather than a disc.
  const filled = new Path2D(path)
  filled.arc(cx, cy, base, 0, Math.PI * 2, true)
  filled.closePath()

  const gradient = ctx.createRadialGradient(cx, cy, base, cx, cy, outer)
  gradient.addColorStop(0, stops.bottom)
  gradient.addColorStop(1, stops.top)
  ctx.fillStyle = gradient
  ctx.fill(filled, 'evenodd')

  // A bright stroke traces the wave itself.
  ctx.strokeStyle = stops.top
  ctx.lineWidth = Math.max(1.5, outer * 0.018)
  ctx.stroke(path)
}

// ---------------------------------------------------------------------------
// 6. Dots — an LED matrix. Each band is a column of lit pips.
// ---------------------------------------------------------------------------
export function drawDots(ctx, levels, width, height, color) {
  const stops = resolveStops(color)
  const count = levels.length
  // Target a readable pip size rather than a fixed divisor: on a wide strip
  // that is a long row of small pips, inside a card it is a small grid. Clamping
  // the column and row counts keeps the total pip count bounded, so a large
  // canvas cannot turn into tens of thousands of arcs per frame.
  const targetCell = Math.max(8, Math.min(width, height) / 14)
  const columns = Math.min(count, Math.max(6, Math.min(48, Math.round(width / targetCell))))
  const rows = Math.max(4, Math.min(24, Math.round(height / targetCell)))
  const cellW = width / columns
  const cellH = height / rows
  const radius = Math.min(cellW, cellH) * 0.32

  // Collapse the full band count into the column count.
  const folded = new Float32Array(columns)
  for (let c = 0; c < columns; c += 1) {
    const start = Math.floor((c * count) / columns)
    const end = Math.max(start + 1, Math.floor(((c + 1) * count) / columns))
    let sum = 0
    for (let i = start; i < end; i += 1) sum += levels[i]
    folded[c] = sum / (end - start)
  }

  for (let c = 0; c < columns; c += 1) {
    const lit = Math.round(folded[c] * rows)
    for (let r = 0; r < rows; r += 1) {
      // Row 0 is the bottom of the strip.
      const on = r < lit
      ctx.beginPath()
      ctx.arc(
        c * cellW + cellW / 2,
        height - (r * cellH + cellH / 2),
        radius,
        0,
        Math.PI * 2,
      )
      if (on) {
        const t = rows > 1 ? r / (rows - 1) : 0
        ctx.fillStyle = t > 0.66 ? stops.top : stops.bottom
        ctx.globalAlpha = 0.45 + t * 0.55
      } else {
        ctx.fillStyle = stops.bottom
        ctx.globalAlpha = 0.08
      }
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// 7. Ripples — water rings, one per beat.
//
// Two rules shape this style:
//
//   1. A wave is thrown by a *transient*, not by a timer. Emission is an onset
//      test on the bass level (it must rise against the previous frame), so a
//      quiet passage has no rings at all and a fast passage gets one per hit.
//      An earlier version also fired on a fixed gap whenever the average level
//      was above a floor, which read as a metronome regardless of the music.
//
//   2. Every ring draws its own random water silhouette, fixed at birth. The
//      lobe counts, weights and phases come from a per-ring hash, so no two
//      beats produce the same outline; the live spectrum no longer touches the
//      outline at all, because that made the shape morph on the beat instead of
//      sending a new wave out.
//
// The rings themselves are not circles: radius is sampled around the
// circumference and runs through a couple of sine lobes (see `traceRing`), and
// the swell flattens as the ring travels outward, like a real ripple.
// ---------------------------------------------------------------------------

// Angular resolution of one outline. The path is smoothed through segment
// midpoints, so this only has to resolve the lobes; 96 keeps a large ring
// smooth without turning into a visible polygon.
const RIPPLE_SAMPLES = 96
// Peak undulation as a fraction of the ring radius, before the per-ring random
// amplitude and the outward decay.
const RIPPLE_WOBBLE = 0.16
// Bass must climb by this much between frames to count as a hit. The level is
// already smoothed by the caller, so a real kick clears it easily while a
// sustained bass line (flat, no rise) never fires twice.
const RIPPLE_ONSET = 0.045
// Bass floor below which no hit is accepted at all, so noise in near-silence
// cannot throw rings.
const RIPPLE_BEAT_FLOOR = 0.14
// Refractory window: one hit may not fire the same wave twice while the level
// is still climbing. Short on purpose — two fast kicks are two waves.
const RIPPLE_REFRACTORY = 0.16

// State: { rings: [{ born, strength, lobes, … }], lastBeatAt, prevBass, seq }
export function createRippleState() {
  return {
    rings: [],
    lastBeatAt: -Infinity,
    prevBass: 0,
    // Monotonic ring counter: the seed for the per-ring silhouette hash.
    seq: 0,
    // Scratch buffers, allocated once and rewritten in place every frame — the
    // drawing loop must not allocate per ring (see AGENTS.md).
    xs: new Float32Array(RIPPLE_SAMPLES),
    ys: new Float32Array(RIPPLE_SAMPLES),
  }
}

// Deterministic pseudo-random in [0, 1) from an integer seed. The same beat
// sequence replays as the same surface, and no Math.random call sits in the
// draw loop.
function rippleRandom(seed) {
  let x = Math.imul(seed + 1, 0x27d4eb2d)
  x ^= x >>> 15
  x = Math.imul(x, 0x85ebca6b)
  x ^= x >>> 13
  return (x >>> 0) / 4294967296
}

// Hard ceiling on live rings. Beyond this the field is already visually dense
// and extra rings only cost fill rate.
const RIPPLE_MAX_RINGS = 10
const RIPPLE_TAU = Math.PI * 2

export function drawRipples(ctx, levels, width, height, color, state, { time = 0, bass = 0 } = {}) {
  const stops = resolveStops(color)
  const cx = width / 2
  const cy = height / 2
  // Reach the nearer edge rather than the diagonal, so rings stay on screen.
  const maxRadius = Math.min(width, height) / 2

  const rings = state.rings
  const count = levels.length

  // A state bag from an older shape (or a hot reload) must not crash the loop.
  if (!state.xs || state.xs.length !== RIPPLE_SAMPLES) {
    state.xs = new Float32Array(RIPPLE_SAMPLES)
    state.ys = new Float32Array(RIPPLE_SAMPLES)
  }
  if (!Number.isFinite(state.prevBass)) state.prevBass = 0
  if (!Number.isFinite(state.seq)) state.seq = 0
  const { xs, ys } = state

  // --- Emission: one wave per onset -----------------------------------------
  // The test is on the *rise* of the bass level between frames, not on its
  // value, so a sustained bass note fires once (at its attack) instead of
  // throwing a ring every frame it stays loud. Nothing here is time-based: a
  // bar of silence emits nothing.
  const rise = bass - state.prevBass
  state.prevBass = bass

  if (bass > RIPPLE_BEAT_FLOOR && rise > RIPPLE_ONSET && time - state.lastBeatAt >= RIPPLE_REFRACTORY) {
    state.lastBeatAt = time
    const seed = state.seq
    state.seq += 1
    // The silhouette is decided here and never changes with the music again:
    // 3–5 gross lobes plus 2–4 secondary ones, random weights and phases, and
    // a very slow drift so the crests wander instead of being frozen.
    rings.push({
      born: time,
      strength: Math.min(1, Math.max(0.35, bass)),
      lobes: 3 + Math.floor(rippleRandom(seed + 17) * 3),
      lobes2: 2 + Math.floor(rippleRandom(seed + 131) * 3),
      phase: rippleRandom(seed + 277) * RIPPLE_TAU,
      phase2: rippleRandom(seed + 389) * RIPPLE_TAU,
      mix: 0.25 + rippleRandom(seed + 523) * 0.45,
      amp: 0.6 + rippleRandom(seed + 673) * 0.4,
      // Only a hint of drift: the silhouette has to stay recognisably the same
      // shape for the whole journey, or it reads as a shape morphing on the
      // beat instead of one wave travelling outward.
      spin: (rippleRandom(seed + 811) - 0.5) * 0.3,
    })
  }

  const life = 2.6
  // Drop expired rings so the array cannot grow without bound.
  for (let i = rings.length - 1; i >= 0; i -= 1) {
    if (time - rings[i].born > life) rings.splice(i, 1)
  }
  // Keep the field bounded even if several hits land on the same frame.
  if (rings.length > RIPPLE_MAX_RINGS) {
    rings.splice(0, rings.length - RIPPLE_MAX_RINGS)
  }

  /**
   * Trace one closed, undulating outline into the scratch buffers and return it
   * as a smooth path. `lobes` / `lobes2` set the wave count, `mix` their
   * relative weight, `spin` how fast the crests creep around the circle.
   */
  const traceRing = (radius, wobble, { lobes, lobes2, phase, phase2, mix, spin = 0 }) => {
    for (let k = 0; k < RIPPLE_SAMPLES; k += 1) {
      const angle = (k / RIPPLE_SAMPLES) * RIPPLE_TAU - Math.PI / 2
      // Two lobe trains of different frequency travelling in opposite
      // directions. `mix` keeps their sum near ±1 so `wobble` is the actual
      // peak displacement.
      const swell =
        Math.sin(angle * lobes + phase + time * spin) * (1 - mix) +
        Math.sin(angle * lobes2 - phase2 - time * spin * 0.6) * mix
      const r = radius * (1 + wobble * swell)
      xs[k] = cx + Math.cos(angle) * r
      ys[k] = cy + Math.sin(angle) * r
    }

    const path = new Path2D()
    const last = RIPPLE_SAMPLES - 1
    // Start on the midpoint of the closing segment so the join is as smooth as
    // every other one.
    path.moveTo((xs[last] + xs[0]) / 2, (ys[last] + ys[0]) / 2)
    for (let k = 0; k < RIPPLE_SAMPLES; k += 1) {
      const next = k === last ? 0 : k + 1
      path.quadraticCurveTo(xs[k], ys[k], (xs[k] + xs[next]) / 2, (ys[k] + ys[next]) / 2)
    }
    path.closePath()
    return path
  }

  const baseWidth = Math.max(3, height * 0.018)

  // A still inner surface so the widget is not blank in a silent passage. It
  // does *not* expand — an expanding ring here would reintroduce exactly the
  // metronome this style is trying to avoid — it only breathes in place.
  const level = count > 0 ? levels.reduce((sum, v) => sum + v, 0) / count : 0
  const breathePhase = time * 0.22
  const stillPath = traceRing(maxRadius * 0.34, RIPPLE_WOBBLE * 0.5, {
    lobes: 4,
    lobes2: 3,
    phase: breathePhase,
    phase2: breathePhase * 0.7,
    mix: 0.4,
    spin: 0.15,
  })
  ctx.strokeStyle = stops.top
  ctx.lineWidth = baseWidth * 0.9
  ctx.globalAlpha = 0.08 + Math.min(0.22, level * 0.45)
  ctx.stroke(stillPath)

  for (const ring of rings) {
    const age = Math.max(0, time - ring.born)
    const t = Math.min(1, age / life)
    // Ease-out expansion so the ring shoots out then slows at the edge.
    const eased = 1 - (1 - t) ** 2
    const radius = eased * maxRadius

    // Hold brightness through most of the life, then fade over the last third.
    // A linear fade from birth made every ring vanish while still small.
    const fade = t < 0.68 ? 1 : 1 - (t - 0.68) / 0.32
    const alpha = fade * (0.7 + Math.min(0.3, ring.strength))

    // The swell flattens as the ring travels outward, exactly like a real
    // ripple losing amplitude. It depends only on the ring's own amplitude, set
    // at birth — the live level must not reshape an already-emitted wave.
    const wobble = RIPPLE_WOBBLE * ring.amp * (1 - t * 0.6)
    const path = traceRing(radius, wobble, ring)

    // Early rings are thicker and brighter, tapering as they travel outward.
    ctx.lineWidth = baseWidth * (1.6 - t * 0.6)
    ctx.globalAlpha = alpha
    ctx.stroke(path)

    // A second, wider and softer pass gives the ring a halo so it reads at a
    // distance instead of as a hairline.
    ctx.lineWidth = baseWidth * (4.5 - t * 2)
    ctx.globalAlpha = alpha * 0.22
    ctx.stroke(path)
  }
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// 8. Aurora — soft glowing columns driven by tonal energy.
//
// One glow per incoming column, exactly like `bars`: the component does not fold
// anything, so density is purely `bars.length`. Feed it 128 bars and you get 128
// narrow glows (a curtain with visible blades); fold with `resampleBars(bars, 7)`
// and you get the classic seven wide bands. Deciding that on the caller's side
// keeps this the only place a column is ever collapsed.
// ---------------------------------------------------------------------------
export function drawAurora(ctx, levels, width, height, color, state, { time = 0 } = {}) {
  const warm = tintStops(color, { r: 1.25, g: 0.75, b: 1.35 })
  const cool = tintStops(color, { r: 0.65, g: 1.1, b: 1.25 })

  const count = levels.length
  // A caller may hand over a very high column count; below one column there is
  // nothing to place, so bail instead of dividing by zero.
  if (count === 0) return

  const slice = width / count

  for (let b = 0; b < count; b += 1) {
    const energy = levels[b]
    const cx = (b + 0.5) * slice
    // The sway scales with the column width, so a dense curtain reads as one
    // shimmering mass instead of 128 independently drifting blades.
    const sway = Math.sin(time * 0.6 + b * 1.7) * slice * 0.35
    const radiusX = slice * (0.9 + energy * 0.6)
    const radiusY = height * (0.35 + energy * 0.85)

    const gradient = ctx.createRadialGradient(cx + sway, height, 0, cx + sway, height, radiusY)
    gradient.addColorStop(0, b % 2 === 0 ? warm.top : cool.top)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

    ctx.save()
    // Squash the glow into a wide ellipse hugging the edge.
    ctx.translate(cx + sway, height)
    ctx.scale(radiusX / Math.max(1, radiusY), 1)
    ctx.translate(-(cx + sway), -height)
    ctx.globalAlpha = 0.55
    ctx.fillStyle = gradient
    ctx.fillRect(cx + sway - radiusY, height - radiusY, radiusY * 2, radiusY)
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// 9. Pill — the mirror bars as solid rounded capsules.
//
// Same centred layout as `mirror` (each column grows out from the midline), but
// filled with a flat colour — no vertical gradient — and both ends are capped so
// a bar reads as a pill rather than a sliver.
// ---------------------------------------------------------------------------
function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export function drawPill(ctx, levels, width, height, color) {
  const count = levels.length
  const gap = Math.max(1, Math.round(width / count / 4))
  const barWidth = width / count
  const w = Math.max(1, barWidth - gap)
  const mid = height / 2

  // Solid fill: `color` is already resolved to `#rrggbb` by the component, so it
  // paints opaque with no gradient.
  ctx.fillStyle = color

  for (let i = 0; i < count; i += 1) {
    const half = Math.max(1, levels[i] * mid)
    roundedRectPath(ctx, i * barWidth + gap / 2, mid - half, w, half * 2, w / 2)
    ctx.fill()
  }
}

// Registry so the component and any settings list stay in sync from one place.
// `ring` is the bar chart bent into a circle; `ringwave` is the curve renderer
// bent into one.
export const SPECTRUM_STYLES = [
  'bars',
  'mirror',
  'curve',
  'pill',
  'ring',
  'ringwave',
  'dots',
  'ripples',
  'aurora',
]

// Styles that keep animated state between frames.
export function createRendererState(style) {
  return style === 'ripples' ? createRippleState() : {}
}

// The renderer for each style, in one table so a draw loop never has to branch
// on a string every frame. Styles that need the state bag or the frame metadata
// (time, bass) take the trailing arguments; the flat ones ignore them.
export const SPECTRUM_RENDERERS = {
  bars: (ctx, levels, w, h, color) => drawBars(ctx, levels, w, h, color),
  mirror: (ctx, levels, w, h, color) => drawMirror(ctx, levels, w, h, color),
  curve: (ctx, levels, w, h, color) => drawCurve(ctx, levels, w, h, color),
  pill: (ctx, levels, w, h, color) => drawPill(ctx, levels, w, h, color),
  ring: (ctx, levels, w, h, color, state, meta) => drawRing(ctx, levels, w, h, color, meta),
  ringwave: (ctx, levels, w, h, color, state, meta) =>
    drawRingWave(ctx, levels, w, h, color, meta),
  dots: (ctx, levels, w, h, color) => drawDots(ctx, levels, w, h, color),
  ripples: (ctx, levels, w, h, color, state, meta) =>
    drawRipples(ctx, levels, w, h, color, state, meta),
  aurora: (ctx, levels, w, h, color, state, meta) =>
    drawAurora(ctx, levels, w, h, color, state, meta),
}
