# 2D 월드 제작 규칙 — 《방해 금지 모드》

월드는 **타일 지도 + 사각형 데이터**로 만듭니다. 그림을 그리는 툴 없이 `data/world/*.json`만 고치면 되고,
`npm run validate:world`가 오타·막힌 칸·끊긴 길을 잡아 줍니다. 개발 서버(`npm run dev`)는 저장하면 바로 새로고침됩니다.

## 좌표

- 1칸 = 1m (타일 1개). x는 오른쪽, y는 아래쪽이 +.
- 사각형 `rect`는 `[x, y, 너비, 높이]`, 타일 (x, y)부터 (x+너비−1, y+높이−1)까지.
- 엔티티 위치(`at`, 스폰 등)는 실수 좌표. 칸 가운데는 `x + 0.5`.

## 층 (`layers`)

서로 보이지 않는 층입니다. 렌더러는 플레이어가 있는 층만 그립니다.

| 층 | 사각형 | 내용 |
|---|---|---|
| `ground` | `[0, 0, 260, 140]` | 지상: 아파트 단지·공원·회사·카페·편의점·대로·마트·고깃집·옷 매장·골목, 동쪽 골목(약국·코인세탁방·서점·쉼터) |
| `subway` | `[0, 140, 124, 20]` | 지하철 환승 통로 (무빙워크, 인파) |
| `apartment` | `[124, 140, 76, 20]` | 우리 집, 3층 복도, 엘리베이터 안 |

층 사이는 **포털**(계단·지하철 입구)과 **엘리베이터**로 오갑니다.

## 타일 (`data/world/tiles.json`)

| 속성 | 뜻 |
|---|---|
| `walk` | 지나갈 수 있음. `false` = 3D 판의 `COL_` |
| `sight` | 시선을 막음. `true` = 3D 판의 `LOS_` (벽·선반·칸막이). 유리창(`window`)은 막지 않는다 → 밖에서 안이 보인다 |
| `tall` | 서 있는 물체처럼 그림 (그림자) |
| `push` | 무빙워크: 위에 서면 밀려감 (타일/초) |
| `pattern`, `accent` | 바닥 무늬 |
| `deco` | 장식 그림 (`wall`, `window`, `desk`, `shelf`, `books`, `washer`, `bed`, `tree` …, `src/presentation/draw/tiles.ts`) |

## 월드 (`data/world/city.json`)

### 칠하기 (`ops`, 순서대로 덮어씀)
- `{ "op": "fill", "rect": [...], "tile": "road" }`
- `{ "op": "room", "rect": [...], "floor": "floorWood", "wall": "wall" }` — 테두리는 벽, 안은 바닥. 문은 뒤에서 `fill`로 뚫는다.
- `{ "op": "tiles", "tile": "tree", "at": [[x, y], ...] }`

### 3D 판 접두어와의 대응

| 3D (Kreate 이름 접두어) | 2D 데이터 | 게임 동작 |
|---|---|---|
| `VIS_` | 타일 색·무늬 | 그리기 |
| `COL_` | `walk: false` 타일 | 충돌 |
| `NAV_` | `walk: true` 타일 | NPC A* 길찾기 |
| `LOS_` | `sight: true` 타일 | NPC 시야 판정 |
| `HIDE_` | `hides[]` 사각형 | 은신: 알아챔 ×0.25, 시야 거리 절반 |
| `SAFE_` | `safes[]` (`stall`/`fitting`) | [F]로 잠그면 배터리 +1/초, 추적 초기화, `noiseAfterSec` 뒤 노크 |
| `TRG_` | `interactables[]`, `portals[]` | 상호작용, 층 이동 |
| `SPAWN_` | `spawns{}` | 플레이어·NPC 시작 위치 (하루 데이터가 이름으로 참조) |
| `PATH_` | `paths{}` | NPC 순찰 경로 |
| `ZONE_` | `areas[].stimulus` | 그 영역 안에 있으면 지속형 자극 |

### 영역 (`areas`)
- 나중에 적은 영역이 먼저 적은 영역을 덮습니다 (큰 영역 안에 작은 방).
- `kind`: `outdoor`(실외 자연 감소), `indoor`, `home`(도어락을 잠그면 안전지대)
- `small: true`: 좁은 공간 (지인과 단둘이면 어색한 침묵)
- `stimulus`: `{ "id": "cafeChatter", "intensity": 1 }` — `data/stimuli.json`의 지속형 자극

### 상호작용 (`interactables`)
`kind` 목록: `bed`, `piano`, `window`, `drip`, `fridge`, `sink`, `mirror`, `doorLock`, `peephole`, `elevator`, `flavor`, `desk`, `speech`, `coldDrink`, `shop`, `laundry`, `browse`, `soloMeal`, `bench`, `martItem`, `checkout`, `priceTag`, `clothesPick`, `seat`.
- `shop`: `shop`에 `data/items.json`의 상점 id. 상점 창이 열린다
- `flavor` + `monologue`: 게시판·메뉴판 같은 읽을거리
- `laundry`: 세탁 기다리기 (`balance.laundry`), `browse`: 책 구경 휴식
상호작용 지점은 **걸을 수 있는 칸**에 두세요 (검증 도구가 확인).

### 간판 (`labels`)
`{ "at": [x, y], "textKey": "sign.cafe", "color": "#5b7d63" }` — `color`가 있으면 색 간판, 없으면 어두운 이름표.

### 군중 동선 (`crowdLanes`)
`from` → `to` 직선을 따라 이름 없는 행인이 흐릅니다. `count`는 평시 인원, 러시아워에는 `balance.clock.rushCrowdMultiplier`배.

## 하루 (`data/days/*.json`)

- `objectives[].on`: 완료 이벤트. `enter:<영역>`, `exit:<영역>`(밖으로 나갈 때), `interact:<id>`, `done:<work|meeting|toast|return|checkout>`, `pick:martItem`, `answered:<연락처>`, `met:<npc>`, `seated`, `tryOn`
- `requires`, `mandatory`(필수 상호작용), `optional` + `skip`(안 하면 생활 지표 감소), `deadline` + `late`/`lateStimulus`, `marker`(지도·화살표가 가리킬 상호작용 id 또는 영역 id), `endsDay`(침대)
- `phone[]`: `at`(시각) 또는 `on`(이벤트)에 전화·문자
- `npcs[]`: `profile`(data/npcProfiles.json), `at`(스폰 이름), `path`, `from`/`to`(활동 시간), `seated`
- 그날만 생기는 것 (플리마켓 등): `crowdLanes`(군중 동선 추가), `areaStimuli`(영역 자극 덮어쓰기), `stalls`(노점 천막, 충돌 없음)
- 하루 순서는 `data/campaign.json`. 바꾸면 `src/main.ts`의 `SAVE_KEY` 버전을 올린다

독백 트리거(`data/monologue/triggers.json`)의 `when.day`로 특정 하루에만 나오게 할 수 있습니다.

## 확인

```bash
npm run validate:world          # 사람이 읽는 리포트
npm run validate:world -- --json
npm run validate:world -- --strict   # 경고도 실패로
```
