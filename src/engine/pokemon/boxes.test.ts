// 보관 시스템 자료 모형 (`boxes.ts`)
//
// 여기서 조용히 틀리는 것이 둘이다:
//
//   ① **칸이 성긴 것**. 목록으로 만들면 27번 칸의 한 마리가 0번으로 당겨져서,
//      화면에서 옮겨 둔 자리가 다음에 열 때 사라진다.
//   ② **지금 박스부터 훑는 것**. 0번부터 훑으면 박스를 옮겨 둬도 잡은 포켓몬이
//      늘 1번 박스로 들어간다 — 원작은 열어 둔 박스로 들어온다.
import { describe, expect, it } from 'vitest'
import {
  BOX_CAPACITY, BOX_COUNT, BOX_SIZE, countAll, countInBox, defaultWallpaper, emptyBoxes,
  freeSlots, knowsMove, nextSpace, onLastAliveMon, RELEASE_BLOCKING_MOVES, releaseFromBox,
  releaseRefusal, releaseReturns, store, swapSlots, withSlot,
} from './boxes'
import { FIELD_MOVES } from '../script/fieldMoves'
import { MAIL_ITEM_FIRST } from '../world/mail'
import type { PokemonInstance } from './instance'
import { noOrigin } from './origin'

/** 종족 번호만 다른 껍데기. 이 시험은 자리만 본다 */
function mon(species: number): PokemonInstance {
  return {
    species, pid: species, nickname: null, exp: 0, level: 5,
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [], hp: 20, status: 'ok', statusTurns: 0, heldItem: 0,
    friendship: 70, isEgg: false, otId: 0, otSecretId: 0, ball: 0,
    origin: noOrigin({ name: '', gender: 'male' }),
    form: 0,
    pokerus: 0, mail: null,
  }
}

describe('보관 시스템 크기', () => {
  it('원작과 같은 18박스 × 30칸이다', () => {
    // `MAX_PC_BOXES` 18 · `MAX_PC_ROWS × MAX_PC_COLS` 5 × 6
    expect(BOX_COUNT).toBe(18)
    expect(BOX_SIZE).toBe(30)
    expect(BOX_CAPACITY).toBe(540)
    const boxes = emptyBoxes()
    expect(boxes).toHaveLength(18)
    expect(boxes.every((b) => b.length === 30)).toBe(true)
    expect(freeSlots(boxes)).toBe(540)
  })

  /**
   * 벽지 16장으로 박스 18개를 덮는다 (`PCBoxes_InitInternal`).
   *
   * 16에서 0으로 되감으므로 **마지막 둘이 처음 둘과 같다**. 되감기를 빠뜨리면
   * 17·18번 박스에 없는 벽지 번호가 붙는다
   */
  it('벽지가 16장에서 되감긴다', () => {
    expect(defaultWallpaper(0)).toBe(0)
    expect(defaultWallpaper(15)).toBe(15)
    expect(defaultWallpaper(16)).toBe(0)
    expect(defaultWallpaper(17)).toBe(1)
  })
})

describe('자리 찾기', () => {
  it('지금 박스의 첫 빈 칸으로 간다', () => {
    const boxes = emptyBoxes()
    expect(nextSpace(boxes, 0)).toEqual({ box: 0, slot: 0 })
    expect(nextSpace(boxes, 5)).toEqual({ box: 5, slot: 0 })
  })

  it('앞을 안 당긴다 — 빈 칸이 있으면 그 칸이다', () => {
    // 27번에만 한 마리. 목록이었다면 이 한 마리가 0번으로 당겨졌을 것이다
    const boxes = withSlot(emptyBoxes(), { box: 3, slot: 27 }, mon(387))
    expect(boxes[3]![27]?.species).toBe(387)
    expect(boxes[3]![0]).toBeNull()
    expect(countInBox(boxes, 3)).toBe(1)
    expect(nextSpace(boxes, 3)).toEqual({ box: 3, slot: 0 })
  })

  it('지금 박스가 차면 다음 박스로 넘어간다', () => {
    let boxes = emptyBoxes()
    for (let slot = 0; slot < BOX_SIZE; slot++) {
      boxes = withSlot(boxes, { box: 4, slot }, mon(1))
    }
    expect(nextSpace(boxes, 4)).toEqual({ box: 5, slot: 0 })
  })

  it('마지막 박스가 차면 처음으로 되돈다', () => {
    let boxes = emptyBoxes()
    for (let slot = 0; slot < BOX_SIZE; slot++) {
      boxes = withSlot(boxes, { box: BOX_COUNT - 1, slot }, mon(1))
    }
    expect(nextSpace(boxes, BOX_COUNT - 1)).toEqual({ box: 0, slot: 0 })
  })

  it('540칸이 다 차면 자리가 없다', () => {
    let boxes = emptyBoxes()
    for (let box = 0; box < BOX_COUNT; box++) {
      for (let slot = 0; slot < BOX_SIZE; slot++) boxes = withSlot(boxes, { box, slot }, mon(1))
    }
    expect(countAll(boxes)).toBe(BOX_CAPACITY)
    expect(freeSlots(boxes)).toBe(0)
    expect(nextSpace(boxes, 0)).toBeNull()
    expect(store(boxes, 0, mon(2))).toBeNull()
  })
})

