import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, MONO_FONT, UI_FONT } from '../game/config'

type Lane = 0 | 1 | 2
type BattleState = 'intro' | 'playing' | 'victory' | 'defeat'
type BulletKind = 'normal' | 'heavy'
type CounterKind = 'reflect' | 'wave'
type SlashGrade = 'MISS' | 'BLOCK' | 'PARRY' | 'PERFECT'
type Phase = 1 | 2 | 3 | 4

interface EnemyBullet {
  id: number
  lane: Lane
  y: number
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
const NORMAL_BULLET_SPEED = 166
const HEAVY_BULLET_SPEED = 116
const PLAYER_SPRITE_SCALE = 1.85

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

  constructor() {
    super('ShooterScene')
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
    this.tweens.killTweensOf([this.player, this.playerShadow])
    this.tweens.add({
      targets: [this.player, this.playerShadow],
      x: LANES[this.playerLane],
      duration: 115,
      ease: 'Quad.easeOut',
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
    this.showSwordAnimation(grade)

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
    this.burst(LANES[bullet.lane], bullet.y, 0xe2e8f0, 9)
    this.showFeedback('BLOCK', 0xdbeafe)
    this.cameras.main.shake(90, 0.0025)
    this.playTone(260, 90, 'triangle', 0.045)
  }

  private parryBullet(bullet: EnemyBullet) {
    const damage = bullet.kind === 'heavy' ? 6 : 3
    this.removeEnemyBullet(bullet)
    this.createCounterShot(bullet.lane, bullet.y, damage, 'reflect')
    this.burst(LANES[bullet.lane], bullet.y, 0xfef3c7, 13)
    this.showFeedback('PARRY', 0xfacc15)
    this.triggerSlowMo(0.34, 135)
    this.cameras.main.shake(130, 0.004)
    this.playTone(620, 95, 'triangle', 0.055)
  }

  private perfectParry(bullet: EnemyBullet) {
    const damage = bullet.kind === 'heavy' ? 15 : 8
    const lane = bullet.lane
    const bulletsInLane = this.enemyBullets.filter((item) => item.lane === lane)
    bulletsInLane.forEach((item) => this.removeEnemyBullet(item))
    this.createCounterShot(lane, HIT_Y, damage, 'wave')
    this.burst(LANES[lane], HIT_Y, 0xffffff, 22)
    this.darkSlashFlash()
    this.showFeedback('PERFECT', 0xffffff)
    this.triggerSlowMo(0.18, 260)
    this.cameras.main.shake(230, 0.008)
    this.playTone(880, 140, 'triangle', 0.065)
  }

  private showSwordAnimation(grade: SlashGrade) {
    const isPerfect = grade === 'PERFECT'
    const color = isPerfect ? 0xffffff : grade === 'PARRY' ? 0xfacc15 : grade === 'BLOCK' ? 0xdbeafe : 0x94a3b8
    const x = LANES[this.playerLane]
    const y = HIT_Y + 4

    this.player.setTexture('samurai-slash')
    this.player.setFlipX(this.playerLane === 0)
    this.time.delayedCall(150, () => {
      if (this.player.active) {
        this.player.setTexture('samurai-idle')
        this.player.setFlipX(false)
      }
    })

    const slash = this.add.rectangle(x + 22, y - 6, isPerfect ? 118 : 72, isPerfect ? 10 : 6, color, isPerfect ? 0.96 : 0.78)
    slash.setRotation(-0.26)
    slash.setDepth(20)
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: isPerfect ? 1.35 : 1.16,
      duration: isPerfect ? 240 : 150,
      ease: 'Cubic.easeOut',
      onComplete: () => slash.destroy(),
    })
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
    const sprite = this.createEnemyBulletSprite(LANES[lane], BULLET_START_Y, kind)
    const bullet: EnemyBullet = {
      id: this.nextId,
      lane,
      y: BULLET_START_Y,
      speed,
      radius,
      kind,
      sprite,
    }
    this.nextId += 1
    this.enemyBullets.push(bullet)
    this.flashLane(lane, kind === 'heavy' ? 0xf97316 : 0x93c5fd)
    this.playTone(kind === 'heavy' ? 170 : 220, kind === 'heavy' ? 120 : 70, 'sine', kind === 'heavy' ? 0.035 : 0.02)
  }

