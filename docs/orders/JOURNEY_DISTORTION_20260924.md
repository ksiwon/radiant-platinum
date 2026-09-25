# 배지 7 뒤 → 깨어진 세계 → 기라티나(마스터볼) → 탈출 — 대표 구간을 넓힌다

사용자가 정한 끝: **깨어진 세계를 깨고 마스터볼로 기라티나를 잡고 깨어진 세계를 나온다**(송별의 샘에 선다).
여덟째 배지(전진)는 이 구간에 없다 — 어느 문도 배지 8을 안 본다(아래 롬 §1).

- **롬 순서** — `raw/decomp`를 읽어 세운 차례(이 문서 아래 「롬 순서」 절 전부). 번호 셈은
  `JOURNEY_BADGE67` §2.1과 같고 검산 다섯이 맞는다. 길에 드는 비전기술은 구운 격자를 너비 우선으로 잰 값이다
  (격자가 2D라 층이 겹치는 자리는 틀릴 수 있다).
- **판 측정 규칙은 앞 구간과 같다** — 방향키/A/B/화면 버튼만, 읽기만, 사탕은 가방에 넣는 것만 개발 모듈.

## A. 한 줄 요약 — 무엇이 이 구간을 막는가

| | 무엇 | 누구 몫 |
|---|---|---|
| ① | **락클라임이 필수가 됐다** — 예지호수근처 · 천관산 1F 남·바깥·4F. 비전머신08은 217번도로 (296,305) 도구 볼 | 하네스 (계획·타기) |
| ② | **워프 패널** — 아지트 1F·2F·3F와 천관산 2F·4F가 같은 맵 안 워프로 이어진다. 걸어서는 없는 길 | 하네스 (계획) |
| ③ | **아지트는 한 번에 안 끝난다** — 열쇠를 얻은 뒤 밖으로 나가 **정문**으로 다시 들어와야 4F에 닿는다 | 하네스 (다리) |
| ④ | **깨어진 세계는 맵 격자가 아니라 떠 있는 판이 길이다** — 벽·천장 걷기 · 3칸 뛰기 · 엘리베이터 · 폭포 · 바위 퍼즐 | 하네스 (판 위 계획 — 따로 짠다) |
| ⑤ | **마스터볼을 던져야 한다** — 기라티나전은 야생이라 볼·도망이 되고, 쓰러뜨리면 「쓰러뜨림」 갈래로 간다 | 하네스 (볼 고르기) |
| ⑥ | 창기둥 **그런트 둘 2대1**과 **라이벌 태그 배틀**은 원작 형식 그대로 2대2로 돈다(REPAIR §82 · §120~§123 — 파트너 AI `AI_FLAG_TAG_STRATEGY`, 트레이너별 파티·도구·AI). 판으로 쟀다(full1·full2) | 제품 (고침) |
| ⑦ | 물 위·자전거 위 리포트는 이어하기에서 그 상태로 선다(REPAIR §87) | 제품 (고침) |
| ⑧ | **깨어진 세계 엔진·스크립트 결함** — 배틀 뒤 `OnLoad`(§88) · `CheckWonBattle`(§89) · 롬 좌표(§90) · 워프 초기화·사건·높이·벽·바위·카메라(§100~§116) · `OnResume`(§117) · `enterMap` 두 번(§118) · 이어하기 높이(§119) · 사건 발판 가운데(§124) · 괴력 표식(§125) · 맵 지역 표식(§126) | 제품 (고침) |
| ⑨ | 하네스 — 뛰기·턱 누름을 착지까지 쥔다 · 문 고를 때 이 다리의 비전기술 · 스크립트 워프 기다리기 · 깨진 창기둥 난천 · 되풀이 걸음 잡기 · 층마다 리포트 · 배틀 가방 열림 확인 · 깨어진 세계 안 사탕(`--candy`) | 하네스 |

## B. 하네스에 넣은 것 (2026-09-24)

- `route.mjs` — `planPath`의 **락클라임 걸음**(`climb` · `climb:방향` 한 걸음이 벽 너머 한 칸) · **워프 패널 걸음**
  (`panelsOf` · `warp:방향` 한 걸음이 짝 칸, 기본 켬 — 패널이 있는 맵은 천관산 2F·4F · 아지트 1F~3F · 268뿐이다).
  시험: `route.test.mjs` 「락클라임과 워프 패널」.
- `drive.mjs` — `setClimb` · `climbStart`(돌아서서 A · 예 · 벽 너머에 멈출 때까지) · `panelStep`(밟자마자 손을 뗀다) ·
  `walk`가 두 걸음에서 끊어 탄다 · `throwBalls`의 `ball`(도구 번호로 줄을 찾는다 — 마스터볼 1).
- `observe.mjs` — `storyVars`에 이 구간의 변수·깃발(아래 롬 §3).
- `badgesDW.mjs` — 다리 `candiceToAcuity` · `veilstoneHQ` · `coronetToSpear` · `catchGiratina`. 탐침 `_dw.mjs`.
- 깨어진 세계 판 위 계획은 따로 짠다(`distortionSolve.mjs` · `DISTORTION_HARNESS.md`).

## C. 제품 점검 — 이 구간 (근거는 조사 보고)

- 이 구간 스크립트 약 80개가 쓰는 명령 128종은 **모두 처리기가 있다**(`commands.ts`의 `skipper`로 새는 것 0).
  빈 처리기(보이는 것만 빈다): 자유 카메라 이동 · `ScrCmd_20D` · `ScrCmd_2FB`·`DoDWWarp`·`SetSubScene63`(창기둥 영상) —
  바로 뒤 `Warp`가 사람을 옮기므로 이야기는 이어진다.
- 워프 패널은 보통 밟는 워프로 돈다 — 도는 연출이 없다. 아지트·천관산 4F~6F·창기둥의 색조·안개(날씨 26·29·13)는 맑음으로 떨어진다.
- 창기둥 두 배틀은 원작 형식이다 — `StartTrainerBattle`이 둘째 상대를 들고 가고(2대1), `StartTagBattle`이 라이벌을 파트너로 세운다(태그) (REPAIR §82 · §120~§123).
- 마스터볼은 늘 잡는다(`capture.ts` 138) · 기라티나전은 야생 배틀(`fieldServices.ts` 1661) · 잡으면 결과 4로 스크립트가 「잡았다」 갈래.
- 탈것 상태는 세이브에 있다(`position.avatar` · REPAIR §87).

---

# 롬 순서 (조사 — `raw/decomp` 읽기만)

## 0. 번호 셈 검산

