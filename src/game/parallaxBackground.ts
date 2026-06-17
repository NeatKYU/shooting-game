import Phaser from 'phaser'
import {
  BG_FAR_SCROLL,
  BG_MID_ALPHA,
  BG_MID_SCROLL,
  BG_NEAR_SCROLL,
  BG_PLATEAU_NEAR_ASSET,
  BG_PLATEAU_NEAR_KEY,
  BG_SCENE_ASSET,
  BG_SCENE_KEY,
  GAME_HEIGHT,
  GAME_WIDTH,
} from './config'

export function preloadParallaxBackground(scene: Phaser.Scene) {
  if (!scene.textures.exists(BG_SCENE_KEY)) {
    scene.load.image(BG_SCENE_KEY, BG_SCENE_ASSET)
  }
  if (!scene.textures.exists(BG_PLATEAU_NEAR_KEY)) {
    scene.load.image(BG_PLATEAU_NEAR_KEY, BG_PLATEAU_NEAR_ASSET)
  }
}

interface ScrollLayer {
  sprite: Phaser.GameObjects.TileSprite
  speed: number
}

/**
 * Top-down canyon flyover background built from the desert tileset.
 *
 * Parallax (시차 스크롤) via separate, stacked layers that each descend at their
 * own speed, so the scene reads with depth:
 * - 원경 (far): the canyon scene — tileset rows 0-5 in their painted arrangement,
 *   repeated vertically so it never breaks — drifting down slowly.
 * - 중경 (mid): the same scene again, translucent and a touch faster, layered over
 *   the far one to deepen the canyon (겹겹이 쌓기).
 * - 근경 (near): the plateau the player skims, rushing down fast → 속도감. Its
 *   centre is feathered to transparent so it blends smoothly over the canyon
 *   instead of cutting a hard edge.
 */
export class ParallaxBackground {
  private readonly layers: ScrollLayer[] = []

  constructor(scene: Phaser.Scene) {
    // Solid base so nothing shows through while textures stream in.
    scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x140b07).setDepth(-120)

    const fullScreen = (key: string) =>
      scene.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, key)

    // 원경 — distant canyon scene.
    this.addLayer(fullScreen(BG_SCENE_KEY).setDepth(-114), BG_FAR_SCROLL)

    // 중경 — same scene stacked translucently for layered depth.
    this.addLayer(fullScreen(BG_SCENE_KEY).setDepth(-107).setAlpha(BG_MID_ALPHA), BG_MID_SCROLL)

    // 근경 — near plateau, feathered centre reveals the canyon below.
    this.addLayer(fullScreen(BG_PLATEAU_NEAR_KEY).setDepth(-100), BG_NEAR_SCROLL)
  }

  private addLayer(sprite: Phaser.GameObjects.TileSprite, speed: number) {
    this.layers.push({ sprite, speed })
  }

  update(dtSeconds: number) {
    for (const layer of this.layers) {
      // Subtract so the texture appears to travel downward (top → bottom).
      layer.sprite.tilePositionY -= layer.speed * dtSeconds
    }
  }
}
