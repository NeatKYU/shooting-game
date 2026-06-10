import { BEST_SCORE_PREFIX } from './config'
import type { GameMode, GameSettings, ScoreModel } from './types'

export const SCORE_MODEL: ScoreModel = {
  killBase: 10,
  bossHit: 2,
  graze: 6,
  chainStep: 0.05,
  chainTimeoutMs: 2_200,
  clearBase: 15_000,
  noMissBonus: 20_000,
  noBombBonus: 15_000,
  lifeBonus: 4_000,
  bombBonus: 2_500,
  timeBonusMax: 18_000,
  timeBonusDeadlineMs: 150_000,
}

export function formatScore(score: number) {
  return Math.max(0, Math.floor(score)).toLocaleString('en-US')
}

function bestScoreKey(settings: GameSettings, mode: GameMode) {
  return `${BEST_SCORE_PREFIX}:${settings.difficulty}:${mode}`
}

export function loadBestScore(settings: GameSettings, mode: GameMode) {
  try {
    const raw = globalThis.localStorage?.getItem(bestScoreKey(settings, mode))
    return raw ? Number(raw) || 0 : 0
  } catch {
    return 0
  }
}

export function saveBestScore(settings: GameSettings, mode: GameMode, score: number) {
  try {
    const key = bestScoreKey(settings, mode)
    const current = Number(globalThis.localStorage?.getItem(key) || 0)
    if (score > current) {
      globalThis.localStorage?.setItem(key, String(Math.floor(score)))
    }
  } catch {
    // High score persistence is optional in embedded browsers.
  }
}
