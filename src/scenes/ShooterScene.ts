import Phaser from 'phaser'
import { DIFFICULTIES } from '../data/difficulties'
import { ENEMY_ARCHETYPES } from '../data/enemies'
import { DEMO_STAGE } from '../data/demoStage'
import { playTone } from '../game/audio'
import {
  BOSS_MOVEMENT_SPEED_MULTIPLIER,
  DEBUG_HITBOXES,
  ENEMY_MOVEMENT_SPEED_MULTIPLIER,
  ENEMY_PROJECTILE_SPEED_MULTIPLIER,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAX_BOMBS,
  MONO_FONT,
  PLAYER_BOMB_INVULNERABLE_MS,
  PLAYER_BULLET_SPEED,
  PLAYER_FIRE_MS,
  PLAYER_GRAZE_RADIUS,
  PLAYER_HIT_INVULNERABLE_MS,
  PLAYER_SLOW_SPEED,
  PLAYER_SPEED,
  POWER_UP_DRIFT_SPEED,
  POWER_UP_SPEED,
  UI_FONT,
} from '../game/config'
import { text } from '../game/localization'
import { formatScore, loadBestScore, saveBestScore } from '../game/score'
import { ParallaxBackground, preloadParallaxBackground } from '../game/parallaxBackground'
import {
  PLAYER_BULLET_ANIM_KEY,
  PLAYER_IDLE_ANIM_KEY,
  PLAYER_MOVE_ANIM_KEY,
  createPlayerBulletAnimation,
  createPlayerShip,
  preloadPlayerJet,
} from '../game/sceneAssets'
import { DEFAULT_SETTINGS, cloneSettings, keyNameToCode, loadSettings } from '../game/settings'
import type {
  ArcadeOverlapObject,
  Boss,
  BulletPattern,
  ClearBonusBreakdown,
  Enemy,
  EnemyBullet,
  FieldDrop,
  GameMode,
  PartDefinition,
  PhysicsEllipse,
  PhysicsImage,
  PhysicsSprite,
  PhysicsRectangle,
  PlayerBullet,
  ShooterSceneData,
  StageEnemyEvent,
} from '../game/types'
import { createBurst, createGrazeSpark, flashScreen, shakeCamera } from '../systems/effects'

const MAX_MODULE_SLOTS = 2
const ENEMY_COLLISION_DAMAGE = 2
const BOSS_COLLISION_DAMAGE = 3
const BOSS_CLEAR_COIN_REWARD = 28
const ATTACK_UP_BASE_COST = 12
const HP_UP_BASE_COST = 15
const SHOP_COST_STEP = 8
const RUN_LEVEL_HP_SCALE = 0.18
const RUN_LEVEL_BULLET_SPEED_SCALE = 0.08
const RUN_LEVEL_REWARD_SCALE = 0.2
const LASER_INTERVAL_MS = 2000
const LASER_DURATION_MS = 280
const LASER_DAMAGE_TICK_MS = 90
const WING_INTERVAL_MS = 310
const SPARK_INTERVAL_MS = 540
const COIN_MAGNET_RADIUS = 138
const COIN_MAGNET_SPEED = 410
const COIN_ANIM_KEY = 'coin-spin'
const COIN_FRAME_KEYS = Array.from({ length: 8 }, (_, index) => `coin-spin-frame-${index}`)
const COIN_DISPLAY_SIZE = 18
const DROP_LIFETIME_MS = 20_000
const DROP_BLINK_MS = 4_000
const PART_DROP_DISPLAY_HEIGHT = 31
const PART_DROP_MIN_Y = 116
const PART_DROP_MAX_Y = GAME_HEIGHT - 76
const SUPPORT_DRONE_OFFSET_X = 48
const SUPPORT_DRONE_OFFSET_Y = 8
const SUPPORT_DRONE_SIZE = 30
const AMMO_ICON_DISPLAY_SIZE = 48
const BASIC_BULLET_DISPLAY_WIDTH = 58
const BASIC_BULLET_DISPLAY_HEIGHT = 29
const FLAME_BULLET_RANGE = 245
const FLAME_BULLET_SPEED = 430
const SPLASH_CHAIN_RANGE = 165
const BOSS_PHASE_ONE_PATTERN_SEQUENCE = [1, 1, 2, 2, 3, 3] as const
const BOSS_PHASE_TWO_PATTERN_SEQUENCE = [1, 2, 3] as const
const BOSS_PHASE_ONE_PATTERN_INTERVAL_MS = 1_050
const BOSS_PHASE_TWO_PATTERN_INTERVAL_MS = 640
const BOSS_PHASE_START_DELAY_MS = 650

const AMMO_ICON_ASSETS = {
  'armor-piercer': '/assets/ammo-armor-piercer.png',
  'flamethrower-core': '/assets/ammo-flamethrower.png',
  'splash-core': '/assets/ammo-splash.png',
} as const

type BulletCoreId = keyof typeof AMMO_ICON_ASSETS

interface ActiveLaser {
  graphics: Phaser.GameObjects.Graphics
  sourceIndex: number
  expiresAt: number
  nextDamageAt: number
}

type BossPatternId = (typeof BOSS_PHASE_ONE_PATTERN_SEQUENCE | typeof BOSS_PHASE_TWO_PATTERN_SEQUENCE)[number]

interface PanelSelectableItem {
  plate: Phaser.GameObjects.Rectangle
  action: () => void
  enabled: boolean
  defaultFill: number
  defaultAlpha: number
  defaultStroke: number
  defaultStrokeAlpha: number
  selectedFill: number
  selectedAlpha: number
  selectedStroke: number
  selectedStrokeAlpha: number
}

const PART_CATALOG: PartDefinition[] = [
  {
    id: 'armor-piercer',
    kind: 'bullet-core',
    label: { ko: '철갑탄', en: 'Armor Piercer' },
    description: { ko: '적을 관통하며 뒤쪽 적에게 감소 피해', en: 'Pierces enemies and carries reduced damage' },
    color: 0xf97316,
    iconKey: 'ammo-icon-armor-piercer',
  },
  {
    id: 'flamethrower-core',
    kind: 'bullet-core',
    label: { ko: '화염방사탄', en: 'Flamethrower Core' },
    description: { ko: '짧은 사거리의 전방 방사 화염', en: 'Short-range forward flame fan' },
    color: 0xf97316,
    iconKey: 'ammo-icon-flamethrower-core',
  },
  {
    id: 'splash-core',
    kind: 'bullet-core',
    label: { ko: '스플래쉬탄', en: 'Splash Core' },
    description: { ko: '명중 시 주변 적에게 연쇄 피해', en: 'Chains to nearby enemies on hit' },
    color: 0x38bdf8,
    iconKey: 'ammo-icon-splash-core',
  },
  {
    id: 'laser-module',
    kind: 'weapon-module',
    label: { ko: '레이저 모듈', en: 'Laser Module' },
    description: { ko: '주기적으로 전방 레이저 발사', en: 'Periodically fires a forward laser' },
    color: 0xef4444,
  },
  {
    id: 'spark-module',
    kind: 'weapon-module',
    label: { ko: '스파크 모듈', en: 'Spark Module' },
    description: { ko: '명중 시 번개 체인 추가 피해', en: 'Hits arc lightning to another target' },
    color: 0xfacc15,
  },
  {
    id: 'wing-module',
    kind: 'weapon-module',
    label: { ko: '윙 모듈', en: 'Wing Module' },
    description: { ko: '좌우 보조탄 자동 발사', en: 'Auto-fires side support shots' },
    color: 0xa78bfa,
  },
]

