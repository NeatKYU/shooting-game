import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from '../game/config'
import type { GameSettings } from '../game/types'

export function createBurst(scene: Phaser.Scene, x: number, y: number, color: number, count: number) {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Phaser.Math.FloatBetween(-0.18, 0.18)
    const distance = Phaser.Math.Between(14, 46)
    const particle = scene.add.circle(x, y, Phaser.Math.FloatBetween(2.2, 5.2), color, 0.86)
    particle.setDepth(16)
    scene.tweens.add({
      targets: particle,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      scale: 0.35,
      duration: Phaser.Math.Between(240, 460),
      ease: 'Cubic.easeOut',
      onComplete: () => particle.destroy(),
    })
  }
}

export function createGrazeSpark(scene: Phaser.Scene, x: number, y: number) {
  const spark = scene.add.circle(x, y, 8, 0x67e8f9, 0.18)
  spark.setStrokeStyle(1, 0x99f6e4, 0.82)
  spark.setDepth(14)
  scene.tweens.add({
    targets: spark,
    alpha: 0,
    scale: 2.2,
    duration: 180,
    ease: 'Cubic.easeOut',
    onComplete: () => spark.destroy(),
  })
}

export function flashScreen(scene: Phaser.Scene, color: number, alpha: number) {
  const flash = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, color, alpha)
  flash.setDepth(35)
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    duration: 220,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy(),
  })
}

export function shakeCamera(scene: Phaser.Scene, settings: GameSettings, duration: number, intensity: number) {
  if (settings.screenShake) {
    scene.cameras.main.shake(duration, intensity)
  }
}
