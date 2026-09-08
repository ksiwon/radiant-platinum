// 어디로 가야 하는지를 **자료에서 계산한다** (DEPLOY.md §5의 ㉖)
//
// ⚠️ **떠돌아다니게 두면 못 닿는다.** 방향을 무작위로 고르는 탐침으로 열 번을
// 몰아 봤는데, 60FPS로 3분을 걸어도 침실 21칸을 맴돌다 끝났다 — 계단은 (8,4)
// 한 칸인데 그 칸을 안 밟았다. 배틀도 상점도 그 문 너머에 있다.
//
// 그래서 길을 **미리 안다.** 게임이 읽는 그 격자와 그 워프 표를 여기서도 읽고
// 너비 우선으로 길을 낸다. 브라우저에서는 그 길을 한 칸씩 밟기만 한다.
//
// ⚠️ **이건 뒷문이 아니다.** 게임에 아무것도 안 심는다 — 여기서 나오는 것은
// "위로 3칸, 왼쪽으로 2칸" 같은 방향키 목록뿐이고, 실제로 갈 수 있는지는
// 브라우저가 `data-tile`로 답한다. 못 가면 시험이 선다.
//
// ⚠️ **글은 안 읽는다.** 여기서 만지는 것은 좌표와 맵 번호뿐이다
// (COPYRIGHT.md §6).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DATA = resolve(import.meta.dirname, '../../public/data')
const json = (rel) => JSON.parse(readFileSync(resolve(DATA, rel), 'utf8'))

/** `map/zone.ts`와 같은 값이어야 한다 */
const IMPASSABLE = 0x8000
/**
 * `TILE_BEHAVIOR_TABLE` — 계산대·탁자 (`map/world.ts`와 같은 값).
 *
 * 이 칸을 앞에 두고 말을 걸면 게임이 **한 칸 더** 본다(`talkTile`). 점원과
 * 간호사가 전부 그 너머에 서므로, 모르면 상점에 영영 못 닿는다
 */
export const TILE_TABLE = 0x80

/**
 * 길 계산이 읽는 **개발 산출물**이다. 앱이 읽는 자리가 아니다 — 게임은 설치본
 * (OPFS)에서 읽고, 여기서는 하네스가 "어디로 걸어야 하는가"를 미리 알려고 읽는다.
 *
 * ⚠️ **불러오는 자리에서 읽지 않는다.** 한때 이 여섯을 모듈 맨 위에서 그냥
 * 읽었는데, 그러면 자료를 아직 안 구운 기계에서 `import` 한 번에 e2e 스물일곱이
 * **통째로** 죽었다 — 롬과 `AssetAssistant`만 있으면 되는 ⑮까지 같이 죽는다.
 * 실제로 `public/data`를 지우고 돌려서 확인한 자리다. 못 재는 것은 못 잰다고
 * 적어야 하고(DEPLOY.md §5), 그러려면 죽지 말고 살아서 대답할 수 있어야 한다
 */
const NEEDS = [
  'maps.json', 'events.json', 'matrices/0.json', 'matrices/interiors.json',
  'matrices/0.bin', 'matrices/interiors.bin',
]

/** 없는 것들. 비어 있으면 길을 계산할 수 있다 */
export const missingData = () => NEEDS.filter((rel) => !existsSync(resolve(DATA, rel)))

let loaded = null
/** 여섯을 처음 쓸 때 읽는다. 없으면 무엇이 없는지 적어서 선다 */
function data() {
  if (loaded !== null) return loaded
  const gone = missingData()
  if (gone.length > 0) {
    throw new Error(
      `길을 계산할 자료가 없다 — public/data/{${gone.join(' · ')}}. \`pnpm extract\`로 굽는다`,
    )
  }
  loaded = {
    maps: json('maps.json').maps,
    events: json('events.json').events,
    overworldMeta: json('matrices/0.json'),
    interiorMeta: json('matrices/interiors.json'),
    overworldBin: readFileSync(resolve(DATA, 'matrices/0.bin')),
    interiorBin: readFileSync(resolve(DATA, 'matrices/interiors.bin')),
  }
  return loaded
}

/** 행렬 번호 → `{ meta, tiles }`. 한 번 만든 것은 다시 쓴다 */
const gridCache = new Map()

