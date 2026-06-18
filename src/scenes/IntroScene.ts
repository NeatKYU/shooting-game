import Phaser from 'phaser'
import { DIFFICULTIES } from '../data/difficulties'
import { DEMO_STAGE } from '../data/demoStage'
import { playTone } from '../game/audio'
import { GAME_HEIGHT, GAME_WIDTH, UI_FONT } from '../game/config'
import { keyLabel, text } from '../game/localization'
import { addStarfield, createPlayerShip, preloadPlayerJet } from '../game/sceneAssets'
import { cloneSettings, eventToKeyName, loadSettings, saveSettings } from '../game/settings'
import type { GameMode, RebindTarget, ShooterSceneData } from '../game/types'

interface SelectableItem {
  plate: Phaser.GameObjects.Rectangle
  action: () => void
}

export class IntroScene extends Phaser.Scene {
  private settings = loadSettings()
  private selectedMode: GameMode = 'demo'
  private helpPanel?: Phaser.GameObjects.Container
  private settingsPanel?: Phaser.GameObjects.Container
  private rebindTarget?: RebindTarget
  private menuTexts: Phaser.GameObjects.Text[] = []
  private menuItems: SelectableItem[] = []
  private settingsItems: SelectableItem[] = []
  private selectedMenuIndex = 0
  private selectedSettingsIndex = 0

  constructor() {
    super('IntroScene')
  }

  preload() {
    preloadPlayerJet(this)
  }

