# 어디를 고쳐야 하는가 — 코드 지도

**이 문서는 「무엇이 없는가」가 아니라 「어디를 만지는가」다.** 결손 목록은
[PARITY.md](PARITY.md), 자료 포맷은 [DATA.md](DATA.md), 계획과 배경은
[PLAN.md](PLAN.md)가 정본이고, 여기는 그 셋을 읽기 전에 보는 **길잡이**다.

⚠️ **아직 코드가 없는 검토가 하나 있다** — [VR.md](VR.md)는 1인칭을 VR로
내보내는 길을 재 둔 것이다. **정해진 것이 아니라 값과 걸림돌만** 적혀 있고,
어느 수가 실측이고 어느 수가 짐작인지를 그 문서가 표시로 가른다.

고치러 온 사람이 제일 먼저 묻는 것 셋에만 답한다:

1. 이 기능은 어느 폴더에 있나 (§1)
2. 이런 것을 새로 만들려면 어느 파일들을 같이 건드려야 하나 (§2)
3. 무엇을 고치면 어느 시험이 깨지나 (§3)

---

## 0. 손대기 전에

| | |
|---|---|
| `raw/` | **읽기만 한다.** 롬·디컴프·BDSP 원본이다. 고치지도 옮기지도 지우지도 Git에 넣지도 않는다 |
| `public/data/` · `public/models/` | **추출 산출물이라 Git에 없다.** 앞은 `pnpm extract`(롬), 뒤는 `pnpm extract:models`(AssetAssistant)로 굽는다. 무엇이 비었는지는 `pnpm assets:check`가 그룹별로 찍어 준다 |
| 검사 | `pnpm check` — 타입·린트·시험(자료 있는 판과 없는 판)을 다 돈다 |
| 화면 확인 | `pnpm shot <자리> [--menu=bag] [--keys=z,z]` — 한 자리를 찍어서 본다 |
| 통째로 확인 | `pnpm story` — 처음 화면부터 엔딩까지 장면을 다 열어 몰아 본다 (DEPLOY.md §5) |
| 빈틈 검사 | `pnpm holes [--at=…] [--walls] [--floors] [--eyes] [--shots]` — 건물 속이 보이는가 · 방 둘레에 벽이 다 섰는가(출입구·단 빼고) · 나무·소품·울타리 밑에 바닥이 있는가 · **실제 카메라(1인칭 24방향 · 3인칭)에서 새는 데가 있는가** (DATA.md §2.2) |

**짐작으로 값을 적지 않는다.** 표를 옮길 때는 디컴프의 어느 파일 어느 표에서
왔는지를 주석에 적고, 옮긴 수와 모양을 시험이 못 박는다. 실측이 없는 값은
「우리가 정했다」라고 밝히고 그 이유를 남긴다.

---

## 1. 폴더가 나뉜 기준

**「어느 계층인가」가 아니라 「무엇에 기대는가」로 나뉜다.**

| 폴더 | 기대는 것 | 안 기대는 것 |
|---|---|---|
| `src/engine/` | 값과 표뿐. 순수 함수 | zustand 스토어 (0파일). ⚠️ **`state/worldState`만 예외** — 프레임 상태 mutable 싱글톤이라 열 곳이 직접 읽고 쓴다. ⚠️ **three는 여섯 곳만** — 카메라·이동·깨어진 세계 표면·주인공 넷과 모델 둘(정규화·치비)이다. 벡터 계산이 실제로 three의 것이라 그렇고, 그 밖은 안 쓴다 |
| `src/state/` | zustand 스토어. 엔진을 부른다 | React (0파일). three는 `worldState` 하나 — 주인공 좌표가 실제로 벡터다 |
| `src/scene/` | three·R3F 씬과 시스템. 스토어를 읽고 쓴다 | — |
| `src/ui/` | React 화면. 스토어를 읽고 쓴다 | three (0파일 — 씬이 따로 그린다) |
| `src/data/` | 산출물 읽기와 스키마 | 게임 규칙. ⚠️ 엔진의 **타입과 상수**는 가져온다 — 도감 비트 수처럼 스키마가 알아야 하는 것들이다 |
| `src/import/` | 사용자의 롬에서 브라우저가 직접 굽는 길 | 게임 규칙 |
| `tools/` | 개발 기계에서 Node가 굽는 길 | 앱 코드 |