`generated/vars_flags.txt`를 C 열거형으로 셈(이름만 있으면 앞+1, `= X`면 X의 값; `VARS_START = 16384`, `SCRIPT_LOCAL_VARS_START = 32768`).
검산 다섯 모두 일치: `VAR_ETERNA_CITY_STATE` 16506 · `FLAG_RECEIVED_EXPLORER_KIT` 121 · `VAR_PASTORIA_CITY_STATE` 16508 ·
`VAR_CANALAVE_CITY_STATE` 16504 · `FLAG_RECEIVED_CANDICE_TM72` 158.

- 맵 번호 = `generated/map_headers.txt` 줄 − 1 (0 = EVERYWHERE). 한글 = `maps.json`의 `label` → `names/locations.ko.json`.
- 도구 번호 = `generated/items.txt` 줄 − 1 (0 = ITEM_NONE). 비전머신02=421, 03=422, 04=423 으로 앞 문서와 같다.
- 트레이너 번호 = `generated/trainers.txt` 줄 − 1 (0 = TRAINER_NONE). 오브젝트 스크립트 = 3000 + id − 1 (`src/script_manager.c:501`).
- 오브젝트 `script` 필드 N = 그 맵 스크립트 파일의 N번째 `ScriptEntry`.

## 1. 한눈 순서

| # | 자리 (맵) | 트리거 | 핵심 변화 |
|---|---|---|---|
| A | 선단시티(165) | 없음 — 무청 뒤 선단에서 도는 이야기 장면은 0 | 무청 전투가 `FLAG_HIDE_VEILSTONE_GALACTIC_GRUNTS`(447) 세움 |
| B | 217번도로(385) | 보이는 도구 (296,305) | **비전머신08 락클라임(427)** 획득 — 이제 필수 |
| C | 예지호수근처(340) → 예지호수(318) | 락클라임으로 북쪽 → 워프 (308/309,229) | — |
| D | 예지호수(318) | 프레임 표 `VAR_LAKE_ACUITY_STATE`(16595)==1 | 쥬피터·라이벌 장면(대사만) → 16595=2, 장막 그런트 숨김(547) 해제 |
| E | 장막시티(132) | 그런트 (721,593) 말 걸기 → 핸섬 「예」 | `VAR_VEILSTONE_CITY_GALACTIC_WAREHOUSE_STATE`(16671)=3 |
| F | 갤럭시 창고(143) | 좌표 (8~9,8) 16671==3 | 핸섬이 문을 연다 → 16671=4 |
| G | 아지트 B2F→B1F→1F→2F→1F→B2F | 워프 패널 미로 | **갤럭시단의열쇠(440)** (B2F 20,5) |
| H | 밖으로 나가 **정문**으로 재입장 → 1F 문(열쇠) → 2F → 홀(연설, 강제) → 2F → 3F → 4F 문(열쇠) | 4F 좌표 (8~9,11) `VAR_GALACTIC_HQ_4F_STATE`(16598)==0 | **태홍 배틀** → **마스터볼(1)** |
| I | 연구소(497) → 제어실(494) | 새턴 말 걸기 → 배틀 → 버튼 (8,5) | 호수 셋 해방 `FLAG_FREED_GALACTIC_HQ_POKEMON`(2429), `VAR_MT_CORONET_2F_STATE`(16553)=1, 벽화 사라짐 |
| J | 천관산 1F 남(207) → 2F(208) → 3F(209) → 바깥 남(211) → 4F 방1·2(212) → 바깥 북(210) → 4F 방3(213) → 5F(214) → 6F(215) | 파도타기+락클라임(1F), 괴력(2F), 락클라임(바깥·4F) | 2F 핸섬 좌표(강제) · 벽화 구멍 워프 (7,23) |
| K | 창기둥(220) | 좌표 (31,48) 상태 0 → 그런트 2인 더블 / 좌표 (30~32,32) 상태 1 → 마스·쥬피터 태그(라이벌 동행) | 태홍 소환 → 깨진 창기둥(221)으로 강제 워프 |
| L | 깨진 창기둥(221) | 프레임 표 `VAR_SPEAR_PILLAR_DISTORTED_STATE`(16579)==1 | 난천 → 「예」 → 깨어진 세계 1F (55,40) |
| M | 깨어진 세계 1F~B7F(573~581) | ov9 진행 변수 `VAR_DISTORTION_WORLD_PROGRESS`(16469) 0→10 | B7F 태홍 배틀 |
| N | 기라티나 방(582) | 기라티나 말 걸기 | **기라티나(오리진) Lv47 야생** → 마스터볼 |
| O | 송별의 샘(267) | 포털 → 워프 (32,17) · 프레임 `VAR_EXITED_DISTORTION_WORLD_STATE`(16554)==1 | 난천 대사 → **16554=2 = 완료 표지** |

8번째 배지(전진)는 이 구간에 필요 없다 — 어느 문도 배지 8을 보지 않는다(폭포오르기만 배지 8, 경로에 폭포 없음 §8).

---

## 2. 단계별 상세

### A. 선단시티 — 무청 뒤 (165 선단시티 / 167 체육관)

- `scripts_snowpoint_city_gym.s:19-60` 무청: 배지, `SetFlag FLAG_HIDE_VEILSTONE_GALACTIC_GRUNTS`(447, 44줄), TM72 → `FLAG_RECEIVED_CANDICE_TM72`(158).
- `scripts_snowpoint_city.s` 전부 신전 경비(`FLAG_GAME_COMPLETED` 2404 필요)와 잡담뿐 — 이 구간 이야기 장면 없음. 선단 라이벌 장면 없음.
- 예지호수근처 OnTransition(`scripts_acuity_lakefront.s:27-36`): 고드름배지가 있으면 `FLAG_HIDE_SNOWPOINT_CITY_POKECENTER_1F_MAYLENE` 세우고 `FLAG_HIDE_VEILSTONE_CITY_GYM_MAYLENE` 지움(모양만).

### B. 비전머신08 락클라임 — 필수

- 217번도로(385, 「217번도로」) 보이는 도구 `LOCALID_ITEM_HM08` (296,305), script 7161, 숨김 깃발 `FLAG_OBTAINED_ROUTE_217_HM08`(1175)
  (`events_route_217.json:256-268`, `scripts_visible_items.s:1301`).