describe('넣고 바꾸기', () => {
  it('넣으면 새 배열이 온다 — 스토어가 바뀐 것을 알아야 한다', () => {
    const before = emptyBoxes()
    const after = store(before, 0, mon(387))
    expect(after).not.toBeNull()
    expect(after!.boxes).not.toBe(before)
    expect(before[0]![0]).toBeNull()
    expect(after!.boxes[0]![0]?.species).toBe(387)
    expect(after!.at).toEqual({ box: 0, slot: 0 })
    // 손대지 않은 박스는 그대로 물려준다 — 다시 그릴 이유가 없다
    expect(after!.boxes[1]).toBe(before[1])
  })

  it('박스가 달라도 자리를 맞바꾼다', () => {
    let boxes = withSlot(emptyBoxes(), { box: 0, slot: 3 }, mon(387))
    boxes = withSlot(boxes, { box: 7, slot: 20 }, mon(390))
    boxes = swapSlots(boxes, { box: 0, slot: 3 }, { box: 7, slot: 20 })
    expect(boxes[0]![3]?.species).toBe(390)
    expect(boxes[7]![20]?.species).toBe(387)
  })

  it('빈 칸과 바꾸면 자리를 옮긴 것이 된다', () => {
    const boxes = swapSlots(
      withSlot(emptyBoxes(), { box: 0, slot: 3 }, mon(387)),
      { box: 0, slot: 3 }, { box: 0, slot: 29 },
    )
    expect(boxes[0]![3]).toBeNull()
    expect(boxes[0]![29]?.species).toBe(387)
    expect(countInBox(boxes, 0)).toBe(1)
  })
})

/** 기술을 든 마리 */
function knowing(species: number, ...moves: number[]): PokemonInstance {
  return { ...mon(species), moves: moves.map((move) => ({ move, pp: 15, ppUps: 0 })) }
}

