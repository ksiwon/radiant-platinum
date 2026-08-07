// 포켓몬 보관 시스템 (DATA.md §2.20)
//
// 원작의 `PCBoxes`를 그대로 옮긴 것이다 (`src/pc_boxes.c`). 크기는 짐작이 아니라
// 헤더에 적힌 값이다:
//
//   MAX_PC_BOXES              18
//   MAX_PC_ROWS × MAX_PC_COLS 5 × 6 = 30    ← 화면의 격자 모양이 곧 자료 모양이다
//
// ⚠️ **칸이 성기다.** 박스는 "들어 있는 것의 목록"이 아니라 **자리 30개**다.
// 27번 칸에 한 마리만 있을 수 있고, 그 앞을 당기지 않는다. 목록으로 두면 화면에서
// 자리를 옮길 수가 없다 — 원작에서 박스는 옮겨 놓는 곳이지 담아 두는 곳이 아니다.
import type { PokemonInstance } from './instance'

/** 박스 수 (`MAX_PC_BOXES`) */
export const BOX_COUNT = 18
/** 한 박스의 줄과 칸 (`MAX_PC_ROWS` · `MAX_PC_COLS`). 화면 격자가 이 모양이다 */
export const BOX_ROWS = 5
export const BOX_COLS = 6
/** 한 박스의 자리 수 (`MAX_MONS_PER_BOX`) */
export const BOX_SIZE = BOX_ROWS * BOX_COLS
/** 다 채우면 몇 마리인가. 18 × 30 = 540 */
export const BOX_CAPACITY = BOX_COUNT * BOX_SIZE

/**
 * 처음부터 있는 벽지 수 (`MAX_DEFAULT_WALLPAPERS`).
 *
 * 박스는 18개인데 벽지는 16장이라 **마지막 둘이 처음 둘과 같은 벽지로 시작한다**
 * (`PCBoxes_InitInternal`이 16에서 0으로 되감는다). 원작이 그렇다
 */
export const DEFAULT_WALLPAPERS = 16

/**
 * 보관 시스템을 여는 갈래 (`OpenPokemonStorage`의 인자).
 *
 * PC 메뉴의 항목 순서가 곧 이 번호다 (`CommonScript_InitStorageSystemMenu`).
 * 3(도구 옮긴다)·4(비교한다)는 아직 화면이 없다
 */
export const BOX_MODE = { deposit: 0, withdraw: 1, move: 2, items: 3, compare: 4 } as const

/** 한 박스. 빈 자리는 null이다 */
export type Box = (PokemonInstance | null)[]
export type Boxes = Box[]

/** 자리 하나 */
export interface BoxSpot {
  box: number
  slot: number
}

export function emptyBoxes(): Boxes {
  return Array.from({ length: BOX_COUNT }, () => Array.from({ length: BOX_SIZE }, () => null))
}

/** 박스 번호 → 처음 깔리는 벽지 번호 (`PCBoxes_InitInternal`) */
export function defaultWallpaper(box: number): number {
  return box % DEFAULT_WALLPAPERS
}

/** 한 박스에 들어 있는 수 (`PCBoxes_CountMonsInBox`) */
export function countInBox(boxes: Boxes, box: number): number {
  return boxes[box]?.reduce<number>((n, mon) => n + (mon ? 1 : 0), 0) ?? 0
}

/** 전부 몇 마리인가 (`PCBoxes_CountAllBoxMons`) */
export function countAll(boxes: Boxes): number {
  let n = 0
  for (let box = 0; box < boxes.length; box++) n += countInBox(boxes, box)
  return n
}

/** 남은 자리 수 (`GetPCBoxesFreeSlotCount`가 돌려주는 값) */
export function freeSlots(boxes: Boxes): number {
  return BOX_CAPACITY - countAll(boxes)
}

/**
 * 빈 자리를 찾는다 (`PCBoxes_TryGetNextAvailableSpace`).
 *
 * ⚠️ **지금 박스에서 시작해 한 바퀴 돈다.** 0번부터 훑는 것이 아니다 — 원작에서
 * 잡은 포켓몬은 "지금 열려 있는 박스"로 가고, 거기가 차 있으면 다음 박스로
 * 넘어간다. 그래서 박스를 옮겨 두면 잡히는 자리도 따라 옮겨진다
 */
export function nextSpace(boxes: Boxes, current: number): BoxSpot | null {
  const start = ((current % BOX_COUNT) + BOX_COUNT) % BOX_COUNT
  for (let step = 0; step < BOX_COUNT; step++) {
    const box = (start + step) % BOX_COUNT
    const slot = boxes[box]?.findIndex((mon) => mon === null) ?? -1
    if (slot >= 0) return { box, slot }
  }
  return null
}

/**
 * 한 마리를 넣는다 (`PCBoxes_TryStoreBoxMon`). 자리가 없으면 null.
 *
 * 새 배열을 돌려준다 — 스토어가 바뀐 것을 알아야 한다
 */
export function store(
  boxes: Boxes, current: number, mon: PokemonInstance,
): { boxes: Boxes; at: BoxSpot } | null {
  const at = nextSpace(boxes, current)
  if (at === null) return null
  return { boxes: withSlot(boxes, at, mon), at }
}

/** 자리 하나를 갈아 끼운 새 박스 묶음 */
export function withSlot(boxes: Boxes, at: BoxSpot, mon: PokemonInstance | null): Boxes {
  const next = boxes.map((box, i) => (i === at.box ? [...box] : box))
  next[at.box]![at.slot] = mon
  return next
}

/** 두 자리를 맞바꾼다. 박스가 달라도 된다 — 화면에서 집어 옮기는 것이 이것이다 */
export function swapSlots(boxes: Boxes, a: BoxSpot, b: BoxSpot): Boxes {
  const held = boxes[a.box]?.[a.slot] ?? null
  const other = boxes[b.box]?.[b.slot] ?? null
  return withSlot(withSlot(boxes, a, other), b, held)
}
