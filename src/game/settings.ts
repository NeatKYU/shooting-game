import Phaser from 'phaser'
import { SETTINGS_STORAGE_KEY } from './config'
import type { GameSettings } from './types'

export const DEFAULT_SETTINGS: GameSettings = {
  difficulty: 'novice',
  language: 'ko',
  controls: {
    fire: 'SPACE',
    slow: 'SHIFT',
    bomb: 'X',
  },
  soundVolume: 0.55,
  screenShake: true,
  showHitbox: true,
}

export function cloneSettings(settings: GameSettings): GameSettings {
  return {
    ...settings,
    controls: { ...settings.controls },
  }
}

export function loadSettings(): GameSettings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      return cloneSettings(DEFAULT_SETTINGS)
    }

    const parsed = JSON.parse(raw) as Partial<GameSettings>
    return {
      difficulty: parsed.difficulty === 'arcade' ? 'arcade' : 'novice',
      language: parsed.language === 'en' ? 'en' : 'ko',
      controls: {
        fire: parsed.controls?.fire || DEFAULT_SETTINGS.controls.fire,
        slow: parsed.controls?.slow || DEFAULT_SETTINGS.controls.slow,
        bomb: parsed.controls?.bomb || DEFAULT_SETTINGS.controls.bomb,
      },
      soundVolume: typeof parsed.soundVolume === 'number' ? Phaser.Math.Clamp(parsed.soundVolume, 0, 1) : 0.55,
      screenShake: parsed.screenShake !== false,
      showHitbox: parsed.showHitbox !== false,
    }
  } catch {
    return cloneSettings(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings: GameSettings) {
  try {
    globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Settings persistence is optional in embedded browsers.
  }
}

export function keyNameToCode(keyName: string) {
  const keyCodes = Phaser.Input.Keyboard.KeyCodes as Record<string, number>
  return keyCodes[keyName.toUpperCase()] ?? keyCodes.SPACE
}

export function eventToKeyName(event: KeyboardEvent) {
  if (event.code === 'Space') {
    return 'SPACE'
  }

  if (event.code.startsWith('Key')) {
    return event.code.replace('Key', '').toUpperCase()
  }

  if (event.code.startsWith('Digit')) {
    return event.code.replace('Digit', '').toUpperCase()
  }

  if (event.code.startsWith('Arrow')) {
    return event.code.replace('Arrow', '').toUpperCase()
  }

  if (event.code.startsWith('Shift')) {
    return 'SHIFT'
  }

  if (event.code.startsWith('Control')) {
    return 'CTRL'
  }

  if (event.code.startsWith('Alt')) {
    return 'ALT'
  }

  return event.key.toUpperCase()
}
