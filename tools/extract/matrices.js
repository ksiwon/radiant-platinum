// 행렬별 충돌 격자 추출 (DATA.md §4.1)
//
// 오버월드도 실내도 "행렬 하나 = 격자 하나"로 같다. 다른 것은 크기뿐이다:
// 오버월드(행렬 0)는 30×30청크 = 1.8MB, 실내 269개는 다 합쳐야 1.33MB다.
//
// 그래서 파일을 이렇게 나눈다:
//   0.bin          오버월드. 시작할 때 받는다
//   interiors.bin  실내 269개를 이어 붙인 것. 한 번만 받으면 이후 건물 출입이 즉시다
// 실내를 행렬마다 따로 두면 파일 500개에 문 열 때마다 왕복이 생긴다. 다 합쳐도
// 압축하면 20KB대라 나눌 이유가 없다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { parseMatrix, parseLand, parseObjects, CHUNK_TILES, IMPASSABLE } = require('./maps')
const { extractHeaders } = require('./headers')

const OVERWORLD = 0
const EMPTY_CHUNK = 0xffff

/** 행렬 하나를 평평한 u16 격자 + 메타로 편다 */
function buildMatrix(matrixBuf, lands, id) {
  const m = parseMatrix(matrixBuf)
  const tileWidth = m.width * CHUNK_TILES
  const tileHeight = m.height * CHUNK_TILES
  // 청크가 없는 칸은 통행 불가. 경계 밖으로 걸어 나가지 않는다
  const tiles = new Uint16Array(tileWidth * tileHeight).fill(IMPASSABLE)
  const chunks = []
  const buildings = {}

  for (let i = 0; i < m.maps.length; i++) {
    const land = m.maps[i]
    if (land === EMPTY_CHUNK) continue
    const mx = i % m.width
    const my = (i / m.width) | 0
    chunks.push({ i, mx, my, land, zone: m.headers ? m.headers[i] : -1 })

    const L = parseLand(lands[land])
    const ox = mx * CHUNK_TILES
    const oz = my * CHUNK_TILES
    for (let ty = 0; ty < CHUNK_TILES; ty++) {
      const row = (oz + ty) * tileWidth + ox
      for (let tx = 0; tx < CHUNK_TILES; tx++) {
        tiles[row + tx] = L.perm.readUInt16LE((ty * CHUNK_TILES + tx) * 2)
      }
    }
    const objs = parseObjects(L.objects)
    // 청크 로컬 좌표를 행렬 타일 좌표로 옮겨 둔다 — 런타임에서 다시 더할 일이 없게
    if (objs.length) buildings[i] = objs.map((o) => ({ ...o, x: o.x + ox, z: o.z + oz }))
  }

  return {
    meta: { id, name: m.name, width: m.width, height: m.height, tileWidth, tileHeight, chunks },
    tiles,
    buildings,
  }
}

/** 통행 가능하고 그 존에 속한 지점 — 스폰 후보 */
function findSpawn(meta, tiles, zoneId) {
  const cells = meta.chunks.filter((c) => c.zone === zoneId)
  if (!cells.length) throw new Error(`존 id ${zoneId}이 행렬 ${meta.id}에 없다`)
  const cx = (cells.reduce((s, c) => s + c.mx, 0) / cells.length + 0.5) * CHUNK_TILES
  const cz = (cells.reduce((s, c) => s + c.my, 0) / cells.length + 0.5) * CHUNK_TILES
  let best = null, bestD = Infinity
  for (const c of cells) {
    for (let ty = 0; ty < CHUNK_TILES; ty++) {
      for (let tx = 0; tx < CHUNK_TILES; tx++) {
        const gx = c.mx * CHUNK_TILES + tx
        const gz = c.my * CHUNK_TILES + ty
        if (tiles[gz * meta.tileWidth + gx] & IMPASSABLE) continue
        const d = (gx - cx) ** 2 + (gz - cz) ** 2
        if (d < bestD) { bestD = d; best = { x: gx + 0.5, z: gz + 0.5 } }
      }
    }
  }
  if (!best) throw new Error(`존 id ${zoneId}에 통행 가능한 타일이 없다`)
  return best
}

function main() {
  const romPath = process.argv.find((a) => a.startsWith('--rom='))?.slice(6)
  const rom = openRom(romPath)
  const matrixFiles = rom.narc('/fielddata/mapmatrix/map_matrix.narc')
  const lands = rom.narc('/fielddata/land_data/land_data.narc')
  const { maps } = extractHeaders(rom)

  const dir = path.join(ROOT, 'public/data/matrices')
  fs.mkdirSync(dir, { recursive: true })

  // --- 오버월드 ---
  const ow = buildMatrix(matrixFiles[OVERWORLD], lands, OVERWORLD)
  const spawnMap = maps.find((m) => m.name === 'T01')
  ow.meta.spawn = { ...findSpawn(ow.meta, ow.tiles, spawnMap.id), map: spawnMap.id }
  ow.meta.buildings = ow.buildings
  fs.writeFileSync(path.join(dir, '0.bin'),
    Buffer.from(ow.tiles.buffer, ow.tiles.byteOffset, ow.tiles.byteLength))
  const owMeta = writeJson('matrices/0.json', ow.meta)

  const walkable = ow.tiles.reduce((n, t) => n + (t & IMPASSABLE ? 0 : 1), 0)
  console.log(`행렬 0 (오버월드 "${ow.meta.name}") ${ow.meta.tileWidth}×${ow.meta.tileHeight}타일`)
  console.log(`  청크 ${ow.meta.chunks.length}개 · 존 ${new Set(ow.meta.chunks.map((c) => c.zone)).size}개 · ` +
    `통행 가능 ${walkable.toLocaleString()} · 건물 ${Object.values(ow.buildings).reduce((n, a) => n + a.length, 0)}동`)
  console.log(`  스폰 T01 → (${ow.meta.spawn.x}, ${ow.meta.spawn.z})  meta ${owMeta.kb}KB`)

  // --- 실내: 헤더 표가 실제로 참조하는 행렬만 ---
  const used = [...new Set(maps.map((m) => m.matrix))].filter((id) => id !== OVERWORLD).sort((a, b) => a - b)
  const parts = []
  const index = {}
  let offset = 0
  for (const id of used) {
    const built = buildMatrix(matrixFiles[id], lands, id)
    const bytes = Buffer.from(built.tiles.buffer, built.tiles.byteOffset, built.tiles.byteLength)
    parts.push(bytes)
    index[id] = { ...built.meta, byteOffset: offset, buildings: built.buildings }
    offset += bytes.length
  }
  const blob = Buffer.concat(parts)
  fs.writeFileSync(path.join(dir, 'interiors.bin'), blob)
  const idxOut = writeJson('matrices/interiors.json', { byteLength: blob.length, matrices: index })

  console.log(`실내 행렬 ${used.length}개 → interiors.bin ${(blob.length / 1024).toFixed(0)}KB · ` +
    `index ${idxOut.kb}KB`)
  console.log(`  최대 ${Math.max(...used.map((id) => index[id].tileWidth))}×` +
    `${Math.max(...used.map((id) => index[id].tileHeight))}타일`)
}

if (require.main === module) main()
module.exports = { buildMatrix, findSpawn, OVERWORLD }
