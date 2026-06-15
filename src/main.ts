import Phaser from 'phaser'
import './style.css'
import { DEBUG_HITBOXES, GAME_HEIGHT, GAME_WIDTH } from './game/config'
import { IntroScene } from './scenes/IntroScene'
import { ShooterScene } from './scenes/ShooterScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#050816',
  physics: {
    default: 'arcade',
    arcade: {
      debug: DEBUG_HITBOXES,
      debugShowBody: DEBUG_HITBOXES,
      debugShowStaticBody: DEBUG_HITBOXES,
      debugShowVelocity: false,
      gravity: { x: 0, y: 0 },
    },
  },
  scene: [IntroScene, ShooterScene],
  render: {
    pixelArt: true,
  },
  scale: {
    autoCenter: Phaser.Scale.CENTER_BOTH,
    mode: Phaser.Scale.FIT,
  },
}

const game = new Phaser.Game(config)

if (import.meta.env.DEV) {
  Object.assign(globalThis, { __SHOOTING_GAME__: game })
}