- 격자 BFS: 선단 센터 앞 (379,234)에서도, 217 남쪽 (302,377)에서도 **비전기술 없이** 닿는다.
- 앞 문서(§1 「필수가 아닌 것」)의 「217번도로 비전머신08」은 **이 구간부터 필수**로 바뀐다: 예지호수·천관산 둘 다 락클라임.
- 필드 사용 배지: `FieldMoves_CheckRockClimb` → `BADGE_ID_ICICLE` (`src/field_move_tasks.c:625-631`). 기술 번호 431.

### C. 예지호수근처(340, 「예지호수근처」) → 예지호수(318, 「예지호수」)

- 라이벌 좌표 장면 (310~311,244) `VAR_ACUITY_LAKEFRONT_STATE`(16516)==0 은 배지 7 구간에서 이미 1.
  대사 원문: 「울퉁불퉁한 바위는 선단 배지 없이 못 오른다」(`res/text/acuity_lakefront.json`).
- 격자 BFS: (310,245) → 호수 입구 (308/309,230) 최소 기술 = **{락클라임}** 하나.
- 워프 선택(`scripts_acuity_lakefront.s:12-25`): `FLAG_TEAM_GALACTIC_LEFT_LAKE_VERITY`(186)가 서 있으면 워프 0·1(LOW_WATER행)을 치우고 워프 2·3 → **LAKE_ACUITY(318)** 워프 3·4 = (14,50)/(15,50). (186은 진실호수 마스 뒤에 섰다.)

### D. 예지호수 장면 (318)

- `scripts_init_lake_acuity.s`: `InitScriptGoToIfEqual VAR_LAKE_ACUITY_STATE, 1, 1` → **들어서자마자** `LakeAcuity_CoordEvent_JupiterRival`(이름은 Coord지만 프레임 표로 돈다).
- 16595=1은 진실호수 마스 승리 때(`scripts_lake_verity.s:225`). 쥬피터 `FLAG_HIDE_LAKE_ACUITY_JUPITER`(442)도 그때 해제(224줄).
- 오브젝트: 쥬피터 (17,44), 라이벌 (17,45) (`events_lake_acuity.json`). 플레이어 x=14/15 두 갈래 이동만 — **배틀 없음**, 보기만.
- 끝(`scripts_lake_acuity.s:59-68`): `FLAG_ALT_MUSIC_LAKE_ACUITY`(2447) 세움 · **`FLAG_HIDE_VEILSTONE_CITY_GRUNT_M_STORAGE_KEY`(547) 해제** · 16595=**2** ·
  `FLAG_HIDE_SANDGEM_TOWN_LAB_PROF_ROWAN`(408) 해제 · 진실호수 동행/박사 숨김 · `FLAG_LAKE_VALOR_EXPLODED`(168) **해제**.
- 이 장면이 E의 그런트를 꺼낸다 → **예지호수는 필수**.

### E. 장막시티(132, 「장막시티」) — 창고열쇠 그런트와 핸섬

- 그런트 `LOCALID_GRUNT_M_STORAGE_KEY` (721,593), 숨김 547, script 13 = `VeilstoneCity_GruntMStorageKey` (`scripts_veilstone_city.s:1068`). 말을 걸어야 한다(시선 트레이너 아님).
- 1078줄 `SetFlag FLAG_VEILSTONE_CITY_GRUNT_DROPPED_STORAGE_KEY`(341), 1082줄 `ClearFlag FLAG_HIDE_VEILSTONE_CITY_LOOKER`(650), 그런트 퇴장 → 핸섬 「아지트에 들어가겠나?」 `ShowYesNoMenu`.
  - **예** → 1143·1144줄: `VAR_VEILSTONE_CITY_GALACTIC_WAREHOUSE_STATE`(16671)=**3**, `FLAG_AGREED_WITH_LOOKER_TO_ENTER_HIDEOUT`(155).
  - 아니오 → 아무것도 안 바뀜. 재입장 시 OnTransition이 핸섬을 (717,593)에 세우고(41·62줄), script 30 `VeilstoneCity_Looker`(1226줄)로 다시 묻는다.
- ⚠️ 창고열쇠(463)는 **도구로 받지 않는다**. `VisibleItems_Unused7238_StorageKey`는 안 쓰인다 — 핸섬이 대신 연다.
- 창고 경비 그런트 둘(697,595/597)은 447로 숨어 있고, 좌표 (697,596)은 `VAR_VEILSTONE_WAREHOUSE_GUARDS_FIGHTABLE`(16509)==0일 때만 — 배지 4 뒤 TRUE라 안 선다.

### F. 갤럭시 창고(143)

- 입장 워프 (8,11). 좌표 이벤트 `script 5` (8,8) 폭 2 → (8,8)/(9,8), `16671 == 3` → `VeilstoneCityGalacticWarehouse_CoordEvent_LookerOpenDoor` (138-171줄).
  문 (8,7)/(9,7)은 이 두 칸으로만 닿는다 → **강제**.
- 154줄 `FLAG_USED_STORAGE_KEY`(270) · 문 오브젝트 RemoveObject(= 숨김 깃발 552 세움, `src/scrcmd.c:2359-2368` → `MapObject_SetFlagAndDeleteObject`) ·
  169줄 `FLAG_HIDE_VEILSTONE_CITY_LOOKER`(650) · 170줄 16671=**4**.
- 창고 워프 1 (13,3) → 아지트 B2F 워프 2 (3,16).
- (창고 문 오브젝트 script 1 = 창고열쇠가 있으면 여는 대체 경로 — 열쇠를 얻을 수 없으니 죽은 가지.)

### G. 갤럭시단 아지트 — 갤럭시단의열쇠 (워프 패널 미로)

맵: B2F 310 · B1F 309 · 1F 305 · 2F 306 · 3F 307 · 4F 308 · 홀 569 · 연구소 497 · 제어실 494 (한글 모두 「갤럭시단아지트」, label 71).
열쇠 문 4짝: B2F (14~15,8) 551 · 1F (22~23,18) 548 · 3F (27~28,19) 549 · 4F (8~9,14) 550. 스크립트는 전부 `CheckItem ITEM_GALACTIC_KEY` → 예/아니오 → 문 치움 (`scripts_galactic_hq_b2f.s:19`, `_1f.s:96`, `_3f.s`, `_4f.s:104`).

**열쇠 없이 닿는 길(격자 BFS, 워프 표 `events_galactic_hq_*.json`):**

