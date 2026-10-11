// 던전 glb ↔ 원작 자료 대조 (읽기 전용). 맵마다 센다:
//   cells       걸을 수 있는 칸 (원작 통행값)
//   gap         걸을 수 있는데 glb에 위 보는 면(물 · 바다 포함)이 하나도 없는 칸  ← 틈
//   off         glb 바닥이 원작 높이(BDHC)와 0.5칸 넘게 갈리는 칸 (BDHC 판이 하나뿐인 칸만) ← 어긋남
//   actorOut    사람 · 워프 · 표지판이 glb 바닥 밖에 선 것
//   noTex       그림이 없는 재질을 쓰는 삼각형 ← 빈 면
// 쓰임: node dungeonAudit.mjs [--root <PT>] [name...]  → stdout 표 + .audit/probe/out/dungeonAudit.json
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
const bdhc = JSON.parse(fs.readFileSync(D('bdhc.json'), 'utf8'))
const bb = fs.readFileSync(D('bdhc.bin'))
const dungeons = new Set(JSON.parse(fs.readFileSync(M('dungeon/index.json'), 'utf8')).dungeons.map((d) => d.name))
const rooms = new Set(JSON.parse(fs.readFileSync(M('room/index.json'), 'utf8')).rooms)
const LIFT = { d03r0101: 1, d05r0105: -1, d05r0114: 1, d05r0115: 1, d05r0116: 1, d13r0101: 1, d28r0101: 6 }
const MIS = new Set(['d31r0201'])

function dungeonFor(here) {
  if (!here || here.matrix === 0) return null
  const own = here.name.toLowerCase()
  if (rooms.has(own)) return null // 방이 먼저
  const fits = (n) => dungeons.has(n) && !MIS.has(n)
  if (dungeons.has(own)) return fits(own) ? own : null
  for (const m of maps) if (m.matrix === here.matrix && fits(m.name.toLowerCase())) return m.name.toLowerCase()
  return null
}

const bdhcHeights = (land, x, z) => {
  const span = bdhc.chunks[land]
  if (!span) return []
  const out = []
  for (let i = 0; i < span[1]; i++) {
    const o = (span[0] + i) * 16, s = bdhc.fixedPerTile
    const ax = bb.readInt32LE(o) / s, az = bb.readInt32LE(o + 4) / s, bx = bb.readInt32LE(o + 8) / s, bz = bb.readInt32LE(o + 12) / s
    if (x < Math.min(ax, bx) || x > Math.max(ax, bx) || z < Math.min(az, bz) || z > Math.max(az, bz)) continue
    const p = bdhc.planes[bb.readUInt16LE(bdhc.plateCount * 16 + (span[0] + i) * 2)]
    if (p[1] !== 0) out.push(-(p[0] * x + p[2] * z + p[3]) / p[1])
  }
  return out
}

