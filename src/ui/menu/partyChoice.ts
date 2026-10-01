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

/**
 * 파티 화면이 요약을 열 때 보던 자리 — 돌아오면 커서가 거기 선다.
 *
 * 요약을 쌓으면 `MenuLayer`가 파티 화면을 내렸다가 다시 세우므로 커서를 화면이
 * 못 들고 있다. 원작도 파티 화면을 닫고(`PARTY_MENU_EXIT_CODE_SUMMARY`) 요약을 연
 * 뒤, **요약이 닫힌 자리로** 파티 화면을 다시 연다 (`start_menu.c`의
 * `StartMenu_ExitSummary` → `FieldSystem_OpenPartyMenu(…, summary->monIndex)`).
 * 그래서 요약 안에서 ↑↓로 다른 마리로 넘어가면 그 자리를 따라간다.
 *
 * ⚠️ **`summaryLast.slot`을 그냥 읽으면 안 된다.** 그 값은 어느 요약이든(키우미집
 * 스크립트가 연 것까지) 닫힌 자리를 남겨서, 따로 연 파티 화면으로 샌다. 이 칸은
 * 파티 화면이 요약을 열 때만 서고, 파티 화면이 다시 설 때 한 번 읽고 비운다
 */
let returnSlot: number | null = null

/** 돌아올 자리. 파티 화면이 연 요약이 아니면 null */
export function partyReturnSlot(): number | null {
  return returnSlot
}

/** 돌아올 자리를 세운다 · 비운다(null) */
export function setPartyReturnSlot(slot: number | null): void {
  returnSlot = slot
}

/**
 * 요약 안에서 다른 마리로 넘어갔다. **파티 화면이 연 요약일 때만** 따라간다 —
 * 키우미집 스크립트가 연 요약이 이 칸을 세우면 다음 파티 화면으로 샌다
 */
export function followPartyReturn(slot: number): void {
  if (returnSlot !== null) returnSlot = slot
}

/**
 * 파티 화면의 첫 커서. 스크립트가 고르라고 연 화면이면 스크립트가 준 자리
 * (키우미집은 요약에서 돌아올 때 그 자리를 준다), 이 화면이 연 요약에서 돌아왔으면
 * 요약이 닫힌 자리, 아니면 맨 앞이다
 */
export function partyStartCursor(menu: { choosingMon: boolean; chooseStart: number }): number {
  return menu.choosingMon ? menu.chooseStart : returnSlot ?? 0
}
