// 청크 충돌 격자 해석 (Phase 1)
// perm 2048B = 32x32 타일 × 2B. 두 해석 중 어느 쪽이 맞는지 데이터로 가른다:
//   (A) u16/타일  (B) u8 배열 두 개(충돌 1024 + 속성 1024)
'use strict'
const path = require('path')
const { readRom } = require('./nds')
const { parseNarc } = require('./gen4text')

const root = path.resolve(__dirname, '..', '..')
const rom = readRom(path.join(root, 'raw', 'roms', 'Pokemon Platinum (US).nds'))
const matrices = parseNarc(rom.read('/fielddata/mapmatrix/map_matrix.narc'))
const lands = parseNarc(rom.read('/fielddata/land_data/land_data.narc'))

const LAND_HEADER = 16
function parseLand(buf) {
  const perm = buf.readUInt32LE(0), obj = buf.readUInt32LE(4)
  const model = buf.readUInt32LE(8), bdhc = buf.readUInt32LE(12)
  let p = LAND_HEADER
  const out = { sizes: { perm, obj, model, bdhc } }
  out.perm = buf.subarray(p, p + perm); p += perm
  out.objects = buf.subarray(p, p + obj); p += obj
  out.model = buf.subarray(p, p + model); p += model
  out.bdhc = buf.subarray(p, p + bdhc)
  return out
}

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

// --- 해석 (A): u16/타일. 상·하위 바이트의 값 분포를 본다 ---
function statsU16(perm) {
  const lo = new Map(), hi = new Map()
  for (let i = 0; i < 1024; i++) {
    const v = perm.readUInt16LE(i * 2)
    lo.set(v & 0xff, (lo.get(v & 0xff) ?? 0) + 1)
    hi.set(v >> 8, (hi.get(v >> 8) ?? 0) + 1)
  }
  return { lo, hi }
}
// --- 해석 (B): 앞 1024B / 뒤 1024B 분리 ---
function statsSplit(perm) {
  const a = new Map(), b = new Map()
  for (let i = 0; i < 1024; i++) {
    a.set(perm[i], (a.get(perm[i]) ?? 0) + 1)
    b.set(perm[1024 + i], (b.get(perm[1024 + i]) ?? 0) + 1)
  }
  return { a, b }
}
const top = (m, n = 6) =>
  [...m].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join(' ')

const overworld = parseMatrix(matrices[0])
const townChunks = []
for (const id of new Set(overworld.maps)) {
  if (id === 0xffff || id >= lands.length) continue
  const L = parseLand(lands[id])
  if (L.sizes.obj > 0) townChunks.push({ id, buildings: L.sizes.obj / 48 })
}
townChunks.sort((a, b) => b.buildings - a.buildings)
console.log(`오버월드 행렬 "${overworld.name}" ${overworld.width}x${overworld.height}`)
console.log(`건물이 있는 청크 ${townChunks.length}개 — 상위: ` +
  townChunks.slice(0, 10).map((c) => `#${c.id}(${c.buildings}동)`).join(' '))

const sample = townChunks[0].id
const L = parseLand(lands[sample])
const su = statsU16(L.perm), ss = statsSplit(L.perm)
console.log(`\n=== 청크 #${sample} perm 해석 비교 ===`)
console.log(`  (A) u16   하위바이트 고유 ${su.lo.size}종  ${top(su.lo)}`)
console.log(`      u16   상위바이트 고유 ${su.hi.size}종  ${top(su.hi)}`)
console.log(`  (B) 분리  앞1024 고유 ${ss.a.size}종  ${top(ss.a)}`)
console.log(`      분리  뒤1024 고유 ${ss.b.size}종  ${top(ss.b)}`)

// u16 값 분포 — 타일 종류의 실제 어휘
function u16Hist(perm) {
  const h = new Map()
  for (let i = 0; i < 1024; i++) {
    const v = perm.readUInt16LE(i * 2)
    h.set(v, (h.get(v) ?? 0) + 1)
  }
  return h
}
console.log(`\n=== 청크 #${sample} u16 타일 값 분포 ===`)
for (const [v, n] of [...u16Hist(L.perm)].sort((a, b) => b[1] - a[1])) {
  console.log(`  0x${v.toString(16).padStart(4, '0')}  ${String(n).padStart(4)}개`)
}

// 전체 청크에서 등장하는 u16 어휘 (게임 전체의 타일 종류)
const vocab = new Map()
for (const id of new Set(overworld.maps)) {
  if (id === 0xffff || id >= lands.length) continue
  const p = parseLand(lands[id]).perm
  for (let i = 0; i < 1024; i++) {
    const v = p.readUInt16LE(i * 2)
    vocab.set(v, (vocab.get(v) ?? 0) + 1)
  }
}
console.log(`\n=== 오버월드 전체 타일 어휘: ${vocab.size}종 (상위 16) ===`)
for (const [v, n] of [...vocab].sort((a, b) => b[1] - a[1]).slice(0, 16)) {
  console.log(`  0x${v.toString(16).padStart(4, '0')}  ${String(n).padStart(6)}개`)
}

const glyph = (v) => (v === 0x0000 ? '.' : v === 0x8000 ? '#' : v === 0x0015 ? ',' : v === 0x0071 ? '~' : '?')
console.log(`\n=== 청크 #${sample} 타일 격자  (. 통행  # 벽  , 0x15  ~ 0x71) ===`)
for (let y = 0; y < 32; y++) {
  let row = ''
  for (let x = 0; x < 32; x++) row += glyph(L.perm.readUInt16LE((y * 32 + x) * 2))
  console.log('  ' + row)
}
