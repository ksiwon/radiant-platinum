// 인트로 박자 — 마박사의 말부터 라이벌 이름까지.
//
// 원작에서 이 장면은 필드 스크립트가 아니라 따로 도는 응용 프로그램이다
// (`applications/rowan_intro/rowan_intro_app.c`). 그래서 바이트코드가 없고,
// 상태 기계를 여기 옮긴다. **원작의 글은 한 자도 짓지 않는다** — 전부
// `rowan_intro` 뱅크(us#389)의 45줄이고 이 파일은 그 번호만 든다.
//
// ⚠️ **마박사의 소개는 안 튼다.** 인사 한 번 하고 바로 성별·이름으로 간다.
// 만든 사람이 정한 것이다 — 처음 여는 사람이 오래 기다리지 않게.
//
// 그래서 이 화면에서 우리 글(`welcomeText.ts`)이 지는 짐이 커졌다: 이 세계가
// 무엇이고 누가 만들었으며 어디로 가면 그 사람을 볼 수 있는지, 게임 안에서
// 말하는 자리가 **이제 거기 하나뿐**이다.
//
// ⚠️ **뺀 것을 지우지는 않았다.** 되묻기(`infoMenu`)·몬스터볼(`pokeBall`)·
// 뱅크의 말줄은 화면 쪽에 그대로 있고, 이 목록에 다시 넣으면 그대로 돈다.
// 원작 상태 이름(`RI_STATE_…`)도 남은 것에는 그대로 붙여 둔다 —
// 나중에 무엇을 빠뜨렸는지 대조할 수 있어야 한다.
//
// ⚠️ **아직 못 만든 것도 하나 있다.** 몬스터볼에서 이어롭(`SPECIES_BUNEARY`)이
// 나오는 장면은 포켓몬 그림을 못 뽑아서 볼과 빛만 돌았다. 다시 넣을 때 그것부터
// 봐야 한다
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
  // 우리 인사 하나로 시작한다 (`welcomeText`)
  { kind: 'ours' },
  // RI_STATE_GENDR_*
  { kind: 'gender' },
  // RI_STATE_NAME_*
  { kind: 'name', who: 'player' },
  // RI_STATE_RIVAL_NAME_*
  { kind: 'name', who: 'rival' },
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
