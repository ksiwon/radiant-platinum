// 길 계획의 경계 (`route.mjs`) — 후속 §4.2의 회귀 검사
//
// ⚠️ **재는 것은 「못 서는 칸을 목표로 삼으면 뭐라고 답하는가」다.** 예전에는
// 목표 칸이 통행 불가여도 늘 `found`가 나왔다 — 문(워프 칸)에만 필요한 예외가
// 구역·밟기·사람 옆칸에도 걸려 있었고, 그래서 걷다 마지막 한 걸음에서 막혀
// 「길은 있는데 안 움직인다」가 됐다.
import { describe, expect, it } from 'vitest'
import { PLAN, gridOf, missingData, planPath } from './route.mjs'

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
