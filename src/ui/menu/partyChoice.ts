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
}
