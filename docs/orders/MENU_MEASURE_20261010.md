# 메뉴 개편 — 굽기와 실측 (P0b, 2026-10-10)

`.audit/menu-ui/SYSTEM.md` §5 P0b의 「잴 것」 다섯과, 이번에 새로 구운 그림 · 표의 **읽는 법**이다. 디컴프는 `raw/decomp`, 롬은 세 지역판(CPUE · CPUK · CPUJ)을 직접 열어 쟀다.
색은 롬의 15비트 팔레트를 `(v << 3) | (v >> 2)`로 펴서 적었다. 디컴프 `.pal` 텍스트는 `v × 8 + 6`으로 적혀 있어 채널마다 1씩 다르다(`#ef2110` ↔ `#ee2010`).

## 1. 잰 값

### 1.1 PP 색 (`pp.half` · `pp.quarter` · `pp.out`)

- 팔레트: `pl_batt_obj.narc` **72번 칸 = `type_icons/shared`가 아니라 `interface/shared.NCLR`**(`sprites.order` 73줄 − 1). 한 벌이 7줄이다 (`battle_subscreen.c:1066`, `… spriteNarc, 72, 0, 7 …`).
- PP 글자는 그 팔레트의 **4번 줄**(`BattleSubscreen_NewFontOAM(…, textColor, 4, …)`, `battle_subscreen.c:1583-1584`)에서 `TEXT_COLOR(글자, 그림자, 0)`의 두 번호로 색을 집는다.
- 고르는 규칙은 `GetPPTextColor` (`battle_subscreen.c:2890-2921`):

| 상태 | `TEXT_COLOR` | 글자 | 그림자 | 조건 |
|---|---|---|---|---|
| 보통 | (1, 2) | `#394239` | `#738c73` | PP가 가득이거나, 아래 어느 것도 아닐 때 |
| 절반 `pp.half` | (3, 4) | **`#8c6b10`** | `#ffe708` | 최대 8 이상이면 현재 ≤ ⌊최대 / 2⌋. 최대 3~7이면 현재 = 2 |
| 사분 `pp.quarter` | (5, 6) | **`#b54200`** | `#ff8400` | 최대 8 이상이면 현재 ≤ ⌊최대 / 4⌋. 최대 1~7이면 현재 = 1 |
| 바닥 `pp.out` | (7, 8) | **`#940021`** | `#ff6b6b` | 현재 0 (가장 먼저 본다) |

- 세 지역판의 72번 칸은 바이트까지 같다.
- 3~8번 색이 정확히 이 셋의 글자 · 그림자 여섯이다 (SYSTEM §1.2의 「색 3~8」이 맞다).

### 1.2 `WaitDial` 주기

- 한 걸음 = **16 VBlank**, 한 바퀴 = 8걸음 = **128 VBlank** (`render_window.c:46` `WAIT_DIAL_FRAME_COUNT 8`, `:707` `counter == 16`, `:709` `(curFrame + 1) & 7`).
- 태스크가 `SysTask_ExecuteOnVBlank`로 서므로(`:655`) **VBlank마다** 돈다 — 필드 프레임 30 Hz와 상관없다 (`system.c:36-41`의 `VBlankIntr`가 VBlank 인터럽트에서 부른다).
- VBlank는 59.8261 Hz다 (33.513982 MHz ÷ (263줄 × 355점 × 6)). **하드웨어 상수라 디컴프에 없다.** 한 걸음 ≈ **0.267 초**, 한 바퀴 ≈ **2.14 초**.

### 1.3 시작 메뉴 아이콘 태스크의 프레임률

