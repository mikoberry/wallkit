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
// 7. Ripples — concentric rings that spread outward from the centre.
//
// Rings are driven by the music only: a bass hit and a broad level swell each
// throw a ring. A fixed metronome would pile up rings during quiet passages and
// look busy rather than calm. The steady breathe ring below keeps the widget
// from looking dead in silence.
// ---------------------------------------------------------------------------
// State: { rings: [{ born, strength }], lastBeatAt, lastLevelAt }
export function createRippleState() {
  return { rings: [], lastBeatAt: -Infinity, lastLevelAt: -Infinity }
}

// Minimum spacing between rings. Generous on purpose: rings overlap for their
// whole life, so a shorter gap reads as a blur rather than distinct waves.
const RIPPLE_MIN_GAP = 0.34
// The broad-level source fires less often than the bass source so the two do
// not double up on every beat.
const RIPPLE_LEVEL_GAP = 0.5

// Hard ceiling on live rings. Beyond this the field is already visually dense
// and extra rings only cost fill rate.
const RIPPLE_MAX_RINGS = 10

export function drawRipples(ctx, levels, width, height, color, state, { time = 0, bass = 0 } = {}) {
  const stops = resolveStops(color)
  const cx = width / 2
  const cy = height / 2
  // Reach the nearer edge rather than the diagonal, so rings stay on screen.
  const maxRadius = Math.min(width, height) / 2

  const rings = state.rings
  const level = levels.reduce((sum, v) => sum + v, 0) / Math.max(1, levels.length)

  // Each source keeps its own timer, so a bass hit and a level swell can both
  // register instead of the first one blocking the second. Thresholds sit low
  // enough that quiet passages still ripple, but the gaps are long enough that
  // rings never stack into a blur.
  if (bass > 0.12 && time - state.lastBeatAt >= RIPPLE_MIN_GAP) {
    state.lastBeatAt = time
    rings.push({ born: time, strength: bass })
  }

  if (level > 0.1 && time - state.lastLevelAt >= RIPPLE_LEVEL_GAP) {
    state.lastLevelAt = time
    rings.push({ born: time, strength: level })
  }

  const life = 2.6
  // Drop expired rings so the array cannot grow without bound.
  for (let i = rings.length - 1; i >= 0; i -= 1) {
    if (time - rings[i].born > life) rings.splice(i, 1)
  }
  // Keep the field bounded even if several sources fire on the same frame.
  if (rings.length > RIPPLE_MAX_RINGS) {
    rings.splice(0, rings.length - RIPPLE_MAX_RINGS)
  }

  const baseWidth = Math.max(3, height * 0.018)

  // A subtle breathe layer under the rings, tied to the overall level.
  const breathe = (time * 0.55) % 1
  const breatheRadius = (0.15 + breathe * 0.85) * maxRadius
  ctx.beginPath()
  ctx.arc(cx, cy, breatheRadius, 0, Math.PI * 2)
  ctx.strokeStyle = stops.top
  ctx.lineWidth = baseWidth * 0.9
  ctx.globalAlpha = 0.3 * (1 - breathe) * (0.5 + Math.min(0.5, level * 2))
  ctx.stroke()

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

    // Early rings are thicker and brighter, tapering as they travel outward.
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.strokeStyle = stops.top
    ctx.lineWidth = baseWidth * (1.6 - t * 0.6)
    ctx.globalAlpha = alpha
    ctx.stroke()

    // A second, wider and softer pass gives the ring a halo so it reads at a
    // distance instead of as a hairline.
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.lineWidth = baseWidth * (4.5 - t * 2)
    ctx.globalAlpha = alpha * 0.22
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// 8. Aurora — soft glowing bands driven by broad tonal energy.
// ---------------------------------------------------------------------------
export function drawAurora(ctx, levels, width, height, color, state, { time = 0 } = {}) {
  const warm = tintStops(color, { r: 1.25, g: 0.75, b: 1.35 })
  const cool = tintStops(color, { r: 0.65, g: 1.1, b: 1.25 })

  // Fold into a handful of wide bands so the result reads as a glow, not bars.
  const bands = 7
  const count = levels.length
  const groupSize = count / bands
  const energy = new Float32Array(bands)
  for (let b = 0; b < bands; b += 1) {
    const start = Math.floor(b * groupSize)
    const end = Math.floor((b + 1) * groupSize)
    let sum = 0
    for (let i = start; i < end; i += 1) sum += levels[i]
    energy[b] = sum / Math.max(1, end - start)
  }

  for (let b = 0; b < bands; b += 1) {
    const cx = ((b + 0.5) / bands) * width
    const sway = Math.sin(time * 0.6 + b * 1.7) * width * 0.02
    const radiusX = (width / bands) * (0.9 + energy[b] * 0.6)
    const radiusY = height * (0.35 + energy[b] * 0.85)

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
