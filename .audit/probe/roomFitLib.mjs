// 방 짝 맞춤 도서관 — `rfCheck.mjs`의 계산을 함수로 뗀 것 (읽기 전용).
//   fit(mapId, room)  → { walkable, noFloor, openOverBlocked, blocked, bad: [...], score }
// 원작 칸(통행값 · 사람 · 워프 · 표지판 · PC)을 BDSP 방 바닥 · 벽에 얹어 어긋남을 센다. 높을수록 안 맞는다.
import fs from 'node:fs'
import path from 'node:path'
import { readGlb } from './rfGlb.mjs'

export function makeFit(ROOT) {
  const D = (p) => path.join(ROOT, 'public/data', p)
  const maps = JSON.parse(fs.readFileSync(D('maps.json'), 'utf8')).maps
  const events = JSON.parse(fs.readFileSync(D('events.json'), 'utf8')).events
  const inter = JSON.parse(fs.readFileSync(D('matrices/interiors.json'), 'utf8')).matrices
  const bin = fs.readFileSync(D('matrices/interiors.bin'))
  const MARGIN = 0.3
  const cache = new Map()

  function geom(room) {
    if (cache.has(room)) return cache.get(room)
    const P = readGlb(path.join(ROOT, 'public/models/room', room + '.glb'))
    const floors = [], walls = [], tops = []
    let fx0 = 1e9, fx1 = -1e9, fz0 = 1e9, fz1 = -1e9
    for (const p of P) {
      const isFloorMat = /_Floor_/.test(p.mat)
      const isWallMat = /_(Wall|Partition)_/.test(p.mat) && !/ComWall/.test(p.mat)
      const skipTop = /Ceil|Light|Shadow|Glass|_Mat_|_Mark_|Floor|Wall|Water|Smoke|Window|Picture|Accessory|Video|Implant/.test(p.mat)
      if (isFloorMat) { fx0 = Math.min(fx0, p.min[0]); fx1 = Math.max(fx1, p.max[0]); fz0 = Math.min(fz0, p.min[2]); fz1 = Math.max(fz1, p.max[2]) }
      const grounded = p.min[1] < 0.3
      for (let t = 0; t < p.idx.length; t += 3) {
        const v = [0, 1, 2].map((k) => { const i = p.idx[t + k] * 3; return [p.pos[i], p.pos[i + 1], p.pos[i + 2]] })
        const e1 = v[1].map((x, i) => x - v[0][i]), e2 = v[2].map((x, i) => x - v[0][i])
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
        const l = Math.hypot(...n)
        if (l < 1e-9) continue
        const nn = n.map((x) => x / l)
        if (isFloorMat && Math.abs(nn[1]) > 0.9) floors.push(v)
        if (isWallMat && Math.abs(nn[1]) < 0.3 && Math.max(...v.map((a) => a[1])) >= 1.5) walls.push({ v, n: nn, mat: p.mat })
        if (!skipTop && grounded && nn[1] > 0.5) {
          const ys = v.map((a) => a[1])
          if (Math.min(...ys) >= 0.45 && Math.max(...ys) <= 2.3) tops.push({ v, mat: p.mat })
        }
      }
    }
    // 바닥 삼각형을 칸 그물에 올려 둔다 — 질의가 빠르다
    const grid = new Map()
    for (const v of floors) {
      for (let x = Math.floor(Math.min(v[0][0], v[1][0], v[2][0])); x <= Math.floor(Math.max(v[0][0], v[1][0], v[2][0])); x++) {
        for (let z = Math.floor(Math.min(v[0][2], v[1][2], v[2][2])); z <= Math.floor(Math.max(v[0][2], v[1][2], v[2][2])); z++) {
          const k = x + ',' + z
          const l = grid.get(k)
          if (l) l.push(v); else grid.set(k, [v])
        }
      }
    }
    const topGrid = new Map()
    for (const t of tops) {
      const v = t.v
      for (let x = Math.floor(Math.min(v[0][0], v[1][0], v[2][0])); x <= Math.floor(Math.max(v[0][0], v[1][0], v[2][0])); x++) {
        for (let z = Math.floor(Math.min(v[0][2], v[1][2], v[2][2])); z <= Math.floor(Math.max(v[0][2], v[1][2], v[2][2])); z++) {
          const k = x + ',' + z
          const l = topGrid.get(k)
          if (l) l.push(t); else topGrid.set(k, [t])
        }
      }
    }
    const g = { floors, walls, tops, topGrid, grid, box: { x0: fx0, x1: fx1, z0: fz0, z1: fz1 } }
    cache.set(room, g)
    return g
  }
  const inTri2 = (px, pz, v) => {
    const [a, b, c] = v
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
    if (Math.abs(d) < 1e-12) return false
    const l1 = ((b[2] - c[2]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[2])) / d
    const l2 = ((c[2] - a[2]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[2])) / d
    return l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6
  }
  const furnAt = (g, cx, cz) => (g.topGrid.get(Math.floor(cx) + ',' + Math.floor(cz)) ?? []).some((t) => inTri2(cx, cz, t.v))
  const floorCovers = (g, cx, cz) => (g.grid.get(Math.floor(cx) + ',' + Math.floor(cz)) ?? []).some((v) => inTri2(cx, cz, v))

  function slice(v, y) {
    const pts = []
    for (let i = 0; i < 3; i++) {
      const a = v[i], b = v[(i + 1) % 3]
      if ((a[1] - y) * (b[1] - y) < 0) { const t = (y - a[1]) / (b[1] - a[1]); pts.push([a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t]) }
    }
    return pts.length >= 2 ? [pts[0], pts[1]] : null
  }
  const DIRS = [[0, 1, '+z'], [0, -1, '-z'], [1, 0, '+x'], [-1, 0, '-x']]
  function wallBehind(g, cx, cz) {
    const out = []
    for (const [dx, dz, name] of DIRS) {
      let best = null
      for (const w of g.walls) {
        const s = slice(w.v, 1.0)
        if (!s) continue
        const [p, q] = s
        const ex = q[0] - p[0], ez = q[1] - p[1]
        const den = dx * ez - dz * ex
        if (Math.abs(den) < 1e-9) continue
        const t = ((p[0] - cx) * ez - (p[1] - cz) * ex) / den
        const u = ((p[0] - cx) * dz - (p[1] - cz) * dx) / den
        if (t <= 0.001 || u < -1e-6 || u > 1 + 1e-6 || t > 25) continue
        const back = dx * w.n[0] + dz * w.n[2] > 0.5
        if (!best || t < best.t) best = { t, back }
      }
      if (best && best.back && best.t >= MARGIN + 0.05) out.push(name)
    }
    return out
  }

  /** 맵 `id`의 원작 칸들을 `room` 위에 얹어 센다 */
  function fit(id, room, at = { x: 0, z: 0 }) {
    const h = maps[id]
    const ev = events[h.events]
    const meta = inter[String(h.matrix)]
    const g = geom(room)
    const B = g.box
    const bad = []
    let personOut = 0, personBehind = 0, warpOut = 0
    const items = []
    for (const n of ev?.npcs ?? []) items.push({ kind: 'npc', x: n.x, z: n.z })
    for (const w of ev?.warps ?? []) if (!((w.x === 0 && w.z === 0) || (w.x === 1 && w.z === 1))) items.push({ kind: 'warp', x: w.x, z: w.z, to: w.to })
    let tiles = null
    if (meta) {
      const o = bin.byteOffset + meta.byteOffset
      tiles = new Uint16Array(bin.buffer.slice(o, o + meta.tileWidth * meta.tileHeight * 2))
      const isPc = (x, z) => x >= 0 && z >= 0 && x < meta.tileWidth && z < meta.tileHeight && (tiles[z * meta.tileWidth + x] & 0x7fff) === 0x83
      for (let z = 0; z < meta.tileHeight; z++) for (let x = 0; x < meta.tileWidth; x++) {
        if (!isPc(x, z) || isPc(x, z + 1)) continue
        items.push({ kind: 'pc', x, z })
      }
    }
    for (const it of items) {
      const cx = it.x + 0.5 - at.x, cz = it.z + 0.5 - at.z
      const outside = cx < B.x0 - MARGIN || cx > B.x1 + MARGIN || cz < B.z0 - MARGIN || cz > B.z1 + MARGIN
      const northDoor = it.kind === 'warp' && cz >= B.z0 - 1 && cz < B.z0 && cx >= B.x0 && cx <= B.x1
      const person = it.kind === 'npc' || it.kind === 'pc'
      if (outside && !northDoor) { if (person) personOut++; else warpOut++; bad.push(`${it.kind}(${it.x},${it.z}) 밖`); continue }
      if (!outside && !floorCovers(g, cx, cz) && !northDoor && it.kind !== 'warp') { personOut++; bad.push(`${it.kind}(${it.x},${it.z}) 바닥없음`); continue }
      if (person && wallBehind(g, cx, cz).length) { personBehind++; bad.push(`${it.kind}(${it.x},${it.z}) 벽뒤`) }
    }
    let ptBox = null
    const walk = { walkable: 0, noFloor: 0, blocked: 0, openOverBlocked: 0, furnOnWalk: 0 }
    if (tiles) {
      const doorCells = new Set((ev?.warps ?? []).filter((w) => { const cz = w.z + 0.5 - at.z, cx = w.x + 0.5 - at.x; return cz >= B.z0 - 1 && cz < B.z0 && cx >= B.x0 && cx <= B.x1 }).map((w) => w.x + ',' + w.z))
      let bx0 = 1e9, bx1 = -1, bz0 = 1e9, bz1 = -1
      const grow = (x, z) => { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z) }
      for (let z = 0; z < meta.tileHeight; z++) for (let x = 0; x < meta.tileWidth; x++) if (tiles[z * meta.tileWidth + x] & 0x8000) grow(x, z)
      for (const w of ev?.warps ?? []) grow(w.x, w.z)
      for (const n of ev?.npcs ?? []) grow(n.x, n.z)
      ptBox = [bx0, bz0, bx1 + 1, bz1 + 1]
      for (let z = Math.max(0, bz0); z <= Math.min(meta.tileHeight - 1, bz1); z++) for (let x = Math.max(0, bx0); x <= Math.min(meta.tileWidth - 1, bx1); x++) {
        const cx = x + 0.5 - at.x, cz = z + 0.5 - at.z
        const out = cx < B.x0 - MARGIN || cx > B.x1 + MARGIN || cz < B.z0 - MARGIN || cz > B.z1 + MARGIN
        const has = !out && floorCovers(g, cx, cz)
        if (tiles[z * meta.tileWidth + x] & 0x8000) { walk.blocked++; if (has) walk.openOverBlocked++ }
        else { walk.walkable++; if (!has && !doorCells.has(x + ',' + z)) walk.noFloor++; else if (has && furnAt(g, cx, cz)) walk.furnOnWalk++ }
      }
    }
    const dims = ptBox ? [(B.x1 - B.x0) - (ptBox[2] - ptBox[0]), (B.z1 - B.z0) - (ptBox[3] - ptBox[1])] : [0, 0]
    const size = Math.abs(dims[0] - 2) + Math.abs(dims[1] - 4)
    const score = personOut * 10 + warpOut * 10 + personBehind * 3 + walk.noFloor + walk.furnOnWalk + size * 2
    // 점수: 사람 · PC가 바닥 밖이면 크게, 걸음칸에 바닥이 없으면 칸수대로
    return { ...walk, ptBox, dims, size, personOut, personBehind, warpOut, bad, score, floor: [B.x0, B.z0, B.x1, B.z1] }
  }
  /** 칸마다 원작 막힘 ↔ BDSP 바닥 없음 · 기물 위를 겹쳐 틀린 칸 수를 센다 (원작 상자 안) */
  function hamming(id, room, at = { x: 0, z: 0 }) {
    const h = maps[id], meta = inter[String(h.matrix)]
    const g = geom(room), B = g.box
    const o = bin.byteOffset + meta.byteOffset
    const tiles = new Uint16Array(bin.buffer.slice(o, o + meta.tileWidth * meta.tileHeight * 2))
    const ev = events[h.events]
    let x0 = 1e9, x1 = -1, z0 = 1e9, z1 = -1
    for (let z = 0; z < meta.tileHeight; z++) for (let x = 0; x < meta.tileWidth; x++) if (!(tiles[z * meta.tileWidth + x] & 0x8000)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
    // 걸을 수 있는 칸이 이어진 덩어리 — 워프에서 닿는 덩어리만
    const seen = new Set(), q = []
    const push = (x, z) => { const k = z * meta.tileWidth + x; if (!seen.has(k)) { seen.add(k); q.push([x, z]) } }
    for (const w of ev?.warps ?? []) if (w.x < meta.tileWidth && w.z < meta.tileHeight && !(w.x === 0 && w.z === 0)) push(w.x, w.z)
    for (let i = 0; i < q.length; i++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = q[i][0] + dx, nz = q[i][1] + dz
      if (nx < 0 || nz < 0 || nx >= meta.tileWidth || nz >= meta.tileHeight || (tiles[nz * meta.tileWidth + nx] & 0x8000)) continue
      push(nx, nz)
    }
    let walkOff = 0, walkFurn = 0, blockFree = 0, walk = 0, block = 0
    // 방 상자: 걸음칸 덩어리의 바깥 한 칸 안
    let rx0 = 1e9, rx1 = -1, rz0 = 1e9, rz1 = -1
    for (const k of seen) { const x = k % meta.tileWidth, z = Math.floor(k / meta.tileWidth); if (!(tiles[k] & 0x8000)) { rx0 = Math.min(rx0, x); rx1 = Math.max(rx1, x); rz0 = Math.min(rz0, z); rz1 = Math.max(rz1, z) } }
    for (let z = rz0; z <= rz1; z++) for (let x = rx0; x <= rx1; x++) {
      const cx = x + 0.5 - at.x, cz = z + 0.5 - at.z
      const has = !(cx < B.x0 - MARGIN || cx > B.x1 + MARGIN || cz < B.z0 - MARGIN || cz > B.z1 + MARGIN) && floorCovers(g, cx, cz)
      const furn = has && furnAt(g, cx, cz)
      const blocked = !!(tiles[z * meta.tileWidth + x] & 0x8000)
      if (blocked) { block++; if (has && !furn) blockFree++ }
      else { walk++; if (!has) walkOff++; else if (furn) walkFurn++ }
    }
    // 걸음칸 덩어리의 상자 ↔ BDSP 바닥 상자 겹침 (IoU)
    const ax0 = rx0, ax1 = rx1 + 1, az0 = rz0, az1 = rz1 + 1
    const ix = Math.max(0, Math.min(ax1, B.x1) - Math.max(ax0, B.x0)), iz = Math.max(0, Math.min(az1, B.z1) - Math.max(az0, B.z0))
    const cut = ix * iz, uni = (ax1 - ax0) * (az1 - az0) + (B.x1 - B.x0) * (B.z1 - B.z0) - cut
    const iou = uni > 0 ? cut / uni : 0
    return { box: [rx0, rz0, rx1, rz1], walk, block, walkOff, walkFurn, blockFree, iou, wrong: walkOff + walkFurn + blockFree }
  }
  return { fit, hamming, maps, events, inter, geom }
}