- 아이콘을 돌리는 것은 필드 태스크 `StartMenu_Main`이다. 매 호출마다 `StartMenu_AnimateSprites` → `Sprite_UpdateAnim(sprite, FX32_ONE)` — **호출 하나가 애니 한 프레임**이다 (`start_menu.c:508-511` · `:795-800`).
- 필드 태스크는 `RunApplication` 안에서 한 번씩 돈다 (`field_system.c:208` → `main.c:132`). 메인 루프는 한 바퀴에 `OS_WaitIrq(VBLANK)`를 **두 번** 기다린다 — 일이 한 VBlank 안에 끝나 `gSystem.frameCounter`가 0이면 `:136-137`에서 한 번, 이어 `:147`에서 또 한 번. `frameCounter`는 VBlank마다 오르는 값이다 (`system.c:40`).
- 그래서 일이 가벼울 때 **필드 태스크는 30 Hz**(= 59.8261 ÷ 2 ≈ 29.9)다. 일이 한 VBlank를 넘기면 `:136`의 첫 대기가 건너뛰어져 한 바퀴가 1 VBlank가 된다 — 이 경우는 쟀다기보다 **코드가 허락하는 쪽**이라 적는다. 시작 메뉴는 가벼운 장면이라 30 Hz로 본다.
- 롬이 정한 움직임(`startMenuIcons.json`): **부풀기** 5프레임 `[1, 3, 3, 3, 1]` = 11프레임 ≈ 0.37 초, 배율 1 → 1.1 → 1.3 → 1.1 → 1. **흔들기** 12프레임 × 2 = 24프레임 ≈ 0.80 초, 되풀이, 회전 0 → +4° → +8° → +10° → +8° → +4° → 0 → −4° → −8° → −10° → −8° → −4°.
- 프레임 수는 롬 NANR에서 읽은 값이고(두 굽는 쪽이 같다), **초 단위는 30 Hz 가정**이다.

### 1.4 `{COLOR 1}` / `{COLOR 2}`

- 코드: `{COLOR n}`이 글자 `2n + 1`번 · 그림자 `2n + 2`번이다 (`render_text.c:111-112`). 그러니 1 → (3, 4), 2 → (5, 6), 3 → (7, 8).
- **화면마다 글꼴 팔레트가 달라서 색이 갈린다.** 이름 그대로 「1 = 빨강 · 2 = 파랑」이 아니다.

| 화면 | 팔레트 | `{COLOR 1}` 글자 / 그림자 | `{COLOR 2}` 글자 / 그림자 | 근거 |
|---|---|---|---|---|
| 필드 대사창 | `pl_font.narc` 6번 `font.NCLR` | **`#ef2110`** 빨강 / `#ffadbd` | **`#29d618`** 초록 / `#9cef8c` | `field_message.c:22`, `FIELD_MESSAGE_PALETTE_INDEX 13` |
| 설정 | 같은 `font.NCLR` | 빨강 | 초록 | `options_menu.c:652`, 창 `.palette = 13` (`:939`) |
| 요약 | `pl_pst_gra`의 `tiles_main` 15줄 | **`#0073ff`** 파랑 / `#7bbdef` | **`#ef2110`** 빨강 / `#ffadbd` | 창 `.palette = 15` (`window.c:64~`), 로드 `main.c:515` |
| 파티 (이름 · 레벨 · HP 창) | `party_menu`의 `menu.NCLR` 0줄 | 파랑 `#0073ff` / `#7bbdef` | 빨강 `#ef2110` / `#ffadbd` | 창 `.palette = 0` (`windows.c:154~`), 로드 `main.c:933-936` |

- `font.NCLR`의 3 · 4 · 5 · 6 · 7 · 8번은 빨강 · 분홍 · 초록 · 연초록 · 파랑 · 연파랑이다. 글꼴 기본(1 · 2번)은 `#5a5a52` / `#adbdbd`.
- `font.NCLR`은 지역판마다 3종이 같은 색이다 (`pl_font.narc` 한국판은 칸이 둘 더 있지만 이 칸은 같다).
- **요약 · 파티의 값은 디컴프 `.pal`에서 읽었고 롬 펴기와 채널당 1 차이가 난다.** 위 표는 롬 펴기로 고쳐 적었다 (`#ee2010` → `#ef2110` 식). 한국판 롬에서 직접 안 쟀다.
- 현재 토큰 `emphasis.one = #c0301c`(빨강) · `two = #22459c`(파랑)은 **필드의 1번과 파티 · 요약의 2번**만 맞는다. 필드의 2번은 초록이고 파티 · 요약의 1번은 파랑이다. 이 화면들이 쓰는 `{COLOR n}` 구간은 실제로: 파티의 비전기술 이름 `{COLOR 1}…{COLOR 0}` (`res/text/party_menu.json` 786~794줄), 요약의 만난 자리 `{COLOR 1}` — 파티 · 요약 안에서는 **1번이 파랑**이다.
- 못 잰 것: 세이브 · 상점 · 박스 같은 다른 화면의 `{COLOR n}` 팔레트. 위 네 화면만 쟀다.

