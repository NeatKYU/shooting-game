import Phaser from 'phaser'
import './style.css'

const GAME_WIDTH = 480
const GAME_HEIGHT = 720
const PLAYER_SPEED = 360
const PLAYER_BULLET_SPEED = 700
const PLAYER_FIRE_MS = 150
const MAX_LIVES = 3
const MAX_WEAPON_LEVEL = 3
const POWER_UP_SPEED = 92
const POWER_UP_DRIFT_SPEED = 88
const POWER_UP_DROP_CHANCE = 0.1
const POWER_UP_LIFETIME_MS = 8_000
const POWER_UP_TURN_MS = 780
const PLAYER_HIT_INVULNERABLE_MS = 900
const BOSS_APPEAR_MS = 90_000
const BOSS_MAX_HP = 180
const PLAYER_JET_KEY = 'player-jet'
const PLAYER_JET_ASSET = '/assets/combatjet-highres.png'
const UI_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
const DEBUG_HITBOXES = import.meta.env.DEV

type EnemyPattern = 'formation' | 'diagonal-left' | 'diagonal-right' | 'ambush-left' | 'ambush-right'
type ArcadeOverlapObject = Parameters<Phaser.Types.Physics.Arcade.ArcadePhysicsCallback>[0]
type PhysicsImage = Phaser.GameObjects.Image & { body: Phaser.Physics.Arcade.Body }
type PhysicsRectangle = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body }
type PhysicsEllipse = Phaser.GameObjects.Ellipse & { body: Phaser.Physics.Arcade.Body }

interface StageEnemyEvent {
  timeMs: number
  x: number
  pattern: EnemyPattern
  targetY?: number
}

interface PlayerBullet {
  body: PhysicsRectangle
  debug?: Phaser.GameObjects.Rectangle
}

interface PowerUp {
  body: PhysicsRectangle
  glow: Phaser.GameObjects.Ellipse
  spawnedAt: number
  nextTurnAt: number
  driftDirection: -1 | 1
  debug?: Phaser.GameObjects.Rectangle
}

interface EnemyBullet {
  body: PhysicsEllipse
  radius: number
  debug?: Phaser.GameObjects.Ellipse
}

interface Enemy {
  body: PhysicsRectangle
  debug?: Phaser.GameObjects.Rectangle
  pattern: EnemyPattern
  spawnElapsedMs: number
  startX: number
  targetY: number
  hp: number
  firedShots: Set<number>
}

interface Boss {
  body: PhysicsRectangle
  core: Phaser.GameObjects.Ellipse
  debug?: Phaser.GameObjects.Rectangle
  hp: number
  spawnElapsedMs: number
  lastRingMs: number
  lastFanMs: number
  lastAimedMs: number
}

function addStarfield(scene: Phaser.Scene, starCount: number) {
  scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x050816)

  for (let i = 0; i < starCount; i += 1) {
    scene.add.circle(
      Phaser.Math.Between(0, GAME_WIDTH),
      Phaser.Math.Between(0, GAME_HEIGHT),
      Phaser.Math.FloatBetween(0.8, 2.1),
      0xffffff,
      Phaser.Math.FloatBetween(0.2, 0.82),
    )
  }
}

function preloadPlayerJet(scene: Phaser.Scene) {
  if (!scene.textures.exists(PLAYER_JET_KEY)) {
    scene.load.image(PLAYER_JET_KEY, PLAYER_JET_ASSET)
  }
}

function createPlayerShip(scene: Phaser.Scene, x: number, y: number, height: number) {
  const ship = scene.add.image(x, y, PLAYER_JET_KEY)
  ship.setDisplaySize(Math.round(height * 0.75), height)
  return ship
}

function lineWave(timeMs: number, xs: number[], pattern: EnemyPattern): StageEnemyEvent[] {
  return xs.map((x, index) => ({
    timeMs: timeMs + index * 120,
    x,
    pattern,
  }))
}

function ambushWave(timeMs: number, xs: number[], side: 'left' | 'right', targetY: number): StageEnemyEvent[] {
  return xs.map((x, index) => ({
    timeMs: timeMs + index * 180,
    x,
    pattern: side === 'left' ? 'ambush-left' : 'ambush-right',
    targetY,
  }))
}

