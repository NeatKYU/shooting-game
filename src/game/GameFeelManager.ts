import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH } from './config'
import { GAME_FEEL } from './gameFeelConstants'

export type GameFeelCounterKind = 'reflect' | 'wave'

type TintableGameObject = Phaser.GameObjects.GameObject & {
  setTint?: (color?: number) => unknown
  clearTint?: () => unknown
  setTintMode?: (mode?: Phaser.TintModes | number) => unknown
}

interface GameFeelManagerOptions {
  applyHitStop: (durationMs: number) => void
}

interface ParrySuccessOptions {
  x: number
  y: number
  bulletSprite: Phaser.GameObjects.GameObject
  onBulletFlashComplete: () => void
}

interface CounterShotLaunchOptions {
  x: number
  y: number
  targetX: number
  targetY: number
  kind: GameFeelCounterKind
}

interface BossHitOptions {
  boss: Phaser.GameObjects.Image
  x: number
  y: number
  kind: GameFeelCounterKind
}

export class GameFeelManager {
  private readonly scene: Phaser.Scene
  private readonly options: GameFeelManagerOptions
  private readonly trailElapsedMs = new WeakMap<Phaser.GameObjects.Sprite, number>()

  constructor(scene: Phaser.Scene, options: GameFeelManagerOptions) {
    this.scene = scene
    this.options = options
  }

  playParrySuccess({ x, y, bulletSprite, onBulletFlashComplete }: ParrySuccessOptions) {
    this.options.applyHitStop(GAME_FEEL.parry.hitStopMs)
    this.scene.cameras.main.shake(GAME_FEEL.parry.cameraShakeMs, GAME_FEEL.parry.cameraShakeIntensity)
    this.playOptionalSound(GAME_FEEL.audio.parrySuccessKey, GAME_FEEL.audio.parrySuccessVolume)
    this.createScreenFlash()
    this.createParryShockwave(x, y)
    this.emitParryParticles(x, y)
    this.flashBulletThenDestroy(bulletSprite, onBulletFlashComplete)
  }

  playPerfectParryStart(x: number, y: number, targetX: number, targetY: number) {
    this.createPerfectDim()
    this.createLaunchSlash(x, y, targetX, targetY)
  }