### 1.5 부화 띠 높이 (`egg_hatch`)

- 띠 그림 `black_bar` = **256 × 48 한 장, 전부 불투명한 검정** (`/demo/egg/data/egg_data.narc` 7번 NCGR · 6번 NCER 셀 하나 · 10번 팔레트 0줄, 줄마다 256픽셀 전부 칠해짐을 쟀다).
- **위와 아래 띠가 높이가 다르다.** 위 띠는 `y = -16`에서 서서 **화면에 32줄** (`graphics.c:484`), 아래 띠는 `y = HW_LCD_HEIGHT − 48 = 144`에서 서서 **48줄** (`graphics.c:494`). 192줄 화면에서 **위 16.7 % · 아래 25 %**다.
- 걷히는 법: 알이 사라지고 10프레임 뒤(`main.c:513`) 위 띠는 프레임마다 −4, `y ≤ −48`이 되면 끝 (`:533`, 8프레임). 아래 띠는 +4, `y ≥ 192`에서 끝 (`:541`, 12프레임).- 그러므로 지금 「160 (추정)」은 **아래 띠 25 %(640 기준)만 맞고 위 띠는 107 (640 기준 16.7 %)**이다. 한 화면 640에 옮기면 위 107 · 아래 160이다.
- 한계: `black_bar`가 그려지는 엔진은 `GX 메인(A)`(위 화면)이라 아래 화면에는 없다 (`graphics.c:441` `NNS_G2D_VRAM_TYPE_2DMAIN`).

## 2. 굽는 쪽 둘의 산출물 (읽는 법)

모두 `tools/extract/*.js`(노드)와 `src/import/platinum/*.ts`(브라우저)가 **같은 픽셀 · 같은 바이트**를 낸다 (`menuAssets.test.ts`가 세 롬으로 맞댄다). 노드 쪽은 `public/data/`에 쓴다.

