// 발 높이를 **그 배우의 층**으로 고르는가 (`groundYAt`)
//
// 다리 위와 밑처럼 판이 겹친 자리에서 주인공 층으로 고르면 다리 밑 사람이
// 위로 끌려 올라가고 위 사람이 밑으로 꺼진다. 원작은 사람마다 제 y를 `near`로
// 넘긴다 (`MapObject_RecalculatePositionHeight`)
import { describe, expect, it } from 'vitest'
import { groundYAt } from './distortionCore'

/** 깨어진 세계가 아닌 맵 (`MAP`은 573~583이다) */
const PLAIN_MAP = 3

/** 판 두 장(y=0 · y=2)이 온 땅에 겹친 격자. `heightInChunk`처럼 `near`에 가까운 판을 고른다 */
const twoPlates = {
  heightAtWorld(_x: number, _z: number, near: number): number | null {
    return Math.abs(near - 0) <= Math.abs(near - 2) ? 0 : 2
  },
}

/** 판이 하나도 없는 격자 */
const noPlates = { heightAtWorld: (): number | null => null }

describe('groundYAt — 겹친 판', () => {
  it('주인공이 아래(0)에 서도 위(2)에 놓인 사람은 위에 선다', () => {
    expect(groundYAt(twoPlates, PLAIN_MAP, 5.5, 5.5, 0, 2)).toBe(2)
  })

  it('주인공이 위(2)에 서도 아래(0)에 놓인 사람은 아래에 선다', () => {
    expect(groundYAt(twoPlates, PLAIN_MAP, 5.5, 5.5, 2, 0)).toBe(0)
  })

  it('제 높이가 없으면 주인공 층으로 고른다 (나무열매 밭·주인공 자신)', () => {
    expect(groundYAt(twoPlates, PLAIN_MAP, 5.5, 5.5, 2)).toBe(2)
    expect(groundYAt(twoPlates, PLAIN_MAP, 5.5, 5.5, 0)).toBe(0)
  })
})

describe('groundYAt — 배우마다 마지막으로 딛은 높이', () => {
  it('비탈을 따라 내려가면 배치 높이가 아니라 마지막 높이로 다음 판을 고른다', () => {
    const actor = {}
    // 배치는 다리 위(2). 비탈 칸에서는 판이 하나라 1.2로 내려왔다
    const ramp = { heightAtWorld: (): number | null => 1.2 }
    expect(groundYAt(ramp, PLAIN_MAP, 3.5, 3.5, 2, 2, actor)).toBe(1.2)
    expect(groundYAt(ramp, PLAIN_MAP, 3.5, 3.5, 2, 2, actor)).toBe(1.2)
    // 비탈 끝에서 아래로 내려선다. 다음 칸은 판 두 장이 겹친 자리고, 마지막 높이
    // (1.2)는 0보다 2에 가깝다 — 그래서 한 번 더 내려와야 바닥을 고른다
    const low = { heightAtWorld: (): number | null => 0.4 }
    expect(groundYAt(low, PLAIN_MAP, 2.5, 2.5, 2, 2, actor)).toBe(0.4)
    // 이제 겹친 자리에서 위가 아니라 아래 판을 고른다. 배치 높이(2)였다면 위다
    expect(groundYAt(twoPlates, PLAIN_MAP, 1.5, 1.5, 2, 2, actor)).toBe(0)
    expect(groundYAt(twoPlates, PLAIN_MAP, 1.5, 1.5, 2, 2)).toBe(2)
  })

  it('배치 높이가 바뀌면(스크립트가 옮겼다) 기억을 버리고 새 높이에서 고른다', () => {
    const actor = {}
    expect(groundYAt(twoPlates, PLAIN_MAP, 5.5, 5.5, 0, 0, actor)).toBe(0)
    expect(groundYAt(twoPlates, PLAIN_MAP, 5.5, 5.5, 0, 2, actor)).toBe(2)
  })

  it('판이 없는 칸은 0이고 기억을 안 고친다 (`CALCULATED_HEIGHT_SOURCE_NONE`)', () => {
    const actor = {}
    expect(groundYAt(twoPlates, PLAIN_MAP, 5.5, 5.5, 0, 2, actor)).toBe(2)
    expect(groundYAt(noPlates, PLAIN_MAP, 9.5, 9.5, 0, 2, actor)).toBe(0)
    expect(groundYAt(twoPlates, PLAIN_MAP, 5.5, 5.5, 0, 2, actor)).toBe(2)
  })
})
