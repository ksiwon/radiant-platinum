// 길 계획의 경계 (`route.mjs`) — 후속 §4.2의 회귀 검사
//
// ⚠️ **재는 것은 「못 서는 칸을 목표로 삼으면 뭐라고 답하는가」다.** 예전에는
// 목표 칸이 통행 불가여도 늘 `found`가 나왔다 — 문(워프 칸)에만 필요한 예외가
// 구역·밟기·사람 옆칸에도 걸려 있었고, 그래서 걷다 마지막 한 걸음에서 막혀
// 「길은 있는데 안 움직인다」가 됐다.
import { describe, expect, it } from 'vitest'
import { PLAN, gridOf, mapRoute, missingData, planPath } from './route.mjs'

/** 자료를 아직 안 구운 기계에서는 **미실행**이다. 통과가 아니다 */
const HAVE = missingData().length === 0

/** 빈 칸 하나와, 그 옆의 막힌 칸 하나를 실제 격자에서 찾는다 */
function findPair() {
  const grid = gridOf(0)
  for (let z = 1; z < grid.h - 1; z += 7) {
    for (let x = 1; x < grid.w - 1; x += 7) {
      if (grid.blocked(x, z)) continue
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (grid.blocked(x + dx, z + dz)) {
          return { free: { x, z }, wall: { x: x + dx, z: z + dz } }
        }
      }
    }
  }
  return null
}

describe.skipIf(!HAVE)('통행 불가 목표', () => {
  it('기본으로는 못 서는 칸을 목표로 안 삼는다', () => {
    const pair = findPair()
    expect(pair).not.toBeNull()
    const r = planPath(0, pair.free, (x, z) => x === pair.wall.x && z === pair.wall.z)
    expect(r.status).toBe(PLAN.unreachable)
    expect(r.keys).toBeNull()
  })

  it('문 목표일 때만 그리로 들어선다', () => {
    const pair = findPair()
    const r = planPath(0, pair.free, (x, z) => x === pair.wall.x && z === pair.wall.z,
      { enterBlockedGoal: true })
    expect(r.status).toBe(PLAN.found)
    expect(r.keys).toHaveLength(1)
    // **예외를 썼다는 사실이 계측에 남는다** — 안 남으면 나중에 못 가른다
    expect(r.stats.blockedGoal).toBe(1)
  })

  it('설 수 있는 칸은 예외 없이도 찾는다', () => {
    const pair = findPair()
    const r = planPath(0, pair.free, (x, z) => x === pair.free.x && z === pair.free.z)
    expect(r.status).toBe(PLAN.found)
    expect(r.keys).toEqual([])
    expect(r.stats.blockedGoal).toBe(0)
  })

  it('격자 밖에서 출발하면 「길이 없다」가 아니라 잘못된 입력이다', () => {
    const r = planPath(0, { x: -1, z: 0 }, () => true)
    expect(r.status).toBe(PLAN.invalid)
  })

  it('상한을 소진한 것과 큐가 마른 것을 가른다', () => {
    const pair = findPair()
    const far = planPath(0, pair.free, () => false, { limit: 50 })
    expect(far.status).toBe(PLAN.budget)
    const none = planPath(0, pair.free, () => false)
    expect(none.status).toBe(PLAN.unreachable)
  })
})

describe('맵 그래프 — 아직 못 지나는 맵', () => {
  const only = HAVE ? it : it.skip

  /**
   * ⚠️ **격자에 길이 있어도 게임이 막는 길이 있다.** 자전거길(206번도로 = 맵 350)은
   * 자전거가 있어야 열린다. 빼지 않으면 축복시티(3)에서 영원시티(65)로 가는 길이
   * 무쇠 → 207번도로 → 자전거길로 나고, 실측(2026-09-17 journey17)에서 그 길로
   * 걸어가 **18분 동안 같은 자리**를 맴돌았다
   */
  only('자전거길을 빼면 원작이 걷는 길이 나온다', () => {
    const open = mapRoute(3, 65)
    expect(open).toContain(350)
    const shut = mapRoute(3, 65, { without: new Set([350]) })
    expect(shut).not.toContain(350)
    // 꽃향기(426) → 205번도로 남(347) → 영원의 숲(203) — 원작이 정한 차례다
    expect(shut).toEqual(expect.arrayContaining([426, 347, 203, 65]))
  })

  only('끝 맵 자신은 안 지운다 — 거기로 가려는 것이다', () => {
    expect(mapRoute(3, 350, { without: new Set([350]) })).toContain(350)
  })

  only('유일한 길을 빼면 null이다 — 없는 것을 있다고 안 한다', () => {
    // 축복 마트(4)로 들어가는 문은 축복시티(3)뿐이다
    expect(mapRoute(411, 4)).toContain(3)
    expect(mapRoute(411, 4, { without: new Set([3]) })).toBeNull()
  })

  only('한 길을 막아도 다른 길이 있으면 그 길을 낸다', () => {
    // 꽃향기 쪽까지 막으면 창관산(208~218)과 211번도로로 돌아간다 — 길이 남는다
    const round = mapRoute(3, 65, { without: new Set([350, 426, 203, 349, 347]) })
    expect(round).not.toBeNull()
    expect(round).not.toContain(426)
    expect(round).toContain(65)
  })
})
