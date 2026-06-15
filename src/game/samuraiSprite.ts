import Phaser from 'phaser'

export const SAMURAI_SHEET_KEY = 'samurai-reference-sheet'
export const SAMURAI_SHEET_ASSET = '/assets/inuyasha.jpeg'

export interface SamuraiFrameCrop {
  x: number
  y: number
  width: number
  height: number
}

export const SAMURAI_FRAMES = {
  backIdle: { x: 0, y: 0, width: 38, height: 48 },
  backGuard: { x: 0, y: 106, width: 34, height: 52 },
  moveOne: { x: 194, y: 106, width: 35, height: 52 },
  moveTwo: { x: 235, y: 106, width: 36, height: 52 },
  slash: { x: 119, y: 160, width: 42, height: 58 },
} satisfies Record<string, SamuraiFrameCrop>

export function preloadSamuraiSheet(scene: Phaser.Scene) {
  if (!scene.textures.exists(SAMURAI_SHEET_KEY)) {
    scene.load.image(SAMURAI_SHEET_KEY, SAMURAI_SHEET_ASSET)
  }
}

export function createSamuraiFrameTexture(scene: Phaser.Scene, key: string, crop: SamuraiFrameCrop) {
  if (scene.textures.exists(key)) {
    return
  }

  const canvas = renderSamuraiFrame(scene, crop)
  if (!canvas) {
    return
  }

  scene.textures.addCanvas(key, canvas)
}

export function createSamuraiBreathFrameTexture(scene: Phaser.Scene, key: string, crop: SamuraiFrameCrop, frameIndex: number) {
  if (scene.textures.exists(key)) {
    return
  }

  const baseCanvas = renderSamuraiFrame(scene, crop)
  if (!baseCanvas) {
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  context.imageSmoothingEnabled = false
  const headBob = [0, 1, 2, 1][frameIndex % 4]
  const torsoBottom = Math.floor(crop.height * 0.72)
  const legsTop = Math.floor(crop.height * 0.66)
  context.drawImage(baseCanvas, 0, 0, crop.width, torsoBottom, 0, headBob, crop.width, torsoBottom)
  context.drawImage(baseCanvas, 0, legsTop, crop.width, crop.height - legsTop, 0, legsTop, crop.width, crop.height - legsTop)
  scene.textures.addCanvas(key, canvas)
}

function renderSamuraiFrame(scene: Phaser.Scene, crop: SamuraiFrameCrop) {
  const source = scene.textures.get(SAMURAI_SHEET_KEY).getSourceImage() as CanvasImageSource
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return undefined
  }

  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  const imageData = context.getImageData(0, 0, crop.width, crop.height)
  clearConnectedCheckerboard(imageData, crop.width, crop.height)
  context.putImageData(imageData, 0, 0)
  return canvas
}

function clearConnectedCheckerboard(imageData: ImageData, width: number, height: number) {
  const data = imageData.data
  const visited = new Uint8Array(width * height)
  const queue: number[] = []

  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return
    }

    const pixelIndex = y * width + x
    if (visited[pixelIndex]) {
      return
    }

    const dataIndex = pixelIndex * 4
    if (!isCheckerPixel(data, dataIndex)) {
      return
    }

    visited[pixelIndex] = 1
    queue.push(pixelIndex)
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }

  while (queue.length > 0) {
    const pixelIndex = queue.pop()
    if (pixelIndex === undefined) {
      continue
    }

    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    data[pixelIndex * 4 + 3] = 0
    enqueue(x + 1, y)
    enqueue(x - 1, y)
    enqueue(x, y + 1)
    enqueue(x, y - 1)
  }
}

function isCheckerPixel(data: Uint8ClampedArray, index: number) {
  const red = data[index]
  const green = data[index + 1]
  const blue = data[index + 2]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  return red > 184 && green > 184 && blue > 184 && max - min < 34
}
