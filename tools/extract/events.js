// 존 이벤트 추출 — 워프 (DATA.md §2.3)
//
// zone_event 파일 하나는 네 구역이 이어 붙은 것이다: [u32 개수, 엔트리]×4.
// 엔트리 크기 [20, 32, 12, 16]은 534개 파일 전부를 정확히 소진하는 유일한 해다.
//
// 12B 워프의 필드 배치를 확정한 방법:
//   워프 좌표(f0,f1)가 오버월드 전역 타일 좌표라고 보고 트윈리프의 청크 상자와
//   맞췄더니 이벤트 파일 #390 하나만 워프 4개가 전부 상자 안에 들어갔다. 그 4개의
//   목적지 필드(f2)는 412/414/416/417이었고 mapname.bin에서 #412가 "T01R0101" —
//   트윈리프의 집 내부다. 좌표와 목적지가 동시에 맞아떨어지는 배치는 이것뿐이다.
//
// NPC(32B)는 디컴프에 구조체가 그대로 있다(`ObjectEvent`). 좌표는 그 전에 값으로
// 먼저 확정했었고(+24/+26으로 읽으면 오버월드 1184명 중 1143명이 자기 존 상자 안,
// 차점 후보는 3.7%) 구조체와 일치한다.
// 간판(20B)·트리거(16B)도 같은 헤더에 `BgEvent`·`CoordEvent`로 있다.
'use strict'
const { openRom, writeJson } = require('./rom')

/** [간판, NPC, 워프, 트리거] — `MapHeaderData`의 네 배열 순서다 */
const SECTION_SIZES = [20, 32, 12, 16]
const SIGN_INDEX = 0
const NPC_INDEX = 1
const WARP_INDEX = 2
const TRIGGER_INDEX = 3
/** 조건 플래그 없음 */
const NO_FLAG = 0xffff

function parseEventFile(buf) {
  let p = 0
  const sections = []
  for (const size of SECTION_SIZES) {
    if (p + 4 > buf.length) throw new Error('이벤트 파일이 헤더 도중에 끝난다')
    const n = buf.readUInt32LE(p); p += 4
    const need = n * size
    if (p + need > buf.length) throw new Error(`구역 크기 초과: ${n}개 × ${size}B`)
    sections.push({ count: n, data: buf.subarray(p, p + need), size })
    p += need
  }
  if (p !== buf.length) throw new Error('이벤트 파일 크기 합 불일치 — 구역 크기 가정이 깨졌다')
  return sections
}

function parseWarps(section) {
  const out = []
  for (let i = 0; i < section.count; i++) {
    const o = i * section.size
    out.push({
      /** 행렬 타일 좌표 (오버월드는 전역, 실내는 그 행렬 안) */
      x: section.data.readUInt16LE(o),
      z: section.data.readUInt16LE(o + 2),
      /** 목적지 맵 헤더 id */
      to: section.data.readUInt16LE(o + 4),
      /** 목적지 맵의 몇 번째 워프로 나오는지 */
      anchor: section.data.readUInt16LE(o + 6),
    })
  }
  return out
}

/**
 * NPC 32B — 디컴프의 `ObjectEvent`(`include/map_header_data.h`) 그대로다.
 *
 * ```c
 * u16 localID, graphicsID, movementType, trainerType, hiddenFlag, script;
 * s16 dir; u16 data[3]; s16 movementRangeX, movementRangeZ;
 * u16 x, z; fx32 y;
 * ```
 *
 * 이걸 찾기 전에는 값 분포로 이름을 붙였고 **script와 hiddenFlag가 서로
 * 바뀌어 있었다.** 떡잎마을 8명으로 갈린다 — 구조체대로면 말을 거는 NPC가
 * 6명(3·5·6·7·8·9)이고, 바꿔 읽으면 1명뿐이다.
 *
 * `y`는 fx32(20.12)인데 한 타일이 16단위라 **위쪽 16비트가 곧 타일 높이**다.
 */
function parseNpcs(section) {
  const out = []
  for (let i = 0; i < section.count; i++) {
    const o = i * section.size
    const u = (f) => section.data.readUInt16LE(o + f * 2)
    const s = (f) => section.data.readInt16LE(o + f * 2)
    const flag = u(4)
    out.push({
      x: u(12), z: u(13), height: u(15),
      localID: u(0), sprite: u(1), move: u(2), trainerType: u(3), facing: s(6),
      script: u(5),
      flag: flag === NO_FLAG ? null : flag,
      range: [s(10), s(11)],
      raw: Array.from({ length: 16 }, (_, f) => u(f)),
    })
  }
  return out
}

