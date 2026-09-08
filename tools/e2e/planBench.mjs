// 길 계획이 얼마나 드는가 — 실측 (야간 실행서 N2)
//
// ⚠️ **먼저 「같은 길인가」를 본다.** 빠른 것보다 맞는 것이 먼저다. 그래서 옛
// 구현(문자열 좌표 + Map)을 이 파일 안에 그대로 두고, 새 구현과 **걸음 수와
// 끝난 까닭**을 대조한다. 옛 것이 사라지면 대조할 것이 없어진다.
//
// ⚠️ **CI 시간 문턱으로 안 만든다.** 여기 나오는 밀리초는 이 기계의 값이고,
// 판정에 쓰는 것은 걸음 수 일치와 **본 칸 수**다 — 그쪽은 기계를 안 탄다.
//
// 돌리기: `node tools/e2e/planBench.mjs [출력.json]`
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PLAN, gridOf, grassAt, mapRoute, matrixOf, missingData, planPath, warpsOf,
} from './route.mjs'

const IMPASSABLE = 0x8000

/**
 * **옛 구현.** 대조용으로만 둔다 — 칸마다 `` `${x},${z}` `` 를 만들어 `Map`에
 * 넣던 그 코드 그대로다
 */
function oldPathTo(matrixId, from, isGoal, { limit = 250_000, avoid = null } = {}) {
  const grid = gridOf(matrixId)
  const start = `${from.x},${from.z}`
  const prev = new Map([[start, null]])
  const queue = [from]
  let head = 0
  let expanded = 0
  while (head < queue.length && head < limit) {
    const cur = queue[head++]
    expanded++
    if (isGoal(cur.x, cur.z)) return { keys: walkBack(prev, cur), expanded }
    for (const [key, [dx, dz]] of Object.entries(STEP)) {
      const nx = cur.x + dx
      const nz = cur.z + dz
      const id = `${nx},${nz}`
      if (prev.has(id)) continue
      if (grid.blocked(nx, nz) && !isGoal(nx, nz)) continue
      if (avoid !== null && avoid(nx, nz) && !isGoal(nx, nz)) continue
      prev.set(id, { from: cur, key })
      queue.push({ x: nx, z: nz })
    }
  }
  return { keys: null, expanded }
}
const STEP = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
}
function walkBack(prev, at) {
  const keys = []
  let node = at
  for (;;) {
    const step = prev.get(`${node.x},${node.z}`)
    if (!step) break
    keys.push(step.key)
    node = step.from
  }
  return keys.reverse()
}

/** 그 맵 안의 걸을 수 있는 칸 하나. 시작점을 자료에서 고른다 */
function anyWalkable(mapId) {
  const matrix = matrixOf(mapId)
  const grid = gridOf(matrix)
  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      if ((grid.at(x, z) & IMPASSABLE) !== 0) continue
      if (matrix === 0 && grid.zoneAt(x, z) !== mapId) continue
      return { x, z, matrix }
    }
  }
  return null
}

/** 이 맵에서 `to`로 나가는 문 칸들 */
const doorsTo = (mapId, to) => warpsOf(mapId).filter((w) => w.to === to)

function ms(run) {
  const t = performance.now()
  const out = run()
  return { out, ms: +(performance.now() - t).toFixed(2) }
}

const gone = missingData()
if (gone.length > 0) {
  console.error(`BLOCKED — public/data/{${gone.join(' · ')}}가 없다. \`pnpm extract\`로 굽는다`)
  process.exit(2)
}

/**
 * 기준 입력. 실행서가 이름을 댄 다섯 갈래다 —
 * 201번도로 트리거 접근 · 마을 사이 · 실내 문 · 도달 불가 · 풀 회피
 */
const CASES = []

// ① 저장 자리(맵 342, 114·852)에서 201번도로 트리거 칸까지 — §42가 멎던 그 자리
CASES.push({
  name: '201번도로 트리거 접근',
  matrix: 0,
  from: { x: 114, z: 852 },
  goal: (x, z) => x === 115 && z === 852,
})

// ② 떡잎마을(411)에서 202번도로(343)까지 — 같은 행렬, 구역 목표
{
  const at = anyWalkable(411)
  if (at) {
    const grid = gridOf(0)
    CASES.push({
      name: '떡잎마을 → 202번도로 (같은 행렬 · 구역 목표)',
      matrix: 0,
      from: { x: at.x, z: at.z },
      goal: (x, z) => grid.zoneAt(x, z) === 343,
    })
    CASES.push({
      name: '떡잎마을 → 202번도로 (풀 회피)',
      matrix: 0,
      from: { x: at.x, z: at.z },
      goal: (x, z) => grid.zoneAt(x, z) === 343,
      avoid: (x, z) => grassAt(0, x, z),
    })
    // ④ 절벽 너머 — 무쇠시티(45)는 같은 행렬인데 걸어서 못 간다
    CASES.push({
      name: '떡잎마을 → 무쇠시티 (같은 행렬이지만 절벽)',
      matrix: 0,
      from: { x: at.x, z: at.z },
      goal: (x, z) => grid.zoneAt(x, z) === 45,
    })
  }
}

