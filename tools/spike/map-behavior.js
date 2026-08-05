// 타일 거동 의미 찾기 — **독립 자료와의 대조로만 확정한다** (DATA.md §2.2)
//
// 빈도와 분포 모양은 근거가 못 된다. 풀숲을 두 번 틀렸던 이유가 그것이다.
// 여기서는 이미 검증된 워프 1213개(§2.3)를 독립 자료로 써서 "문"에 해당하는
// 거동값이 있는지 본다 — 워프 칸이 특정 값에 몰려 있으면 그 값이 문이다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('../extract/rom')
const { parseNarc } = require('./gen4text')

const CHUNK = 32
const IMPASSABLE = 0x8000
const MASK = 0x7fff

function parseMatrix(buf) {
  let p = 0
  const width = buf[p++], height = buf[p++]
  const hasHeaders = buf[p++] !== 0, hasHeights = buf[p++] !== 0
  const nameLen = buf[p++]
  const name = buf.toString('latin1', p, p + nameLen); p += nameLen
  const n = width * height
  let headers = null, heights = null
  if (hasHeaders) { headers = []; for (let i = 0; i < n; i++) { headers.push(buf.readUInt16LE(p)); p += 2 } }
  if (hasHeights) { heights = []; for (let i = 0; i < n; i++) heights.push(buf[p++]) }
  const maps = []
  for (let i = 0; i < n; i++) { maps.push(buf.readUInt16LE(p)); p += 2 }
  return { width, height, name, headers, heights, maps }
}

function permOf(buf) {
  const perm = buf.readUInt32LE(0)
  return buf.subarray(16, 16 + perm)
}

const rom = openRom()
const matrices = parseNarc(rom.read('/fielddata/mapmatrix/map_matrix.narc'))
const lands = parseNarc(rom.read('/fielddata/land_data/land_data.narc'))
const maps = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/maps.json'), 'utf8')).maps
const events = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/events.json'), 'utf8')).events

/** 행렬 하나를 타일 격자로 편다. `tileAt(mid, x, z)` */
const gridCache = new Map()
function gridOf(mid) {
  if (gridCache.has(mid)) return gridCache.get(mid)
  const m = parseMatrix(matrices[mid])
  const W = m.width * CHUNK, H = m.height * CHUNK
  const tiles = new Uint16Array(W * H).fill(IMPASSABLE)
  for (let i = 0; i < m.maps.length; i++) {
    const land = m.maps[i]
    if (land === 0xffff) continue
    const perm = permOf(lands[land])
    const ox = (i % m.width) * CHUNK, oz = ((i / m.width) | 0) * CHUNK
    for (let t = 0; t < CHUNK * CHUNK; t++) {
      tiles[(oz + ((t / CHUNK) | 0)) * W + ox + (t % CHUNK)] = perm.readUInt16LE(t * 2)
    }
  }
  const g = { W, H, tiles, matrix: m }
  gridCache.set(mid, g)
  return g
}

// ── 전체 거동 히스토그램 ─────────────────────────────────────────────────────
// **행렬을 한 번씩만 센다.** 맵 헤더 593개가 행렬 270개를 공유하므로 맵마다
// 세면 오버월드가 67배로 부풀어 밀도가 통째로 거짓이 된다
const total = new Map()
const blockedOf = new Map()
const usedMatrices = [...new Set(maps.map((m) => m.matrix))].filter((id) => matrices[id])
for (const mid of usedMatrices) {
  for (const v of gridOf(mid).tiles) {
    const b = v & MASK
    total.set(b, (total.get(b) ?? 0) + 1)
    if (v & IMPASSABLE) blockedOf.set(b, (blockedOf.get(b) ?? 0) + 1)
  }
}

// ── 워프 칸의 거동 ───────────────────────────────────────────────────────────
// 워프 좌표는 그 워프가 속한 맵의 **행렬** 좌표다. 오버월드 존은 전역 좌표,
// 실내는 그 행렬 안 좌표다 (§2.3).
const warpBehavior = new Map()
let warpTotal = 0, warpOutside = 0
for (const map of maps) {
  const ev = events[map.events]
  if (!ev) continue
  const g = gridOf(map.matrix)
  for (const w of ev.warps) {
    // 같은 워프가 여러 맵 헤더에서 참조될 수 있다. 맵마다 세면 중복이지만
    // 오버월드 존은 이벤트 파일이 전단사라 실제로는 안 겹친다
    if (w.x >= g.W || w.z >= g.H) { warpOutside++; continue }
    const v = g.tiles[w.z * g.W + w.x]
    const b = v & MASK
    warpBehavior.set(b, (warpBehavior.get(b) ?? 0) + 1)
    warpTotal++
  }
}

// ── 보고 ─────────────────────────────────────────────────────────────────────
const rows = [...total.entries()]
  .map(([b, n]) => ({
    b,
    total: n,
    blocked: blockedOf.get(b) ?? 0,
    warps: warpBehavior.get(b) ?? 0,
  }))
  .sort((a, b) => b.total - a.total)

