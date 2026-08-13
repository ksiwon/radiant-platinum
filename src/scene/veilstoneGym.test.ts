// 장막시티 체육관의 샌드백과 타이어 (PARITY §7.12)
//
// ⚠️ 여기서 재는 것은 **찬 샌드백이 어디서 멈추는가**다. 넷째 뱃지의 방이고
// 타이어 더미가 길을 막고 있어서, 멈추는 자리가 어긋나면 무너뜨려야 할 것을
// 못 무너뜨린다.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  VEILSTONE_BAGS, VEILSTONE_FLAG, VEILSTONE_GYM_MAP, VEILSTONE_STACKS, VEILSTONE_TILES,
  veilstoneFlags, veilstoneKey, veilstoneTileAt, veilstoneTravel,
} from '../engine/world/veilstoneGym'
import {
  hitVeilstoneBag, initVeilstoneGym, resetVeilstoneGym, veilstoneBagAt, veilstoneBlockedAt,
  veilstoneBusy, veilstoneProps, veilstoneStacksLeft, veilstoneTick,
} from './veilstoneGym'

/** 다 미끄러질 때까지 굴린다 */
function settle(): void {
  for (let i = 0; i < 2000 && veilstoneBusy(); i++) veilstoneTick(1 / 60)
  if (veilstoneBusy()) throw new Error('샌드백이 안 멈춘다')
}

const NORTH = 0, SOUTH = 1, WEST = 2, EAST = 3
const allStacks = new Set(VEILSTONE_STACKS.map(([x, z]) => veilstoneKey(x, z)))

describe('표가 롬과 맞는가', () => {
  it('샌드백 아홉 · 타이어 열하나 · 32×32 표다', () => {
    expect(VEILSTONE_BAGS).toHaveLength(9)
    expect(VEILSTONE_STACKS).toHaveLength(11)
    expect(VEILSTONE_TILES).toHaveLength(32 * 32)
  })

  it('⚠️ 타이어 열하나 중 아홉만 벽 위에 있다', () => {
    // 남은 둘은 빈 칸에 서 있어서 **타이어를 세는 판정이 없으면 샌드백이
    // 그 위를 지나가 버린다**
    const onWall = VEILSTONE_STACKS.filter(([x, z]) => veilstoneTileAt(x, z) === 1)
    expect(onWall).toHaveLength(9)
    const free = VEILSTONE_STACKS.filter(([x, z]) => veilstoneTileAt(x, z) !== 1)
    expect(free).toEqual([[12, 7], [12, 10]])
  })

  it('샌드백은 아홉이 아홉 다 지나갈 수 있는 칸에 있다', () => {
    for (const [x, z] of VEILSTONE_BAGS) {
      expect(veilstoneTileAt(x, z), `(${String(x)},${String(z)})`).not.toBe(1)
    }
  })

  it('⚠️ 거동값 2는 표에 한 칸도 없다', () => {
    // 원작 주석에 「남북으로 못 간다」로 적혀 있는데 실제로는 안 쓴다
    expect(new Set(VEILSTONE_TILES)).toEqual(new Set([0, 1, 3, 4, 5]))
  })

  it('격자 밖은 벽이다', () => {
    expect(veilstoneTileAt(-1, 0)).toBe(1)
    expect(veilstoneTileAt(0, 32)).toBe(1)
  })
})

describe('미끄러지는 규칙', () => {
  it('갈 칸이 벽이면 안 움직인다', () => {
    // 8번 샌드백 (23,11)의 동쪽은 벽이다
    const flags = veilstoneFlags(23, 11, EAST, allStacks)
    expect(flags & VEILSTONE_FLAG.cantMove).not.toBe(0)
    expect(veilstoneTravel(23, 11, EAST, allStacks).distance).toBe(0)
  })

  it('⚠️ 출발 칸의 「멈춤」은 안 센다', () => {
    // 멈춤 칸(4)에 놓인 샌드백이 영영 안 움직이면 안 된다
    const pause: [number, number][] = []
    for (let z = 0; z < 32; z++) {
      for (let x = 0; x < 32; x++) if (veilstoneTileAt(x, z) === 4) pause.push([x, z])
    }
    expect(pause.length).toBeGreaterThan(0)
    for (const [x, z] of pause) {
      // 멈춤 칸에서 출발하면 표시가 「멈춤」뿐이라 그대로 지나간다
      expect(veilstoneFlags(x, z, NORTH, allStacks) & VEILSTONE_FLAG.pausePoint).not.toBe(0)
    }
  })

  it('타이어에 부딪히면 그 표시가 선다', () => {
    // 1번 타이어 (8,10)의 남쪽에서 북으로 밀면 걸린다
    const flags = veilstoneFlags(8, 11, NORTH, allStacks)
    expect(flags & VEILSTONE_FLAG.tireStack).not.toBe(0)
  })

  it('타이어가 없어지면 그 표시도 사라진다', () => {
    const without = new Set(allStacks)
    without.delete(veilstoneKey(8, 10))
    expect(veilstoneFlags(8, 11, NORTH, without) & VEILSTONE_FLAG.tireStack).toBe(0)
  })

  it('⚠️ 어디서든 서른두 칸 안에 멈춘다', () => {
    // 표가 잘못돼 벽이 안 나오면 영영 돈다. 샌드백 아홉을 네 쪽으로 다 차 본다
    for (const [x, z] of VEILSTONE_BAGS) {
      for (const dir of [NORTH, SOUTH, WEST, EAST]) {
        const { distance } = veilstoneTravel(x, z, dir, allStacks)
        expect(distance, `(${String(x)},${String(z)}) → ${String(dir)}`).toBeLessThanOrEqual(32)
      }
    }
  })
})

