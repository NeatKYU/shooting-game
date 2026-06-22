export const GAME_WIDTH = 480
export const GAME_HEIGHT = 720
export const PLAYER_SPEED = 360
export const PLAYER_SLOW_SPEED = 168
export const PLAYER_BULLET_SPEED = 720
export const PLAYER_FIRE_MS = 130
export const ENEMY_MOVEMENT_SPEED_MULTIPLIER = 1.5
export const BOSS_MOVEMENT_SPEED_MULTIPLIER = 2
export const ENEMY_PROJECTILE_SPEED_MULTIPLIER = 1.5
export const MAX_BOMBS = 2
export const POWER_UP_SPEED = 92
export const POWER_UP_DRIFT_SPEED = 88
export const POWER_UP_LIFETIME_MS = 8_000
export const POWER_UP_TURN_MS = 780
export const PLAYER_HIT_INVULNERABLE_MS = 1_100
export const PLAYER_BOMB_INVULNERABLE_MS = 1_350
export const PLAYER_GRAZE_RADIUS = 34
export const PLAYER_JET_KEY = 'player-character'
export const PLAYER_JET_ASSET = '/assets/player-north.png'
// Background tiles, reconstructed from the source tileset.
// `bg-scene` is the canyon scene (tileset rows 0-5, all tiles in their painted
// arrangement) and tiles seamlessly when repeated vertically. `bg-plateau-near`
// is the near plateau ground whose centre fades out (feathered alpha) so the
// layers behind it show through smoothly.
export const BG_SCENE_KEY = 'bg-scene'
export const BG_SCENE_ASSET = '/assets/bg-scene.png'
export const BG_PLATEAU_NEAR_KEY = 'bg-plateau-near'
export const BG_PLATEAU_NEAR_ASSET = '/assets/bg-plateau-near.png'
// Parallax scroll speeds (texture px / second), stacked far → near.
export const BG_FAR_SCROLL = 52
export const BG_MID_SCROLL = 116
export const BG_NEAR_SCROLL = 280
// Translucency of the mid canyon layer stacked over the far one for depth.
export const BG_MID_ALPHA = 0.34
export const UI_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
export const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
export const DEBUG_HITBOXES = false
export const SETTINGS_STORAGE_KEY = 'space-shooter-demo-settings-v1'
export const BEST_SCORE_PREFIX = 'space-shooter-demo-best-v1'