const STAGE_ONE_EVENTS: StageEnemyEvent[] = [
  ...lineWave(900, [96, 144, 192, 240, 288, 336, 384], 'formation'),
  ...lineWave(5_200, [56, 104, 152, 200], 'diagonal-right'),
  ...lineWave(5_200, [424, 376, 328, 280], 'diagonal-left'),
  ...ambushWave(10_200, [90, 170, 250, 330, 410], 'right', 150),
  ...lineWave(15_000, [72, 120, 168, 216, 264, 312, 360, 408], 'formation'),
  ...ambushWave(20_200, [390, 310, 230, 150, 70], 'left', 178),
  ...lineWave(25_000, [72, 120, 168, 216, 264], 'diagonal-right'),
  ...lineWave(26_300, [408, 360, 312, 264, 216], 'diagonal-left'),
  ...lineWave(32_000, [104, 152, 200, 248, 296, 344, 392], 'formation'),
  ...ambushWave(38_000, [110, 190, 270, 350], 'right', 132),
  ...ambushWave(42_500, [370, 290, 210, 130], 'left', 190),
  ...lineWave(48_000, [58, 106, 154, 202, 250, 298], 'diagonal-right'),
  ...lineWave(50_000, [422, 374, 326, 278, 230, 182], 'diagonal-left'),
  ...lineWave(57_000, [80, 128, 176, 224, 272, 320, 368, 416], 'formation'),
  ...ambushWave(64_000, [96, 176, 256, 336, 416], 'right', 160),
  ...ambushWave(71_000, [384, 304, 224, 144, 64], 'left', 144),
  ...lineWave(79_000, [72, 120, 168, 216, 264, 312, 360, 408], 'formation'),
  ...lineWave(85_000, [72, 144, 216], 'diagonal-right'),
  ...lineWave(85_000, [408, 336, 264], 'diagonal-left'),
].sort((a, b) => a.timeMs - b.timeMs)

class IntroScene extends Phaser.Scene {
  private helpPanel?: Phaser.GameObjects.Container

  constructor() {
    super('IntroScene')
  }

  preload() {
    preloadPlayerJet(this)
  }

  create() {
    addStarfield(this, 140)

    this.add.circle(378, 108, 52, 0x7dd3fc, 0.16)
    this.add.circle(394, 95, 30, 0xf0abfc, 0.15)
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 38, GAME_WIDTH, 76, 0x111827, 0.32)

    this.add
      .text(40, 62, 'SPACE SHOOTER', {
        color: '#f8fafc',
        fontFamily: UI_FONT,
        fontSize: '42px',
        fontStyle: '800',
      })
      .setShadow(0, 5, '#0f172a', 8)

    this.add.text(44, 118, '정해진 탄막을 돌파하고 보스를 격추하세요', {
      color: '#bae6fd',
      fontFamily: UI_FONT,
      fontSize: '18px',
    })

    const ship = createPlayerShip(this, -70, 312, 124)
    ship.setAngle(90)
    this.tweens.add({
      targets: ship,
      x: GAME_WIDTH / 2,
      duration: 1450,
      ease: 'Cubic.easeOut',
    })
    this.tweens.add({
      targets: ship,
      y: ship.y - 8,
      duration: 1300,
      ease: 'Sine.easeInOut',
      repeat: -1,
      yoyo: true,
      delay: 1450,
    })

    const menuX = 52
    const menuY = 500
    this.createMenuButton(menuX, menuY, '게임 시작', () => {
      this.scene.start('ShooterScene')
    })
    this.createMenuButton(menuX, menuY + 64, '하는 방법', () => {
      this.toggleHelpPanel()
    })
  }

  private createMenuButton(x: number, y: number, label: string, onClick: () => void) {
    const button = this.add.container(x, y)
    const plate = this.add.rectangle(0, 0, 190, 46, 0x0f172a, 0.82)
    plate.setOrigin(0, 0)
    plate.setStrokeStyle(2, 0x38bdf8, 0.9)
    plate.setInteractive({ useHandCursor: true })

    const text = this.add.text(24, 10, label, {
      color: '#f8fafc',
      fontFamily: UI_FONT,
      fontSize: '21px',
      fontStyle: '700',
    })

    plate.on('pointerover', () => {
      plate.setFillStyle(0x164e63, 0.92)
      plate.setStrokeStyle(2, 0x67e8f9, 1)
    })
    plate.on('pointerout', () => {
      plate.setFillStyle(0x0f172a, 0.82)
      plate.setStrokeStyle(2, 0x38bdf8, 0.9)
    })
    plate.on('pointerdown', onClick)

    button.add([plate, text])
    return button
  }

  private toggleHelpPanel() {
    if (this.helpPanel) {
      this.helpPanel.destroy()
      this.helpPanel = undefined
      return
    }

    const panel = this.add.container(40, 586)
    const background = this.add.rectangle(0, 0, 400, 112, 0x020617, 0.82)
    background.setOrigin(0, 0)
    background.setStrokeStyle(2, 0xa78bfa, 0.85)

    const title = this.add.text(24, 18, '하는 방법', {
      color: '#f5d0fe',
      fontFamily: UI_FONT,
      fontSize: '22px',
      fontStyle: '800',
    })

    const body = this.add.text(
      24,
      52,
      '방향키로 이동\nSpace 키를 누르고 있으면 발사\n파워 아이템을 먹으면 탄이 강화됩니다',
      {
        color: '#e5e7eb',
        fontFamily: UI_FONT,
        fontSize: '16px',
        lineSpacing: 5,
      },
    )

    panel.add([background, title, body])
    this.helpPanel = panel
  }
}

