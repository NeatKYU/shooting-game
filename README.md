# Samurai Parry

Vite, TypeScript, Phaser 기반의 3라인 사무라이 패링 보스전 프로토타입입니다.

현재 구현 범위는 레벨 1 `가면 무사의 시험`입니다. 플레이어는 왼쪽, 중앙, 오른쪽 3개 라인을 이동하며 보스의 탄을 검으로 막고, 정확한 패링으로 탄을 되돌려 보스를 쓰러뜨립니다.

## Scripts

```sh
npm run dev
npm run build
npm run preview
```

## Controls

- `A` / `←`: 왼쪽 라인으로 이동
- `D` / `→`: 오른쪽 라인으로 이동
- `Space` / `J`: 검 휘두르기

## Implemented Scope

- 플레이어 HP 3, 보스 HP 100
- 검 횟수 5개, 2초마다 1개 회복
- MISS/BLOCK은 검 횟수 1개 소비
- PARRY/PERFECT는 검 횟수 소비 없음
- PARRY 반사탄, PERFECT 참격파와 라인 탄 삭제
- 약한 화면 흔들림, 슬로우 모션, 퍼펙트 암전/검광 연출
- 레벨 1 보스 4페이즈 패턴
