import Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, MONO_FONT, UI_FONT } from '../game/config'
import { SAMURAI_FRAMES, createSamuraiFrameTexture, preloadSamuraiSheet } from '../game/samuraiSprite'

export class IntroScene extends Phaser.Scene {
  private startButton?: Phaser.GameObjects.Container

  constructor() {
    super('IntroScene')
  }

  preload() {
    preloadSamuraiSheet(this)
  }

  create() {
    this.children.removeAll(true)
    this.createMenuTextures()
    this.createBackdrop()
    this.createHero()
    this.createStartButton()

    this.input.keyboard?.on('keydown-SPACE', this.startGame, this)
    this.input.keyboard?.on('keydown-ENTER', this.startGame, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-SPACE', this.startGame, this)
      this.input.keyboard?.off('keydown-ENTER', this.startGame, this)
    })
  }

  private createBackdrop() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x08111f)

    const bands = [0x111827, 0x172554, 0x1e1b4b, 0x164e63, 0x0f766e, 0x1f2937]
    bands.forEach((color, index) => {
      this.add.rectangle(GAME_WIDTH / 2, (GAME_HEIGHT / bands.length) * (index + 0.5), GAME_WIDTH, GAME_HEIGHT / bands.length + 2, color, 0.4 + index * 0.06)
    })

    this.add.circle(364, 102, 48, 0xfffbeb, 0.86).setStrokeStyle(2, 0xfacc15, 0.28)
    this.add.rectangle(GAME_WIDTH / 2, 472, GAME_WIDTH, 116, 0x111827, 0.58)
    this.add.rectangle(GAME_WIDTH / 2, 530, GAME_WIDTH, 13, 0x78350f, 0.94)
    this.add.rectangle(GAME_WIDTH / 2, 540, GAME_WIDTH, 5, 0xfacc15, 0.74)

    for (let index = 0; index < 6; index += 1) {
      const x = 48 + index * 78
      this.add.rectangle(x, 612, 28, 178, index % 2 === 0 ? 0x334155 : 0x475569, 0.62)
    }

    for (let index = 0; index < 28; index += 1) {
      const x = Phaser.Math.Between(18, GAME_WIDTH - 18)
      const y = Phaser.Math.Between(24, 420)
      this.add.circle(x, y, Phaser.Math.FloatBetween(0.8, 1.9), index % 6 === 0 ? 0xfacc15 : 0xe0f2fe, Phaser.Math.FloatBetween(0.18, 0.55))
    }
  }

  private createHero() {
    this.add
      .text(GAME_WIDTH / 2, 62, 'SAMURAI PARRY', {
        align: 'center',
        color: '#f8fafc',
        fontFamily: UI_FONT,
        fontSize: '36px',
        fontStyle: '900',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#020617', 8)

    this.add
      .text(GAME_WIDTH / 2, 102, '가면 무사의 시험', {
        align: 'center',
        color: '#facc15',
        fontFamily: UI_FONT,
        fontSize: '20px',
        fontStyle: '900',
      })
      .setOrigin(0.5)

    this.add
      .text(GAME_WIDTH / 2, 132, 'LEVEL 1 BOSS FIGHT', {
        align: 'center',
        color: '#bfdbfe',
        fontFamily: MONO_FONT,
        fontSize: '13px',
        fontStyle: '800',
      })
      .setOrigin(0.5)

    const bossShadow = this.add.ellipse(GAME_WIDTH / 2, 296, 142, 28, 0x000000, 0.26)
    const boss = this.add.image(GAME_WIDTH / 2, 246, 'intro-boss').setScale(3.1)
    const samuraiShadow = this.add.ellipse(GAME_WIDTH / 2, 522, 86, 20, 0x000000, 0.32)
    const samurai = this.add.image(GAME_WIDTH / 2, 486, 'intro-samurai').setScale(2.25)
    samurai.setDepth(8)

    this.tweens.add({
      targets: [boss, bossShadow],
      y: '+=8',
      duration: 1_600,
      ease: 'Sine.easeInOut',
      repeat: -1,
      yoyo: true,
    })
    this.tweens.add({
      targets: [samurai, samuraiShadow],
      y: '-=5',
      duration: 1_250,
      ease: 'Sine.easeInOut',
      repeat: -1,
      yoyo: true,
    })
  }

  private createStartButton() {
    const x = GAME_WIDTH / 2
    const y = 620
    const background = this.add.rectangle(0, 0, 246, 62, 0xfacc15, 0.98)
    background.setStrokeStyle(2, 0xfffbeb, 0.95)
    const label = this.add
      .text(0, 0, '게임 시작', {
        align: 'center',
        color: '#111827',
        fontFamily: UI_FONT,
        fontSize: '24px',
        fontStyle: '900',
      })
      .setOrigin(0.5)

    this.startButton = this.add.container(x, y, [background, label])
    this.startButton.setSize(246, 62)
    this.startButton.setInteractive({ useHandCursor: true })
    this.startButton.on('pointerover', () => {
      background.setFillStyle(0xfffbeb, 1)
      this.tweens.add({ targets: this.startButton, scale: 1.035, duration: 90, ease: 'Quad.easeOut' })
    })
    this.startButton.on('pointerout', () => {
      background.setFillStyle(0xfacc15, 0.98)
      this.tweens.add({ targets: this.startButton, scale: 1, duration: 90, ease: 'Quad.easeOut' })
    })
    this.startButton.on('pointerdown', () => {
      background.setFillStyle(0xf97316, 1)
      this.startButton?.setScale(0.98)
    })
    this.startButton.on('pointerup', () => this.startGame())
  }

  private startGame() {
    this.scene.start('ShooterScene')
  }

  private createMenuTextures() {
    createSamuraiFrameTexture(this, 'intro-samurai', SAMURAI_FRAMES.backIdle)

    this.drawTexture('intro-boss', 72, 76, (pixel) => {
      pixel(28, 3, 16, 7, 0xe5e7eb)
      pixel(24, 10, 24, 15, 0xf8fafc)
      pixel(29, 15, 5, 4, 0x111827)
      pixel(39, 15, 5, 4, 0x111827)
      pixel(32, 22, 8, 3, 0x991b1b)
      pixel(18, 26, 36, 31, 0x111827)
      pixel(23, 31, 26, 20, 0x1f2937)
      pixel(10, 29, 12, 25, 0x7f1d1d)
      pixel(50, 29, 12, 25, 0x7f1d1d)
      pixel(16, 56, 14, 15, 0x111827)
      pixel(43, 56, 14, 15, 0x111827)
      pixel(11, 70, 19, 4, 0x020617)
      pixel(41, 70, 19, 4, 0x020617)
      pixel(55, 8, 5, 50, 0xe5e7eb)
      pixel(52, 13, 3, 41, 0x64748b)
      pixel(47, 23, 14, 5, 0x111827)
      pixel(31, 31, 10, 12, 0xfacc15)
      pixel(27, 43, 18, 5, 0xfacc15)
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
}
