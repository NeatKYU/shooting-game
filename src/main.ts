import Phaser from 'phaser'
import './style.css'

const GAME_WIDTH = 480
const GAME_HEIGHT = 720
const PLAYER_SPEED = 360
const BULLET_SPEED = 680
const ENEMY_SPEED = 150
const ENEMY_SPAWN_MS = 650
const MAX_LIVES = 3
const PLAYER_HIT_INVULNERABLE_MS = 900
const PLAYER_JET_KEY = 'player-jet'
const PLAYER_JET_ASSET = '/assets/combatjet-highres.png'
const UI_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

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

    this.add.text(44, 118, '은하를 가로질러 적기를 격추하세요', {
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

    const body = this.add.text(24, 52, '← → 방향키로 이동\nSpace 키로 발사\n적기와 충돌하면 목숨을 잃습니다', {
      color: '#e5e7eb',
      fontFamily: UI_FONT,
      fontSize: '16px',
      lineSpacing: 5,
    })

    panel.add([background, title, body])
    this.helpPanel = panel
  }
}

class ShooterScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private spaceKey!: Phaser.Input.Keyboard.Key
  private scoreText!: Phaser.GameObjects.Text
  private lifeIcons: Phaser.GameObjects.Image[] = []
  private statusText!: Phaser.GameObjects.Text
  private bullets: Phaser.GameObjects.Rectangle[] = []
  private enemies: Phaser.GameObjects.Rectangle[] = []
  private score = 0
  private lives = MAX_LIVES
  private lastEnemySpawn = 0
  private invulnerableUntil = 0
  private isGameOver = false

  constructor() {
    super('ShooterScene')
  }

  preload() {
    preloadPlayerJet(this)
  }

  create() {
    this.resetGameState()

    addStarfield(this, 90)

    this.player = createPlayerShip(this, GAME_WIDTH / 2, GAME_HEIGHT - 74, 76)

    const keyboard = this.input.keyboard
    if (!keyboard) {
      throw new Error('Keyboard input is not available.')
    }

    this.cursors = keyboard.createCursorKeys()
    this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    this.scoreText = this.add.text(24, 20, 'Score 0', {
      color: '#e5e7eb',
      fontFamily: MONO_FONT,
      fontSize: '20px',
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
      .text(GAME_WIDTH / 2, 56, 'Arrow keys move. Space fires.', {
        align: 'center',
        color: '#93c5fd',
        fontFamily: UI_FONT,
        fontSize: '16px',
      })
      .setOrigin(0.5, 0)
  }

  private resetGameState() {
    this.bullets = []
    this.enemies = []
    this.lifeIcons = []
    this.score = 0
    this.lives = MAX_LIVES
    this.lastEnemySpawn = 0
    this.invulnerableUntil = 0
    this.isGameOver = false
  }

  update(time: number, delta: number) {
    if (this.isGameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.scene.restart()
      }

      return
    }

    const dt = delta / 1000
    this.updatePlayer(dt)

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.fireBullet()
    }

    if (time - this.lastEnemySpawn > ENEMY_SPAWN_MS) {
      this.spawnEnemy()
      this.lastEnemySpawn = time
    }

    this.updateBullets(dt)
    this.updateEnemies(time, dt)
    this.resolveHits()
  }

  private updatePlayer(dt: number) {
    let direction = 0

    if (this.cursors.left.isDown) {
      direction -= 1
    }

    if (this.cursors.right.isDown) {
      direction += 1
    }

    this.player.x = Phaser.Math.Clamp(
      this.player.x + direction * PLAYER_SPEED * dt,
      34,
      GAME_WIDTH - 34,
    )
  }

  private fireBullet() {
    const bullet = this.add.rectangle(this.player.x, this.player.y - 42, 8, 22, 0xfacc15)
    bullet.setStrokeStyle(1, 0xfef08a)
    this.bullets.push(bullet)
  }

  private spawnEnemy() {
    const enemy = this.add.rectangle(Phaser.Math.Between(36, GAME_WIDTH - 36), -24, 36, 28, 0xfb7185)
    enemy.setStrokeStyle(2, 0xffc4d6)
    this.enemies.push(enemy)
  }

  private updateBullets(dt: number) {
    this.bullets = this.bullets.filter((bullet) => {
      bullet.y -= BULLET_SPEED * dt

      if (bullet.y < -30) {
        bullet.destroy()
        return false
      }

      return true
    })
  }

  private updateEnemies(time: number, dt: number) {
    this.enemies = this.enemies.filter((enemy) => {
      enemy.y += ENEMY_SPEED * dt

      if (Phaser.Geom.Intersects.RectangleToRectangle(this.getPlayerHitbox(), enemy.getBounds())) {
        this.damagePlayer(time)
        enemy.destroy()
        return false
      }

      if (enemy.y > GAME_HEIGHT + 40) {
        enemy.destroy()
        return false
      }

      return true
    })
  }

  private resolveHits() {
    for (const bullet of [...this.bullets]) {
      for (const enemy of [...this.enemies]) {
        if (!Phaser.Geom.Intersects.RectangleToRectangle(bullet.getBounds(), enemy.getBounds())) {
          continue
        }

        bullet.destroy()
        enemy.destroy()
        this.bullets = this.bullets.filter((item) => item !== bullet)
        this.enemies = this.enemies.filter((item) => item !== enemy)
        this.score += 10
        this.scoreText.setText(`Score ${this.score}`)
        break
      }
    }
  }

  private damagePlayer(time: number) {
    if (time < this.invulnerableUntil || this.isGameOver) {
      return
    }

    this.lives -= 1
    this.updateLivesDisplay()

    if (this.lives <= 0) {
      this.endGame()
      return
    }

    this.invulnerableUntil = time + PLAYER_HIT_INVULNERABLE_MS
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
        if (!this.isGameOver) {
          this.statusText.setText('Arrow keys move. Space fires.')
          this.statusText.setColor('#93c5fd')
        }
      },
    })
  }

  private getPlayerHitbox() {
    return new Phaser.Geom.Rectangle(this.player.x - 22, this.player.y - 31, 44, 62)
  }

  private updateLivesDisplay() {
    this.lifeIcons.forEach((icon, index) => {
      const isActive = index < this.lives
      icon.setAlpha(isActive ? 1 : 0.24)
      icon.setTint(isActive ? 0xffffff : 0x64748b)
    })
  }

  private endGame() {
    if (this.isGameOver) {
      return
    }

    this.isGameOver = true
    this.statusText.setText('Game over. Press Space to restart.')
    this.statusText.setColor('#fecaca')
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#050816',
  scene: [IntroScene, ShooterScene],
  scale: {
    autoCenter: Phaser.Scale.CENTER_BOTH,
    mode: Phaser.Scale.FIT,
  },
}

new Phaser.Game(config)