export class ShooterScene extends Phaser.Scene {
  private settings = cloneSettings(DEFAULT_SETTINGS)
  private mode: GameMode = 'demo'
  private stage = DEMO_STAGE
  private difficulty = DIFFICULTIES.novice
  private player!: PhysicsSprite
  private background!: ParallaxBackground
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private fireKey!: Phaser.Input.Keyboard.Key
  private slowKey!: Phaser.Input.Keyboard.Key
  private bombKey!: Phaser.Input.Keyboard.Key
  private wasdKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>
  private scoreText!: Phaser.GameObjects.Text
  private bestText!: Phaser.GameObjects.Text
  private coinText!: Phaser.GameObjects.Text
  private chainText!: Phaser.GameObjects.Text
  private grazeText!: Phaser.GameObjects.Text
  private hpText!: Phaser.GameObjects.Text
  private hpBarFrame!: Phaser.GameObjects.Rectangle
  private hpBarFill!: Phaser.GameObjects.Rectangle
  private bombIcons: Phaser.GameObjects.Rectangle[] = []
  private statusText!: Phaser.GameObjects.Text
  private bossBarFrame!: Phaser.GameObjects.Rectangle
  private bossBarFill!: Phaser.GameObjects.Rectangle
  private bossNameText!: Phaser.GameObjects.Text
  private weaponText!: Phaser.GameObjects.Text
  private bulletCoreIconFrame!: Phaser.GameObjects.Rectangle
  private bulletCoreIconGlow!: Phaser.GameObjects.Ellipse
  private bulletCoreIcon?: Phaser.GameObjects.Image
  private supportDrones: Phaser.GameObjects.Sprite[] = []
  private resultPanel?: Phaser.GameObjects.Container
  private shopPanel?: Phaser.GameObjects.Container
  private partChoicePanel?: Phaser.GameObjects.Container
  private shopItems: PanelSelectableItem[] = []
  private partChoiceItems: PanelSelectableItem[] = []
  private playerBulletsGroup!: Phaser.Physics.Arcade.Group
  private powerUpsGroup!: Phaser.Physics.Arcade.Group
  private enemyBulletsGroup!: Phaser.Physics.Arcade.Group
  private enemiesGroup!: Phaser.Physics.Arcade.Group
  private bossGroup!: Phaser.Physics.Arcade.Group
  private bullets: PlayerBullet[] = []
  private powerUps: FieldDrop[] = []
  private enemyBullets: EnemyBullet[] = []
  private enemies: Enemy[] = []
  private activeLasers: ActiveLaser[] = []
  private boss?: Boss
  private score = 0
  private displayedBestScore = 0
  private hp = 0
  private maxHp = 0
  private bombs = MAX_BOMBS
  private coins = 0
  private attackPower = 1
  private attackUpgradeCount = 0
  private hpUpgradeCount = 0
  private bulletCore?: PartDefinition
  private weaponModules: PartDefinition[] = []
  private pendingPart?: PartDefinition
  private partChoiceOpenedAt = 0
  private selectedShopIndex = 0
  private selectedPartChoiceIndex = 1
  private runLevel = 1
  private nextStageEventIndex = 0
  private stageStartedAt = 0
  private invulnerableUntil = 0
  private lastPlayerShot = -PLAYER_FIRE_MS
  private lastLaserShot = 0
  private lastWingShot = 0
  private lastSparkShot = 0
  private statusMessageUntil = 0
  private isGameOver = false
  private isStageClear = false
  private isShopOpen = false
  private isPartChoiceOpen = false
  private chain = 0
  private maxChain = 0
  private multiplier = 1
  private lastChainAt = 0
  private grazeCount = 0
  private noMissRun = true
  private noBombRun = true

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
    preloadParallaxBackground(this)
    COIN_FRAME_KEYS.forEach((key, index) => {
      if (!this.textures.exists(key)) {
        this.load.image(key, `/assets/coin-spin/frame_${index.toString().padStart(3, '0')}.png`)
      }
    })
    Object.entries(AMMO_ICON_ASSETS).forEach(([partId, asset]) => {
      const key = this.getAmmoIconKey(partId as BulletCoreId)
      if (!this.textures.exists(key)) {
        this.load.image(key, asset)
      }
    })
  }

  create() {
    this.resetGameState()
    this.createCoinDropAnimation()
    this.background = new ParallaxBackground(this)

    this.player = createPlayerShip(this, GAME_WIDTH / 2, GAME_HEIGHT - 74, 76) as PhysicsSprite
    this.createPhysicsBodies()
    this.createInput()
    this.createHud()
    this.createBossUi()
    this.registerPhysicsOverlaps()

    this.statusText.setText(
      this.mode === 'practice'
        ? text({ ko: '보스 연습 시작', en: 'Boss practice start' }, this.settings.language)
        : text({ ko: '데모 런 시작', en: 'Demo run start' }, this.settings.language),
    )
  }

  update(time: number, delta: number) {
    this.background.update(delta / 1000)

    if (this.isShopOpen || this.isPartChoiceOpen) {
      void delta
      return
    }

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
    this.updateSupportDrones()

    if (this.fireKey.isDown && time - this.lastPlayerShot >= PLAYER_FIRE_MS) {
      this.fireBullet()
      this.lastPlayerShot = time
    }

    this.updateWeaponModules(time)

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
    keyboard.on('keydown', this.onKeyDown, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown', this.onKeyDown, this)
    })
  }

  private onKeyDown(event: KeyboardEvent) {
    if (this.isPartChoiceOpen && this.handlePanelSelectionKey(event, this.partChoiceItems, 'part-choice')) {
      return
    }

    if (this.isShopOpen && this.handlePanelSelectionKey(event, this.shopItems, 'shop')) {
      return
    }
  }

  private handlePanelSelectionKey(event: KeyboardEvent, items: PanelSelectableItem[], panel: 'shop' | 'part-choice') {
    if (items.length === 0) {
      return false
    }

    if (event.code === 'ArrowLeft' || event.code === 'ArrowUp' || event.code === 'KeyA' || event.code === 'KeyW') {
      event.preventDefault()
      this.movePanelSelection(panel, -1)
      return true
    }

    if (event.code === 'ArrowRight' || event.code === 'ArrowDown' || event.code === 'KeyD' || event.code === 'KeyS') {
      event.preventDefault()
      this.movePanelSelection(panel, 1)
      return true
    }

    if (this.isConfirmKey(event.code)) {
      event.preventDefault()
      if (event.repeat) {
        return true
      }

      const selectedIndex = panel === 'shop' ? this.selectedShopIndex : this.selectedPartChoiceIndex
      const item = items[selectedIndex]
      if (item?.enabled) {
        item.action()
      }
      return true
    }

    return false
  }

  private movePanelSelection(panel: 'shop' | 'part-choice', step: number) {
    if (panel === 'shop') {
      this.selectedShopIndex = this.getNextEnabledPanelIndex(this.shopItems, this.selectedShopIndex, step)
      this.updateShopSelection()
      return
    }

    this.selectedPartChoiceIndex = this.getNextEnabledPanelIndex(this.partChoiceItems, this.selectedPartChoiceIndex, step)
    this.updatePartChoiceSelection()
  }

  private getNextEnabledPanelIndex(items: PanelSelectableItem[], currentIndex: number, step: number) {
    if (!items.some((item) => item.enabled)) {
      return 0
    }

    let nextIndex = currentIndex
    for (let offset = 0; offset < items.length; offset += 1) {
      nextIndex = Phaser.Math.Wrap(nextIndex + step, 0, items.length)
      if (items[nextIndex]?.enabled) {
        return nextIndex
      }
    }

    return currentIndex
  }

  private normalizePanelSelection(items: PanelSelectableItem[], currentIndex: number) {
    if (items.length === 0) {
      return 0
    }

    const clampedIndex = Phaser.Math.Clamp(currentIndex, 0, items.length - 1)
    if (items[clampedIndex]?.enabled) {
      return clampedIndex
    }

    return this.getNextEnabledPanelIndex(items, clampedIndex, 1)
  }

  private updatePanelSelection(items: PanelSelectableItem[], selectedIndex: number) {
    items.forEach((item, index) => {
      const isSelected = item.enabled && index === selectedIndex
      item.plate.setFillStyle(isSelected ? item.selectedFill : item.defaultFill, isSelected ? item.selectedAlpha : item.defaultAlpha)
      item.plate.setStrokeStyle(
        2,
        isSelected ? item.selectedStroke : item.defaultStroke,
        isSelected ? item.selectedStrokeAlpha : item.defaultStrokeAlpha,
      )
    })
  }

  private updateShopSelection() {
    this.selectedShopIndex = this.normalizePanelSelection(this.shopItems, this.selectedShopIndex)
    this.updatePanelSelection(this.shopItems, this.selectedShopIndex)
  }

  private updatePartChoiceSelection() {
    this.selectedPartChoiceIndex = this.normalizePanelSelection(this.partChoiceItems, this.selectedPartChoiceIndex)
    this.updatePanelSelection(this.partChoiceItems, this.selectedPartChoiceIndex)
  }

  private isConfirmKey(code: string) {
    return code === 'Enter' || code === 'NumpadEnter' || code === 'Space'
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

    this.coinText = this.add.text(20, 82, 'GOLD 0', {
      color: '#facc15',
      fontFamily: MONO_FONT,
      fontSize: '14px',
    })

    this.weaponText = this.add.text(20, 102, 'ATK 1  MOD -/-', {
      color: '#fde68a',
      fontFamily: MONO_FONT,
      fontSize: '12px',
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

    this.hpBarFrame = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 18, 424, 16, 0x020617, 0.78)
    this.hpBarFrame.setStrokeStyle(2, 0xfecdd3, 0.84)
    this.hpBarFrame.setDepth(30)
    this.hpBarFill = this.add.rectangle(30, GAME_HEIGHT - 18, 420, 10, 0xfb7185, 0.96)
    this.hpBarFill.setOrigin(0, 0.5)
    this.hpBarFill.setDepth(31)
    this.hpText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 28, 'HP 0/0', {
        align: 'center',
        color: '#fee2e2',
        fontFamily: MONO_FONT,
        fontSize: '13px',
        fontStyle: '800',
      })
      .setOrigin(0.5)
      .setDepth(32)

    const ammoIconX = GAME_WIDTH / 2 + 180
    const ammoIconY = GAME_HEIGHT - 72
    this.bulletCoreIconGlow = this.add.ellipse(ammoIconX, ammoIconY, 62, 62, 0x38bdf8, 0.1)
    this.bulletCoreIconGlow.setDepth(33)
    this.bulletCoreIconFrame = this.add.rectangle(ammoIconX, ammoIconY, 54, 54, 0x020617, 0.62)
    this.bulletCoreIconFrame.setStrokeStyle(2, 0x64748b, 0.72)
    this.bulletCoreIconFrame.setDepth(34)
    this.tweens.add({
      targets: this.bulletCoreIconGlow,
      alpha: 0.32,
      scale: 1.12,
      duration: 720,
      ease: 'Sine.easeInOut',
      repeat: -1,
      yoyo: true,
    })

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

    this.updateHpDisplay()
    this.updateBombDisplay()
    this.updateScoreDisplay()
    this.updateCoinDisplay()
    this.updateWeaponDisplay()
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
    this.physics.add.overlap(this.player, this.bossGroup, this.onBossHitsPlayer, undefined, this)
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

  private enableImagePhysics(
    body: Phaser.GameObjects.Image,
    group: Phaser.Physics.Arcade.Group,
    width: number,
    height: number,
  ) {
    const physicsBody = this.physics.add.existing(body) as PhysicsImage
    physicsBody.body.setAllowGravity(false)
    physicsBody.body.setImmovable(true)
    physicsBody.body.setSize(width, height, true)
    group.add(physicsBody)
    return physicsBody
  }

  private enableSpritePhysics(
    body: Phaser.GameObjects.Sprite,
    group: Phaser.Physics.Arcade.Group,
    width: number,
    height: number,
  ) {
    const physicsBody = this.physics.add.existing(body) as PhysicsSprite
    physicsBody.body.setAllowGravity(false)
    physicsBody.body.setImmovable(true)
    physicsBody.body.setSize(width, height, true)
    group.add(physicsBody)
    return physicsBody
  }

  private createCoinDropAnimation() {
    if (this.anims.exists(COIN_ANIM_KEY)) {
      return
    }

    this.anims.create({
      key: COIN_ANIM_KEY,
      frames: COIN_FRAME_KEYS.map((key) => ({ key })),
      frameRate: 12,
      repeat: -1,
    })
  }

  private getAmmoIconKey(partId: BulletCoreId) {
    return `ammo-icon-${partId}`
  }

  private getPartIconKey(part?: PartDefinition) {
    if (!part?.iconKey) {
      return undefined
    }

    return part.iconKey
  }

  private setImageHeightPreservingAspect(image: Phaser.GameObjects.Image, height: number) {
    const source = image.texture.getSourceImage() as { width?: number; height?: number }
    const sourceWidth = source.width ?? image.width
    const sourceHeight = source.height ?? image.height
    const width = sourceHeight > 0 ? height * (sourceWidth / sourceHeight) : height
    image.setDisplaySize(width, height)
  }

  private setBodySizeToDisplay(body: PhysicsImage | PhysicsSprite) {
    const sourceWidth = body.displayWidth / Math.max(Math.abs(body.scaleX), 0.0001)
    const sourceHeight = body.displayHeight / Math.max(Math.abs(body.scaleY), 0.0001)
    body.body.setSize(Math.round(sourceWidth), Math.round(sourceHeight), true)
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
    this.activeLasers = []
    this.bombIcons = []
    this.supportDrones = []
    this.boss = undefined
    this.resultPanel = undefined
    this.shopPanel = undefined
    this.partChoicePanel = undefined
    this.shopItems = []
    this.partChoiceItems = []
    this.score = 0
    this.displayedBestScore = 0
    this.maxHp = this.difficulty.startingHp
    this.hp = this.maxHp
    this.bombs = MAX_BOMBS
    this.coins = 0
    this.attackPower = 1
    this.attackUpgradeCount = 0
    this.hpUpgradeCount = 0
    this.bulletCore = undefined
    this.weaponModules = []
    this.pendingPart = undefined
    this.partChoiceOpenedAt = 0
    this.selectedShopIndex = 0
    this.selectedPartChoiceIndex = 1
    this.runLevel = 1
    this.nextStageEventIndex = 0
    this.stageStartedAt = 0
    this.invulnerableUntil = 0
    this.lastPlayerShot = -PLAYER_FIRE_MS
    this.lastLaserShot = 0
    this.lastWingShot = 0
    this.lastSparkShot = 0
    this.statusMessageUntil = 0
    this.isGameOver = false
    this.isStageClear = false
    this.isShopOpen = false
    this.isPartChoiceOpen = false
    this.chain = 0
    this.maxChain = 0
    this.multiplier = 1
    this.lastChainAt = 0
    this.grazeCount = 0
    this.noMissRun = true
    this.noBombRun = true
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

    this.updatePlayerAnimation(dx)
  }

  private updatePlayerAnimation(dx: number) {
    const movingHorizontally = dx !== 0
    const nextAnimation = movingHorizontally ? PLAYER_MOVE_ANIM_KEY : PLAYER_IDLE_ANIM_KEY

    this.player.setFlipX(dx < 0)
    if (this.player.anims.currentAnim?.key !== nextAnimation) {
      this.player.play(nextAnimation)
    }
  }

  private fireBullet() {
    if (this.bulletCore?.id === 'flamethrower-core') {
      this.fireFlamethrowerBurst()
      playTone(this.settings, 300, 55, 'sawtooth', 0.055)
      return
    }

    this.createPlayerBullet(this.player.x, this.player.y - 42, -Math.PI / 2, this.getBulletDamage())
    playTone(this.settings, 720, 35, 'square', 0.035)
  }

  private fireFlamethrowerBurst() {
    const count = 5
    const spread = 0.44
    for (let index = 0; index < count; index += 1) {
      const offset = Phaser.Math.Linear(-spread, spread, index / (count - 1))
      const damage = Math.max(1, this.attackPower + (index === 2 ? 1 : 0))
      const bullet = this.createPlayerBullet(
        this.player.x + offset * 16,
        this.player.y - 36,
        -Math.PI / 2 + offset,
        damage,
        false,
        {
          color: index % 2 === 0 ? 0xfb923c : 0xef4444,
          height: 17,
          width: 10,
          speed: FLAME_BULLET_SPEED + Phaser.Math.Between(-30, 24),
          maxRange: FLAME_BULLET_RANGE,
          stroke: 0xfef3c7,
        },
      )
      bullet.body.setAlpha(0.9)
    }
  }

  private createPlayerBullet(
    x: number,
    y: number,
    angle: number,
    damage: number,
    moduleShot = false,
    options?: { color?: number; width?: number; height?: number; speed?: number; maxRange?: number; stroke?: number },
  ) {
    const color = moduleShot ? 0xa78bfa : this.bulletCore?.color ?? 0xfacc15
    const width = options?.width ?? (moduleShot ? 5 : 7)
    const height = options?.height ?? 22
    const body = this.enableRectanglePhysics(
      this.add.rectangle(x, y, width, height, options?.color ?? color),
      this.playerBulletsGroup,
      Math.max(7, width),
      Math.max(12, height),
    )
    body.setStrokeStyle(1, options?.stroke ?? (moduleShot ? 0xddd6fe : 0xfef08a))
    body.setRotation(angle + Math.PI / 2)
    const visual = this.createPlayerBulletVisual(x, y, angle, moduleShot, options)
    if (visual) {
      body.setAlpha(0)
    }
    const speed = options?.speed ?? PLAYER_BULLET_SPEED
    body.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed)
    const debug = this.createDebugRect(body.x, body.y, Math.max(7, width), Math.max(12, height), 0x22d3ee)
    const bullet: PlayerBullet = {
      body,
      damage,
      pierce: this.bulletCore?.id === 'armor-piercer' && !moduleShot ? this.getArmorPierceCount() : 0,
      pierceDamageScale: this.bulletCore?.id === 'armor-piercer' && !moduleShot ? this.getArmorPierceDamageScale() : 1,
      splashBounces: this.bulletCore?.id === 'splash-core' && !moduleShot ? this.getSplashBounceCount() : 0,
      chainLightning: this.hasModule('spark-module') && !moduleShot,
      hitTargets: new Set(),
      spawnedAt: this.time.now,
      originX: x,
      originY: y,
      maxRange: options?.maxRange,
      debug,
      visual,
    }
    this.bullets.push(bullet)
    return bullet
  }

  private createPlayerBulletVisual(
    x: number,
    y: number,
    angle: number,
    moduleShot: boolean,
    options?: { color?: number; width?: number; height?: number; speed?: number; maxRange?: number; stroke?: number },
  ) {
    if (moduleShot || options?.maxRange) {
      return undefined
    }

    createPlayerBulletAnimation(this)
    const visual = this.add.sprite(x, y, 'player-basic-bullet-frame-0')
    visual.setDisplaySize(BASIC_BULLET_DISPLAY_WIDTH, BASIC_BULLET_DISPLAY_HEIGHT)
    visual.setRotation(angle)
    visual.setDepth(9)
    visual.play(PLAYER_BULLET_ANIM_KEY)
    return visual
  }

  private getBulletDamage() {
    return this.attackPower + (this.bulletCore?.id === 'armor-piercer' ? 1 : 0)
  }

  private getArmorPierceCount() {
    return Math.min(4, 1 + Math.floor((this.runLevel - 1) / 2))
  }

  private getArmorPierceDamageScale() {
    return Math.min(0.9, 0.65 + this.runLevel * 0.05)
  }

  private getSplashBounceCount() {
    return Math.min(5, 1 + Math.floor((this.runLevel - 1) / 2))
  }

  private hasModule(id: PartDefinition['id']) {
    return this.weaponModules.some((module) => module.id === id)
  }

  private updateWeaponModules(time: number) {
    this.updateSupportDrones()
    this.updateActiveLasers(time)

    if (this.hasModule('laser-module') && time - this.lastLaserShot >= LASER_INTERVAL_MS) {
      this.lastLaserShot = time
      this.getSupportDronePositions().forEach((_position, index) => this.fireLaserModule(index))
    }

    if (this.hasModule('wing-module') && time - this.lastWingShot >= WING_INTERVAL_MS) {
      this.lastWingShot = time
      const [left, right] = this.getSupportDronePositions()
      this.createPlayerBullet(left.x, left.y - 16, -Math.PI / 2 - 0.12, Math.max(1, this.attackPower - 1), true)
      this.createPlayerBullet(right.x, right.y - 16, -Math.PI / 2 + 0.12, Math.max(1, this.attackPower - 1), true)
    }

    if (this.hasModule('spark-module') && time - this.lastSparkShot >= SPARK_INTERVAL_MS) {
      this.lastSparkShot = time
      this.getSupportDronePositions().forEach((position) => this.fireSparkModule(position.x, position.y))
    }
  }

  private updateSupportDrones() {
    if (this.weaponModules.length === 0 || !this.player?.active) {
      return
    }

    if (this.supportDrones.length === 0) {
      this.supportDrones = [-1, 1].map((direction) => {
        const drone = createPlayerShip(
          this,
          this.player.x + direction * SUPPORT_DRONE_OFFSET_X,
          this.player.y + SUPPORT_DRONE_OFFSET_Y,
          SUPPORT_DRONE_SIZE,
        )
        drone.setAlpha(0.74)
        drone.setDepth(10)
        return drone
      })
    }

    this.getSupportDronePositions().forEach((position, index) => {
      const drone = this.supportDrones[index]
      if (!drone) {
        return
      }

      drone.setPosition(position.x, position.y)
      drone.setAlpha(this.invulnerableUntil > this.time.now ? 0.42 : 0.74)
    })
  }

  private getSupportDronePositions() {
    return [
      { x: this.player.x - SUPPORT_DRONE_OFFSET_X, y: this.player.y + SUPPORT_DRONE_OFFSET_Y },
      { x: this.player.x + SUPPORT_DRONE_OFFSET_X, y: this.player.y + SUPPORT_DRONE_OFFSET_Y },
    ] as const
  }

  private fireLaserModule(sourceIndex: number) {
    const beam = this.add.graphics()
    beam.setDepth(9)
    this.activeLasers.push({
      graphics: beam,
      sourceIndex,
      expiresAt: this.time.now + LASER_DURATION_MS,
      nextDamageAt: this.time.now,
    })
    this.time.delayedCall(LASER_DURATION_MS, () => {
      this.tweens.add({
        targets: beam,
        alpha: 0,
        duration: 150,
        onComplete: () => beam.destroy(),
      })
    })
  }

  private updateActiveLasers(time: number) {
    this.activeLasers = this.activeLasers.filter((laser) => {
      if (!laser.graphics.active) {
        return false
      }

      const positions = this.getSupportDronePositions()
      const source = positions[laser.sourceIndex]
      if (!source || time > laser.expiresAt) {
        return false
      }

      this.drawLaserBeam(laser.graphics, source.x, source.y)
      if (time >= laser.nextDamageAt) {
        laser.nextDamageAt = time + LASER_DAMAGE_TICK_MS
        this.damageLaserTargets(source.x, source.y)
      }

      return true
    })
  }

  private drawLaserBeam(beam: Phaser.GameObjects.Graphics, x: number, y: number) {
    const topY = 30
    beam.clear()
    beam.lineStyle(12, 0xef4444, 0.42)
    beam.lineBetween(x, y, x, topY)
    beam.lineStyle(4, 0xfecaca, 0.96)
    beam.lineBetween(x, y, x, topY)
  }

  private damageLaserTargets(x: number, y: number) {
    const laserDamage = this.attackPower + 1
    this.enemies.forEach((enemy) => {
      if (Math.abs(enemy.body.x - x) <= enemy.archetype.width / 2 + 8 && enemy.body.y < y) {
        enemy.hp -= laserDamage
        createBurst(this, enemy.body.x, enemy.body.y, 0xef4444, 4)
      }
    })
    this.finishDeadEnemies()

    if (this.boss && Math.abs(this.boss.body.x - x) <= this.boss.body.width / 2 + 8) {
      this.damageBoss(laserDamage)
    }
  }

  private fireSparkModule(x: number, y: number) {
    const target = this.findNearestTarget(x, y, 260)
    if (!target) {
      return
    }

    const line = this.add.line(0, 0, x, y, target.x, target.y, 0xfacc15, 0.86)
    line.setOrigin(0, 0)
    line.setDepth(12)
    this.tweens.add({ targets: line, alpha: 0, duration: 130, onComplete: () => line.destroy() })

    if ('enemy' in target) {
      target.enemy.hp -= Math.max(1, this.attackPower)
      createBurst(this, target.enemy.body.x, target.enemy.body.y, 0xfacc15, 5)
      this.finishDeadEnemies()
      return
    }

    this.damageBoss(Math.max(1, this.attackPower))
  }

  private findNearestTarget(x: number, y: number, maxDistance: number) {
    const enemyTarget = this.enemies
      .filter((enemy) => enemy.hp > 0)
      .map((enemy) => ({
        enemy,
        x: enemy.body.x,
        y: enemy.body.y,
        distance: Phaser.Math.Distance.Between(x, y, enemy.body.x, enemy.body.y),
      }))
      .filter((target) => target.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)[0]

    if (enemyTarget) {
      return enemyTarget
    }

    if (!this.boss) {
      return undefined
    }

    const distance = Phaser.Math.Distance.Between(x, y, this.boss.body.x, this.boss.body.y)
    if (distance > maxDistance) {
      return undefined
    }

    return { boss: this.boss, x: this.boss.body.x, y: this.boss.body.y, distance }
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
    })
    this.finishDeadEnemies()

    if (this.boss) {
      this.boss.hp -= 24
      this.updateBossHealthBar()
      if (this.boss.hp <= 0) {
        this.openShop()
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

  private dropEnemyRewards(enemy: Enemy) {
    const coinValue = Math.max(1, Math.round(enemy.archetype.coinReward * this.getRewardScale()))
    this.spawnDrop(enemy.body.x - 8, enemy.body.y, 'coin', coinValue)
    if (Math.random() < enemy.archetype.dropChance) {
      this.spawnDrop(enemy.body.x + 10, enemy.body.y, 'part', undefined, this.pickPartDrop())
    }
  }

  private spawnDrop(x: number, y: number, kind: FieldDrop['kind'], coinValue?: number, part?: PartDefinition) {
    const color = kind === 'coin' ? 0xfacc15 : part?.color ?? 0x38bdf8
    const iconKey = this.getPartIconKey(part)
    const isCoinDrop = kind === 'coin'
    const isIconDrop = kind === 'part' && iconKey
    const glowSize = isCoinDrop ? 20 : isIconDrop ? 34 : 20
    const glow = this.add.ellipse(x, y, glowSize, glowSize, color, 0.18)
    glow.setDepth(13)
    let body: FieldDrop['body']
    if (isCoinDrop) {
      const coinBody = this.enableSpritePhysics(
        this.add.sprite(x, y, COIN_FRAME_KEYS[0]),
        this.powerUpsGroup,
        COIN_DISPLAY_SIZE,
        COIN_DISPLAY_SIZE,
      )
      coinBody.setDisplaySize(COIN_DISPLAY_SIZE, COIN_DISPLAY_SIZE)
      this.setBodySizeToDisplay(coinBody)
      coinBody.play(COIN_ANIM_KEY)
      body = coinBody
    } else if (isIconDrop) {
      body = this.enableImagePhysics(this.add.image(x, y, iconKey), this.powerUpsGroup, 1, 1)
      this.setImageHeightPreservingAspect(body, PART_DROP_DISPLAY_HEIGHT)
      this.setBodySizeToDisplay(body)
    } else {
      body = this.enableRectanglePhysics(this.add.rectangle(x, y, 13, 13, color, 0.95), this.powerUpsGroup, 14, 14)
    }
    body.setDepth(14)
    if (!isIconDrop && !isCoinDrop) {
      const rectangleBody = body as PhysicsRectangle
      body.setAngle(45)
      rectangleBody.setStrokeStyle(2, 0xe0f2fe, 0.95)
    }
    const driftDirection = Math.random() < 0.5 ? -1 : 1
    if (kind === 'coin') {
      body.body.setVelocity(driftDirection * POWER_UP_DRIFT_SPEED, POWER_UP_SPEED)
    } else {
      body.body.setVelocity(
        driftDirection * Phaser.Math.Between(90, 150),
        Phaser.Math.Between(70, 130) * (Math.random() < 0.5 ? -1 : 1),
      )
    }
    const debug = this.createDebugRect(body.x, body.y, body.body.width, body.body.height, color)

    if (isIconDrop) {
      this.tweens.add({
        targets: glow,
        scale: 1.16,
        alpha: 0.34,
        duration: 520,
        ease: 'Sine.easeInOut',
        repeat: -1,
        yoyo: true,
      })
    } else if (!isCoinDrop) {
      this.tweens.add({
        targets: [body, glow],
        scale: 1.18,
        duration: 520,
        ease: 'Sine.easeInOut',
        repeat: -1,
        yoyo: true,
      })
    } else {
      this.tweens.add({
        targets: glow,
        scale: 1.16,
        alpha: 0.32,
        duration: 520,
        ease: 'Sine.easeInOut',
        repeat: -1,
        yoyo: true,
      })
    }

    this.powerUps.push({
      body,
      glow,
      kind,
      coinValue,
      part,
      spawnedAt: this.time.now,
      nextTurnAt: this.time.now + Phaser.Math.Between(900, 1_800),
      driftDirection,
      debug,
    })
  }

  private pickPartDrop() {
    return Phaser.Utils.Array.GetRandom(PART_CATALOG)
  }

  private getRewardScale() {
    return 1 + (this.runLevel - 1) * RUN_LEVEL_REWARD_SCALE
  }

  private getRunHpScale() {
    return 1 + (this.runLevel - 1) * RUN_LEVEL_HP_SCALE
  }

  private getRunBulletSpeedScale() {
    return 1 + (this.runLevel - 1) * RUN_LEVEL_BULLET_SPEED_SCALE
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
      hp: Math.max(1, Math.ceil(archetype.hp * this.difficulty.enemyHpScale * this.getRunHpScale())),
      firedShots: new Set<string>(),
    })
  }

  private maybeSpawnBoss(elapsedMs: number) {
    if (this.boss || elapsedMs < this.stage.bossAppearMs) {
      return
    }

    const maxHp = Math.round(this.stage.boss.maxHp * this.difficulty.bossHpScale * this.getRunHpScale())
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
      patternStep: 0,
      nextPatternAtMs: BOSS_PHASE_START_DELAY_MS,
    }

    this.setBossUiVisible(true)
    this.statusText.setText(text({ ko: '보스 출현', en: 'Boss incoming' }, this.settings.language))
    this.statusText.setColor('#fecdd3')
    flashScreen(this, 0xf0abfc, 0.13)
    playTone(this.settings, 220, 220, 'sawtooth', 0.2)
  }

  private updateBullets() {
    this.bullets = this.bullets.filter((bullet) => {
      this.syncPlayerBulletVisual(bullet)
      this.syncDebugRect(bullet.debug, bullet.body)

      if (bullet.maxRange) {
        const traveled = Phaser.Math.Distance.Between(bullet.originX, bullet.originY, bullet.body.x, bullet.body.y)
        const alpha = Phaser.Math.Clamp(1 - traveled / bullet.maxRange, 0.18, 0.92)
        bullet.body.setAlpha(alpha)
        bullet.visual?.setAlpha(alpha)
        if (traveled >= bullet.maxRange) {
          createBurst(this, bullet.body.x, bullet.body.y, 0xfb923c, 3)
          this.destroyPlayerBullet(bullet)
          return false
        }
      }

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

  private syncPlayerBulletVisual(bullet: PlayerBullet) {
    if (!bullet.visual?.active) {
      return
    }

    bullet.visual.setPosition(bullet.body.x, bullet.body.y)
  }

  private updatePowerUps() {
    this.powerUps = this.powerUps.filter((powerUp) => {
      const ageMs = this.time.now - powerUp.spawnedAt
      if (powerUp.kind === 'coin') {
        if (this.updateCoinDrop(powerUp)) {
          return false
        }
      } else {
        this.updatePartDrop(powerUp, ageMs)
      }

      powerUp.glow.y = powerUp.body.y
      powerUp.glow.x = powerUp.body.x
      this.syncDebugRect(powerUp.debug, powerUp.body)

      if (ageMs >= DROP_LIFETIME_MS || powerUp.body.y > GAME_HEIGHT + 40) {
        this.destroyPowerUp(powerUp)
        return false
      }

      return true
    })
  }

  private updateCoinDrop(powerUp: FieldDrop) {
    const distance = Phaser.Math.Distance.Between(powerUp.body.x, powerUp.body.y, this.player.x, this.player.y)
    if (distance <= 18) {
      this.collectPowerUp(powerUp)
      return true
    }

    if (distance <= COIN_MAGNET_RADIUS) {
      const angle = Phaser.Math.Angle.Between(powerUp.body.x, powerUp.body.y, this.player.x, this.player.y)
      const speed = Phaser.Math.Linear(COIN_MAGNET_SPEED * 0.55, COIN_MAGNET_SPEED, 1 - distance / COIN_MAGNET_RADIUS)
      powerUp.body.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed)
      return false
    }

    const shouldTurnByBounds =
      (powerUp.body.x <= 18 && powerUp.driftDirection < 0) ||
      (powerUp.body.x >= GAME_WIDTH - 18 && powerUp.driftDirection > 0)

    if (shouldTurnByBounds) {
      powerUp.driftDirection = powerUp.driftDirection === 1 ? -1 : 1
      powerUp.body.body.setVelocity(powerUp.driftDirection * POWER_UP_DRIFT_SPEED, POWER_UP_SPEED)
    }

    return false
  }

  private updatePartDrop(powerUp: FieldDrop, ageMs: number) {
    const velocity = powerUp.body.body.velocity
    if ((powerUp.body.x <= 18 && velocity.x < 0) || (powerUp.body.x >= GAME_WIDTH - 18 && velocity.x > 0)) {
      powerUp.body.body.setVelocityX(-velocity.x)
      powerUp.body.x = Phaser.Math.Clamp(powerUp.body.x, 18, GAME_WIDTH - 18)
    }

    if ((powerUp.body.y <= PART_DROP_MIN_Y && velocity.y < 0) || (powerUp.body.y >= PART_DROP_MAX_Y && velocity.y > 0)) {
      powerUp.body.body.setVelocityY(-velocity.y)
      powerUp.body.y = Phaser.Math.Clamp(powerUp.body.y, PART_DROP_MIN_Y, PART_DROP_MAX_Y)
    }

    if (ageMs >= DROP_LIFETIME_MS - DROP_BLINK_MS) {
      const blink = 0.35 + Math.abs(Math.sin(this.time.now / 95)) * 0.65
      powerUp.body.setAlpha(blink)
      powerUp.glow.setAlpha(0.08 + blink * 0.22)
    }
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
    const movementAgeMs = ageMs * ENEMY_MOVEMENT_SPEED_MULTIPLIER
    const ageSeconds = movementAgeMs / 1000

    if (enemy.movement === 'formation') {
      enemy.body.x = enemy.startX + Math.sin(movementAgeMs / 620) * 6
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
      enemy.body.x = enemy.startX + Math.sin(movementAgeMs / 330) * 44
      enemy.body.y = -28 + ageSeconds * 124
      return
    }

    if (enemy.movement === 'hover') {
      if (movementAgeMs < 1_000) {
        enemy.body.x = enemy.startX
        enemy.body.y = Phaser.Math.Linear(-28, enemy.targetY, movementAgeMs / 1_000)
        return
      }

      if (movementAgeMs < 3_200) {
        enemy.body.x = enemy.startX + Math.sin(movementAgeMs / 420) * 18
        enemy.body.y = enemy.targetY + Math.sin(movementAgeMs / 330) * 4
        return
      }

      enemy.body.y = enemy.targetY + ((movementAgeMs - 3_200) / 1000) * 118
      return
    }

    if (enemy.movement === 'split-left' || enemy.movement === 'split-right') {
      const direction = enemy.movement === 'split-right' ? 1 : -1
      enemy.body.x = enemy.startX + direction * Math.pow(ageSeconds, 1.15) * 54
      enemy.body.y = -28 + ageSeconds * 132
      return
    }

    const direction = enemy.movement === 'ambush-right' ? 1 : -1
    if (movementAgeMs < 900) {
      enemy.body.x = enemy.startX
      enemy.body.y = Phaser.Math.Linear(-28, enemy.targetY, movementAgeMs / 900)
      return
    }

    if (movementAgeMs < 2_800) {
      enemy.body.x = enemy.startX + Math.sin(movementAgeMs / 260) * 9
      enemy.body.y = enemy.targetY + Math.sin(movementAgeMs / 330) * 4
      return
    }

    const exitProgress = (movementAgeMs - 2_800) / 1_600
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
      boss.patternStep = 0
      boss.nextPatternAtMs = ageMs + BOSS_PHASE_START_DELAY_MS
      this.enemyBullets.forEach((bullet) => this.destroyEnemyBullet(bullet))
      this.enemyBullets = []
      this.statusMessageUntil = this.time.now + 1_200
      this.statusText.setText(text({ ko: '2페이즈 돌입', en: 'Phase 2 engaged' }, this.settings.language))
      this.statusText.setColor('#fef08a')
      flashScreen(this, 0xf43f5e, 0.16)
      shakeCamera(this, this.settings, 260, 0.012)
      playTone(this.settings, 180, 260, 'sawtooth', 0.24)
    }

    const bossMovementAgeMs = ageMs * BOSS_MOVEMENT_SPEED_MULTIPLIER
    const driftX =
      Math.sin(bossMovementAgeMs / (boss.phase === 1 ? 1_200 : 820)) * (boss.phase === 1 ? 120 : 142)
    boss.body.x = GAME_WIDTH / 2 + driftX
    boss.body.y = 90 + Math.sin(bossMovementAgeMs / 1_700) * 8
    boss.core.x = boss.body.x
    boss.core.y = boss.body.y + 4
    this.syncDebugRect(boss.debug, boss.body)

    const bossSpeed =
      this.difficulty.bossBulletSpeed * this.getRunBulletSpeedScale() * ENEMY_PROJECTILE_SPEED_MULTIPLIER
    this.updateBossPatternSequence(boss, ageMs, bossSpeed)
  }

  private updateBossPatternSequence(boss: Boss, ageMs: number, bossSpeed: number) {
    if (ageMs < boss.nextPatternAtMs) {
      return
    }

    const sequence = boss.phase === 1 ? BOSS_PHASE_ONE_PATTERN_SEQUENCE : BOSS_PHASE_TWO_PATTERN_SEQUENCE
    const pattern = sequence[boss.patternStep % sequence.length]
    this.fireBossPattern(boss, pattern, ageMs, bossSpeed)
    boss.patternStep += 1
    boss.nextPatternAtMs = ageMs + (boss.phase === 1 ? BOSS_PHASE_ONE_PATTERN_INTERVAL_MS : BOSS_PHASE_TWO_PATTERN_INTERVAL_MS)
  }

  private fireBossPattern(boss: Boss, pattern: BossPatternId, ageMs: number, bossSpeed: number) {
    if (pattern === 1) {
      this.fireRing(
        boss.body.x,
        boss.body.y + 40,
        boss.phase === 1 ? 18 : 22,
        (boss.phase === 1 ? 142 : 162) * bossSpeed,
        ageMs / (boss.phase === 1 ? 900 : 620),
        0xc4b5fd,
        5,
        2,
      )
      return
    }

    if (pattern === 2) {
      this.fireFan(
        boss.body.x,
        boss.body.y + 44,
        Math.PI / 2,
        boss.phase === 1 ? 7 : 9,
        boss.phase === 1 ? 0.64 : 0.78,
        (boss.phase === 1 ? 210 : 230) * bossSpeed,
        boss.phase === 1 ? 0xfca5a5 : 0xf9a8d4,
        5,
        2,
      )
      return
    }

    this.fireAimedBullet(boss.body.x - 34, boss.body.y + 36, (boss.phase === 1 ? 235 : 258) * bossSpeed, 0x67e8f9, 4, 2)
    this.fireAimedBullet(boss.body.x + 34, boss.body.y + 36, (boss.phase === 1 ? 235 : 258) * bossSpeed, 0x67e8f9, 4, 2)
  }

  private fireBulletPattern(x: number, y: number, pattern: BulletPattern, ageMs: number) {
    const speed =
      pattern.speed *
      this.difficulty.enemyBulletSpeed *
      this.getRunBulletSpeedScale() *
      ENEMY_PROJECTILE_SPEED_MULTIPLIER
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
        if (this.isGameOver || this.isStageClear || this.isShopOpen || this.isPartChoiceOpen) {
          return
        }

        const burstSpeed = speed + index * 16 * ENEMY_PROJECTILE_SPEED_MULTIPLIER
        this.fireFan(x, y, centerAngle, count, spread + index * 0.08, burstSpeed, pattern.color, pattern.radius)
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

    if (bullet.hitTargets.has(enemy)) {
      return
    }
    bullet.hitTargets.add(enemy)

    enemy.hp -= bullet.damage
    if (bullet.chainLightning) {
      this.triggerSparkChain(enemy.body.x, enemy.body.y, bullet.damage)
    }
    if (bullet.splashBounces > 0) {
      this.triggerSplashChain(enemy.body.x, enemy.body.y, bullet.damage, bullet.splashBounces, new Set([enemy]))
    }

    if (bullet.pierce > 0) {
      bullet.pierce -= 1
      bullet.damage = Math.max(1, Math.ceil(bullet.damage * bullet.pierceDamageScale))
      createBurst(this, enemy.body.x, enemy.body.y, 0xf97316, 3)
    } else {
      this.bullets = this.bullets.filter((item) => item !== bullet)
      this.destroyPlayerBullet(bullet)
    }

    if (enemy.hp <= 0) {
      this.defeatEnemy(enemy)
    }
  }

  private onPlayerBulletHitsBoss(bulletObject: ArcadeOverlapObject) {
    const bulletBody = this.getPhysicsGameObject(bulletObject)
    const bullet = this.bullets.find((item) => item.body === bulletBody)
    if (!bullet || !this.boss) {
      return
    }

    if (bullet.hitTargets.has(this.boss)) {
      return
    }
    bullet.hitTargets.add(this.boss)

    this.bullets = this.bullets.filter((item) => item !== bullet)
    this.destroyPlayerBullet(bullet)
    this.damageBoss(bullet.damage)
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
    this.damagePlayer(this.time.now, bullet.damage)
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
    this.damagePlayer(this.time.now, ENEMY_COLLISION_DAMAGE)
    this.destroyEnemy(enemy)
  }

  private onBossHitsPlayer() {
    this.damagePlayer(this.time.now, BOSS_COLLISION_DAMAGE)
  }

  private defeatEnemy(enemy: Enemy) {
    const enemyX = enemy.body.x
    const enemyY = enemy.body.y
    this.dropEnemyRewards(enemy)
    this.enemies = this.enemies.filter((item) => item !== enemy)
    this.destroyEnemy(enemy)
    this.addScore(enemy.archetype.score, true)
    createBurst(this, enemyX, enemyY, enemy.archetype.stroke, 8)
    playTone(this.settings, 240, 80, 'triangle', 0.08)
  }

  private finishDeadEnemies() {
    const enemies = [...this.enemies]
    enemies.forEach((enemy) => {
      if (enemy.hp <= 0) {
        this.defeatEnemy(enemy)
      }
    })
  }

  private triggerSparkChain(x: number, y: number, damage: number) {
    const target = this.enemies
      .filter((enemy) => enemy.hp > 0)
      .map((enemy) => ({
        enemy,
        distance: Phaser.Math.Distance.Between(x, y, enemy.body.x, enemy.body.y),
      }))
      .filter((item) => item.distance <= 150)
      .sort((a, b) => a.distance - b.distance)[0]?.enemy

    if (target) {
      const line = this.add.line(0, 0, x, y, target.body.x, target.body.y, 0xfacc15, 0.8)
      line.setOrigin(0, 0)
      line.setDepth(12)
      this.tweens.add({ targets: line, alpha: 0, duration: 100, onComplete: () => line.destroy() })
      target.hp -= Math.max(1, Math.floor(damage / 2))
      createBurst(this, target.body.x, target.body.y, 0xfacc15, 4)
      return
    }

    if (this.boss && Phaser.Math.Distance.Between(x, y, this.boss.body.x, this.boss.body.y) <= 180) {
      const line = this.add.line(0, 0, x, y, this.boss.body.x, this.boss.body.y, 0xfacc15, 0.8)
      line.setOrigin(0, 0)
      line.setDepth(12)
      this.tweens.add({ targets: line, alpha: 0, duration: 100, onComplete: () => line.destroy() })
      this.damageBoss(Math.max(1, Math.floor(damage / 2)))
    }
  }

  private triggerSplashChain(x: number, y: number, damage: number, remainingBounces: number, visited: Set<Enemy | Boss>) {
    if (remainingBounces <= 0) {
      return
    }

    const nextDamage = Math.max(1, Math.ceil(damage * 0.72))
    const target = this.enemies
      .filter((enemy) => enemy.hp > 0 && !visited.has(enemy))
      .map((enemy) => ({
        enemy,
        distance: Phaser.Math.Distance.Between(x, y, enemy.body.x, enemy.body.y),
      }))
      .filter((item) => item.distance <= SPLASH_CHAIN_RANGE)
      .sort((a, b) => a.distance - b.distance)[0]?.enemy

    if (target) {
      visited.add(target)
      const targetX = target.body.x
      const targetY = target.body.y
      const line = this.add.line(0, 0, x, y, targetX, targetY, 0x38bdf8, 0.82)
      line.setOrigin(0, 0)
      line.setDepth(12)
      this.tweens.add({ targets: line, alpha: 0, duration: 130, onComplete: () => line.destroy() })
      target.hp -= nextDamage
      createBurst(this, targetX, targetY, 0x38bdf8, 5)
      if (target.hp <= 0) {
        this.defeatEnemy(target)
      }
      this.triggerSplashChain(targetX, targetY, nextDamage, remainingBounces - 1, visited)
      return
    }

    if (
      this.boss &&
      !visited.has(this.boss) &&
      Phaser.Math.Distance.Between(x, y, this.boss.body.x, this.boss.body.y) <= SPLASH_CHAIN_RANGE + 40
    ) {
      visited.add(this.boss)
      const line = this.add.line(0, 0, x, y, this.boss.body.x, this.boss.body.y, 0x38bdf8, 0.82)
      line.setOrigin(0, 0)
      line.setDepth(12)
      this.tweens.add({ targets: line, alpha: 0, duration: 130, onComplete: () => line.destroy() })
      this.damageBoss(nextDamage)
    }
  }

  private damageBoss(amount = 1) {
    if (!this.boss) {
      return
    }

    this.boss.hp -= amount
    this.addScore(this.stage.score.bossHit, false)
    this.updateBossHealthBar()

    if (this.boss.hp <= 0) {
      this.openShop()
      return
    }

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

  }

  private updateBossHealthBar() {
    if (!this.boss) {
      return
    }

    const ratio = Phaser.Math.Clamp(this.boss.hp / this.boss.maxHp, 0, 1)
    this.bossBarFill.width = 256 * ratio
  }

  private fireAimedBullet(x: number, y: number, speed: number, color: number, radius: number, damage = 1) {
    const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y)
    this.fireEnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, radius, damage)
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
    damage = 1,
  ) {
    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0 : Phaser.Math.Linear(-spread, spread, index / (count - 1))
      const angle = centerAngle + offset
      this.fireEnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, radius, damage)
    }
  }

  private fireRing(x: number, y: number, count: number, speed: number, rotation: number, color: number, radius: number, damage = 1) {
    for (let index = 0; index < count; index += 1) {
      const angle = rotation + (Math.PI * 2 * index) / count
      this.fireEnemyBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, radius, damage)
    }
  }

  private fireEnemyBullet(x: number, y: number, vx: number, vy: number, color: number, radius: number, damage = 1) {
    const body = this.enableEllipsePhysics(this.add.ellipse(x, y, radius * 2, radius * 2, color, 0.95), this.enemyBulletsGroup, radius)
    body.setStrokeStyle(1, 0xffffff, 0.55)
    body.body.setVelocity(vx, vy)
    const debug = this.createDebugCircle(x, y, radius, 0xfacc15)
    this.enemyBullets.push({ body, radius, damage, grazed: false, debug })
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

  private damagePlayer(time: number, amount: number) {
    if (time < this.invulnerableUntil || this.isGameOver || this.isStageClear || this.isShopOpen || this.isPartChoiceOpen) {
      return
    }

    this.hp = Math.max(0, this.hp - amount)
    this.noMissRun = false
    this.chain = 0
    this.multiplier = 1
    this.updateHpDisplay()
    this.updateScoreDisplay()
    createBurst(this, this.player.x, this.player.y, 0xfecaca, 12)
    playTone(this.settings, 100, 180, 'sawtooth', 0.18)
    shakeCamera(this, this.settings, 220, 0.012)

    if (this.hp <= 0) {
      this.endGame()
      return
    }

    this.invulnerableUntil = time + PLAYER_HIT_INVULNERABLE_MS
    this.statusMessageUntil = time + 900
    this.statusText.setText(
      text({ ko: `피격! HP ${this.hp}/${this.maxHp}`, en: `Hit! HP ${this.hp}/${this.maxHp}` }, this.settings.language),
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

  private updateHpDisplay() {
    const ratio = this.maxHp > 0 ? Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1) : 0
    this.hpText.setText(`HP ${this.hp}/${this.maxHp}`)
    this.hpText.setColor(this.hp <= Math.ceil(this.maxHp * 0.3) ? '#fecaca' : '#fee2e2')
    this.hpBarFill.width = 420 * ratio
    this.hpBarFill.fillColor = ratio <= 0.3 ? 0xef4444 : ratio <= 0.6 ? 0xf97316 : 0x22c55e
    this.hpBarFrame.setStrokeStyle(2, ratio <= 0.3 ? 0xfca5a5 : 0xfecdd3, 0.84)
  }

  private updateBombDisplay() {
    this.bombIcons.forEach((icon, index) => {
      const isActive = index < this.bombs
      icon.setAlpha(isActive ? 1 : 0.2)
      icon.setFillStyle(isActive ? 0xfde68a : 0x475569, isActive ? 0.95 : 0.42)
    })
  }

  private collectPowerUp(powerUp: FieldDrop) {
    this.powerUps = this.powerUps.filter((item) => item !== powerUp)
    this.destroyPowerUp(powerUp)

    if (powerUp.kind === 'coin') {
      const coinValue = powerUp.coinValue ?? 1
      this.coins += coinValue
      this.updateCoinDisplay()
      this.statusMessageUntil = this.time.now + 650
      this.statusText.setText(text({ ko: `금화 +${coinValue}`, en: `Gold +${coinValue}` }, this.settings.language))
      this.statusText.setColor('#facc15')
      playTone(this.settings, 980, 70, 'triangle', 0.08)
      return
    }

    if (powerUp.part) {
      this.handlePartPickup(powerUp.part)
    }
  }

  private handlePartPickup(part: PartDefinition) {
    if (part.kind === 'bullet-core') {
      if (!this.bulletCore) {
        this.equipPart(part)
        return
      }

      this.openPartChoice(part)
      return
    }

    if (this.weaponModules.length < MAX_MODULE_SLOTS) {
      this.equipPart(part)
      return
    }

    this.openPartChoice(part)
  }

  private equipPart(part: PartDefinition, replaceIndex = 0) {
    if (part.kind === 'bullet-core') {
      this.bulletCore = part
    } else if (this.weaponModules.length < MAX_MODULE_SLOTS) {
      this.weaponModules.push(part)
    } else {
      this.weaponModules[replaceIndex] = part
    }

    this.updateWeaponDisplay()
    this.updateSupportDrones()
    this.statusMessageUntil = this.time.now + 1_100
    this.statusText.setText(text({ ko: `파츠 장착: ${part.label.ko}`, en: `Part equipped: ${part.label.en}` }, this.settings.language))
    this.statusText.setColor('#fde68a')
    createBurst(this, this.player.x, this.player.y - 16, 0xfde68a, 8)
    playTone(this.settings, 980, 120, 'triangle', 0.12)
  }

  private updateWeaponDisplay() {
    const modules = this.weaponModules.map((part) => text(part.label, this.settings.language)).join('/')
    this.weaponText.setText(`ATK ${this.attackPower}  MOD ${modules || '-/-'}`)
    this.weaponText.setColor(this.weaponModules.length === MAX_MODULE_SLOTS && this.bulletCore ? '#bbf7d0' : '#fde68a')
    this.updateBulletCoreHudIcon()
  }

  private updateBulletCoreHudIcon() {
    this.bulletCoreIcon?.destroy()
    this.bulletCoreIcon = undefined

    const iconKey = this.getPartIconKey(this.bulletCore)
    const tint = this.bulletCore?.color ?? 0x64748b
    this.bulletCoreIconGlow.setFillStyle(tint, this.bulletCore ? 0.22 : 0.08)
    this.bulletCoreIconFrame.setStrokeStyle(2, tint, this.bulletCore ? 0.92 : 0.52)

    if (!iconKey) {
      this.bulletCoreIconGlow.setVisible(false)
      this.bulletCoreIconFrame.setVisible(false)
      return
    }

    this.bulletCoreIconGlow.setVisible(true)
    this.bulletCoreIconFrame.setVisible(true)
    this.bulletCoreIconFrame.setFillStyle(0x020617, 0.72)
    this.bulletCoreIcon = this.add.image(this.bulletCoreIconFrame.x, this.bulletCoreIconFrame.y, iconKey)
    this.setImageHeightPreservingAspect(this.bulletCoreIcon, AMMO_ICON_DISPLAY_SIZE)
    this.bulletCoreIcon.setDepth(35)
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
    if (this.runLevel > 1) {
      this.statusText.setText(`${this.statusText.text}  WAVE ${this.runLevel}`)
    }
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

  private updateCoinDisplay() {
    this.coinText.setText(`GOLD ${this.coins}`)
  }

  private openShop() {
    if (!this.boss || this.isShopOpen) {
      return
    }

    this.coins += Math.round(BOSS_CLEAR_COIN_REWARD * this.getRewardScale())
    this.updateCoinDisplay()
    this.destroyBoss()
    this.enemyBullets.forEach((bullet) => this.destroyEnemyBullet(bullet))
    this.enemies.forEach((enemy) => this.destroyEnemy(enemy))
    this.powerUps.forEach((powerUp) => this.destroyPowerUp(powerUp))
    this.enemyBullets = []
    this.enemies = []
    this.powerUps = []
    this.bullets.forEach((bullet) => this.destroyPlayerBullet(bullet))
    this.bullets = []
    this.player.body.setVelocity(0, 0)
    this.setBossUiVisible(false)
    this.isShopOpen = true
    this.statusText.setText(text({ ko: '보스 격파! 상점이 열렸습니다', en: 'Boss down! Shop open' }, this.settings.language))
    this.statusText.setColor('#bbf7d0')
    flashScreen(this, 0xbbf7d0, 0.18)
    shakeCamera(this, this.settings, 280, 0.01)
    playTone(this.settings, 740, 260, 'triangle', 0.18)
    this.renderShop()
  }

  private renderShop() {
    this.shopPanel?.destroy()
    this.shopItems = []

    const attackCost = this.getAttackUpgradeCost()
    const hpCost = this.getHpUpgradeCost()
    const panel = this.add.container(GAME_WIDTH / 2, 330)
    const background = this.add.rectangle(0, 0, 404, 330, 0x020617, 0.94)
    background.setStrokeStyle(2, 0xfacc15, 0.9)
    const title = this.add
      .text(0, -142, text({ ko: `상점 - 웨이브 ${this.runLevel} 클리어`, en: `Shop - Wave ${this.runLevel} clear` }, this.settings.language), {
        color: '#fef08a',
        fontFamily: UI_FONT,
        fontSize: '24px',
        fontStyle: '900',
      })
      .setOrigin(0.5)
    const wallet = this.add
      .text(0, -108, `GOLD ${this.coins}`, {
        color: '#facc15',
        fontFamily: MONO_FONT,
        fontSize: '18px',
      })
      .setOrigin(0.5)

    const attackCard = this.createShopCard(-102, -18, {
      title: text({ ko: '공격력 +1', en: 'Attack +1' }, this.settings.language),
      body: text({ ko: `기본탄/모듈 피해 증가\n가격 ${attackCost}G`, en: `More bullet/module damage\nCost ${attackCost}G` }, this.settings.language),
      cost: attackCost,
      onBuy: () => this.buyAttackUpgrade(),
    })
    const hpCard = this.createShopCard(102, -18, {
      title: text({ ko: '최대 HP +2', en: 'Max HP +2' }, this.settings.language),
      body: text({ ko: `현재 HP도 +2 회복\n가격 ${hpCost}G`, en: `Also heals current HP +2\nCost ${hpCost}G` }, this.settings.language),
      cost: hpCost,
      onBuy: () => this.buyHpUpgrade(),
    })
    const nextButton = this.createPanelButton(0, 128, 220, text({ ko: '다음 웨이브', en: 'Next Wave' }, this.settings.language), () => {
      this.startNextWave()
    })

    panel.add([background, title, wallet, attackCard, hpCard, nextButton])
    panel.setDepth(50)
    this.shopPanel = panel
    this.updateShopSelection()
  }

  private createShopCard(
    x: number,
    y: number,
    options: { title: string; body: string; cost: number; onBuy: () => void },
  ) {
    const canBuy = this.coins >= options.cost
    const card = this.add.container(x, y)
    const plate = this.add.rectangle(0, 0, 180, 150, canBuy ? 0x0f172a : 0x111827, canBuy ? 0.94 : 0.64)
    plate.setStrokeStyle(2, canBuy ? 0x38bdf8 : 0x475569, canBuy ? 0.9 : 0.5)
    const title = this.add
      .text(0, -52, options.title, {
        color: canBuy ? '#f8fafc' : '#94a3b8',
        fontFamily: UI_FONT,
        fontSize: '18px',
        fontStyle: '800',
      })
      .setOrigin(0.5)
    const body = this.add
      .text(0, -10, options.body, {
        align: 'center',
        color: canBuy ? '#cbd5e1' : '#64748b',
        fontFamily: UI_FONT,
        fontSize: '13px',
        lineSpacing: 5,
      })
      .setOrigin(0.5)
    const action = this.add
      .text(0, 54, canBuy ? text({ ko: '구매', en: 'Buy' }, this.settings.language) : text({ ko: '금화 부족', en: 'Need gold' }, this.settings.language), {
        color: canBuy ? '#facc15' : '#64748b',
        fontFamily: UI_FONT,
        fontSize: '15px',
        fontStyle: '800',
      })
      .setOrigin(0.5)

    const itemIndex = this.shopItems.length
    this.shopItems.push({
      plate,
      action: options.onBuy,
      enabled: canBuy,
      defaultFill: canBuy ? 0x0f172a : 0x111827,
      defaultAlpha: canBuy ? 0.94 : 0.64,
      defaultStroke: canBuy ? 0x38bdf8 : 0x475569,
      defaultStrokeAlpha: canBuy ? 0.9 : 0.5,
      selectedFill: 0x164e63,
      selectedAlpha: 0.98,
      selectedStroke: 0x67e8f9,
      selectedStrokeAlpha: 1,
    })

    if (canBuy) {
      plate.setInteractive({ useHandCursor: true })
      plate.on('pointerover', () => {
        this.selectedShopIndex = itemIndex
        this.updateShopSelection()
      })
      plate.on('pointerout', () => this.updateShopSelection())
      plate.on('pointerdown', () => {
        this.selectedShopIndex = itemIndex
        this.updateShopSelection()
        options.onBuy()
      })
    }

    card.add([plate, title, body, action])
    return card
  }

  private createPanelButton(x: number, y: number, width: number, label: string, onClick: () => void) {
    const button = this.add.container(x, y)
    const plate = this.add.rectangle(0, 0, width, 42, 0x164e63, 0.96)
    plate.setStrokeStyle(2, 0x67e8f9, 0.9)
    plate.setInteractive({ useHandCursor: true })
    const buttonText = this.add
      .text(0, 0, label, {
        color: '#f8fafc',
        fontFamily: UI_FONT,
        fontSize: '17px',
        fontStyle: '800',
      })
      .setOrigin(0.5)
    const itemIndex = this.shopItems.length
    this.shopItems.push({
      plate,
      action: onClick,
      enabled: true,
      defaultFill: 0x164e63,
      defaultAlpha: 0.96,
      defaultStroke: 0x67e8f9,
      defaultStrokeAlpha: 0.9,
      selectedFill: 0x0e7490,
      selectedAlpha: 1,
      selectedStroke: 0xfef08a,
      selectedStrokeAlpha: 1,
    })
    plate.on('pointerover', () => {
      this.selectedShopIndex = itemIndex
      this.updateShopSelection()
    })
    plate.on('pointerout', () => this.updateShopSelection())
    plate.on('pointerdown', () => {
      this.selectedShopIndex = itemIndex
      this.updateShopSelection()
      onClick()
    })
    button.add([plate, buttonText])
    return button
  }

  private getAttackUpgradeCost() {
    return ATTACK_UP_BASE_COST + this.attackUpgradeCount * SHOP_COST_STEP
  }

  private getHpUpgradeCost() {
    return HP_UP_BASE_COST + this.hpUpgradeCount * SHOP_COST_STEP
  }

  private buyAttackUpgrade() {
    const cost = this.getAttackUpgradeCost()
    if (this.coins < cost) {
      return
    }

    this.coins -= cost
    this.attackPower += 1
    this.attackUpgradeCount += 1
    this.updateCoinDisplay()
    this.updateWeaponDisplay()
    playTone(this.settings, 840, 100, 'triangle', 0.12)
    this.renderShop()
  }

  private buyHpUpgrade() {
    const cost = this.getHpUpgradeCost()
    if (this.coins < cost) {
      return
    }

    this.coins -= cost
    this.maxHp += 2
    this.hp = Math.min(this.maxHp, this.hp + 2)
    this.hpUpgradeCount += 1
    this.updateCoinDisplay()
    this.updateHpDisplay()
    playTone(this.settings, 620, 120, 'triangle', 0.12)
    this.renderShop()
  }

  private startNextWave() {
    this.shopPanel?.destroy()
    this.shopPanel = undefined
    this.shopItems = []
    this.selectedShopIndex = 0
    this.isShopOpen = false
    this.isStageClear = false
    this.runLevel += 1
    this.nextStageEventIndex = this.mode === 'practice' ? this.stage.events.length : 0
    this.stageStartedAt = this.mode === 'practice' ? this.time.now - this.stage.bossAppearMs : this.time.now
    this.invulnerableUntil = this.time.now + 900
    this.lastPlayerShot = this.time.now
    this.statusMessageUntil = this.time.now + 1_300
    this.statusText.setText(text({ ko: `웨이브 ${this.runLevel} 시작`, en: `Wave ${this.runLevel} start` }, this.settings.language))
    this.statusText.setColor('#93c5fd')
  }

  private openPartChoice(part: PartDefinition) {
    this.pendingPart = part
    this.isPartChoiceOpen = true
    this.partChoiceOpenedAt = this.time.now
    this.selectedPartChoiceIndex = 1
    this.player.body.setVelocity(0, 0)
    this.physics.world.pause()
    this.partChoicePanel?.destroy()
    this.partChoiceItems = []

    const current = part.kind === 'bullet-core' ? this.bulletCore : this.weaponModules[0]
    const panel = this.add.container(GAME_WIDTH / 2, 334)
    const background = this.add.rectangle(0, 0, 404, 250, 0x020617, 0.95)
    background.setStrokeStyle(2, part.color, 0.9)
    const title = this.add
      .text(0, -98, text({ ko: `${part.kind === 'bullet-core' ? '탄심 파츠' : '무장 모듈'} 선택`, en: `${part.kind === 'bullet-core' ? 'Bullet Core' : 'Weapon Module'} Choice` }, this.settings.language), {
        color: '#f8fafc',
        fontFamily: UI_FONT,
        fontSize: '22px',
        fontStyle: '900',
      })
      .setOrigin(0.5)
    const keep = this.createPartChoiceCard(-102, 10, {
      title: text({ ko: '현재 유지', en: 'Keep Current' }, this.settings.language),
      part: current,
      fallback: text({ ko: '기존 장착 유지', en: 'Keep equipped part' }, this.settings.language),
      onChoose: () => this.closePartChoice(false),
    })
    const replace = this.createPartChoiceCard(102, 10, {
      title: text({ ko: '새 파츠 장착', en: 'Equip New' }, this.settings.language),
      part,
      fallback: text(part.description, this.settings.language),
      onChoose: () => this.closePartChoice(true),
    })

    panel.add([background, title, keep, replace])
    panel.setDepth(60)
    this.partChoicePanel = panel
    this.updatePartChoiceSelection()
  }

  private createPartChoiceCard(
    x: number,
    y: number,
    options: { title: string; part?: PartDefinition; fallback: string; onChoose: () => void },
  ) {
    const card = this.add.container(x, y)
    const color = options.part?.color ?? 0x475569
    const plate = this.add.rectangle(0, 0, 180, 142, 0x0f172a, 0.95)
    plate.setStrokeStyle(2, color, 0.86)
    plate.setInteractive({ useHandCursor: true })
    const title = this.add
      .text(0, -48, options.title, {
        color: '#f8fafc',
        fontFamily: UI_FONT,
        fontSize: '17px',
        fontStyle: '800',
      })
      .setOrigin(0.5)
    const name = this.add
      .text(0, -17, options.part ? text(options.part.label, this.settings.language) : '-', {
        color: options.part ? '#fef08a' : '#94a3b8',
        fontFamily: UI_FONT,
        fontSize: '15px',
        fontStyle: '800',
      })
      .setOrigin(0.5)
    const body = this.add
      .text(0, 30, options.part ? text(options.part.description, this.settings.language) : options.fallback, {
        align: 'center',
        color: '#cbd5e1',
        fontFamily: UI_FONT,
        fontSize: '12px',
        lineSpacing: 4,
        wordWrap: { width: 150 },
      })
      .setOrigin(0.5)
    const itemIndex = this.partChoiceItems.length
    this.partChoiceItems.push({
      plate,
      action: options.onChoose,
      enabled: true,
      defaultFill: 0x0f172a,
      defaultAlpha: 0.95,
      defaultStroke: color,
      defaultStrokeAlpha: 0.86,
      selectedFill: 0x164e63,
      selectedAlpha: 0.98,
      selectedStroke: 0x67e8f9,
      selectedStrokeAlpha: 1,
    })
    plate.on('pointerover', () => {
      this.selectedPartChoiceIndex = itemIndex
      this.updatePartChoiceSelection()
    })
    plate.on('pointerout', () => this.updatePartChoiceSelection())
    plate.on('pointerdown', () => {
      this.selectedPartChoiceIndex = itemIndex
      this.updatePartChoiceSelection()
      options.onChoose()
    })
    card.add([plate, title, name, body])
    return card
  }

  private closePartChoice(shouldEquipNew: boolean) {
    this.resumeStageClockAfterPartChoice()

    if (shouldEquipNew && this.pendingPart) {
      const replaceIndex = this.pendingPart.kind === 'weapon-module'
        ? 0
        : 0
      this.equipPart(this.pendingPart, replaceIndex)
    }

    this.pendingPart = undefined
    this.isPartChoiceOpen = false
    this.physics.world.resume()
    this.partChoicePanel?.destroy()
    this.partChoicePanel = undefined
    this.partChoiceItems = []
    this.selectedPartChoiceIndex = 1
  }

  private resumeStageClockAfterPartChoice() {
    if (this.partChoiceOpenedAt <= 0) {
      return
    }

    const pausedMs = Math.max(0, this.time.now - this.partChoiceOpenedAt)
    if (this.stageStartedAt > 0) {
      this.stageStartedAt += pausedMs
    }
    this.partChoiceOpenedAt = 0
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
      `GOLD ${this.coins}`,
      `HP ${this.hp}/${this.maxHp}`,
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
    bullet.visual?.destroy()
    bullet.body.destroy()
    bullet.debug?.destroy()
  }

  private destroyEnemyBullet(bullet: EnemyBullet) {
    bullet.body.destroy()
    bullet.debug?.destroy()
  }

  private destroyPowerUp(powerUp: FieldDrop) {
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

  private syncDebugRect(
    debug: Phaser.GameObjects.Rectangle | undefined,
    body: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  ) {
    if (!debug) {
      return
    }

    const arcadeBody = (body as { body?: Phaser.Physics.Arcade.Body }).body
    debug.x = body.x
    debug.y = body.y
    debug.width = arcadeBody?.width ?? body.displayWidth
    debug.height = arcadeBody?.height ?? body.displayHeight
  }

  private syncDebugCircle(debug: Phaser.GameObjects.Ellipse | undefined, body: Phaser.GameObjects.Ellipse) {
    if (!debug) {
      return
    }

    debug.x = body.x
    debug.y = body.y
  }
}
