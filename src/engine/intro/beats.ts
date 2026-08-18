// 인트로 박자 — 마박사의 말부터 라이벌 이름까지.
//
// 원작에서 이 장면은 필드 스크립트가 아니라 따로 도는 응용 프로그램이다
// (`applications/rowan_intro/rowan_intro_app.c`). 그래서 바이트코드가 없고,
// 상태 기계를 여기 옮긴다. **원작의 글은 한 자도 짓지 않는다** — 전부
// `rowan_intro` 뱅크(us#389)의 45줄이고 이 파일은 그 번호만 든다.
//
// 차례는 원작 상태 기계 그대로다. `rowan_intro_app.c`에서 글을 띄우는 자리만
// 뽑으면 이 순서다 (`RowanIntro_DisplayMessage` 호출 차례):
//
//   HelloThere → MyNameRowan → [되묻기] → WidelyInhabited → HavePokeBall →
//   LiveAlongsidePokemon → AboutYourself → 성별 → 이름 →
//   **SoYoure** → 라이벌 이름 → **EndDialogue**
//
// ⚠️ **`SoYoure`와 `EndDialogue`가 특히 중요하다.**
// `SoYoure`(「…라고 하는가! 여기 있는 이 소년은 자네의 친구였지?」)가 **라이벌을
// 화면에 세우는 말**이다. 이 줄이 없으면 용식이가 아무 소개 없이 툭 나타난다.
// `EndDialogue`는 마박사가 마지막으로 하는 말이고, 이 줄이 없으면 라이벌 이름을
// 정하자마자 화면이 끊긴다 — 실제로 한동안 둘 다 없어서 그렇게 보였다.
//
// 우리 인사(`welcomeText.ts`)만 원작에 없는 것이고 맨 앞에 한 번 든다 — 이 세계가
// 무엇이고 누가 만들었으며 어디로 가면 그 사람을 볼 수 있는지를 말하는 자리다.
import { INTRO_TEXT } from '../../data/uiText'

/** 한 박자가 무엇을 하는가 */
export type IntroStep =
  /** 글 한 줄. `line`은 `rowan_intro` 뱅크의 자리다 */
  | { kind: 'say'; line: number }
  /** **우리 글**. 뱅크가 아니라 `welcomeText.ts`에서 온다 */
  | { kind: 'ours' }
  /** 무엇을 더 알고 싶은지 (조작 · 모험 · 괜찮다) */
  | { kind: 'infoMenu' }
  /** 몬스터볼을 누르는 자리. 클릭하면 열린다 */
  | { kind: 'pokeBall' }
  /** 남자인가 여자인가 */
  | { kind: 'gender' }
  /** 이름을 짓는다. `who`가 누구 것인지 */
  | { kind: 'name'; who: 'player' | 'rival' }
  /** 끝. 필드로 넘어간다 */
  | { kind: 'done' }

/**
 * 곧게 흐르는 부분.
 *
 * 되묻는 자리(조작 설명·성별·이름)는 답에 따라 갈리므로 여기 안 넣고 화면이
 * 다룬다. 이 목록은 "무엇을 어떤 순서로"만 정한다.
 */
export const INTRO: readonly IntroStep[] = [
  // 우리 인사 하나로 시작한다 (`welcomeText`) — 여기만 원작에 없다
  { kind: 'ours' },
  // RI_STATE_DIALOGUE_HELLO · RI_STATE_DIALOGUE_MY_NAME
  { kind: 'say', line: INTRO_TEXT.hello },
  { kind: 'say', line: INTRO_TEXT.myName },
  // RI_STATE_INFO_* — 조작 · 모험 · 괜찮다
  { kind: 'infoMenu' },
  // RI_STATE_DIALOGUE_WIDELY_INHABITED
  { kind: 'say', line: INTRO_TEXT.widelyInhabited },
  // RI_STATE_PKBL_* — 볼을 누르면 이어롭이 나온다
  { kind: 'pokeBall' },
  // RI_STATE_PKBL_DIALOGUE_LIVE_ALONGSIDE · RI_STATE_DIALOGUE_ABOUT_YOURSELF
  { kind: 'say', line: INTRO_TEXT.liveAlongside },
  { kind: 'say', line: INTRO_TEXT.aboutYourself },
  // RI_STATE_GENDR_*
  { kind: 'gender' },
  // RI_STATE_NAME_*
  { kind: 'name', who: 'player' },
  // RI_STATE_DIALOGUE_SO_YOURE — ⚠️ **여기서 라이벌이 화면에 선다**
  { kind: 'say', line: INTRO_TEXT.soYoure },
  // RI_STATE_RIVAL_NAME_*
  { kind: 'name', who: 'rival' },
  // RI_STATE_DIALOGUE_END — 마박사의 마지막 말
  { kind: 'say', line: INTRO_TEXT.end },
  { kind: 'done' },
]

/** 되묻는 자리에서 고를 것 하나 */
export interface IntroChoice {
  /** 뱅크 자리 */
  line: number
  value: number
}

/** "그 밖에 알고 싶은 건 무엇인가?"의 세 갈래 */
export const INFO_CHOICES: readonly IntroChoice[] = [
  { line: INTRO_TEXT.choiceControls, value: 0 },
  { line: INTRO_TEXT.choiceAdventure, value: 1 },
  { line: INTRO_TEXT.choiceNoInfo, value: 2 },
]

/** 고른 갈래가 들려주는 글. "괜찮다!"는 빈 목록이다 */
export function infoLines(choice: number): readonly number[] {
  if (choice === 0) return INTRO_TEXT.controls
  if (choice === 1) return INTRO_TEXT.adventure
  return []
}

/**
 * 라이벌 이름 후보.
 *
 * 원작은 여덟 중 하나를 고르거나 "스스로 결정한다!"로 직접 짓는다. 주인공에게는
 * 이 목록이 없다 — 원작도 바로 자판으로 간다
 */
export const RIVAL_NAME_CHOICES: readonly number[] = INTRO_TEXT.rivalChoices
