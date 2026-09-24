// 여섯째·일곱째 체육관 풀이를 **제품의 표로** 돌려 본다 (`gymSolve67.mjs`)
//
// ⚠️ **걸음을 재는 시험이 아니다.** 실제로 판을 타는지·미끄러지는지는 탐침이 잰다. 여기서
// 잠그는 것은 「제품 표로 풀면 풀린다」와 「풀이가 제품 규칙을 따른다」다
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CANALAVE_PLATFORMS, canalaveBlocked, canalaveInitialStates,
} from '../../src/engine/world/canalaveGym'
import { iceSpeedAfter } from '../../src/engine/actor/ice'
import { solveCanalave, solveSnowpoint } from './gymSolve67.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const EVENTS = resolve(ROOT, 'raw/decomp/res/field/events')
const HAVE_ROM = existsSync(EVENTS)

describe.skipIf(!HAVE_ROM)('운하 체육관', () => {
  const gym = JSON.parse(readFileSync(resolve(EVENTS, 'events_canalave_city_gym.json'), 'utf8')) as {
    object_events: { x: number, y: number, z: number, trainer_type: string, script: string | number }[]
  }
  /** 트레이너·관장·안내원이 선 칸 — 제 층에서만 막는다 */
  const people = gym.object_events.map((o) => ({ x: o.x, z: o.z, floor: Math.floor(o.y / 10) }))
  const blocked = (floor: number, x: number, z: number): boolean =>
    canalaveBlocked(floor * 10, x, z) || people.some((p) => p.floor === floor && p.x === x && p.z === z)

  it('입구에서 동관 앞(4층 16,4)까지 판을 타고 닿는다', () => {
    const plan = solveCanalave({
      start: { x: 16, z: 26, floor: 0 }, states: canalaveInitialStates(),
      platforms: CANALAVE_PLATFORMS, blocked, goal: { x: 16, z: 4, floor: 3 },
    })
    expect(plan).not.toBeNull()
    // 빨간 판으로 0층 → 3층에 오른다 — 관장에게 가는 길이 그것뿐이다(제품 주석)
    const last = plan!.steps.filter((s) => s.ride !== null).at(-1)!
    expect(CANALAVE_PLATFORMS[last.ride!]!.axis).toBe('red')
    expect(last.to!.floor).toBe(3)
    expect(plan!.rides).toBeGreaterThan(5)
  })

  it('판을 밟으면 반대 끝으로 옮긴다 — 판 #4는 (24,13) 0층 → 1층', () => {
    const p = CANALAVE_PLATFORMS[4]!
    const plan = solveCanalave({
      start: { x: 24, z: 14, floor: 0 }, states: canalaveInitialStates(),
      platforms: CANALAVE_PLATFORMS, blocked: () => false, goal: { x: 24, z: 13, floor: 1 },
    })
    expect(plan!.steps).toHaveLength(1)
    expect(plan!.steps[0]).toMatchObject({ key: 'ArrowUp', ride: 4, to: { x: p.b[0], z: p.b[2], floor: 1 } })
  })
})

describe('선단 체육관 풀이 — 제품의 얼음 규칙', () => {
  /** `.`=얼음 · `_`=바닥 · `#`=벽 · `o`=눈덩이(얼음 위) · 한 줄 z=0 */
  const lane = (row: string, heights: number[] = []) => {
    const at = (x: number, z: number) => (z === 0 ? row[x] ?? '#' : '#')
    const balls: [number, number][] = []
    for (let x = 0; x < row.length; x++) if (row[x] === 'o') balls.push([x, 0])
    return {
      balls,
      isIce: (x: number, z: number) => at(x, z) === '.' || at(x, z) === 'o',
      wall: (x: number, z: number) => at(x, z) === '#',
      heightChange: (x: number, z: number, dx: number) => {
        const here = heights[x] ?? 0
        const next = heights[x + dx] ?? 0
        return here === next ? 'none' as const : here > next ? 'decrease' as const : 'increase' as const
      },
      speedAfter: iceSpeedAfter,
    }
  }

  it('평평한 얼음에서는 눈덩이를 못 깨서 그 너머에 못 간다', () => {
    const l = lane('_...o..#')
    expect(solveSnowpoint({ ...l, start: { x: 0, z: 0 }, goal: (x) => x === 6 })).toBeNull()
  })

  it('가장자리가 막으면 그 앞에서 선다', () => {
    const l = lane('_......#')
    const plan = solveSnowpoint({
      ...l, edge: (x: number, _z: number, dx: number) => x === 3 && dx === 1,
      start: { x: 0, z: 0 }, goal: (x: number) => x === 3,
    })
    expect(plan!.moves.at(-1)!.to).toEqual({ x: 3, z: 0 })
    expect(solveSnowpoint({
      ...l, edge: (x: number, _z: number, dx: number) => x === 3 && dx === 1,
      start: { x: 0, z: 0 }, goal: (x: number) => x === 6,
    })).toBeNull()
  })

  it('비탈을 내려와 속도가 붙으면 깨고 지나간다', () => {
    const l = lane('_...o..#', [2, 2, 1, 1, 1, 1, 1, 1])
    const plan = solveSnowpoint({ ...l, start: { x: 0, z: 0 }, goal: (x) => x === 6 })
    expect(plan).not.toBeNull()
    expect(plan!.broke).toBe(1)
  })
})