1. 창고 → B2F (3,16) [영역 0: 그런트 트레이너 (40,15) id507, (71,10) id508]
2. B2F 워프 1 (81,3) → B1F (3,7) → B1F 워프 0 (11,3) → 1F (46,3)
3. 1F 패널 (39,3) → (32,3); 패널 (36,8) → (1,8)
4. 1F 워프 3 (4,3) → 2F (7,3) [2F 그런트 id510 (10,6) 북 시야3]
5. 2F 패널 (1,3) → (17,5); 2F 워프 1 (24,3) → 1F (27,3) [사이언티스트 프레드릭 id830 (17,6) 동 시야6]
6. 1F 워프 6 (11,3) → B2F (50,3) [영역 1]
7. **열쇠** `LOCALID_ITEM_GALACTIC_KEY` (20,5) script 7237, 깃발 `FLAG_OBTAINED_GALACTIC_HQ_B2F_GALACTIC_KEY`(1251), 도구 **440**.

**열쇠 뒤 — 안에서는 4F·홀·제어실로 못 간다.** 모든 열쇠 문을 연 상태로 BFS해도 2F 영역 3(홀 입구)은
「장막시티 → 정문 → 1F 로비 → 1F 문 → 1F 워프 4 (19,14)」로만 닿는다. 곧 **밖으로 나갔다가 정문으로 다시 들어온다**:

8. 나가기: B2F 문(열쇠, 551) → 영역 0 → (3,16) → 창고 → 장막 (또는 온 길 되짚기).
9. 장막시티 정문 워프 14 (714,589) 또는 15 (717,589) → 1F 로비 (8,22)/(29,22).
   ⚠️ 워프 16 (720,589) → 1F (42,22) 는 4F 볼라드(18~19,14) 뒤 막다른 칸 — 볼라드 숨김 깃발 567 `FLAG_HIDE_GALACTIC_HQ_TEAM_GALACTIC`은 디컴프 어디서도 안 세운다.
10. 1F 문 (22~23,18) 열쇠 → 1F 워프 4 (19,14) → 2F (10,11) [2F 영역 3: 그런트 id513 (21,16) 북·동 시야4, 그런트 id430 (26,16) 서 시야4, 스칼 다리우스 id829 (32,6) 북 시야2]
11. 2F 워프 10 (29,13) → 홀 (24,6). 홀 좌표 (20,12)·(20,13) `VAR_GALACTIC_HQ_HALL_STATE`(16526)==0 → **연설 장면(강제: 두 칸을 막으면 (1,12)에 못 닿음)**.
    `scripts_galactic_hq_hall.s:9-102`: 태홍 연설, 그런트 36명 제거, 핸섬 퇴장, 16526=1. 대사만.
12. 홀 워프 1 (1,12) → 2F (52,6) [2F 영역 4 = 낮잠방: **침대 bg script 1 (40,4)(40,5)(44,4)(44,5) — 회복**, `scripts_galactic_hq_2f.s` `GalacticHQ2F_Bed`]
13. 2F 워프 4 (50,3) → 3F (47,3)
14. 3F 패널 (15,13) → (6,14); 3F 워프 2 (10,11) → 4F (3,15)
15. 4F 문 (8~9,14) 열쇠 → 통로 (8~9,12~13) → 좌표 (8,11) 폭2 **강제**.

### H. 4F 태홍 — 마스터볼

- 좌표 `script 1` (8,11) 폭2, `VAR_GALACTIC_HQ_4F_STATE`(16598)==0 → `GalacticHQ4F_CoordEvent_Cyrus` (`scripts_galactic_hq_4f.s:13`).
- 배틀 39줄 `TRAINER_GALACTIC_BOSS_CYRUS_GALACTIC_HQ` **id 403** 싱글: SNEASEL L44 · CROBAT L44 · HONCHKROW L46 (자뭉열매), 도구 고급상처약·회복약. 지면 `BlackOutFromBattle`.
- 43-47줄 `ITEM_MASTER_BALL`(**1**, 「마스터볼」) — `CanFitItem`이 참일 때**만** 준다(`CallIfEq VAR_RESULT, TRUE`). 볼 주머니 15칸(`include/bag.h:15`)이 꽉 차 있으면 **말없이 못 받고 다시 받을 길도 없다**(56줄 16598=1, 태홍 퇴장).
- 연구소로: 4F 워프 1 (22,3) → 연구소 (1,11) → 연구소 워프 1 (36,2) → 제어실 (8,13).

### I. 제어실(494) — 새턴·호수 셋 해방

- 새턴 (8,6) 북향, script 3 `GalacticHQControlRoom_Saturn` (35줄). 버튼 bg script 10 (8,5) = 새턴 바로 뒤. 차론 (7,6) 대사만.
- 배틀 43줄 `TRAINER_COMMANDER_SATURN_GALACTIC_HQ` **id 409** 싱글: 골뱃 L42 · 동미러 L42 · 독개굴 L44. 지면 블랙아웃.
- 승리: `FLAG_DEFEATED_GALACTIC_HQ_CONTROL_ROOM_SATURN`(173), `VAR_GALACTIC_HQ_CONTROL_ROOM_STATE`(16653)=1 → 좌표 (8,13)==1 이 출구를 막아 북으로 되민다(307줄).
  새턴은 플레이어가 북을 보면 동으로 비킨다(57줄). 플레이어 방향을 `VAR_MAP_LOCAL_0x02`에 기억(그 맵 안에서만).
- 버튼 (8,5)을 (8,6)에서 북으로 → 예 (`GalacticHQControlRoom_Button` 173줄) → 184 16653=0 · `ClearFlag FLAG_HIDE_MT_CORONET_1F_NORTH_ROOM_1_GRUNT_F`(661) ·
  190 `FLAG_FREED_GALACTIC_HQ_POKEMON`(2429) → 새턴 대사·퇴장 → 252 `FLAG_HIDE_MT_CORONET_2F_CAVE_PAINTING`(565) · 253 벽화 조각 숨김(386) 해제 · 254 `VAR_MT_CORONET_2F_STATE`(16553)=**1**.
- 아지트 나가기: 제어실→연구소→4F→(문)→3F (10,11)→패널 (6,14)→(15,13)→3F (47,3)→2F (50,3)→(52,6)→홀 (1,12)→(24,6)→2F (29,13)→(10,11)→1F (19,14)→문→정문.
  아지트는 공중날기·동굴탈출로프 불가(`maps.json` fly 0, escapeRope 0).

### J. 천관산 — 창기둥까지

권장 진입: 연고시티(86)로 공중날기 → 208번도로 서쪽 → 천관산 1F 남 워프 1 (27,20). 208 게이트 (446,726) → (392,724) 격자상 비전기술 불필요.

