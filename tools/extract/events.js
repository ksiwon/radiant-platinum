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
// NPC(32B)도 같은 방법으로 좌표를 찾았다: (x, z)를 +24/+26으로 읽으면 오버월드
// NPC 1184명 중 1143명(96.5%)이 자기 존의 타일 상자 안에 떨어진다. 차점 후보가
// 3.7%라 비교가 되지 않는다. 나머지 필드는 값 분포로만 이름을 붙였으므로 추정이다.
// 트리거(16B)·A구역(20B)은 아직 필드 배치를 모른다. 개수만 실어 둔다.
'use strict'
const { openRom, writeJson } = require('./rom')

/** [간판·숨은아이템?, NPC, 워프, 트리거] */
const SECTION_SIZES = [20, 32, 12, 16]
const WARP_INDEX = 2
const NPC_INDEX = 1
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
 * NPC 32B. 확정된 것은 좌표(+24/+26)뿐이고 나머지는 값 분포로 붙인 추정 이름이다:
 *   sprite  1~262   /data/mmodel 아카이브(470개) 범위 안
 *   move    0~54    이동 유형
 *   facing  0~3     4방향
 *   script  0~1339  맵 스크립트 안의 항목 번호(파일 번호가 아니다)
 *   height  0~30    BDHC 높이 층
 * 확정 전까지 원시값 raw를 함께 실어 둔다 — 이름이 틀려도 데이터는 잃지 않는다.
 */
function parseNpcs(section) {
  const out = []
  for (let i = 0; i < section.count; i++) {
    const o = i * section.size
    const u = (f) => section.data.readUInt16LE(o + f * 2)
    const flag = u(5)
    out.push({
      x: u(12), z: u(13), height: u(15),
      sprite: u(1), move: u(2), facing: u(6),
      script: u(4),
      flag: flag === NO_FLAG ? null : flag,
      raw: Array.from({ length: 16 }, (_, f) => u(f)),
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
      // 아직 못 읽는 것들. 개수라도 남겨 두면 나중에 대조할 기준이 된다
      signs: sec[0].count, triggers: sec[3].count,
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
    console.log(`    (${n.x}, ${n.z}) 모델 ${n.sprite} 이동 ${n.move} 방향 ${n.facing} 스크립트 ${n.script}`)
  }
}

if (require.main === module) main()
module.exports = { extractEvents, parseEventFile, parseWarps, parseNpcs, SECTION_SIZES }
