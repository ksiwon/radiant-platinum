// 씰케이스 (PARITY §4.11) — `unk_0202C9F4.c`의 `SealCase`
//
// 볼에 붙이는 씰의 개수 표다. 해님시티 시장이 팔고(`SunyshoreMarket*`) 신수마을 동쪽 집이 안농 모양 씰을 건넨다.
//
// ⚠️ **캡슐(볼에 붙이는 판)은 안 만든다.** 원작은 씰이 「케이스에 든 것」과 「캡슐에 붙은 것」으로 갈리고 한 종류를 합쳐 99장까지다
// (`SealCase_CountSealOccurrenceAnywhere`) — 캡슐이 없으니 케이스에 든 것이 전부다. 그래서 `GiveOrTakeSeal`의 상한 검사는 케이스 개수만 본다.
// ⚠️ **번호는 1부터다.** 칸 배열의 색인은 번호 − 1이다 (`sealCase->seals.count[sealId - 1]`).
import { MAX_SEALS_PER_TYPE, SEAL_KINDS } from './sealTables'

/** 리포트에 담기는 모양 — 종류마다 가진 장수 */
export type SealCase = readonly number[]

/** 빈 케이스 */
export function newSealCase(): number[] {
  return Array.from({ length: SEAL_KINDS }, () => 0)
}

/** 그 씰이 몇 장인가. 번호 밖이면 0이다 */
export function countSeal(seals: SealCase, id: number): number {
  return seals[id - 1] ?? 0
}

/** 케이스에 든 씰의 종류 수 (`SealCase_CountUniqueSeals`) */
export function uniqueSeals(seals: SealCase): number {
  return seals.filter((n) => n > 0).length
}

/** 케이스에 든 씰의 총 장수 — 가방의 「씰케이스」 한 줄이 읽는다 (`BagContext_FormatUsageMessage`) */
export function totalSeals(seals: SealCase): number {
  return seals.reduce((n, c) => n + c, 0)
}

/**
 * 더하거나 뺄 수 있는가 (`SealCase_CheckSealCount`). 음수는 가진 만큼까지, 양수는 99장 상한까지다
 */
export function canGiveOrTake(seals: SealCase, id: number, quantity: number): boolean {
  if (id < 1 || id > SEAL_KINDS) return false
  const have = countSeal(seals, id)
  return quantity < 0 ? have + quantity >= 0 : have + quantity <= MAX_SEALS_PER_TYPE
}

/**
 * 더하거나 뺀다 (`GiveOrTakeSeal`). 못 하면 **그대로** 돌려준다 — 원작이 0을 돌려주고 아무것도 안 한다
 */
export function giveOrTakeSeal(seals: SealCase, id: number, quantity: number): { seals: SealCase, ok: boolean } {
  if (!canGiveOrTake(seals, id, quantity)) return { seals, ok: false }
  const next = [...seals]
  next[id - 1] = countSeal(seals, id) + quantity
  return { seals: next, ok: true }
}
