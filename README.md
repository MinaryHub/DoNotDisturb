# 방해 금지 모드 (Do Not Disturb)

3D 1인칭 심리 스텔스 서바이벌. TypeScript + Three.js + Rapier + recast-navigation. 개발 지시서는 [CLAUDE.md](CLAUDE.md).

## 실행

```bash
npm install
npm run dev               # http://localhost:5173  (스테이지 1)
```

조작: 화면 클릭으로 시작 · WASD 이동 · Shift 달리기 · F 상호작용 · E 이어폰 토글 · Q(누르고 있기) 폰 보는 척 · R 결과 화면에서 다시 시작

개발용: F1 디버그 패널(배터리·스트레스 수치, 오버레이, 자극 발생 버튼) · F2 자유 비행 카메라 · F5 레벨 다시 불러오기 · `?level=levels/xxx.glb` 다른 레벨 · `?nolock` 마우스 고정 없이 플레이(자동화 테스트용)

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
src/sim/          StimulusBus, EnergyModel (순수 TS)
src/gameplay/     StageSession, 플레이어, 엘리베이터, 상호작용, 스킬
src/npc/          지각, 상태 머신, 절차적 애니메이터
src/world/        LevelLoader, 노드 이름 규칙, Rapier, recast, mover
src/presentation/ 후처리, 카메라, 오디오, HUD
src/debug/        lil-gui 패널, 오버레이, 핫 리로드
data/             밸런스·설정·문구 JSON
assets/kreate/    Kreate에서 내보낸 GLB
assets/kreate-src Kreate 원본 문서 (.kreate)
tools/            validate-assets, make-greybox, kreate-scripts
docs/          Kreate 제작 규칙, Kreate 기능 요청서
```
