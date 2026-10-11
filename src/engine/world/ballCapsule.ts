// 볼캡슐 (PARITY §4.11) — `struct_defs/seal_case.h`의 `BallCapsule`
//
// 캡슐은 열둘이고 한 캡슐에 씰 여덟 장이 붙는다. 씰 한 장은 「종류 · x · y」다. 캡슐을 포켓몬에 붙이면
// **캡슐의 사본**이 포켓몬에 따라간다(`MON_DATA_BALL_CAPSULE`) — 원작이 캡슐 번호(`MON_DATA_BALL_CAPSULE_ID`)와 사본을 함께 적는다.
//
// ⚠️ **끌어 놓기가 없다.** 원작 편집기는 터치로 씰을 끌어 ball 그림 위에 놓지만(`ov76_0223D338`) 우리는 목록에서 씰을
// 고르고 고정 칸 여덟 곳에서 칸을 고른다. 칸 자리는 편집기 좌표계 안이다 — 입자 위치가 이 좌표에서 나오므로
// (`ov12_022365D4`: 가운데 (190, 70)에서 떨어진 거리) 원작의 범위(반지름 60 안, `ov12_02237EA0`의 시차 표)를 넘지 않게 둔다.
// ⚠️ **씰 한 종류는 케이스 + 캡슐 위 합쳐 99장까지다** (`SealCase_CountSealOccurrenceAnywhere` · `GiveOrTakeSeal`).
import { MAX_SEALS_PER_TYPE, SEAL_KINDS } from './sealTables'
import { countSeal } from './sealCase'

/** 캡슐 수 (`TOTAL_CAPSULES`) */
export const TOTAL_CAPSULES = 12
/** 캡슐 하나에 붙는 씰 수 (`SEALS_PER_CAPSULE`) */
export const SEALS_PER_CAPSULE = 8

/** 씰 한 장. 종류 0은 빈 칸이다 (`BallSeal`) */
export interface BallSeal {
  type: number
  x: number
  y: number
}

/** 캡슐 하나 — 칸 여덟 */
export type Capsule = readonly BallSeal[]

/**
 * 고정 칸 여덟 곳의 자리. 편집기 좌표계에서 가운데 (190, 70) 둘레의 3×3에서 가운데를 뺀 것이다
 * (가장 먼 모서리가 거리 42라 시차 표의 둘째 구간 안이다 — `ov12_02237EA0`)
 */
export const SLOT_CENTER = { x: 190, y: 70 } as const
export const CAPSULE_SLOTS: readonly { x: number, y: number }[] = [
  { x: 160, y: 40 }, { x: 190, y: 40 }, { x: 220, y: 40 },
  { x: 160, y: 70 }, { x: 220, y: 70 },
  { x: 160, y: 100 }, { x: 190, y: 100 }, { x: 220, y: 100 },
]

/** 빈 캡슐. 칸마다 자리는 고정이라 종류만 0이다 */
export function emptyCapsule(): BallSeal[] {
  return CAPSULE_SLOTS.map((s) => ({ type: 0, x: s.x, y: s.y }))
}

/** 열둘 모두 빈 캡슐 */
export function newCapsules(): BallSeal[][] {
  return Array.from({ length: TOTAL_CAPSULES }, () => emptyCapsule())
}

/** 붙은 씰만 (`ballSeal.type != 0`) */
export function sealsOf(capsule: Capsule): BallSeal[] {
  return capsule.filter((s) => s.type !== 0 && s.type <= SEAL_KINDS)
}

/** 씰이 한 장이라도 붙었는가 (`ov76_0223D430`) — 비어 있으면 포켓몬에 못 붙인다 */
export function hasSeals(capsule: Capsule): boolean {
  return capsule.some((s) => s.type !== 0)
}

/** 모든 캡슐 위에 붙은 그 종류의 장수 (`SealCase_CountSealOccurrenceInUse`) */
export function sealsInUse(capsules: readonly Capsule[], id: number): number {
  let n = 0
  for (const c of capsules) for (const s of c) if (s.type === id) n++
  return n
}

/** 케이스 + 캡슐 위 (`SealCase_CountSealOccurrenceAnywhere`) */
export function sealsAnywhere(seals: readonly number[], capsules: readonly Capsule[], id: number): number {
  return countSeal(seals, id) + sealsInUse(capsules, id)
}

/** 어디에든 한 장이라도 있는 종류 수 (`SealCase_CountUniqueSeals`) */
export function uniqueSealsAnywhere(seals: readonly number[], capsules: readonly Capsule[]): number {
  let n = 0
  for (let id = 1; id <= SEAL_KINDS; id++) if (sealsAnywhere(seals, capsules, id) > 0) n++
  return n
}

/** 케이스와 캡슐 위 합쳐 더 받을 수 있는가 — 99장 상한이다 (`GiveOrTakeSeal`) */
export function canReceiveSeal(seals: readonly number[], capsules: readonly Capsule[], id: number, quantity: number): boolean {
  if (id < 1 || id > SEAL_KINDS) return false
  if (quantity < 0) return countSeal(seals, id) + quantity >= 0
  return sealsAnywhere(seals, capsules, id) + quantity <= MAX_SEALS_PER_TYPE
}

/** 캡슐과 케이스가 함께 바뀌는 결과 */
interface CapsuleEdit {
  seals: number[]
  capsules: BallSeal[][]
}

