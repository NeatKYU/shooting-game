import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, MONO_FONT, UI_FONT } from '../game/config'
import { SAMURAI_FRAMES, createSamuraiBreathFrameTexture, createSamuraiFrameTexture, preloadSamuraiSheet } from '../game/samuraiSprite'

type Lane = 0 | 1 | 2
type BattleState = 'intro' | 'playing' | 'victory' | 'defeat'
type BulletKind = 'normal' | 'heavy'
type CounterKind = 'reflect' | 'wave'
type SlashGrade = 'MISS' | 'BLOCK' | 'PARRY' | 'PERFECT'
type Phase = 1 | 2 | 3 | 4

interface EnemyBullet {
  id: number
  lane: Lane
  x: number
  y: number
  startX: number
  startY: number
  targetX: number
  speed: number
  radius: number
  kind: BulletKind
  sprite: Phaser.GameObjects.Container
}

interface CounterShot {
  id: number
  lane: Lane
  x: number
  y: number
  speed: number
  radius: number
  damage: number
  kind: CounterKind
  sprite: Phaser.GameObjects.Container
}

interface QueuedAttack {
  dueAt: number
  lane: Lane
  kind: BulletKind
}

const LANES = [128, 240, 352] as const
const BOSS_X = GAME_WIDTH / 2
const BOSS_Y = 118
const BULLET_START_Y = 188
const PLAYER_Y = 590
const HIT_Y = PLAYER_Y - 62
const MAX_BOSS_HP = 100
const MAX_PLAYER_HP = 3
const MAX_SWORDS = 5
const SWORD_RECOVER_MS = 2_000
const INTRO_MS = 3_000
const PERFECT_WINDOW_SEC = 0.08
const PARRY_WINDOW_SEC = 0.12
const BLOCK_WINDOW_SEC = 0.35
const LATE_BLOCK_WINDOW_SEC = -0.12
const BOSS_BAR_WIDTH = 330
const NORMAL_BULLET_SPEED = 178
const HEAVY_BULLET_SPEED = 124
const PLAYER_SPRITE_SCALE = 1.15
const PLAYER_IDLE_TEXTURES = ['samurai-idle-0', 'samurai-idle-1', 'samurai-idle-2', 'samurai-idle-3'] as const
const PLAYER_IDLE_Y_OFFSETS = [0, -1, -2, -1] as const
const PLAYER_IDLE_FRAME_MS = 155

const PHASE_NAMES: Record<Phase, string> = {
  1: '단발 시험',
  2: '연속 검기',
  3: '삼연참',
  4: '강탄 패링',
}

const PHASE_COLORS: Record<Phase, number> = {
  1: 0x93c5fd,
  2: 0xfacc15,
  3: 0xfb7185,
  4: 0xf97316,
}

export class ShooterScene extends Phaser.Scene {
  private keys!: {
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
    a: Phaser.Input.Keyboard.Key
    d: Phaser.Input.Keyboard.Key
    slash: Phaser.Input.Keyboard.Key
    altSlash: Phaser.Input.Keyboard.Key
  }

  private player!: Phaser.GameObjects.Image
  private playerShadow!: Phaser.GameObjects.Ellipse
  private boss!: Phaser.GameObjects.Image
  private bossShadow!: Phaser.GameObjects.Ellipse
  private bossBarFill!: Phaser.GameObjects.Rectangle
  private phaseText!: Phaser.GameObjects.Text
  private feedbackText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private swordPips: Phaser.GameObjects.Rectangle[] = []
  private hpMarks: Phaser.GameObjects.Rectangle[] = []
  private enemyBullets: EnemyBullet[] = []
  private counterShots: CounterShot[] = []
  private queuedAttacks: QueuedAttack[] = []
  private audioContext?: AudioContext
  private audioUnlocked = false
  private state: BattleState = 'intro'
  private playerLane: Lane = 1
  private bossHp = MAX_BOSS_HP
  private playerHp = MAX_PLAYER_HP
  private swords = MAX_SWORDS
  private swordRecoverMs = 0
  private nextId = 1
  private realTimeMs = 0
  private battleClockMs = 0
  private nextAttackAt = INTRO_MS + 450
  private patternStep = 0
  private currentPhase: Phase = 1
  private invulnerableUntil = 0
  private slowMoUntil = 0
  private slowMoScale = 1
  private playerAnimationToken = 0
  private playerAnimationActive = false
  private playerFacing: -1 | 1 = 1
  private idleFrameIndex = 0
  private idleFrameElapsedMs = 0

  constructor() {
    super('ShooterScene')
  }

  preload() {
    preloadSamuraiSheet(this)
  }

  create() {
    this.tweens.killAll()
    this.children.removeAll(true)
    this.resetState()
    this.createSpriteTextures()
    this.createBackdrop()
    this.createActors()
    this.createHud()
    this.createInput()
    this.showFeedback('가면 무사의 시험', 0xf8fafc)
  }

  update(_time: number, delta: number) {
    this.realTimeMs += delta
    this.handleInput()
    this.updatePlayerIdle(delta)

    const timeScale = this.realTimeMs < this.slowMoUntil ? this.slowMoScale : 1
    if (this.realTimeMs >= this.slowMoUntil) {
      this.slowMoScale = 1
    }

    const scaledDelta = delta * timeScale
    const dt = scaledDelta / 1000
    this.battleClockMs += scaledDelta
    this.updateTimer()

    if (this.state === 'intro') {
      this.boss.y = BOSS_Y - 28 + Phaser.Math.Easing.Cubic.Out(Math.min(this.battleClockMs / INTRO_MS, 1)) * 28
      this.bossShadow.setAlpha(Math.min(this.battleClockMs / INTRO_MS, 1) * 0.3)

      if (this.battleClockMs >= INTRO_MS) {
        this.state = 'playing'
        this.showFeedback('검을 맞춰 받아쳐라', 0xfacc15)
      }

      return
    }

    if (this.state !== 'playing') {
      this.updateCounterShots(dt)
      return
    }

    this.recoverSwords(delta)
    this.updatePhase()
    this.processQueuedAttacks()
    this.runBossPattern()
    this.updateEnemyBullets(dt)
    this.updateCounterShots(dt)
    this.updateHud()
  }

