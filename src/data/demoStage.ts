import { SCORE_MODEL } from '../game/score'
import type { EnemyArchetypeId, EnemyMovementPattern, StageDefinition, StageEnemyEvent } from '../game/types'

function lineWave(
  timeMs: number,
  xs: number[],
  movement: EnemyMovementPattern,
  enemy: EnemyArchetypeId,
): StageEnemyEvent[] {
  return xs.map((x, index) => ({
    timeMs: timeMs + index * 120,
    x,
    movement,
    enemy,
  }))
}

function ambushWave(
  timeMs: number,
  xs: number[],
  side: 'left' | 'right',
  targetY: number,
  enemy: EnemyArchetypeId,
): StageEnemyEvent[] {
  return xs.map((x, index) => ({
    timeMs: timeMs + index * 180,
    x,
    movement: side === 'left' ? 'ambush-left' : 'ambush-right',
    enemy,
    targetY,
  }))
}

export const DEMO_STAGE: StageDefinition = {
  id: 'demo-stage-1',
  title: { ko: 'STAGE 1: 유성 전선', en: 'STAGE 1: Meteor Front' },
  subtitle: { ko: '패턴을 외우고 근접 회피로 배율을 올리세요', en: 'Learn patterns, graze close, build score' },
  starCount: 112,
  bossAppearMs: 92_000,
  boss: {
    name: { ko: 'BOSS: 노바 캐리어', en: 'BOSS: Nova Carrier' },
    maxHp: 230,
    phaseTwoRatio: 0.45,
    phaseOneFill: 0x7c3aed,
    phaseTwoFill: 0xe11d48,
  },
  score: SCORE_MODEL,
  events: [
    ...lineWave(800, [96, 144, 192, 240, 288, 336, 384], 'formation', 'scout'),
    ...lineWave(4_800, [56, 104, 152, 200], 'diagonal-right', 'wing'),
    ...lineWave(4_800, [424, 376, 328, 280], 'diagonal-left', 'wing'),
    ...ambushWave(9_600, [90, 170, 250, 330, 410], 'right', 150, 'scout'),
    ...lineWave(14_600, [72, 120, 168, 216, 264, 312, 360, 408], 'formation', 'wing'),
    ...ambushWave(19_800, [390, 310, 230, 150, 70], 'left', 178, 'turret'),
    ...lineWave(24_000, [72, 120, 168, 216, 264], 'sine', 'scout'),
    ...lineWave(25_300, [408, 360, 312, 264, 216], 'sine', 'wing'),
    ...lineWave(31_000, [104, 152, 200, 248, 296, 344, 392], 'formation', 'scout'),
    ...lineWave(34_700, [88, 156, 224, 292, 360], 'hover', 'turret'),
    ...ambushWave(39_000, [110, 190, 270, 350], 'right', 132, 'wing'),
    ...ambushWave(43_300, [370, 290, 210, 130], 'left', 190, 'wing'),
    ...lineWave(48_400, [58, 106, 154, 202, 250, 298], 'split-right', 'scout'),
    ...lineWave(50_000, [422, 374, 326, 278, 230, 182], 'split-left', 'scout'),
    ...lineWave(56_400, [80, 128, 176, 224, 272, 320, 368, 416], 'formation', 'wing'),
    ...ambushWave(63_400, [96, 176, 256, 336, 416], 'right', 160, 'turret'),
    ...ambushWave(70_000, [384, 304, 224, 144, 64], 'left', 144, 'turret'),
    ...lineWave(76_800, [96, 160, 224, 288, 352], 'hover', 'elite'),
    ...lineWave(83_000, [72, 120, 168, 216, 264, 312, 360, 408], 'formation', 'wing'),
    ...lineWave(87_000, [72, 144, 216], 'diagonal-right', 'elite'),
    ...lineWave(87_000, [408, 336, 264], 'diagonal-left', 'elite'),
  ].sort((a, b) => a.timeMs - b.timeMs),
}