// ③ 실내 문 — 주인공 집(414)의 계단 문 앞에서 바깥 문까지.
//
// ⚠️ **아무 빈 칸에서나 출발하면 안 된다.** 실내 격자는 32×32를 통째로 담고
// 방 바깥의 안 쓰는 칸도 0(통행 가능)이라, 첫 빈 칸은 방 밖이다 — 거기서
// 재면 「문에 못 간다」가 나오는데 그건 자료가 아니라 출발점 탓이다.
// 문 **옆 칸**에서 출발한다: 사람이 실제로 서는 자리다
{
  const doors = warpsOf(414)
  const grid = gridOf(matrixOf(414))
  const near = doors.length > 1
    ? [[0, 1], [0, -1], [1, 0], [-1, 0]]
      .map(([dx, dz]) => ({ x: doors[1].x + dx, z: doors[1].z + dz }))
      .find((n) => !grid.blocked(n.x, n.z))
    : null
  if (near) {
    CASES.push({
      name: '실내 문 (주인공 집 계단 앞 → 바깥 문)',
      matrix: matrixOf(414),
      from: near,
      goal: (x, z) => x === doors[0].x && z === doors[0].z,
    })
  }
}

// ⑤ 잘못된 입력 — 격자 밖에서 출발
CASES.push({
  name: '격자 밖에서 출발 (잘못된 입력)',
  matrix: 0,
  from: { x: -1, z: -1 },
  goal: () => true,
})

// ⑥ 상한 소진 — 아주 낮은 상한으로 먼 목표를 노린다
{
  const grid = gridOf(0)
  CASES.push({
    name: '상한 소진 (limit 500)',
    matrix: 0,
    from: { x: 114, z: 852 },
    goal: (x, z) => grid.zoneAt(x, z) === 45,
    limit: 500,
  })
}

const rows = []
for (const c of CASES) {
  const opts = { avoid: c.avoid ?? null, ...(c.limit ? { limit: c.limit } : {}) }
  // cold — 이 행렬을 처음 만지는 값이 아니라, **이 계획이 처음 도는** 값이다.
  // 격자 캐시는 앞 사례가 이미 데워 놓았을 수 있어서 따로 적는다
  const cold = ms(() => planPath(c.matrix, c.from, c.goal, opts))
  const warmRuns = []
  for (let i = 0; i < 5; i++) warmRuns.push(ms(() => planPath(c.matrix, c.from, c.goal, opts)))
  const warm = warmRuns.map((r) => r.ms).sort((a, b) => a - b)

  // 옛 구현과 대조. 상한 소진 사례는 옛 것도 같은 상한으로 돌린다
  let ref = null
  if (c.name !== '격자 밖에서 출발 (잘못된 입력)') {
    const r = ms(() => oldPathTo(c.matrix, c.from, c.goal, opts))
    ref = {
      ms: r.ms,
      steps: r.out.keys === null ? null : r.out.keys.length,
      expanded: r.out.expanded,
    }
  }

  const now = cold.out
  const same = ref === null
    || (ref.steps === (now.keys === null ? null : now.keys.length))
  rows.push({
    name: c.name,
    matrix: c.matrix,
    from: c.from,
    status: now.status,
    steps: now.keys === null ? null : now.keys.length,
    expanded: now.stats.expanded,
    goalTests: now.stats.goalTests,
    coldMs: cold.ms,
    warmMs: { min: warm[0], median: warm[2], max: warm[4] },
    old: ref,
    sameResult: same,
  })
  console.log(
    `${same ? '✓' : '✗'} ${c.name}\n`
    + `    ${now.status} · ${String(rows.at(-1).steps)}걸음 · 본 칸 ${String(now.stats.expanded)}`
    + ` · cold ${String(cold.ms)}ms · warm(중앙) ${String(warm[2])}ms`
    + (ref ? ` · 옛 구현 ${String(ref.ms)}ms / 본 칸 ${String(ref.expanded)}` : ''),
  )
}

// 맵 그래프도 잰다 — `drive.mjs`가 걸어서 못 닿을 때마다 부르는 자리다
const route = ms(() => mapRoute(411, 45))
console.log(`\n맵 그래프 411→45: ${String(route.ms)}ms · ${JSON.stringify(route.out)}`)

const report = {
  at: new Date().toISOString(),
  node: process.version,
  /** 자료 신원 — 다른 판으로 잰 값을 섞지 않으려고 적는다 */
  data: { maps: gridOf(0).meta.width * gridOf(0).meta.height },
  cases: rows,
  mapRoute: { from: 411, to: 45, ms: route.ms, hops: route.out },
  allSame: rows.every((r) => r.sameResult),
  statuses: Object.values(PLAN),
}
const out = resolve(process.argv[2] ?? '.audit/overnight-20260908/planBench.json')
writeFileSync(out, JSON.stringify(report, null, 2))
console.log(`\n적었다: ${out}`)
process.exit(report.allSame ? 0 : 1)