/**
 * 간판 20B — 디컴프의 `BgEvent`.
 *
 * ```c
 * u16 script, type; int x, z, y; u16 playerFacingDir; u8 padding[2];
 * ```
 *
 * `type`이 0이면 보통 간판이고, 그 외는 숨은 도구·비밀기지 같은 특수한 자리다.
 * `playerFacingDir`은 **그 방향으로 보고 있을 때만** 반응한다는 뜻이다 —
 * 벽에 붙은 간판을 옆에서 읽을 수 없게 한다.
 *
 * 좌표는 int32인데 NPC와 달리 **타일 그대로**다(고정소수점이 아니다).
 */
function parseSigns(section) {
  const out = []
  for (let i = 0; i < section.count; i++) {
    const o = i * section.size
    out.push({
      script: section.data.readUInt16LE(o),
      type: section.data.readUInt16LE(o + 2),
      x: section.data.readInt32LE(o + 4),
      z: section.data.readInt32LE(o + 8),
      y: section.data.readInt32LE(o + 12),
      facing: section.data.readUInt16LE(o + 16),
    })
  }
  return out
}

/**
 * 좌표 트리거 16B — 디컴프의 `CoordEvent`.
 *
 * ```c
 * u16 script, x, z, width, length, y, value, var;
 * ```
 *
 * 그 상자 안에 발을 들이고 **`var`의 값이 `value`와 같을 때** 스크립트가 돈다.
 * 이야기 진행을 좌표로 거는 장치다 — 떡잎마을을 처음 나설 때 라이벌이
 * 달려오는 것이 이것이다.
 */
function parseTriggers(section) {
  const out = []
  for (let i = 0; i < section.count; i++) {
    const o = i * section.size
    const u = (f) => section.data.readUInt16LE(o + f * 2)
    out.push({
      script: u(0),
      x: u(1), z: u(2),
      width: u(3), length: u(4),
      y: u(5),
      value: u(6), var: u(7),
    })
  }
  return out
}

function extractEvents(rom) {
  const files = rom.narc('/fielddata/eventdata/zone_event.narc')
  const events = {}
  const counts = [0, 0, 0, 0]
  for (let i = 0; i < files.length; i++) {
    const sec = parseEventFile(files[i])
    sec.forEach((s, k) => { counts[k] += s.count })
    events[i] = {
      warps: parseWarps(sec[WARP_INDEX]),
      npcs: parseNpcs(sec[NPC_INDEX]),
      signs: parseSigns(sec[SIGN_INDEX]),
      triggers: parseTriggers(sec[TRIGGER_INDEX]),
    }
  }
  return { events, counts }
}

function main() {
  const romPath = process.argv.find((a) => a.startsWith('--rom='))?.slice(6)
  const rom = openRom(romPath)
  const { events, counts } = extractEvents(rom)
  const maps = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '../../public/data/maps.json'), 'utf8')).maps

  const out = writeJson('events.json', { count: Object.keys(events).length, events })
  console.log(`events: ${Object.keys(events).length}개 파일 → ${out.rel} (${out.kb}KB)`)
  console.log(`  간판 ${counts[0]} · NPC ${counts[1]} · 워프 ${counts[2]} · 트리거 ${counts[3]}`)

  // 워프 그래프 정합성 — 목적지 맵이 실재하고 앵커가 그 맵 워프 수 안에 있는가
  let ok = 0, badMap = 0, badAnchor = 0
  for (const m of maps) {
    for (const w of events[m.events].warps) {
      const dest = maps[w.to]
      if (!dest) { badMap++; continue }
      if (w.anchor >= events[dest.events].warps.length) { badAnchor++; continue }
      ok++
    }
  }
  console.log(`  워프 그래프: 유효 ${ok} · 목적지 없음 ${badMap} · 앵커 범위 초과 ${badAnchor}`)

  const t01 = maps.find((m) => m.name === 'T01')
  const e = events[t01.events]
  console.log(`  검증 T01(#${t01.id}) 워프 ${e.warps.length}개:`)
  for (const w of e.warps) {
    console.log(`    (${w.x}, ${w.z}) → ${maps[w.to].name} [앵커 ${w.anchor}]`)
  }
  console.log(`  검증 T01 NPC ${e.npcs.length}명:`)
  for (const n of e.npcs) {
    console.log(`    (${n.x}, ${n.z}) 모델 ${n.sprite} 이동 ${n.move} 방향 ${n.facing} 스크립트 ${n.script} 플래그 ${n.flag ?? '-'}`)
  }
}

if (require.main === module) main()
module.exports = {
  extractEvents, parseEventFile, parseWarps, parseNpcs, parseSigns, parseTriggers, SECTION_SIZES,
}