| 맵 | 들어오는 워프 → 나가는 워프 | 최소 비전기술 (격자 BFS) | 비고 |
|---|---|---|---|
| 207 1F 남 | w1 (27,20) 또는 w0 (4,8) → w2 (25,3) | **파도타기 + 락클라임** | 북쪽 못 (4~6행) 파도타기 → (27,8)~(27,9) 락클라임(0x4B) 북 → (25,3). (27,20)쪽은 11행 뛰어내림 턱(0x3B) 때문에 걸어서 못 오른다. 1F 남 태홍 좌표 (14,23) `VAR_MT_CORONET_1F_SOUTH_STATE`(16534)==0 은 앞 구간에서 이미 1 |
| 208 2F | w0 (27,48) → w2 (7,23) 벽화 구멍 | **괴력** | 괴력 바위 (14,45) (`FLAG_MAP_LOCAL_HIDE_OBSTACLE_2`) — 남으로 **다섯 번** 밀어 (14,50)에 세운다(x=14 폭 한 칸 통로 · (14,47)까지는 막힌다). 구멍 (7,23)은 벽화 오브젝트(565로 숨음)가 서 있던 칸, 행동 0x6E WARP_NORTH → (7,24)에서 북으로 |
| 208 2F | 좌표 `script 2` (11,24) 길이3 → (11,24~26), 16553==1 | — | **핸섬 장면 강제**(세 칸을 막으면 (7,23)에 못 닿음). 23줄 16553=2, 검정비드로(68) — `GoToIfCannotFitItem`이면 못 받고 나중에 핸섬에게 다시 받는다(131줄). 52줄 `FLAG_RECEIVED_MT_CORONET_2F_BLACK_FLUTE`(352) |
| 208 2F | w3 (7,12) → w4 (11,4) | 없음 | |
| 209 3F | w0 (14,26) → w2 (3,29) | 없음 | 그런트 id515 (2,20) · id523 (15,15) |
| 211 바깥 남 | w0 (12,35) → w1 (11,17) | **락클라임** | 눈 (0xA8) |
| 212 4F 방1·2 | w0 (7,25) → w4 (40,10) | **락클라임** | 그런트 id516 (10,7) · id517 (23,5). 금강옥·백옥 (57,2)/(61,2)은 곁가지 |
| 210 바깥 북 | w0 (42,40) → w1 (13,19) | **락클라임** | |
| 213 4F 방3 | w0 (2,3) → w1 (18,8) | 없음 | |
| 214 5F | w0 (21,7) → w1 (13,24) | 없음 | 그런트 id520 (20,22) 남 시야3 · id525 (26,16) 서 시야5 |
| 215 6F | w0 (10,24) → w1 (7,5) → 창기둥 (31,53) | 없음 | 그런트 id526 (10,15) 서 시야6. OnTransition(`scripts_mt_coronet_6f.s:8-63`): `FLAG_SPEAR_PILLAR_IS_DISTORTED`(306) 없고 16554<2 → 워프 1만 (7,5)에 |

- 필요 없음: 바위깨기(돌은 최소 경로에 없음), 안개제거(천관산 날씨 0/6/29, 안개 14 없음), 폭포오르기.
- 216·211 쪽 입구(1F 북 방1 218 → 터널 방 216)는 막혀 있다: 터널 방 도착 워프 (16,13) 바로 남 (16,14)에 「길 잃은 그런트」(`FLAG_HIDE_MT_CORONET_GALACTIC_GRUNTS` 655, 송별의 샘에서야 세움 `scripts_sendoff_spring.s:41`)가 서서 유일한 출구를 막는다.
- 207번도로 윗단 워프 (348,717) → 2F 워프 1 은 격자상 207번도로 어디서도 안 닿는다(모든 비전기술로도) — 쓰지 않는다.

필드 기술 배지 (`src/field_move_tasks.c`): 풀베기 332 숲 · 공중날기 373 코블 · 파도타기 414 펜 · 괴력 463 마인 · 안개제거 504 렐릭 · 바위깨기 545 콜 · 폭포오르기 590 비컨(8번째) · 락클라임 631 아이시클(7번째).

### K. 창기둥(220, 「창기둥」)

1. 도착 (31,53). 좌표 `script 3` (31,48), `VAR_SPEAR_PILLAR_STATE`(16536)==0 → `SpearPillar_CoordEvent_Grunts` (81줄). 양옆 그런트 (30,48)/(32,48)라 **강제**.
   - 86줄 `CheckHasTwoAliveMons` — 싸울 수 있는 포켓몬이 둘 미만이면 남으로 한 칸 밀려난다.
   - 115줄 `StartTrainerBattle TRAINER_GALACTIC_GRUNT_SPEAR_PILLAR_1, _2` = **2대1 더블**: id521 독개굴 L39·독개굴 L43 + id527 스컹뿡 L41·나옹마 L41. 지면 블랙아웃. 이기면 105줄 16536=1.
2. 좌표 `script 5` (30,32) 폭3 → (30~32,32), 16536==1 → `SpearPillar_CoordEvent_MarsJupiter` (162줄). 강제.
   - 라이벌 입장(204줄 `FLAG_HIDE_SPEAR_PILLAR_RIVAL` 453 해제) → 176줄 `StartTagBattle` 파트너 = 스타터로 고름(`SetRivalPartnerTeam`):
     플레이어 불꽃숭이 → id620(엠페르트 L44…), 모부기 → id619(초염몽 L44…), 팽도리 → id607(토대부기 L44…).
     상대 마스 id528 (동미러 L44 · 골뱃 L44 · 몬냥이 L46) + 쥬피터 id407 (동미러 L44 · 골뱃 L44 · 스컹탱크 L46).
   - 지면 198줄 16536=1로 되돌리고 블랙아웃(재도전 가능). 이기면 **파티 회복**, 16536=2, 라이벌 퇴장.
3. 곧바로 `SpearPillar_Cyrus` (360줄): 카메라, 사슬 소리, `SetSubScene63`(디아루가·펄기아 컷신) → 386-393줄
   숨김 456·457·458, 16536=**3**, `FLAG_UNLOCKED_VS_SEEKER_LVL_3`(2433), 455 해제, **`FLAG_SPEAR_PILLAR_IS_DISTORTED`(306)**, `VAR_SPEAR_PILLAR_DISTORTED_STATE`(16579)=1,
   397줄 `Warp MAP_HEADER_SPEAR_PILLAR_DISTORTED, 30, 30, DIR_NORTH` (맵 221). 보기만.

### L. 깨진 창기둥(221)

