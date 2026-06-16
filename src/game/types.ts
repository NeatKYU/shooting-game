import type Phaser from 'phaser'

export type DifficultyId = 'novice' | 'arcade'
export type Language = 'ko' | 'en'
export type GameMode = 'demo' | 'practice'
export type BossId = 'frost-empress' | 'sakura-phantom' | 'verdant-deity' | 'dreamscape-reverie'
export type EnemyMovementPattern =
  | 'formation'
  | 'diagonal-left'
  | 'diagonal-right'
  | 'ambush-left'
  | 'ambush-right'
  | 'sine'
  | 'hover'
  | 'split-left'
  | 'split-right'
export type EnemyArchetypeId = 'scout' | 'wing' | 'turret' | 'elite'
export type BulletPatternKind =
  | 'aimed'
  | 'fan'
  | 'ring'
  | 'spiral'
  | 'delayed-burst'
  | 'flower'
  | 'curve'
  | 'lissajous'
  | 'golden-spiral'
  | 'homing'
  | 'crystal-bloom'
  | 'laser-columns'
  | 'lotus'
  | 'petal-rain'
  | 'leaf-canopy'
  | 'butterfly-arc'
  | 'rainbow-spiral'
export type EnemyBulletType =
  | 'normal'
  | 'big'
  | 'missile'
  | 'laser'
  | 'crystal'
  | 'petal'
  | 'leaf'
  | 'butterfly'
export type RebindTarget = keyof ControlSettings
export type ArcadeOverlapObject = Parameters<Phaser.Types.Physics.Arcade.ArcadePhysicsCallback>[0]
export type PhysicsImage = Phaser.GameObjects.Image & { body: Phaser.Physics.Arcade.Body }
export type PhysicsRectangle = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body }
export type PhysicsEllipse = Phaser.GameObjects.Ellipse & { body: Phaser.Physics.Arcade.Body }
export type PhysicsShape = Phaser.GameObjects.Shape & { body: Phaser.Physics.Arcade.Body }

export interface LocalizedText {
  ko: string
  en: string
}

export interface ControlSettings {
  fire: string
  slow: string
  bomb: string
}

export interface GameSettings {
  difficulty: DifficultyId
  language: Language
  controls: ControlSettings
  soundVolume: number
  screenShake: boolean
  showHitbox: boolean
}

export interface DifficultyDefinition {
  id: DifficultyId
  label: LocalizedText
  lives: number
  enemyHpScale: number
  enemyBulletSpeed: number
  enemyFireRate: number
  bossHpScale: number
  bossBulletSpeed: number
  scoreMultiplier: number
}

export interface ScoreModel {
  killBase: number
  bossHit: number
  graze: number
  chainStep: number
  chainTimeoutMs: number
  clearBase: number
  noMissBonus: number
  noBombBonus: number
  lifeBonus: number
  bombBonus: number
  timeBonusMax: number
  timeBonusDeadlineMs: number
}

export interface BulletPattern {
  kind: BulletPatternKind
  shotTimes: number[]
  color: number
  radius: number
  bulletType?: EnemyBulletType
  laserThickness?: number
  laserLength?: number
  speed: number
  count?: number
  spread?: number
  centerAngle?: number
  aimAtPlayer?: boolean
  rotationRate?: number
  bursts?: number
  burstDelayMs?: number
  petals?: number
  speedVariance?: number
  speedStep?: number
  turnRate?: number
  alternateTurn?: boolean
  acceleration?: number
  minSpeed?: number
  maxSpeed?: number
  homingMs?: number
  homingTurnRate?: number
  lissajousA?: number
  lissajousB?: number
  phaseOffset?: number
}

export type BossBulletPattern = Omit<BulletPattern, 'shotTimes'>

export interface BossBulletOrigin {
  x: number
  y: number
}

export interface BossPatternSchedule {
  id: string
  spellId: string
  phase: 1 | 2
  durationMs: number
  intervalMs: number
  initialDelayMs?: number
  origins?: BossBulletOrigin[]
  pattern: BossBulletPattern
}

export interface BossTheme {
  stage: LocalizedText
  spell: LocalizedText
  difficulty: LocalizedText
  leftSigil: LocalizedText
  rightSigil: LocalizedText
  backgroundTop: number
  backgroundBottom: number
  panel: number
  panelAccent: number
  bossAccent: number
  bossCore: number
  bulletAccent: number
}

export interface EnemyArchetype {
  id: EnemyArchetypeId
  label: LocalizedText
  width: number
  height: number
  hp: number
  score: number
  fill: number
  stroke: number
  dropChance: number
  bulletPatterns: BulletPattern[]
}

export interface StageEnemyEvent {
  timeMs: number
  x: number
  movement: EnemyMovementPattern
  enemy: EnemyArchetypeId
  targetY?: number
}

export interface BossDefinition {
  id: BossId
  name: LocalizedText
  maxHp: number
  phaseTwoRatio: number
  phaseOneFill: number
  phaseTwoFill: number
  theme: BossTheme
  patterns: BossPatternSchedule[]
}

export interface StageDefinition {
  id: string
  title: LocalizedText
  subtitle: LocalizedText
  starCount: number
  bossAppearMs: number
  boss: BossDefinition
  events: StageEnemyEvent[]
  score: ScoreModel
}

export interface PlayerBullet {
  body: PhysicsRectangle
  debug?: Phaser.GameObjects.Rectangle
}

export interface PowerUp {
  body: PhysicsRectangle
  glow: Phaser.GameObjects.Ellipse
  spawnedAt: number
  nextTurnAt: number
  driftDirection: -1 | 1
  debug?: Phaser.GameObjects.Rectangle
}

export interface EnemyBullet {
  body: PhysicsShape
  type: EnemyBulletType
  radius: number
  length?: number
  angle: number
  grazed: boolean
  motion?: EnemyBulletMotion
  debug?: Phaser.GameObjects.Shape
}

export interface EnemyBulletMotion {
  angle: number
  speed: number
  turnRate?: number
  acceleration?: number
  minSpeed?: number
  maxSpeed?: number
  homingUntilMs?: number
  homingTurnRate?: number
}

export interface Enemy {
  body: PhysicsRectangle
  debug?: Phaser.GameObjects.Rectangle
  archetype: EnemyArchetype
  movement: EnemyMovementPattern
  spawnElapsedMs: number
  startX: number
  targetY: number
  hp: number
  firedShots: Set<string>
}

export interface Boss {
  body: PhysicsRectangle
  core: Phaser.GameObjects.Ellipse
  ornaments?: Phaser.GameObjects.GameObject[]
  debug?: Phaser.GameObjects.Rectangle
  hp: number
  maxHp: number
  phase: 1 | 2
  spawnElapsedMs: number
  phaseStartedAtMs: number
  activeSpellId: string
  activeSpellCycle: number
  lastPatternFireMs: Record<string, number>
}

export interface ShooterSceneData {
  settings?: GameSettings
  mode?: GameMode
  bossId?: BossId
}

export interface ClearBonusBreakdown {
  clear: number
  noMiss: number
  noBomb: number
  lives: number
  bombs: number
  time: number
}