export function gridOf(matrixId) {
  const hit = gridCache.get(matrixId)
  if (hit) return hit
  const { overworldMeta, interiorMeta, overworldBin, interiorBin } = data()
  let meta
  let tiles
  if (matrixId === 0) {
    meta = overworldMeta
    tiles = new Uint16Array(
      overworldBin.buffer, overworldBin.byteOffset, overworldBin.byteLength / 2,
    )
  } else {
    meta = interiorMeta.matrices[String(matrixId)]
    if (!meta) throw new Error(`행렬 ${matrixId}이 없다`)
    const count = meta.tileWidth * meta.tileHeight
    tiles = new Uint16Array(
      interiorBin.buffer, interiorBin.byteOffset + meta.byteOffset, count,
    )
  }
  const grid = {
    meta,
    tiles,
    w: meta.tileWidth,
    h: meta.tileHeight,
    at(x, z) {
      if (x < 0 || z < 0 || x >= meta.tileWidth || z >= meta.tileHeight) return IMPASSABLE
      return tiles[z * meta.tileWidth + x]
    },
    blocked(x, z) { return (grid.at(x, z) & IMPASSABLE) !== 0 },
    /**
     * 그 칸이 속한 맵 헤더 번호. 실내 행렬은 -1이라 맵이 하나뿐이다.
     *
     * ⚠️ **표를 한 번 만든다.** 예전에는 칸마다 `chunks.find(...)`를 돌았는데
     * 행렬 0의 청크가 468개다 — 길 하나를 찾는 동안 수십만 번 부르는 자리라
     * 선형 훑기가 그대로 계획 시간이 됐다 (실측은 `tools/e2e/planBench.mjs`)
     */
    zoneAt(x, z) {
      const n = meta.tileWidth / meta.width
      const cx = Math.floor(x / n)
      const cz = Math.floor(z / n)
      if (cx < 0 || cz < 0 || cx >= meta.width || cz >= meta.height) return -1
      return zoneTable[cz * meta.width + cx]
    },
  }
  /** 청크 색인 → 존. 없는 칸은 -1이다 */
  const zoneTable = new Int32Array(meta.width * meta.height).fill(-1)
  for (const c of meta.chunks) {
    if (c.i >= 0 && c.i < zoneTable.length) zoneTable[c.i] = c.zone
  }
  gridCache.set(matrixId, grid)
  return grid
}

export const matrixOf = (mapId) => data().maps[mapId]?.matrix ?? -1
export const warpsOf = (mapId) => {
  const { maps, events } = data()
  return events[String(maps[mapId]?.events)]?.warps ?? []
}
export const npcsOf = (mapId) => {
  const { maps, events } = data()
  return events[String(maps[mapId]?.events)]?.npcs ?? []
}

/**
 * 트레이너로 서 있는 사람들.
 *
 * 스크립트 번호 3000번대가 싱글 배틀이다 (`commands.ts`의
 * `SCRIPT_ID_OFFSET_SINGLE_BATTLES`). 말을 걸면 그 자리에서 배틀이 열리므로
 * **눈이 마주치기를 기다릴 필요가 없다** — 시험이 운에 안 걸린다
 */
export const trainersOn = (mapId) =>
  npcsOf(mapId).filter((n) => n.script >= 3000 && n.script < 5000)

/**
 * 야생이 나올 수 있는 칸 (`engine/battle/encounter.ts`의 `ENCOUNTER_BEHAVIORS`).
 *
 * ⚠️ **같은 목록이어야 한다.** 갈리면 시험이 풀 아닌 데를 밟으며 "왜 안 나오나"
 * 한다
 */
const ENCOUNTER_BEHAVIORS = new Set([
  0x02, 0x03, 0x05, 0x06, 0x08, 0x0b, 0x24, 0x25, 0x72, 0x77, 0x7b, 0xa6, 0xa7,
])

/** 그 맵 안에서 야생이 나올 수 있는 칸들 */
/**
 * 그 칸이 **야생이 나오는 칸**인가. 칸 하나만 본다.
 *
 * ⚠️ `encounterTiles()`는 표를 통째로 훑는다 — 행렬 0은 수십만 칸이라 길을 찾을
 * 때마다 부르면 안 된다. 길 찾기가 쓰는 것은 이쪽이다
 */
export function grassAt(matrixId, x, z) {
  return ENCOUNTER_BEHAVIORS.has(gridOf(matrixId).at(x, z) & 0x7fff)
}

export function encounterTiles(mapId) {
  const matrix = matrixOf(mapId)
  const grid = gridOf(matrix)
  const out = []
  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      if (grid.blocked(x, z)) continue
      if (matrix === 0 && grid.zoneAt(x, z) !== mapId) continue
      if (ENCOUNTER_BEHAVIORS.has(grid.at(x, z) & 0x7fff)) out.push({ x, z })
    }
  }
  return out
}

