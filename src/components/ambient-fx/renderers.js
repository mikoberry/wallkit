// Ambient particle drawing.
//
// One loop per variant, each reading the parameter table in `core/ambient.js`
// and calling a single `drawImage` of the pre-rendered sprite. No gradients, no
// paths, no shadow blur in here — those are all paid once when the sprite is
// built (see ./sprites.js).

import { AMBIENT_STRIDE, AMBIENT_SIZE, ambientOffset } from '../../core/ambient.js'

// Rewritten in place by `ambientOffset`, so a 60 fps loop allocates nothing.
const scratch = [0, 0, 0, 0]

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

// Each loop maps `y01` over the viewport plus a pad on both ends, so a particle
// enters and leaves the frame off screen instead of popping at the edge.

function drawFlakes(ctx, particles, count, t, unit, width, height, sprite, gain) {
  const pad = Math.max(24, unit * 6)
  const span = height + pad * 2

  for (let i = 0; i < count; i += 1) {
    const offset = i * AMBIENT_STRIDE
    ambientOffset('snow', particles, offset, t, scratch)
    const x = scratch[0] * width
    if (x < -pad || x > width + pad) continue
    const y = scratch[1] * span - pad
    const radius = particles[offset + AMBIENT_SIZE] * unit
    ctx.globalAlpha = clamp01(scratch[3] * gain)
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2)
  }
}

function drawPetals(ctx, particles, count, t, unit, width, height, sprite, gain) {
  const pad = Math.max(32, unit * 7)
  const span = height + pad * 2

  for (let i = 0; i < count; i += 1) {
    const offset = i * AMBIENT_STRIDE
    ambientOffset('sakura', particles, offset, t, scratch)
    const x = scratch[0] * width
    if (x < -pad || x > width + pad) continue
    const y = scratch[1] * span - pad
    const radius = particles[offset + AMBIENT_SIZE] * unit
    const rotation = scratch[2]
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)

    ctx.globalAlpha = clamp01(scratch[3] * gain)
    // setTransform instead of save/rotate/restore: one call per particle rather
    // than a state-stack push and pop on every petal.
    ctx.setTransform(cos, sin, -sin, cos, x, y)
    ctx.drawImage(sprite, -radius, -radius, radius * 2, radius * 2)
  }
}

function drawBubbles(ctx, particles, count, t, unit, width, height, sprite, gain) {
  const pad = Math.max(32, unit * 7)
  const span = height + pad * 2

  for (let i = 0; i < count; i += 1) {
    const offset = i * AMBIENT_STRIDE
    ambientOffset('bubble', particles, offset, t, scratch)
    const x = scratch[0] * width
    if (x < -pad || x > width + pad) continue
    const y = scratch[1] * span - pad
    const radius = particles[offset + AMBIENT_SIZE] * unit
    ctx.globalAlpha = clamp01(scratch[3] * gain)
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2)
  }
}

/**
 * Paint one frame.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} particles  Parameter table from `fillAmbientParticles`.
 * @param {number} count            Particles to draw (buffer may be longer).
 * @param {string} variant          Normalised variant.
 * @param {number} t                Seconds since the loop started.
 * @param {number} unit             Pixels per size factor 1.
 * @param {number} width            Canvas width in px.
 * @param {number} height           Canvas height in px.
 * @param {HTMLCanvasElement} sprite
 * @param {number} gain             Opacity multiplier from `intensity`.
 */
export function drawAmbient(
  ctx,
  particles,
  count,
  variant,
  t,
  unit,
  width,
  height,
  sprite,
  gain,
) {
  if (!sprite || count <= 0) return

  if (variant === 'sakura') {
    drawPetals(ctx, particles, count, t, unit, width, height, sprite, gain)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  } else if (variant === 'bubble') {
    drawBubbles(ctx, particles, count, t, unit, width, height, sprite, gain)
  } else {
    drawFlakes(ctx, particles, count, t, unit, width, height, sprite, gain)
  }

  ctx.globalAlpha = 1
}
