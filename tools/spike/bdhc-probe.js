// BDHC 포맷 확인 — 크기 합이 곧 증명이다 (DATA.md §2.2)
//
// 구조는 디컴프에서 읽었다(pokeplatinum include/overlay005/bdhc.h · docs/maps/bdhc.md):
//
//   매직 "BDHC" 4B + u16 × 6 [points, normals, constants, plates, strips, accessList]
//   ⚠️ 디컴프의 BDHCHeader는 int로 적혀 있지만 **파일에는 u16이다** — 로더가
//      읽으면서 넓힌다. int32로 읽으면 카운트가 통째로 쓰레기가 된다(실제로 그랬다).
//   그 뒤에 적재 순서대로:
//     BDHCPoint  { fx32 x, z }                     8B
//     VecFx32    { fx32 x, y, z }                 12B
//     fx32       상수                              4B
//     BDHCPlate  { u16 p1, p2, normal, constant }  8B
//     BDHCStrip  { fx32 scanline, u16 n, u16 i }   8B
//     u16        접근 목록                          2B
//
// 이 계산이 666개 청크의 bdhc 크기와 한 바이트도 안 틀리면 배치가 확정된다.
'use strict'
const { openRom } = require('../extract/rom')
const { parseNarc } = require('./gen4text')

const LAND_HEADER = 16
/** 20.12 고정소수점 */
const FX = 4096

function splitLand(buf) {
  const perm = buf.readUInt32LE(0)
  const obj = buf.readUInt32LE(4)
  const model = buf.readUInt32LE(8)
  const bdhc = buf.readUInt32LE(12)
  const at = LAND_HEADER + perm + obj + model
  return { bdhc: buf.subarray(at, at + bdhc), size: bdhc }
}

const MAGIC = 'BDHC'
const HEADER = 16

function parseBdhc(buf) {
  if (buf.length < HEADER) return null
  if (buf.toString('latin1', 0, 4) !== MAGIC) return null
  const h = {
    points: buf.readUInt16LE(4),
    normals: buf.readUInt16LE(6),
    constants: buf.readUInt16LE(8),
    plates: buf.readUInt16LE(10),
    strips: buf.readUInt16LE(12),
    accessList: buf.readUInt16LE(14),
  }
  const want = HEADER + h.points * 8 + h.normals * 12 + h.constants * 4
    + h.plates * 8 + h.strips * 8 + h.accessList * 2
  return { h, want }
}

const rom = openRom()
const lands = parseNarc(rom.read('/fielddata/land_data/land_data.narc'))

let ok = 0, empty = 0
const bad = []
const totals = { points: 0, normals: 0, constants: 0, plates: 0, strips: 0, accessList: 0 }
let maxPlates = 0, maxPlatesChunk = -1
let tilted = 0, flat = 0

for (let i = 0; i < lands.length; i++) {
  const { bdhc: buf, size } = splitLand(lands[i])
  if (size === 0) { empty++; continue }
  const parsed = parseBdhc(buf)
  if (!parsed) { bad.push(`#${i} 매직이 없거나 너무 작다 (${size}B)`); continue }
  const { h, want } = parsed
  if (want !== size) { bad.push(`#${i} 예상 ${want} 실제 ${size}`); continue }
  ok++
  for (const k of Object.keys(totals)) totals[k] += h[k]
  if (h.plates > maxPlates) { maxPlates = h.plates; maxPlatesChunk = i }

  // 법선이 위를 가리키면 평평한 판, 기울어져 있으면 계단·경사다
  const at = HEADER + h.points * 8
  for (let n = 0; n < h.normals; n++) {
    const x = buf.readInt32LE(at + n * 12) / FX
    const z = buf.readInt32LE(at + n * 12 + 8) / FX
    if (Math.abs(x) < 1e-6 && Math.abs(z) < 1e-6) flat++
    else tilted++
  }
}

console.log(`청크 ${lands.length}개 · BDHC 있음 ${ok + bad.length} · 없음 ${empty}`)
console.log(`크기 합 일치 ${ok} · 불일치 ${bad.length}`)
for (const b of bad.slice(0, 8)) console.log(`  ${b}`)
console.log(`\n합계: 점 ${totals.points} · 법선 ${totals.normals} · 상수 ${totals.constants}` +
  ` · 판 ${totals.plates} · 스트립 ${totals.strips} · 접근목록 ${totals.accessList}`)
console.log(`법선 ${flat} 평평 / ${tilted} 기울어짐 (계단·경사)`)
console.log(`판이 가장 많은 청크 #${maxPlatesChunk}: ${maxPlates}개`)

// 실제 높이 값이 말이 되는지 — 한 청크의 판을 펴 본다
const sample = maxPlatesChunk
const { bdhc: buf } = splitLand(lands[sample])
const { h } = parseBdhc(buf)
const pAt = HEADER
const nAt = pAt + h.points * 8
const cAt = nAt + h.normals * 12
const plAt = cAt + h.constants * 4
console.log(`\n청크 #${sample}의 판 앞 6개 (타일 단위, 높이는 32유닛=1타일):`)
for (let i = 0; i < Math.min(6, h.plates); i++) {
  const o = plAt + i * 8
  const a = buf.readUInt16LE(o), b = buf.readUInt16LE(o + 2)
  const ni = buf.readUInt16LE(o + 4), ci = buf.readUInt16LE(o + 6)
  const pt = (j) => [buf.readInt32LE(pAt + j * 8) / FX, buf.readInt32LE(pAt + j * 8 + 4) / FX]
  const nv = [0, 1, 2].map((k) => buf.readInt32LE(nAt + ni * 12 + k * 4) / FX)
  const d = buf.readInt32LE(cAt + ci * 4) / FX
  const [ax, az] = pt(a)
  // Py = -(nx*Px + nz*Pz + d) / ny
  const y = nv[1] !== 0 ? -(nv[0] * ax + nv[2] * az + d) / nv[1] : NaN
  console.log(`  판${i}: (${ax.toFixed(1)}, ${az.toFixed(1)})~(${pt(b)[0].toFixed(1)}, ${pt(b)[1].toFixed(1)})` +
    ` 법선(${nv.map((v) => v.toFixed(2)).join(', ')}) d=${d.toFixed(2)} → 높이 ${y.toFixed(2)}`)
}