/**
 * 씰 한 장을 캡슐 칸에 붙인다 (`ov76_0223D338`의 놓기 — 케이스에서 한 장 빼서 `GiveOrTakeSeal(−1)`).
 * 칸에 이미 씰이 있으면 그것은 케이스로 돌아온다. 케이스에 없으면 `null`이다
 */
export function placeSeal(
  seals: readonly number[], capsules: readonly Capsule[], capsule: number, slot: number, type: number,
): CapsuleEdit | null {
  const target = capsules[capsule]
  const at = target?.[slot]
  if (at === undefined || type < 1 || type > SEAL_KINDS) return null
  if (countSeal(seals, type) < 1) return null
  const nextSeals = [...seals]
  if (at.type !== 0) nextSeals[at.type - 1] = countSeal(nextSeals, at.type) + 1
  nextSeals[type - 1] = countSeal(nextSeals, type) - 1
  return { seals: nextSeals, capsules: replaceSlot(capsules, capsule, slot, type) }
}

/** 칸의 씰을 케이스로 되돌린다 (`GiveOrTakeSeal2(+1)`). 빈 칸이면 `null` */
export function removeSeal(
  seals: readonly number[], capsules: readonly Capsule[], capsule: number, slot: number,
): CapsuleEdit | null {
  const at = capsules[capsule]?.[slot]
  if (at === undefined || at.type === 0) return null
  const nextSeals = [...seals]
  nextSeals[at.type - 1] = Math.min(MAX_SEALS_PER_TYPE, countSeal(nextSeals, at.type) + 1)
  return { seals: nextSeals, capsules: replaceSlot(capsules, capsule, slot, 0) }
}

function replaceSlot(capsules: readonly Capsule[], capsule: number, slot: number, type: number): BallSeal[][] {
  return capsules.map((c, i) => c.map((s, j) => (i === capsule && j === slot ? { ...s, type } : { ...s })))
}

/** 포켓몬이 지닌 캡슐 — 번호(1~12)와 그때의 사본 */
export interface MonCapsule {
  id: number
  seals: BallSeal[]
}

interface Carrier {
  capsule?: MonCapsule | undefined
}

/** 붙인 포켓몬이 있는 캡슐 번호(0부터)마다의 파티 자리 (`unk_04[i].unk_00`) */
export function carrierOf(party: readonly Carrier[], capsule: number): number {
  return party.findIndex((m) => m.capsule?.id === capsule + 1)
}

/**
 * 캡슐을 포켓몬에 붙인다. 이미 캡슐이 있으면 `null`이다 (`PartyMenu_Text_TwoCapsulesCantBeSet`).
 * 캡슐이 비었거나 이미 다른 포켓몬에 붙었어도 `null`이다 — 한 캡슐은 한 마리뿐이다
 */
export function attachCapsule<T extends Carrier>(
  party: readonly T[], capsules: readonly Capsule[], capsule: number, slot: number,
): T[] | null {
  const mon = party[slot]
  const source = capsules[capsule]
  if (mon === undefined || source === undefined) return null
  if (mon.capsule !== undefined || !hasSeals(source)) return null
  if (carrierOf(party, capsule) >= 0) return null
  return party.map((m, i) => (i === slot ? { ...m, capsule: { id: capsule + 1, seals: source.map((s) => ({ ...s })) } } : m))
}

/** 포켓몬에서 캡슐을 뗀다 (`Pokemon_ClearBallCapsuleData`). 씰은 캡슐 위에 그대로 남는다 */
export function detachCapsule<T extends Carrier>(party: readonly T[], slot: number): T[] {
  return party.map((m, i) => {
    if (i !== slot || m.capsule === undefined) return m
    const rest = { ...m }
    delete rest.capsule
    return rest
  })
}

/** 캡슐을 고친 뒤 붙은 포켓몬의 사본을 새로 맞춘다 (편집기를 나갈 때 원작이 하는 일) */
export function syncCarriers<T extends Carrier>(party: readonly T[], capsules: readonly Capsule[]): T[] {
  return party.map((m) => {
    const c = m.capsule
    const source = c === undefined ? undefined : capsules[c.id - 1]
    if (c === undefined || source === undefined) return m
    return { ...m, capsule: { id: c.id, seals: source.map((s) => ({ ...s })) } }
  })
}

/**
 * 캡슐 둘의 자리를 맞바꾼다 (`ov76_0223C80C`). 붙은 포켓몬은 캡슐 **번호**가 서로 바뀐다 — 캡슐이 포켓몬을 따라가는 것이 아니라
 * 번호가 따라간다. 사본은 바뀐 번호의 내용으로 다시 맞춘다
 */
export function swapCapsules<T extends Carrier>(
  capsules: readonly Capsule[], party: readonly T[], a: number, b: number,
): { capsules: BallSeal[][], party: T[] } {
  const swapped = capsules.map((c, i) => (i === a ? capsules[b] : i === b ? capsules[a] : c))
  const next = swapped.map((c) => (c ?? emptyCapsule()).map((s) => ({ ...s })))
  const moved = party.map((m) => {
    const id = m.capsule?.id
    if (m.capsule === undefined || (id !== a + 1 && id !== b + 1)) return m
    return { ...m, capsule: { ...m.capsule, id: id === a + 1 ? b + 1 : a + 1 } }
  })
  return { capsules: next, party: syncCarriers(moved, next) }
}
