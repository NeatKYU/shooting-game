import Phaser from 'phaser'
import { DIFFICULTIES } from '../data/difficulties'
import { ENEMY_ARCHETYPES } from '../data/enemies'
import { DEMO_STAGE } from '../data/demoStage'
import { playTone } from '../game/audio'
import {
  DEBUG_HITBOXES,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAX_BOMBS,
  MAX_WEAPON_LEVEL,
  MONO_FONT,
  PLAYER_BOMB_INVULNERABLE_MS,
  PLAYER_BULLET_SPEED,
  PLAYER_FIRE_MS,
  PLAYER_GRAZE_RADIUS,
  PLAYER_HIT_INVULNERABLE_MS,
  PLAYER_JET_KEY,
  PLAYER_SLOW_SPEED,
  PLAYER_SPEED,
  POWER_UP_DRIFT_SPEED,
  POWER_UP_LIFETIME_MS,
  POWER_UP_SPEED,
  POWER_UP_TURN_MS,
  UI_FONT,
} from '../game/config'
import { text } from '../game/localization'
import { formatScore, loadBestScore, saveBestScore } from '../game/score'
import { addStarfield, createPlayerShip, preloadPlayerJet } from '../game/sceneAssets'
import { DEFAULT_SETTINGS, cloneSettings, keyNameToCode, loadSettings } from '../game/settings'
import type {
  ArcadeOverlapObject,
  Boss,
  BulletPattern,
  ClearBonusBreakdown,
  Enemy,
  EnemyBullet,
  GameMode,
  PhysicsEllipse,
  PhysicsImage,
  PhysicsRectangle,
  PlayerBullet,
  PowerUp,
  ShooterSceneData,
  StageEnemyEvent,
} from '../game/types'
import { createBurst, createGrazeSpark, flashScreen, shakeCamera } from '../systems/effects'

export class ShooterScene extends Phaser.Scene {
  private settings = cloneSettings(DEFAULT_SETTINGS)
  private mode: GameMode = 'demo'
  private stage = DEMO_STAGE
  private difficulty = DIFFICULTIES.novice
  private player!: PhysicsImage
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private fireKey!: Phaser.Input.Keyboard.Key
  private slowKey!: Phaser.Input.Keyboard.Key
  private bombKey!: Phaser.Input.Keyboard.Key
  private wasdKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>
  private scoreText!: Phaser.GameObjects.Text
  private bestText!: Phaser.GameObjects.Text
  private chainText!: Phaser.GameObjects.Text
  private grazeText!: Phaser.GameObjects.Text
  private lifeIcons: Phaser.GameObjects.Image[] = []
  private bombIcons: Phaser.GameObjects.Rectangle[] = []
  private statusText!: Phaser.GameObjects.Text
  private bossBarFrame!: Phaser.GameObjects.Rectangle
  private bossBarFill!: Phaser.GameObjects.Rectangle
  private bossNameText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
  private hitboxCore!: Phaser.GameObjects.Ellipse
  private hitboxRing!: Phaser.GameObjects.Ellipse
  private resultPanel?: Phaser.GameObjects.Container
  private playerBulletsGroup!: Phaser.Physics.Arcade.Group
  private powerUpsGroup!: Phaser.Physics.Arcade.Group
  private enemyBulletsGroup!: Phaser.Physics.Arcade.Group
  private enemiesGroup!: Phaser.Physics.Arcade.Group
  private bossGroup!: Phaser.Physics.Arcade.Group
  private bullets: PlayerBullet[] = []
  private powerUps: PowerUp[] = []
  private enemyBullets: EnemyBullet[] = []
  private enemies: Enemy[] = []
  private boss?: Boss
  private score = 0
  private displayedBestScore = 0
  private lives = 0
  private bombs = MAX_BOMBS
  private weaponLevel = 1
  private nextStageEventIndex = 0
  private stageStartedAt = 0
  private invulnerableUntil = 0
  private lastPlayerShot = -PLAYER_FIRE_MS
  private statusMessageUntil = 0
  private isGameOver = false
  private isStageClear = false
  private chain = 0
  private maxChain = 0
  private multiplier = 1
  private lastChainAt = 0
  private grazeCount = 0
  private noMissRun = true
  private noBombRun = true
  private clearTimeMs = 0

  constructor() {
    super('ShooterScene')
  }

  init(data: ShooterSceneData) {
    this.settings = data.settings ? cloneSettings(data.settings) : loadSettings()
    this.mode = data.mode ?? 'demo'
    this.difficulty = DIFFICULTIES[this.settings.difficulty]
  }

  preload() {
    preloadPlayerJet(this)
  }

  create() {
    this.resetGameState()
    addStarfield(this, this.stage.starCount)

    this.player = createPlayerShip(this, GAME_WIDTH / 2, GAME_HEIGHT - 74, 76) as PhysicsImage
    this.createPhysicsBodies()
    this.createInput()
    this.createHud()
    this.createBossUi()
    this.createHitboxDisplay()
    this.registerPhysicsOverlaps()

    this.statusText.setText(
      this.mode === 'practice'
        ? text({ ko: '보스 연습 시작', en: 'Boss practice start' }, this.settings.language)
        : text({ ko: '데모 런 시작', en: 'Demo run start' }, this.settings.language),
    )
  }

  update(time: number, delta: number) {
    if (this.stageStartedAt === 0) {
      this.stageStartedAt = this.mode === 'practice' ? time - this.stage.bossAppearMs : time
      if (this.mode === 'practice') {
        this.nextStageEventIndex = this.stage.events.length
      }
    }

    if (this.isGameOver || this.isStageClear) {
      if (Phaser.Input.Keyboard.JustDown(this.fireKey)) {
        this.scene.restart({ settings: this.settings, mode: this.mode } satisfies ShooterSceneData)
      }

      if (Phaser.Input.Keyboard.JustDown(this.bombKey)) {
        this.scene.start('IntroScene')
      }

      return
    }

    const dt = delta / 1000
    const elapsedMs = time - this.stageStartedAt

    this.updatePlayer()
    this.updateHitboxDisplay(time)

    if (this.fireKey.isDown && time - this.lastPlayerShot >= PLAYER_FIRE_MS) {
      this.fireBullet()
      this.lastPlayerShot = time
    }

    if (Phaser.Input.Keyboard.JustDown(this.bombKey)) {
      this.useBomb(time)
    }

    this.spawnStageEnemies(elapsedMs)
    this.maybeSpawnBoss(elapsedMs)
    this.updateStatus(time, elapsedMs)
    this.updateChain(time)
    this.updateBullets()
    this.updatePowerUps()
    this.updateEnemyBullets()
    this.updateEnemies(elapsedMs, dt)
    this.updateBoss(elapsedMs)
  }

