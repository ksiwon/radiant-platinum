// 챔피언로드의 **바위 풀이**와 **폭포 한 걸음**을 구운 격자로 돌려 본다 (`pushSolve.mjs` · `route.mjs`)
//
// ⚠️ **걸음을 재는 시험이 아니다.** 실제로 밀리고 깨지고 오르는지는 탐침이 잰다. 여기서 잠그는 것은
// 「구운 격자로 풀면 풀린다」와 「폭포오르기 없이는 못 간다」다
import { describe, expect, it } from 'vitest'
import { gridOf, matrixOf, missingData, npcsOf, planPath, PLAN } from './route.mjs'
import { solvePush } from './pushSolve.mjs'

const HAVE = missingData().length === 0
const LEDGE: Record<number, [number, number]> = { 0x38: [1, 0], 0x39: [-1, 0], 0x3a: [0, -1], 0x3b: [0, 1] }

describe('바위 풀이', () => {
  it('큰바위는 너머가 비어야 밀린다 · 사람은 제자리', () => {
    // z=0 한 줄: 0 사람 · 1 바위 · 2 빈칸 · 3 벽
    const plan = solvePush({
      start: { x: 0, z: 0 }, wall: (x: number, z: number) => z !== 0 || x < 0 || x > 2,
      boulders: [[1, 0]], goal: (x: number) => x === 1,
    })
    expect(plan!.moves.map((m) => m.kind)).toEqual(['push', 'walk'])
    expect(plan!.moves[0]).toMatchObject({ at: { x: 1, z: 0 }, to: { x: 2, z: 0 } })
  })

  it('턱은 그 방향으로만 넘는다', () => {
    const plan = solvePush({
      start: { x: 0, z: 0 }, wall: (x: number, z: number) => z !== 0 || x < 0 || x > 2,
      ledge: (x: number) => (x === 1 ? [-1, 0] : null), boulders: [], goal: (x: number) => x === 2,
    })
    expect(plan).toBeNull()
  })
})

describe.skipIf(!HAVE)('챔피언로드 — 구운 격자', () => {
  it('2F — 1F에서 올라온 (20,16)에서 내려가는 문 (23,26) 앞까지 밀고 깬다', () => {
    const map = 245
    const g = gridOf(matrixOf(map))
    const npcs = npcsOf(map) as { sprite: number, x: number, z: number }[]
    const people = new Set(npcs.filter((n) => n.sprite !== 84 && n.sprite !== 85).map((n) => `${String(n.x)},${String(n.z)}`))
    const plan = solvePush({
      start: { x: 20, z: 17 },
      wall: (x: number, z: number) => x < 0 || z < 0 || x >= g.w || z >= g.h || g.blocked(x, z) || people.has(`${String(x)},${String(z)}`),
      ledge: (x: number, z: number) => LEDGE[g.at(x, z) & 0x7fff] ?? null,
      boulders: npcs.filter((n) => n.sprite === 84).map((n) => [n.x, n.z]),
      rocks: npcs.filter((n) => n.sprite === 85).map((n) => [n.x, n.z]),
      goal: (x: number, z: number) => Math.abs(x - 23) + Math.abs(z - 26) === 1,
    })
    expect(plan).not.toBeNull()
    expect(plan!.pushes).toBeGreaterThan(0)
    expect(plan!.smashes).toBeGreaterThan(0)
  }, 60_000)

  it('B1F — 폭포오르기가 없으면 (4,39)에서 (3,22) 문에 못 닿고, 있으면 닿는다', () => {
    const m = matrixOf(246)
    const goal = (x: number, z: number) => Math.abs(x - 3) + Math.abs(z - 22) === 1
    const without = planPath(m, { x: 4, z: 38 }, goal, { surf: true })
    const withFalls = planPath(m, { x: 4, z: 38 }, goal, { surf: true, waterfall: true })
    expect(without.status).toBe(PLAN.unreachable)
    expect(withFalls.status).toBe(PLAN.found)
    // 폭포 한 번이 `climb:` 한 걸음이다 — 걷는 쪽이 A로 탄다
    expect(withFalls.keys!.some((k: string) => k.startsWith('climb:'))).toBe(true)
  })
})