/** 방향키 하나가 옮기는 칸. `sceneMark`의 `data-tile`과 같은 축이다 */
export const STEP = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
}

/**
 * `from`에서 `isGoal`인 칸까지 한 칸씩 가는 방향키 목록.
 *
 * 못 가면 `null`이다 — "길이 없다"와 "짧은 길"을 구별해야 시험이 무엇에
 * 막혔는지 말할 수 있다
 */
/**
 * 너비 우선이 볼 칸 수의 상한.
 *
 * ⚠️ **오버월드 한 판을 다 볼 수 있어야 한다.** 행렬 0이 960×960(92만 칸)이고
 * 202번도로에서 떡잎마을까지가 그 대각선쯤이다. 4만으로 잘라 두었더니 먼 곳을
 * "길이 없다"로 답했고, 그러면 부르는 쪽이 가까운 엉뚱한 구역으로 대신 갔다
 */
const NODE_CAP = 250_000

/**
 * 계획 하나가 어떻게 끝났는가. **상한 소진과 「길이 없다」는 다른 일이다** —
 * 예전에는 둘 다 `null`이라, 부르는 쪽이 상한에 걸린 먼 목적지를 「길 없음」으로
 * 읽고 가까운 엉뚱한 데로 갔다
 */
export const PLAN = {
  found: 'found',
  unreachable: 'unreachable',
  budget: 'search-budget-exceeded',
  cancelled: 'cancelled',
  invalid: 'invalid-input',
}

/**
 * 행렬마다 한 벌씩 두고 다시 쓰는 자리 — 방문 표·부모·방향·큐.
 *
 * ⚠️ **매번 새로 잡으면 안 된다.** 행렬 0이 960×960(92만 칸)이라 한 번 잡을
 * 때마다 십수 MB다. 방문 표는 지우는 대신 **계획 번호를 찍어** 가른다
 * (`stamp[id] === run`) — 92만 칸을 0으로 미는 것도 계획 시간이다
 */
const scratch = new Map()
function scratchFor(grid) {
  const size = grid.w * grid.h
  let s = scratch.get(grid)
  if (!s) {
    s = {
      stamp: new Int32Array(size),
      parent: new Int32Array(size),
      dir: new Uint8Array(size),
      queue: new Int32Array(size),
      run: 0,
    }
    scratch.set(grid, s)
  }
  return s
}

/** 방향키를 번호로 — `dir`에 한 바이트로 담는다. 0은 「출발점」이다 */
const STEP_KEYS = Object.keys(STEP)

/** 마지막 계획의 계측. `drive.mjs`가 이것을 그대로 기록한다 */
export const lastPlan = {
  status: null,
  matrix: -1,
  ms: 0,
  expanded: 0,
  goalTests: 0,
  pushed: 0,
  steps: 0,
}

/**
 * `from`에서 `isGoal`인 칸까지 한 칸씩 가는 방향키 목록과 **끝난 까닭**.
 *
 * ⚠️ **문자열 좌표를 안 쓴다.** 예전에는 칸마다 `` `${x},${z}` `` 를 만들어
 * `Map`에 넣었다 — 상한이 25만 칸이라 계획 한 번에 문자열 25만 개와 해시
 * 25만 번이었고, 그것이 하네스가 몇 초씩 멎어 보이던 값의 정체다. 칸 번호는
 * `z*w+x` 정수 하나면 되고, 방문·부모·방향은 형식화 배열에 담긴다.
 *
 * @param cancelled 취소되었는지 묻는 함수. 늦게 온 결과를 버리는 쪽이 준다
 */