class ShooterScene extends Phaser.Scene {
  private player!: PhysicsImage
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private spaceKey!: Phaser.Input.Keyboard.Key
  private scoreText!: Phaser.GameObjects.Text
  private lifeIcons: Phaser.GameObjects.Image[] = []
  private statusText!: Phaser.GameObjects.Text
  private bossBarFrame!: Phaser.GameObjects.Rectangle
  private bossBarFill!: Phaser.GameObjects.Rectangle
  private bossNameText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
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
  private lives = MAX_LIVES
  private weaponLevel = 1
  private nextStageEventIndex = 0
  private stageStartedAt = 0
  private invulnerableUntil = 0
  private lastPlayerShot = -PLAYER_FIRE_MS
  private statusMessageUntil = 0
  private isGameOver = false
  private isStageClear = false

  constructor() {
    super('ShooterScene')
  }

  preload() {
    preloadPlayerJet(this)
  }

  create() {
    this.resetGameState()

    addStarfield(this, 90)

    this.player = createPlayerShip(this, GAME_WIDTH / 2, GAME_HEIGHT - 74, 76) as PhysicsImage
    this.createPhysicsBodies()

    const keyboard = this.input.keyboard
    if (!keyboard) {
      throw new Error('Keyboard input is not available.')
    }

    this.cursors = keyboard.createCursorKeys()
    this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    this.add.text(24, 18, 'STAGE 1', {
      color: '#bae6fd',
      fontFamily: MONO_FONT,
      fontSize: '18px',
    })

    this.scoreText = this.add.text(24, 42, 'Score 0', {
      color: '#e5e7eb',
      fontFamily: MONO_FONT,
      fontSize: '18px',
    })

    this.weaponText = this.add.text(24, 66, 'Weapon Lv.1', {
      color: '#fde68a',
      fontFamily: MONO_FONT,
      fontSize: '16px',
    })

    this.add
      .text(GAME_WIDTH - 126, 20, '목숨', {
        color: '#fecdd3',
        fontFamily: MONO_FONT,
        fontSize: '20px',
      })
      .setOrigin(0, 0)

    for (let index = 0; index < MAX_LIVES; index += 1) {
      const icon = this.add.image(GAME_WIDTH - 84 + index * 30, 34, PLAYER_JET_KEY)
      icon.setDisplaySize(19, 26)
      this.lifeIcons.push(icon)
    }

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 62, 'Stage 1 시작', {
        align: 'center',
        color: '#93c5fd',
        fontFamily: UI_FONT,
        fontSize: '16px',
      })
      .setOrigin(0.5, 0)

