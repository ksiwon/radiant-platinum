// 화면이 직접 부르는 곡 번호 (DATA.md §2.18)
//
// ⚠️ **여기는 아무것도 안 부른다.** 타이틀 화면이 곡 번호를 쓰는데, `songs.ts`를
// 들여오면 `map/world` → `state/worldState` → **three**가 첫 청크에 딸려 온다.
// 타이틀에는 three를 안 싣는 것이 규칙이고(PLAN §10.4) `initialChunk.test`가
// 그 길을 이름까지 찍어서 막는다 — 실제로 그렇게 걸렸다.
//
// **번호는 지어내지 않는다.** 원작 코드가 부르는 그 번호이고, SDAT의 `SYMB`와
// 디컴프 `generated/sdat.txt`가 함께 확인해 준다.

/**
 * 타이틀 화면의 곡 (`SEQ_TITLE01`).
 *
 * `title_screen.c`의 `TITLE_SCREEN_APP_STATE_INIT_SOUND`이
 * `Sound_SetSceneAndPlayBGM(SOUND_SCENE_TITLE_SCREEN, SEQ_TITLE01, 1)`을 부른다.
 * 기라티나가 도는 그 화면이 이것이고, 그 앞의 데모 영상(`game_opening`)이
 * `SEQ_TITLE00`이다.
 *
 * 번호는 자료 둘이 함께 확인해 준다. SDAT의 `SYMB`가 1173을 `SEQ_TITLE01`이라
 * 부르고, 디컴프 `sdat.txt`도 같은 자리를 그렇게 부른다 — 그 파일은 줄 번호가
 * 색인보다 55 크고(`SEQ_OPENING` 1084/1029 · `SEQ_OPENING2` 1153/1098 ·
 * `SEQ_TITLE00` 1227/1172로 셋 다 55다) `SEQ_TITLE01`은 1228줄이라 1173이 된다
 */
export const TITLE_SONG = 1173

/**
 * 나무박사 인트로의 곡 (`SEQ_OPENING`).
 *
 * `rowan_intro_app.c`가 `Sound_SetSceneAndPlayBGM(SOUND_SCENE_2, SEQ_OPENING, 1)`을
 * 부른다. 같은 셈으로 `sdat.txt` 1084줄 − 55 = 1029이고 `SYMB`도 1029를
 * `SEQ_OPENING`이라 부른다
 */
export const OPENING_SONG = 1029
