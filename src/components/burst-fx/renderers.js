// Burst-effect renderers.
//
// `drawBursts` reads the preallocated burst record buffer and returns whether
// anything is still alive. The particle painters below are record-agnostic:
// each takes one origin, one seed and one normalised progress, so confetti,
// spray and yogurt stay separate drawing functions with no shared mutable
// state. Each particle is rebuilt from `(seed, index, count)` every frame.

import {
  BURST_CONFETTI_COUNT,
  BURST_CONFETTI_PALETTE,
  BURST_SPRAY_COUNT,
  BURST_YOGURT_COUNT,
  BURST_YOGURT_COLOR,
  burstBreakup,
  burstConfetti,
  burstDecay,
  burstDroplet,
  burstFall,
  burstGlob,
  burstIndex,
  burstLife,
  burstPaletteRgb,
  burstProjectile,
  burstRgb,
} from '../../core/burst.js'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function rgba(rgb, alpha) {
  const a = clamp(alpha, 0, 1)
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
}

// Confetti pieces are drawn as thin rounded rectangles, so a shared helper
// paints one slip at a given position, angle and size.
function paintConfettiSlip(ctx, x, y, w, h, rotation, rgb, alpha) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.fillStyle = rgba(rgb, alpha)
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.restore()
}

/**
 * Paint one confetti burst. Slips launch upward into a cone, then flutter and
 * spin downward under gravity. Each slip picks its colour from the built-in
 * rainbow palette; the whole scatter fades out via `burstDecay`.
 *
 * `intensity` (`force`) drives how hard the slips are thrown: it scales the
 * projectile launch, so a strong burst throws the paper higher and scatters it
 * wider, while a weak one drops it almost straight away. The fluttering and
 * spin are paper-specific and stay intact regardless of force.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x  Origin x in px.
 * @param {number} y  Origin y in px.
 * @param {number} angle  Launch direction in radians (up = negative).
 * @param {number} seed
 * @param {number} progress  0..1 through burstLife('confetti').
 * @param {number} scale     Size multiplier.
 * @param {number} force     Launch-force multiplier (0..3), from `intensity`.
 * @param {number} pxPerUnit  px per normalised unit, for travel distances.
 * @param {number} count     Particle count; 0 = use the kind's preset default.
 */
function paintConfetti(ctx, x, y, angle, seed, progress, scale, force, pxPerUnit, count) {
  const alpha = burstDecay(progress, 1)
  const total = count > 0 ? count : BURST_CONFETTI_COUNT

  for (let p = 0; p < total; p += 1) {
    const slip = burstConfetti(seed, p, total)
    // Launch cone around the commanded angle; the spread is part of the
    // confetti's character and stays fixed, only the *reach* scales with force.
    const dir = angle + (slip.angle - Math.PI) * 0.32
    // Projectile flight: a stronger launch throws the slip further and higher.
    const flight = burstProjectile(progress, dir, slip.reach * force)
    // Sway while falling, paper-specific flutter that grows as it descends.
    const sway = Math.sin(progress * Math.PI * 3 + slip.swayPhase) * 0.06 * pxPerUnit * scale * progress
    const fall = burstFall(progress) * 0.5 * pxPerUnit * scale
    const px = x + flight.dx * 0.55 * pxPerUnit * scale + slip.drift * 0.12 * pxPerUnit * scale * progress + sway
    const py = y + flight.dy * 0.55 * pxPerUnit * scale + fall
    const rotation = slip.spin * progress * 2

    const rgb = burstPaletteRgb(BURST_CONFETTI_PALETTE[slip.palette])
    const w = Math.max(2, 5 * slip.size * scale)
    const h = Math.max(4, 11 * slip.size * scale)
    paintConfettiSlip(ctx, px, py, w, h, rotation, rgb, alpha)
  }
}

