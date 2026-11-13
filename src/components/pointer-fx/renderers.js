// Pointer-effect renderers.
//
// drawTrail / drawBursts read their own preallocated buffer and return whether
// anything is still alive. The particle painters below are buffer-agnostic:
// they take one origin, one seed and one normalised progress, so `bubble` and
// `firework` work as a trail style AND as a click style without duplicating any
// drawing code. The channel only picks a preset (size, density, lifetime).

import {
  POINTER_BUBBLES_PER_BURST,
  POINTER_BUBBLES_PER_SAMPLE,
  POINTER_CLICK_FIREWORK_PARTICLES,
  POINTER_SPARKS_PER_BURST,
  POINTER_TRAIL_FIREWORK_PARTICLES,
  easeOutCubic,
  pointerBubble,
  pointerBurstIndex,
  pointerDecay,
  pointerFall,
  pointerFireworkSpark,
  pointerLife,
  pointerRise,
  pointerSpark,
  pointerTint,
  pointerTrailIndex,
} from '../../core/pointer.js'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function rgba(rgb, alpha) {
  const a = clamp(alpha, 0, 1)
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
}

// Speed is clamped before it reaches any geometry: a fast flick across a large
// monitor can otherwise produce a radius wider than the overlay.
const SPEED_CAP = 2500

// pointerTint writes into this shared scratch array. It is consumed immediately
// by rgba() inside a synchronous draw call, so several overlays can share it.
const tintScratch = [0, 0, 0]

// A full firework on every 1.2 px of movement would cover the wallpaper and
// cost hundreds of paths per frame. Emit from every 4th ring slot instead:
// slot indices are stable, so a sample never flickers in and out of existence.
const TRAIL_FIREWORK_STRIDE = 4

// Channel presets. Trail variants stay small, sparse and short-lived; click
// variants are fuller and linger. Both channels use the same painters.
const TRAIL_BUBBLES = {
  count: POINTER_BUBBLES_PER_SAMPLE,
  spread: 9,
  rise: 46,
  wobble: 5,
}
const CLICK_BUBBLES = {
  count: POINTER_BUBBLES_PER_BURST,
  spread: 26,
  rise: 62,
  wobble: 9,
}
const TRAIL_FIREWORK = {
  count: POINTER_TRAIL_FIREWORK_PARTICLES,
  reach: 34,
  fall: 14,
  streak: 3,
  core: false,
}
const CLICK_FIREWORK = {
  count: POINTER_CLICK_FIREWORK_PARTICLES,
  reach: 72,
  fall: 34,
  streak: 6,
  core: true,
}

/**
 * Paint one deterministic bubble cluster at (x, y). Shared by both channels.
 *
 * Bubbles drift sideways, wobble and float upward as they age. The body is a
 * faint fill, the rim a coloured stroke, and a white specular dot sells the
 * glass look. `pointerBubble(seed, index)` rebuilds every bubble each frame,
 * so nothing is stored between frames.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} seed
 * @param {number} progress  0..1 through pointerLife(channel, 'bubble')
 * @param {number} baseRadius  The trail passes a speed-dependent value; a
 *   click passes a constant.
 * @param {number} scale       Size multiplier for the calling channel.
 * @param {number} gain        Shared opacity multiplier.
 * @param {[number, number, number]} rgb
 * @param {typeof TRAIL_BUBBLES} opts
 */
