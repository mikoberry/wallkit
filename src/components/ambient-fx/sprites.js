// Pre-rendered particle sprites.
//
// The obvious way to draw a soft snowflake is a canvas arc with `shadowBlur`,
// or a fresh radial gradient per particle per frame. Both are far too expensive
// for a layer that runs at 60 fps for hours: gradients are built in JavaScript
// each frame and shadow blur is one of the slowest 2D operations there is.
//
// So each variant is painted once into a small offscreen canvas and the draw
// loop only calls `drawImage`. Down-scaling a 64 px sprite to the 4-16 px a
// particle actually occupies also gives smoother edges than drawing an arc at
// that size directly.
//
// Sprites are rebuilt only when the variant or the colour changes.

/** Sprite bitmap edge in px. Drawn down to the particle's size each frame. */
export const AMBIENT_SPRITE_SIZE = 64

const HALF = AMBIENT_SPRITE_SIZE / 2

function canvasOf(size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return canvas
}

/**
 * @param {[number, number, number]} rgb
 * @param {number} alpha
 */
function rgba([r, g, b], alpha) {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Soft round flake: a white-hot centre fading to nothing. */
function paintSnow(ctx, rgb) {
  const gradient = ctx.createRadialGradient(HALF, HALF, 0, HALF, HALF, HALF - 2)
  gradient.addColorStop(0, rgba(rgb, 1))
  gradient.addColorStop(0.32, rgba(rgb, 0.62))
  gradient.addColorStop(0.66, rgba(rgb, 0.16))
  gradient.addColorStop(1, rgba(rgb, 0))
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(HALF, HALF, HALF - 2, 0, Math.PI * 2)
  ctx.fill()
}

/** Cherry petal: rounded body with the characteristic notch at the tip. */
function paintPetal(ctx, rgb) {
  const top = HALF * 0.28
  const bottom = HALF * 1.72

  ctx.fillStyle = rgba(rgb, 1)
  ctx.beginPath()
  ctx.moveTo(HALF, top)
  ctx.bezierCurveTo(HALF * 1.62, HALF * 0.66, HALF * 1.68, HALF * 1.42, HALF, bottom)
  ctx.bezierCurveTo(HALF * 0.32, HALF * 1.42, HALF * 0.38, HALF * 0.66, HALF, top)
  ctx.fill()

  // Cutting the notch with `destination-out` keeps the silhouette clean without
  // having to model the indentation in the outline itself.
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(HALF, top + 2, HALF * 0.19, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

/** Soap bubble: a thin rim plus one specular highlight. */
function paintBubble(ctx, rgb) {
  ctx.strokeStyle = rgba(rgb, 0.9)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(HALF, HALF, HALF * 0.78, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = rgba(rgb, 0.32)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(HALF, HALF, HALF * 0.62, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.beginPath()
  ctx.arc(HALF * 0.7, HALF * 0.62, HALF * 0.13, 0, Math.PI * 2)
  ctx.fill()
}

/** Steam bank: the same diffuse mass as fog — the draw loop stretches it
 * along the rise instead. Only the tint differs (see the presets). */
function paintSteam(ctx, rgb) {
  paintFog(ctx, rgb)
}

/** Rain streak: a thin vertical bar, transparent head into a bright tail. */
function paintRain(ctx, rgb) {
  const gradient = ctx.createLinearGradient(0, 6, 0, AMBIENT_SPRITE_SIZE - 6)
  gradient.addColorStop(0, rgba(rgb, 0))
  gradient.addColorStop(0.6, rgba(rgb, 0.85))
  gradient.addColorStop(1, rgba(rgb, 0.3))
  ctx.fillStyle = gradient
  ctx.fillRect(HALF - 3, 6, 6, AMBIENT_SPRITE_SIZE - 12)
}

/** Fog bank: a very diffuse mass with a horizontal bias. */
function paintFog(ctx, rgb) {
  const lobes = [
    [HALF, HALF, HALF * 0.72],
    [HALF * 0.62, HALF * 0.94, HALF * 0.44],
    [HALF * 1.4, HALF * 1.06, HALF * 0.44],
  ]
  for (const [cx, cy, r] of lobes) {
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    gradient.addColorStop(0, rgba(rgb, 0.6))
    gradient.addColorStop(0.5, rgba(rgb, 0.26))
    gradient.addColorStop(1, rgba(rgb, 0))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Autumn leaf: a pointed lens with a pale midrib; the spin comes from the loop. */
function paintLeaf(ctx, rgb) {
  ctx.fillStyle = rgba(rgb, 1)
  ctx.beginPath()
  ctx.moveTo(HALF, HALF * 0.24)
  ctx.bezierCurveTo(HALF * 1.52, HALF * 0.72, HALF * 1.5, HALF * 1.32, HALF, HALF * 1.76)
  ctx.bezierCurveTo(HALF * 0.48, HALF * 1.32, HALF * 0.5, HALF * 0.72, HALF, HALF * 0.24)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(HALF, HALF * 0.34)
  ctx.quadraticCurveTo(HALF * 1.04, HALF, HALF, HALF * 1.66)
  ctx.stroke()
}

/**
 * Build the sprite for one variant and colour.
 *
 * @param {string} variant  Already normalised by the caller.
 * @param {[number, number, number]} rgb
 * @returns {HTMLCanvasElement|null} `null` when there is no DOM to paint into
 */
export function createAmbientSprite(variant, rgb) {
  if (typeof document === 'undefined') return null
  const canvas = canvasOf(AMBIENT_SPRITE_SIZE)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  if (variant === 'sakura') paintPetal(ctx, rgb)
  else if (variant === 'bubble') paintBubble(ctx, rgb)
  else if (variant === 'steam') paintSteam(ctx, rgb)
  else if (variant === 'rain') paintRain(ctx, rgb)
  else if (variant === 'fog') paintFog(ctx, rgb)
  else if (variant === 'leaves') paintLeaf(ctx, rgb)
  else paintSnow(ctx, rgb)

  return canvas
}


