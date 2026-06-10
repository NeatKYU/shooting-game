import Phaser from 'phaser'
import { DIFFICULTIES } from '../data/difficulties'
import { DEMO_STAGE } from '../data/demoStage'
import { playTone } from '../game/audio'
import { GAME_HEIGHT, GAME_WIDTH, UI_FONT } from '../game/config'
import { keyLabel, text } from '../game/localization'
import { addStarfield, createPlayerShip, preloadPlayerJet } from '../game/sceneAssets'
import { cloneSettings, eventToKeyName, loadSettings, saveSettings } from '../game/settings'
import type { GameMode, RebindTarget, ShooterSceneData } from '../game/types'

export class IntroScene extends Phaser.Scene {
  private settings = loadSettings()
  private selectedMode: GameMode = 'demo'
  private helpPanel?: Phaser.GameObjects.Container
  private settingsPanel?: Phaser.GameObjects.Container
  private rebindTarget?: RebindTarget
  private menuTexts: Phaser.GameObjects.Text[] = []

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
    this.input.keyboard?.on('keydown', this.onKeyDown, this)
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
    ship.setAngle(90)
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
      plate.setFillStyle(0x164e63, 0.94)
      plate.setStrokeStyle(2, 0x67e8f9, 1)
    })
    plate.on('pointerout', () => {
      plate.setFillStyle(0x0f172a, 0.84)
      plate.setStrokeStyle(2, 0x38bdf8, 0.9)
    })
    plate.on('pointerdown', onClick)

    button.add([plate, buttonText])
    this.menuTexts.push(buttonText)
    return button
  }

  private toggleHelpPanel() {
    if (this.helpPanel) {
      this.closePanels()
      return
    }

    this.closePanels()
    const panel = this.createFullscreenPanel(text({ ko: '하는 방법', en: 'How to Play' }, this.settings.language), 0xa78bfa)

    const controls = this.settings.controls
    const body = this.add.text(
      42,
      116,
      text(
        {
          ko: [
            `방향키/WASD - 이동`,
            `${keyLabel(controls.slow, 'ko')} - 저속 이동과 히트박스 표시`,
            `${keyLabel(controls.fire, 'ko')} - 발사 / 결과 화면에서 재시작`,
            `${keyLabel(controls.bomb, 'ko')} - 폭탄 / 결과 화면에서 메뉴`,
            '',
            '탄에 가까이 붙으면 그레이즈 보너스가 오릅니다.',
            '체인을 유지하면 점수 배율이 올라갑니다.',
            '보스 연습 모드에서는 바로 보스 패턴을 반복할 수 있습니다.',
          ].join('\n'),
          en: [
            'Arrows/WASD - Move',
            `${keyLabel(controls.slow, 'en')} - Focus movement and show hitbox`,
            `${keyLabel(controls.fire, 'en')} - Fire / restart from result`,
            `${keyLabel(controls.bomb, 'en')} - Bomb / return to menu from result`,
            '',
            'Graze bullets closely to earn score.',
            'Keep chains alive to raise your score multiplier.',
            'Boss Practice starts directly at the boss patterns.',
          ].join('\n'),
        },
        this.settings.language,
      ),
      {
        color: '#e5e7eb',
        fontFamily: UI_FONT,
        fontSize: '18px',
        lineSpacing: 12,
        wordWrap: { width: GAME_WIDTH - 84 },
      },
    )

    const footer = this.add.text(
      42,
      GAME_HEIGHT - 76,
      text({ ko: '오른쪽 위 X 버튼으로 닫기', en: 'Close with the X button in the top-right' }, this.settings.language),
      {
        color: '#bae6fd',
        fontFamily: UI_FONT,
        fontSize: '15px',
      },
    )

    panel.add([body, footer])
    this.helpPanel = panel
  }

  private toggleSettingsPanel() {
    if (this.settingsPanel) {
      this.closePanels()
      return
    }

    this.closePanels()
    this.renderSettingsPanel()
  }

  private renderSettingsPanel() {
    this.settingsPanel?.destroy()

    const panel = this.createFullscreenPanel(text({ ko: '설정 / 키 변경', en: 'Settings / Keys' }, this.settings.language), 0x67e8f9)

    const rows = [
      {
        label: `${text({ ko: '언어', en: 'Language' }, this.settings.language)}: ${this.settings.language.toUpperCase()}`,
        action: () => {
          this.settings.language = this.settings.language === 'ko' ? 'en' : 'ko'
          saveSettings(this.settings)
          this.renderMenu()
          this.renderSettingsPanel()
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
        label: `${text({ ko: '히트박스', en: 'Hitbox' }, this.settings.language)}: ${this.settings.showHitbox ? 'ON' : 'FOCUS'}`,
        action: () => {
          this.settings.showHitbox = !this.settings.showHitbox
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
      const x = 42
      const y = 118 + index * 58
      const width = GAME_WIDTH - 84
      const button = this.add.rectangle(x, y, width, 42, 0x0f172a, 0.92)
      button.setOrigin(0, 0)
      button.setStrokeStyle(2, 0x334155, 0.9)
      button.setInteractive({ useHandCursor: true })
      button.on('pointerover', () => {
        button.setFillStyle(0x164e63, 0.96)
        button.setStrokeStyle(2, 0x67e8f9, 0.95)
      })
      button.on('pointerout', () => {
        button.setFillStyle(0x0f172a, 0.92)
        button.setStrokeStyle(2, 0x334155, 0.9)
      })
      button.on('pointerdown', row.action)
      const label = this.add.text(x + 16, y + 10, row.label, {
        color: '#e5e7eb',
        fontFamily: UI_FONT,
        fontSize: '17px',
        fontStyle: '700',
      })
      panel.add([button, label])
    })

    if (this.rebindTarget) {
      const waiting = this.add.text(
        42,
        GAME_HEIGHT - 76,
        text({ ko: '변경할 키를 누르세요...', en: 'Press a key to bind...' }, this.settings.language),
        {
          color: '#fde68a',
          fontFamily: UI_FONT,
          fontSize: '17px',
          fontStyle: '700',
        },
      )
      panel.add(waiting)
    }

    this.settingsPanel = panel
  }

  private closePanels() {
    this.helpPanel?.destroy()
    this.settingsPanel?.destroy()
    this.helpPanel = undefined
    this.settingsPanel = undefined
    this.rebindTarget = undefined
  }

  private createFullscreenPanel(titleText: string, accentColor: number) {
    const panel = this.add.container(0, 0)
    panel.setDepth(50)

    const scrim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020617, 0.96)
    scrim.setOrigin(0, 0)
    scrim.setInteractive()

    const topLine = this.add.rectangle(0, 0, GAME_WIDTH, 4, accentColor, 0.95)
    topLine.setOrigin(0, 0)

    const title = this.add.text(34, 34, titleText, {
      color: '#f8fafc',
      fontFamily: UI_FONT,
      fontSize: '28px',
      fontStyle: '900',
    })

    const closeButton = this.add.rectangle(GAME_WIDTH - 38, 38, 38, 38, 0x0f172a, 0.96)
    closeButton.setStrokeStyle(2, accentColor, 0.95)
    closeButton.setInteractive({ useHandCursor: true })

    const closeLabel = this.add
      .text(GAME_WIDTH - 38, 38, 'X', {
        color: '#f8fafc',
        fontFamily: UI_FONT,
        fontSize: '22px',
        fontStyle: '900',
      })
      .setOrigin(0.5)

    closeButton.on('pointerover', () => {
      closeButton.setFillStyle(0x164e63, 0.98)
    })
    closeButton.on('pointerout', () => {
      closeButton.setFillStyle(0x0f172a, 0.96)
    })
    closeButton.on('pointerdown', () => {
      playTone(this.settings, 420, 70, 'triangle', 0.12)
      this.closePanels()
    })

    panel.add([scrim, topLine, title, closeButton, closeLabel])
    return panel
  }

  private startRebind(target: RebindTarget) {
    this.rebindTarget = target
    this.renderSettingsPanel()
  }

  private onKeyDown(event: KeyboardEvent) {
    if ((this.helpPanel || this.settingsPanel) && event.key === 'Escape') {
      this.closePanels()
      return
    }

    if (!this.rebindTarget) {
      return
    }

    event.preventDefault()
    this.settings.controls[this.rebindTarget] = eventToKeyName(event)
    this.rebindTarget = undefined
    saveSettings(this.settings)
    playTone(this.settings, 680, 70, 'triangle', 0.14)
    this.renderSettingsPanel()
  }
}
