// 한쪽으로만 막힌 칸 (`actor/edgeBlock` · `sub_02064004`)
import { describe, expect, it } from 'vitest'
import { edgeBlocks, edgeCrossBlocked } from './edgeBlock'

const N_S = 0x49 // BLOCK_NORTH_AND_SOUTH — 동서로만 드나든다
const E_W = 0x4a // BLOCK_EAST_AND_WEST — 남북으로만 드나든다
const EASTWARD = 0x30 // 동쪽으로 못 나간다
const FLOOR = 0x00

describe('원작 판정 — 나가는 칸과 들어가는 칸', () => {
  it('BLOCK_NORTH_AND_SOUTH 칸에서는 남북으로 못 나가고, 남북에서 못 들어온다', () => {
    expect(edgeBlocks(N_S, FLOOR, 0, -1)).toBe(true)
    expect(edgeBlocks(N_S, FLOOR, 0, 1)).toBe(true)
    expect(edgeBlocks(FLOOR, N_S, 0, -1)).toBe(true)
    expect(edgeBlocks(FLOOR, N_S, 0, 1)).toBe(true)
    // 동서는 된다
    expect(edgeBlocks(N_S, FLOOR, 1, 0)).toBe(false)
    expect(edgeBlocks(FLOOR, N_S, -1, 0)).toBe(false)
  })

  it('BLOCK_EAST_AND_WEST는 그 거울이다', () => {
    expect(edgeBlocks(E_W, FLOOR, 1, 0)).toBe(true)
    expect(edgeBlocks(FLOOR, E_W, -1, 0)).toBe(true)
    expect(edgeBlocks(E_W, FLOOR, 0, 1)).toBe(false)
  })

  it('한 방향만 막힌 칸 — 동쪽으로 못 나가지만 서쪽에서 들어오는 것은 된다', () => {
    expect(edgeBlocks(EASTWARD, FLOOR, 1, 0)).toBe(true)
    // 들어가는 칸은 **반대 방향** 표로 본다 — 동쪽으로 가며 들어가면 「서쪽으로 못 나감」을 본다
    expect(edgeBlocks(FLOOR, EASTWARD, 1, 0)).toBe(false)
    expect(edgeBlocks(FLOOR, EASTWARD, -1, 0)).toBe(true)
  })

  it('보통 칸끼리는 아무것도 안 막는다', () => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(edgeBlocks(FLOOR, FLOOR, dx, dz)).toBe(false)
  })
})

describe('몸이 가장자리를 넘는가 — 반지름 있는 몸', () => {
  // (5,5)가 BLOCK_NORTH_AND_SOUTH, 나머지는 바닥
  const beh = (tx: number, tz: number) => (tx === 5 && tz === 5 ? N_S : FLOOR)

  it('북쪽 칸에서 내려와 그 칸에 들어서려는 귀퉁이가 막힌다', () => {
    // 몸 가운데 (5.5, 4.65) → (5.5, 4.75): 아래 귀퉁이가 z 4.95 → 5.05로 넘는다
    expect(edgeCrossBlocked(beh, 5.5, 4.65, 5.5, 4.75, 0.3)).toBe(true)
  })

  it('옆에서 들어오는 것은 된다', () => {
    expect(edgeCrossBlocked(beh, 4.65, 5.5, 4.75, 5.5, 0.3)).toBe(false)
  })

  it('경계를 안 넘는 걸음은 안 본다', () => {
    expect(edgeCrossBlocked(beh, 5.5, 4.2, 5.5, 4.3, 0.3)).toBe(false)
  })
})