export function planPath(
  matrixId, from, isGoal, { limit = NODE_CAP, avoid = null, cancelled = null } = {},
) {
  const t0 = performance.now()
  const grid = gridOf(matrixId)
  const w = grid.w
  const h = grid.h
  lastPlan.matrix = matrixId
  lastPlan.expanded = 0
  lastPlan.goalTests = 0
  lastPlan.pushed = 0
  lastPlan.steps = 0

  const done = (status, keys) => {
    lastPlan.status = status
    lastPlan.ms = performance.now() - t0
    lastPlan.steps = keys === null ? 0 : keys.length
    return { status, keys, stats: { ...lastPlan } }
  }

  // ⚠️ **격자 밖에서 출발하면 계산이 아니라 잘못된 입력이다.** 예전에는 그냥
  // 「길이 없다」로 떨어져서, 좌표를 잘못 준 자리와 절벽에 막힌 자리가
  // 구별되지 않았다
  if (!Number.isInteger(from.x) || !Number.isInteger(from.z)
    || from.x < 0 || from.z < 0 || from.x >= w || from.z >= h) {
    return done(PLAN.invalid, null)
  }

  const s = scratchFor(grid)
  const run = ++s.run
  const { stamp, parent, dir, queue } = s
  const start = from.z * w + from.x
  stamp[start] = run
  parent[start] = -1
  dir[start] = 0
  queue[0] = start
  let head = 0
  let tail = 1

  while (head < tail && head < limit) {
    // 취소는 **꺼내는 자리**에서만 본다. 칸마다 물으면 그 물음이 계획 시간이 된다
    if (cancelled !== null && (head & 0x3ff) === 0 && cancelled()) return done(PLAN.cancelled, null)
    const id = queue[head++]
    lastPlan.expanded++
    const cx = id % w
    const cz = (id - cx) / w
    lastPlan.goalTests++
    if (isGoal(cx, cz)) return done(PLAN.found, walkBack(parent, dir, id))
    for (let k = 0; k < 4; k++) {
      const [dx, dz] = STEP[STEP_KEYS[k]]
      const nx = cx + dx
      const nz = cz + dz
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue
      const nid = nz * w + nx
      if (stamp[nid] === run) continue
      const blocked = grid.blocked(nx, nz)
      const shunned = avoid !== null && avoid(nx, nz)
      if (blocked || shunned) {
        // 목적지 칸이 막혀 있어도 **거기가 목표면** 넣는다 — 워프 칸은 문이라
        // 통행 불가로 적힌 것이 있다. 다른 문을 밟고 지나가는 것은 `avoid`가 막는다
        lastPlan.goalTests++
        if (!isGoal(nx, nz)) continue
      }
      stamp[nid] = run
      parent[nid] = id
      dir[nid] = k + 1
      queue[tail++] = nid
      lastPlan.pushed++
    }
  }
  // ⚠️ **상한에 걸린 것을 「길이 없다」로 적지 않는다.** 큐가 마른 것만이
  // 「정말 못 간다」다
  return done(head >= limit && head < tail ? PLAN.budget : PLAN.unreachable, null)
}

/**
 * 예전 이름. 길이 있으면 방향키 목록, 아니면 `null`이다.
 *
 * ⚠️ **끝난 까닭이 필요하면 `planPath`를 부른다.** 여기서는 상한 소진과
 * 길 없음이 다시 하나로 뭉개진다
 */
export function pathTo(matrixId, from, isGoal, opts = {}) {
  return planPath(matrixId, from, isGoal, opts).keys
}

/** 부모를 거슬러 방향키를 모은다. 번호 하나가 칸 하나다 */
function walkBack(parent, dir, at) {
  const keys = []
  for (let node = at; parent[node] >= 0; node = parent[node]) {
    keys.push(STEP_KEYS[dir[node] - 1])
  }
  return keys.reverse()
}

/** 이 맵에서 `to`로 나가는 워프 칸들 */
export const exitsTo = (mapId, to) => warpsOf(mapId).filter((w) => w.to === to)

/**
 * 맵 사이의 길. 워프 표를 그래프로 보고 너비 우선으로 찾는다.
 *
 * @returns 지나갈 맵 번호 목록 (`from` 포함, `to`로 끝난다). 없으면 null
 */
export function mapRoute(from, to) {
  const prev = new Map([[from, null]])
  const queue = [from]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    if (cur === to) {
      const out = []
      for (let at = cur; at !== null && at !== undefined; at = prev.get(at)) out.unshift(at)
      return out
    }
    for (const w of warpsOf(cur)) {
      if (prev.has(w.to)) continue
      prev.set(w.to, cur)
      queue.push(w.to)
    }
    // 같은 행렬 안에서는 걸어서 이어진다 (마을 → 도로 → 도시가 전부 행렬 0이다)
    const matrix = matrixOf(cur)
    if (matrix === 0) {
      for (const other of sameMatrixNeighbours(cur)) {
        if (prev.has(other)) continue
        prev.set(other, cur)
        queue.push(other)
      }
    }
  }
  return null
}

