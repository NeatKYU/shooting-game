import type { DifficultyDefinition, DifficultyId } from '../game/types'

export const DIFFICULTIES: Record<DifficultyId, DifficultyDefinition> = {
  novice: {
    id: 'novice',
    label: { ko: 'NOVICE', en: 'NOVICE' },
    lives: 4,
    enemyHpScale: 0.88,
    enemyBulletSpeed: 0.78,
    enemyFireRate: 0.88,
    bossHpScale: 0.75,
    bossBulletSpeed: 0.82,
    scoreMultiplier: 0.82,
  },
  arcade: {
    id: 'arcade',
    label: { ko: 'ARCADE', en: 'ARCADE' },
    lives: 3,
    enemyHpScale: 1,
    enemyBulletSpeed: 1,
    enemyFireRate: 1,
    bossHpScale: 1,
    bossBulletSpeed: 1,
    scoreMultiplier: 1,
  },
}
