# 밤샘 스토리·스크립트·로직 검토 (2026-10-25 밤) — 검토자 공통 안내

사용자 지시: 원작 플래티넘에는 없고 Radiant Platinum 에만 있는 스토리·스크립트·로직을 전부 확인해, 정말 아무 문제 없이 돌아가고,
의도한 대로 이야기가 진행되며, 다른 곳으로 새거나 버그가 날 가능성이 전혀 없는지 소넷 검토자가 밤새 검토·보고·반복한다.

## 역할

- 검토자(너)는 **읽고, 재현하고, 보고만** 한다. `src/`·`tools/`·`docs/`·`raw/`·`public/` 는 고치지 않는다. 고치기는 조율자가 한다.
- 재현용 시험·스크립트는 `.audit/overnight-20261025/probes/<너의 영역>/` 에만 만든다(Git 밖).
- 보고서는 지정된 경로 하나에 **한국어**로 쓴다: `.audit/overnight-20261025/r<회차>-<영역>.md`.
- 금지: 개발 서버·브라우저·playwright 띄우기(`pnpm dev/story/journey/shot` 포함) · `git commit/stash/reset/checkout/clean` · 파일 삭제(`rm -rf`) ·
  다른 node 프로세스 끄기 · `raw/` 쓰기. 다른 LLM이 같은 트리를 쓸 수 있다.
- 오래 걸리는 명령은 timeout 을 넉넉히 주고 `| tail` 로 걸지 말고 파일로 흘린다.

## 「의도」의 근거 (먼저 읽기)

- **`docs/SIWON.md`** — 시원의 배포 사슬. 원작에 없는 사람·글·순서의 정본. (규칙이 여기서만 뒤집힌다 §4)
- **`docs/PARITY.md`** §9(범위 밖·통신을 원작의 말로 닫기 §9.4·배틀팩토리 §9.3·리본신드롬 §9.2) · **§12(원작에 없는 것을 더한다: 연결의 끈·고운 비늘·지닌 도구 진화·장막백화점 4층 창구·BP 교환 코너·조각)**
- **`docs/BUGS.md`** — 원작 버그를 고쳐 옮긴 것(§1) · 옮기면 안 되는 것(§2)·사양(§3)
- **`docs/REPAIR.md`** — 이미 찾아 고친 것. **다시 보고하지 말고**, 고친 게 제대로인지는 확인한다. 보고하기 전에 `grep -n 키워드 docs/REPAIR.md` 로 겹치는지 본다.
- **`docs/CODEMAP.md`** §1.1(계통 → 자리) · §2(만들 때 건드릴 파일)
- 원작 근거: `raw/decomp/`(pret/pokeplatinum 디컴프 — `res/field/scripts/*.s`, `src/`), `raw/decomp-derived/`, 롬은 `raw/roms/`.
  값은 **디컴프로 맞댄다.** 기억이나 위키로 단정하지 않는다.
- 사용자 결정(바꾸지 않는다): 통신·콘테스트·지하통로·리본신드롬은 범위 밖 / 배틀프런티어는 팩토리만 연다(타워·스테이지·캐슬·룰렛은 문 앞에서 안내) /
  이상한사탕은 필드에서 원작대로 쓴다 / 로토무·다크라이·쉐이미·아르세우스·레지기가스·마나피·화강돌은 시원이 건넨다 /
  Pt에 없는 아이템은 시리즈가 나중에 내놓은 답(연결의 끈·고운 비늘)만 빌린다.

## 「RP 에만 있는 것」 지도

| 계통 | 어디 |
|---|---|
| 시원(배포 사슬 7선물 · 복도 기습 등장 · 축복맨션 2F) | `src/engine/world/siwon*.ts` · `src/engine/script/siwonScene.ts` · `scene/fieldServices.ts`(`party.giveFateful`) · `state/save/{schema,migrate}.ts`(`siwonGiven`·`siwonMet`) · `engine/script/commands.ts`(`CheckPartyHasFatefulEncounterRegigigas`·`CheckDistributionEvent`) |
| 시원이 여는 원작 스크립트 | 로토무 방 · 신월섬(다크라이) · 꽃의 낙원(쉐이미·그라시데아) · 창기둥→시작의 방(아르세우스·하늘빛피리 `script/azureFlute.test.ts`) · 레지 유적 셋 · 마나피 알 · 209번도로 화강돌 |
| 통신·팔파크·미스터리기프트·유니온룸·GTS 닫기(명령 33개가 「안 된다」를 답함) | `src/engine/world/comm.ts` · `script/comm.test.ts` · `map/world.ts`(`TILE_BEHAVIOR_SCRIPT_ONLY_WARP`) |
| 배틀프런티어 시설 넷 막기 · 망원경 | `src/engine/world/frontierGate.ts` · `warpSystem` |
| 콘테스트·지하통로·리본신드롬 접기 | 안 만든 명령은 인자 폭만큼 건너뛴다(`buildCommands`의 `skipper`) — PARITY §9.1·§9.2·§10 |
| 배틀팩토리 · BP 교환 코너 · 조각 BP | `src/engine/frontier/*` · `state/factoryStore.ts` · `ui/menu/FactoryScreen.tsx` · `engine/bag/frontierMart.ts`·`shards.ts` |
| 연결의 끈 · 고운 비늘 · 지닌 도구 진화 · 장막백화점 4층 창구 | `src/engine/pokemon/evolution.ts` · `engine/bag/{evolutionCounter,extraItems}.ts` |
| 원작 버그를 고쳐 옮김(낚시 2배 · 자력/정전기 물 · IV 유전 · KO 교체 AI · HM05 팔레트) | BUGS §1 의 자리 |
| 이상한사탕 필드 사용 · 필드 도구 25갈래 | `engine/bag/{rareCandy,fieldUse}.ts` · `ui/menu/itemAction.ts` |
| 휴대용 리포트 `.rpsave` · 자동 저장 · 이주(migrate) | `src/state/saveStore.ts` · `state/save/*` (지금 `SAVE_VERSION` 41) |
| 한 화면으로 접은 UI(포켓치·가방·팩토리 고르기) | `ui/menu/*` — BDSP 배치 |

