# Meteor Front Demo

Vite, TypeScript, and Phaser 기반의 클래식 탄막 슈팅 데모입니다.

현재 방향은 Steam 위시리스트 확보를 위한 **데모 먼저 + 클래식 탄막**입니다. 핵심 루프는 고정 웨이브 암기, 저속 이동/히트박스 기반 회피, 그레이즈와 체인 점수, 보스 2페이즈, 클리어 랭크입니다.

## Scripts

```sh
npm run dev
npm run build
npm run preview
```

## Controls

- Arrow keys / WASD: move
- Shift: focus movement and show hitbox
- Space: fire or restart after result
- X: bomb or return to menu after result

Fire, focus, and bomb keys can be rebound from the in-game settings panel.

## Demo Features

- Two difficulties: Novice and Arcade
- Demo Run and Boss Practice modes
- Four enemy archetypes with data-driven movement and bullet patterns
- Data-driven stage, enemy, bullet pattern, score, and settings definitions
- Graze scoring, chain multiplier, local best score, no-miss/no-bomb bonuses
- Boss phase transition with bullet cancel and denser phase-two patterns
- Bilingual Korean/English menu and HUD text
- Generated sound feedback, screen shake toggle, visible hitbox option

## Steam Prep

See [docs/steam-demo-checklist.md](/Users/sun/dev/client/shooting-game/docs/steam-demo-checklist.md) for the current Steam Coming Soon, demo, trailer, screenshot, and Next Fest readiness checklist.

## Project Structure

- `src/main.ts`: Phaser bootstrap only
- `src/scenes/`: menu/settings scene and shooter gameplay scene
- `src/game/`: shared config, types, settings, scoring, localization, audio, and rendering helpers
- `src/data/`: difficulty, enemy, and stage definitions
- `src/systems/`: reusable gameplay presentation systems such as visual effects
