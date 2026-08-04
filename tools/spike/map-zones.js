// 존 이름 테이블 ↔ 행렬 헤더 연결 — 트윈리프타운 확정
'use strict'
const path = require('path')
const { readRom } = require('./nds')
const { parseNarc } = require('./gen4text')

const root = path.resolve(__dirname, '..', '..')
const rom = readRom(path.join(root, 'raw', 'roms', 'Pokemon Platinum (US).nds'))
const nameBin = rom.read('/fielddata/maptable/mapname.bin')
const matrices = parseNarc(rom.read('/fielddata/mapmatrix/map_matrix.narc'))
const lands = parseNarc(rom.read('/fielddata/land_data/land_data.narc'))

const ENTRY = 16
const zoneNames = []
for (let i = 0; i * ENTRY < nameBin.length; i++) {
  zoneNames.push(nameBin.toString('latin1', i * ENTRY, (i + 1) * ENTRY).replace(/\0+$/, ''))
}
console.log(`존 이름 ${zoneNames.length}개`)

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

const m = parseMatrix(matrices[0])

// 오버월드에 실제로 쓰인 헤더 → 이름
const used = new Map()
for (let i = 0; i < m.headers.length; i++) {
  const h = m.headers[i]
  if (m.maps[i] === 0xffff) continue
  if (!used.has(h)) used.set(h, [])
  used.get(h).push({ x: i % m.width, y: (i / m.width) | 0, chunk: m.maps[i] })
}
console.log(`오버월드에 쓰인 헤더 ${used.size}종\n`)

console.log('=== 헤더 → 존 이름 (앞 40개, 셀 수 순) ===')
const rows = [...used].map(([h, cells]) => ({ h, cells, name: zoneNames[h] ?? '?' }))
for (const r of rows.slice(0, 40)) {
  const b = r.cells.reduce((s, c) => s + (c.chunk < lands.length ? lands[c.chunk].readUInt32LE(4) / 48 : 0), 0)
  const at = r.cells.map((c) => `(${c.x},${c.y})`).slice(0, 4).join('')
  console.log(`  h=${String(r.h).padStart(3)} "${(r.name || '(빈이름)').padEnd(14)}" 셀 ${String(r.cells.length).padStart(2)}개 건물 ${String(b).padStart(3)}동  ${at}`)
}

console.log('\n=== 마을·도시로 보이는 이름 검색 ===')
for (const kw of ['T01', 'TWIN', 'FUTABA', 'C01', 'R201', 'R202']) {
  const idx = zoneNames.findIndex((n) => n === kw || n.startsWith(kw))
  if (idx >= 0) {
    const cells = used.get(idx)
    console.log(`  "${kw}" → 인덱스 ${idx} ("${zoneNames[idx]}") ${cells ? `셀 ${cells.length}개 ${cells.map((c) => `(${c.x},${c.y})#${c.chunk}`).join(' ')}` : '오버월드 미사용'}`)
  } else {
    console.log(`  "${kw}" 없음`)
  }
}
