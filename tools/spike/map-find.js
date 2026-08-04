// 오버월드 행렬 배치 시각화 — 트윈리프타운 찾기
// 신오지방은 남서쪽 끝에 트윈리프가 있다. 행렬 좌표에서 좌하단을 본다.
'use strict'
const path = require('path')
const { readRom } = require('./nds')
const { parseNarc } = require('./gen4text')

const root = path.resolve(__dirname, '..', '..')
const rom = readRom(path.join(root, 'raw', 'roms', 'Pokemon Platinum (US).nds'))
const matrices = parseNarc(rom.read('/fielddata/mapmatrix/map_matrix.narc'))
const lands = parseNarc(rom.read('/fielddata/land_data/land_data.narc'))

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
const buildingsOf = (id) => (id === 0xffff || id >= lands.length ? -1 : lands[id].readUInt32LE(4) / 48)

const m = parseMatrix(matrices[0])
console.log(`행렬 "${m.name}" ${m.width}x${m.height}  헤더=${m.headers ? '있음' : '없음'}`)

console.log('\n=== 배치도 (. 빈칸  · 청크만  숫자=건물 수, a+=10이상) ===')
console.log('     ' + [...Array(m.width).keys()].map((x) => (x % 10)).join(''))
for (let y = 0; y < m.height; y++) {
  let row = ''
  for (let x = 0; x < m.width; x++) {
    const id = m.maps[y * m.width + x]
    if (id === 0xffff) { row += '.'; continue }
    const b = buildingsOf(id)
    row += b === 0 ? '·' : b < 10 ? String(b) : String.fromCharCode(97 + Math.min(b - 10, 25))
  }
  console.log(String(y).padStart(4) + ' ' + row)
}

console.log('\n=== 건물 1~6동 청크 (마을 후보) ===')
const seen = new Set()
for (let y = 0; y < m.height; y++) {
  for (let x = 0; x < m.width; x++) {
    const id = m.maps[y * m.width + x]
    if (id === 0xffff || seen.has(id)) continue
    const b = buildingsOf(id)
    if (b >= 1 && b <= 6) {
      seen.add(id)
      const hdr = m.headers ? ` header=${m.headers[y * m.width + x]}` : ''
      console.log(`  (${String(x).padStart(2)},${String(y).padStart(2)}) 청크#${String(id).padStart(3)} 건물 ${b}동${hdr}`)
    }
  }
}
