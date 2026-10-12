// 던전 glb의 선 면(벽 · 바위 · 나무 몸통)과 원작 통행값을 맞댄다 (읽기 전용).
//   inside   걸을 수 있는 칸(문에서 닿는) 한가운데 0.25칸 안에 선 면이 지나가는 것 — 걸으면 벽 · 바위를 뚫는다
//   open     막힌 칸(닿는 칸 둘레 한 겹) 한가운데에 위 보는 땅이 있고 선 면이 하나도 없는 것 — 보이지 않는 벽
// 쓰임: node dungeonSolid.mjs [--root <PT>] [name...]  → stdout 표 + out/dungeonSolid.json
import fs from 'node:fs'
import path from 'node:path'
import { worldTris } from './mapsGlb.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const ROOT = arg('--root', path.resolve(import.meta.dirname, '../..'))
const D = (p) => path.join(ROOT, 'public/data', p)
const M = (p) => path.join(ROOT, 'public/models', p)
const only = process.argv.slice(2).filter((a, i, v) => !a.startsWith('--') && v[i - 1] !== '--root')

const maps = JSON.parse(fs.readFileSync(D('maps.json'), 'utf8')).maps
const events = JSON.parse(fs.readFileSync(D('events.json'), 'utf8')).events
const inter = JSON.parse(fs.readFileSync(D('matrices/interiors.json'), 'utf8')).matrices
const tilesBin = fs.readFileSync(D('matrices/interiors.bin'))
const dungeons = new Set(JSON.parse(fs.readFileSync(M('dungeon/index.json'), 'utf8')).dungeons.map((d) => d.name))
const rooms = new Set(JSON.parse(fs.readFileSync(M('room/index.json'), 'utf8')).rooms)
const MIS = new Set(['d31r0201'])
const LIFT = { d03r0101: 1, d05r0105: -1, d05r0114: 1, d05r0115: 1, d05r0116: 1, d13r0101: 1, d28r0101: 6, d11r0101: 1, d12r0101: 1, d21r0101: 1, d21r0102: 1, d24r0104: 1, d27r0101: 1, d27r0102: 1 }

function dungeonFor(here) {
  if (!here || here.matrix === 0) return null
  const own = here.name.toLowerCase()
  if (rooms.has(own)) return null
  const fits = (n) => dungeons.has(n) && !MIS.has(n)
  if (dungeons.has(own)) return fits(own) ? own : null
  for (const m of maps) if (m.matrix === here.matrix && fits(m.name.toLowerCase())) return m.name.toLowerCase()
  return null
}
function originOf(glb) {
  const mp = maps.find((x) => x.name.toLowerCase() === glb)
  const meta = mp && inter[String(mp.matrix)]
  if (!mp || !meta) return { x: 0, z: 0 }
  const own = meta.chunks.filter((c) => c.zone === mp.id)
  if (!own.length) return { x: 0, z: 0 }
  const n = meta.tileWidth / meta.width
  return { x: Math.min(...own.map((c) => c.mx)) * n, z: Math.min(...own.map((c) => c.my)) * n }
}

const SOLID_SKIP = /RootShadow|Light|Grass|Flower|Fog|Shadow|Ceil|Smoke|Glass|Window|Water|Sea|Puddle|Sky|Mat_|Mark_|Seam|Grad/
const GROUND_SKIP = /RootShadow|Light|Grass|Flower|Tree|Fog|Shadow|Ceil|Smoke|Glass|Window|Water|Sea|Puddle/
const cache = new Map()
function model(glb) {
  if (cache.has(glb)) return cache.get(glb)
  const { out } = worldTris(M(`dungeon/${glb}.glb`))
  const wall = new Map() // "x,z" → [segment {ax,az,bx,bz,y0,y1}]
  const up = new Map()
  for (const p of out) {
    const solid = !SOLID_SKIP.test(p.mat)
    const gnd = !GROUND_SKIP.test(p.mat)
    for (let t = 0; t < p.tri.length; t += 9) {
      const f = p.tri
      const ux = f[t + 3] - f[t], uy = f[t + 4] - f[t + 1], uz = f[t + 5] - f[t + 2], vx = f[t + 6] - f[t], vy = f[t + 7] - f[t + 1], vz = f[t + 8] - f[t + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const l = Math.hypot(nx, ny, nz)
      if (l < 1e-12) continue
      const ay = Math.abs(ny / l)
      const xs = [f[t], f[t + 3], f[t + 6]], zs = [f[t + 2], f[t + 5], f[t + 8]], ys = [f[t + 1], f[t + 4], f[t + 7]]
      const x0 = Math.floor(Math.min(...xs)), x1 = Math.floor(Math.max(...xs)), z0 = Math.floor(Math.min(...zs)), z1 = Math.floor(Math.max(...zs))
      if (ay >= 0.5) {
        if (!gnd) continue
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          const px = x + 0.5, pz = z + 0.5
          const d = (zs[1] - zs[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (zs[0] - zs[2])
          if (Math.abs(d) < 1e-12) continue
          const l1 = ((zs[1] - zs[2]) * (px - xs[2]) + (xs[2] - xs[1]) * (pz - zs[2])) / d
          const l2 = ((zs[2] - zs[0]) * (px - xs[2]) + (xs[0] - xs[2]) * (pz - zs[2])) / d
          if (l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6) {
            const k = x + ',' + z
            const y = l1 * ys[0] + l2 * ys[1] + (1 - l1 - l2) * ys[2]
            const cur = up.get(k)
            if (cur === undefined || y > cur) up.set(k, y)
          }
        }
      } else if (ay < 0.6 && solid) {
        // 서 있는 면 — xz 선분 하나(삼각형을 위에서 본 가장 긴 변)
        let best = null
        for (let a = 0; a < 3; a++) {
          const b = (a + 1) % 3
          const len = Math.hypot(xs[a] - xs[b], zs[a] - zs[b])
          if (!best || len > best.len) best = { len, a, b }
        }
        if (best.len < 0.05) continue
        const seg = { ax: xs[best.a], az: zs[best.a], bx: xs[best.b], bz: zs[best.b], y0: Math.min(...ys), y1: Math.max(...ys), mat: p.mat }
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x + ',' + z; const l2 = wall.get(k); if (l2) l2.push(seg); else wall.set(k, [seg]) }
      }
    }
  }
  const m = { wall, up }
  cache.set(glb, m)
  return m
}
function nearWall(m, cx, cz, gy, r) {
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    for (const s of m.wall.get(Math.floor(cx + dx) + ',' + Math.floor(cz + dz)) ?? []) {
      if (s.y1 < gy + 0.3 || s.y0 > gy + 1.5) continue
      const ex = s.bx - s.ax, ez = s.bz - s.az
      const len2 = ex * ex + ez * ez
      const t = len2 ? Math.max(0, Math.min(1, ((cx - s.ax) * ex + (cz - s.az) * ez) / len2)) : 0
      if (Math.hypot(cx - (s.ax + ex * t), cz - (s.az + ez * t)) <= r) return s.mat
    }
  }
  return false
}

