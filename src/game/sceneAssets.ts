import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, PLAYER_JET_ASSET, PLAYER_JET_KEY } from './config'

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
}

export function createPlayerShip(scene: Phaser.Scene, x: number, y: number, height: number) {
  const ship = scene.add.image(x, y, PLAYER_JET_KEY)
  const displaySize = Math.round(height * 1.35)
  ship.setDisplaySize(displaySize, displaySize)
  return ship
}
