# 방해 금지 모드 (Do Not Disturb)

3D 1인칭 심리 스텔스 서바이벌. TypeScript + Three.js + Rapier + recast-navigation. 개발 지시서는 [CLAUDE.md](CLAUDE.md).

## 실행

```bash
npm install
npm run make:greybox      # Kreate 맵이 없을 때 테스트 레벨 생성
npm run dev               # http://localhost:5173  (?level=levels/xxx.glb 로 레벨 지정)
```

조작(Phase 0, 자유 비행): 화면 클릭으로 마우스 고정 · WASD · Space/C 상하 · Shift 빠르게 · F1 디버그 패널 · F5 레벨 다시 불러오기

## 검사

```bash
npm run test              # Vitest
npm run typecheck
npm run lint
npm run validate:assets   # Kreate GLB 검증 (-- --strict, -- --json)
```

## 폴더

```
src/core/      게임 루프, 이벤트, 설정 로딩, 입력
src/sim/       시뮬레이션 (순수 TS, Phase 1~)
src/gameplay/  플레이어·스킬 등 (Phase 0: noclip 카메라)
src/world/     LevelLoader, 노드 이름 규칙, Rapier, recast
src/debug/     lil-gui 패널, 오버레이, 핫 리로드
data/          밸런스·설정 JSON
assets/kreate/ Kreate에서 내보낸 GLB
tools/         validate-assets, make-greybox
docs/          Kreate 제작 규칙, Kreate 기능 요청서
```