- 프레임 표 16579==1 → `SpearPillarDistorted_OnFrame_AfterWarp`: 유크시·난천 등장(18·24줄 698·461 해제), 31줄 16579=2, 기라티나 그림자, 53줄 `FLAG_HIDE_GALACTIC_HQ_CONTROL_ROOM_CHARON`(670),
  「준비됐니?」 예 → `DoDWWarp` · `SetPartyGiratinaForm ORIGIN` · 72줄 `Warp MAP_HEADER_DISTORTION_WORLD_1F, 55, 40, DIR_SOUTH`.
- 아니오면 풀려난다. 난천(script 2)에게 다시 말 걸면 같은 질문. 6F로 내려가도 6F OnTransition이 306 때문에 워프 2(깨진 창기둥)로 돌린다.

### M. 깨어진 세계(573~581, 「깨어진 세계」) — `src/overlay009/ov9_02249960.c`

층 연결(10198줄~): 1F→B1F→B2F→B3F→B4F→B5F→B6F→B7F, 기라티나 방은 따로. 층 사이는 **엘리베이터 발판**(맵 워프 아님).
진행 변수 `VAR_DISTORTION_WORLD_PROGRESS`(16469), 값은 `include/constants/distortion_world.h`:

| 값 | 이름 | 세우는 자리 |
|---|---|---|
| 0→1 | ENTERED_1F | 1F 프레임 표 ==0 → `DistortionWorld1F_OnFrame_FirstEntry` (난천·기라티나 그림자, 대사만) |
| 2 | JUMPED_ON_1F_ELEVATOR | ov9 이벤트 1F 칸 (40, y289, 52) (11067줄) → 스크립트 4 대사 |
| 3 | ENTERED_B1F | B1F 프레임 ==2 |
| 4 | SAW_B1F_MESPRIT | B1F 칸 (15, y257, 58) ==3 (11108줄) → 엠라이트, B2F 난천 추가 |
| 5 | TALKED_TO_B2F_CYNTHIA | B2F 난천 「흩어지자」 (B2F는 떠 있는 발판 점프 이벤트 P2~P18, 12116줄~) |
| 6 | TALKED_TO_B3F_CYRUS | B3F 칸 (65, y193, 41), 진행 ==4 **또는** ==5 (12332줄) → 태홍 대사(예/아니오 둘 다 같은 결과) |
| — | (B4F) | 기라티나 그림자 두 번; 폭포 (104, y170, z76~79)에서 동쪽 → B5F로 「캐스케이드」 하강 (2500-2510줄, 188-195줄) |
| — | (B5F) | 바위 셋(괴력) 튜토리얼(유크시·아그놈·엠라이트). 바위: 엠라이트 (75,68)→동, 아그놈 (98,67)→서, 유크시 (86,56)→남 으로 밀어 낙하 칸 (76,68)/(97,67)/(86,57)에서 B6F로 떨어뜨림 (7398줄 `sBoulderFallLocations`) |
| — | (B6F) | 떨어진 바위를 맞는 구덩이로: 엠라이트 (68,67) · 아그놈 (96,68) · 유크시 (85,60). 틀린 구덩이(-1 칸)는 되돌아감. 셋 다 → `FLAG_DISTORTION_WORLD_PUZZLE_FINISHED`(2477) (7760-7770줄) |
| 7 | FINISHED_BOULDER_PUZZLE | B6F 난천에게 말(`scripts_distortion_world_b6f.s`) → `FLAG_DISTORTION_WORLD_STEPPING_STONES`(2423), 난천이 발판(엘리베이터)으로 |
| 8 | ENTERED_B7F | B7F 프레임 ==7 |
| 9 | LISTENED_TO_CYNTHIA_CYRUS | B7F 칸 (84~86, y65, 76) ==8 (12580줄) → 대사 |
| 10 | WON_CYRUS_BATTLE | 태홍(script 5)에게 말 → 배틀 |
| 11/12/13 | 기라티나 방 그림자1/2/도착 | 기라티나 방 칸 (15,24) ==10 · (15,17) ==11 · (15,14) ==12 (12726줄) |
| 14 | BATTLED_GIRATINA | 배틀 뒤 맵 재적재 OnLoad (`scripts_distortion_world_giratina_room.s:25`) |

- **B7F 태홍**: `TRAINER_GALACTIC_BOSS_CYRUS_DISTORTION_WORLD` **id 404** 싱글 — 헬가 L45 · 돈크로우 L47 · 크로뱃 L46 · 갸라도스 L46 · 포푸니라 L48, 회복약 2개.
  지면 `DIST_WORLD_PROGRESS_LISTENED_TO_CYNTHIA_CYRUS`(9)로 되돌리고 블랙아웃(`_b7f.s:121`). 이기면 59줄 10 → **난천이 파티 회복**.
- B7F → 기라티나 방: 진행 ≥10에서 (89, y65, z56~57) 북향 → 스크립트 2 → `Warp GIRATINA_ROOM, 15, 25, DIR_NORTH` (ov9 101-104줄, `_b7f.s:19`).
- 깨어진 세계에서 쓰는 비전기술: **파도타기**(B3F 물 2773칸·B4F 물, 중력 바뀐 상태에서는 메뉴에서 파도타기만 뜬다 `field_move_tasks.c:244-247,295-307`) ·
  **괴력**(B5F·B6F 바위 `OBJ_EVENT_GFX_STRENGTH_BOULDER`). repo 격자상 깨어진 세계에는 락클라임 칸(0x4B/0x4C)이 한 칸도 없다.
- 1F 포털(bg script 2, (55,39))은 창기둥으로 되돌아가기(`SetPartyGiratinaForm ALTERED`).

### N. 기라티나 방(582) — 포획

- 기라티나 오브젝트는 진행 ==13일 때만 (15,13)에 선다(13740줄~), script 5 `DistortionWorldGiratinaRoom_Giratina`.
- 68줄 `SetFlag FLAG_MAP_LOCAL_REMOVE_OBJECT`(142) → `StartGiratinaOriginBattle SPECIES_GIRATINA, 47` → **기라티나 오리진폼 Lv47, 야생 배틀**
  (`src/encounter.c:970-993`: `BATTLE_TYPE_WILD_MON` + LEGENDARY + GIRATINA + DISTORTION). 도망칠 수 있고, 어떤 볼로도 잡힌다. **마스터볼은 강제가 아니다** — 스크립트가 볼을 주거나 강요하지 않는다.
