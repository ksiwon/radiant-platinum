// 짝 없는 건물마다 BDSP 방 117벌 전부와 맞대 본다.  node pairSearch.mjs [--root <PT>] [mapId...]
import fs from 'node:fs'
import path from 'node:path'
import { makeFit } from './roomFitLib.mjs'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const ROOT = arg('--root', path.resolve(import.meta.dirname, '../..'))
const ids = process.argv.slice(2).filter((a, i, v) => !a.startsWith('--') && v[i - 1] !== '--root').map(Number)
const { fit, maps } = makeFit(ROOT)
const rooms = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/models/room/index.json'), 'utf8')).rooms
const out = []
for (const id of ids) {
  const h = maps[id]
  const res = []
  for (const r of rooms) {
    const f = fit(id, r)
    res.push({ room: r, ...f })
  }
  res.sort((a, b) => a.score - b.score)
  const best = res.slice(0, 5).map((x) => ({ room: x.room, score: x.score, walk: `${x.noFloor}/${x.walkable}`, furn: x.furnOnWalk, dims: x.dims.map((n) => +n.toFixed(1)), open: `${x.openOverBlocked}/${x.blocked}`, pOut: x.personOut, pBeh: x.personBehind, wOut: x.warpOut, floor: x.floor.map((n) => +n.toFixed(1)), bad: x.bad.slice(0, 6) }))
  out.push({ id, name: h.name, matrix: h.matrix, best })
  console.log(`${id} ${h.name} mx${h.matrix}: ` + best.map((x) => `${x.room}[${x.score} 걸${x.walk} 기물${x.furn} Δ${x.dims} 트임${x.open} 사람밖${x.pOut} 벽뒤${x.pBeh}]`).join('  '))
}
fs.mkdirSync(path.join(import.meta.dirname, 'out'), { recursive: true })
fs.writeFileSync(path.join(import.meta.dirname, 'out/pairSearch.json'), JSON.stringify(out))