⚠️ **`tools/extract/`와 `src/import/platinum/`은 같은 일을 두 번 한다.**
전자는 개발용(Node), 후자는 사용자가 자기 롬으로 설치할 때(브라우저)다.
**한쪽만 고치면 설치한 사람에게만 빈 화면이 뜬다** — `convert.test.ts`가 둘의
산출물을 바이트로 맞대어 그것을 막는다.

### 1.1 계통 → 자리

| 무엇 | 어디 |
|---|---|
| 스크립트 VM·명령 840종 | `engine/script/` (`commands.ts`가 명령 표, `world.ts`가 바깥 세계와의 약속) |
| 스크립트가 부르는 바깥 세계의 **구현** | `scene/fieldServices.ts` |
| 배틀 규칙 | `engine/battle/` (`sim/`이 @pkmn/sim 다리, `ai/`가 원작 AI) |
| 배틀 흐름·화면 | `state/battleStore.ts` · `ui/battle/` |
| 개체·진화·번식·능력치 | `engine/pokemon/` |
| 가방·도구 쓰기 | `engine/bag/` (무엇을 할지) · `ui/menu/itemAction.ts` (실제로 밟기) |
| 맵·격자·워프 | `engine/map/` · `scene/` |
| 깨어진 세계 | 규칙은 `engine/world/distortion*.ts`, 연출은 `scene/distortion*.ts` — **이름이 짝을 이룬다**(`…Cascade`·`…Elevator`·`…Boulder`·`…Camera`). ⚠️ **`scene/distortion.ts`는 차례를 잡는 문이지 살림집이 아니다** — 들고 나기와 한 걸음의 순서만 들고, 층 자료·판 번호는 `distortionCore.ts`가 함수로만 내준다 (밖에서 대입하는 자리를 안 만들려고 그렇게 뒀다) |
| 사람 모델을 세우는 비율 | `engine/model/` — `normalize.ts`가 키를 맞추고, `chibi.ts`가 배틀 몸이 없어 필드 번들로 서는 열일곱의 머리·손을 줄인다 (DATA §2.16) |
| 주인공의 자세 | 걷기·서기는 `engine/actor/locomotion`이 뼈를 직접 돌린다. 낚시·폭포·물주기 같은 필드 동작은 **구운 클립**이고 어느 것을 언제 돌릴지는 `engine/actor/heroClips`가 정한다. ⚠️ **둘이 같은 뼈에 쓴다** — 클립이 돌면 `sceneRefs.playerClip`이 서고 `scene/EngineDriver`가 절차형을 건너뛴다 |
| 부가 시설·세계 규칙 | `engine/world/` (꿀나무·사파리·복권·기록·장식…) |
| **우리가 덧붙인 것** (시원의 배포) | `engine/world/siwon*.ts` · `engine/script/siwonScene.ts` — [SIWON.md](SIWON.md)가 정본 |
| **통신을 닫아 둔 자리** | `engine/world/comm.ts` — 「안 된다」의 값 한 벌. 왜 문을 안 잠그고 답을 하는지는 [PARITY](PARITY.md) §9.4 |
| 배틀프런티어 | `engine/frontier/` · `state/factoryStore.ts` · `ui/menu/FactoryScreen.tsx` |
| 리포트(세이브) | `state/saveStore.ts` · `state/save/` |
| 메뉴 화면 | `ui/menu/` (`MenuLayer.tsx`가 스택 맨 위 하나를 그린다) |
| 필드 위에 얹히는 창 | `ui/field/` (대사창·소지금창·리포트 요약창…) |

---

## 2. 이런 것을 만들려면

### 2.1 스크립트 명령 하나

1. `engine/script/commands.ts`에 `on('이름', …)`. **인자를 먼저 읽는다** —
   `services.x?.(ctx.readVar())`로 쓰면 서비스가 없을 때 `?.`가 오른쪽을 아예
   계산하지 않아 읽기 위치가 안 움직이고, 다음 명령이 인자를 명령으로 읽는다.
2. 바깥 세계가 필요하면 `engine/script/world.ts`에 약속을 적고
   `scene/fieldServices.ts`에 구현한다.
3. 결과 변수가 있으면 **안 만들 때도 값을 쓴다.** 안 쓰면 앞 갈래가 남긴 값으로
   스크립트가 우연히 갈라진다 (PARITY §9.2가 그 함정을 잰다).
4. `vm.test.ts`의 세 수(`RUNNING_SITES`·`IMPLEMENTED_COMMANDS`·`IDLE_COMMANDS`)를
   갱신하고, PARITY §1.17·§10과 DATA §2.10의 같은 수도 같이 고친다.

