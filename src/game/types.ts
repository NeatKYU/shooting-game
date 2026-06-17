import type Phaser from 'phaser'

export type DifficultyId = 'novice' | 'arcade'
export type Language = 'ko' | 'en'
export type GameMode = 'demo' | 'practice'
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
export type BulletPatternKind = 'aimed' | 'fan' | 'ring' | 'spiral' | 'delayed-burst'
export type PartKind = 'bullet-core' | 'weapon-module'
export type PartId = 'armor-piercer' | 'ricochet-core' | 'laser-module' | 'spark-module' | 'wing-module'
export type DropKind = 'coin' | 'part'
export type RebindTarget = keyof ControlSettings
export type ArcadeOverlapObject = Parameters<Phaser.Types.Physics.Arcade.ArcadePhysicsCallback>[0]
export type PhysicsImage = Phaser.GameObjects.Image & { body: Phaser.Physics.Arcade.Body }
export type PhysicsRectangle = Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body }
export type PhysicsEllipse = Phaser.GameObjects.Ellipse & { body: Phaser.Physics.Arcade.Body }

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
  startingHp: number
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
  speed: number
  count?: number
  spread?: number
  centerAngle?: number
  rotationRate?: number
  bursts?: number
  burstDelayMs?: number
}

export interface EnemyArchetype {
  id: EnemyArchetypeId
  label: LocalizedText
  width: number
  height: number
  hp: number
  score: number
  coinReward: number
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
  name: LocalizedText
  maxHp: number
  phaseTwoRatio: number
  phaseOneFill: number
  phaseTwoFill: number
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
  damage: number
  pierce: number
  bounces: number
  chainLightning: boolean
  debug?: Phaser.GameObjects.Rectangle
}

export interface PartDefinition {
  id: PartId
  kind: PartKind
  label: LocalizedText
  description: LocalizedText
  color: number
}

export interface FieldDrop {
  body: PhysicsRectangle
  glow: Phaser.GameObjects.Ellipse
  kind: DropKind
  coinValue?: number
  part?: PartDefinition
  spawnedAt: number
  nextTurnAt: number
  driftDirection: -1 | 1
  debug?: Phaser.GameObjects.Rectangle
}

export interface EnemyBullet {
  body: PhysicsEllipse
  radius: number
  damage: number
  grazed: boolean
  debug?: Phaser.GameObjects.Ellipse
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
  debug?: Phaser.GameObjects.Rectangle
  hp: number
  maxHp: number
  phase: 1 | 2
  spawnElapsedMs: number
  lastRingMs: number
  lastFanMs: number
  lastAimedMs: number
  lastSpiralMs: number
}

export interface ShooterSceneData {
  settings?: GameSettings
  mode?: GameMode
}

export interface ClearBonusBreakdown {
  clear: number
  noMiss: number
  noBomb: number
  hp: number
  bombs: number
  time: number
}
