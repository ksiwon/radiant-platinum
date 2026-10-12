// 관문: 원작에서 걸을 수 있으나 BDSP 바닥이 없는 칸(= BDSP에서는 벽)과, 그 칸에 걸린 사람 · 워프 · 표지판
import fs from 'node:fs'
import path from 'node:path'
import { makeFit } from './roomFitLib.mjs'
const ROOT = process.argv[2] ?? path.resolve(import.meta.dirname, '../..')
const { maps, events, inter, geom } = makeFit(ROOT)
const bin = fs.readFileSync(path.join(ROOT, 'public/data/matrices/interiors.bin'))
const inTri = (px, pz, v) => { const [a, b, c] = v; const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) return false; const l1 = ((b[2] - c[2]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[2])) / d, l2 = ((c[2] - a[2]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[2])) / d; return l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6 }
for (const [mx, room] of [[258, 'r218r0101'], [257, 'c05r0301']]) {
  const meta = inter[String(mx)], g = geom(room)
  const t = new Uint16Array(bin.buffer.slice(bin.byteOffset + meta.byteOffset, bin.byteOffset + meta.byteOffset + meta.tileWidth * meta.tileHeight * 2))
  const warpsAll = new Set(); for (const m of maps.filter((q) => q.matrix === mx)) for (const w of events[m.events].warps ?? []) warpsAll.add(w.x + ',' + w.z)
  const seen = new Set(), q = []
  for (const k of warpsAll) { seen.add(k); q.push(k.split(',').map(Number)) }
  for (let i = 0; i < q.length; i++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = q[i][0] + dx, nz = q[i][1] + dz, k = nx + ',' + nz; if (seen.has(k) || nx < 0 || nz < 0 || (t[nz * meta.tileWidth + nx] & 0x8000)) continue; seen.add(k); q.push([nx, nz]) }
  const cells = []
  for (const [x, z] of q) {
    if (warpsAll.has(x + ',' + z)) continue
    const cx = x + .5, cz = z + .5
    const out = cx < g.box.x0 - .3 || cx > g.box.x1 + .3 || cz < g.box.z0 - .3 || cz > g.box.z1 + .3
    const has = !out && (g.grid.get(Math.floor(cx) + ',' + Math.floor(cz)) ?? []).some((v) => inTri(cx, cz, v))
    if (!has) cells.push([x, z])
  }
  cells.sort((a, b) => a[1] - b[1] || a[0] - b[0])
  console.log('mx', mx, room, 'cells', cells.length, JSON.stringify(cells))
  for (const m of maps.filter((q) => q.matrix === mx)) {
    const ev = events[m.events]; const set = new Set(cells.map((c) => c.join(',')))
    const hit = [...(ev.npcs ?? []).map((n) => ['npc', n.x, n.z]), ...(ev.warps ?? []).map((n) => ['warp', n.x, n.z]), ...(ev.signs ?? []).map((n) => ['sign', n.x, n.z]), ...(ev.triggers ?? []).map((n) => ['trig', n.x, n.z])].filter((a) => set.has(a[1] + ',' + a[2]))
    console.log('  ', m.id, m.name, 'hits', JSON.stringify(hit))
  }
}
