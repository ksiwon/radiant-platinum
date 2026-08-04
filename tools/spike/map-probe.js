// 맵 데이터 구조 탐색 (PLAN §4.2 / Phase 1)
// map_matrix: 청크를 존으로 조립하는 행렬. land_data: 청크 하나(충돌+지오메트리+높이).
// 포맷은 추측하지 않고 파일 크기와 대조해 검증한다.
'use strict'
const fs = require('fs')
const path = require('path')
const { readRom } = require('./nds')
const { parseNarc } = require('./gen4text')

const root = path.resolve(__dirname, '..', '..')
const rom = readRom(path.join(root, 'raw', 'roms', 'Pokemon Platinum (US).nds'))

const matrices = parseNarc(rom.read('/fielddata/mapmatrix/map_matrix.narc'))
const lands = parseNarc(rom.read('/fielddata/land_data/land_data.narc'))
console.log(`map_matrix: ${matrices.length}개 / land_data: ${lands.length}개`)

/**
 * 4세대 맵 행렬:
 *   u8 width, u8 height, u8 hasHeaders, u8 hasHeights, u8 nameLen, char name[nameLen]
 *   [u16 headers[w*h]] [u8 heights[w*h]] u16 maps[w*h]   (0xFFFF = 빈칸)
 */
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
  return { width, height, name, headers, heights, maps, consumed: p, total: buf.length }
}

console.log('\n=== 행렬 목록 (앞 12개) ===')
for (let i = 0; i < Math.min(12, matrices.length); i++) {
  try {
    const m = parseMatrix(matrices[i])
    const ok = m.consumed === m.total ? 'OK' : `크기불일치 ${m.consumed}/${m.total}`
    const used = m.maps.filter((x) => x !== 0xffff).length
    console.log(`  #${String(i).padStart(2)} ${m.width}x${m.height} "${m.name}" 청크 ${used}/${m.maps.length} — ${ok}`)
  } catch (e) {
    console.log(`  #${i} 파싱 실패: ${e.message}`)
  }
}

/**
 * 4세대 land_data(청크 하나) — 4워드 헤더가 크기 합으로 검증됐다:
 *   u32 permSize(항상 2048 = 32×32×2) / u32 objectSize / u32 modelSize / u32 bdhcSize
 *   perm[] 타일 충돌·속성 / object[] 건물 배치 / model[] NSBMD / bdhc[] 높이 지오메트리
 */
const LAND_HEADER = 16
function parseLand(buf) {
  const perm = buf.readUInt32LE(0), obj = buf.readUInt32LE(4)
  const model = buf.readUInt32LE(8), bdhc = buf.readUInt32LE(12)
  let p = LAND_HEADER
  const out = {
    sizes: { perm, obj, model, bdhc },
    exact: LAND_HEADER + perm + obj + model + bdhc === buf.length,
  }
  out.perm = buf.subarray(p, p + perm); p += perm
  out.objects = buf.subarray(p, p + obj); p += obj
  out.model = buf.subarray(p, p + model); p += model
  out.bdhc = buf.subarray(p, p + bdhc)
  return out
}

console.log('\n=== land_data 구조 검증 (앞 6개) ===')
for (let i = 0; i < Math.min(6, lands.length); i++) {
  const L = parseLand(lands[i])
  const s = L.sizes
  const magic = L.model.length >= 4 ? L.model.toString('latin1', 0, 4) : '—'
  const bdhcMagic = L.bdhc.length >= 4 ? L.bdhc.toString('latin1', 0, 4) : '—'
  console.log(
    `  #${i} ${String(lands[i].length).padStart(7)}B  perm=${s.perm} obj=${String(s.obj).padStart(4)} ` +
    `model=${String(s.model).padStart(6)} bdhc=${String(s.bdhc).padStart(5)}  ` +
    `합일치=${L.exact} model="${magic}" bdhc="${bdhcMagic}" 건물=${s.obj / 48}`,
  )
}

// 헤더 4워드 가설이 666개 전부에서 성립하는지
let bad = 0, withModel = 0, objMultiple = 0
for (const b of lands) {
  const L = parseLand(b)
  if (!L.exact) bad++
  if (L.sizes.model > 0) withModel++
  if (L.sizes.obj % 48 !== 0) objMultiple++
}
console.log(`\n전체 ${lands.length}개: 크기합 불일치 ${bad}개 / 모델 보유 ${withModel}개 / 건물크기 48배수 아님 ${objMultiple}개`)