  private updateEnemyBullets(dt: number) {
    const bullets = [...this.enemyBullets]
    for (const bullet of bullets) {
      const previousY = bullet.y
      bullet.y += bullet.speed * dt
      const laneDrift = Math.sin((this.battleClockMs + bullet.id * 71) / 140) * (bullet.kind === 'heavy' ? 1.5 : 0.8)
      bullet.sprite.setPosition(LANES[bullet.lane] + laneDrift, bullet.y)
      bullet.sprite.setRotation(bullet.sprite.rotation + dt * (bullet.kind === 'heavy' ? 1.2 : 2.4))

      if (previousY < HIT_Y && bullet.y >= HIT_Y && bullet.lane === this.playerLane) {
        this.hitPlayer(bullet)
        continue
      }

      if (bullet.y > GAME_HEIGHT + 42) {
        this.removeEnemyBullet(bullet)
      }
    }
  }

  private createCounterShot(lane: Lane, y: number, damage: number, kind: CounterKind) {
    const speed = kind === 'wave' ? 540 : 430
    const radius = kind === 'wave' ? 58 : 20
    const sprite = this.createCounterSprite(LANES[lane], y, kind)
    const shot: CounterShot = {
      id: this.nextId,
      lane,
      x: LANES[lane],
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
      shot.sprite.setRotation(shot.sprite.rotation + dt * (shot.kind === 'wave' ? 0.4 : 5.6))
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
      const yDistance = Math.abs(bullet.y - shot.y)
      return sameLane && yDistance <= shot.radius + bullet.radius
    })