  private createInput() {
    const keyboard = this.input.keyboard
    if (!keyboard) {
      throw new Error('Keyboard input is not available.')
    }

    this.cursors = keyboard.createCursorKeys()
    this.fireKey = keyboard.addKey(keyNameToCode(this.settings.controls.fire))
    this.slowKey = keyboard.addKey(keyNameToCode(this.settings.controls.slow))
    this.bombKey = keyboard.addKey(keyNameToCode(this.settings.controls.bomb))
    this.wasdKeys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
  }

  private createHud() {
    this.add.text(20, 16, text(this.stage.title, this.settings.language), {
      color: '#bae6fd',
      fontFamily: MONO_FONT,
      fontSize: '15px',
    })

    this.scoreText = this.add.text(20, 40, 'SCORE 0', {
      color: '#e5e7eb',
      fontFamily: MONO_FONT,
      fontSize: '17px',
    })

    this.displayedBestScore = loadBestScore(this.settings, this.mode)
    this.bestText = this.add.text(20, 62, `BEST ${formatScore(this.displayedBestScore)}`, {
      color: '#c4b5fd',
      fontFamily: MONO_FONT,
      fontSize: '14px',
    })

    this.weaponText = this.add.text(20, 82, 'WEAPON Lv.1', {
      color: '#fde68a',
      fontFamily: MONO_FONT,
      fontSize: '14px',
    })

    this.chainText = this.add
      .text(GAME_WIDTH - 20, 42, 'x1.00  CHAIN 0', {
        color: '#bbf7d0',
        fontFamily: MONO_FONT,
        fontSize: '14px',
      })
      .setOrigin(1, 0)

    this.grazeText = this.add
      .text(GAME_WIDTH - 20, 62, 'GRAZE 0', {
        color: '#a7f3d0',
        fontFamily: MONO_FONT,
        fontSize: '14px',
      })
      .setOrigin(1, 0)

    this.add
      .text(GAME_WIDTH - 20, 18, text({ ko: '목숨', en: 'LIFE' }, this.settings.language), {
        color: '#fecdd3',
        fontFamily: MONO_FONT,
        fontSize: '16px',
      })
      .setOrigin(1, 0)

    this.lifeIcons = []
    for (let index = 0; index < this.difficulty.lives; index += 1) {
      const icon = this.add.image(GAME_WIDTH - 26 - index * 25, 97, PLAYER_JET_KEY)
      icon.setDisplaySize(15, 21)
      this.lifeIcons.push(icon)
    }

    this.bombIcons = []
    for (let index = 0; index < MAX_BOMBS; index += 1) {
      const icon = this.add.rectangle(GAME_WIDTH - 28 - index * 24, 126, 16, 16, 0xfde68a, 0.95)
      icon.setAngle(45)
      icon.setStrokeStyle(2, 0xfffbeb, 0.9)
      this.bombIcons.push(icon)
    }

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 106, '', {
        align: 'center',
        color: '#93c5fd',
        fontFamily: UI_FONT,
        fontSize: '15px',
      })
      .setOrigin(0.5, 0)