⚠️ **인자 폭이 고정이 아닌 명령이 있다** (`CallTVBroadcast`). 표의 폭은
첫 값까지고 나머지는 그 값이 정한다.

### 2.2 리포트에 칸 하나

네 곳을 **같은 차례로** 고친다 — 검사합이 `JSON.stringify`라 키 차례가
어긋나면 다시 읽은 리포트가 「다르다」로 떨어진다:

1. `state/save/schema.ts` — zod 범위까지 좁게
2. `state/saveStore.ts` — 타입 · 새 게임 초기값 · `snapshot()`
3. `state/save/migrate.ts` — 옛 판에서 올라오는 줄 하나
4. `state/saveStore.ts`의 `SAVE_VERSION`을 하나 올린다

⚠️ **판 번호는 문서에 안 적는다.** 어느 칸이 몇 판에 들어왔는지는 `migrate.ts`가
줄 하나로 들고 있고, 문서에 옮겨 적으면 그 줄과 두 벌이 된다 — 지금 판이
몇인지도 `SAVE_VERSION` 한 곳이 정본이다.

⚠️ **새 칸은 맨 뒤에 붙인다.** 사이에 끼우면 예전에 쓴 리포트와 바이트가
어긋난다. ⚠️ **옛 리포트에 값을 지어내지 않는다** — 되짚을 근거가 없으면 0이다.

### 2.3 롬에서 자료 하나

**굽는 쪽이 둘이다.** 노드 추출기(`tools/extract/*` → `public/data/`, 개발
서버)와 브라우저 변환기(`src/import/platinum/*` → OPFS, 배포본). `dist/`에는
자료가 한 조각도 안 실리므로 **배포본이 갖는 것은 브라우저 쪽이 만든 것뿐**이다
— 한쪽만 만들면 개발 서버에서는 멀쩡하고 설치본에서만 빈다.

1. `tools/extract/<이름>.js` — `openRom()`으로 NARC을 읽고 `writeJson()`
2. `src/import/platinum/<이름>.ts` — 같은 것을 브라우저에서.
   `convert.ts`의 `GROUPS`에 줄을 더한다. **선택이 아니다**
3. `src/data/schema.ts`에 zod 스키마, `src/data/gameData.ts`에 `load*()`
4. `tools/assets/groups.mjs`에 **어느 추출기가 만드는지** 적는다 —
   안 적으면 `pnpm assets:manifest`가 「임자 없는 에셋」으로 선다
5. `package.json`의 `extract:*`와 `extract` 사슬에 넣는다
6. 게임이 그 파일 없이 못 돌면 `src/import/install/required.ts`에도

⚠️ **2를 빼먹어도 개발판은 초록이다.** 그래서 `src/data/assetContract.test.ts`가
`gameData.ts`를 **글자로 읽어** 무엇을 읽는지 모으고 `ALL_GROUPS`의 산출물과
맞댄다. 짝이 없으면 그 파일 이름을 찍고 선다 — 한때 열다섯 파일이 그렇게
설치본에서만 비어 있었다.

**크기가 배치를 증명하게 짠다.** 항목 수 × 항목 크기가 파일 크기와 안 맞으면
그 자리에서 선다 — 조용히 어긋난 채로 나가는 것보다 낫다.
⚠️ **NARC은 항목을 4바이트에 맞춘다** — 홀수 크기 항목 뒤에 2바이트가 남는다.

### 2.4 디컴프 **코드 안의** 표

아카이브가 아니라 C 소스에 박힌 표는 추출기가 못 센다. **사용자의 롬 하나로도
못 꺼낸다** — 오버레이 바이너리 안에 굳어 있어서 브라우저 변환기가 만들 길이
없다. 그래서 `pnpm gen:*` 꼴로 **소스에 구워 넣는다**
(`tools/extract/*Module.cjs` → `src/…Table.ts`).