describe('차면 미끄러진다', () => {
  beforeEach(() => { resetVeilstoneGym(); initVeilstoneGym(VEILSTONE_GYM_MAP) })

  it('샌드백이 없는 칸을 차면 아무 일도 없다', () => {
    expect(hitVeilstoneBag(0, 0, NORTH)).toBe(false)
  })

  it('찰 수 있는 쪽으로 차면 표가 말하는 자리까지 간다', () => {
    // 아홉 중 실제로 움직이는 조합을 찾아 그 자리까지 가는지 본다
    let moved = 0
    for (const [i, [x, z]] of VEILSTONE_BAGS.entries()) {
      for (const dir of [NORTH, SOUTH, WEST, EAST]) {
        resetVeilstoneGym()
        initVeilstoneGym(VEILSTONE_GYM_MAP)
        const { distance } = veilstoneTravel(x, z, dir, allStacks)
        if (distance === 0) continue
        expect(hitVeilstoneBag(x, z, dir)).toBe(true)
        settle()
        const at = veilstoneBagAt(i)!
        const step = [[0, -1], [0, 1], [-1, 0], [1, 0]][dir]!
        expect(at[0]).toBe(x + step[0]! * distance)
        expect(at[1]).toBe(z + step[1]! * distance)
        moved++
      }
    }
    expect(moved).toBeGreaterThan(0)
  })

  it('타이어에 부딪히면 그 더미가 사라진다', () => {
    // ⚠️ 실측한 조합이다 — (8,7) 샌드백을 동으로 차면 세 칸 가서 멈추고
    // 그 앞의 (12,7) 더미가 무너진다. 그 더미는 **벽이 아닌 칸**에 있어서
    // 타이어를 세는 판정이 없으면 샌드백이 그냥 지나간다
    expect(veilstoneStacksLeft()).toBe(11)
    expect(veilstoneBlockedAt(12, 7)).toBe(true)
    expect(hitVeilstoneBag(8, 7, EAST)).toBe(true)
    settle()
    expect(veilstoneBagAt(2)).toEqual([11, 7])
    expect(veilstoneStacksLeft()).toBe(10)
    expect(veilstoneBlockedAt(12, 7)).toBeNull()
  })

  it('벽에 부딪히면 더미는 그대로다', () => {
    // (8,20)을 북으로 차면 세 칸 가서 벽에 멈춘다 — 타이어는 안 걸린다
    const before = veilstoneStacksLeft()
    expect(hitVeilstoneBag(8, 20, NORTH)).toBe(true)
    settle()
    expect(veilstoneBagAt(3)).toEqual([8, 17])
    expect(veilstoneStacksLeft()).toBe(before)
  })

  it('샌드백과 타이어가 길을 막는다', () => {
    expect(veilstoneBlockedAt(3, 10)).toBe(true)
    expect(veilstoneBlockedAt(8, 10)).toBe(true)
    expect(veilstoneBlockedAt(0, 0)).toBeNull()
  })

  it('스무 개가 다 그려진다', () => {
    expect(veilstoneProps()).toHaveLength(9 + 11)
  })

  it('이 체육관이 아니면 아무것도 안 한다', () => {
    resetVeilstoneGym()
    expect(veilstoneBlockedAt(3, 10)).toBeNull()
    expect(hitVeilstoneBag(3, 10, NORTH)).toBe(false)
    expect(veilstoneProps()).toHaveLength(0)
  })
})
