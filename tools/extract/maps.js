// 맵 청크 추출 (PLAN §4.2 / Phase 1)
//
// 롬 구조 (전부 실측 검증됨):
//   /fielddata/mapmatrix/map_matrix.narc  청크를 존으로 조립하는 행렬 289개
//   /fielddata/land_data/land_data.narc   청크 666개 — 4워드 헤더 [perm, obj, model, bdhc]
//   /fielddata/maptable/mapname.bin       존 내부 이름 593개 × 16바이트
//
// 청크 하나 = 32×32 타일. perm은 타일당 u16이며 최상위 비트가 통행 불가 플래그,
// 하위 비트가 타일 거동(0x15 풀숲=인카운터, 0x71 물 …)이다. 오버월드 전체 어휘는 54종.
//
// DS 지오메트리(NSBMD)는 웹 품질에 못 미치므로 여기서는 뽑지 않는다 — §4.2대로
// 충돌·거동·배치만 정본으로 삼고 아트는 자체 제작한다. 모델은 블록아웃 레퍼런스용.
'use strict'
const fs = require('fs')
const path = require('path')
const { readRom } = require('../spike/nds')
const { parseNarc } = require('../spike/gen4text')

const CHUNK_TILES = 32
const LAND_HEADER = 16
const OBJECT_SIZE = 48
/** 20.12 고정소수점 × 타일당 16 DS유닛 = 65536. 나누면 타일 단위가 된다 */
const FIXED_PER_TILE = 65536
/** 통행 불가 플래그 */
const IMPASSABLE = 0x8000

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

function parseLand(buf) {
  const sizes = {
    perm: buf.readUInt32LE(0), obj: buf.readUInt32LE(4),
    model: buf.readUInt32LE(8), bdhc: buf.readUInt32LE(12),
  }
  if (LAND_HEADER + sizes.perm + sizes.obj + sizes.model + sizes.bdhc !== buf.length) {
    throw new Error('land_data 크기 합 불일치 — 포맷 가정이 깨졌다')
  }
  let p = LAND_HEADER
  const perm = buf.subarray(p, p + sizes.perm); p += sizes.perm
  const objects = buf.subarray(p, p + sizes.obj)
  return { sizes, perm, objects }
}

/** 건물 배치: i32 modelId, pos×3, rot×3, scale×3 (전부 20.12 고정소수점) */
function parseObjects(buf) {
  const out = []
  for (let i = 0; i + OBJECT_SIZE <= buf.length; i += OBJECT_SIZE) {
    const o = buf.subarray(i, i + OBJECT_SIZE)
    const f = (j) => o.readInt32LE(j * 4) / FIXED_PER_TILE
    out.push({
      model: o.readInt32LE(0),
      // 청크 중심 기준 좌표를 0..32 타일 좌표로 옮긴다
      x: f(1) + CHUNK_TILES / 2,
      y: f(2),
      z: f(3) + CHUNK_TILES / 2,
      rot: [o.readInt32LE(16) / 4096, o.readInt32LE(20) / 4096, o.readInt32LE(24) / 4096],
      scale: [o.readInt32LE(28) / 4096, o.readInt32LE(32) / 4096, o.readInt32LE(36) / 4096],
    })
  }
  return out
}

function exportZone(rom, zoneName) {
  const nameBin = rom.read('/fielddata/maptable/mapname.bin')
  const zoneNames = []
  for (let i = 0; i * 16 < nameBin.length; i++) {
    zoneNames.push(nameBin.toString('latin1', i * 16, (i + 1) * 16).replace(/\0+$/, ''))
  }
  const zoneId = zoneNames.indexOf(zoneName)
  if (zoneId < 0) throw new Error(`존 "${zoneName}" 없음`)

  const matrices = parseNarc(rom.read('/fielddata/mapmatrix/map_matrix.narc'))
  const lands = parseNarc(rom.read('/fielddata/land_data/land_data.narc'))
  const m = parseMatrix(matrices[0]) // 0번이 신오 오버월드 30×30

  const cells = []
  for (let i = 0; i < m.maps.length; i++) {
    if (m.headers[i] !== zoneId || m.maps[i] === 0xffff) continue
    cells.push({ mx: i % m.width, my: (i / m.width) | 0, chunk: m.maps[i] })
  }
  if (!cells.length) throw new Error(`존 "${zoneName}"이 오버월드 행렬에 없다`)

  // 존 로컬 좌표계로 정규화 — 셀 최소값을 원점으로
  const minX = Math.min(...cells.map((c) => c.mx))
  const minY = Math.min(...cells.map((c) => c.my))

  const chunks = cells.map((c) => {
    const L = parseLand(lands[c.chunk])
    const tiles = []
    for (let i = 0; i < CHUNK_TILES * CHUNK_TILES; i++) tiles.push(L.perm.readUInt16LE(i * 2))
    return {
      id: c.chunk,
      matrix: { x: c.mx, y: c.my },
      origin: { x: (c.mx - minX) * CHUNK_TILES, z: (c.my - minY) * CHUNK_TILES },
      tiles,
      buildings: parseObjects(L.objects),
    }
  })

  return {
    zone: zoneName,
    zoneId,
    matrix: { id: 0, name: m.name },
    chunkTiles: CHUNK_TILES,
    size: {
      x: (Math.max(...cells.map((c) => c.mx)) - minX + 1) * CHUNK_TILES,
      z: (Math.max(...cells.map((c) => c.my)) - minY + 1) * CHUNK_TILES,
    },
    chunks,
  }
}

function main() {
  const args = process.argv.slice(2)
  const romPath = args.find((a) => a.startsWith('--rom='))?.slice(6)
    ?? path.resolve(__dirname, '../../raw/roms/Pokemon Platinum (US).nds')
  const zones = args.filter((a) => !a.startsWith('--'))
  if (!zones.length) zones.push('T01')

  const outDir = path.resolve(__dirname, '../../public/data/zones')
  fs.mkdirSync(outDir, { recursive: true })
  const rom = readRom(romPath)

  for (const z of zones) {
    const data = exportZone(rom, z)
    const file = path.join(outDir, `${z}.json`)
    fs.writeFileSync(file, JSON.stringify(data), 'utf8')
    const walkable = data.chunks.reduce(
      (s, c) => s + c.tiles.filter((t) => !(t & IMPASSABLE)).length, 0)
    const total = data.chunks.length * CHUNK_TILES * CHUNK_TILES
    const buildings = data.chunks.reduce((s, c) => s + c.buildings.length, 0)
    console.log(
      `${z}: 청크 ${data.chunks.length}개 ${data.size.x}×${data.size.z}타일  ` +
      `통행 가능 ${walkable}/${total}  건물 ${buildings}동  → ${path.relative(process.cwd(), file)} ` +
      `(${(fs.statSync(file).size / 1024).toFixed(1)}KB)`,
    )
  }
}

if (require.main === module) main()
module.exports = { exportZone, parseMatrix, parseLand, parseObjects, CHUNK_TILES, IMPASSABLE }
