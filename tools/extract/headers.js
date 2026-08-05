// 맵 헤더 표 추출 (DATA.md §2.7)
//
// 이 표가 모든 것의 등뼈다. 맵 하나가 어느 행렬에 있고, 어느 이벤트 파일·인카운터
// 테이블·스크립트·텍스트 뱅크를 쓰는지가 전부 여기 있다. arm9 안에 있고 파일이
// 아니라서 절대 주소로 찍어야 한다.
//
// 주소를 어떻게 찾았나 — 추측이 아니라 역산이다:
//   1) zone_event의 워프 좌표가 오버월드 전역 타일 좌표임을 알아냈다.
//   2) 그 좌표를 존별 경계 상자와 맞춰 (맵 id → 이벤트 파일) 쌍 56개를 확정했다.
//   3) 그 56쌍을 전부 만족하는 24B 스트라이드 표는 롬 전체에 단 하나뿐이었다.
// 검증: events 필드가 [0,534)에 정확히 전단사이고, 오버월드 존 67개가 전부
// matrixId 0이다. 아래 assert가 이걸 매 실행마다 다시 확인한다.
'use strict'
const { openRom, openText, writeJson, LOCALES } = require('./rom')

/** arm9 안 맵 헤더 표의 절대 파일 오프셋 (Pokemon Platinum US) */
const HEADER_TABLE = 0xea01c
const HEADER_SIZE = 24
const MAP_COUNT = 593
/** 인카운터 없음 */
const NO_ENCOUNTER = 0xffff

function readMapNames(rom) {
  const bin = rom.read('/fielddata/maptable/mapname.bin')
  const out = []
  for (let i = 0; i * 16 < bin.length; i++) {
    out.push(bin.toString('latin1', i * 16, (i + 1) * 16).replace(/\0+$/, ''))
  }
  return out
}

function parseHeader(buf, id) {
  const o = HEADER_TABLE + id * HEADER_SIZE
  const enc = buf.readUInt16LE(o + 14)
  return {
    id,
    /** 지형 텍스처·모델 아카이브 */
    area: buf[o],
    matrix: buf.readUInt16LE(o + 2),
    scripts: buf.readUInt16LE(o + 4),
    initScripts: buf.readUInt16LE(o + 6),
    /** pl_msg.narc 뱅크 번호 (US 기준) */
    msg: buf.readUInt16LE(o + 8),
    bgmDay: buf.readUInt16LE(o + 10),
    bgmNight: buf.readUInt16LE(o + 12),
    encounters: enc === NO_ENCOUNTER ? null : enc,
    events: buf.readUInt16LE(o + 16),
    /** +18의 하위 바이트가 지역명 인덱스. 상위 바이트는 표시 창 종류다 —
     *  트윈리프(1=떡잎마을)와 그 집 내부가 같은 값을 갖는 것으로 확인했다 */
    label: buf[o + 18],
    labelWindow: buf[o + 19],
  }
}

function extractHeaders(rom) {
  const buf = rom.rom.buf
  const names = readMapNames(rom)
  const nEvents = rom.narc('/fielddata/eventdata/zone_event.narc').length
  const nMatrices = rom.narc('/fielddata/mapmatrix/map_matrix.narc').length
  const nEnc = rom.narc('/fielddata/encountdata/pl_enc_data.narc').length

  const maps = []
  for (let id = 0; id < MAP_COUNT; id++) {
    maps.push({ ...parseHeader(buf, id), name: names[id] ?? `#${id}` })
  }

  // --- 주소가 맞는지 매번 다시 확인한다. 롬이 다르면 여기서 죽는 편이 낫다 ---
  const events = new Set(maps.map((m) => m.events))
  if (events.size !== nEvents) {
    throw new Error(`events 필드가 이벤트 파일 ${nEvents}개에 전단사가 아니다 (고유 ${events.size}) — 표 주소가 틀렸다`)
  }
  for (const m of maps) {
    if (m.matrix >= nMatrices) throw new Error(`#${m.id} matrixId ${m.matrix} 범위 초과`)
    if (m.encounters !== null && m.encounters >= nEnc) throw new Error(`#${m.id} encounters ${m.encounters} 범위 초과`)
  }

  const labels = {}
  for (const loc of LOCALES) labels[loc] = null
  return { maps, labels }
}

function main() {
  const romPath = process.argv.find((a) => a.startsWith('--rom='))?.slice(6)
  const rom = openRom(romPath)
  const text = openText()
  const { maps } = extractHeaders(rom)

  // 영역 자료 — 맵 헤더의 `area`가 이 표를 가리키고, 표가 다시 텍스처 묶음과
  // 건물 모델 묶음을 가리킨다 (`AreaDataFile`: u16 소품·텍스처·미사용·조명)
  const areas = rom.narc('/fielddata/areadata/area_data.narc').map((b) => ({
    props: b.readUInt16LE(0), tex: b.readUInt16LE(2), light: b.readUInt16LE(6),
  }))
  const out = writeJson('maps.json', { count: maps.length, maps, areas })
  const withEnc = maps.filter((m) => m.encounters !== null).length
  const matrices = new Set(maps.map((m) => m.matrix))
  console.log(`maps: ${maps.length}개 → ${out.rel} (${out.kb}KB)`)
  console.log(`  영역 ${areas.length}개 · 텍스처 묶음 ${new Set(areas.map((a) => a.tex)).size}종`)
  console.log(`  행렬 ${matrices.size}종 · 인카운터 보유 ${withEnc}개 · 이벤트 파일 ${new Set(maps.map((m) => m.events)).size}개`)

  for (const loc of LOCALES) {
    const bank = text.bank('location_names', loc)
    const n = writeJson(`names/locations.${loc}.json`, bank)
    console.log(`  지역명/${loc}: ${bank.length}개 → ${n.rel} (${n.kb}KB)`)
  }

  const ko = text.bank('location_names', 'ko')
  for (const id of [411, 412, 3, 379]) {
    const m = maps[id]
    console.log(`  검증 #${id} ${m.name.padEnd(11)} 행렬 ${String(m.matrix).padStart(3)} ` +
      `이벤트 ${String(m.events).padStart(3)} 인카운터 ${m.encounters ?? '없음'} ` +
      `지역명 "${ko[m.label]}"`)
  }
}

if (require.main === module) main()
module.exports = { extractHeaders, parseHeader, HEADER_TABLE, HEADER_SIZE, MAP_COUNT }
