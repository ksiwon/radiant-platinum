// 비전머신 표가 맞는가 (DATA.md §2.10)
//
// 표를 옮기는 일은 조용히 틀리기 좋다 — 뱃지 여덟과 기술 아홉을 짝지으면서
// 하나만 어긋나도 "왜 안 되지"로만 보인다. 그래서 두 가지를 따로 잰다:
//
//  ① **기술 번호**는 우리 한국어 이름표(`names/moves.ko.json`)로 되짚는다.
//     이름표는 롬에서 뽑은 것이고 표는 디컴프에서 옮긴 것이라 서로 독립이다.
//  ② **뱃지 짝**은 눈으로 보면 뒤집힌 것처럼 보이는 자리가 있다 — 괴력이
//     무쇠가 아니라 광산뱃지고, 바위깨기가 무쇠뱃지다. 그래서 여기 적어 둔다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  BADGE, FIELD_MOVES, TILE_BEHAVIOR_ROCK_CLIMB_EW, TILE_BEHAVIOR_ROCK_CLIMB_NS,
  TILE_BEHAVIOR_WATERFALL, canRockClimb, fieldMoveHere, movesUsableHere, whyNot,
  type FieldSpot,
} from './fieldMoves'
import { Behavior } from '../map/zone'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'names/moves.ko.json'))
const maybe = present ? describe : describe.skip

maybe('기술 번호', () => {
  it('아홉 개가 롬 이름표와 맞는다', () => {
    const names = JSON.parse(readFileSync(resolve(DATA, 'names/moves.ko.json'), 'utf8')) as string[]
    // 이름표는 롬에서, 번호는 디컴프에서 왔다. 아홉이 다 맞으면 우연이 아니다
    expect(names[FIELD_MOVES.cut.move]).toBe('풀베기')
    expect(names[FIELD_MOVES.fly.move]).toBe('공중날기')
    expect(names[FIELD_MOVES.surf.move]).toBe('파도타기')
    expect(names[FIELD_MOVES.strength.move]).toBe('괴력')
    expect(names[FIELD_MOVES.defog.move]).toBe('안개제거')
    expect(names[FIELD_MOVES.rockSmash.move]).toBe('바위깨기')
    expect(names[FIELD_MOVES.waterfall.move]).toBe('폭포오르기')
    expect(names[FIELD_MOVES.rockClimb.move]).toBe('락클라임')
    expect(names[FIELD_MOVES.flash.move]).toBe('플래시')
  })
})

describe('뱃지 짝', () => {
  it('원작 `FieldMoves_Check*`가 요구하는 그대로다', () => {
    // ⚠️ 이름만 보면 뒤집힌 것 같은 자리가 둘 있다. 괴력이 **광산**이고
    // 바위깨기가 **무쇠**다 — 원작이 그렇다
    expect(FIELD_MOVES.strength.badge).toBe(BADGE.mine)
    expect(FIELD_MOVES.rockSmash.badge).toBe(BADGE.coal)
    expect(FIELD_MOVES.cut.badge).toBe(BADGE.forest)
    expect(FIELD_MOVES.fly.badge).toBe(BADGE.cobble)
    expect(FIELD_MOVES.surf.badge).toBe(BADGE.fen)
    expect(FIELD_MOVES.defog.badge).toBe(BADGE.relic)
    expect(FIELD_MOVES.waterfall.badge).toBe(BADGE.beacon)
    expect(FIELD_MOVES.rockClimb.badge).toBe(BADGE.icicle)
    // 플래시만 뱃지를 안 본다
    expect(FIELD_MOVES.flash.badge).toBeNull()
    // 여덟 뱃지가 여덟 기술에 하나씩 붙는다 — 겹치는 짝이 없다
    const used = Object.values(FIELD_MOVES).map((s) => s.badge).filter((b) => b !== null)
    expect(new Set(used).size).toBe(8)
  })
})

const bare: FieldSpot = { frontBehavior: 0, frontSprite: null, quarter: 0, surfing: false }

