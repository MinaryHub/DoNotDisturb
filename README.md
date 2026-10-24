# 방해 금지 모드 (Do Not Disturb)

2D 탑다운 심리 스텔스 서바이벌. "세상은 너무 시끄럽고, 나의 에너지는 한정되어 있다."
내향적인 사람이 하루의 의무를 마치고 사회적 배터리가 바닥나기 전에 집 침대로 돌아가는 게임입니다.
그래픽은 단순한 도형이고, 대신 지치고 긴장한 마음이 화면·소리·조작감 전체를 바꿉니다.

TypeScript + Canvas 2D + Web Audio. 개발 지시서는 [CLAUDE.md](CLAUDE.md), 월드 제작 규칙은 [docs/world-authoring.md](docs/world-authoring.md).

## 실행

```bash
npm install
npm run dev               # http://localhost:5173
```

## 조작

| 키 | 동작 |
|---|---|
| WASD / 방향키 | 이동 (마우스로 바라보는 방향) |
| Shift | 달리기 (발소리가 커진다) |
| F | 상호작용 · 화장실 칸 잠그기 · 회식 자리에서 일어나기 |
| E | 노이즈 캔슬링 이어폰 |
| Q (누르고 있기) | 폰 보는 척 — 아이컨택 차단 |
| C (누르고 있기) | 볼 감싸기 — 홍조 완화 (폰 못 씀) |
| X (누르고 있기) | 눈 감기 — 두통 완화 (앞이 안 보임) |
| V | 모자·마스크 |
| Tab | 폰 (↑↓ 선택, Enter 답장, Backspace 읽고 넘기기) |
| Y / N / U | 전화 받기 / 거절 / 문자로 대신 |
| 1 ~ 8 | 찬 음료 / 최애 간식(구석에서만) / 텀블러 커피 / 에너지 드링크 / 생수 / 두통약 / 캐모마일 차 / 쿨링 시트 (편의점·약국에서 구매, `data/items.json` 순서) |
| M | 지도 |
| H | 화면 아래 단축키 안내 숨기기 / 보이기 |
| O | 설정 · 접근성 (왜곡 강도, 흔들림·색수차·깜빡임 끄기, 심박음·이명 볼륨) |
| 대화 중 1~4 · Space · T | 끄덕 / 맞장구 / 짧게 대답 / 이탈 · 미소 유지 · SOS |

개발용: F1 디버그 패널(배터리·스트레스·생활 지표 수치, 자극 발생, 하루 이동) · `?day=2` 특정 날로 시작

## 검사

```bash
npm run test              # Vitest (sim 단위 테스트 + 하루 진행 시나리오 + 정책 시뮬레이션)
npm run typecheck
npm run lint
npm run validate:world    # 월드·하루·대사 데이터 검증 (-- --strict, -- --json)
```

## 폴더

```
src/core/          게임 루프, 입력, 설정 로딩(zod), CSV
src/sim/           자극 버스, 배터리·스트레스, 생활 지표, 신체화, 대화 배틀, 발화, 폰, 하루 사이클 (순수 TS)
src/world/         타일맵(충돌·시선·A*), 월드 빌더
src/npc/           지각, NPC 상태 머신, 군중
src/gameplay/      하루 진행(GameSession), 목표, 독백, 미니게임
src/presentation/  2D 렌더러, 심리 연출, 오디오, UI 오버레이, 접근성 설정
src/debug/         lil-gui 디버그 패널
data/              밸런스·월드·하루 일정·대사·독백·문구 (JSON/CSV)
tools/             validate-world
docs/              월드 제작 규칙, 3D 판 보관 문서
```

3D 1인칭 판은 커밋 `491da1c`에 남아 있습니다 ([docs/archive-3d](docs/archive-3d/README.md)).