  private resetState() {
    this.state = 'intro'
    this.playerLane = 1
    this.bossHp = MAX_BOSS_HP
    this.playerHp = MAX_PLAYER_HP
    this.swords = MAX_SWORDS
    this.swordRecoverMs = 0
    this.nextId = 1
    this.realTimeMs = 0
    this.battleClockMs = 0
    this.nextAttackAt = INTRO_MS + 450
    this.patternStep = 0
    this.currentPhase = 1
    this.invulnerableUntil = 0
    this.slowMoUntil = 0
    this.slowMoScale = 1
    this.playerAnimationToken = 0
    this.playerAnimationActive = false
    this.playerFacing = 1
    this.idleFrameIndex = 0
    this.idleFrameElapsedMs = 0
    this.enemyBullets = []
    this.counterShots = []
    this.queuedAttacks = []
    this.swordPips = []
    this.hpMarks = []
    this.audioUnlocked = false
  }

  private createInput() {
    const keyboard = this.input.keyboard
    if (!keyboard) {
      throw new Error('Keyboard input is required for Samurai Parry.')
    }

    this.keys = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      slash: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      altSlash: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J),
    }
  }

  private handleInput() {
    const leftPressed = Phaser.Input.Keyboard.JustDown(this.keys.left) || Phaser.Input.Keyboard.JustDown(this.keys.a)
    const rightPressed = Phaser.Input.Keyboard.JustDown(this.keys.right) || Phaser.Input.Keyboard.JustDown(this.keys.d)
    const slashPressed = Phaser.Input.Keyboard.JustDown(this.keys.slash) || Phaser.Input.Keyboard.JustDown(this.keys.altSlash)
    if (leftPressed || rightPressed || slashPressed) {
      this.audioUnlocked = true
    }

    if (this.state === 'victory' || this.state === 'defeat') {
      if (slashPressed) {
        this.scene.restart()
      }

      return
    }

    if (this.state !== 'playing') {
      return
    }

    if (leftPressed) {
      this.movePlayer(-1)
    }

    if (rightPressed) {
      this.movePlayer(1)
    }

    if (slashPressed) {
      this.swingSword()
    }
  }

  private movePlayer(direction: -1 | 1) {
    const nextLane = Phaser.Math.Clamp(this.playerLane + direction, 0, 2) as Lane
    if (nextLane === this.playerLane) {
      return
    }

    this.playerLane = nextLane
    this.playerFacing = direction
    const animationToken = this.nextPlayerAnimationToken()
    this.tweens.killTweensOf([this.player, this.playerShadow])
    this.createPlayerAfterimage()
    this.player.setTexture('samurai-move-1')
    this.player.setFlipX(this.playerFacing < 0)
    this.player.setAngle(direction * 5)
    this.tweens.add({
      targets: this.player,
      x: LANES[this.playerLane],
      y: PLAYER_Y - 8,
      duration: 92,
      ease: 'Sine.easeOut',
      onUpdate: (tween) => {
        if (animationToken !== this.playerAnimationToken || !this.player.active) {
          return
        }

        this.player.setTexture(tween.progress < 0.55 ? 'samurai-move-1' : 'samurai-move-2')
      },
      onComplete: () => {
        if (!this.player.active || animationToken !== this.playerAnimationToken) {
          return
        }

        this.tweens.add({
          targets: this.player,
          y: PLAYER_Y,
          angle: 0,
          duration: 92,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (this.player.active && animationToken === this.playerAnimationToken) {
              this.finishPlayerAnimation(animationToken)
            }
          },
        })
      },
    })
    this.tweens.add({
      targets: this.playerShadow,
      x: LANES[this.playerLane],
      duration: 150,
      ease: 'Sine.easeInOut',
    })
    this.playTone(330, 45, 'triangle', 0.035)
  }

  private swingSword() {
    if (this.swords <= 0) {
      this.showFeedback('검 기력 없음', 0x94a3b8)
      this.flashSwordPips(0x94a3b8)
      this.playTone(110, 90, 'square', 0.025)
      return
    }

    const candidate = this.findSlashCandidate()
    const grade = candidate ? this.judgeSlash(candidate.timeToImpact) : 'MISS'
    this.showSwordAnimation(grade, candidate?.bullet)

    if (!candidate || grade === 'MISS') {
      this.spendSword()
      this.showFeedback('MISS', 0x94a3b8)
      this.playTone(140, 70, 'sawtooth', 0.03)
      return
    }

    if (grade === 'BLOCK') {
      this.blockBullet(candidate.bullet)
      return
    }

    if (grade === 'PARRY') {
      this.parryBullet(candidate.bullet)
      return
    }

    this.perfectParry(candidate.bullet)
  }

  private findSlashCandidate() {
    const candidates = this.enemyBullets
      .filter((bullet) => bullet.lane === this.playerLane)
      .map((bullet) => ({
        bullet,
        timeToImpact: (HIT_Y - bullet.y) / bullet.speed,
      }))
      .filter(({ timeToImpact }) => timeToImpact >= LATE_BLOCK_WINDOW_SEC && timeToImpact <= BLOCK_WINDOW_SEC)
      .sort((left, right) => Math.abs(left.timeToImpact) - Math.abs(right.timeToImpact))

    return candidates[0]
  }

  private judgeSlash(timeToImpact: number): SlashGrade {
    const distance = Math.abs(timeToImpact)
    if (distance <= PERFECT_WINDOW_SEC) {
      return 'PERFECT'
    }

    if (distance <= PARRY_WINDOW_SEC) {
      return 'PARRY'
    }

    return 'BLOCK'
  }

  private spendSword() {
    this.swords = Math.max(0, this.swords - 1)
    this.swordRecoverMs = 0
    this.updateHud()
    this.flashSwordPips(0xef4444)
  }

  private blockBullet(bullet: EnemyBullet) {
    this.spendSword()
    this.removeEnemyBullet(bullet)
    this.burst(bullet.x, bullet.y, 0xe2e8f0, 9)
    this.createBladeClash(bullet.x, bullet.y, 0xdbeafe, 'BLOCK')
    this.showFeedback('BLOCK', 0xdbeafe)
    this.cameras.main.shake(90, 0.0025)
    this.playTone(260, 90, 'triangle', 0.045)
  }

  private parryBullet(bullet: EnemyBullet) {
    const damage = bullet.kind === 'heavy' ? 6 : 3
    this.removeEnemyBullet(bullet)
    this.createCounterShot(bullet.lane, bullet.x, bullet.y, damage, 'reflect')
    this.burst(bullet.x, bullet.y, 0xfef3c7, 13)
    this.createBladeClash(bullet.x, bullet.y, 0xfacc15, 'PARRY')
    this.showFeedback('PARRY', 0xfacc15)
    this.triggerSlowMo(0.34, 135)
    this.cameras.main.shake(130, 0.004)
    this.playTone(620, 95, 'triangle', 0.055)
  }

  private perfectParry(bullet: EnemyBullet) {
    const damage = bullet.kind === 'heavy' ? 15 : 8
    const lane = bullet.lane
    this.removeEnemyBullet(bullet)
    this.createCounterShot(lane, LANES[lane], HIT_Y, damage, 'wave')
    this.burst(LANES[lane], HIT_Y, 0xffffff, 22)
    this.createBladeClash(LANES[lane], HIT_Y, 0xffffff, 'PERFECT')
    this.darkSlashFlash()
    this.showFeedback('PERFECT', 0xffffff)
    this.triggerSlowMo(0.18, 260)
    this.cameras.main.shake(230, 0.008)
    this.playTone(880, 140, 'triangle', 0.065)
  }

  private showSwordAnimation(grade: SlashGrade, bullet?: EnemyBullet) {
    const isPerfect = grade === 'PERFECT'
    const color = isPerfect ? 0xffffff : grade === 'PARRY' ? 0xfacc15 : grade === 'BLOCK' ? 0xdbeafe : 0x94a3b8
    const clashX = bullet?.x ?? LANES[this.playerLane]
    const clashY = bullet?.y ?? HIT_Y
    const x = this.player.x
    const y = this.player.y - 34
    const animationToken = this.nextPlayerAnimationToken()
    const attackDirection = clashX < this.player.x ? -1 : 1

    this.tweens.killTweensOf(this.player)
    this.createPlayerAfterimage()
    this.player.setTexture('samurai-slash')
    this.player.setFlipX(attackDirection < 0)
    this.player.setAngle(attackDirection * 7)
    this.tweens.add({
      targets: this.player,
      x: x + Phaser.Math.Clamp(clashX - x, -24, 24),
      y: PLAYER_Y - (grade === 'MISS' ? 5 : 20),
      angle: attackDirection * (isPerfect ? 11 : 8),
      duration: 82,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (!this.player.active || animationToken !== this.playerAnimationToken) {
          return
        }

        this.player.setTexture(grade === 'MISS' ? PLAYER_IDLE_TEXTURES[0] : 'samurai-guard')
        this.tweens.add({
          targets: this.player,
          x: LANES[this.playerLane],
          y: PLAYER_Y,
          angle: 0,
          duration: 96,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (this.player.active && animationToken === this.playerAnimationToken) {
              this.finishPlayerAnimation(animationToken)
            }
          },
        })
      },
    })

    this.createSwordTrail(x, y, clashX, clashY, color, isPerfect)
  }

  private recoverSwords(delta: number) {
    if (this.swords >= MAX_SWORDS) {
      this.swordRecoverMs = 0
      return
    }

    this.swordRecoverMs += delta
    while (this.swordRecoverMs >= SWORD_RECOVER_MS && this.swords < MAX_SWORDS) {
      this.swordRecoverMs -= SWORD_RECOVER_MS
      this.swords += 1
      this.flashSwordPips(0x67e8f9)
      this.playTone(440, 60, 'sine', 0.025)
    }
  }

  private updatePhase() {
    const phase = this.getPhase()
    if (phase === this.currentPhase) {
      return
    }

    this.currentPhase = phase
    this.patternStep = 0
    this.nextAttackAt = this.battleClockMs + 650
    this.phaseText.setText(`PHASE ${phase}  ${PHASE_NAMES[phase]}`)
    this.showFeedback(PHASE_NAMES[phase], PHASE_COLORS[phase])
    this.cameras.main.shake(150, 0.0035)
  }

  private getPhase(): Phase {
    if (this.bossHp <= 25) {
      return 4
    }

    if (this.bossHp <= 50) {
      return 3
    }

    if (this.bossHp <= 75) {
      return 2
    }

    return 1
  }

  private runBossPattern() {
    if (this.battleClockMs < this.nextAttackAt) {
      return
    }

    if (this.currentPhase === 1) {
      const sequence: Lane[] = [0, 1, 2, 1]
      this.queueBullet(sequence[this.patternStep % sequence.length], 0, 'normal')
      this.patternStep += 1
      this.nextAttackAt = this.battleClockMs + 1_260
      return
    }

    if (this.currentPhase === 2) {
      const mainLane = ([0, 2, 1, 0, 2, 1] as Lane[])[this.patternStep % 6]
      const sideLane = ([2, 1, 0, 1, 0, 2] as Lane[])[this.patternStep % 6]
      this.queueBullet(mainLane, 0, 'normal')
      this.queueBullet(mainLane, 310, 'normal')
      this.queueBullet(sideLane, 660, 'normal')
      this.patternStep += 1
      this.nextAttackAt = this.battleClockMs + 1_580
      return
    }

    if (this.currentPhase === 3) {
      const order = this.patternStep % 2 === 0 ? ([0, 1, 2] as Lane[]) : ([2, 1, 0] as Lane[])
      this.queueBullet(order[0], 0, 'normal')
      this.queueBullet(order[1], 360, 'normal')
      this.queueBullet(order[2], 720, 'normal')
      this.patternStep += 1
      this.nextAttackAt = this.battleClockMs + 1_520
      return
    }

    const heavyLane = ([1, 0, 2, 1, 2, 0] as Lane[])[this.patternStep % 6]
    const firstNormal = ((heavyLane + 1) % 3) as Lane
    const secondNormal = ((heavyLane + 2) % 3) as Lane
    this.queueBullet(firstNormal, 0, 'normal')
    this.queueBullet(heavyLane, 410, 'heavy')
    this.queueBullet(secondNormal, 880, 'normal')
    this.patternStep += 1
    this.nextAttackAt = this.battleClockMs + 1_720
  }

  private queueBullet(lane: Lane, delayMs: number, kind: BulletKind) {
    this.queuedAttacks.push({
      dueAt: this.battleClockMs + delayMs,
      lane,
      kind,
    })
  }

  private processQueuedAttacks() {
    const ready = this.queuedAttacks.filter((attack) => attack.dueAt <= this.battleClockMs)
    this.queuedAttacks = this.queuedAttacks.filter((attack) => attack.dueAt > this.battleClockMs)
    ready.forEach((attack) => this.spawnEnemyBullet(attack.lane, attack.kind))
  }

  private spawnEnemyBullet(lane: Lane, kind: BulletKind) {
    const speed = kind === 'heavy' ? HEAVY_BULLET_SPEED : NORMAL_BULLET_SPEED
    const radius = kind === 'heavy' ? 19 : 11
    const startX = this.getBulletStartX(lane)
    const startY = lane === 1 ? BULLET_START_Y : BULLET_START_Y + 18
    const sprite = this.createEnemyBulletSprite(startX, startY, kind)
    const bullet: EnemyBullet = {
      id: this.nextId,
      lane,
      x: startX,
      y: startY,
      startX,
      startY,
      targetX: LANES[lane],
      speed,
      radius,
      kind,
      sprite,
    }
    this.nextId += 1
    this.enemyBullets.push(bullet)
    this.flashAttackStart(startX, startY, kind === 'heavy' ? 0xf97316 : 0x93c5fd)
    this.playTone(kind === 'heavy' ? 170 : 220, kind === 'heavy' ? 120 : 70, 'sine', kind === 'heavy' ? 0.035 : 0.02)
  }

  private updateEnemyBullets(dt: number) {
    const bullets = [...this.enemyBullets]
    for (const bullet of bullets) {
      const previousX = bullet.x
      const previousY = bullet.y
      bullet.y += bullet.speed * dt
      const progress = Phaser.Math.Clamp((bullet.y - bullet.startY) / (HIT_Y - bullet.startY), 0, 1)
      bullet.x = Phaser.Math.Linear(bullet.startX, bullet.targetX, progress)
      bullet.sprite.setPosition(bullet.x, bullet.y)
      bullet.sprite.setRotation(Phaser.Math.Angle.Between(previousX, previousY, bullet.x, bullet.y) + Math.PI / 2)

      if (previousY < HIT_Y && bullet.y >= HIT_Y && bullet.lane === this.playerLane) {
        this.hitPlayer(bullet)
        continue
      }

      if (bullet.y > GAME_HEIGHT + 42) {
        this.removeEnemyBullet(bullet)
      }
    }
  }

  private createCounterShot(lane: Lane, x: number, y: number, damage: number, kind: CounterKind) {
    const speed = kind === 'wave' ? 540 : 430
    const radius = kind === 'wave' ? 58 : 20
    const sprite = this.createCounterSprite(x, y, kind)
    const shot: CounterShot = {
      id: this.nextId,
      lane,
      x,
      y,
      speed,
      radius,
      damage,
      kind,
      sprite,
    }
    this.nextId += 1
    this.counterShots.push(shot)
  }

  private updateCounterShots(dt: number) {
    const shots = [...this.counterShots]
    for (const shot of shots) {
      shot.y -= shot.speed * dt
      shot.x += (BOSS_X - shot.x) * dt * (shot.kind === 'wave' ? 1.2 : 0.72)
      shot.sprite.setPosition(shot.x, shot.y)
      if (shot.kind === 'wave') {
        shot.sprite.setRotation(-0.08 + Math.sin((this.realTimeMs + shot.id * 37) * 0.018) * 0.055)
      } else {
        shot.sprite.setRotation(shot.sprite.rotation + dt * 5.6)
      }
      this.destroyBulletsOnCounterPath(shot)

      if (shot.y <= BOSS_Y + 34) {
        this.damageBoss(shot.damage, shot.kind)
        this.removeCounterShot(shot)
      }
    }
  }

  private destroyBulletsOnCounterPath(shot: CounterShot) {
    const bullets = this.enemyBullets.filter((bullet) => {
      const sameLane = bullet.lane === shot.lane
      const distance = Phaser.Math.Distance.Between(bullet.x, bullet.y, shot.x, shot.y)
      return sameLane && distance <= shot.radius + bullet.radius
    })

    bullets.forEach((bullet) => {
      this.burst(bullet.x, bullet.y, shot.kind === 'wave' ? 0xffffff : 0x67e8f9, 6)
      this.removeEnemyBullet(bullet)
    })
  }

  private damageBoss(amount: number, kind: CounterKind) {
    this.bossHp = Math.max(0, this.bossHp - amount)
    this.updateHud()
    this.burst(BOSS_X, BOSS_Y + 24, kind === 'wave' ? 0xffffff : 0xfacc15, kind === 'wave' ? 20 : 10)
    this.cameras.main.shake(kind === 'wave' ? 180 : 90, kind === 'wave' ? 0.006 : 0.003)
    this.boss.setTint(kind === 'wave' ? 0xffffff : 0xfef08a)
    this.time.delayedCall(90, () => {
      if (this.boss.active) {
        this.boss.clearTint()
      }
    })

    if (this.bossHp <= 0) {
      this.finishBattle('victory')
    }
  }

  private hitPlayer(bullet: EnemyBullet) {
    this.removeEnemyBullet(bullet)
    if (this.realTimeMs < this.invulnerableUntil) {
      return
    }

    this.playerHp = Math.max(0, this.playerHp - 1)
    this.invulnerableUntil = this.realTimeMs + 1_000
    this.updateHud()
    this.showFeedback('HIT', 0xfb7185)
    this.burst(bullet.x, HIT_Y, 0xfb7185, 14)
    this.cameras.main.shake(220, 0.006)
    const animationToken = this.nextPlayerAnimationToken()
    this.tweens.killTweensOf(this.player)
    this.player.setTexture('samurai-guard')
    this.player.setTint(0xfb7185)
    this.tweens.add({
      targets: this.player,
      alpha: 0.35,
      duration: 70,
      repeat: 6,
      yoyo: true,
      onComplete: () => {
        if (this.player.active && animationToken === this.playerAnimationToken) {
          this.player.alpha = 1
          this.player.clearTint()
          this.finishPlayerAnimation(animationToken)
        }
      },
    })
    this.playTone(90, 180, 'sawtooth', 0.045)

    if (this.playerHp <= 0) {
      this.finishBattle('defeat')
    }
  }

  private finishBattle(state: 'victory' | 'defeat') {
    this.state = state
    this.queuedAttacks = []
    this.enemyBullets.forEach((bullet) => bullet.sprite.destroy())
    this.enemyBullets = []

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 330, 150, 0x020617, 0.88)
    panel.setStrokeStyle(2, state === 'victory' ? 0xfacc15 : 0xfb7185, 0.95)
    panel.setDepth(60)
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, state === 'victory' ? '승리' : '패배', {
        align: 'center',
        color: state === 'victory' ? '#fef3c7' : '#fecdd3',
        fontFamily: UI_FONT,
        fontSize: '34px',
        fontStyle: '900',
      })
      .setOrigin(0.5)
      .setDepth(61)
    const detail = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 22, state === 'victory' ? '가면 무사의 시험을 통과했다' : '검의 호흡이 흐트러졌다', {
        align: 'center',
        color: '#e5e7eb',
        fontFamily: UI_FONT,
        fontSize: '16px',
      })
      .setOrigin(0.5)
      .setDepth(61)

    this.tweens.add({
      targets: [panel, title, detail],
      scale: { from: 0.94, to: 1 },
      duration: 180,
      ease: 'Back.easeOut',
    })
    this.playTone(state === 'victory' ? 740 : 130, 240, state === 'victory' ? 'triangle' : 'sawtooth', 0.06)
  }

  private removeEnemyBullet(bullet: EnemyBullet) {
    this.enemyBullets = this.enemyBullets.filter((item) => item.id !== bullet.id)
    bullet.sprite.destroy()
  }

  private removeCounterShot(shot: CounterShot) {
    this.counterShots = this.counterShots.filter((item) => item.id !== shot.id)
    shot.sprite.destroy()
  }

  private triggerSlowMo(scale: number, durationMs: number) {
    this.slowMoScale = Math.min(this.slowMoScale, scale)
    this.slowMoUntil = Math.max(this.slowMoUntil, this.realTimeMs + durationMs)
  }

  private nextPlayerAnimationToken() {
    this.playerAnimationToken += 1
    this.playerAnimationActive = true
    return this.playerAnimationToken
  }

  private finishPlayerAnimation(animationToken: number) {
    if (animationToken !== this.playerAnimationToken || !this.player.active) {
      return
    }

    this.playerAnimationActive = false
    this.idleFrameElapsedMs = 0
    this.idleFrameIndex = 0
    this.setPlayerIdlePose()
  }

  private updatePlayerIdle(delta: number) {
    if (!this.player?.active || this.playerAnimationActive || this.state === 'victory' || this.state === 'defeat') {
      return
    }

    this.idleFrameElapsedMs += delta
    while (this.idleFrameElapsedMs >= PLAYER_IDLE_FRAME_MS) {
      this.idleFrameElapsedMs -= PLAYER_IDLE_FRAME_MS
      this.idleFrameIndex = (this.idleFrameIndex + 1) % PLAYER_IDLE_TEXTURES.length
    }

    this.setPlayerIdlePose()
  }

  private setPlayerIdlePose() {
    const textureKey = PLAYER_IDLE_TEXTURES[this.idleFrameIndex]
    if (this.player.texture.key !== textureKey) {
      this.player.setTexture(textureKey)
    }

    this.player.setFlipX(this.playerFacing < 0)
    this.player.setAngle(0)
    this.player.y = PLAYER_Y + PLAYER_IDLE_Y_OFFSETS[this.idleFrameIndex]

    if (this.playerShadow?.active) {
      this.playerShadow.setScale(1 + this.idleFrameIndex * 0.012, 1)
    }
  }

  private createBackdrop() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0f172a)

    for (let index = 0; index < 34; index += 1) {
      const x = Phaser.Math.Between(18, GAME_WIDTH - 18)
      const y = Phaser.Math.Between(18, 470)
      this.add.circle(x, y, Phaser.Math.FloatBetween(0.7, 1.9), index % 7 === 0 ? 0xfacc15 : 0xcbd5e1, Phaser.Math.FloatBetween(0.16, 0.5))
    }

    this.add.circle(382, 78, 38, 0xfffbeb, 0.85).setStrokeStyle(2, 0xfacc15, 0.24)
    this.add.polygon(110, 505, [0, 80, 92, 0, 184, 80], 0x020617, 0.34)
    this.add.polygon(332, 500, [0, 84, 118, 0, 236, 84], 0x020617, 0.3)
    this.add.rectangle(GAME_WIDTH / 2, 186, GAME_WIDTH, 10, 0x7f1d1d, 0.9)
    this.add.rectangle(GAME_WIDTH / 2, 198, GAME_WIDTH, 7, 0xfacc15, 0.68)
    this.add.rectangle(GAME_WIDTH / 2, 624, GAME_WIDTH, 192, 0x1f2937, 0.98)
    this.add.rectangle(GAME_WIDTH / 2, 560, GAME_WIDTH, 18, 0x78350f, 0.95)

    for (let index = 0; index < 9; index += 1) {
      this.add.rectangle(index * 60 + 12, 646, 34, 160, index % 2 === 0 ? 0x334155 : 0x475569, 0.5)
    }

    this.add.ellipse(GAME_WIDTH / 2, PLAYER_Y + 45, 338, 34, 0x020617, 0.3)

    this.add.rectangle(32, 404, 18, 388, 0x7f1d1d, 0.68)
    this.add.rectangle(GAME_WIDTH - 32, 404, 18, 388, 0x7f1d1d, 0.68)
  }

  private createActors() {
    this.bossShadow = this.add.ellipse(BOSS_X, BOSS_Y + 48, 120, 24, 0x000000, 0)
    this.bossShadow.setDepth(5)
    this.boss = this.add.image(BOSS_X, BOSS_Y - 28, 'masked-boss')
    this.boss.setScale(2.15)
    this.boss.setDepth(8)

    this.playerShadow = this.add.ellipse(LANES[this.playerLane], PLAYER_Y + 32, 72, 18, 0x000000, 0.34)
    this.playerShadow.setDepth(9)
    this.player = this.add.image(LANES[this.playerLane], PLAYER_Y, PLAYER_IDLE_TEXTURES[0])
    this.player.setScale(PLAYER_SPRITE_SCALE)
    this.player.setDepth(14)
    this.setPlayerIdlePose()
  }

  private createHud() {
    this.add
      .text(20, 16, '가면 무사의 시험', {
        color: '#f8fafc',
        fontFamily: UI_FONT,
        fontSize: '20px',
        fontStyle: '900',
      })
      .setDepth(50)
    this.add
      .text(20, 43, 'LEVEL 1', {
        color: '#facc15',
        fontFamily: MONO_FONT,
        fontSize: '12px',
        fontStyle: '800',
      })
      .setDepth(50)

    const barX = GAME_WIDTH / 2 - BOSS_BAR_WIDTH / 2
    const frame = this.add.rectangle(barX, 38, BOSS_BAR_WIDTH, 11, 0x020617, 0.92)
    frame.setOrigin(0, 0.5)
    frame.setStrokeStyle(1, 0xf8fafc, 0.35)
    frame.setDepth(50)
    this.bossBarFill = this.add.rectangle(barX, 38, BOSS_BAR_WIDTH, 7, 0xfb7185, 0.95)
    this.bossBarFill.setOrigin(0, 0.5)
    this.bossBarFill.setDepth(51)

    this.phaseText = this.add
      .text(20, 62, `PHASE 1  ${PHASE_NAMES[1]}`, {
        align: 'left',
        color: '#bfdbfe',
        fontFamily: MONO_FONT,
        fontSize: '12px',
        fontStyle: '800',
      })
      .setOrigin(0, 0)
      .setDepth(50)

    this.timerText = this.add
      .text(GAME_WIDTH - 20, 16, '00:00', {
        align: 'right',
        color: '#e0f2fe',
        fontFamily: MONO_FONT,
        fontSize: '16px',
        fontStyle: '800',
      })
      .setOrigin(1, 0)
      .setDepth(50)

    for (let index = 0; index < MAX_PLAYER_HP; index += 1) {
      const mark = this.add.rectangle(24 + index * 20, 682, 13, 20, 0xfb7185, 0.95)
      mark.setRotation(Math.PI / 4)
      mark.setDepth(50)
      this.hpMarks.push(mark)
    }

    for (let index = 0; index < MAX_SWORDS; index += 1) {
      const pip = this.add.rectangle(GAME_WIDTH - 116 + index * 21, 682, 7, 28, 0xdbeafe, 0.95)
      pip.setRotation(Math.PI / 7)
      pip.setStrokeStyle(1, 0x67e8f9, 0.62)
      pip.setDepth(50)
      this.swordPips.push(pip)
    }

    this.feedbackText = this.add
      .text(GAME_WIDTH / 2, 474, '', {
        align: 'center',
        color: '#ffffff',
        fontFamily: UI_FONT,
        fontSize: '28px',
        fontStyle: '900',
      })
      .setOrigin(0.5)
      .setDepth(55)
    this.updateHud()
  }

  private updateHud() {
    this.bossBarFill.width = BOSS_BAR_WIDTH * (this.bossHp / MAX_BOSS_HP)
    this.bossBarFill.fillColor = PHASE_COLORS[this.getPhase()]

    this.hpMarks.forEach((mark, index) => {
      mark.setFillStyle(index < this.playerHp ? 0xfb7185 : 0x334155, index < this.playerHp ? 0.95 : 0.5)
    })

    this.swordPips.forEach((pip, index) => {
      pip.setFillStyle(index < this.swords ? 0xdbeafe : 0x334155, index < this.swords ? 0.95 : 0.42)
    })
  }

  private updateTimer() {
    const seconds = Math.max(0, Math.floor((this.battleClockMs - INTRO_MS) / 1000))
    const minutesText = Math.floor(seconds / 60).toString().padStart(2, '0')
    const secondsText = (seconds % 60).toString().padStart(2, '0')
    this.timerText?.setText(`${minutesText}:${secondsText}`)
  }

  private flashAttackStart(x: number, y: number, color: number) {
    const flash = this.add.circle(x, y, 24, color, 0.2)
    flash.setStrokeStyle(2, color, 0.5)
    flash.setDepth(11)
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.8,
      duration: 220,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    })
  }

  private getBulletStartX(lane: Lane) {
    if (lane === 0) {
      return GAME_WIDTH - 74
    }

    if (lane === 2) {
      return 74
    }

    return BOSS_X
  }

  private createPlayerAfterimage() {
    const ghost = this.add.image(this.player.x, this.player.y, this.player.texture.key)
    ghost.setScale(this.player.scaleX, this.player.scaleY)
    ghost.setFlipX(this.player.flipX)
    ghost.setAngle(this.player.angle)
    ghost.setAlpha(0.32)
    ghost.setTint(0x67e8f9)
    ghost.setDepth(10)
    this.tweens.add({
      targets: ghost,
      alpha: 0,
      scaleX: this.player.scaleX * 1.08,
      scaleY: this.player.scaleY * 1.08,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => ghost.destroy(),
    })
  }

  private createSwordTrail(startX: number, startY: number, clashX: number, clashY: number, color: number, isPerfect: boolean) {
    const angle = Phaser.Math.Angle.Between(startX, startY, clashX, clashY)
    const distance = Phaser.Math.Distance.Between(startX, startY, clashX, clashY)
    const length = Math.max(distance + 34, isPerfect ? 138 : 84)
    const centerX = (startX + clashX) / 2
    const centerY = (startY + clashY) / 2
    const normalX = Math.cos(angle + Math.PI / 2)
    const normalY = Math.sin(angle + Math.PI / 2)
    const layers = [
      { offset: 0, width: length + 34, height: isPerfect ? 18 : 11, color: 0xffffff, alpha: isPerfect ? 0.26 : 0.18, scaleX: 1.42, duration: isPerfect ? 280 : 170 },
      { offset: -6, width: length, height: isPerfect ? 8 : 5, color, alpha: isPerfect ? 0.96 : 0.82, scaleX: 1.3, duration: isPerfect ? 230 : 145 },
      { offset: 7, width: length * 0.76, height: 3, color: 0x67e8f9, alpha: isPerfect ? 0.8 : 0.46, scaleX: 1.18, duration: isPerfect ? 210 : 130 },
    ]

    layers.forEach((layer, index) => {
      const slash = this.add.rectangle(centerX + normalX * layer.offset, centerY + normalY * layer.offset, layer.width, layer.height, layer.color, layer.alpha)
      slash.setRotation(angle)
      slash.setDepth(20 + index)
      this.tweens.add({
        targets: slash,
        alpha: 0,
        scaleX: layer.scaleX,
        scaleY: isPerfect ? 1.8 : 1.35,
        duration: layer.duration,
        ease: 'Cubic.easeOut',
        onComplete: () => slash.destroy(),
      })
    })

    const flash = this.add.circle(clashX, clashY, isPerfect ? 24 : 15, color, isPerfect ? 0.42 : 0.26)
    flash.setStrokeStyle(2, 0xffffff, isPerfect ? 0.9 : 0.55)
    flash.setDepth(24)
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: isPerfect ? 2.2 : 1.55,
      duration: isPerfect ? 220 : 145,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    })
  }

  private createBladeClash(x: number, y: number, color: number, grade: SlashGrade) {
    const impact = this.add.circle(x, y, grade === 'PERFECT' ? 22 : 15, color, grade === 'BLOCK' ? 0.34 : 0.5)
    impact.setStrokeStyle(2, color, 0.95)
    impact.setDepth(32)
    this.tweens.add({
      targets: impact,
      alpha: 0,
      scale: grade === 'PERFECT' ? 2.3 : 1.7,
      duration: grade === 'PERFECT' ? 260 : 170,
      ease: 'Cubic.easeOut',
      onComplete: () => impact.destroy(),
    })

    for (let index = 0; index < 4; index += 1) {
      const spark = this.add.rectangle(x, y, grade === 'BLOCK' ? 22 : 34, 3, color, 0.9)
      spark.setRotation((Math.PI * index) / 4 + Phaser.Math.FloatBetween(-0.2, 0.2))
      spark.setDepth(33)
      this.tweens.add({
        targets: spark,
        alpha: 0,
        scaleX: grade === 'PERFECT' ? 1.9 : 1.35,
        duration: 160,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      })
    }
  }

  private flashSwordPips(color: number) {
    this.swordPips.forEach((pip) => {
      pip.setStrokeStyle(2, color, 0.95)
      this.time.delayedCall(120, () => {
        if (pip.active) {
          pip.setStrokeStyle(1, 0x67e8f9, 0.62)
        }
      })
    })
  }

  private showFeedback(message: string, color: number) {
    this.feedbackText.setText(message)
    this.feedbackText.setColor(Phaser.Display.Color.IntegerToColor(color).rgba)
    this.feedbackText.setAlpha(1)
    this.feedbackText.setY(474)
    this.tweens.killTweensOf(this.feedbackText)
    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      y: 444,
      duration: 760,
      ease: 'Cubic.easeOut',
    })
  }

  private darkSlashFlash() {
    const dark = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.46)
    dark.setDepth(44)
    const cut = this.add.rectangle(GAME_WIDTH / 2, HIT_Y - 24, GAME_WIDTH + 80, 12, 0xffffff, 0.9)
    cut.setRotation(-0.18)
    cut.setDepth(45)
    this.tweens.add({
      targets: dark,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => dark.destroy(),
    })
    this.tweens.add({
      targets: cut,
      alpha: 0,
      scaleX: 1.08,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => cut.destroy(),
    })
  }

  private burst(x: number, y: number, color: number, count: number) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Phaser.Math.FloatBetween(-0.24, 0.24)
      const distance = Phaser.Math.Between(18, 52)
      const spark = this.add.circle(x, y, Phaser.Math.FloatBetween(2.2, 5.2), color, 0.92)
      spark.setDepth(30)
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.25,
        duration: Phaser.Math.Between(220, 420),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      })
    }
  }

  private createEnemyBulletSprite(x: number, y: number, kind: BulletKind) {
    const color = kind === 'heavy' ? 0xf97316 : 0x93c5fd
    const accent = kind === 'heavy' ? 0xfef3c7 : 0xe0f2fe
    const radius = kind === 'heavy' ? 20 : 12
    const body = this.add.container(x, y)
    const trail = this.add.rectangle(0, radius + 18, kind === 'heavy' ? 9 : 6, kind === 'heavy' ? 58 : 40, color, kind === 'heavy' ? 0.18 : 0.14)
    const glow = this.add.circle(0, 0, radius + 9, color, kind === 'heavy' ? 0.22 : 0.15)
    const core = this.add.circle(0, 0, radius, color, 0.96)
    core.setStrokeStyle(2, accent, 0.88)
    const edge = this.add.rectangle(0, 0, kind === 'heavy' ? 5 : 3, radius * 1.55, accent, 0.74)
    body.add([trail, glow, core, edge])
    body.setDepth(kind === 'heavy' ? 13 : 12)
    return body
  }

  private createCounterSprite(x: number, y: number, kind: CounterKind) {
    const body = this.add.container(x, y)
    if (kind === 'wave') {
      const slash = this.add.container(0, 0)
      slash.setRotation(-0.82)

      const beam = this.add.graphics()
      beam.fillStyle(0xffffff, 0.24)
      beam.fillPoints(
        [
          new Phaser.Math.Vector2(-100, 26),
          new Phaser.Math.Vector2(-34, -30),
          new Phaser.Math.Vector2(132, -16),
          new Phaser.Math.Vector2(88, 14),
          new Phaser.Math.Vector2(-66, 36),
        ],
        true,
      )
      beam.fillStyle(0x5eead4, 0.78)
      beam.fillPoints(
        [
          new Phaser.Math.Vector2(-90, 17),
          new Phaser.Math.Vector2(-8, -20),
          new Phaser.Math.Vector2(128, -14),
          new Phaser.Math.Vector2(34, 6),
        ],
        true,
      )
      beam.fillStyle(0xffffff, 0.96)
      beam.fillPoints(
        [
          new Phaser.Math.Vector2(-74, 10),
          new Phaser.Math.Vector2(8, -12),
          new Phaser.Math.Vector2(100, -10),
          new Phaser.Math.Vector2(22, 2),
        ],
        true,
      )
      beam.fillStyle(0xfacc15, 0.86)
      beam.fillPoints(
        [
          new Phaser.Math.Vector2(-98, 33),
          new Phaser.Math.Vector2(-58, -7),
          new Phaser.Math.Vector2(-22, 10),
          new Phaser.Math.Vector2(-64, 42),
        ],
        true,
      )
      beam.lineStyle(2, 0x67e8f9, 0.8)
      beam.strokePoints(
        [
          new Phaser.Math.Vector2(-76, 24),
          new Phaser.Math.Vector2(-12, -9),
          new Phaser.Math.Vector2(96, -12),
        ],
        false,
      )

      const orbitBack = this.add.ellipse(28, -10, 124, 34, 0xfacc15, 0)
      orbitBack.setStrokeStyle(5, 0xfacc15, 0.34)
      orbitBack.setRotation(-0.08)
      const orbitCore = this.add.ellipse(24, -11, 108, 27, 0xffffff, 0)
      orbitCore.setStrokeStyle(2, 0xfff7ad, 0.84)
      orbitCore.setRotation(-0.04)
      const crescentOne = this.add.rectangle(-56, 28, 72, 8, 0xfacc15, 0.58)
      crescentOne.setRotation(-0.28)
      const crescentTwo = this.add.rectangle(60, -28, 62, 7, 0xfef3c7, 0.5)
      crescentTwo.setRotation(0.16)
      const baseGlow = this.add.circle(-74, 24, 34, 0xfacc15, 0.2)
      const coreGlow = this.add.circle(10, -4, 42, 0x67e8f9, 0.14)

      for (let index = 0; index < 7; index += 1) {
        const spark = this.add.circle(Phaser.Math.Between(18, 86), Phaser.Math.Between(-36, 14), Phaser.Math.FloatBetween(1.6, 3.2), index % 2 === 0 ? 0xfef3c7 : 0xffffff, Phaser.Math.FloatBetween(0.68, 0.95))
        slash.add(spark)
        this.tweens.add({
          targets: spark,
          alpha: 0.12,
          scale: 1.8,
          duration: Phaser.Math.Between(180, 320),
          ease: 'Sine.easeInOut',
          repeat: -1,
          yoyo: true,
        })
      }

      slash.add([baseGlow, coreGlow, orbitBack, beam, orbitCore, crescentOne, crescentTwo])
      body.add(slash)
    } else {
      const slash = this.add.graphics()
      slash.fillStyle(0x67e8f9, 0.35)
      slash.fillPoints(
        [
          new Phaser.Math.Vector2(-10, 26),
          new Phaser.Math.Vector2(4, -30),
          new Phaser.Math.Vector2(14, 10),
          new Phaser.Math.Vector2(0, 34),
        ],
        true,
      )
      slash.fillStyle(0xffffff, 0.95)
      slash.fillPoints(
        [
          new Phaser.Math.Vector2(-4, 16),
          new Phaser.Math.Vector2(3, -23),
          new Phaser.Math.Vector2(8, 9),
          new Phaser.Math.Vector2(1, 24),
        ],
        true,
      )
      const ring = this.add.ellipse(0, 2, 42, 13, 0xfacc15, 0)
      ring.setStrokeStyle(2, 0xfef3c7, 0.72)
      ring.setRotation(-0.3)
      const trail = this.add.rectangle(0, 22, 5, 44, 0x67e8f9, 0.2)
      body.add([trail, slash, ring])
    }

    body.setDepth(kind === 'wave' ? 26 : 18)
    return body
  }

  private createSpriteTextures() {
    this.createSamuraiIdleTexture()
    this.createSamuraiGuardTexture()
    this.createSamuraiMoveTextures()
    this.createSamuraiSlashTexture()
    this.createBossTexture()
  }

  private createSamuraiIdleTexture() {
    createSamuraiFrameTexture(this, 'samurai-idle', SAMURAI_FRAMES.backIdle)
    PLAYER_IDLE_TEXTURES.forEach((textureKey, index) => {
      createSamuraiBreathFrameTexture(this, textureKey, SAMURAI_FRAMES.backIdle, index)
    })
  }

  private createSamuraiGuardTexture() {
    createSamuraiFrameTexture(this, 'samurai-guard', SAMURAI_FRAMES.backGuard)
  }

  private createSamuraiMoveTextures() {
    createSamuraiFrameTexture(this, 'samurai-move-1', SAMURAI_FRAMES.moveOne)
    createSamuraiFrameTexture(this, 'samurai-move-2', SAMURAI_FRAMES.moveTwo)
  }

  private createSamuraiSlashTexture() {
    createSamuraiFrameTexture(this, 'samurai-slash', SAMURAI_FRAMES.slash)
  }

  private createBossTexture() {
    this.drawTexture('masked-boss', 70, 72, (pixel) => {
      pixel(28, 3, 14, 6, 0xe5e7eb)
      pixel(24, 9, 22, 14, 0xf8fafc)
      pixel(28, 14, 4, 3, 0x111827)
      pixel(38, 14, 4, 3, 0x111827)
      pixel(31, 20, 8, 3, 0x991b1b)
      pixel(18, 23, 34, 29, 0x111827)
      pixel(22, 27, 26, 19, 0x1f2937)
      pixel(11, 28, 11, 23, 0x7f1d1d)
      pixel(48, 28, 11, 23, 0x7f1d1d)
      pixel(15, 51, 13, 14, 0x111827)
      pixel(41, 51, 13, 14, 0x111827)
      pixel(11, 64, 17, 4, 0x020617)
      pixel(40, 64, 17, 4, 0x020617)
      pixel(53, 8, 5, 47, 0xe5e7eb)
      pixel(50, 12, 3, 39, 0x64748b)
      pixel(46, 22, 13, 5, 0x111827)
      pixel(31, 29, 8, 11, 0xfacc15)
      pixel(27, 39, 16, 4, 0xfacc15)
    })
  }

  private drawTexture(key: string, width: number, height: number, draw: (pixel: (x: number, y: number, width: number, height: number, color: number, alpha?: number) => void) => void) {
    if (this.textures.exists(key)) {
      return
    }

    const graphics = this.add.graphics()
    graphics.setVisible(false)
    const pixel = (x: number, y: number, pixelWidth: number, pixelHeight: number, color: number, alpha = 1) => {
      graphics.fillStyle(color, alpha)
      graphics.fillRect(x, y, pixelWidth, pixelHeight)
    }
    draw(pixel)
    graphics.generateTexture(key, width, height)
    graphics.destroy()
  }

  private playTone(frequency: number, durationMs: number, type: OscillatorType, volume: number) {
    if (!this.audioUnlocked) {
      return
    }

    try {
      const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext }
      const AudioContextClass = window.AudioContext ?? audioWindow.webkitAudioContext
      if (!AudioContextClass) {
        return
      }

      this.audioContext ??= new AudioContextClass()
      const oscillator = this.audioContext.createOscillator()
      const gain = this.audioContext.createGain()
      const now = this.audioContext.currentTime
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
      oscillator.connect(gain)
      gain.connect(this.audioContext.destination)
      oscillator.start(now)
      oscillator.stop(now + durationMs / 1000 + 0.02)
    } catch {
      // Audio is feedback only; gameplay should continue if browser audio is unavailable.
    }
  }
}
