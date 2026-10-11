// 짝 없는 맵을 BDSP 던전 글 138벌과도 맞대 본다 (방 117벌은 pairSearch.mjs).  node dungeonPair.mjs [--root PT] mapId...
// 걸어 닿는 칸 중 glb에 위 보는 면이 없는 칸(틈)과, 있는 칸의 BDHC 높이 어긋남(들어올림 뒤)을 센다 — 틈 0 · 어긋남 0에 가까운 것이 짝이다
import fs from 'node:fs'
import path from 'node:path'
import { worldTris } from './mapsGlb.mjs'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const ROOT = arg('--root', path.resolve(import.meta.dirname, '../..'))
const D = (p) => path.join(ROOT, 'public/data', p)
const M = (p) => path.join(ROOT, 'public/models', p)
const ids = process.argv.slice(2).filter((a, i, v) => !a.startsWith('--') && v[i - 1] !== '--root').map(Number)
const maps = JSON.parse(fs.readFileSync(D('maps.json'), 'utf8')).maps
const events = JSON.parse(fs.readFileSync(D('events.json'), 'utf8')).events
const inter = JSON.parse(fs.readFileSync(D('matrices/interiors.json'), 'utf8')).matrices
const tilesBin = fs.readFileSync(D('matrices/interiors.bin'))
const dungeons = JSON.parse(fs.readFileSync(M('dungeon/index.json'), 'utf8')).dungeons.map((d) => d.name)
const SKIP = /RootShadow|Light|Grass|Flower|Tree|Fog|Shadow|Ceil|Smoke|Glass|Window|Water|Sea|Puddle/
const cache = new Map()
function surf(glb) {
  if (cache.has(glb)) return cache.get(glb)
  const { out } = worldTris(M(`dungeon/${glb}.glb`))
  const cells = new Set()
  for (const p of out) {
    if (SKIP.test(p.mat)) continue
    for (let t = 0; t < p.tri.length; t += 9) {
      const f = p.tri
      const ux = f[t + 3] - f[t], uy = f[t + 4] - f[t + 1], uz = f[t + 5] - f[t + 2], vx = f[t + 6] - f[t], vy = f[t + 7] - f[t + 1], vz = f[t + 8] - f[t + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      if (Math.abs(ny) / Math.hypot(nx, ny, nz) < 0.5) continue
      // 삼각형 안의 칸 한가운데만
      for (let x = Math.floor(Math.min(f[t], f[t + 3], f[t + 6])); x <= Math.floor(Math.max(f[t], f[t + 3], f[t + 6])); x++) {
        for (let z = Math.floor(Math.min(f[t + 2], f[t + 5], f[t + 8])); z <= Math.floor(Math.max(f[t + 2], f[t + 5], f[t + 8])); z++) {
          const px = x + 0.5, pz = z + 0.5
          const d = (f[t + 5] - f[t + 8]) * (f[t] - f[t + 6]) + (f[t + 6] - f[t + 3]) * (f[t + 2] - f[t + 8])
          if (Math.abs(d) < 1e-12) continue
          const l1 = ((f[t + 5] - f[t + 8]) * (px - f[t + 6]) + (f[t + 6] - f[t + 3]) * (pz - f[t + 8])) / d
          const l2 = ((f[t + 8] - f[t + 2]) * (px - f[t + 6]) + (f[t] - f[t + 6]) * (pz - f[t + 8])) / d
          if (l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6) cells.add(x + ',' + z)
        }
      }
    }
  }
  cache.set(glb, cells)
  return cells
}
for (const id of ids) {
  const h = maps[id], meta = inter[String(h.matrix)]
  if (!meta) { console.log(id, h.name, '행렬 자료 없음'); continue }
  const tile = (x, z) => tilesBin.readUInt16LE(meta.byteOffset + (z * meta.tileWidth + x) * 2)
  const ev = events[h.events]
  const seen = new Set(), q = []
  const push = (x, z) => { const k = z * meta.tileWidth + x; if (!seen.has(k)) { seen.add(k); q.push([x, z]) } }
  for (const w of ev?.warps ?? []) if (!(w.x === 0 && w.z === 0)) push(w.x, w.z)
  for (let i = 0; i < q.length; i++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = q[i][0] + dx, nz = q[i][1] + dz
    if (nx < 0 || nz < 0 || nx >= meta.tileWidth || nz >= meta.tileHeight || (tile(nx, nz) & 0x8000)) continue
    push(nx, nz)
  }
  const walk = q.filter(([x, z]) => !(tile(x, z) & 0x8000))
  const res = dungeons.map((g) => {
    const s = surf(g)
    let miss = 0
    const ws = new Set(walk.map(([x, z]) => x + ',' + z))
    for (const [x, z] of walk) if (!s.has(x + ',' + z)) miss++
    // 겹침(자카드): 걸음칸 ∪ glb 위 보는 면 칸 중 둘 다인 것 — 글이 훨씬 넓으면 낮다
    let both = 0
    for (const k of ws) if (s.has(k)) both++
    const jac = both / (ws.size + s.size - both)
    return { g, miss, jac }
  }).sort((a, b) => b.jac - a.jac).slice(0, 3)
  console.log(`${id} ${h.name} mx${h.matrix} 걸음 ${walk.length}: ` + res.map((r) => `${r.g}[틈 ${r.miss} 겹침 ${r.jac.toFixed(2)}]`).join('  '))
}
