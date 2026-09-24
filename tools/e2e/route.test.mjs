// 길 계획의 경계 (`route.mjs`) — 후속 §4.2의 회귀 검사
//
// ⚠️ **재는 것은 「못 서는 칸을 목표로 삼으면 뭐라고 답하는가」다.** 예전에는
// 목표 칸이 통행 불가여도 늘 `found`가 나왔다 — 문(워프 칸)에만 필요한 예외가
// 구역·밟기·사람 옆칸에도 걸려 있었고, 그래서 걷다 마지막 한 걸음에서 막혀
// 「길은 있는데 안 움직인다」가 됐다.
import { describe, expect, it } from 'vitest'
import { CLIMB_PREFIX, PANEL_PREFIX, PLAN, gridOf, mapRoute, matrixOf, missingData, planPath } from './route.mjs'

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

/**
 * **문 앞 칸에 문을 향해 들어서는 걸음** (`avoidStep` · 지시서 §1.1).
 *
 * ⚠️ **이것은 칸이 아니라 걸음의 시험이다.** 영원시티 포켓몬센터 문은 (305,530)이고
 * 그 아래 (305,531)은 **멀쩡히 걸어 다니는 길바닥**이다 — 막을 것은 그 칸이 아니라
 * 「그 칸에 **북쪽으로** 들어서는 걸음」이다. 실측 3판(2026-09-22 `_cyn42`, 마지막은
 * 조용한 기계)이 전부 그 걸음에서 센터 안으로 빨려 들어갔다
 */
describe.skipIf(!HAVE)('문 앞 걸음 금지', () => {
  /** 영원시티 포켓몬센터 문과 그 앞 칸 */
  const DOOR = { x: 305, z: 530 }
  const FRONT = { x: 305, z: 531 }
  /** (305,531)에 북쪽으로 들어서는 걸음만 막는다 */
  const noStep = (x, z, key) => x === FRONT.x && z === FRONT.z && key === 'ArrowUp'

  it('문 앞 칸은 길바닥이고 문은 통행 불가다 — 전제', () => {
    const g = gridOf(0)
    expect(g.blocked(DOOR.x, DOOR.z), '문은 밟는 칸이 아니다').toBe(true)
    expect(g.blocked(FRONT.x, FRONT.z), '문 앞은 길바닥이다').toBe(false)
  })

  it('막기 전에는 그 걸음을 쓰는 길을 낸다', () => {
    const r = planPath(0, { x: 305, z: 534 }, (x, z) => x === FRONT.x && z === FRONT.z)
    expect(r.status).toBe(PLAN.found)
    expect(r.keys.at(-1), '북쪽으로 들어선다').toBe('ArrowUp')
  })

  it('막으면 같은 칸에 **옆에서** 들어선다 — 길을 잃지 않는다', () => {
    const r = planPath(0, { x: 305, z: 534 }, (x, z) => x === FRONT.x && z === FRONT.z,
      { avoidStep: noStep })
    expect(r.status, '길은 그대로 있다').toBe(PLAN.found)
    expect(r.keys.at(-1), '마지막 걸음이 북쪽이 아니다').not.toBe('ArrowUp')
  })

  it('낸 길 어디에도 그 걸음이 없다', () => {
    const r = planPath(0, { x: 312, z: 563 }, (x, z) => x === 303 && z === 524,
      { avoidStep: noStep })
    expect(r.status).toBe(PLAN.found)
    const step = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    let at = { x: 312, z: 563 }
    for (const key of r.keys) {
      at = { x: at.x + step[key][0], z: at.z + step[key][1] }
      expect(noStep(at.x, at.z, key), `(${at.x},${at.z})에 ${key}로 들어섰다`).toBe(false)
    }
    expect(at, '목표에 닿는다').toEqual({ x: 303, z: 524 })
  })
})

/**
 * **락클라임 · 워프 패널** — 배지 7 뒤 구간(`JOURNEY_DISTORTION`)이 여기에 걸린다.
 * 벽은 통행 불가 비트가 서 있고, 패널은 같은 맵 안의 워프다 — 둘 다 걸어서는 없는 길이다
 */
describe.skipIf(!HAVE)('락클라임과 워프 패널', () => {
  it('예지호수근처는 락클라임 없이 호수에 못 가고, 켜면 한 번 타서 간다', () => {
    const m = matrixOf(340)
    const lake = (x, z) => z === 230 && (x === 308 || x === 309)
    expect(planPath(m, { x: 310, z: 245 }, lake).status).toBe(PLAN.unreachable)
    const on = planPath(m, { x: 310, z: 245 }, lake, { climb: true })
    expect(on.status).toBe(PLAN.found)
    expect(on.keys.filter((k) => k.startsWith(CLIMB_PREFIX))).toEqual([`${CLIMB_PREFIX}ArrowUp`])
  })

  it('아지트 1F는 패널 없이는 2F 계단에 못 가고, 패널 둘을 밟아 간다 (롬 순서 §G-3)', () => {
    const m = matrixOf(305)
    const stairs = (x, z) => x === 4 && z === 3
    expect(planPath(m, { x: 46, z: 4 }, stairs, { enterBlockedGoal: true, panels: false }).status)
      .toBe(PLAN.unreachable)
    const on = planPath(m, { x: 46, z: 4 }, stairs, { enterBlockedGoal: true })
    expect(on.status).toBe(PLAN.found)
    expect(on.keys.filter((k) => k.startsWith(PANEL_PREFIX)).length).toBe(2)
  })
})