| 로더 이름(권장) | 파일 | 모양 | 칸 번호 |
|---|---|---|---|
| `typeIcons` | `data/typeIcons.{en,ko,ja}.png` | 32×16 × 18칸 가로 (576×16). **지역판마다 글자가 다르다** — 한국판이 `노말 · 격투 · 비행…` | **엔진 타입 번호** (0 노말 … 9 ??? … 17 악) |
| `moveClass` | `data/moveClass.png` | 32×16 × 3칸 가로 (96×16). 세 롬이 같다 | 0 물리 · 1 특수 · 2 변화 (`CLASS_*`) |
| `startMenuIcons` | `data/startMenuIcons.{en,ko,ja}.png` + `data/startMenuIcons.json` | 64×329. 왼쪽 32 컬러 · 오른쪽 32 회색, 칸 간격 33. **한국판만 5번(설정) 칸이 다르다** | 도감0 · 포켓몬1 · 가방(남)2 · 카드3 · 리포트4 · 설정5 · 닫기6 · 채팅7 · 포기8 · 가방(여)9. json은 움직임 |
| `dexShapes` | `data/dexShapes.png` | 32×32 × 14칸 가로 (448×32). 세 롬이 같다 | `FilterForm` − 1 (네발 · 두발(꼬리 없음) · 두발(꼬리) · 뱀 · 날개 여럿 · 날개 · 곤충 · 머리와 몸 · 머리와 팔 · 머리와 다리 · 촉수 · 지느러미 · 머리 · 여럿) |
| `dexHeightWeight` | `data/dexHeightWeight.json` | `{count: 494, height[], weight[], male{trainerScale,pokemonScale,trainerPos,pokemonPos}, female{…}, giratinaAltered{…}}` | 키 데시미터 · 몸무게 헥토그램. 배율값 256 = 1배(그림 배율 = 256 ÷ 값), 자리는 `88 + 값` (`pokedex_height_check.c:383` `:480` `:515`). 기라티나 기본 표는 **오리진폼**(6.9m · 650kg)이고 어나더(4.5m · 750kg)는 `giratinaAltered` |
| `townMapPlayer` | `data/townMapPlayer.png` | 16×16 × 2칸 (32×16) | 0 남 · 1 여 (`trainerGender`) |
| `mailArt` | `data/mailArt.png` | 256 × 2304 (256×192 열두 장 세로). 세 롬이 같다 | 편지 종류 = `item − ITEM_GRASS_MAIL`: 풀 · 불꽃 · 물방울 · 꽃 · 터널 · 철 · 하트 · 눈 · 우주 · 항공 · 모자이크 · 벽돌. 0번 색은 뒤판 색으로 불투명 |
| `berryArt` | `data/berryArt.png` | 512×512, 64×64 × 8×8. 0번 색 투명. 세 롬이 같다 | 열매 번호 `n` → `((n % 8) × 64, ⌊n / 8⌋ × 64)` |
| `diplomaArt` | `data/diplomaArt.png` | 512×384. 왼쪽 신오 · 오른쪽 전국. 위 192줄 **바탕** · 아래 192줄 **종이**(0번 색 투명) | 종이가 바탕 위에서 위 화면 → 아래 화면으로 192줄 미끄러진다 (`diploma.c:330-336`) |
| 대사 뱅크 645 | `data/dialogue/{en,ko,ja}/645.json` | `TEXT_BANK_MOVE_REMINDER` | 개발판 `dialogue.js`의 `EXTRA_BANKS`에 더했다. 브라우저 변환기는 이미 통째로 싣는다 |

| BDSP 진화 · 부화 (`battleFx`) | `data/fx/prefab/ef_f_evolution_*.json` 아홉 · `sd9120_*.json` 열일곱 · `data/fx/model/ew121_egg00.glb` · `data/fx/index.json`의 `evolution` · `hatch` · `eggModel` | 굽는 쪽이 하나다(`import/bdsp/fx.ts`를 설치기와 노드 `bdspFx.mjs`가 같이 돈다). `GROUP_FORMAT.battleFx` 3 → **4** — 이미 깐 사람은 이 그룹을 다시 굽는다 | 시퀀스 번호 `sd9120`이 부화, `ef_f_evolution`이 진화 |

- `trainerCase` 그룹은 `card.png` · `case.png`를 더 안 굽는다 (`index.json` 의 `card` 상자와 `text` 색은 그대로). `converter` 판을 2로 올렸다.
- 새 그룹 여덟(`typeIcons` · `startMenuIcons` · `dexShapes` · `dexHeightWeight` · `townMapPlayer` · `mailArt` · `berryArt` · `diplomaArt`)을 `convert.ts` · `required.ts` · `groupLabels.ts` · `tools/assets/groups.mjs` · `package.json`에 등록했다. **`gameData.ts`의 로더(`pinAtlas` 등)는 P0a가 단다** — 그때 `assetContract.test.ts`가 위 파일 이름이 읽는 쪽과 짝이 맞는지 본다.

## 3. 못 한 것 · 남은 것

- ⑫ 알 모델은 `ew121_egg00` 하나만 구웠다(정점 689 · 재질 하나, **그림이 없다** — 번들에 Texture2D가 없다). 같은 폴더의 `ew135_egg01_all` · `ew135_egg02_ue` · `ew135_egg03_sita`(알 통째 · 위 · 아래)는 껍질 갈라짐에 맞는 후보로 보이나 **굽지 않았고 쓰임은 열어 보지 않았다**.
- `{COLOR n}`은 네 화면만 쟀다 (§1.4).
- 시작 메뉴 30 Hz는 코드 읽기 + 하드웨어 상수로 정했다. 실기에서 프레임 수를 센 값이 아니다.
