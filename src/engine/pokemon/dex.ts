// 도감 비트필드 (`Pokedex`)
//
// 세이브 스토어에 있던 것을 떼어 냈다. 이유는 순환 참조 하나다 —
// 세이브 스키마(`state/save/schema`)가 이 크기를 알아야 하는데, 스토어에서
// 가져오면 `saveStore → report → slots → schema → saveStore` 고리가 생긴다.
// ESM은 그 고리에서 **상수를 TDZ로 만든다** (모듈 몸통이 아직 안 돌았다).
// 비트 조작에 스토어가 필요한 것도 아니므로 여기가 제자리다.
//
// 스토어는 이것을 그대로 다시 내보낸다 — 부르는 쪽은 안 바뀐다.

/** 전국도감 493종을 담는 비트필드 크기 (ceil(493/8) = 62, 여유 두어 64) */
export const DEX_BYTES = 64

/**
 * 도감 비트필드.
 *
 * `Uint8Array`는 기본이 `ArrayBufferLike`라 SharedArrayBuffer 뷰까지 허용하는데,
 * 세이브 데이터는 structured clone으로 오가는 독립 버퍼여야 하므로 `ArrayBuffer`로
 * 좁힌다
 */
export type DexField = Uint8Array<ArrayBuffer>

/** dexNo는 1부터 시작하는 전국도감 번호 */
export function dexHas(field: Uint8Array, dexNo: number): boolean {
  const i = dexNo - 1
  return (field[i >> 3]! & (1 << (i & 7))) !== 0
}

export function dexSet(field: Uint8Array, dexNo: number): DexField {
  // 불변 갱신 — 구독자가 변화를 감지할 수 있어야 한다.
  // new Uint8Array(view)는 ArrayBufferLike로 추론되므로 길이로 만들고 복사한다.
  const next = new Uint8Array(field.length)
  next.set(field)
  const i = dexNo - 1
  next[i >> 3]! |= 1 << (i & 7)
  return next
}

// ── 안농 글자 기록 (PARITY §6.8) ──────────────────────────────────────────────

/** 글자 스물여덟 (`UNOWN_FORM_COUNT`) — 알파벳 26 + `!` + `?` */
export const UNOWN_FORM_COUNT = 28

/**
 * 본 안농 글자를 적는다 (`SetUnownForm`).
 *
 * ⚠️ **비트필드가 아니라 「본 차례대로의 목록」이다.** 원작이 `unownFormsSeen`
 * 배열에 앞에서부터 채우고 0xFF로 끝을 표시한다 — 그래서 도감의 폼 쪽이
 * **처음 본 차례**로 늘어선다. 비트로 바꾸면 그 차례가 사라진다.
 *
 * 이미 본 글자면 그대로 돌려준다
 */
export function seeUnownForm(seen: readonly number[], form: number): readonly number[] {
  if (seen.includes(form)) return seen
  if (seen.length >= UNOWN_FORM_COUNT) return seen
  return [...seen, form]
}

/** 지금까지 본 글자 수 (`Pokedex_NumFormsSeen_Unown`) */
export function unownFormsSeen(seen: readonly number[]): number {
  return seen.length
}
