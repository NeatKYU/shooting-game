import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, PLAYER_JET_ASSET, PLAYER_JET_KEY } from './config'

export const PLAYER_IDLE_ANIM_KEY = 'player-idle-breathe'
export const PLAYER_MOVE_ANIM_KEY = 'player-move-180'
export const PLAYER_BULLET_ANIM_KEY = 'player-basic-bullet-burn'

const PLAYER_IDLE_FRAME_KEYS = Array.from({ length: 9 }, (_, index) => `player-idle-frame-${index}`)
const PLAYER_MOVE_FRAME_KEYS = Array.from({ length: 9 }, (_, index) => `player-move-180-frame-${index}`)
const PLAYER_BULLET_FRAME_KEYS = Array.from({ length: 8 }, (_, index) => `player-basic-bullet-frame-${index}`)

function framePath(folder: 'idle' | 'move-180', index: number) {
  return `/assets/player/${folder}/frame_${index.toString().padStart(3, '0')}.png`
}

function bulletFramePath(index: number) {
  return `/assets/bullets/basic/frame_${index.toString().padStart(3, '0')}.png`
}

export function addStarfield(scene: Phaser.Scene, starCount: number) {
  scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x050816)

  for (let i = 0; i < starCount; i += 1) {
    const star = scene.add.circle(
      Phaser.Math.Between(0, GAME_WIDTH),
      Phaser.Math.Between(0, GAME_HEIGHT),
      Phaser.Math.FloatBetween(0.8, 2.1),
      0xffffff,
      Phaser.Math.FloatBetween(0.2, 0.82),
    )
    scene.tweens.add({
      targets: star,
      y: star.y + Phaser.Math.Between(16, 54),
      alpha: Phaser.Math.FloatBetween(0.12, 0.78),
      duration: Phaser.Math.Between(1_800, 4_200),
      ease: 'Sine.easeInOut',
      repeat: -1,
      yoyo: true,
    })
  }
}

export function preloadPlayerJet(scene: Phaser.Scene) {
  if (!scene.textures.exists(PLAYER_JET_KEY)) {
    scene.load.image(PLAYER_JET_KEY, PLAYER_JET_ASSET)
  }

  PLAYER_IDLE_FRAME_KEYS.forEach((key, index) => {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, framePath('idle', index))
    }
  })

  PLAYER_MOVE_FRAME_KEYS.forEach((key, index) => {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, framePath('move-180', index))
    }
  })

  PLAYER_BULLET_FRAME_KEYS.forEach((key, index) => {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, bulletFramePath(index))
    }
  })
}

export function createPlayerShip(scene: Phaser.Scene, x: number, y: number, height: number) {
  createPlayerAnimations(scene)

  const ship = scene.add.sprite(x, y, PLAYER_IDLE_FRAME_KEYS[0])
  const displaySize = Math.round(height * 1.35)
  ship.setDisplaySize(displaySize, displaySize)
  ship.play(PLAYER_IDLE_ANIM_KEY)
  return ship
}

function createPlayerAnimations(scene: Phaser.Scene) {
  if (!scene.anims.exists(PLAYER_IDLE_ANIM_KEY)) {
    scene.anims.create({
      key: PLAYER_IDLE_ANIM_KEY,
      frames: PLAYER_IDLE_FRAME_KEYS.map((key) => ({ key })),
      frameRate: 7,
      repeat: -1,
    })
  }

  if (!scene.anims.exists(PLAYER_MOVE_ANIM_KEY)) {
    scene.anims.create({
      key: PLAYER_MOVE_ANIM_KEY,
      frames: PLAYER_MOVE_FRAME_KEYS.map((key) => ({ key })),
      frameRate: 12,
      repeat: -1,
    })
  }

  createPlayerBulletAnimation(scene)
}

export function createPlayerBulletAnimation(scene: Phaser.Scene) {
  if (!scene.anims.exists(PLAYER_BULLET_ANIM_KEY)) {
    scene.anims.create({
      key: PLAYER_BULLET_ANIM_KEY,
      frames: PLAYER_BULLET_FRAME_KEYS.map((key) => ({ key })),
      frameRate: 18,
      repeat: -1,
    })
  }
}