지금 그렇게 굽는 것 스물둘(`package.json`의 `gen:*`): `gen:amity`(상호교류광장) ·
`gen:records`(게임 기록) · `gen:credits`(크레딧 흐르는 차례) ·
`gen:vsseeker`(재대결표 240줄) · `gen:poketchmap`(포켓치 지도 위의 자리) ·
`gen:easychat`(낱말 1,495개의 무리) · `gen:charmap`(문자표) · `gen:scriptMeta` ·
`gen:spriteTable` · `gen:trainerClasses` · `gen:trainerBgm` · `gen:berryInit` ·
`gen:itemTable` · `gen:eggMoveTable` · `gen:pokeIconTable` · `gen:otherpokeTable` ·
`gen:spawnTable` · `gen:tutorMoves` · `gen:hiddenItems`(숨은 도구 257개) ·
`gen:moveAnim`(기술 연출 대본 468개) · `gen:distortionTables`(깨어진 세계의 코드 표
일곱 칸) · `gen:trainerModels`(BDSP 쪽, 파이썬).

⚠️ **큰 표는 정적 import 하면 안 된다.** `moveAnimTable.ts` 하나가 178KB라 첫
청크에 얹히면 앱 셸 예산(첫 청크 gzip 150kB)을 그 자리에서 깬다 — 부르는 자리
하나에서 `await import`로 집는다. 어느 청크에 붙었는지는 `pnpm provenance`가 본다.

굽는 파일 머리에 **「손으로 고치지 않는다」**를 적는다. 담기는 것은 번호와
수뿐이고 이름도 글도 한 바이트도 안 담는다 (COPYRIGHT §5).

### 2.5 메뉴 화면 하나

1. `ui/menu/<이름>Screen.tsx` + `<이름>.css.ts`
2. `state/menuStore.ts`의 `MenuScreen` 합집합에 이름 추가
3. `ui/menu/MenuLayer.tsx`의 `switch`에 한 줄
4. 틀은 `MenuScreen` 컴포넌트, 키는 `useMenuKeys`, 목록이 길면
   `scrollIntoView`를 커서 줄에 건다 — 없으면 커서가 화면 밖으로 사라진다

### 2.6 글

**한 글자도 짓지 않는다.** 롬의 대사 뱅크에서 온다
(`public/data/dialogue/<로케일>/<미국뱅크번호>.json`). 스크립트가 안 가리키는
화면의 글은 `tools/extract/dialogue.js`의 `EXTRA_BANKS`에 이름을 적어야 실린다.

⚠️ **예외가 하나 있고 하나뿐이다 — 시원**(`engine/world/siwonText.ts`). 원작
사람이 아니라 **우리가 덧붙인 사람**이라 원작인 척할 위험이 없고, 우리 글이라
배포물에도 실린다. 왜 그 하나만인지는 [SIWON.md](SIWON.md) §4가 정본이다.
**여기를 근거로 다른 자리에 글을 짓지 않는다.**

### 2.7 「남은 일」 한 줄

**[STATUS.md](STATUS.md)에 직접 적지 않는다.** 그 파일은 생성물이고 다음
`pnpm status`가 손으로 적은 줄을 지운다. **임자 문서에 적으면 따라온다:**

| 어떤 갈래인가 | 어디에 적나 | 표식 |
|---|---|---|
| 원작에 있는데 우리는 반쯤이거나 없다 | [PARITY.md](PARITY.md) | 행 둘째 칸에 `◐`·`✖` |
| 화면에 3D로 안 선다 | [3D_GAP_AUDIT.md](3D_GAP_AUDIT.md) §5 | `- [ ]` |
| 우리가 만든 자리가 어긋났다 | [REPAIR.md](REPAIR.md) §0 표 | 행 하나 |
| 알고 남겨 둔다 (무엇을 재면 되는지까지) | [PLAN.md](PLAN.md) §16.10 표 | 행 하나 |
| 공개 배포를 막는다 | `tools/distribution/blockers.mjs` | `resolved()`로 **직접 재는** 항목 |

⚠️ **마지막 줄만 문서가 아니라 코드다.** 배포를 막는 것은 사람이 지우는 목록에
두면 안 된다 — 재서 풀렸으면 스스로 빠져야 한다.

⚠️ **잰 수를 두 문서에 적지 않는다.** 설치 총량·파일 수·설치 시간은
[DEPLOY.md](DEPLOY.md) §5의 ⑮ 한 줄이 임자고, 다른 곳에서는 **그리로 건다.**
한때 다섯 문서가 같은 수를 베껴 적고 있었고 다 낡아 있었다.

---

## 3. 무엇을 고치면 무엇이 깨지는가

**수를 문서에만 적으면 조용히 낡는다.** 그래서 아래 수들은 시험이 못 박고 있다 —
값이 바뀌면 시험이 서고, **왜 바뀌었는지 설명한 뒤에 문서도 같이 고친다.**

