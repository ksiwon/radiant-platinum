// 파트너 고르는 화면이 쓰는 번호들 (`choose_starter/choose_starter_app.c`).
//
// 화면(`ChooseStarter.tsx`)에서 떼어 둔다 — 이 번호들이 맞는지는 롬 자료와
// 대조해서 확인할 수 있고, 그 시험이 React를 끌고 올 이유가 없다.

/**
 * 이 화면이 읽는 글 뱅크.
 *
 * 디컴프도 이름을 못 붙인 뱅크라(`TEXT_BANK_UNK_0360`) 번호로 부른다.
 * `PrintMessageToWindow(..., 360, ...)`가 세 곳에 있다
 */
export const STARTER_BANK = 360

/** 그 뱅크 안의 자리 */
export const STARTER_TEXT = {
  /** "몬스터볼이다! 안에 포켓몬이 들어 있다" */
  pokeBalls: 0,
  /** 여기부터 셋이 고른 볼의 분류·이름이다. 커서 자리를 더해 쓴다 */
  firstChoice: 1,
  /** "자! 어떤 포켓몬으로 할지 선택하거라" */
  nowChoose: 7,
} as const

/**
 * 왼쪽·가운데·오른쪽 (`GetSelectedSpecies`).
 *
 * `CURSOR_POSITION_LEFT`가 `STARTER_OPTION_0`이고 그것이 `SPECIES_TURTWIG`다.
 * 글 뱅크의 1·2·3번도 같은 순서라, 순서를 뒤집으면 **모부기를 골랐는데
 * 불꽃숭이 설명이 뜬다** — 그림도 글도 다 나오므로 눈으로는 잘 안 보인다
 */
export const STARTERS = [387, 390, 393] as const
