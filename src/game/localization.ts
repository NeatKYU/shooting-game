import type { Language, LocalizedText } from './types'

export function text(phrase: LocalizedText, language: Language) {
  return phrase[language]
}

export function keyLabel(keyName: string, language: Language) {
  const labels: Record<string, LocalizedText> = {
    SPACE: { ko: 'Space', en: 'Space' },
    SHIFT: { ko: 'Shift', en: 'Shift' },
    CTRL: { ko: 'Ctrl', en: 'Ctrl' },
    ALT: { ko: 'Alt', en: 'Alt' },
    UP: { ko: '위', en: 'Up' },
    DOWN: { ko: '아래', en: 'Down' },
    LEFT: { ko: '왼쪽', en: 'Left' },
    RIGHT: { ko: '오른쪽', en: 'Right' },
  }

  return labels[keyName]?.[language] ?? keyName
}