    bullets.forEach((bullet) => {
      this.burst(LANES[bullet.lane], bullet.y, shot.kind === 'wave' ? 0xffffff : 0x67e8f9, 6)
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
    this.burst(LANES[this.playerLane], HIT_Y, 0xfb7185, 14)
    this.cameras.main.shake(220, 0.006)
    this.player.setTexture('samurai-guard')
    this.player.setTint(0xfb7185)
    this.tweens.add({
      targets: this.player,
      alpha: 0.35,
      duration: 70,
      repeat: 6,
      yoyo: true,
      onComplete: () => {
        if (this.player.active) {
          this.player.alpha = 1
          this.player.clearTint()
          this.player.setTexture('samurai-idle')
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

  private createBackdrop() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0f172a)

    const bands = [0x172554, 0x1e1b4b, 0x312e81, 0x164e63, 0x0f766e, 0x111827]
    bands.forEach((color, index) => {
      this.add.rectangle(GAME_WIDTH / 2, (GAME_HEIGHT / bands.length) * (index + 0.5), GAME_WIDTH, GAME_HEIGHT / bands.length + 2, color, 0.3 + index * 0.07)
    })

    this.add.circle(382, 78, 38, 0xfffbeb, 0.85).setStrokeStyle(2, 0xfacc15, 0.24)
    this.add.rectangle(GAME_WIDTH / 2, 186, GAME_WIDTH, 10, 0x7f1d1d, 0.9)
    this.add.rectangle(GAME_WIDTH / 2, 198, GAME_WIDTH, 7, 0xfacc15, 0.68)
    this.add.rectangle(GAME_WIDTH / 2, 624, GAME_WIDTH, 192, 0x1f2937, 0.98)
    this.add.rectangle(GAME_WIDTH / 2, 560, GAME_WIDTH, 18, 0x78350f, 0.95)

    for (let index = 0; index < 9; index += 1) {
      this.add.rectangle(index * 60 + 12, 646, 34, 160, index % 2 === 0 ? 0x334155 : 0x475569, 0.5)
    }

    LANES.forEach((x, index) => {
      const lane = this.add.rectangle(x, 402, 92, 454, index === 1 ? 0x082f49 : 0x111827, index === 1 ? 0.32 : 0.28)
      lane.setStrokeStyle(1, 0x67e8f9, 0.18)
      this.add.rectangle(x, HIT_Y, 74, 4, 0xfacc15, 0.52)
      this.add.rectangle(x, PLAYER_Y + 42, 82, 10, 0x020617, 0.45)
    })

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
    this.player = this.add.image(LANES[this.playerLane], PLAYER_Y, 'samurai-idle')
    this.player.setScale(PLAYER_SPRITE_SCALE)
    this.player.setDepth(14)
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

  private flashLane(lane: Lane, color: number) {
    const flash = this.add.rectangle(LANES[lane], 402, 92, 454, color, 0.12)
    flash.setDepth(4)
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    })
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
    const glow = this.add.circle(0, 0, radius + 9, color, kind === 'heavy' ? 0.22 : 0.15)
    const core = this.add.circle(0, 0, radius, color, 0.96)
    core.setStrokeStyle(2, accent, 0.88)
    const edge = this.add.rectangle(0, 0, kind === 'heavy' ? 5 : 3, radius * 1.55, accent, 0.74)
    body.add([glow, core, edge])
    body.setDepth(kind === 'heavy' ? 13 : 12)
    return body
  }

  private createCounterSprite(x: number, y: number, kind: CounterKind) {
    const body = this.add.container(x, y)
    if (kind === 'wave') {
      const glow = this.add.rectangle(0, 0, 122, 18, 0xffffff, 0.18)
      const blade = this.add.rectangle(0, 0, 104, 8, 0xffffff, 0.96)
      const core = this.add.rectangle(0, -8, 76, 4, 0xfacc15, 0.82)
      glow.setRotation(-0.18)
      blade.setRotation(-0.18)
      core.setRotation(-0.18)
      body.add([glow, blade, core])
    } else {
      const trail = this.add.rectangle(0, 18, 6, 42, 0x67e8f9, 0.22)
      const core = this.add.circle(0, 0, 9, 0xfef3c7, 0.96)
      core.setStrokeStyle(2, 0x67e8f9, 0.82)
      body.add([trail, core])
    }

    body.setDepth(18)
    return body
  }

  private createSpriteTextures() {
    this.createSamuraiIdleTexture()
    this.createSamuraiGuardTexture()
    this.createSamuraiSlashTexture()
    this.createBossTexture()
  }

  private createSamuraiIdleTexture() {
    this.drawTexture('samurai-idle', 44, 52, (pixel) => {
      pixel(18, 3, 10, 4, 0xfef08a)
      pixel(14, 7, 18, 8, 0xfacc15)
      pixel(16, 14, 15, 8, 0xf59e0b)
      pixel(19, 20, 9, 4, 0x92400e)
      pixel(13, 23, 18, 17, 0x111827)
      pixel(17, 25, 11, 13, 0x1f2937)
      pixel(18, 28, 8, 3, 0x0f766e)
      pixel(30, 23, 9, 15, 0xb91c1c)
      pixel(34, 31, 6, 6, 0xef4444)
      pixel(9, 23, 6, 17, 0x334155)
      pixel(31, 24, 5, 15, 0x334155)
      pixel(13, 40, 8, 9, 0x111827)
      pixel(25, 40, 8, 9, 0x111827)
      pixel(10, 48, 12, 3, 0x020617)
      pixel(24, 48, 12, 3, 0x020617)
      pixel(7, 13, 4, 30, 0xe5e7eb)
      pixel(5, 15, 3, 22, 0x64748b)
      pixel(9, 10, 5, 7, 0x111827)
    })
  }

  private createSamuraiGuardTexture() {
    this.drawTexture('samurai-guard', 44, 52, (pixel) => {
      pixel(18, 3, 11, 4, 0xfef08a)
      pixel(13, 7, 19, 8, 0xfacc15)
      pixel(16, 14, 15, 8, 0xf59e0b)
      pixel(19, 20, 9, 4, 0x92400e)
      pixel(13, 24, 18, 16, 0x111827)
      pixel(17, 26, 11, 11, 0x1f2937)
      pixel(18, 29, 8, 3, 0x0f766e)
      pixel(30, 23, 9, 14, 0xb91c1c)
      pixel(8, 21, 5, 20, 0x334155)
      pixel(31, 22, 5, 18, 0x334155)
      pixel(14, 40, 8, 9, 0x111827)
      pixel(25, 40, 8, 9, 0x111827)
      pixel(11, 48, 12, 3, 0x020617)
      pixel(24, 48, 12, 3, 0x020617)
      pixel(22, 8, 5, 39, 0xf8fafc)
      pixel(20, 12, 3, 28, 0x64748b)
      pixel(18, 29, 13, 5, 0x111827)
    })
  }

  private createSamuraiSlashTexture() {
    this.drawTexture('samurai-slash', 64, 52, (pixel) => {
      pixel(24, 3, 11, 4, 0xfef08a)
      pixel(20, 7, 19, 8, 0xfacc15)
      pixel(22, 14, 16, 8, 0xf59e0b)
      pixel(25, 20, 9, 4, 0x92400e)
      pixel(20, 24, 18, 16, 0x111827)
      pixel(24, 26, 11, 11, 0x1f2937)
      pixel(25, 29, 8, 3, 0x0f766e)
      pixel(37, 23, 12, 10, 0xb91c1c)
      pixel(46, 27, 9, 5, 0xef4444)
      pixel(16, 24, 6, 16, 0x334155)
      pixel(38, 23, 6, 16, 0x334155)
      pixel(20, 40, 8, 9, 0x111827)
      pixel(31, 40, 8, 9, 0x111827)
      pixel(17, 48, 12, 3, 0x020617)
      pixel(30, 48, 12, 3, 0x020617)
      pixel(37, 15, 21, 4, 0xf8fafc)
      pixel(55, 12, 6, 10, 0xe2e8f0)
      pixel(36, 18, 8, 6, 0x111827)
    })
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
