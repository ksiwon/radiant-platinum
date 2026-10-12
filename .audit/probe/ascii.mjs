// 원작 칸 ↔ BDSP 방 바닥을 글자로 겹쳐 본다.  node ascii.mjs <mapId> <room> [--root PT]
//   # 막힌 칸   . 걸을 수 있는 칸   (소문자 f = BDSP 바닥 없음, 대문자 O = 막힌 칸인데 BDSP 바닥 열림)  N 사람  W 워프
import fs from 'node:fs'
import path from 'node:path'
import { makeFit } from './roomFitLib.mjs'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const ROOT = arg('--root', path.resolve(import.meta.dirname, '../..'))
const [id, room] = process.argv.slice(2).filter((a, i, v) => !a.startsWith('--') && v[i - 1] !== '--root')
const { fit, maps, events, inter, geom } = makeFit(ROOT)
const h = maps[Number(id)]
const meta = inter[String(h.matrix)]
const bin = fs.readFileSync(path.join(ROOT, 'public/data/matrices/interiors.bin'))
const tiles = new Uint16Array(bin.buffer.slice(bin.byteOffset + meta.byteOffset, bin.byteOffset + meta.byteOffset + meta.tileWidth * meta.tileHeight * 2))
const g = geom(room)
const ev = events[h.events]
const f = fit(Number(id), room)
const [bx0, bz0, bx1, bz1] = f.ptBox
const mark = new Map()
for (const n of ev.npcs) mark.set(n.x + ',' + n.z, 'N')
for (const w of ev.warps) mark.set(w.x + ',' + w.z, 'W')
const inTri = (px, pz, v) => { const [a, b, c] = v; const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) return false; const l1 = ((b[2] - c[2]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[2])) / d, l2 = ((c[2] - a[2]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[2])) / d; return l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6 }
const floorAt = (x, z) => (g.grid.get(Math.floor(x) + ',' + Math.floor(z)) ?? []).some((v) => inTri(x, z, v))
const out = []
for (let z = bz0 - 1; z < bz1 + 1; z++) {
  let row = String(z).padStart(3) + ' '
  for (let x = bx0 - 1; x < bx1 + 1; x++) {
    const t = x >= 0 && z >= 0 && x < meta.tileWidth && z < meta.tileHeight ? tiles[z * meta.tileWidth + x] : 0x8000
    const blocked = !!(t & 0x8000), fl = floorAt(x + 0.5, z + 0.5)
    const m = mark.get(x + ',' + z)
    row += m ?? (blocked ? (fl ? 'O' : '#') : (fl ? '.' : 'f'))
  }
  out.push(row)
}
console.log(`${h.name} (mx${h.matrix}) ↔ ${room}  BDSP 바닥 x ${f.floor[0].toFixed(1)}~${f.floor[2].toFixed(1)} z ${f.floor[1].toFixed(1)}~${f.floor[3].toFixed(1)}  원작 상자 x ${bx0}~${bx1} z ${bz0}~${bz1}`)
console.log(out.join('\n'))
