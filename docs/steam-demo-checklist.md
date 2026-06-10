# Steam Demo Checklist

This project is scoped as a Steam wishlist-building demo for a classic bullet hell game.

## Store Positioning

- Short hook: "A compact classic bullet hell demo about routing fixed waves, grazing for score, and surviving a two-phase carrier boss."
- Genre tags to test: Bullet Hell, Shoot 'Em Up, Arcade, 2D, Score Attack, Difficult, Singleplayer.
- Primary language target: English store page, Korean and English in-game text.
- Release strategy: publish Coming Soon page first, then ship a playable demo, then target Steam Next Fest only after the demo can retain players for repeated score runs.

## Required Store Assets

- Trailer: 30-60 seconds, first 5 seconds must show direct gameplay, not logo-only buildup.
- Screenshots: at least 5 actual gameplay screenshots.
- Screenshot set should cover:
  - Title/menu with mode and difficulty selection.
  - Early wave routing with visible player bullets.
  - Dense bullet pattern with hitbox/focus movement visible.
  - Boss phase one with health bar.
  - Boss phase two or result/rank screen.
- Store copy:
  - Short description under 300 characters.
  - Long description focused on fixed patterns, graze scoring, boss practice, and score attack.
  - Clear demo disclaimer: one polished demo stage, not final content volume.

## Demo Acceptance

- A first-time Novice player can reach the boss within 3-5 attempts.
- Arcade difficulty remains clearable without random enemy behavior.
- The player can understand why every hit happened because hitbox, invulnerability, and bullet visuals are readable.
- A cleared run shows rank, score, max chain, graze count, no-miss, and no-bomb status.
- Boss Practice starts quickly and lets players replay the selling point without repeating the whole stage.

## Build And Capture Flow

1. Run `npm run build`.
2. Run `npm run dev`.
3. Capture gameplay at 1920x1080 or higher using the browser scaled to show the full playfield.
4. Record one clean Novice clear and one short Arcade failure/recovery clip.
5. Export trailer and screenshots from real gameplay only.

## Steam Timing Notes

- Put up Coming Soon once branding, screenshots, trailer, and store copy are credible enough to collect wishlists.
- Do not spend the one allowed Next Fest appearance before the demo has stable retention, a compelling trailer, and at least one update beat planned.
- Use local best-score data now; replace or extend with Steam leaderboards only after Steamworks integration is chosen.