  playCounterShotLaunch({ x, y, targetX, targetY, kind }: CounterShotLaunchOptions) {
    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY)
    const color = kind === 'wave' ? 0xffffff : 0x67e8f9
    const accent = kind === 'wave' ? 0xfacc15 : 0xdbeafe
    const ring = this.scene.add.circle(x, y, kind === 'wave' ? 26 : 16, color, 0)
    ring.setStrokeStyle(kind === 'wave' ? 4 : 2, accent, kind === 'wave' ? 0.92 : 0.72)
    ring.setDepth(GAME_FEEL.depths.projectileLaunch)
    ring.setBlendMode(Phaser.BlendModes.ADD)

    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scale: GAME_FEEL.counterShot.launchRingScale,
      duration: GAME_FEEL.counterShot.launchRingMs,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })

    const flashLength = kind === 'wave' ? GAME_FEEL.perfectParry.launchSlashLength : 82
    const flash = this.scene.add.rectangle(
      x + Math.cos(angle) * flashLength * 0.32,
      y + Math.sin(angle) * flashLength * 0.32,
      flashLength,
      kind === 'wave' ? GAME_FEEL.perfectParry.launchSlashWidth : 6,
      color,
      kind === 'wave' ? 0.64 : 0.36,
    )
    flash.setRotation(angle)
    flash.setDepth(GAME_FEEL.depths.projectileLaunch)
    flash.setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 1.28,
      scaleY: 1.75,
      duration: GAME_FEEL.perfectParry.launchFlashMs,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    })
  }

  updateCounterShotTrail(sprite: Phaser.GameObjects.Sprite, kind: GameFeelCounterKind, deltaMs: number) {
    const intervalMs = kind === 'wave' ? GAME_FEEL.counterShot.waveTrailIntervalMs : GAME_FEEL.counterShot.reflectTrailIntervalMs
    const elapsedMs = (this.trailElapsedMs.get(sprite) ?? 0) + deltaMs
    if (elapsedMs < intervalMs) {
      this.trailElapsedMs.set(sprite, elapsedMs)
      return
    }

    this.trailElapsedMs.set(sprite, elapsedMs % intervalMs)
    this.createProjectileAfterimage(sprite, kind)
  }

  playBossHit({ boss, x, y, kind }: BossHitOptions) {
    const isWave = kind === 'wave'
    this.scene.cameras.main.shake(
      isWave ? GAME_FEEL.bossHit.waveCameraShakeMs : GAME_FEEL.bossHit.cameraShakeMs,
      isWave ? GAME_FEEL.bossHit.waveCameraShakeIntensity : GAME_FEEL.bossHit.cameraShakeIntensity,
    )
    this.applyTint(boss, 0xffffff)
    this.scene.time.delayedCall(GAME_FEEL.bossHit.blinkMs, () => {
      if (boss.active) {
        this.clearTint(boss)
      }
    })

    const blink = this.scene.add.image(boss.x, boss.y, boss.texture.key, boss.frame.name)
    blink.setOrigin(boss.originX, boss.originY)
    blink.setScale(boss.scaleX, boss.scaleY)
    blink.setAngle(boss.angle)
    blink.setFlipX(boss.flipX)
    blink.setFlipY(boss.flipY)
    blink.setTint(0xffffff)
    blink.setTintMode(Phaser.TintModes.FILL)
    blink.setAlpha(GAME_FEEL.bossHit.blinkAlpha)
    blink.setDepth(boss.depth + 1)
    blink.setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({
      targets: blink,
      alpha: 0,
      duration: GAME_FEEL.bossHit.blinkMs,
      ease: 'Quad.easeOut',
      onComplete: () => blink.destroy(),
    })

    const impact = this.scene.add.circle(x, y, isWave ? 24 : 15, 0xffffff, isWave ? 0.3 : 0.2)
    impact.setStrokeStyle(isWave ? 3 : 2, isWave ? 0xfacc15 : 0x67e8f9, isWave ? 0.9 : 0.64)
    impact.setDepth(GAME_FEEL.depths.impact)
    impact.setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({
      targets: impact,
      alpha: 0,
      scale: isWave ? 2.4 : 1.8,
      duration: isWave ? 240 : 170,
      ease: 'Cubic.easeOut',
      onComplete: () => impact.destroy(),
    })
  }

  private createScreenFlash() {
    const flash = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, GAME_FEEL.parry.screenFlashAlpha)
    flash.setDepth(GAME_FEEL.depths.screenFlash)
    flash.setScrollFactor(0)
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: GAME_FEEL.parry.screenFlashMs,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    })
  }

  private createPerfectDim() {
    const dim = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, GAME_FEEL.perfectParry.dimAlpha)
    dim.setDepth(GAME_FEEL.depths.screenDim)
    dim.setScrollFactor(0)
    this.scene.time.delayedCall(GAME_FEEL.perfectParry.dimMs, () => {
      if (!dim.active) {
        return
      }

      this.scene.tweens.add({
        targets: dim,
        alpha: 0,
        duration: GAME_FEEL.perfectParry.dimFadeMs,
        ease: 'Quad.easeOut',
        onComplete: () => dim.destroy(),
      })
    })
  }

  private createParryShockwave(x: number, y: number) {
    const wave = this.scene.add.circle(x, y, GAME_FEEL.parry.shockwaveStartRadius, 0xffffff, 0.06)
    wave.setStrokeStyle(3, 0xffffff, 0.92)
    wave.setDepth(GAME_FEEL.depths.impact)
    wave.setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({
      targets: wave,
      alpha: 0,
      scale: GAME_FEEL.parry.shockwaveEndScale,
      duration: GAME_FEEL.parry.shockwaveMs,
      ease: 'Cubic.easeOut',
      onComplete: () => wave.destroy(),
    })
  }

  private emitParryParticles(x: number, y: number) {
    const count = Phaser.Math.Between(GAME_FEEL.parry.particleMin, GAME_FEEL.parry.particleMax)
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Phaser.Math.FloatBetween(-0.24, 0.24)
      const distance = Phaser.Math.Between(GAME_FEEL.parry.particleMinDistance, GAME_FEEL.parry.particleMaxDistance)
      const particle = this.scene.add.circle(x, y, Phaser.Math.FloatBetween(2, 4.5), index % 3 === 0 ? 0xfacc15 : 0xffffff, 0.95)
      particle.setDepth(GAME_FEEL.depths.impact + 1)
      particle.setBlendMode(Phaser.BlendModes.ADD)
      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(GAME_FEEL.parry.particleMinMs, GAME_FEEL.parry.particleMaxMs),
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      })
    }
  }

  private flashBulletThenDestroy(bulletSprite: Phaser.GameObjects.GameObject, onComplete: () => void) {
    this.applyTint(bulletSprite, 0xffffff)
    this.scene.tweens.add({
      targets: bulletSprite,
      alpha: 0,
      scaleX: `*=${GAME_FEEL.parry.bulletFlashScale}`,
      scaleY: `*=${GAME_FEEL.parry.bulletFlashScale}`,
      duration: GAME_FEEL.parry.bulletFlashMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.clearTint(bulletSprite)
        onComplete()
      },
    })
  }

  private createLaunchSlash(x: number, y: number, targetX: number, targetY: number) {
    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY)
    const slash = this.scene.add.rectangle(
      x + Math.cos(angle) * GAME_FEEL.perfectParry.launchSlashLength * 0.22,
      y + Math.sin(angle) * GAME_FEEL.perfectParry.launchSlashLength * 0.22,
      GAME_FEEL.perfectParry.launchSlashLength,
      GAME_FEEL.perfectParry.launchSlashWidth,
      0xffffff,
      0.84,
    )
    slash.setRotation(angle)
    slash.setDepth(GAME_FEEL.depths.projectileLaunch + 1)
    slash.setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: 1.22,
      scaleY: 1.9,
      duration: GAME_FEEL.perfectParry.launchFlashMs,
      ease: 'Cubic.easeOut',
      onComplete: () => slash.destroy(),
    })
  }

  private createProjectileAfterimage(sprite: Phaser.GameObjects.Sprite, kind: GameFeelCounterKind) {
    const durationMs = kind === 'wave' ? GAME_FEEL.counterShot.waveTrailMs : GAME_FEEL.counterShot.reflectTrailMs
    const alpha = kind === 'wave' ? GAME_FEEL.counterShot.waveTrailAlpha : GAME_FEEL.counterShot.reflectTrailAlpha
    const afterimage = this.scene.add.sprite(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
    afterimage.setOrigin(sprite.originX, sprite.originY)
    afterimage.setRotation(sprite.rotation)
    afterimage.setScale(sprite.scaleX, sprite.scaleY)
    afterimage.setAlpha(alpha)
    afterimage.setDepth(Math.max(GAME_FEEL.depths.projectileTrail, sprite.depth - 1))
    afterimage.setBlendMode(Phaser.BlendModes.ADD)
    if (kind === 'wave') {
      afterimage.setTint(0x67e8f9)
    }

    this.scene.tweens.add({
      targets: afterimage,
      alpha: 0,
      scaleX: sprite.scaleX * (kind === 'wave' ? 1.08 : 1.04),
      scaleY: sprite.scaleY * (kind === 'wave' ? 1.08 : 1.04),
      duration: durationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => afterimage.destroy(),
    })
  }

  private playOptionalSound(key: string, volume: number) {
    if (!this.scene.cache.audio.exists(key)) {
      return
    }

    this.scene.sound.play(key, { volume })
  }

  private applyTint(gameObject: Phaser.GameObjects.GameObject, color: number) {
    const tintable = gameObject as TintableGameObject
    if (typeof tintable.setTint === 'function') {
      tintable.setTint(color)
      tintable.setTintMode?.(Phaser.TintModes.FILL)
    }

    if (gameObject instanceof Phaser.GameObjects.Container) {
      gameObject.each((child: Phaser.GameObjects.GameObject) => this.applyTint(child, color))
    }
  }

  private clearTint(gameObject: Phaser.GameObjects.GameObject) {
    const tintable = gameObject as TintableGameObject
    tintable.clearTint?.()

    if (gameObject instanceof Phaser.GameObjects.Container) {
      gameObject.each((child: Phaser.GameObjects.GameObject) => this.clearTint(child))
    }
  }
}