function paintBubbles(ctx, x, y, seed, progress, baseRadius, scale, gain, rgb, opts) {
  // A short pop-in keeps a fresh bubble from appearing at full brightness
  // before it has separated from its origin.
  const alpha = pointerDecay(progress, 1) * Math.min(1, progress * 10) * gain

  for (let b = 0; b < opts.count; b += 1) {
    const bubble = pointerBubble(seed, b)
    const rise = pointerRise(progress) * opts.rise * scale * bubble.rise
    const wobble = Math.sin(progress * Math.PI * 3 + bubble.phase)
      * bubble.wobble * opts.wobble * scale * progress
    const px = x + bubble.drift * opts.spread * scale + wobble
    const py = y - rise
    const r = Math.max(1, baseRadius * scale * bubble.radius * (0.65 + progress * 0.5))

    // Translucent body and glass rim.
    ctx.fillStyle = rgba(rgb, alpha * 0.1)
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = rgba(rgb, alpha * 0.6)
    ctx.lineWidth = Math.max(0.7, 1.1 * scale)
    ctx.stroke()

    // Specular highlight in the upper-left quadrant.
    ctx.fillStyle = `rgba(255, 255, 255, ${clamp(alpha * 0.8, 0, 1)})`
    ctx.beginPath()
    ctx.arc(px - r * 0.32, py - r * 0.34, Math.max(0.5, r * 0.22), 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Paint one deterministic firework at (x, y). Shared by both channels.
 *
 * An optional white-hot core, then radial embers that coast outward, leave a
 * short motion streak and curve downward under quadratic gravity. Additive
 * blending makes overlapping embers glow instead of turning muddy. Ember
 * brightness uses a gentler falloff than `pointerDecay` so the tail stays
 * visible; every particle is rebuilt from `(seed, index, count)` each frame.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} seed
 * @param {number} progress  0..1 through pointerLife(channel, 'firework')
 * @param {number} scale       Size multiplier for the calling channel.
 * @param {number} gain        Shared opacity multiplier.
 * @param {[number, number, number]} rgb
 * @param {typeof TRAIL_FIREWORK} opts
 */
function paintFirework(ctx, x, y, seed, progress, scale, gain, rgb, opts) {
  const travel = easeOutCubic(progress)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'

  if (opts.core && progress < 0.3) {
    const coreFade = 1 - progress / 0.3
    const r = opts.reach * 0.36 * scale * (0.4 + progress * 1.2)
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
    gradient.addColorStop(0, `rgba(255, 255, 255, ${clamp(coreFade * 0.9 * gain, 0, 1)})`)
    gradient.addColorStop(
      0.4,
      rgba(pointerTint(rgb, 0.55, tintScratch), coreFade * 0.55 * gain),
    )
    gradient.addColorStop(1, rgba(rgb, 0))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Slower than the quadratic `pointerDecay`: embers should still read late in
  // the burst, when they are at their widest and falling.
  const brightness = (1 - progress) ** 1.4 * gain

  for (let p = 0; p < opts.count; p += 1) {
    const spark = pointerFireworkSpark(seed, p, opts.count)
    const reach = opts.reach * scale * spark.reach * travel
    const fall = pointerFall(progress) * opts.fall * scale * spark.gravity
    const px = x + Math.cos(spark.angle) * reach
    const py = y + Math.sin(spark.angle) * reach + fall
    const twinkle = 0.65 + 0.35 * Math.sin(progress * 22 + spark.twinkle * Math.PI * 2)
    const alpha = brightness * twinkle
    const tinted = pointerTint(rgb, 0.15 + spark.tint * 0.6, tintScratch)
    const radius = Math.max(0.6, 2.2 * spark.size * scale * (1 - progress * 0.5))
    const streak = opts.streak * scale * (1 - progress)

    ctx.strokeStyle = rgba(tinted, alpha * 0.35)
    ctx.lineWidth = Math.max(0.6, radius * 0.9)
    ctx.beginPath()
    ctx.moveTo(px - Math.cos(spark.angle) * streak, py - Math.sin(spark.angle) * streak)
    ctx.lineTo(px, py)
    ctx.stroke()

    ctx.fillStyle = rgba(tinted, alpha * 0.95)
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Draw the pointer trail.
 *
 * `glow` lays down soft radial dots; `ribbon` strokes connected segments whose
 * width follows pointer speed. `bubble` and `firework` reuse the shared
 * painters: bubbles on every sample, fireworks on every fourth ring slot so a
 * fast cursor does not flood the canvas. Switching style mid-motion keeps the
 * existing samples because all four read the same buffer.
 *
 * All geometry uses `settings.trailScale` only; `clickScale` never leaks in.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import('../../core/pointer.js').createPointerTrail>} trail
 * @param {number} now  Seconds on the performance.now() clock.
 * @param {Object} settings
 * @param {[number, number, number]} rgb
 * @returns {boolean} True while at least one sample is still alive.
 */
export function drawTrail(ctx, trail, now, settings, rgb) {
  const variant = settings.trailVariant
  const life = pointerLife('trail', variant, settings.reduced)
  const scale = settings.trailScale
  let alive = false

  if (variant === 'bubble' || variant === 'firework') {
    for (let i = 0; i < trail.count; i += 1) {
      const slot = pointerTrailIndex(trail, i)
      const age = now - trail.born[slot]
      if (age < 0 || age > life) continue
      alive = true

      const progress = clamp(age / life, 0, 1)
      const x = trail.xs[slot]
      const y = trail.ys[slot]
      const seed = trail.seeds[slot]

      if (variant === 'bubble') {
        const speed = Math.min(trail.speed[slot], SPEED_CAP)
        paintBubbles(
          ctx, x, y, seed, progress, 3.5 + speed * 0.004,
          scale, settings.gain, rgb, TRAIL_BUBBLES,
        )
      } else if (slot % TRAIL_FIREWORK_STRIDE === 0) {
        paintFirework(ctx, x, y, seed, progress, scale, settings.gain, rgb, TRAIL_FIREWORK)
      }
    }
    return alive
  }

  if (variant === 'ribbon') {
    const points = []
    for (let i = 0; i < trail.count; i += 1) {
      const slot = pointerTrailIndex(trail, i)
      const age = now - trail.born[slot]
      if (age < 0 || age > life) continue
      alive = true
      points.push({
        x: trail.xs[slot],
        y: trail.ys[slot],
        speed: Math.min(trail.speed[slot], SPEED_CAP),
        fade: pointerDecay(age, life),
      })
    }

    if (points.length > 1) {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (let i = 1; i < points.length; i += 1) {
        const from = points[i - 1]
        const to = points[i]
        ctx.strokeStyle = rgba(rgb, to.fade * 0.85 * settings.gain)
        ctx.lineWidth = Math.max(
          0.8,
          (1.5 + to.speed * 0.004) * scale * (0.35 + to.fade * 0.65),
        )
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      }
    }
    return alive
  }

  // glow
  for (let i = 0; i < trail.count; i += 1) {
    const slot = pointerTrailIndex(trail, i)
    const age = now - trail.born[slot]
    if (age < 0 || age > life) continue
    alive = true

    const fade = pointerDecay(age, life)
    const x = trail.xs[slot]
    const y = trail.ys[slot]
    const speed = Math.min(trail.speed[slot], SPEED_CAP)
    const radius = Math.max(
      1,
      (5 + speed * 0.006) * scale * (0.45 + fade * 0.55),
    )
    const alpha = fade * 0.5 * settings.gain

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, rgba(rgb, alpha))
    gradient.addColorStop(0.45, rgba(rgb, alpha * 0.45))
    gradient.addColorStop(1, rgba(rgb, 0))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  return alive
}

/**
 * Draw click bursts.
 *
 * `ripple` expands two concentric rings; `sparks` scatters short-lived dots;
 * `bubble` releases a fuller rising cluster; `firework` adds a hot core, radial
 * embers and gravity. Reduced motion replaces all four with a brief,
 * fixed-radius ring so a click still gives feedback without movement.
 *
 * All geometry uses `settings.clickScale` only; `trailScale` never leaks in.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import('../../core/pointer.js').createPointerBursts>} bursts
 * @param {number} now
 * @param {Object} settings
 * @param {[number, number, number]} rgb
 * @returns {boolean} True while at least one burst is still alive.
 */
export function drawBursts(ctx, bursts, now, settings, rgb) {
  const variant = settings.clickVariant
  const life = pointerLife('click', variant, settings.reduced)
  const scale = settings.clickScale
  let alive = false

  for (let i = 0; i < bursts.count; i += 1) {
    const slot = pointerBurstIndex(bursts, i)
    const age = now - bursts.born[slot]
    if (age < 0 || age > life) continue
    alive = true

    const x = bursts.xs[slot]
    const y = bursts.ys[slot]
    const progress = clamp(age / life, 0, 1)
    const fade = pointerDecay(age, life)
    const gain = settings.gain
    const seed = bursts.seeds[slot]

    if (settings.reduced) {
      ctx.strokeStyle = rgba(rgb, fade * 0.8 * gain)
      ctx.lineWidth = Math.max(0.8, 2 * scale)
      ctx.beginPath()
      ctx.arc(x, y, 18 * scale, 0, Math.PI * 2)
      ctx.stroke()
      continue
    }

    if (variant === 'firework') {
      paintFirework(ctx, x, y, seed, progress, scale, gain, rgb, CLICK_FIREWORK)
      continue
    }

    if (variant === 'bubble') {
      paintBubbles(ctx, x, y, seed, progress, 7, scale, gain, rgb, CLICK_BUBBLES)
      continue
    }

    if (variant === 'sparks') {
      const travel = easeOutCubic(progress)
      for (let p = 0; p < POINTER_SPARKS_PER_BURST; p += 1) {
        const spark = pointerSpark(seed, p)
        const reach = 42 * scale * spark.reach * travel
        const px = x + Math.cos(spark.angle) * reach
        const py = y + Math.sin(spark.angle) * reach + progress * progress * 10 * scale
        ctx.fillStyle = rgba(rgb, fade * 0.9 * gain)
        ctx.beginPath()
        ctx.arc(
          px,
          py,
          Math.max(0.6, 2.1 * spark.size * scale * (1 - progress * 0.45)),
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      continue
    }

    // Ripple: two rings offset in phase read as one expanding pulse.
    for (let ring = 0; ring < 2; ring += 1) {
      const phase = easeOutCubic(Math.min(1, progress + ring * 0.18))
      const radius = Math.max(1, 46 * scale * phase * (1 - ring * 0.22))
      ctx.strokeStyle = rgba(rgb, fade * (ring === 0 ? 0.75 : 0.35) * gain)
      ctx.lineWidth = Math.max(0.8, (2.6 - progress * 1.6) * scale)
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  return alive
}
