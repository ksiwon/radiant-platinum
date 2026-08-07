// 기술 창에서 쓰는 비전머신 (DATA.md §4.6)
//
// 앞에 대고 A를 누르는 길과 **조건이 같아야** 한다 — 원작도 두 길이 같은
// `FieldMoves_Check*`를 지난다. 다른 것은 여기서는 "왜 안 되는지"를 돌려준다는
// 것뿐이고, 그 이유가 화면에 뜬다.
import { describe, it, expect, beforeEach } from 'vitest'
import { fieldMoveFromMenu, fieldScripts } from './field'
import { BADGE, FIELD_MOVES } from './fieldMoves'
import { world as mapWorld } from '../map/world'
import { worldState } from '../../state/worldState'
import { npcActors } from '../actor/npcs'
import type { MapGrid } from '../map/grid'
import type { NpcActor } from '../actor/npcs'

/** 필요한 것만 갖춘 격자. `behavior`가 주는 값을 시험이 갈아 끼운다 */
function fakeGrid(behavior: number) {
  return {
    behavior: () => behavior,
    isBlocked: () => false,
  } as unknown as MapGrid
}

/** 뱃지와 파티를 세운다 */
function trainer(badges: number, moves: number[]) {
  fieldScripts.services = {
    fieldMoves: { badges: () => badges, knows: (m) => moves.includes(m) },
  }
}

const SURF = FIELD_MOVES.surf.move
const CUT = FIELD_MOVES.cut.move
const FLY = FIELD_MOVES.fly.move
/** `WATER_SEA` */
const WATER = 0x15

beforeEach(() => {
  npcActors.list = []
  worldState.player.position.set(0.5, 0, 0.5)
  worldState.player.facing = 0 // +z
  worldState.player.surfing = false
  worldState.player.strength = false
  worldState.player.hop.active = false
  mapWorld.grid = fakeGrid(0)
  fieldScripts.services = {}
})

describe('기술 창에서 쓴다', () => {
  it('비전머신이 아닌 기술은 아무것도 아니다', () => {
    trainer(0xff, [1])
    // 1번은 막치기다. 밖에서 쓸 것이 아니므로 null이 나와야 한다
    expect(fieldMoveFromMenu(1)).toBeNull()
  })

  it('뱃지가 없으면 뱃지 탓이라고 말한다', () => {
    mapWorld.grid = fakeGrid(WATER)
    trainer(0, [SURF])
    expect(fieldMoveFromMenu(SURF)).toBe('badge')
  })

  it('그 기술을 아는 파티원이 없으면 파티 탓이라고 말한다', () => {
    mapWorld.grid = fakeGrid(WATER)
    trainer(1 << BADGE.fen, [])
    expect(fieldMoveFromMenu(SURF)).toBe('party')
  })

  it('자격이 있어도 자리가 아니면 안 나간다', () => {
    // 물이 아닌 데서 파도타기
    mapWorld.grid = fakeGrid(0)
    trainer(1 << BADGE.fen, [SURF])
    expect(fieldMoveFromMenu(SURF)).toBe('notHere')
    expect(worldState.player.surfing).toBe(false)
  })

  it('물 앞에서 자격이 있으면 실제로 탄다', () => {
    mapWorld.grid = fakeGrid(WATER)
    trainer(1 << BADGE.fen, [SURF])
    expect(fieldMoveFromMenu(SURF)).toBe('used')
    expect(worldState.player.surfing).toBe(true)
    // 물 칸으로 한 칸 뛴다 — 뭍에 선 채로 상태만 세우면 그 프레임에 내린다
    expect(worldState.player.hop.active).toBe(true)
  })

  it('벨 나무 앞에서는 그 나무가 사라진다', () => {
    const tree: NpcActor = {
      localID: 0,
      info: { sprite: 86 } as NpcActor['info'],
      x: 0, z: 1, y: 0, dir: 0, visible: true, movementType: 0, params: [], ambient: null,
    }
    npcActors.list = [tree]
    trainer(1 << BADGE.forest, [CUT])
    expect(fieldMoveFromMenu(CUT)).toBe('used')
    expect(tree.visible).toBe(false)
    // 나무가 없으면 벨 것도 없다
    expect(fieldMoveFromMenu(CUT)).toBe('notHere')
  })

  it('공중날기는 여기서 안 끝난다 — 어디로 갈지는 화면이 고른다', () => {
    trainer(1 << BADGE.cobble, [FLY])
    expect(fieldMoveFromMenu(FLY)).toBe('fly')
    // 뱃지가 없으면 목적지를 물어보기 전에 걸린다
    trainer(0, [FLY])
    expect(fieldMoveFromMenu(FLY)).toBe('badge')
  })

  it('이미 타고 있으면 파도타기가 다시 안 나간다', () => {
    mapWorld.grid = fakeGrid(WATER)
    trainer(1 << BADGE.fen, [SURF])
    worldState.player.surfing = true
    expect(fieldMoveFromMenu(SURF)).toBe('notHere')
  })
})
