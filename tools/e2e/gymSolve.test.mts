// 장막 체육관 풀이 (`gymSolve.mjs`) — **제품 표로** 잠근다
//
// ⚠️ **여기서 표를 다시 적지 않는다** (`two-bakers-must-match`). 미끄러짐 거리는
// 제품의 `veilstoneTravel`이 내고, 샌드백·타이어 자리도 제품 상수를 쓴다. 이 시험이
// 재는 것은 **탐색이 제품 규칙 위에서 답을 내는가**다.
//
// ⚠️ **벽은 `VEILSTONE_TILES`가 아니다.** 그 표는 **샌드백이 미끄러지는** 자리를
// 말하고(1 = 미끄러짐이 멈추는 칸), 사람이 걸어 다니는 칸과 다르다 — 그것을 벽으로
// 주면 문 앞 (12,30)부터가 벽이라 한 걸음도 못 뗀다(실측). 걷는 벽은 **방 격자**이고,
// 실제 판에서는 관측기가 `world.grid.isBlocked`를 읽어 넘긴다. 여기서는 같은 구운
// 자료를 `route.mjs`로 연다.
//
// 트레이너 넷은 여기서 안 센다 — 실제 판에서 관측기가 지금 선 자리로 넘긴다.
// 그래서 여기서 나온 차기 수는 **참고값**이고 판정은 실측이 한다 (지시서 §4.2).
import { describe, expect, it } from 'vitest'
import {
  VEILSTONE_BAGS, VEILSTONE_FLAG, VEILSTONE_GYM_MAP, VEILSTONE_STACKS, VEILSTONE_STEP,
  veilstoneKey, veilstoneTravel,
} from '../../src/engine/world/veilstoneGym'
import { gridOf, matrixOf, missingData } from './route.mjs'
import { solveVeilstone } from './gymSolve.mjs'

/** 자료를 아직 안 구운 기계에서는 **미실행**이다. 통과가 아니다 */
const HAVE = missingData().length === 0

/** 문 (12,30) 위 칸에서 자두 (12,4) 아래 칸으로 (지시서 §4.2) */
const START = { x: 12, z: 30 }
const GOAL = { x: 12, z: 5 }

const common = {
  bags: VEILSTONE_BAGS.map(([x, z]) => [x, z]),
  stacks: VEILSTONE_STACKS.map(([x, z]) => veilstoneKey(x, z)),
  wall: (x: number, z: number) => gridOf(matrixOf(VEILSTONE_GYM_MAP)).blocked(x, z),
  travel: veilstoneTravel,
  step: VEILSTONE_STEP,
  tireFlag: VEILSTONE_FLAG.tireStack,
  key: veilstoneKey,
}

describe.skipIf(!HAVE)('장막 체육관 풀이', () => {
  it('문 앞과 자두 앞은 걸을 수 있는 칸이다 — 전제', () => {
    const g = gridOf(matrixOf(VEILSTONE_GYM_MAP))
    expect(g.blocked(START.x, START.z), '문 위 칸').toBe(false)
    expect(g.blocked(GOAL.x, GOAL.z), '자두 아래 칸').toBe(false)
  }, 60_000)

  it('처음 놓인 자리에서는 자두 앞에 **못 닿는다**', () => {
    // 못 닿는 것이 이 방의 요점이다 — 닿으면 기믹이 아무것도 안 막고 있다는 뜻이다
    const got = solveVeilstone({ ...common, start: START, goal: GOAL, cap: 1 })
    expect(got.ok, '한 상태만 펼쳐도 닿으면 안 된다').toBe(false)
  }, 60_000)

  it('찰 수 있는 차기를 실제로 찾아낸다', () => {
    const got = solveVeilstone({ ...common, start: START, goal: GOAL, cap: 40_000 })
    // ⚠️ **못 풀었으면 못 풀었다고 말해야 한다** — 「상한을 넘었다」와 「길이 없다」를
    // 가른다. 어느 쪽이든 여기서 초록이 나오면 안 된다
    expect(got.why ?? '푼다').toBe('푼다')
    expect(got.ok).toBe(true)
    expect(got.kicks.length).toBeGreaterThan(0)
  }, 60_000)

  it('낸 차기 목록이 **제품 규칙 위에서** 그대로 재현된다', () => {
    const got = solveVeilstone({ ...common, start: START, goal: GOAL, cap: 40_000 })
    expect(got.ok).toBe(true)
    // 처음 자리에서 다시 굴려 본다 — 차기마다 샌드백이 계획한 끝 칸으로 가야 한다
    const bags = VEILSTONE_BAGS.map(([x, z]) => [x, z])
    const tires = new Set(VEILSTONE_STACKS.map(([x, z]) => veilstoneKey(x, z)))
    for (const [n, kick] of got.kicks.entries()) {
      const at = bags.findIndex(([x, z]) => x === kick.bag.x && z === kick.bag.z)
      expect(at, `${String(n)}번째 차기: 그 칸에 샌드백이 있어야 한다`).toBeGreaterThanOrEqual(0)
      const { distance, flags } = veilstoneTravel(kick.bag.x, kick.bag.z, kick.dir, tires)
      const [dx, dz] = VEILSTONE_STEP[kick.dir]!
      expect({ x: kick.bag.x + dx * distance, z: kick.bag.z + dz * distance },
        `${String(n)}번째 차기의 끝 칸`).toEqual(kick.to)
      bags[at] = [kick.to.x, kick.to.z]
      if ((flags & VEILSTONE_FLAG.tireStack) !== 0) {
        tires.delete(veilstoneKey(kick.to.x + dx, kick.to.z + dz))
      }
    }
  }, 60_000)

  it('선 자리는 늘 미는 쪽의 반대편 옆 칸이다', () => {
    const got = solveVeilstone({ ...common, start: START, goal: GOAL, cap: 40_000 })
    expect(got.ok).toBe(true)
    for (const kick of got.kicks) {
      const [dx, dz] = VEILSTONE_STEP[kick.dir]!
      expect({ x: kick.bag.x - dx, z: kick.bag.z - dz }).toEqual(kick.stand)
    }
  }, 60_000)
})