  create() {
    this.settings = loadSettings()
    this.selectedMode = 'demo'
    this.rebindTarget = undefined
    this.menuTexts = []
    this.menuItems = []
    this.settingsItems = []
    this.selectedMenuIndex = 0
    this.selectedSettingsIndex = 0
    this.input.keyboard?.on('keydown', this.onKeyDown, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.onKeyDown, this)
    })
    this.renderMenu()
  }

  shutdown() {
    this.input.keyboard?.off('keydown', this.onKeyDown, this)
  }

  private renderMenu() {
    this.tweens.killAll()
    this.children.removeAll(true)
    this.helpPanel = undefined
    this.settingsPanel = undefined
    this.menuItems = []
    this.settingsItems = []
    addStarfield(this, 140)

    this.add.circle(378, 108, 52, 0x7dd3fc, 0.16)
    this.add.circle(394, 95, 30, 0xf0abfc, 0.15)
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 38, GAME_WIDTH, 76, 0x111827, 0.32)

    this.add
      .text(36, 52, text({ ko: 'METEOR FRONT DEMO', en: 'METEOR FRONT DEMO' }, this.settings.language), {
        color: '#f8fafc',
        fontFamily: UI_FONT,
        fontSize: '35px',
        fontStyle: '800',
      })
      .setShadow(0, 5, '#0f172a', 8)

    this.add.text(40, 104, text(DEMO_STAGE.subtitle, this.settings.language), {
      color: '#bae6fd',
      fontFamily: UI_FONT,
      fontSize: '17px',
    })

    this.add.text(
      40,
      130,
      text(
        { ko: '클래식 탄막 데모 - 1CC, 그레이즈, 랭크, 보스 연습', en: 'Classic bullet hell demo - 1CC, graze, rank, boss practice' },
        this.settings.language,
      ),
      {
        color: '#e0f2fe',
        fontFamily: UI_FONT,
        fontSize: '15px',
      },
    )

    const ship = createPlayerShip(this, -70, 318, 124)
    this.tweens.add({
      targets: ship,
      x: GAME_WIDTH / 2,
      duration: 1_250,
      ease: 'Cubic.easeOut',
    })
    this.tweens.add({
      targets: ship,
      y: ship.y - 8,
      duration: 1_300,
      ease: 'Sine.easeInOut',
      repeat: -1,
      yoyo: true,
      delay: 1_250,
    })

    const menuX = 48
    const menuY = 416
    this.createMenuButton(menuX, menuY, this.startLabel(), 310, () => {
      playTone(this.settings, 620, 90, 'triangle', 0.16)
      this.scene.start('ShooterScene', {
        settings: cloneSettings(this.settings),
        mode: this.selectedMode,
      } satisfies ShooterSceneData)
    })
    this.createMenuButton(menuX, menuY + 54, this.difficultyLabel(), 310, () => {
      this.settings.difficulty = this.settings.difficulty === 'novice' ? 'arcade' : 'novice'
      saveSettings(this.settings)
      this.renderMenu()
    })
    this.createMenuButton(menuX, menuY + 108, this.modeLabel(), 310, () => {
      this.selectedMode = this.selectedMode === 'demo' ? 'practice' : 'demo'
      this.renderMenu()
    })
    this.createMenuButton(menuX, menuY + 162, text({ ko: '설정 / 키 변경', en: 'Settings / Keys' }, this.settings.language), 310, () => {
      this.toggleSettingsPanel()
    })
    this.createMenuButton(menuX, menuY + 216, text({ ko: '하는 방법', en: 'How to Play' }, this.settings.language), 310, () => {
      this.toggleHelpPanel()
    })
    this.selectedMenuIndex = Phaser.Math.Clamp(this.selectedMenuIndex, 0, this.menuItems.length - 1)
    this.updateMenuSelection()
  }

  private startLabel() {
    return this.selectedMode === 'practice'
      ? text({ ko: '보스 연습 시작', en: 'Start Boss Practice' }, this.settings.language)
      : text({ ko: '데모 런 시작', en: 'Start Demo Run' }, this.settings.language)
  }

  private difficultyLabel() {
    const difficulty = DIFFICULTIES[this.settings.difficulty]
    return `${text({ ko: '난이도', en: 'Difficulty' }, this.settings.language)}: ${text(difficulty.label, this.settings.language)}`
  }

  private modeLabel() {
    const mode = this.selectedMode === 'demo' ? { ko: '데모 런', en: 'Demo Run' } : { ko: '보스 연습', en: 'Boss Practice' }
    return `${text({ ko: '모드', en: 'Mode' }, this.settings.language)}: ${text(mode, this.settings.language)}`
  }

  private createMenuButton(x: number, y: number, label: string, width: number, onClick: () => void) {
    const button = this.add.container(x, y)
    const plate = this.add.rectangle(0, 0, width, 42, 0x0f172a, 0.84)
    plate.setOrigin(0, 0)
    plate.setStrokeStyle(2, 0x38bdf8, 0.9)
    plate.setInteractive({ useHandCursor: true })

    const buttonText = this.add.text(20, 9, label, {
      color: '#f8fafc',
      fontFamily: UI_FONT,
      fontSize: '19px',
      fontStyle: '700',
    })

    plate.on('pointerover', () => {
      this.selectedMenuIndex = itemIndex
      this.updateMenuSelection()
    })
    plate.on('pointerout', () => {
      this.updateMenuSelection()
    })
    plate.on('pointerdown', () => {
      this.selectedMenuIndex = itemIndex
      this.updateMenuSelection()
      onClick()
    })

    button.add([plate, buttonText])
    this.menuTexts.push(buttonText)
    const itemIndex = this.menuItems.length
    this.menuItems.push({ plate, action: onClick })
    return button
  }

  private updateMenuSelection() {
    this.menuItems.forEach((item, index) => {
      const isSelected = index === this.selectedMenuIndex
      item.plate.setFillStyle(isSelected ? 0x164e63 : 0x0f172a, isSelected ? 0.94 : 0.84)
      item.plate.setStrokeStyle(2, isSelected ? 0x67e8f9 : 0x38bdf8, isSelected ? 1 : 0.9)
    })
  }

  private toggleHelpPanel() {
    this.settingsPanel?.destroy()
    this.settingsPanel = undefined

    if (this.helpPanel) {
      this.helpPanel.destroy()
      this.helpPanel = undefined
      return
    }

    const panel = this.add.container(40, 586)
    const background = this.add.rectangle(0, 0, 400, 120, 0x020617, 0.86)
    background.setOrigin(0, 0)
    background.setStrokeStyle(2, 0xa78bfa, 0.85)

    const title = this.add.text(22, 16, text({ ko: '하는 방법', en: 'How to Play' }, this.settings.language), {
      color: '#f5d0fe',
      fontFamily: UI_FONT,
      fontSize: '20px',
      fontStyle: '800',
    })

    const controls = this.settings.controls
    const body = this.add.text(
      22,
      48,
      text(
        {
          ko: `방향키/WASD 이동  ${keyLabel(controls.slow, 'ko')} 저속\n${keyLabel(controls.fire, 'ko')} 발사  ${keyLabel(controls.bomb, 'ko')} 폭탄\n탄에 가까이 붙으면 그레이즈 보너스`,
          en: `Arrows/WASD move  ${keyLabel(controls.slow, 'en')} focus\n${keyLabel(controls.fire, 'en')} fire  ${keyLabel(controls.bomb, 'en')} bomb\nGraze bullets closely for score`,
        },
        this.settings.language,
      ),
      {
        color: '#e5e7eb',
        fontFamily: UI_FONT,
        fontSize: '15px',
        lineSpacing: 5,
      },
    )

    panel.add([background, title, body])
    this.helpPanel = panel
  }

  private toggleSettingsPanel() {
    this.helpPanel?.destroy()
    this.helpPanel = undefined

    if (this.settingsPanel) {
      this.settingsPanel.destroy()
      this.settingsPanel = undefined
      this.rebindTarget = undefined
      return
    }

    this.renderSettingsPanel()
  }

  private renderSettingsPanel() {
    this.settingsPanel?.destroy()
    this.settingsItems = []

    const panel = this.add.container(36, 568)
    const background = this.add.rectangle(0, 0, 408, 140, 0x020617, 0.9)
    background.setOrigin(0, 0)
    background.setStrokeStyle(2, 0x67e8f9, 0.9)
    panel.add(background)

    const rows = [
      {
        label: `${text({ ko: '언어', en: 'Language' }, this.settings.language)}: ${this.settings.language.toUpperCase()}`,
        action: () => {
          this.settings.language = this.settings.language === 'ko' ? 'en' : 'ko'
          saveSettings(this.settings)
          this.renderMenu()
        },
      },
      {
        label: `${text({ ko: '사운드', en: 'Sound' }, this.settings.language)}: ${Math.round(this.settings.soundVolume * 100)}%`,
        action: () => {
          this.settings.soundVolume = this.settings.soundVolume >= 0.9 ? 0 : this.settings.soundVolume + 0.25
          saveSettings(this.settings)
          playTone(this.settings, 520, 80, 'sine', 0.16)
          this.renderSettingsPanel()
        },
      },
      {
        label: `${text({ ko: '흔들림', en: 'Shake' }, this.settings.language)}: ${this.settings.screenShake ? 'ON' : 'OFF'}`,
        action: () => {
          this.settings.screenShake = !this.settings.screenShake
          saveSettings(this.settings)
          this.renderSettingsPanel()
        },
      },
      {
        label: `${text({ ko: '발사', en: 'Fire' }, this.settings.language)}: ${keyLabel(this.settings.controls.fire, this.settings.language)}`,
        action: () => this.startRebind('fire'),
      },
      {
        label: `${text({ ko: '저속', en: 'Focus' }, this.settings.language)}: ${keyLabel(this.settings.controls.slow, this.settings.language)}`,
        action: () => this.startRebind('slow'),
      },
      {
        label: `${text({ ko: '폭탄', en: 'Bomb' }, this.settings.language)}: ${keyLabel(this.settings.controls.bomb, this.settings.language)}`,
        action: () => this.startRebind('bomb'),
      },
    ]

    rows.forEach((row, index) => {
      const x = index % 2 === 0 ? 18 : 212
      const y = 14 + Math.floor(index / 2) * 31
      const width = index === rows.length - 1 ? 178 : 174
      const button = this.add.rectangle(x, y, width, 24, 0x0f172a, 0.92)
      button.setOrigin(0, 0)
      button.setStrokeStyle(1, 0x334155, 0.8)
      button.setInteractive({ useHandCursor: true })
      const itemIndex = this.settingsItems.length
      button.on('pointerover', () => {
        this.selectedSettingsIndex = itemIndex
        this.updateSettingsSelection()
      })
      button.on('pointerout', () => this.updateSettingsSelection())
      button.on('pointerdown', () => {
        this.selectedSettingsIndex = itemIndex
        this.updateSettingsSelection()
        row.action()
      })
      const label = this.add.text(x + 8, y + 4, row.label, {
        color: '#e5e7eb',
        fontFamily: UI_FONT,
        fontSize: '13px',
      })
      this.settingsItems.push({ plate: button, action: row.action })
      panel.add([button, label])
    })

    if (this.rebindTarget) {
      const waiting = this.add.text(
        20,
        114,
        text({ ko: '변경할 키를 누르세요...', en: 'Press a key to bind...' }, this.settings.language),
        {
          color: '#fde68a',
          fontFamily: UI_FONT,
          fontSize: '14px',
          fontStyle: '700',
        },
      )
      panel.add(waiting)
    }

    this.settingsPanel = panel
    this.selectedSettingsIndex = Phaser.Math.Clamp(this.selectedSettingsIndex, 0, this.settingsItems.length - 1)
    this.updateSettingsSelection()
  }

  private updateSettingsSelection() {
    this.settingsItems.forEach((item, index) => {
      const isSelected = index === this.selectedSettingsIndex
      item.plate.setFillStyle(isSelected ? 0x164e63 : 0x0f172a, isSelected ? 0.98 : 0.92)
      item.plate.setStrokeStyle(1, isSelected ? 0x67e8f9 : 0x334155, isSelected ? 1 : 0.8)
    })
  }

  private startRebind(target: RebindTarget) {
    this.rebindTarget = target
    this.renderSettingsPanel()
  }

  private onKeyDown(event: KeyboardEvent) {
    if (this.rebindTarget) {
      event.preventDefault()
      this.settings.controls[this.rebindTarget] = eventToKeyName(event)
      this.rebindTarget = undefined
      saveSettings(this.settings)
      playTone(this.settings, 680, 70, 'triangle', 0.14)
      this.renderSettingsPanel()
      return
    }

    if (this.settingsPanel && this.handleSettingsKey(event)) {
      return
    }

    if (event.code === 'Escape' && this.helpPanel) {
      event.preventDefault()
      this.toggleHelpPanel()
      return
    }

    this.handleMenuKey(event)
  }

  private handleMenuKey(event: KeyboardEvent) {
    if (this.menuItems.length === 0) {
      return
    }

    if (event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault()
      this.selectedMenuIndex = Phaser.Math.Wrap(this.selectedMenuIndex - 1, 0, this.menuItems.length)
      this.updateMenuSelection()
      return
    }

    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault()
      this.selectedMenuIndex = Phaser.Math.Wrap(this.selectedMenuIndex + 1, 0, this.menuItems.length)
      this.updateMenuSelection()
      return
    }

    if (this.isConfirmKey(event.code)) {
      event.preventDefault()
      this.menuItems[this.selectedMenuIndex]?.action()
    }
  }

  private handleSettingsKey(event: KeyboardEvent) {
    if (event.code === 'Escape') {
      event.preventDefault()
      this.toggleSettingsPanel()
      return true
    }

    if (this.settingsItems.length === 0) {
      return false
    }

    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      event.preventDefault()
      this.selectedSettingsIndex = Phaser.Math.Wrap(this.selectedSettingsIndex - 1, 0, this.settingsItems.length)
      this.updateSettingsSelection()
      return true
    }

    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault()
      this.selectedSettingsIndex = Phaser.Math.Wrap(this.selectedSettingsIndex + 1, 0, this.settingsItems.length)
      this.updateSettingsSelection()
      return true
    }

    if (event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault()
      this.selectedSettingsIndex = Phaser.Math.Wrap(this.selectedSettingsIndex - 2, 0, this.settingsItems.length)
      this.updateSettingsSelection()
      return true
    }

    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault()
      this.selectedSettingsIndex = Phaser.Math.Wrap(this.selectedSettingsIndex + 2, 0, this.settingsItems.length)
      this.updateSettingsSelection()
      return true
    }

    if (this.isConfirmKey(event.code)) {
      event.preventDefault()
      this.settingsItems[this.selectedSettingsIndex]?.action()
      return true
    }

    return false
  }

  private isConfirmKey(code: string) {
    return code === 'Enter' || code === 'NumpadEnter' || code === 'Space'
  }
}
