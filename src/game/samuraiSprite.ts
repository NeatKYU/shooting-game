import Phaser from 'phaser'

export type SamuraiDirection = 'ne' | 'n' | 'nw'

export const SAMURAI_IDLE_FRAME_COUNT = 4

const SAMURAI_ASSETS = {
  ne: {
    baseKey: 'samurai-ne-base',
    baseAsset: '/pixellab/ne/base.png',
    attackKey: 'samurai-ne-attack',
    attackAsset: '/pixellab/ne/attack.png',
  },
  n: {
    baseKey: 'samurai-n-base',
    baseAsset: '/pixellab/n/base.png',
    attackKey: 'samurai-n-attack',
    attackAsset: '/pixellab/n/attack.png',
  },
  nw: {
    baseKey: 'samurai-nw-base',
    baseAsset: '/pixellab/nw/base.png',
    attackKey: 'samurai-nw-attack',
    attackAsset: '/pixellab/nw/attack.png',
  },
} satisfies Record<SamuraiDirection, { baseKey: string; baseAsset: string; attackKey: string; attackAsset: string }>

export function preloadSamuraiAssets(scene: Phaser.Scene) {
  const directions = Object.keys(SAMURAI_ASSETS) as SamuraiDirection[]
  directions.forEach((direction) => {
    const asset = SAMURAI_ASSETS[direction]
    if (!scene.textures.exists(asset.baseKey)) {
      scene.load.image(asset.baseKey, asset.baseAsset)
    }

    if (!scene.textures.exists(asset.attackKey)) {
      scene.load.image(asset.attackKey, asset.attackAsset)
    }

    for (let frameIndex = 0; frameIndex < SAMURAI_IDLE_FRAME_COUNT; frameIndex += 1) {
      const textureKey = getSamuraiIdleTexture(direction, frameIndex)
      if (!scene.textures.exists(textureKey)) {
        scene.load.image(textureKey, getSamuraiIdleFrameAsset(direction, frameIndex))
      }
    }
  })
}

export function getSamuraiDirectionForLane(lane: number): SamuraiDirection {
  if (lane <= 0) {
    return 'ne'
  }

  if (lane >= 2) {
    return 'nw'
  }

  return 'n'
}

export function getSamuraiBaseTexture(direction: SamuraiDirection) {
  return SAMURAI_ASSETS[direction].baseKey
}

export function getSamuraiAttackTexture(direction: SamuraiDirection) {
  return SAMURAI_ASSETS[direction].attackKey
}

export function getSamuraiIdleTexture(direction: SamuraiDirection, frameIndex: number) {
  return `samurai-${direction}-idle-${frameIndex % SAMURAI_IDLE_FRAME_COUNT}`
}

function getSamuraiIdleFrameAsset(direction: SamuraiDirection, frameIndex: number) {
  const normalizedFrame = (frameIndex % SAMURAI_IDLE_FRAME_COUNT).toString().padStart(3, '0')
  return `/pixellab/${direction}/idle/frame_${normalizedFrame}.png`
}