## 헤드리스 재현 방법 (측정해 둔 것)

- 단위·필드 계층 시험: `npx vitest run <파일...>` — 시원·통신 두 파일은 1.5초. 전체는 `npx vitest run`.
- 스크립트를 실제로 걷는 틀: `src/engine/script/services.testkit.ts` · `script/comm.test.ts` · `world/siwon.test.ts` · `script/regiRuins.test.ts` · `script/azureFlute.test.ts` 를 본보기로 삼는다.
- **너의 탐침 시험 돌리기**: `.audit/overnight-20261025/probes/<영역>/<이름>.probe.test.ts` 에 쓰고
  `npx vitest run --dir .audit/overnight-20261025/probes/<영역>` 으로 돌린다 (src 를 `../../../../src/...ts` 로 import — 측정해 둠).
- 그 외 탐침은 `.audit/probe/*.mjs` 본보기대로 `node --experimental-strip-types <파일>`.
- 자료: `public/data/` 는 개발 기계에 이미 있다(추출 산출물). 없다고 나오면 보고만 하고 멈춘다 — 직접 `pnpm extract` 를 돌리지 않는다.
- 확인 지점 저장: `pnpm saves` 로 굽는 86자리 `.rpsave` 는 굽는 도구가 브라우저를 쓰므로 **돌리지 않는다.** 이미 있는 것이 있으면 읽기만 한다(`.audit/` · `saves/`).

## 무엇을 찾나 (우선순위)

1. **진행 불가·멈춤** — 스크립트 오류로 멈춤 · 끝나지 않는 대기 · 길이 영영 막힘(소프트락) · 저장·이어하기 뒤 상태 어긋남 · 갇히는 칸.
2. **이야기 새어 나감** — 순서를 건너뛰거나 거꾸로 하면(날기·파도타기·전멸·다른 길·이어하기·저장 후 다시 열기·시간대·요일·성별·언어·스타터)
   의도와 다른 상태가 되는 경우. 같은 보상 두 번 · 영영 못 받는 보상 · 사라지지 않거나 다시 나타나는 인물 · 이미 끝난 장면 재생 ·
   범위 밖으로 접은 자리에 걸어서 들어가는 우회로.
3. **원작 흐름 파손** — 덧댄 조건이 넓어 원작 스크립트·대사·인물을 엉뚱한 때 바꾸는 것. 건너뛴 명령이 이야기에 필요한 변수·깃발을 쓰는 것.
4. **의도와 코드가 다름** — 문서(SIWON·PARITY §12)가 말한 것과 실제 코드가 어긋난 곳. 디컴프와 맞댔을 때 값·조건·순서가 다른 곳.
5. 글 오류(빈 이름 칸 · 남은 부호 · 롬에 없는 지명·이름 · 세 언어 중 하나만 빠짐 · 받침 조사).

## 보고 형식

항목마다:
- `[확인됨]` 또는 `[의심]` (확인됨 = 헤드리스 재현이나 코드 경로를 줄 단위로 끝까지 따라가 증명함)
- 심각도: 치명(진행 불가) / 높음(이야기 어긋남·보상 꼬임) / 중간 / 낮음
- 재현 조건(저장 상태·행동 순서) · 관련 `파일:줄` · 근거(코드·디컴프 줄) · 고치는 방향 제안
마지막에 「확인했지만 문제없음」 목록(무엇을 어떻게 확인했는지 한 줄씩)도 쓴다 — 다음 회차가 겹치지 않게.
**사실 주장은 직접 잰 것만.** 읽다 보니 그럴 것 같다는 「의심」은 의심으로 적고, 확인됨으로 올리지 않는다. 못 읽은 것·못 돌린 것은 「미실행」으로 적는다.