console.log(`오버월드 타일 ${gridOf(0).tiles.length} · 거동 ${rows.length}종`)
console.log(`워프 ${warpTotal}개(격자 밖 ${warpOutside}개)\n`)
console.log('  거동     타일수   통행불가        워프칸   워프비율   그 값의 워프밀도')
for (const r of rows) {
  const share = warpTotal ? (r.warps / warpTotal) * 100 : 0
  const density = r.total ? (r.warps / r.total) * 1000 : 0
  console.log(
    `  0x${r.b.toString(16).padStart(4, '0')}` +
    `${String(r.total).padStart(9)}` +
    `${String(r.blocked).padStart(11)}` +
    `${String(r.warps).padStart(14)}` +
    `${share.toFixed(1).padStart(10)}%` +
    `${density.toFixed(2).padStart(15)}‰`,
  )
}

// ── 가설: 0x5e~0x6f가 "워프 칸" 무리다 ───────────────────────────────────────
// 풀숲 때와 같은 형태의 대조다. 오탐(그 값인데 워프가 아닌 칸)과 누락(워프인데
// 그 값이 아닌 칸)을 둘 다 센다 — 한쪽만 보면 반드시 속는다.
const LO = 0x5e, HI = 0x6f

let inBandTiles = 0, inBandWarpTiles = 0
const warpTiles = new Set()
for (const map of maps) {
  const ev = events[map.events]
  if (!ev) continue
  for (const w of ev.warps) warpTiles.add(`${map.matrix}:${w.z}:${w.x}`)
}
const missed = new Map()
for (const mid of usedMatrices) {
  const g = gridOf(mid)
  for (let i = 0; i < g.tiles.length; i++) {
    const b = g.tiles[i] & MASK
    const isWarp = warpTiles.has(`${mid}:${(i / g.W) | 0}:${i % g.W}`)
    if (b >= LO && b <= HI) {
      inBandTiles++
      if (isWarp) inBandWarpTiles++
    } else if (isWarp) {
      missed.set(b, (missed.get(b) ?? 0) + 1)
    }
  }
}
const uniqueWarpTiles = warpTiles.size
console.log(`\n가설 0x${LO.toString(16)}~0x${HI.toString(16)} = 워프 칸`)
console.log(`  그 값인 칸 ${inBandTiles} 중 워프 ${inBandWarpTiles}` +
  ` → 오탐 ${inBandTiles - inBandWarpTiles}칸 (${(((inBandTiles - inBandWarpTiles) / inBandTiles) * 100).toFixed(1)}%)`)
console.log(`  워프 칸 ${uniqueWarpTiles}(중복 제거) 중 무리 밖 ${[...missed.values()].reduce((a, b) => a + b, 0)}칸`)
for (const [b, n] of [...missed.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    누락 0x${b.toString(16).padStart(4, '0')} ${n}칸`)
}

// 무리 안 세부값이 뭘로 갈리는가 — 통행 가능 여부와 실내/실외
console.log('\n무리 안 세부값:')
for (let b = LO; b <= HI; b++) {
  const t = total.get(b) ?? 0
  if (!t) continue
  let over = 0
  const g0 = gridOf(0)
  for (const v of g0.tiles) if ((v & MASK) === b) over++
  console.log(`  0x${b.toString(16)}  전체 ${String(t).padStart(4)}칸 · ` +
    `통행불가 ${String(blockedOf.get(b) ?? 0).padStart(4)} · 오버월드 ${String(over).padStart(4)} · ` +
    `실내 ${String(t - over).padStart(4)} · 워프참조 ${warpBehavior.get(b) ?? 0}`)
}

// ── 오탐 283칸은 무엇인가 ────────────────────────────────────────────────────
// 가설: 문이 두 칸 넓이인데 워프 출발점은 한 칸만 등록된다. 그렇다면 오탐은
// 워프 칸에 **붙어** 있어야 한다
let adjacent = 0, isolated = 0
const isolatedBy = new Map()
for (const mid of usedMatrices) {
  const g = gridOf(mid)
  for (let i = 0; i < g.tiles.length; i++) {
    const b = g.tiles[i] & MASK
    if (b < LO || b > HI) continue
    const x = i % g.W, z = (i / g.W) | 0
    if (warpTiles.has(`${mid}:${z}:${x}`)) continue
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dz]) => warpTiles.has(`${mid}:${z + dz}:${x + dx}`))
    if (near) adjacent++
    else { isolated++; isolatedBy.set(b, (isolatedBy.get(b) ?? 0) + 1) }
  }
}
console.log(`\n오탐 ${adjacent + isolated}칸: 워프 칸에 붙은 것 ${adjacent} · 떨어진 것 ${isolated}`)
for (const [b, n] of [...isolatedBy.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  고립 0x${b.toString(16)} ${n}칸`)
}

// 누락 40칸(0x0000)은 어느 맵인가
console.log('\n평지(0x0000)에 놓인 워프가 있는 맵:')
const plainByMap = new Map()
for (const map of maps) {
  const ev = events[map.events]
  if (!ev) continue
  const g = gridOf(map.matrix)
  for (const w of ev.warps) {
    if (w.x >= g.W || w.z >= g.H) continue
    if ((g.tiles[w.z * g.W + w.x] & MASK) !== 0) continue
    plainByMap.set(map.name, (plainByMap.get(map.name) ?? 0) + 1)
  }
}
for (const [n, c] of [...plainByMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${n}: ${c}개`)
}