/**
 * 행렬 0에서 **걸어서 넘어갈 수 있는** 이웃 맵들.
 *
 * ⚠️ **「청크가 맞닿았다」는 「걸어갈 수 있다」가 아니다.** 오래 맞닿기만 보고
 * 이었는데, 그러면 그래프가 **없는 길**을 낸다 — 실측(2026-09-07)으로
 * 203번도로(344)와 무쇠시티(45)가 이웃으로 나왔고, `mapRoute(3, 45)`가
 * `[3, 344, 45]`를 냈다. 원작에서 그 둘 사이는 **절벽**이고 사람은
 * 무쇠게이트(258)로 들어갔다 나온다. 하네스는 있지도 않은 길을 찾다
 * 「(177,804)에서 길을 못 찾았다」로 섰다.
 *
 * 그래서 맞닿은 청크 경계에서 **실제로 못 지나가는 칸이 아닌 짝**이 하나라도
 * 있는지 본다. 하나도 없으면 이웃이 아니고, 그러면 너비 우선이 워프(게이트)를
 * 고른다.
 *
 * ⚠️ **채움 지대(zone 0 `EVERYWHERE`)는 이웃으로 안 센다.** 그것은 장소가
 * 아니라 이름 없는 바다·산으로 행렬 0의 468칸 중 **299칸**을 덮는다. 이웃으로
 * 세면 거의 모든 맵이 그것 하나로 이어져서, 너비 우선이 **두 걸음짜리 가짜
 * 길**을 낸다 — 실측으로 202번도로에서 무쇠시티까지가 `[343, 0, 45]`였다.
 *
 * 채움 **칸**을 밟지 말라는 뜻이 아니다. 한 행렬 안의 걸음은 `pathTo`가 칸
 * 단위로 찾으므로 이름 없는 칸을 얼마든지 지난다 — 여기서 막는 것은 그것을
 * **목적지로 삼는 것**뿐이다
 */
const neighbourCache = new Map()
function sameMatrixNeighbours(mapId) {
  const hit = neighbourCache.get(mapId)
  if (hit) return hit
  const out = computeNeighbours(mapId)
  neighbourCache.set(mapId, out)
  return out
}

/**
 * ⚠️ **자료가 안 바뀌는 동안만 캐시다.** 여기서 보는 것은 행렬 0의 청크 배치와
 * 타일 통행뿐이라 한 판 안에서 안 바뀐다 — 회피 목록·NPC 같은 **움직이는 제약은
 * 여기 안 들어온다.** 그것을 굳히면 문이 닫힌 자리가 열린 것으로 남는다
 */
function computeNeighbours(mapId) {
  const grid = gridOf(0)
  const { width, height, chunks } = grid.meta
  const zone = new Map(chunks.map((c) => [c.i, c.zone]))
  /** 청크 한 변에 든 타일 수 */
  const n = grid.w / width
  const out = new Set()
  for (const c of chunks) {
    if (c.zone !== mapId) continue
    const cx = c.i % width
    const cz = Math.floor(c.i / width)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx
      const z = cz + dz
      if (x < 0 || z < 0 || x >= width || z >= height) continue
      const other = zone.get(z * width + x)
      if (other === undefined || other <= 0 || other === mapId) continue
      if (out.has(other)) continue
      if (borderIsWalkable(grid, cx, cz, dx, dz, n)) out.add(other)
    }
  }
  return [...out]
}

/**
 * 두 청크가 맞닿은 변에서 **양쪽 다 지날 수 있는 칸 짝**이 하나라도 있는가.
 *
 * 한 짝이면 충분하다 — 사람은 한 칸으로도 건너간다. 하나도 없으면 그 변은
 * 절벽이거나 물이고, 그쪽으로는 길이 없다
 */
function borderIsWalkable(grid, cx, cz, dx, dz, n) {
  // 내 쪽 마지막 칸과 이웃 쪽 첫 칸
  const mineX = dx === 1 ? (cx + 1) * n - 1 : dx === -1 ? cx * n : null
  const mineZ = dz === 1 ? (cz + 1) * n - 1 : dz === -1 ? cz * n : null
  for (let t = 0; t < n; t++) {
    const ax = mineX === null ? cx * n + t : mineX
    const az = mineZ === null ? cz * n + t : mineZ
    if (grid.blocked(ax, az)) continue
    if (!grid.blocked(ax + dx, az + dz)) return true
  }
  return false
}

/** 맵 헤더 표와 이벤트 표. 읽는 자리에서 부른다 — 자료가 없으면 여기서 선다 */
export const allMaps = () => data().maps
export const allEvents = () => data().events