describe('여기서 무엇이 통하는가', () => {
  it('앞에 선 객체가 어느 기술인지 정한다', () => {
    expect(movesUsableHere({ ...bare, frontSprite: 84 })).toEqual(['strength'])
    expect(movesUsableHere({ ...bare, frontSprite: 85 })).toEqual(['rockSmash'])
    expect(movesUsableHere({ ...bare, frontSprite: 86 })).toEqual(['cut'])
    // 사람은 아무것도 아니다
    expect(movesUsableHere({ ...bare, frontSprite: 3 })).toEqual([])
  })

  it('물 앞에서는 파도타기 — 다만 이미 타고 있으면 안 뜬다', () => {
    const water = { ...bare, frontBehavior: Behavior.WATER_OPEN }
    expect(movesUsableHere(water)).toEqual(['surf'])
    // `FieldMoves_CheckSurf`의 `FIELD_MOVE_ERROR_STATE` 갈래
    expect(movesUsableHere({ ...water, surfing: true })).toEqual([])
  })

  it('폭포는 거동 하나로 정해진다', () => {
    expect(movesUsableHere({ ...bare, frontBehavior: TILE_BEHAVIOR_WATERFALL }))
      .toEqual(['surf', 'waterfall'])
    // 폭포는 물이기도 하다 — 타지 않고서는 오를 수 없으니 둘 다 뜨는 것이 맞다
  })

  it('락클라임은 벽 방향과 보는 방향이 맞아야 한다', () => {
    // 남북 벽은 남(0)·북(2)에서만, 동서 벽은 동(1)·서(3)에서만
    expect(canRockClimb(TILE_BEHAVIOR_ROCK_CLIMB_NS, 0)).toBe(true)
    expect(canRockClimb(TILE_BEHAVIOR_ROCK_CLIMB_NS, 2)).toBe(true)
    expect(canRockClimb(TILE_BEHAVIOR_ROCK_CLIMB_NS, 1)).toBe(false)
    expect(canRockClimb(TILE_BEHAVIOR_ROCK_CLIMB_NS, 3)).toBe(false)
    expect(canRockClimb(TILE_BEHAVIOR_ROCK_CLIMB_EW, 1)).toBe(true)
    expect(canRockClimb(TILE_BEHAVIOR_ROCK_CLIMB_EW, 3)).toBe(true)
    expect(canRockClimb(TILE_BEHAVIOR_ROCK_CLIMB_EW, 0)).toBe(false)
    // 그냥 길은 어느 쪽에서도 안 오른다
    for (let q = 0; q < 4; q++) expect(canRockClimb(0, q)).toBe(false)
  })

  it('안개와 어둠은 날씨가 부른다', () => {
    expect(movesUsableHere({ ...bare, fog: true })).toEqual(['defog'])
    expect(movesUsableHere({ ...bare, dark: true })).toEqual(['flash'])
  })
})

describe('자격', () => {
  const all = (badges: number, moves: number[]) => ({
    badges,
    knows: (m: number) => moves.includes(m),
  })

  it('뱃지가 없으면 뱃지 탓, 파티가 없으면 파티 탓이라고 말한다', () => {
    expect(whyNot('surf', all(0, [FIELD_MOVES.surf.move]))).toBe('badge')
    expect(whyNot('surf', all(1 << BADGE.fen, []))).toBe('party')
    expect(whyNot('surf', all(1 << BADGE.fen, [FIELD_MOVES.surf.move]))).toBeNull()
  })

  it('뱃지 하나가 다른 기술을 열어 주지 않는다', () => {
    // 뱃지를 전부 갖고 기술만 하나 있을 때 그 하나만 통해야 한다
    const every = (1 << 8) - 1
    for (const id of ['cut', 'surf', 'strength', 'rockSmash', 'waterfall', 'rockClimb'] as const) {
      const who = all(every, [FIELD_MOVES[id].move])
      for (const other of ['cut', 'surf', 'strength', 'rockSmash', 'waterfall', 'rockClimb'] as const) {
        expect(whyNot(other, who), `${id} 하나로 ${other}가 열렸다`)
          .toBe(other === id ? null : 'party')
      }
    }
  })

  it('물 앞에 서도 습지뱃지 전에는 아무 일도 없다', () => {
    const water = { ...bare, frontBehavior: Behavior.WATER_OPEN }
    const mon = [FIELD_MOVES.surf.move]
    expect(fieldMoveHere(water, all(0, mon))).toBeNull()
    expect(fieldMoveHere(water, all((1 << BADGE.fen) - 1, mon))).toBeNull()
    expect(fieldMoveHere(water, all(1 << BADGE.fen, mon))).toBe('surf')
  })
})