const rows = []
for (const h of maps) {
  const glb = dungeonFor(h)
  if (!glb) continue
  if (only.length && !only.some((o) => h.name.toLowerCase() === o.toLowerCase() || glb === o)) continue
  const meta = inter[String(h.matrix)]
  if (!meta) continue
  const lift = LIFT[glb] ?? 0
  const org = originOf(glb)
  const m = model(glb)
  const tile = (x, z) => (x < 0 || z < 0 || x >= meta.tileWidth || z >= meta.tileHeight ? 0x8000 : tilesBin.readUInt16LE(meta.byteOffset + (z * meta.tileWidth + x) * 2))
  const own = new Set()
  for (const c of meta.chunks) {
    if (c.zone >= 0 && c.zone !== h.id) continue
    for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
      const wx = c.mx * 32 + x, wz = c.my * 32 + z
      if (wx < meta.tileWidth && wz < meta.tileHeight) own.add(wz * meta.tileWidth + wx)
    }
  }
  const reach = new Set(), q = []
  const push = (x, z) => { const k = z * meta.tileWidth + x; if (own.has(k) && !reach.has(k)) { reach.add(k); q.push([x, z]) } }
  for (const w of events[h.events]?.warps ?? []) if (!(w.x === 0 && w.z === 0)) push(w.x, w.z)
  for (let i = 0; i < q.length; i++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = q[i][0] + dx, nz = q[i][1] + dz
    if (nx < 0 || nz < 0 || nx >= meta.tileWidth || nz >= meta.tileHeight || (tile(nx, nz) & 0x8000)) continue
    push(nx, nz)
  }
  if (!q.length) continue
  let walk = 0, inside = 0, edge = 0, open = 0
  const insideCells = [], openCells = []
  const insideMat = new Map()
  const seenEdge = new Set()
  for (const [x, z] of q) {
    if (tile(x, z) & 0x8000) continue
    walk++
    const cx = x + 0.5 - org.x, cz = z + 0.5 - org.z
    const gy = m.up.get(Math.floor(cx) + ',' + Math.floor(cz))
    if (gy === undefined) continue
    { const hit = nearWall(m, cx, cz, gy, 0.25); if (hit) { inside++; insideMat.set(hit, (insideMat.get(hit) ?? 0) + 1); if (insideCells.length < 8) insideCells.push([x, z]) } }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const bx = x + dx, bz = z + dz
      const bk = bz * meta.tileWidth + bx
      if (seenEdge.has(bk) || !(tile(bx, bz) & 0x8000)) continue
      seenEdge.add(bk)
      edge++
      const px = bx + 0.5 - org.x, pz = bz + 0.5 - org.z
      const ay = m.up.get(Math.floor(px) + ',' + Math.floor(pz))
      if (ay === undefined) continue // 땅이 없다 — 허공 · 물 · 절벽 아래: 막혀 있어야 맞다
      if (Math.abs(ay + lift - gy) > 0.6) continue // 높이가 다른 턱 · 절벽 위
      if (!nearWall(m, px, pz, ay, 0.9)) { open++; if (openCells.length < 8) openCells.push([bx, bz]) }
    }
  }
  rows.push({ map: h.id, name: h.name, glb, walk, inside, insidePct: +(inside / walk * 100).toFixed(1), edge, open, openPct: edge ? +(open / edge * 100).toFixed(1) : 0, insideCells, openCells, insideMat: [...insideMat].sort((a, b) => b[1] - a[1]).slice(0, 3) })
}
fs.mkdirSync(path.join(import.meta.dirname, 'out'), { recursive: true })
fs.writeFileSync(path.join(import.meta.dirname, 'out/dungeonSolid.json'), JSON.stringify(rows))
const f = (n, w) => String(n).padStart(w)
for (const r of rows) console.log(`${f(r.map, 3)} ${r.name.padEnd(9)} ${r.glb.padEnd(9)} 걸음 ${f(r.walk, 5)} 벽속 ${f(r.inside, 4)} (${f(r.insidePct, 4)}%)  둘레막힘 ${f(r.edge, 5)} 안보이는벽 ${f(r.open, 5)} (${f(r.openPct, 4)}%)`)