| 고친 것 | 깨지는 시험 | 같이 고칠 문서 |
|---|---|---|
| 스크립트 명령 | `engine/script/vm.test.ts` · `argWidth.test.ts` | PARITY §1.17·§10 · DATA §2.10 |
| 도구 아이콘 아틀라스 | `data/items.test.ts` · `import/platinum/convert.test.ts` | DATA §2.12 |
| 대사 뱅크 | `data/dialogue.test.ts` · `engine/script/text.test.ts` | — |
| 추출 산출물 추가 | `data/assetManifest.test.ts` | DATA |
| 게임이 읽는 논리 경로 · 그룹의 `outputs` | `data/assetContract.test.ts` | IMPORT §6 |
| 걸음을 세는 자 · 지나온 칸 | `engine/actor/stepTrace.test.ts` | PARITY §1.1 |
| 방 안으로 물리는 카메라 | `engine/actor/camera.test.ts` · `scene/roomWalls.test.ts` | PARITY §6.2 |
| 리포트 스키마 | `state/saveStore.test.ts` · `save/migrate` 시험 | — |
| 디컴프에서 구운 표 | 그 표의 `*.test.ts` (모양과 수) | PARITY의 해당 절 |
| 조명 프리셋·광원 방향 | `scene/fx/sky.test.ts` (면빛 비율) | PLAN §6.2 · 깨어진 세계는 PARITY §6.10 |
| 필드 카메라 거리·화각 | `engine/actor/camera.test.ts` (방으로 물리는 규칙). 렌즈 값 자체는 화면으로 잰다 — `.audit/voidShots.mjs` · `.audit/distortionLook.mjs` | PARITY §6.2 · §6.10 |

⚠️ **`.audit/`는 Git에 없고 시험 모음에도 안 들어간다.** 거기 있는 것은
**한 번 재보는 자**다 — 명령이 어느 파일에서 몇 자리를 먹는지
(`scriptGap` · `cmdWhere` · `gapBuckets`), 결손이 어느 맵에 있는지(`whereGap`).
새 수를 재야 하면 여기에 만들고, 그 수가 계속 지켜져야 하면 `src/` 안의 시험으로
옮긴다.

---

## 4. 자주 밟는 함정

여기 있는 것은 **실제로 한 번씩 밟은 것들**이다. 자세한 근거는 각 절에 있다.

| | |
|---|---|
| `?.` 뒤에서 인자 읽기 | 서비스가 없으면 읽기 위치가 안 움직인다 (§2.1) |
| 「없다」를 답 안 하기 | 결과 변수에 앞 갈래 값이 남아 문이 우연히 열린다 (PARITY §9.2) |
| 공용 스크립트에 **지역 칸을 먼저** 적기 | `start()`가 첫머리에서 지운다 — 문맥을 세운 **뒤에** 적는다. 「없음을 손에 넣었다!」가 그 증상이다 (SIWON §7) |
| 끝난 스크립트의 **글 뱅크를 안 내려놓기** | 다음 스크립트가 남의 뱅크에서 같은 번호를 읽는다. 글자는 멀쩡히 나와서 눈으로 지나간다 (DATA §2.10) |
| 두 추출기 중 하나만 고치기 | 자기 롬으로 설치한 사람에게만 빈 화면 (§1) |
| **같은 것을 그리는 코드를 두 벌로 두기** | 한쪽만 고쳐져서 화면이 갈린다. 소품 재질이 두 벌이라 로토무 방 벽이 회색 대신 **흰색**으로 섰고, 시험 3,543개가 그걸 다 통과했다 — 재질 색은 화면이라 vitest가 안 본다 (REPAIR §9 · DATA §2.2) |
| 능력 차례 뒤집기 | 저장 차례는 HP·공격·방어·**스피드**·특공·특방이다 (DATA §2.24) |
| 종족 이름 배열과 표 자리 헷갈리기 | 이름 배열은 종족 번호, 표는 그 −1인 자리가 있다 |
| 긴 목록에 `scrollIntoView` 빼기 | 열일곱 줄 너머로 내려가면 커서가 안 보인다 (§2.5) |
| 리포트 칸을 가운데 끼우기 | 검사합이 깨진다 (§2.2) |
| 「안 만든 것」과 「안 만들기로 한 것」 섞기 | 계통표에서 같은 줄로 보인다 — 후자는 명령을 만들어 **아무 일도 안 하게** 둔다 |
