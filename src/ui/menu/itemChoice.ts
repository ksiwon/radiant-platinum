// 스크립트가 가방에서 고르라고 한 도구 (`BagContext_GetSelectedItem`)
//
// 원작은 가방 화면을 만들 때 그 결과를 담을 자리를 함께 만들고
// (`FieldSystem_CreateBagContext`), 화면이 닫힌 뒤 스크립트가 그 자리를 읽는다
// (`ScrCmd_GetSelectedItem`). 여기가 그 자리다 — 파티에서 한 마리를 고르는
// `partyChoice`와 같은 꼴이다.
//
// ⚠️ **0이 「안 고르고 나갔다」**다. 스크립트가 그 값으로 갈라지므로 취소도
// 반드시 여기를 거쳐야 한다 — 안 그러면 앞서 고른 도구가 다시 심긴다.

export const itemChoice = {
  /** 마지막으로 고른 도구 번호. 0이면 안 골랐다 */
  item: 0,
}