- 결과 분기(71-78줄):
  - 포획 → 98-100줄 `FLAG_CAUGHT_GIRATINA`(289) · `FLAG_HIDE_TURNBACK_CAVE_GIRATINA_ROOM_GIRATINA`(592) · 귀혼동굴 백금옥 숨김(632) 해제.
  - 쓰러뜨림/도망 → 난천·태홍 장면만 문구가 다르고 이야기는 똑같이 진행. 289 안 섬 → 기라티나는 **귀혼동굴 기라티나 방에 Lv47로 다시 나온다**(`scripts_turnback_cave_giratina_room.s:35`).
  - 짐/무승부 → `BlackOutFromBattle`. (재입장 경로는 ROM상 가능하나 미검증 — §9)
- 배틀 뒤: 난천·태홍 대사(보기만). 맵 재적재 OnLoad가 진행=14, 기라티나 제거.
- 포털: 진행 ==14일 때 보이지 않는 오브젝트가 (15,13)에, script 3 `DistortionWorldGiratinaRoom_Portal` → 예 →
  `EnableHiddenLocation HIDDEN_LOCATION_SPRING_PATH` · 44줄 `VAR_EXITED_DISTORTION_WORLD_STATE`(16554)=1 · 48줄 `Warp MAP_HEADER_SENDOFF_SPRING, 32, 17, DIR_SOUTH`.
  (방 남쪽 (15,25~26) 남향은 B7F로 되돌아가는 칸 — 94-97줄.)

### O. 송별의 샘(267, 「송별의 샘」) — 끝

- 프레임 표 16554==1 → `SendoffSpring_OnFrame_Cynthia`: 기라티나 폼 어나더로, 난천 대사(보기만).
- 37-47줄: **`VAR_EXITED_DISTORTION_WORLD_STATE`(16554)=2** · `VAR_SANDGEM_TOWN_LAB_STATE`(16550)=2 · 455 세움 · **306 해제** ·
  655(천관산 그런트 전부 숨김) · 661 · 671 · `FLAG_ALT_MUSIC_GALACTIC_HQ_1F` · 658 해제 · **`FLAG_GALACTIC_LEFT_LAKE_VALOR`(350)** · 661.
- 플레이어 위치: 송별의 샘 (32,17) 남향. 이 맵은 공중날기 가능(fly 1). 샘길(`MAP_HEADER_SPRING_PATH`) 워프 (12/13,56) → 214번도로 쪽.
- **완료 판정 = 맵 267 + 16554 == 2** (+ 포획 확인은 289).

---

## 3. 변수·깃발 번호 (이 구간)

| 번호 | 이름 | 값/뜻 |
|---|---|---|
| 16595 | VAR_LAKE_ACUITY_STATE | 1 → 예지호수 장면 → 2 |
| 16516 | VAR_ACUITY_LAKEFRONT_STATE | 이미 1 |
| 186 | FLAG_TEAM_GALACTIC_LEFT_LAKE_VERITY | 이미 세움 — 예지호수 워프가 318로 |
| 442 / 441 | FLAG_HIDE_LAKE_ACUITY_JUPITER / _RIVAL | 장면 뒤 RemoveObject로 섬 |
| 547 | FLAG_HIDE_VEILSTONE_CITY_GRUNT_M_STORAGE_KEY | 예지호수가 해제 |
| 447 | FLAG_HIDE_VEILSTONE_GALACTIC_GRUNTS | 무청이 세움 |
| 341 | FLAG_VEILSTONE_CITY_GRUNT_DROPPED_STORAGE_KEY | 그런트 대화 |
| 650 | FLAG_HIDE_VEILSTONE_CITY_LOOKER | 그런트 대화가 해제 → 창고 장면이 세움 |
| 155 | FLAG_AGREED_WITH_LOOKER_TO_ENTER_HIDEOUT | 핸섬 「예」 |
| 16671 | VAR_VEILSTONE_CITY_GALACTIC_WAREHOUSE_STATE | (2) → 핸섬 예 3 → 창고 문 4 |
| 270 | FLAG_USED_STORAGE_KEY | 창고 문 |
| 552 | FLAG_HIDE_..._WAREHOUSE_GALACTIC_HQ_DOOR | 창고 문 제거 |
| 1251 | FLAG_OBTAINED_GALACTIC_HQ_B2F_GALACTIC_KEY | 열쇠 줍기 |
| 551 / 548 / 549 / 550 | FLAG_HIDE_GALACTIC_HQ_B2F/1F/3F/4F_DOOR | 열쇠 문 |
| 16526 | VAR_GALACTIC_HQ_HALL_STATE | 연설 0→1 |
| 16598 | VAR_GALACTIC_HQ_4F_STATE | 태홍 0→1 |
| 16653 | VAR_GALACTIC_HQ_CONTROL_ROOM_STATE | 새턴 뒤 1 → 버튼 0 |
| 173 | FLAG_DEFEATED_GALACTIC_HQ_CONTROL_ROOM_SATURN | |
| 2429 | FLAG_FREED_GALACTIC_HQ_POKEMON | 버튼 |
| 565 / 386 | FLAG_HIDE_MT_CORONET_2F_CAVE_PAINTING / _SHARDS | 버튼: 벽화 숨김·조각 보임 → 구멍 열림 |
| 16553 | VAR_MT_CORONET_2F_STATE | 버튼 1 → 핸섬 2 |
| 352 | FLAG_RECEIVED_MT_CORONET_2F_BLACK_FLUTE | |
| 16536 | VAR_SPEAR_PILLAR_STATE | 0 → 그런트 1 → 마스·쥬피터 2 → 컷신 3 |
| 306 | FLAG_SPEAR_PILLAR_IS_DISTORTED | 컷신 세움 → 송별의 샘 해제 |
| 16579 | VAR_SPEAR_PILLAR_DISTORTED_STATE | 1 → 2 |
| 16469 | VAR_DISTORTION_WORLD_PROGRESS | 0 … 14 (§M) |
| 2477 / 2423 | FLAG_DISTORTION_WORLD_PUZZLE_FINISHED / _STEPPING_STONES | B6F |
| 289 | FLAG_CAUGHT_GIRATINA | 포획만 |
| 592 / 632 | FLAG_HIDE_TURNBACK_CAVE_GIRATINA_ROOM_GIRATINA / _ITEM | 포획 시 |
| 16554 | VAR_EXITED_DISTORTION_WORLD_STATE | 포털 1 → 송별의 샘 **2** |
| 16550 | VAR_SANDGEM_TOWN_LAB_STATE | 2 |
| 350 | FLAG_GALACTIC_LEFT_LAKE_VALOR | 송별의 샘 |
| 655 | FLAG_HIDE_MT_CORONET_GALACTIC_GRUNTS | 송별의 샘 |
| 1175 | FLAG_OBTAINED_ROUTE_217_HM08 | 비전머신08 |