const NOT_GROUND = /RootShadow|Light|Grass|Flower|Tree|Fog|Shadow|Ceil|Smoke|Glass|Window/
const WATER = /Water|Sea|Puddle/
const groundCache = new Map()
function ground(glb) {
  if (groundCache.has(glb)) return groundCache.get(glb)
  const { out, json } = worldTris(M(`dungeon/${glb}.glb`))
  const cells = new Map()
  const add = (k, f) => { const l = cells.get(k); if (l) l.push(f); else cells.set(k, [f]) }
  let tris = 0, noTexTris = 0
  const bad = new Map()
  const mats = json.materials
  for (const p of out) {
    const mat = mats.find((m) => m.name === p.mat)
    const hasTex = !!mat?.pbrMetallicRoughness?.baseColorTexture
    const n = p.tri.length / 9
    tris += n
    const lightish = /Light|Shadow|Fog|Smoke|Glass|Water|Sea|Puddle|Ceil/.test(p.mat)
    if (!hasTex && !lightish) { noTexTris += n; bad.set(p.mat, (bad.get(p.mat) ?? 0) + n) }
    const water = WATER.test(p.mat)
    if (water && process.env.NOWATER) continue
    if (NOT_GROUND.test(p.mat) && !water) continue
    for (let t = 0; t < n; t++) {
      const f = p.tri.subarray(t * 9, t * 9 + 9)
      const ux = f[3] - f[0], uy = f[4] - f[1], uz = f[5] - f[2], vx = f[6] - f[0], vy = f[7] - f[1], vz = f[8] - f[2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const l = Math.hypot(nx, ny, nz)
      if (l < 1e-12 || Math.abs(ny / l) < 0.5) continue
      const fr = { f, water }
      for (let x = Math.floor(Math.min(f[0], f[3], f[6])); x <= Math.floor(Math.max(f[0], f[3], f[6])); x++) {
        for (let z = Math.floor(Math.min(f[2], f[5], f[8])); z <= Math.floor(Math.max(f[2], f[5], f[8])); z++) add(`${x},${z}`, fr)
      }
    }
  }
  const at = (x, z) => (cells.get(`${Math.floor(x)},${Math.floor(z)}`) ?? []).flatMap(({ f, water }) => {
    const d = (f[5] - f[8]) * (f[0] - f[6]) + (f[6] - f[3]) * (f[2] - f[8])
    if (Math.abs(d) < 1e-12) return []
    const l1 = ((f[5] - f[8]) * (x - f[6]) + (f[6] - f[3]) * (z - f[8])) / d
    const l2 = ((f[8] - f[2]) * (x - f[6]) + (f[0] - f[6]) * (z - f[8])) / d
    const l3 = 1 - l1 - l2
    return l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6 ? [] : [{ y: l1 * f[1] + l2 * f[4] + l3 * f[7], water }]
  })
  const g = { at, tris, noTexTris, bad: [...bad].sort((a, b) => b[1] - a[1]).slice(0, 4), mats: mats.length }
  groundCache.set(glb, g)
  return g
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

const rows = []
for (const m of maps) {
  const glb = dungeonFor(m)
  if (!glb) continue
  if (only.length && !only.some((o) => m.name.toLowerCase() === o.toLowerCase() || glb === o)) continue
  const meta = inter[String(m.matrix)]
  if (!meta) { rows.push({ map: m.id, name: m.name, glb, error: 'no matrix' }); continue }
  const g = ground(glb)
  const lift = LIFT[glb] ?? 0
  const org = originOf(glb)
  const tileAt = (x, z) => tilesBin.readUInt16LE(meta.byteOffset + (z * meta.tileWidth + x) * 2)
  let cells = 0, gap = 0, off = 0, checked = 0
  const diffs = []
  const waterOnly = []
  const votes = new Map()
  const gapCells = [], offCells = []
  // 닿는 칸만 센다 — 방이 청크보다 작으면 바깥은 막히지 않은 빈 칸이다. 워프에서 걸어 닿는 칸을 찾는다
  const evm = events[m.events]
  const own = new Set()
  const landOf = new Map()
  for (const c of meta.chunks) {
    if (c.zone >= 0 && c.zone !== m.id) continue
    for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
      const wx = c.mx * 32 + x, wz = c.my * 32 + z
      if (wx >= meta.tileWidth || wz >= meta.tileHeight) continue
      own.add(wz * meta.tileWidth + wx); landOf.set(wz * meta.tileWidth + wx, [c.land, x, z])
    }
  }
  const reach = new Set()
  const queue = []
  const push = (x, z) => { const k = z * meta.tileWidth + x; if (own.has(k) && !reach.has(k)) { reach.add(k); queue.push([x, z]) } }
  for (const w of evm?.warps ?? []) { if (w.x === 0 && w.z === 0) continue; push(w.x, w.z) }
  for (let q = 0; q < queue.length; q++) {
    const [x, z] = queue[q]
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nz < 0 || nx >= meta.tileWidth || nz >= meta.tileHeight) continue
      if (tileAt(nx, nz) & 0x8000) continue
      push(nx, nz)
    }
  }
  const walkSet = reach.size ? reach : own // 문이 이 맵 칸에 없으면(대습초원) 칸 전부
  for (const k of walkSet) {
    {
      const wz = Math.floor(k / meta.tileWidth), wx = k % meta.tileWidth
      const [land, x, z] = landOf.get(k)
      const c = { land }
      if (tileAt(wx, wz) & 0x8000) continue
      cells++
      const gl = g.at(wx + 0.5 - org.x, wz + 0.5 - org.z)
      if (process.env.WATERCHK && gl.length && gl.every((q) => q.water)) { const rr = bdhcHeights(c.land, x + 0.5, z + 0.5); waterOnly.push([+gl[0].y.toFixed(2), rr.map((n) => +n.toFixed(2)).join('/')].join(' bdhc ')) }
      if (!gl.length) { gap++; if (gapCells.length < 12) gapCells.push([wx, wz]); continue }
      const rom = bdhcHeights(c.land, x + 0.5, z + 0.5)
      if (process.env.DEBUG_CELL && cells < 6) console.log('cell', m.name, wx, wz, 'bdhc', rom.map((n) => +n.toFixed(2)), 'glb', gl.map((q) => +q.y.toFixed(2) + (q.water ? 'w' : '')))
      if (rom.length !== 1) continue
      checked++
      const near = gl.reduce((p, q) => (Math.abs(q.y + lift - rom[0]) < Math.abs(p.y + lift - rom[0]) ? q : p))
      { const d = Math.round((near.y - rom[0]) * 4) / 4; votes.set(d, (votes.get(d) ?? 0) + 1); diffs.push(gl.map((q) => q.y - rom[0])) }
      if (Math.abs(near.y + lift - rom[0]) > 0.5) { off++; if (offCells.length < 12) offCells.push([wx, wz, +(near.y + lift - rom[0]).toFixed(2)]) }
    }
  }
  // 정수 들어올림 L마다 「어느 후보면이든 0.5 안」인 칸 몫 — 가장 좋은 L
  let bestLift = 0, bestShare = -1, zeroShare = 0
  for (let L = -8; L <= 8; L++) {
    const ok = diffs.filter((ds) => ds.some((d) => Math.abs(d + L) <= 0.5)).length
    const sh = diffs.length ? ok / diffs.length : 0
    if (L === 0) zeroShare = sh
    if (sh > bestShare + 1e-9 || (Math.abs(sh - bestShare) < 1e-9 && Math.abs(L) < Math.abs(bestLift))) { bestShare = sh; bestLift = L }
  }
  if (process.env.WATERCHK) { const h = new Map(); for (const k of waterOnly) h.set(k, (h.get(k) ?? 0) + 1); console.log(m.name, '물만 있는 칸', waterOnly.length, [...h].sort((a, b) => b[1] - a[1]).slice(0, 5)) }
  const top = [...votes].sort((a, b) => b[1] - a[1])[0]
  const modal = top ? top[0] : 0, modalShare = top && checked ? +(top[1] / checked).toFixed(2) : 0
  const ev = events[m.events]
  const outs = []
  const chk = (kind, e) => {
    if (e.x === 0 && e.z === 0 && kind === 'warp') return
    if (!g.at(e.x + 0.5 - org.x, e.z + 0.5 - org.z).length) outs.push(`${kind}(${e.x},${e.z})`)
  }
  for (const n of ev?.npcs ?? []) chk('npc', n)
  for (const w of ev?.warps ?? []) chk('warp', w)
  for (const s of ev?.signs ?? []) chk('sign', s)
  rows.push({
    map: m.id, name: m.name, glb, borrowed: glb !== m.name.toLowerCase(), cells, gap, gapPct: cells ? +(gap / cells * 100).toFixed(1) : 0, checked, off,
    offPct: checked ? +(off / checked * 100).toFixed(1) : 0, actorOut: outs, noTexTris: g.noTexTris, tris: g.tris, noTex: g.bad, lift, modal, modalShare, bestLift, bestShare: +bestShare.toFixed(2), zeroShare: +zeroShare.toFixed(2), votes: [...votes].sort((a, b) => b[1] - a[1]).slice(0, 4), org, gapCells, offCells,
  })
}
fs.mkdirSync(path.join(import.meta.dirname, 'out'), { recursive: true })
fs.writeFileSync(path.join(import.meta.dirname, 'out/dungeonAudit.json'), JSON.stringify(rows))
const f = (n, w) => String(n).padStart(w)
for (const r of rows) {
  if (r.error) { console.log(`${f(r.map, 3)} ${r.name} ${r.glb} ${r.error}`); continue }
  console.log(`${f(r.map, 3)} ${r.name.padEnd(9)} ${r.glb.padEnd(9)}${r.borrowed ? '*' : ' '} 칸 ${f(r.cells, 5)} 틈 ${f(r.gap, 4)} (${f(r.gapPct, 4)}%) 어긋 ${f(r.off, 4)}/${f(r.checked, 5)} (${f(r.offPct, 4)}%) 최빈차 ${f(r.modal, 5)}(${r.modalShare}) 밖 ${r.actorOut.length} 빈면 ${r.noTexTris}/${r.tris}`)
}
