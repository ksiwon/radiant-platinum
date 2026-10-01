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
import { mailTypeOfItem } from '../world/mail'

/** 편지지인가 (`Item_IsMail`) */
const isMailItem = (item: number): boolean => mailTypeOfItem(item) !== null

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
const DEFAULT_WALLPAPERS = 16

/**
 * 보관 시스템을 여는 갈래 (`OpenPokemonStorage`의 인자).
 *
 * PC 메뉴의 항목 순서가 곧 이 번호다 (`CommonScript_InitStorageSystemMenu`)
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

// ── 놓아주기 (`box_app_manager.c`의 `BoxAppMan_ReleaseMonAction`) ─────────────

/**
 * 놓아주기를 막는 기술 셋 (`sReleaseBlockingMoves`) — 파도타기 57 · 락클라임 431 ·
 * 폭포오르기 127. 번호는 `script/fieldMoves`의 `FIELD_MOVES`와 같다 (시험이 맞댄다).
 *
 * ⚠️ **비전기술 전부가 아니다.** 풀베기·공중날기·괴력·안개제거·바위깨기는 이 표에
 * 없어서 몇 마리가 알든 놓아줄 수 있다
 */
export const RELEASE_BLOCKING_MOVES: readonly number[] = [57, 431, 127]

/** 그 기술을 아는가 (`BoxPokemon_HasMove`). ⚠️ 알은 아무 기술도 모르는 것으로 친다 */
export function knowsMove(mon: PokemonInstance, move: number): boolean {
  return !mon.isEgg && mon.moves.some((slot) => slot.move === move)
}

/**
 * 이 한 마리를 빼면 싸울 것이 없어지는가 (`BoxAppMan_OnLastAliveMon`).
 *
 * 파티에서 **알이 아니고 HP가 남은** 마리를 센다. 둘이면 괜찮다. 하나 이하라도
 * 빼려는 마리가 알이거나 기절해 있으면 괜찮다 — 원작이 그 마리를 따로 한 번 더 본다
 */
export function onLastAliveMon(party: readonly PokemonInstance[], mon: PokemonInstance): boolean {
  let alive = 0
  for (const m of party) {
    if (!m.isEgg && m.hp > 0) alive++
    if (alive >= 2) return false
  }
  if (mon.isEgg) return false
  return mon.hp > 0
}

/** 놓아주기를 묻기도 전에 막는 까닭. 글은 `box_messages`의 31 · 30 · 6이다 */
export type ReleaseRefusal = 'egg' | 'mail' | 'lastMon'

/**
 * 물어보기 전에 막는다 (`BoxAppMan_CheckReleaseMonValid`). 차례도 원작대로다 —
 * 알 → 편지 → (파티 자리일 때만) 마지막 한 마리.
 *
 * ⚠️ 원작은 편지 다음에 **볼캡슐**도 본다(`MON_DATA_BALL_CAPSULE_ID`). 우리 마리에는
 * 볼캡슐 칸이 없어서 그 갈래가 설 수 없다
 *
 * @param inParty 파티 자리에서 고른 것인가. 박스 자리면 마지막 한 마리를 안 본다
 */
export function releaseRefusal(
  mon: PokemonInstance, party: readonly PokemonInstance[], inParty: boolean,
): ReleaseRefusal | null {
  if (mon.isEgg) return 'egg'
  if (isMailItem(mon.heldItem)) return 'mail'
  if (inParty && onLastAliveMon(party, mon)) return 'lastMon'
  return null
}

/**
 * 예를 고른 뒤 **되돌아오는가** (`BoxAppMan_CheckShouldMonReturn` ·
 * `CheckLastMonWithReleaseBlockingMove`).
 *
 * 막는 기술 셋 가운데 이 마리가 아는 것마다, 박스 열여덟과 파티를 통틀어 그 기술을
 * 아는 마리를 센다. **하나뿐**(곧 이 마리)인 기술이 있으면 되돌아온다 — 「되돌아와
 * 버렸다!」「걱정했었나...」. 묻기 전에 막는 것이 아니라 예를 고른 **뒤에** 갈린다.
 *
 * ⚠️ 이 마리가 `boxes`나 `party` 안에 있어야 한다 — 원작도 커서 밑의 마리는 자리에서
 * 세고, 커서에 든 마리만 따로 더한다(`monHeldInCursor`)
 */
export function releaseReturns(
  boxes: Boxes, party: readonly PokemonInstance[], mon: PokemonInstance,
): boolean {
  for (const move of RELEASE_BLOCKING_MOVES) {
    if (!knowsMove(mon, move)) continue
    let count = 0
    for (const box of boxes) for (const m of box) if (m && knowsMove(m, move)) count++
    for (const m of party) if (knowsMove(m, move)) count++
    if (count === 1) return true
  }
  return false
}

/** 박스 한 자리를 비운다 (`BoxAppMan_RemoveMonUnderCursor`의 박스 갈래). 지닌 도구도 함께 떠난다 */
export function releaseFromBox(boxes: Boxes, at: BoxSpot): Boxes {
  return withSlot(boxes, at, null)
}

// ── 요약 화면 (`pokemon_summary_screen/main.c`) ─────────────────────────────

/**
 * 요약에서 ↑↓로 넘어갈 다음 자리 (`TryAdvancePartyMonIndex` · `TryAdvanceBoxMonIndex`).
 * 못 가면 -1이다 — 끝에서 돌지 않는다.
 *
 * ⚠️ **빈 자리는 건너뛴다.** 박스에서 연 요약은 서른 칸 전부를 넘겨 보는데(`monMax =
 * MAX_MONS_PER_BOX`) 그 사이의 빈 칸에는 서지 않는다.
 *
 * ⚠️ **알은 메모 쪽에서만 선다** (`CanAdvanceToEgg`). 정보·능력·기술 쪽에서 넘기면 알을
 * 건너뛴다 — 알이면 그 쪽들이 막혀 있어서, 서 버리면 보던 쪽이 바뀐다
 */
export function nextSummaryMon(
  mons: readonly (PokemonInstance | null | undefined)[], at: number, delta: number, eggOk: boolean,
): number {
  for (let i = at + delta; i >= 0 && i < mons.length; i += delta) {
    const mon = mons[i]
    if (!mon) continue
    if (mon.isEgg && !eggOk) continue
    return i
  }
  return -1
}

/**
 * 기술 두 칸을 맞바꾼 마리 (`BoxPokemon_SwapMoveSlots`) — 기술·PP·포인트업을 **한 벌로**
 * 옮긴다. 요약의 기술 쪽에서 Z 두 번으로 바꾸는 것이 이것이다 (`SwapSelectedMoves`).
 * 같은 칸이거나 칸 밖이면 그대로 돌려준다
 */
export function swapMoveSlots(mon: PokemonInstance, a: number, b: number): PokemonInstance {
  const first = mon.moves[a], second = mon.moves[b]
  if (a === b || !first || !second) return mon
  const moves = [...mon.moves]
  moves[a] = second
  moves[b] = first
  return { ...mon, moves }
}