## 4. 도구

마스터볼 **1** · 검정비드로 68 · 비전머신02 421 · 03 422 · 04 423 · **08 427** · 갤럭시단의열쇠 **440** · 창고열쇠 463(얻지 않음) ·
백금옥 112(포획 뒤 귀혼동굴, 범위 밖) · 금강옥 135 · 백옥 136(천관산 4F 곁가지, 불필요).
기술: 공중날기 19 · 파도타기 57 · 괴력 70 · 락클라임 431.

## 5. 배틀 표

| 자리 | id | 형식 | 파티 | 지면 |
|---|---|---|---|---|
| 아지트 4F 태홍 | 403 | 싱글 | SNEASEL 44 · CROBAT 44 · HONCHKROW 46 | 블랙아웃 |
| 제어실 새턴 | 409 | 싱글 | GOLBAT 42 · BRONZOR 42 · TOXICROAK 44 | 블랙아웃 |
| 창기둥 그런트 2인 | 521 + 527 | 2대1 더블 (2마리 필요) | CROAGUNK 39·43 / STUNKY 41·GLAMEOW 41 | 블랙아웃 |
| 창기둥 마스+쥬피터 | 528 + 407, 파트너 620/619/607 | 태그(라이벌 동행) | PURUGLY 46 외 / SKUNTANK 46 외 | 상태 1로 되돌리고 블랙아웃 |
| 깨어진 세계 B7F 태홍 | 404 | 싱글 | HOUNDOOM 45 · HONCHKROW 47 · CROBAT 46 · GYARADOS 46 · WEAVILE 48 | 진행 9로 되돌리고 블랙아웃 |
| 기라티나 | — | 야생 Lv47 오리진 | — | 도망·쓰러뜨림 가능 |

아지트 길 위 트레이너(선택적·시선): B2F 507·508, 1F 428(41,7), 2F 510·513·430·829, 프레드릭 830, 3F 514+522. 천관산 515·523·516·517·520·525·526.

## 6. 회복 지점

아지트 2F 낮잠방 침대(§G-12) · 창기둥 마스·쥬피터 승리 뒤 자동 · B7F 태홍 승리 뒤 난천. 그 사이에는 없다
(천관산 3F~6F·창기둥 연전, 깨어진 세계 B7F 태홍 전 전 구간).

## 7. 보기만 하는 장면

예지호수(쥬피터·라이벌) · 장막 그런트→핸섬(예/아니오 하나) · 창고 핸섬 · 홀 연설 · 태홍 4F 전후 · 새턴 퇴장·호수 셋 · 천관산 2F 핸섬 ·
창기둥 라이벌 입장·태홍 소환 컷신(`SetSubScene63`) · 깨진 창기둥 · 깨어진 세계 1F·B1F·B2F·B3F·B6F·B7F·기라티나 방 · 송별의 샘.

## 8. 비전기술 요약 (경로상)

| 기술 | 필요 자리 | 배지 |
|---|---|---|
| 락클라임 | 예지호수근처 · 천관산 1F 남·바깥 남·4F 방1·2·바깥 북 | 아이시클(7) — 있음 |
| 파도타기 | 천관산 1F 남 못 · 깨어진 세계 B3F/B4F | 펜 |
| 괴력 | 천관산 2F (14,45) · 깨어진 세계 B5F/B6F 바위 | 마인 |
| 공중날기 | 이동 편의 (선단→장막, 장막→연고) | 코블 |
| 불필요 | 바위깨기 · 안개제거 · 폭포오르기 · 풀베기 | |

## 9. 위험·미묘한 자리

1. **비전머신08 획득·가르치기 누락**이 첫 벽 — 예지호수근처에서 락클라임 없이는 호수가 안 열리고, 그러면 장막 그런트가 안 나온다.
2. **아지트는 한 번에 못 끝난다**: 열쇠를 얻은 뒤 **건물 밖으로 나가 정문(워프 14/15)으로** 다시 들어와야 한다. 워프 16은 막다른 칸.
3. **마스터볼은 가방에 자리가 있을 때만** 준다(볼 주머니 15종 꽉 차면 소실, 재획득 없음). 기라티나 포획을 마스터볼로 하려면 이 한 번이 전부.
4. 아지트 3F (42,4~6): 그런트 id514(42,7 북)와 id522(42,3 남)가 같은 열을 마주 본다 — 지나갈 수 있는 유일한 열(격자). 둘이 동시에 볼 수 있다(원작은 2인 더블). 2F (22~25,16)도 마주 보는 두 그런트 사이.
5. repo 엔진: `StartTrainerBattle`이 두 번째 상대를 버린다(`src/engine/script/commands.ts:2724-2730`) → 창기둥 그런트전이 id521 하나로 줄어든다. 태그 배틀도 1:1 축소(앞 문서). 이야기 진행은 막지 않지만 원작과 다르다.
6. 창기둥 그런트 좌표는 `CheckHasTwoAliveMons` — 한 마리로 오면 계속 밀려난다.
7. 깨어진 세계에서 지면: B7F 태홍은 진행 9로 되돌리고 블랙아웃 → 밖(마지막 센터)에서 다시 천관산 6F → 깨진 창기둥 난천 → 1F부터(1F OnTransition이 `InitPersistedMapFeaturesForDistortionWorld`). 기라티나 전 패배는 더 복잡하다(OnLoad가 진행 14를 세우는지 블랙아웃 순서에 달림) — **지지 않게** 짠다.
8. 기라티나를 쓰러뜨리거나 도망쳐도 이야기(16554=2)는 끝난다. 「마스터볼로 잡았다」를 판정하려면 289와 파티/박스를 따로 봐야 한다.
9. 격자 BFS는 2D라 천관산 바깥 눈길·깨어진 세계처럼 층이 겹치는 자리에서 거짓 길/거짓 막힘이 가능하다. 깨어진 세계는 ov9 전용(엘리베이터·중력·캐스케이드)이라 격자로 판정하지 않았다 — repo `src/engine/world/distortion*.ts`·`public/data/distortion.json`이 이미 이 층을 다룬다.
10. 천관산 2F 괴력 바위는 맵-로컬 깃발이라 맵을 나가면 되돌아간다.
11. 창기둥 가기 전 파티: 천관산 3F~6F 그런트 + 창기둥 4연전(그런트 더블 → 마스·쥬피터 태그) 사이 회복 없음. 레벨대 44~48.