    this.updateLivesDisplay()
    this.updateBombDisplay()
    this.updateScoreDisplay()
  }

  private createPhysicsBodies() {
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT)
    this.physics.add.existing(this.player)
    this.player.body.setAllowGravity(false)
    this.player.body.setSize(16, 16, true)

    const groupDefaults: Phaser.Types.Physics.Arcade.PhysicsGroupConfig = {
      allowGravity: false,
      immovable: true,
    }

    this.playerBulletsGroup = this.physics.add.group(groupDefaults)
    this.powerUpsGroup = this.physics.add.group(groupDefaults)
    this.enemyBulletsGroup = this.physics.add.group(groupDefaults)
    this.enemiesGroup = this.physics.add.group(groupDefaults)
    this.bossGroup = this.physics.add.group(groupDefaults)
  }

  private registerPhysicsOverlaps() {
    this.physics.add.overlap(this.playerBulletsGroup, this.enemiesGroup, this.onPlayerBulletHitsEnemy, undefined, this)
    this.physics.add.overlap(this.playerBulletsGroup, this.bossGroup, this.onPlayerBulletHitsBoss, undefined, this)
    this.physics.add.overlap(this.player, this.powerUpsGroup, this.onPlayerCollectsPowerUp, undefined, this)
    this.physics.add.overlap(this.player, this.enemyBulletsGroup, this.onEnemyBulletHitsPlayer, undefined, this)
    this.physics.add.overlap(this.player, this.enemiesGroup, this.onEnemyHitsPlayer, undefined, this)
  }

  private createBossUi() {
    this.bossBarFrame = this.add.rectangle(GAME_WIDTH / 2, 14, 260, 10, 0x020617, 0.88)
    this.bossBarFrame.setStrokeStyle(1, 0xfda4af, 0.9)
    this.bossBarFill = this.add.rectangle(GAME_WIDTH / 2 - 128, 14, 256, 6, 0xfb7185, 1)
    this.bossBarFill.setOrigin(0, 0.5)
    this.bossNameText = this.add
      .text(GAME_WIDTH / 2, 24, text(this.stage.boss.name, this.settings.language), {
        color: '#fecdd3',
        fontFamily: MONO_FONT,
        fontSize: '14px',
      })
      .setOrigin(0.5, 0)
    this.setBossUiVisible(false)
  }

  private setBossUiVisible(visible: boolean) {
    this.bossBarFrame.setVisible(visible)
    this.bossBarFill.setVisible(visible)
    this.bossNameText.setVisible(visible)
  }

  private createHitboxDisplay() {
    this.hitboxRing = this.add.ellipse(this.player.x, this.player.y, PLAYER_GRAZE_RADIUS * 2, PLAYER_GRAZE_RADIUS * 2, 0x67e8f9, 0.04)
    this.hitboxRing.setStrokeStyle(1, 0x67e8f9, 0.2)
    this.hitboxRing.setDepth(12)
    this.hitboxCore = this.add.ellipse(this.player.x, this.player.y, 10, 10, 0xffffff, 0.92)
    this.hitboxCore.setStrokeStyle(2, 0x38bdf8, 1)
    this.hitboxCore.setDepth(13)
  }

  private enableRectanglePhysics(
    body: Phaser.GameObjects.Rectangle,
    group: Phaser.Physics.Arcade.Group,
    width: number,
    height: number,
    directControl = false,
  ) {
    const physicsBody = this.physics.add.existing(body) as PhysicsRectangle
    physicsBody.body.setAllowGravity(false)
    physicsBody.body.setImmovable(true)
    physicsBody.body.setSize(width, height, true)
    physicsBody.body.setDirectControl(directControl)
    group.add(physicsBody)
    return physicsBody
  }

  private enableEllipsePhysics(body: Phaser.GameObjects.Ellipse, group: Phaser.Physics.Arcade.Group, radius: number) {
    const physicsBody = this.physics.add.existing(body) as PhysicsEllipse
    physicsBody.body.setAllowGravity(false)
    physicsBody.body.setImmovable(true)
    physicsBody.body.setCircle(radius)
    group.add(physicsBody)
    return physicsBody
  }

  private getPhysicsGameObject(object: ArcadeOverlapObject) {
    if ('body' in object) {
      return object
    }

    return (object as Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody).gameObject
  }

  private resetGameState() {
    this.bullets = []
    this.powerUps = []
    this.enemyBullets = []
    this.enemies = []
    this.lifeIcons = []
    this.bombIcons = []
    this.boss = undefined
    this.resultPanel = undefined
    this.score = 0
    this.displayedBestScore = 0
    this.lives = this.difficulty.lives
    this.bombs = MAX_BOMBS
    this.weaponLevel = 1
    this.nextStageEventIndex = 0
    this.stageStartedAt = 0
    this.invulnerableUntil = 0
    this.lastPlayerShot = -PLAYER_FIRE_MS
    this.statusMessageUntil = 0
    this.isGameOver = false
    this.isStageClear = false
    this.chain = 0
    this.maxChain = 0
    this.multiplier = 1
    this.lastChainAt = 0
    this.grazeCount = 0
    this.noMissRun = true
    this.noBombRun = true
    this.clearTimeMs = 0
  }

  private updatePlayer() {
    const clampedX = Phaser.Math.Clamp(this.player.x, 28, GAME_WIDTH - 28)
    const clampedY = Phaser.Math.Clamp(this.player.y, 128, GAME_HEIGHT - 30)
    if (clampedX !== this.player.x || clampedY !== this.player.y) {
      this.player.body.reset(clampedX, clampedY)
    }

    let dx = 0
    let dy = 0

    if (this.cursors.left.isDown || this.wasdKeys.left.isDown) {
      dx -= 1
    }

    if (this.cursors.right.isDown || this.wasdKeys.right.isDown) {
      dx += 1
    }

    if (this.cursors.up.isDown || this.wasdKeys.up.isDown) {
      dy -= 1
    }

    if (this.cursors.down.isDown || this.wasdKeys.down.isDown) {
      dy += 1
    }

    const length = Math.hypot(dx, dy) || 1
    const speed = this.slowKey.isDown ? PLAYER_SLOW_SPEED : PLAYER_SPEED
    const vx = (dx / length) * speed
    const vy = (dy / length) * speed

    this.player.body.setVelocity(
      (this.player.x <= 28 && vx < 0) || (this.player.x >= GAME_WIDTH - 28 && vx > 0) ? 0 : vx,
      (this.player.y <= 128 && vy < 0) || (this.player.y >= GAME_HEIGHT - 30 && vy > 0) ? 0 : vy,
    )
  }

  private updateHitboxDisplay(time: number) {
    const shouldShow = this.settings.showHitbox || this.slowKey.isDown || time < this.invulnerableUntil
    this.hitboxRing.setPosition(this.player.x, this.player.y)
    this.hitboxCore.setPosition(this.player.x, this.player.y)
    this.hitboxRing.setVisible(shouldShow)
    this.hitboxCore.setVisible(shouldShow)
    this.hitboxRing.setAlpha(this.slowKey.isDown ? 0.2 : 0.08)
  }

  private fireBullet() {
    if (this.weaponLevel === 1) {
      this.createPlayerBullet(this.player.x, this.player.y - 42, -Math.PI / 2)
      playTone(this.settings, 720, 35, 'square', 0.035)
      return
    }

    if (this.weaponLevel === 2) {
      this.createPlayerBullet(this.player.x - 10, this.player.y - 42, -Math.PI / 2)
      this.createPlayerBullet(this.player.x + 10, this.player.y - 42, -Math.PI / 2)
      playTone(this.settings, 790, 35, 'square', 0.035)
      return
    }

    this.createPlayerBullet(this.player.x - 9, this.player.y - 42, -Math.PI / 2 - 0.24)
    this.createPlayerBullet(this.player.x, this.player.y - 46, -Math.PI / 2)
    this.createPlayerBullet(this.player.x + 9, this.player.y - 42, -Math.PI / 2 + 0.24)
    playTone(this.settings, 860, 35, 'square', 0.035)
  }

  private createPlayerBullet(x: number, y: number, angle: number) {
    const body = this.enableRectanglePhysics(this.add.rectangle(x, y, 7, 24, 0xfacc15), this.playerBulletsGroup, 7, 24)
    body.setStrokeStyle(1, 0xfef08a)
    body.setRotation(angle + Math.PI / 2)
    body.body.setVelocity(Math.cos(angle) * PLAYER_BULLET_SPEED, Math.sin(angle) * PLAYER_BULLET_SPEED)
    const debug = this.createDebugRect(body.x, body.y, 7, 24, 0x22d3ee)
    this.bullets.push({ body, debug })
  }

  private useBomb(time: number) {
    if (this.bombs <= 0 || time < this.invulnerableUntil) {
      return
    }

    this.bombs -= 1
    this.noBombRun = false
    this.invulnerableUntil = time + PLAYER_BOMB_INVULNERABLE_MS
    this.updateBombDisplay()
    this.statusMessageUntil = time + 1_000
    this.statusText.setText(text({ ko: '폭탄! 탄 소거 + 긴급 무적', en: 'Bomb! Bullet cancel + invulnerability' }, this.settings.language))
    this.statusText.setColor('#fde68a')
    this.enemyBullets.forEach((bullet) => {
      createBurst(this, bullet.body.x, bullet.body.y, 0xfde68a, 4)
      this.destroyEnemyBullet(bullet)
    })
    this.enemyBullets = []

    this.enemies.forEach((enemy) => {
      enemy.hp -= 2
      createBurst(this, enemy.body.x, enemy.body.y, 0xfef3c7, 5)
      if (enemy.hp <= 0) {
        this.addScore(enemy.archetype.score, true)
        this.destroyEnemy(enemy)
      }
    })
    this.enemies = this.enemies.filter((enemy) => enemy.hp > 0)

    if (this.boss) {
      this.boss.hp -= 24
      this.updateBossHealthBar()
      if (this.boss.hp <= 0) {
        this.clearStage()
      }
    }

    flashScreen(this, 0xfde68a, 0.18)
    shakeCamera(this, this.settings, 180, 0.01)
    playTone(this.settings, 130, 220, 'sawtooth', 0.22)
  }

  private spawnStageEnemies(elapsedMs: number) {
    while (
      this.nextStageEventIndex < this.stage.events.length &&
      elapsedMs >= this.stage.events[this.nextStageEventIndex].timeMs
    ) {
      this.spawnEnemy(this.stage.events[this.nextStageEventIndex], elapsedMs)
      this.nextStageEventIndex += 1
    }
  }

  private maybeDropPowerUp(enemy: Enemy) {
    if (Math.random() >= enemy.archetype.dropChance) {
      return
    }

    this.spawnPowerUp(enemy.body.x, enemy.body.y)
  }

  private spawnPowerUp(x: number, y: number) {
    const glow = this.add.ellipse(x, y, 18, 18, 0x38bdf8, 0.18)
    const body = this.enableRectanglePhysics(this.add.rectangle(x, y, 11, 11, 0xfacc15, 0.95), this.powerUpsGroup, 14, 14)
    body.setAngle(45)
    body.setStrokeStyle(2, 0xfef08a, 0.95)
    const driftDirection = Math.random() < 0.5 ? -1 : 1
    body.body.setVelocity(driftDirection * POWER_UP_DRIFT_SPEED, POWER_UP_SPEED)
    const debug = this.createDebugRect(body.x, body.y, 14, 14, 0xfef08a)

    this.tweens.add({
      targets: [body, glow],
      scale: 1.18,
      duration: 520,
      ease: 'Sine.easeInOut',
      repeat: -1,
      yoyo: true,
    })

    this.powerUps.push({
      body,
      glow,
      spawnedAt: this.time.now,
      nextTurnAt: this.time.now + POWER_UP_TURN_MS,
      driftDirection,
      debug,
    })
  }

  private spawnEnemy(event: StageEnemyEvent, elapsedMs: number) {
    const archetype = ENEMY_ARCHETYPES[event.enemy]
    const body = this.enableRectanglePhysics(
      this.add.rectangle(event.x, -28, archetype.width, archetype.height, archetype.fill),
      this.enemiesGroup,
      archetype.width,
      archetype.height,
      true,
    )
    body.setStrokeStyle(2, archetype.stroke)
    const debug = this.createDebugRect(body.x, body.y, body.width, body.height, 0x4ade80)

    this.enemies.push({
      body,
      debug,
      archetype,
      movement: event.movement,
      spawnElapsedMs: elapsedMs,
      startX: event.x,
      targetY: event.targetY ?? 146,
      hp: Math.max(1, Math.ceil(archetype.hp * this.difficulty.enemyHpScale)),
      firedShots: new Set<string>(),
    })
  }

  private maybeSpawnBoss(elapsedMs: number) {
    if (this.boss || elapsedMs < this.stage.bossAppearMs) {
      return
    }

    const maxHp = Math.round(this.stage.boss.maxHp * this.difficulty.bossHpScale)
    const body = this.enableRectanglePhysics(
      this.add.rectangle(GAME_WIDTH / 2, 90, 132, 86, this.stage.boss.phaseOneFill, 0.94),
      this.bossGroup,
      132,
      86,
      true,
    )
    body.setStrokeStyle(3, 0xf0abfc)
    const core = this.add.ellipse(GAME_WIDTH / 2, 96, 36, 42, 0xfda4af, 0.95)
    core.setStrokeStyle(2, 0xffedd5)
    const debug = this.createDebugRect(body.x, body.y, body.width, body.height, 0xf472b6)

    this.boss = {
      body,
      core,
      debug,
      hp: maxHp,
      maxHp,
      phase: 1,
      spawnElapsedMs: elapsedMs,
      lastRingMs: -1_600,
      lastFanMs: -1_000,
      lastAimedMs: -600,
      lastSpiralMs: -900,
    }

    this.setBossUiVisible(true)
    this.statusText.setText(text({ ko: '보스 출현', en: 'Boss incoming' }, this.settings.language))
    this.statusText.setColor('#fecdd3')
    flashScreen(this, 0xf0abfc, 0.13)
    playTone(this.settings, 220, 220, 'sawtooth', 0.2)
  }

  private updateBullets() {
    this.bullets = this.bullets.filter((bullet) => {
      this.syncDebugRect(bullet.debug, bullet.body)

      if (
        bullet.body.x < -40 ||
        bullet.body.x > GAME_WIDTH + 40 ||
        bullet.body.y < -40 ||
        bullet.body.y > GAME_HEIGHT + 40
      ) {
        this.destroyPlayerBullet(bullet)
        return false
      }

      return true
    })
  }

  private updatePowerUps() {
    this.powerUps = this.powerUps.filter((powerUp) => {
      const ageMs = this.time.now - powerUp.spawnedAt
      const shouldTurnByTime = this.time.now >= powerUp.nextTurnAt
      const shouldTurnByBounds =
        (powerUp.body.x <= 18 && powerUp.driftDirection < 0) ||
        (powerUp.body.x >= GAME_WIDTH - 18 && powerUp.driftDirection > 0)

      if (shouldTurnByTime || shouldTurnByBounds) {
        powerUp.driftDirection = powerUp.driftDirection === 1 ? -1 : 1
        powerUp.nextTurnAt = this.time.now + POWER_UP_TURN_MS
        powerUp.body.body.setVelocity(powerUp.driftDirection * POWER_UP_DRIFT_SPEED, POWER_UP_SPEED)
      }

      powerUp.glow.y = powerUp.body.y
      powerUp.glow.x = powerUp.body.x
      this.syncDebugRect(powerUp.debug, powerUp.body)

      if (ageMs >= POWER_UP_LIFETIME_MS || powerUp.body.y > GAME_HEIGHT + 40) {
        this.destroyPowerUp(powerUp)
        return false
      }

      return true
    })
  }

  private updateEnemyBullets() {
    this.enemyBullets = this.enemyBullets.filter((bullet) => {
      this.syncDebugCircle(bullet.debug, bullet.body)
      this.checkGraze(bullet)

      if (
        bullet.body.x < -40 ||
        bullet.body.x > GAME_WIDTH + 40 ||
        bullet.body.y < -40 ||
        bullet.body.y > GAME_HEIGHT + 40
      ) {
        this.destroyEnemyBullet(bullet)
        return false
      }

      return true
    })
  }

  private updateEnemies(elapsedMs: number, dt: number) {
    this.enemies = this.enemies.filter((enemy) => {
      const ageMs = elapsedMs - enemy.spawnElapsedMs
      this.positionEnemy(enemy, ageMs, dt)
      this.fireEnemyPatterns(enemy, ageMs)
      this.syncDebugRect(enemy.debug, enemy.body)

      if (this.shouldRemoveEnemy(enemy, ageMs)) {
        this.destroyEnemy(enemy)
        return false
      }

      return true
    })
  }

  private positionEnemy(enemy: Enemy, ageMs: number, dt: number) {
    const ageSeconds = ageMs / 1000

    if (enemy.movement === 'formation') {
      enemy.body.x = enemy.startX + Math.sin(ageMs / 620) * 6
      enemy.body.y = -28 + ageSeconds * 118
      return
    }

    if (enemy.movement === 'diagonal-left' || enemy.movement === 'diagonal-right') {
      const direction = enemy.movement === 'diagonal-right' ? 1 : -1
      enemy.body.x = enemy.startX + direction * ageSeconds * 96
      enemy.body.y = -28 + ageSeconds * 134
      return
    }

    if (enemy.movement === 'sine') {
      enemy.body.x = enemy.startX + Math.sin(ageMs / 330) * 44
      enemy.body.y = -28 + ageSeconds * 124
      return
    }

    if (enemy.movement === 'hover') {
      if (ageMs < 1_000) {
        enemy.body.x = enemy.startX
        enemy.body.y = Phaser.Math.Linear(-28, enemy.targetY, ageMs / 1_000)
        return
      }

      if (ageMs < 3_200) {
        enemy.body.x = enemy.startX + Math.sin(ageMs / 420) * 18
        enemy.body.y = enemy.targetY + Math.sin(ageMs / 330) * 4
        return
      }

      enemy.body.y = enemy.targetY + ((ageMs - 3_200) / 1000) * 118
      return
    }

    if (enemy.movement === 'split-left' || enemy.movement === 'split-right') {
      const direction = enemy.movement === 'split-right' ? 1 : -1
      enemy.body.x = enemy.startX + direction * Math.pow(ageSeconds, 1.15) * 54
      enemy.body.y = -28 + ageSeconds * 132
      return
    }

    const direction = enemy.movement === 'ambush-right' ? 1 : -1
    if (ageMs < 900) {
      enemy.body.x = enemy.startX
      enemy.body.y = Phaser.Math.Linear(-28, enemy.targetY, ageMs / 900)
      return
    }

    if (ageMs < 2_800) {
      enemy.body.x = enemy.startX + Math.sin(ageMs / 260) * 9
      enemy.body.y = enemy.targetY + Math.sin(ageMs / 330) * 4
      return
    }

    const exitProgress = (ageMs - 2_800) / 1_600
    enemy.body.x = enemy.startX + direction * exitProgress * 270
    enemy.body.y = enemy.targetY - exitProgress * 90
    void dt
  }

  private fireEnemyPatterns(enemy: Enemy, ageMs: number) {
    enemy.archetype.bulletPatterns.forEach((pattern, patternIndex) => {
      pattern.shotTimes.forEach((shotTime, shotIndex) => {
        const scaledShotTime = shotTime / this.difficulty.enemyFireRate
        const shotKey = `${patternIndex}:${shotIndex}`
        if (ageMs < scaledShotTime || enemy.firedShots.has(shotKey)) {
          return
        }

        enemy.firedShots.add(shotKey)
        this.fireBulletPattern(enemy.body.x, enemy.body.y + enemy.archetype.height / 2, pattern, ageMs)
      })
    })
  }

  private shouldRemoveEnemy(enemy: Enemy, ageMs: number) {
    if (enemy.movement === 'ambush-left' || enemy.movement === 'ambush-right') {
      return ageMs > 4_450 || enemy.body.x < -70 || enemy.body.x > GAME_WIDTH + 70
    }

    return enemy.body.y > GAME_HEIGHT + 42 || enemy.body.x < -80 || enemy.body.x > GAME_WIDTH + 80
  }

  private updateBoss(elapsedMs: number) {
    if (!this.boss) {
      return
    }

    const boss = this.boss
    const ageMs = elapsedMs - boss.spawnElapsedMs
    const phaseTwoHp = boss.maxHp * this.stage.boss.phaseTwoRatio
    if (boss.phase === 1 && boss.hp <= phaseTwoHp) {
      boss.phase = 2
      boss.body.setFillStyle(this.stage.boss.phaseTwoFill, 0.96)
      boss.body.setStrokeStyle(3, 0xfda4af)
      boss.core.setFillStyle(0xfef08a, 0.98)
      this.enemyBullets.forEach((bullet) => this.destroyEnemyBullet(bullet))
      this.enemyBullets = []
      this.statusMessageUntil = this.time.now + 1_200
      this.statusText.setText(text({ ko: '2페이즈 돌입', en: 'Phase 2 engaged' }, this.settings.language))
      this.statusText.setColor('#fef08a')
      flashScreen(this, 0xf43f5e, 0.16)
      shakeCamera(this, this.settings, 260, 0.012)
      playTone(this.settings, 180, 260, 'sawtooth', 0.24)
    }

    const driftX = Math.sin(ageMs / (boss.phase === 1 ? 1_200 : 820)) * (boss.phase === 1 ? 120 : 142)
    boss.body.x = GAME_WIDTH / 2 + driftX
    boss.body.y = 90 + Math.sin(ageMs / 1_700) * 8
    boss.core.x = boss.body.x
    boss.core.y = boss.body.y + 4
    this.syncDebugRect(boss.debug, boss.body)

    const bossSpeed = this.difficulty.bossBulletSpeed
    if (ageMs - boss.lastRingMs >= (boss.phase === 1 ? 1_650 : 1_180)) {
      this.fireRing(boss.body.x, boss.body.y + 40, boss.phase === 1 ? 18 : 22, 142 * bossSpeed, ageMs / 900, 0xc4b5fd, 5)
      boss.lastRingMs = ageMs
    }

    if (ageMs - boss.lastFanMs >= (boss.phase === 1 ? 1_050 : 780)) {
      this.fireFan(
        boss.body.x,
        boss.body.y + 44,
        Math.PI / 2,
        boss.phase === 1 ? 7 : 9,
        boss.phase === 1 ? 0.64 : 0.78,
        210 * bossSpeed,
        boss.phase === 1 ? 0xfca5a5 : 0xf9a8d4,
        5,
      )
      boss.lastFanMs = ageMs
    }

    if (ageMs - boss.lastAimedMs >= (boss.phase === 1 ? 720 : 540)) {
      this.fireAimedBullet(boss.body.x - 32, boss.body.y + 36, 235 * bossSpeed, 0x67e8f9, 4)
      this.fireAimedBullet(boss.body.x + 32, boss.body.y + 36, 235 * bossSpeed, 0x67e8f9, 4)
      boss.lastAimedMs = ageMs
    }

    if (boss.phase === 2 && ageMs - boss.lastSpiralMs >= 420) {
      const rotation = ageMs / 240
      this.fireEnemyBullet(boss.body.x, boss.body.y + 42, Math.cos(rotation) * 188 * bossSpeed, Math.sin(rotation) * 188 * bossSpeed, 0xfef08a, 5)
      this.fireEnemyBullet(
        boss.body.x,
        boss.body.y + 42,
        Math.cos(rotation + Math.PI) * 188 * bossSpeed,
        Math.sin(rotation + Math.PI) * 188 * bossSpeed,
        0xfef08a,
        5,
      )
      boss.lastSpiralMs = ageMs
    }
  }

  private fireBulletPattern(x: number, y: number, pattern: BulletPattern, ageMs: number) {
    const speed = pattern.speed * this.difficulty.enemyBulletSpeed
    const count = pattern.count ?? 1
    const spread = pattern.spread ?? 0
    const centerAngle = pattern.centerAngle ?? Math.PI / 2

    if (pattern.kind === 'aimed') {
      this.fireAimedBullet(x, y, speed, pattern.color, pattern.radius)
      return
    }

    if (pattern.kind === 'fan') {
      this.fireFan(x, y, centerAngle, count, spread, speed, pattern.color, pattern.radius)
      return
    }

    if (pattern.kind === 'ring') {
      this.fireRing(x, y, count, speed, ageMs / 600, pattern.color, pattern.radius)
      return
    }

    if (pattern.kind === 'spiral') {
      const rotation = ageMs / (pattern.rotationRate ?? 420)
      this.fireEnemyBullet(x, y, Math.cos(rotation) * speed, Math.sin(rotation) * speed, pattern.color, pattern.radius)
      return
    }

    const bursts = pattern.bursts ?? 2
    const delay = pattern.burstDelayMs ?? 140
    for (let index = 0; index < bursts; index += 1) {
      this.time.delayedCall(index * delay, () => {
        if (this.isGameOver || this.isStageClear) {
          return
        }

        this.fireFan(x, y, centerAngle, count, spread + index * 0.08, speed + index * 16, pattern.color, pattern.radius)
      })
    }
  }

  private onPlayerBulletHitsEnemy(
    bulletObject: ArcadeOverlapObject,
    enemyObject: ArcadeOverlapObject,
  ) {
    const bulletBody = this.getPhysicsGameObject(bulletObject)
    const enemyBody = this.getPhysicsGameObject(enemyObject)
    const bullet = this.bullets.find((item) => item.body === bulletBody)
    const enemy = this.enemies.find((item) => item.body === enemyBody)
    if (!bullet || !enemy) {
      return
    }

    this.bullets = this.bullets.filter((item) => item !== bullet)
    this.destroyPlayerBullet(bullet)
    enemy.hp -= 1

    if (enemy.hp <= 0) {
      const enemyX = enemy.body.x
      const enemyY = enemy.body.y
      this.maybeDropPowerUp(enemy)
      this.enemies = this.enemies.filter((item) => item !== enemy)
      this.destroyEnemy(enemy)
      this.addScore(enemy.archetype.score, true)
      createBurst(this, enemyX, enemyY, enemy.archetype.stroke, 8)
      playTone(this.settings, 240, 80, 'triangle', 0.08)
    }
  }

  private onPlayerBulletHitsBoss(bulletObject: ArcadeOverlapObject) {
    const bulletBody = this.getPhysicsGameObject(bulletObject)
    const bullet = this.bullets.find((item) => item.body === bulletBody)
    if (!bullet || !this.boss) {
      return
    }

    this.bullets = this.bullets.filter((item) => item !== bullet)
    this.destroyPlayerBullet(bullet)
    this.damageBoss()
  }

  private onPlayerCollectsPowerUp(
    _playerObject: ArcadeOverlapObject,
    powerUpObject: ArcadeOverlapObject,
  ) {
    const powerUpBody = this.getPhysicsGameObject(powerUpObject)
    const powerUp = this.powerUps.find((item) => item.body === powerUpBody)
    if (!powerUp) {
      return
    }

    this.collectPowerUp(powerUp)
  }

  private onEnemyBulletHitsPlayer(
    _playerObject: ArcadeOverlapObject,
    bulletObject: ArcadeOverlapObject,
  ) {
    const bulletBody = this.getPhysicsGameObject(bulletObject)
    const bullet = this.enemyBullets.find((item) => item.body === bulletBody)
    if (!bullet) {
      return
    }

    this.enemyBullets = this.enemyBullets.filter((item) => item !== bullet)
    this.damagePlayer(this.time.now)
    this.destroyEnemyBullet(bullet)
  }

  private onEnemyHitsPlayer(
    _playerObject: ArcadeOverlapObject,
    enemyObject: ArcadeOverlapObject,
  ) {
    const enemyBody = this.getPhysicsGameObject(enemyObject)
    const enemy = this.enemies.find((item) => item.body === enemyBody)
    if (!enemy) {
      return
    }

    this.enemies = this.enemies.filter((item) => item !== enemy)
    this.damagePlayer(this.time.now)
    this.destroyEnemy(enemy)
  }

  private damageBoss() {
    if (!this.boss) {
      return
    }

    this.boss.hp -= 1
    this.addScore(this.stage.score.bossHit, false)
    this.updateBossHealthBar()

    this.tweens.add({
      targets: [this.boss.body, this.boss.core],
      alpha: 0.36,
      duration: 45,
      repeat: 1,
      yoyo: true,
      onComplete: () => {
        if (this.boss) {
          this.boss.body.setAlpha(1)
          this.boss.core.setAlpha(1)
        }
      },
    })

    if (this.boss.hp <= 0) {
      this.clearStage()
    }
  }

  private updateBossHealthBar() {
    if (!this.boss) {
      return
    }

    const ratio = Phaser.Math.Clamp(this.boss.hp / this.boss.maxHp, 0, 1)
    this.bossBarFill.width = 256 * ratio
  }

  private fireAimedBullet(x: number, y: number, speed: number, color: number, radius: number) {
    const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y)
    this.fireEnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, radius)
  }

  private fireFan(
    x: number,
    y: number,
    centerAngle: number,
    count: number,
    spread: number,
    speed: number,
    color: number,
    radius: number,
  ) {
    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0 : Phaser.Math.Linear(-spread, spread, index / (count - 1))
      const angle = centerAngle + offset
      this.fireEnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, radius)
    }
  }

  private fireRing(x: number, y: number, count: number, speed: number, rotation: number, color: number, radius: number) {
    for (let index = 0; index < count; index += 1) {
      const angle = rotation + (Math.PI * 2 * index) / count
      this.fireEnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, radius)
    }
  }

  private fireEnemyBullet(x: number, y: number, vx: number, vy: number, color: number, radius: number) {
    const body = this.enableEllipsePhysics(this.add.ellipse(x, y, radius * 2, radius * 2, color, 0.95), this.enemyBulletsGroup, radius)
    body.setStrokeStyle(1, 0xffffff, 0.55)
    body.body.setVelocity(vx, vy)
    const debug = this.createDebugCircle(x, y, radius, 0xfacc15)
    this.enemyBullets.push({ body, radius, grazed: false, debug })
  }

  private checkGraze(bullet: EnemyBullet) {
    if (bullet.grazed || this.isGameOver || this.isStageClear) {
      return
    }

    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, bullet.body.x, bullet.body.y)
    if (distance <= PLAYER_GRAZE_RADIUS + bullet.radius && distance > 10 + bullet.radius) {
      bullet.grazed = true
      this.grazeCount += 1
      this.addScore(this.stage.score.graze, true)
      this.grazeText.setText(`GRAZE ${this.grazeCount}`)
      createGrazeSpark(this, bullet.body.x, bullet.body.y)
      playTone(this.settings, 1_120, 32, 'sine', 0.045)
    }
  }

  private damagePlayer(time: number) {
    if (time < this.invulnerableUntil || this.isGameOver || this.isStageClear) {
      return
    }

    this.lives -= 1
    this.noMissRun = false
    this.chain = 0
    this.multiplier = 1
    this.updateLivesDisplay()
    this.updateScoreDisplay()
    createBurst(this, this.player.x, this.player.y, 0xfecaca, 12)
    playTone(this.settings, 100, 180, 'sawtooth', 0.18)
    shakeCamera(this, this.settings, 220, 0.012)

    if (this.lives <= 0) {
      this.endGame()
      return
    }

    this.invulnerableUntil = time + PLAYER_HIT_INVULNERABLE_MS
    this.statusMessageUntil = time + 900
    this.statusText.setText(
      text({ ko: `피격! 남은 목숨: ${this.lives}`, en: `Hit! Lives left: ${this.lives}` }, this.settings.language),
    )
    this.statusText.setColor('#fecaca')

    this.tweens.add({
      targets: this.player,
      alpha: 0.35,
      duration: 90,
      repeat: 5,
      yoyo: true,
      onComplete: () => {
        this.player.setAlpha(1)
        if (!this.isGameOver && !this.isStageClear) {
          this.statusText.setColor('#93c5fd')
        }
      },
    })
  }

  private updateLivesDisplay() {
    this.lifeIcons.forEach((icon, index) => {
      const isActive = index < this.lives
      icon.setAlpha(isActive ? 1 : 0.24)
      icon.setTint(isActive ? 0xffffff : 0x64748b)
    })
  }

  private updateBombDisplay() {
    this.bombIcons.forEach((icon, index) => {
      const isActive = index < this.bombs
      icon.setAlpha(isActive ? 1 : 0.2)
      icon.setFillStyle(isActive ? 0xfde68a : 0x475569, isActive ? 0.95 : 0.42)
    })
  }

  private collectPowerUp(powerUp: PowerUp) {
    this.powerUps = this.powerUps.filter((item) => item !== powerUp)
    this.destroyPowerUp(powerUp)

    if (this.weaponLevel < MAX_WEAPON_LEVEL) {
      this.weaponLevel += 1
      this.updateWeaponDisplay()
      const label = this.weaponLevel === 2 ? { ko: '2연발', en: 'Twin shot' } : { ko: '3방향', en: 'Triple spread' }
      this.statusText.setText(text({ ko: `파워 업! ${label.ko}`, en: `Power up! ${label.en}` }, this.settings.language))
    } else {
      this.addScore(1_000, true)
      this.statusText.setText(text({ ko: '최대 화력 보너스 +1000', en: 'Max weapon bonus +1000' }, this.settings.language))
    }

    this.statusMessageUntil = this.time.now + 1_100
    this.statusText.setColor('#fde68a')
    createBurst(this, this.player.x, this.player.y - 16, 0xfde68a, 8)
    playTone(this.settings, 980, 120, 'triangle', 0.12)
  }

  private updateWeaponDisplay() {
    this.weaponText.setText(`WEAPON Lv.${this.weaponLevel}`)
    this.weaponText.setColor(this.weaponLevel === MAX_WEAPON_LEVEL ? '#bbf7d0' : '#fde68a')
  }

  private updateStatus(time: number, elapsedMs: number) {
    if (this.boss || time < this.statusMessageUntil) {
      return
    }

    const remainingSeconds = Math.max(0, Math.ceil((this.stage.bossAppearMs - elapsedMs) / 1000))
    const difficulty = text(DIFFICULTIES[this.settings.difficulty].label, this.settings.language)
    this.statusText.setText(
      text(
        { ko: `${difficulty} - 보스 출현까지 ${remainingSeconds}s`, en: `${difficulty} - boss in ${remainingSeconds}s` },
        this.settings.language,
      ),
    )
    this.statusText.setColor('#93c5fd')
  }

  private addScore(base: number, extendsChain: boolean) {
    if (extendsChain) {
      this.chain += 1
      this.maxChain = Math.max(this.maxChain, this.chain)
      this.lastChainAt = this.time.now
      this.multiplier = 1 + Math.min(3.5, this.chain * this.stage.score.chainStep)
    }

    const gain = base * this.multiplier * this.difficulty.scoreMultiplier
    this.score += Math.round(gain)
    if (this.score > this.displayedBestScore) {
      this.displayedBestScore = this.score
      this.bestText.setText(`BEST ${formatScore(this.displayedBestScore)}`)
    }

    this.updateScoreDisplay()
  }

  private updateChain(time: number) {
    if (this.chain === 0 || time - this.lastChainAt <= this.stage.score.chainTimeoutMs) {
      return
    }

    this.chain = 0
    this.multiplier = 1
    this.updateScoreDisplay()
  }

  private updateScoreDisplay() {
    this.scoreText.setText(`SCORE ${formatScore(this.score)}`)
    this.chainText.setText(`x${this.multiplier.toFixed(2)}  CHAIN ${this.chain}`)
  }

  private endGame() {
    if (this.isGameOver) {
      return
    }

    this.isGameOver = true
    saveBestScore(this.settings, this.mode, this.score)
    this.statusText.setText(text({ ko: '게임 오버. 발사키로 재시작 / 폭탄키로 메뉴', en: 'Game over. Fire to restart / Bomb for menu' }, this.settings.language))
    this.statusText.setColor('#fecaca')
    this.showResultPanel(false)
  }

  private clearStage() {
    if (!this.boss) {
      return
    }

    this.clearTimeMs = this.time.now - this.stageStartedAt
    this.destroyBoss()
    this.enemyBullets.forEach((bullet) => this.destroyEnemyBullet(bullet))
    this.enemies.forEach((enemy) => this.destroyEnemy(enemy))
    this.powerUps.forEach((powerUp) => this.destroyPowerUp(powerUp))
    this.enemyBullets = []
    this.enemies = []
    this.powerUps = []
    this.isStageClear = true
    this.setBossUiVisible(false)
    const bonuses = this.applyClearBonuses()
    saveBestScore(this.settings, this.mode, this.score)
    flashScreen(this, 0xbbf7d0, 0.18)
    shakeCamera(this, this.settings, 280, 0.01)
    this.statusText.setText(text({ ko: 'STAGE CLEAR. 발사키로 재시작 / 폭탄키로 메뉴', en: 'STAGE CLEAR. Fire to restart / Bomb for menu' }, this.settings.language))
    this.statusText.setColor('#bbf7d0')
    this.showResultPanel(true, bonuses)
    playTone(this.settings, 740, 260, 'triangle', 0.18)
  }

  private applyClearBonuses(): ClearBonusBreakdown {
    const timeRatio = Phaser.Math.Clamp(1 - this.clearTimeMs / this.stage.score.timeBonusDeadlineMs, 0, 1)
    const bonuses: ClearBonusBreakdown = {
      clear: this.stage.score.clearBase,
      noMiss: this.noMissRun ? this.stage.score.noMissBonus : 0,
      noBomb: this.noBombRun ? this.stage.score.noBombBonus : 0,
      lives: Math.max(0, this.lives) * this.stage.score.lifeBonus,
      bombs: Math.max(0, this.bombs) * this.stage.score.bombBonus,
      time: Math.round(this.stage.score.timeBonusMax * timeRatio),
    }

    const total =
      bonuses.clear + bonuses.noMiss + bonuses.noBomb + bonuses.lives + bonuses.bombs + bonuses.time
    this.score += Math.round(total * this.difficulty.scoreMultiplier)
    this.updateScoreDisplay()
    return bonuses
  }

  private showResultPanel(cleared: boolean, bonuses?: ClearBonusBreakdown) {
    this.resultPanel?.destroy()

    const panel = this.add.container(GAME_WIDTH / 2, 274)
    const background = this.add.rectangle(0, 0, 382, cleared ? 244 : 192, 0x020617, 0.9)
    background.setStrokeStyle(2, cleared ? 0xbbf7d0 : 0xfca5a5, 0.9)
    const rank = cleared ? this.calculateRank() : 'TRY'
    const title = this.add
      .text(0, -92, cleared ? `RANK ${rank}` : text({ ko: 'RUN FAILED', en: 'RUN FAILED' }, this.settings.language), {
        color: cleared ? '#fef08a' : '#fecaca',
        fontFamily: UI_FONT,
        fontSize: cleared ? '40px' : '30px',
        fontStyle: '900',
      })
      .setOrigin(0.5)

    const stats = [
      `SCORE ${formatScore(this.score)}`,
      `MAX CHAIN ${this.maxChain}`,
      `GRAZE ${this.grazeCount}`,
      `${text({ ko: '난이도', en: 'Difficulty' }, this.settings.language)} ${text(this.difficulty.label, this.settings.language)}`,
    ]

    if (cleared && bonuses) {
      stats.push(`NO MISS ${bonuses.noMiss > 0 ? '+' + formatScore(bonuses.noMiss) : '-'}`)
      stats.push(`NO BOMB ${bonuses.noBomb > 0 ? '+' + formatScore(bonuses.noBomb) : '-'}`)
    }

    const body = this.add
      .text(-160, cleared ? -42 : -36, stats.join('\n'), {
        color: '#e5e7eb',
        fontFamily: MONO_FONT,
        fontSize: '16px',
        lineSpacing: 8,
      })
      .setOrigin(0, 0)

    const footer = this.add
      .text(
        0,
        cleared ? 94 : 70,
        text({ ko: '발사키: 재시작    폭탄키: 메뉴', en: 'Fire: Restart    Bomb: Menu' }, this.settings.language),
        {
          color: '#bae6fd',
          fontFamily: UI_FONT,
          fontSize: '14px',
        },
      )
      .setOrigin(0.5)

    panel.add([background, title, body, footer])
    panel.setDepth(40)
    this.resultPanel = panel
  }

  private calculateRank() {
    const score = this.score
    if (this.noMissRun && this.noBombRun && score >= 90_000) {
      return 'SS'
    }

    if (score >= 72_000) {
      return 'S'
    }

    if (score >= 52_000) {
      return 'A'
    }

    if (score >= 34_000) {
      return 'B'
    }

    return 'C'
  }

  private destroyPlayerBullet(bullet: PlayerBullet) {
    bullet.body.destroy()
    bullet.debug?.destroy()
  }

  private destroyEnemyBullet(bullet: EnemyBullet) {
    bullet.body.destroy()
    bullet.debug?.destroy()
  }

  private destroyPowerUp(powerUp: PowerUp) {
    this.tweens.killTweensOf(powerUp.body)
    this.tweens.killTweensOf(powerUp.glow)
    powerUp.body.destroy()
    powerUp.glow.destroy()
    powerUp.debug?.destroy()
  }

  private destroyEnemy(enemy: Enemy) {
    enemy.body.destroy()
    enemy.debug?.destroy()
  }

  private destroyBoss() {
    if (!this.boss) {
      return
    }

    createBurst(this, this.boss.body.x, this.boss.body.y, 0xfef08a, 24)
    this.boss.body.destroy()
    this.boss.core.destroy()
    this.boss.debug?.destroy()
    this.boss = undefined
  }

  private createDebugRect(x: number, y: number, width: number, height: number, color: number) {
    if (!DEBUG_HITBOXES) {
      return undefined
    }

    const debug = this.add.rectangle(x, y, width, height, 0x000000, 0)
    debug.setStrokeStyle(1, color, 0.9)
    debug.setDepth(20)
    return debug
  }

  private createDebugCircle(x: number, y: number, radius: number, color: number) {
    if (!DEBUG_HITBOXES) {
      return undefined
    }

    const debug = this.add.ellipse(x, y, radius * 2, radius * 2, 0x000000, 0)
    debug.setStrokeStyle(1, color, 0.95)
    debug.setDepth(20)
    return debug
  }

  private syncDebugRect(debug: Phaser.GameObjects.Rectangle | undefined, body: Phaser.GameObjects.Rectangle) {
    if (!debug) {
      return
    }

    debug.x = body.x
    debug.y = body.y
    debug.width = body.width
    debug.height = body.height
  }

  private syncDebugCircle(debug: Phaser.GameObjects.Ellipse | undefined, body: Phaser.GameObjects.Ellipse) {
    if (!debug) {
      return
    }

    debug.x = body.x
    debug.y = body.y
  }
}