/**
 * Paint one water spray. Droplets exit in a narrow fan and fall fast under
 * gravity. The key behaviour here is *intensity-driven breakup*: a strong
 * launch (high `force`) holds the water together as a solid column at first and
 * only shatters into droplets late in the flight, while a weak launch is
 * scattered almost from the start.
 *
 * The trajectory is a real projectile arc (`burstProjectile`), so a stronger
 * launch flies further and higher, and an angled launch arcs instead of firing
 * straight.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} angle  Fan centre direction in radians (up = negative).
 * @param {number} seed
 * @param {number} progress  0..1 through burstLife('spray').
 * @param {number} scale
 * @param {number} force     Launch-force multiplier (0..3), from `intensity`.
 * @param {number} pxPerUnit
 * @param {[number, number, number]} rgb
 * @param {number} count     Particle count; 0 = use the kind's preset default.
 */
function paintSpray(ctx, x, y, angle, seed, progress, scale, force, pxPerUnit, rgb, count) {
  const alpha = burstDecay(progress, 1)
  const total = count > 0 ? count : BURST_SPRAY_COUNT
  // Base fan width. At low intensity the droplets scatter early; at high
  // intensity the column stays tight, so the *effective* spread is the base
  // fan scaled down by `(1 - breakup)` near the launch.
  const FAN_SPREAD = 0.28
  // How far the stream has shattered at this moment (0 = solid, 1 = scattered).
  const breakup = burstBreakup(progress, force)

  for (let p = 0; p < total; p += 1) {
    const droplet = burstDroplet(seed, p, total)
    // The droplet's fan position widens as the stream breaks up: early on the
    // whole fan is nearly parallel (a solid column), later it opens into a
    // scatter of droplets.
    const dir = angle + droplet.fan * FAN_SPREAD * (0.15 + breakup)
    // Projectile flight: reach and height both come from the launch force.
    const flight = burstProjectile(progress, dir, droplet.reach * force)
    const px = x + flight.dx * 0.6 * pxPerUnit * scale
    const py = y + flight.dy * 0.6 * pxPerUnit * scale
    const radius = Math.max(0.6, 2.1 * droplet.size * scale * (1 - progress * 0.4))

    // A short trail above each droplet, which also thins out as the stream
    // breaks apart (a solid column has a longer coherent trail).
    const trail = 6 * scale * (1 - progress) * (1 - breakup * 0.5)
    ctx.strokeStyle = rgba(rgb, alpha * 0.3)
    ctx.lineWidth = Math.max(0.6, radius * 0.8)
    ctx.beginPath()
    ctx.moveTo(px - Math.cos(dir) * trail, py - Math.sin(dir) * trail)
    ctx.lineTo(px, py)
    ctx.stroke()

    ctx.fillStyle = rgba(rgb, alpha * 0.9)
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Paint one yogurt glob. Yogurt is viscous, so instead of a clean fan of water
 * droplets it flings thick, stringy clumps: each glob is a larger blob with a
 * sticky tail trailing behind it, and it falls faster than water under its own
 * weight. The trajectory still comes from `burstProjectile`, but the paint is
 * deliberately lumpier — round caps, heavy fill, and a trailing string that
 * reads as "stretched dairy" rather than a droplet trail.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} angle  Fan centre direction in radians (up = negative).
 * @param {number} seed
 * @param {number} progress  0..1 through burstLife('yogurt').
 * @param {number} scale
 * @param {number} force     Launch-force multiplier (0..3), from `intensity`.
 * @param {number} pxPerUnit
 * @param {[number, number, number]} rgb
 * @param {number} count     Particle count; 0 = use the kind's preset default.
 */
function paintYogurt(ctx, x, y, angle, seed, progress, scale, force, pxPerUnit, rgb, count) {
  const alpha = burstDecay(progress, 1)
  const total = count > 0 ? count : BURST_YOGURT_COUNT
  // Yogurt does not "shatter" into fine droplets the way water does; instead it
  // stays in lumpy clumps. The fan is wider than water (thicker, flung harder)
  // and the breakup keeps the clumps mostly together, only easing apart late.
  const FAN_SPREAD = 0.34
  const breakup = burstBreakup(progress, force)

  for (let p = 0; p < total; p += 1) {
    const glob = burstGlob(seed, p, total)
    // Fan widens gently with breakup, but never to a fine mist.
    const dir = angle + glob.fan * FAN_SPREAD * (0.35 + breakup * 0.65)
    // Projectile flight. Yogurt's extra weight is encoded in `glob.reach` being
    // lower (it is thrown hard but does not travel as far), plus a stronger
    // downward pull applied here so the arc sags faster than water.
    const flight = burstProjectile(progress, dir, glob.reach * force)
    const extraDrop = burstFall(progress) * 0.35 * pxPerUnit * scale
    const px = x + flight.dx * 0.6 * pxPerUnit * scale
    const py = y + flight.dy * 0.6 * pxPerUnit * scale + extraDrop
    const radius = Math.max(1.2, 3.2 * glob.size * scale * (1 - progress * 0.3))

    // The sticky tail: a thick, round-capped string stretched behind the glob,
    // longer for globs with a higher `tail` factor and shrinking as it lands.
    const tail = glob.tail * 8 * scale * (1 - progress * 0.6)
    ctx.strokeStyle = rgba(rgb, alpha * 0.55)
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(1.2, radius * 1.1)
    ctx.beginPath()
    ctx.moveTo(px - Math.cos(dir) * tail, py - Math.sin(dir) * tail)
    ctx.lineTo(px, py)
    ctx.stroke()

    // The glob head: a solid, slightly opaque clump.
    ctx.fillStyle = rgba(rgb, alpha * 0.92)
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Draw all live bursts.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<import('../../core/burst.js').createBursts>} bursts
 * @param {number} now  Seconds on the performance.now() clock.
 * @param {Object} settings  `{ reduced, rgb, singleColor }`.
 * @param {number} width   Overlay width in px (for normalised travel distances).
 * @param {number} height  Overlay height in px.
 * @returns {boolean} True while at least one burst is still alive.
 */
export function drawBursts(ctx, bursts, now, settings, width, height) {
  const reduced = settings.reduced
  // Travel distances use the shorter axis so a burst never overflows a very
  // wide or very tall overlay by an order of magnitude.
  const pxPerUnit = Math.min(width, height)
  let alive = false

  for (let i = 0; i < bursts.count; i += 1) {
    const slot = burstIndex(bursts, i)
    const kind = bursts.kinds[slot] === 1 ? 'spray' : bursts.kinds[slot] === 2 ? 'yogurt' : 'confetti'
    const life = burstLife(kind, reduced)
    // `speed` scales the burst's clock: a faster burst ages quicker, so it
    // flies through the same path sooner and dies sooner — the particle
    // parameters never change, only how fast progress advances.
    const speed = bursts.speeds[slot] || 1
    // A burst is born on the first tick that draws it, not when the command
    // was issued. `fireBurst` writes a `born = -1` sentinel because the command
    // runs on `performance.now()` while this loop runs on the rAF clock — two
    // clocks that can disagree by a frame, which used to make `age` negative on
    // the first frame and silently kill the loop. Stamping the birth time here
    // guarantees `age >= 0` from the very first painted frame.
    if (bursts.born[slot] < 0) bursts.born[slot] = now
    const age = (now - bursts.born[slot]) * speed
    if (age < 0 || age > life) continue
    alive = true

    const progress = clamp(age / life, 0, 1)
    const x = bursts.xs[slot] * width
    const y = bursts.ys[slot] * height
    const angle = bursts.angle[slot]
    const seed = bursts.seeds[slot]
    // Per-burst parameters: each record carries its own size / intensity /
    // count / speed, so two commands with different settings never bleed
    // together. `intensity` is the launch force — it drives projectile reach,
    // height and the breakup shape, not opacity.
    const scale = bursts.sizes[slot]
    const force = bursts.intensities[slot] || 1
    const count = bursts.counts[slot]

    if (kind === 'spray') {
      paintSpray(ctx, x, y, angle, seed, progress, scale, force, pxPerUnit, settings.rgb, count)
    } else if (kind === 'yogurt') {
      // Yogurt defaults to its own warm off-white, unless the caller forced a
      // single `colorHex` (in which case `singleColor` is set and we follow it).
      const rgb = settings.singleColor ? settings.rgb : burstRgb(BURST_YOGURT_COLOR)
      paintYogurt(ctx, x, y, angle, seed, progress, scale, force, pxPerUnit, rgb, count)
    } else {
      paintConfetti(ctx, x, y, angle, seed, progress, scale, force, pxPerUnit, count)
    }
  }

  return alive
}