    this.createBossUi()
    this.registerPhysicsOverlaps()
  }

  private createPhysicsBodies() {
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT)
    this.physics.add.existing(this.player)
    this.player.body.setAllowGravity(false)
    this.player.body.setSize(32, 52, true)

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
    this.boss = undefined
    this.score = 0
    this.lives = MAX_LIVES
    this.weaponLevel = 1
    this.nextStageEventIndex = 0
    this.stageStartedAt = 0
    this.invulnerableUntil = 0
    this.lastPlayerShot = -PLAYER_FIRE_MS
    this.statusMessageUntil = 0
    this.isGameOver = false
    this.isStageClear = false
  }

  update(time: number, delta: number) {
    if (this.stageStartedAt === 0) {
      this.stageStartedAt = time
    }

    if (this.isGameOver || this.isStageClear) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.scene.restart()
      }

      return
    }

    const dt = delta / 1000
    const elapsedMs = time - this.stageStartedAt

    this.updatePlayer(dt)

    if (this.spaceKey.isDown && time - this.lastPlayerShot >= PLAYER_FIRE_MS) {
      this.fireBullet()
      this.lastPlayerShot = time
    }

    this.spawnStageEnemies(elapsedMs)
    this.maybeSpawnBoss(elapsedMs)
    this.updateStatus(time, elapsedMs)
    this.updateBullets(dt)
    this.updatePowerUps(dt)
    this.updateEnemyBullets(dt)
    this.updateEnemies(elapsedMs, dt)
    this.updateBoss(elapsedMs)
  }

  private createBossUi() {
    this.bossBarFrame = this.add.rectangle(GAME_WIDTH / 2, 14, 260, 10, 0x020617, 0.88)
    this.bossBarFrame.setStrokeStyle(1, 0xfda4af, 0.9)
    this.bossBarFill = this.add.rectangle(GAME_WIDTH / 2 - 128, 14, 256, 6, 0xfb7185, 1)
    this.bossBarFill.setOrigin(0, 0.5)
    this.bossNameText = this.add
      .text(GAME_WIDTH / 2, 24, 'BOSS', {
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

  private updatePlayer(dt: number) {
    const clampedX = Phaser.Math.Clamp(this.player.x, 30, GAME_WIDTH - 30)
    const clampedY = Phaser.Math.Clamp(this.player.y, 110, GAME_HEIGHT - 34)
    if (clampedX !== this.player.x || clampedY !== this.player.y) {
      this.player.body.reset(clampedX, clampedY)
    }

    let dx = 0
    let dy = 0

    if (this.cursors.left.isDown) {
      dx -= 1
    }

    if (this.cursors.right.isDown) {
      dx += 1
    }

    if (this.cursors.up.isDown) {
      dy -= 1
    }

    if (this.cursors.down.isDown) {
      dy += 1
    }

    const length = Math.hypot(dx, dy) || 1
    const vx = (dx / length) * PLAYER_SPEED
    const vy = (dy / length) * PLAYER_SPEED

    this.player.body.setVelocity(
      (this.player.x <= 30 && vx < 0) || (this.player.x >= GAME_WIDTH - 30 && vx > 0) ? 0 : vx,
      (this.player.y <= 110 && vy < 0) || (this.player.y >= GAME_HEIGHT - 34 && vy > 0) ? 0 : vy,
    )
    void dt
  }

  private fireBullet() {
    if (this.weaponLevel === 1) {
      this.createPlayerBullet(this.player.x, this.player.y - 42, -Math.PI / 2)
      return
    }

    if (this.weaponLevel === 2) {
      this.createPlayerBullet(this.player.x - 10, this.player.y - 42, -Math.PI / 2)
      this.createPlayerBullet(this.player.x + 10, this.player.y - 42, -Math.PI / 2)
      return
    }

    this.createPlayerBullet(this.player.x - 9, this.player.y - 42, -Math.PI / 2 - 0.24)
    this.createPlayerBullet(this.player.x, this.player.y - 46, -Math.PI / 2)
    this.createPlayerBullet(this.player.x + 9, this.player.y - 42, -Math.PI / 2 + 0.24)
  }

  private createPlayerBullet(x: number, y: number, angle: number) {
    const body = this.enableRectanglePhysics(this.add.rectangle(x, y, 7, 24, 0xfacc15), this.playerBulletsGroup, 7, 24)
    body.setStrokeStyle(1, 0xfef08a)
    body.setRotation(angle + Math.PI / 2)
    body.body.setVelocity(Math.cos(angle) * PLAYER_BULLET_SPEED, Math.sin(angle) * PLAYER_BULLET_SPEED)
    const debug = this.createDebugRect(body.x, body.y, 7, 24, 0x22d3ee)
    this.bullets.push({ body, debug })
  }

  private spawnStageEnemies(elapsedMs: number) {
    while (
      this.nextStageEventIndex < STAGE_ONE_EVENTS.length &&
      elapsedMs >= STAGE_ONE_EVENTS[this.nextStageEventIndex].timeMs
    ) {
      this.spawnEnemy(STAGE_ONE_EVENTS[this.nextStageEventIndex], elapsedMs)
      this.nextStageEventIndex += 1
    }
  }

  private maybeDropPowerUp(x: number, y: number) {
    if (Math.random() >= POWER_UP_DROP_CHANCE) {
      return
    }

    this.spawnPowerUp(x, y)
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
    const isAmbush = event.pattern === 'ambush-left' || event.pattern === 'ambush-right'
    const body = this.enableRectanglePhysics(
      this.add.rectangle(event.x, -28, isAmbush ? 42 : 36, isAmbush ? 32 : 28, 0xfb7185),
      this.enemiesGroup,
      isAmbush ? 42 : 36,
      isAmbush ? 32 : 28,
      true,
    )
    body.setStrokeStyle(2, isAmbush ? 0xf9a8d4 : 0xffc4d6)
    const debug = this.createDebugRect(body.x, body.y, body.width, body.height, 0x4ade80)

    this.enemies.push({
      body,
      debug,
      pattern: event.pattern,
      spawnElapsedMs: elapsedMs,
      startX: event.x,
      targetY: event.targetY ?? 140,
      hp: isAmbush ? 2 : 1,
      firedShots: new Set<number>(),
    })
  }

  private maybeSpawnBoss(elapsedMs: number) {
    if (this.boss || elapsedMs < BOSS_APPEAR_MS) {
      return
    }

    const body = this.enableRectanglePhysics(
      this.add.rectangle(GAME_WIDTH / 2, 90, 126, 82, 0x7c3aed, 0.94),
      this.bossGroup,
      126,
      82,
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
      hp: BOSS_MAX_HP,
      spawnElapsedMs: elapsedMs,
      lastRingMs: -1_600,
      lastFanMs: -1_000,
      lastAimedMs: -600,
    }

    this.setBossUiVisible(true)
    this.statusText.setText('보스 출현')
    this.statusText.setColor('#fecdd3')
  }

  private updateBullets(dt: number) {
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
    void dt
  }

  private updatePowerUps(dt: number) {
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
    void dt
  }

  private updateEnemyBullets(dt: number) {
    this.enemyBullets = this.enemyBullets.filter((bullet) => {
      this.syncDebugCircle(bullet.debug, bullet.body)

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
    void dt
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

    if (enemy.pattern === 'formation') {
      enemy.body.x = enemy.startX + Math.sin(ageMs / 620) * 6
      enemy.body.y = -28 + ageSeconds * 116
      return
    }

    if (enemy.pattern === 'diagonal-left' || enemy.pattern === 'diagonal-right') {
      const direction = enemy.pattern === 'diagonal-right' ? 1 : -1
      enemy.body.x = enemy.startX + direction * ageSeconds * 96
      enemy.body.y = -28 + ageSeconds * 134
      return
    }

    const direction = enemy.pattern === 'ambush-right' ? 1 : -1
    if (ageMs < 900) {
      const progress = ageMs / 900
      enemy.body.x = enemy.startX
      enemy.body.y = Phaser.Math.Linear(-28, enemy.targetY, progress)
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
    const shotTimes =
      enemy.pattern === 'formation'
        ? [1_050]
        : enemy.pattern === 'diagonal-left' || enemy.pattern === 'diagonal-right'
          ? [900, 1_550]
          : [1_000, 1_700, 2_350]

    shotTimes.forEach((shotTime, index) => {
      if (ageMs < shotTime || enemy.firedShots.has(index)) {
        return
      }

      enemy.firedShots.add(index)

      if (enemy.pattern === 'ambush-left' || enemy.pattern === 'ambush-right') {
        this.fireFan(enemy.body.x, enemy.body.y + 22, Math.PI / 2, 5, 0.48, 180, 0xf9a8d4, 6)
        return
      }

      this.fireAimedBullet(enemy.body.x, enemy.body.y + 18, 190, 0x60a5fa, 5)
    })
  }

  private shouldRemoveEnemy(enemy: Enemy, ageMs: number) {
    if (enemy.pattern === 'ambush-left' || enemy.pattern === 'ambush-right') {
      return ageMs > 4_450 || enemy.body.x < -70 || enemy.body.x > GAME_WIDTH + 70
    }

    return enemy.body.y > GAME_HEIGHT + 42 || enemy.body.x < -60 || enemy.body.x > GAME_WIDTH + 60
  }

  private updateBoss(elapsedMs: number) {
    if (!this.boss) {
      return
    }

    const boss = this.boss
    const ageMs = elapsedMs - boss.spawnElapsedMs
    const driftX = Math.sin(ageMs / 1_200) * 120
    boss.body.x = GAME_WIDTH / 2 + driftX
    boss.body.y = 90 + Math.sin(ageMs / 1_700) * 8
    boss.core.x = boss.body.x
    boss.core.y = boss.body.y + 4
    this.syncDebugRect(boss.debug, boss.body)

    if (ageMs - boss.lastRingMs >= 1_650) {
      this.fireRing(boss.body.x, boss.body.y + 40, 18, 142, ageMs / 900, 0xc4b5fd, 5)
      boss.lastRingMs = ageMs
    }

    if (ageMs - boss.lastFanMs >= 1_050) {
      this.fireFan(boss.body.x, boss.body.y + 44, Math.PI / 2, 7, 0.64, 210, 0xfca5a5, 5)
      boss.lastFanMs = ageMs
    }

    if (ageMs - boss.lastAimedMs >= 720) {
      this.fireAimedBullet(boss.body.x - 32, boss.body.y + 36, 235, 0x67e8f9, 4)
      this.fireAimedBullet(boss.body.x + 32, boss.body.y + 36, 235, 0x67e8f9, 4)
      boss.lastAimedMs = ageMs
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
      this.maybeDropPowerUp(enemy.body.x, enemy.body.y)
      this.enemies = this.enemies.filter((item) => item !== enemy)
      this.destroyEnemy(enemy)
      this.score += 10
      this.scoreText.setText(`Score ${this.score}`)
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
    this.score += 2
    this.scoreText.setText(`Score ${this.score}`)
    this.updateBossHealthBar()

    this.tweens.add({
      targets: [this.boss.body, this.boss.core],
      alpha: 0.35,
      duration: 55,
      repeat: 2,
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

    const ratio = Phaser.Math.Clamp(this.boss.hp / BOSS_MAX_HP, 0, 1)
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
    this.enemyBullets.push({ body, radius, debug })
  }

  private damagePlayer(time: number) {
    if (time < this.invulnerableUntil || this.isGameOver || this.isStageClear) {
      return
    }

    this.lives -= 1
    this.updateLivesDisplay()

    if (this.lives <= 0) {
      this.endGame()
      return
    }

    this.invulnerableUntil = time + PLAYER_HIT_INVULNERABLE_MS
    this.statusMessageUntil = time + 850
    this.statusText.setText(`피격! 남은 목숨: ${this.lives}`)
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

  private collectPowerUp(powerUp: PowerUp) {
    this.powerUps = this.powerUps.filter((item) => item !== powerUp)
    this.destroyPowerUp(powerUp)
    this.weaponLevel = Math.min(MAX_WEAPON_LEVEL, this.weaponLevel + 1)
    this.updateWeaponDisplay()

    const label = this.weaponLevel === 2 ? '2연발' : '3방향'
    this.statusMessageUntil = this.time.now + 1_100
    this.statusText.setText(`파워 업! ${label}`)
    this.statusText.setColor('#fde68a')
  }

  private updateWeaponDisplay() {
    this.weaponText.setText(`Weapon Lv.${this.weaponLevel}`)
    this.weaponText.setColor(this.weaponLevel === MAX_WEAPON_LEVEL ? '#bbf7d0' : '#fde68a')
  }

  private updateStatus(time: number, elapsedMs: number) {
    if (this.boss || time < this.statusMessageUntil) {
      return
    }

    const remainingSeconds = Math.max(0, Math.ceil((BOSS_APPEAR_MS - elapsedMs) / 1000))
    this.statusText.setText(`보스 출현까지 ${remainingSeconds}s`)
    this.statusText.setColor('#93c5fd')
  }

  private endGame() {
    if (this.isGameOver) {
      return
    }

    this.isGameOver = true
    this.statusText.setText('게임 오버. Space로 재시작.')
    this.statusText.setColor('#fecaca')
  }

  private clearStage() {
    if (!this.boss) {
      return
    }

    this.destroyBoss()
    this.enemyBullets.forEach((bullet) => this.destroyEnemyBullet(bullet))
    this.enemies.forEach((enemy) => this.destroyEnemy(enemy))
    this.powerUps.forEach((powerUp) => this.destroyPowerUp(powerUp))
    this.enemyBullets = []
    this.enemies = []
    this.powerUps = []
    this.isStageClear = true
    this.setBossUiVisible(false)
    this.statusText.setText('STAGE 1 CLEAR. Space로 다시 시작.')
    this.statusText.setColor('#bbf7d0')
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
  scale: {
    autoCenter: Phaser.Scale.CENTER_BOTH,
    mode: Phaser.Scale.FIT,
  },
}

const game = new Phaser.Game(config)

if (import.meta.env.DEV) {
  Object.assign(globalThis, { __SHOOTING_GAME__: game })
}
