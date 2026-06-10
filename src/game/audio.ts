import type { GameSettings } from './types'

let audioContext: AudioContext | undefined

export function playTone(settings: GameSettings, frequency: number, durationMs: number, type: OscillatorType, volume = 0.2) {
  if (settings.soundVolume <= 0) {
    return
  }

  try {
    const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext }
    const AudioContextClass = window.AudioContext ?? audioWindow.webkitAudioContext
    if (!AudioContextClass) {
      return
    }

    audioContext ??= new AudioContextClass()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const now = audioContext.currentTime

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * settings.soundVolume), now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + durationMs / 1000 + 0.025)
  } catch {
    // Audio feedback is optional; gameplay must continue if browser audio fails.
  }
}
