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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DATA = resolve(import.meta.dirname, '../../public/data')
const json = (rel) => JSON.parse(readFileSync(resolve(DATA, rel), 'utf8'))

/** `map/zone.ts`와 같은 값이어야 한다 */
const IMPASSABLE = 0x8000

const maps = json('maps.json').maps
const events = json('events.json').events
const overworldMeta = json('matrices/0.json')
const interiorMeta = json('matrices/interiors.json')

const overworldBin = readFileSync(resolve(DATA, 'matrices/0.bin'))
const interiorBin = readFileSync(resolve(DATA, 'matrices/interiors.bin'))

/** 행렬 번호 → `{ meta, tiles }`. 한 번 만든 것은 다시 쓴다 */
const gridCache = new Map()

export function gridOf(matrixId) {
  const hit = gridCache.get(matrixId)
  if (hit) return hit
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
    /** 그 칸이 속한 맵 헤더 번호. 실내 행렬은 -1이라 맵이 하나뿐이다 */
    zoneAt(x, z) {
      const n = meta.tileWidth / meta.width
      const cx = Math.floor(x / n)
      const cz = Math.floor(z / n)
      if (cx < 0 || cz < 0 || cx >= meta.width || cz >= meta.height) return -1
      const c = meta.chunks.find((k) => k.i === cz * meta.width + cx)
      return c ? c.zone : -1
    },
  }
  gridCache.set(matrixId, grid)
  return grid
}

export const matrixOf = (mapId) => maps[mapId]?.matrix ?? -1
export const warpsOf = (mapId) => events[String(maps[mapId]?.events)]?.warps ?? []
export const npcsOf = (mapId) => events[String(maps[mapId]?.events)]?.npcs ?? []

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
export function pathTo(matrixId, from, isGoal, { limit = 40_000, avoid = null } = {}) {
  const grid = gridOf(matrixId)
  const start = `${from.x},${from.z}`
  const prev = new Map([[start, null]])
  const queue = [from]
  let head = 0
  while (head < queue.length && head < limit) {
    const cur = queue[head++]
    if (isGoal(cur.x, cur.z)) return walkBack(prev, cur)
    for (const [key, [dx, dz]] of Object.entries(STEP)) {
      const nx = cur.x + dx
      const nz = cur.z + dz
      const id = `${nx},${nz}`
      if (prev.has(id)) continue
      // 목적지 칸이 막혀 있어도 **거기가 목표면** 넣는다 — 워프 칸은 문이라
      // 통행 불가로 적힌 것이 있다
      if (grid.blocked(nx, nz) && !isGoal(nx, nz)) continue
      // ⚠️ **다른 문을 밟고 지나가면 안 된다.** 모래시티는 z=842 한 줄에 문이
      // 셋이라, 상점 문으로 가는 길이 포켓몬센터 문을 지난다 — 그러면 엉뚱한
      // 건물 안에서 다시 계획하게 된다 (실측: 419로 가다가 422에 들어갔다)
      if (avoid !== null && avoid(nx, nz) && !isGoal(nx, nz)) continue
      prev.set(id, { from: cur, key })
      queue.push({ x: nx, z: nz })
    }
  }
  return null
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

/** 행렬 0에서 청크가 맞닿은 맵들 */
function sameMatrixNeighbours(mapId) {
  const grid = gridOf(0)
  const { width, height, chunks } = grid.meta
  const zone = new Map(chunks.map((c) => [c.i, c.zone]))
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
      if (other !== undefined && other >= 0 && other !== mapId) out.add(other)
    }
  }
  return [...out]
}

export { maps, events }