describe('놓아주기 (`BoxAppMan_ReleaseMonAction`)', () => {
  const SURF = FIELD_MOVES.surf.move
  const ROCK_CLIMB = FIELD_MOVES.rockClimb.move
  const WATERFALL = FIELD_MOVES.waterfall.move

  it('막는 기술은 파도타기·락클라임·폭포오르기 셋뿐이다 (`sReleaseBlockingMoves`)', () => {
    expect([...RELEASE_BLOCKING_MOVES].sort()).toEqual([SURF, ROCK_CLIMB, WATERFALL].sort())
    // 풀베기·공중날기·괴력은 없다 — 하나뿐이어도 놓아줄 수 있다
    for (const id of ['cut', 'fly', 'strength', 'defog', 'rockSmash'] as const) {
      expect(RELEASE_BLOCKING_MOVES).not.toContain(FIELD_MOVES[id].move)
    }
  })

  it('알은 기술을 모르는 것으로 친다 (`BoxPokemon_HasMove`)', () => {
    expect(knowsMove(knowing(7, SURF), SURF)).toBe(true)
    expect(knowsMove({ ...knowing(7, SURF), isEgg: true }, SURF)).toBe(false)
  })

  it('묻기 전에 막는 차례 — 알 → 편지 → 파티의 마지막 한 마리', () => {
    const egg = { ...mon(7), isEgg: true, heldItem: MAIL_ITEM_FIRST }
    expect(releaseRefusal(egg, [egg], true)).toBe('egg')
    const mailed = { ...mon(7), heldItem: MAIL_ITEM_FIRST + 11 }
    expect(releaseRefusal(mailed, [mailed], true)).toBe('mail')
    const only = mon(7)
    expect(releaseRefusal(only, [only], true)).toBe('lastMon')
    // 박스 자리에서 고른 마리는 마지막 한 마리를 안 본다
    expect(releaseRefusal(only, [only], false)).toBeNull()
    // 편지지 아닌 도구는 들고 떠난다
    expect(releaseRefusal({ ...mon(7), heldItem: MAIL_ITEM_FIRST - 1 }, [mon(1), mon(2)], true)).toBeNull()
  })

  it('살아 있는 수를 센다 — 알과 기절한 마리는 싸울 수 없다 (`BoxAppMan_OnLastAliveMon`)', () => {
    const a = mon(1), egg = { ...mon(2), isEgg: true }, down = { ...mon(3), hp: 0 }
    expect(onLastAliveMon([a, egg], a)).toBe(true)
    expect(onLastAliveMon([a, down], a)).toBe(true)
    expect(onLastAliveMon([a, mon(4)], a)).toBe(false)
    // 빼려는 것이 알이거나 기절했으면 남은 하나가 그대로 싸운다
    expect(onLastAliveMon([a, egg], egg)).toBe(false)
    expect(onLastAliveMon([a, down], down)).toBe(false)
  })

  it('그 기술을 아는 마리가 하나뿐이면 되돌아온다 — 박스와 파티를 통틀어 센다', () => {
    const surfer = knowing(7, SURF)
    let boxes = withSlot(emptyBoxes(), { box: 3, slot: 9 }, surfer)
    expect(releaseReturns(boxes, [mon(1)], surfer)).toBe(true)
    // 파티에 하나 더 있으면 놓아줄 수 있다
    expect(releaseReturns(boxes, [knowing(1, SURF)], surfer)).toBe(false)
    // 다른 박스에 있어도 센다
    boxes = withSlot(boxes, { box: 17, slot: 29 }, knowing(9, SURF, WATERFALL))
    expect(releaseReturns(boxes, [mon(1)], surfer)).toBe(false)
    // ⚠️ 알이 그 기술을 들고 있어도 안 센다
    const eggBoxes = withSlot(withSlot(emptyBoxes(), { box: 0, slot: 0 }, surfer), { box: 0, slot: 1 }, { ...knowing(9, SURF), isEgg: true })
    expect(releaseReturns(eggBoxes, [], surfer)).toBe(true)
  })

  it('아는 기술 가운데 하나라도 혼자면 되돌아온다', () => {
    const both = knowing(7, SURF, ROCK_CLIMB)
    const boxes = withSlot(emptyBoxes(), { box: 0, slot: 0 }, both)
    // 파도타기는 둘이지만 락클라임은 이 마리뿐이다
    expect(releaseReturns(boxes, [knowing(1, SURF)], both)).toBe(true)
    expect(releaseReturns(boxes, [knowing(1, SURF), knowing(2, ROCK_CLIMB)], both)).toBe(false)
  })

  it('막는 기술을 모르면 늘 놓아준다', () => {
    const plain = knowing(7, FIELD_MOVES.cut.move)
    const boxes = withSlot(emptyBoxes(), { box: 0, slot: 0 }, plain)
    expect(releaseReturns(boxes, [], plain)).toBe(false)
  })

  it('놓아주면 그 자리만 빈다 — 뒤를 당기지 않는다', () => {
    let boxes = withSlot(emptyBoxes(), { box: 2, slot: 4 }, mon(387))
    boxes = withSlot(boxes, { box: 2, slot: 5 }, mon(390))
    const after = releaseFromBox(boxes, { box: 2, slot: 4 })
    expect(after[2]![4]).toBeNull()
    expect(after[2]![5]?.species).toBe(390)
    expect(boxes[2]![4]?.species).toBe(387)
    expect(countAll(after)).toBe(1)
  })
})
