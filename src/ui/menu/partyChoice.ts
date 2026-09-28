// 스크립트가 「한 마리 골라」라고 열었을 때의 답 (`SelectMoveTutorPokemon`)
//
// `namingAnswer`와 같은 이유로 스토어가 아니라 그냥 칸이다 — 스크립트는
// **화면이 닫힌 뒤에** 답을 묻는데, 스토어에 두면 닫는 순간 비워진다.
//
// 기술가르침·기술 되살리기·크기 대회·교환·리본 확인이 전부 이 화면을 쓴다.
// 원작도 화면 하나(`FieldSystem_OpenPartyMenu_SelectPokemon`)로 다 쓴다.

/** `constants/pokemon.h` — 안 고르고 나갔다 */
export const PARTY_SLOT_NONE = 0xff

export const partyChoice = {
  /** 마지막으로 고른 자리. 안 골랐으면 `PARTY_SLOT_NONE` */
  slot: PARTY_SLOT_NONE,
  /**
   * 키우미집 갈래에서 「능력치를 본다」를 골랐는가 (`PARTY_MENU_EXIT_CODE_SUMMARY`).
   *
   * 스크립트가 그 자리의 요약 화면을 열고, 닫힌 뒤의 자리로 파티 화면을 다시 연다
   * (`scripts_day_care_common.s`의 `DayCareCommon_ChoosePokemon`)
   */
  summary: false,
}

/**
 * 요약 화면이 닫힐 때 보고 있던 자리 (`PokemonSummary_GetPartySlot`).
 *
 * 요약 화면 안에서 위아래로 다른 마리로 넘어갈 수 있어서, 연 자리와 닫힌 자리가 다르다
 */
export const summaryLast = { slot: 0 }
