// 깨어진 세계의 **판과 통행 격자** (PARITY §6.10) — `fielddata/tornworld/`
//
// 여기만 맵이 **평범한 격자가 아니다.** 바닥·서쪽 벽·동쪽 벽·천장 네 갈래의
// 「떠 있는 판」이 겹쳐 있고, 서 있는 판이 무엇이냐에 따라 같은 (x,y,z)가 다른
// 통행 자료를 가리킨다. 그 자료가 맵 자료에 없어서 롬은 전용 NARC 둘을 읽는다:
//
//   /fielddata/tornworld/tw_arc.narc       파일 0 = 맵 열의 목차, 1~10 = 맵마다
//   /fielddata/tornworld/tw_arc_attr.narc  판마다의 통행 격자 열두 벌 (u16 1024개)
//
// ⚠️ **자료가 반씩 갈린다.** 층 잇는 차례 · 움직이는 발판 · 승강 경로 · 칸을
// 밟으면 도는 사건 프로그램은 NARC이 아니라 **오버레이의 C 배열**이라 사용자의
// 롬 하나로는 못 꺼낸다 — 그쪽은 `pnpm gen:distortionTables`가 소스에 굽는다
// (`tools/extract/distortionTablesModule.cjs`). 둘을 합치는 자리는
// `src/data/distortionFile.ts` 하나다.
//
// ⚠️ **`bounds`는 양끝을 포함한다.** `size`가 개수가 아니라 **차이**다
// (`start + size`까지가 안이다). 개수로 읽으면 판마다 한 줄씩 좁아진다.
'use strict'
const { openRom, writeJson } = require('./rom')

// ── tw_arc ───────────────────────────────────────────────────────────────────

/** `DistWorldBounds` 여섯 s16 */
function readBounds(buf, off) {
  return {
    x: buf.readInt16LE(off), y: buf.readInt16LE(off + 2), z: buf.readInt16LE(off + 4),
    sx: buf.readInt16LE(off + 6), sy: buf.readInt16LE(off + 8), sz: buf.readInt16LE(off + 10),
  }
}

const MAP_INFO_SIZE = 12
const PLATFORM_SIZE = 20
const JUMP_SIZE = 40
const CAMERA_SIZE = 24
const GHOST_TEMPLATE_SIZE = 12
const GHOST_TRIGGER_SIZE = 20
const HEADER_SIZE = 20

function readMapFile(buf) {
  const platformSize = buf.readInt32LE(4)
  const jumpSize = buf.readInt32LE(8)
  const cameraSize = buf.readInt32LE(12)
  const platformAt = HEADER_SIZE
  const jumpAt = platformAt + platformSize
  const cameraAt = jumpAt + jumpSize
  const ghostAt = cameraAt + cameraSize

  const platforms = []
  if (platformSize) {
    const count = buf.readInt32LE(platformAt)
    for (let i = 0; i < count; i++) {
      const o = platformAt + 4 + i * PLATFORM_SIZE
      platforms.push({
        kind: buf.readInt16LE(o),
        attr: buf.readUInt16LE(o + 2),
        bounds: readBounds(buf, o + 4),
        rows: buf.readUInt16LE(o + 16),
        cols: buf.readUInt16LE(o + 18),
      })
    }
    if (platformAt + 4 + count * PLATFORM_SIZE !== jumpAt) throw new Error('판 구역 크기가 안 맞는다')
  }

  const jumps = []
  if (jumpSize) {
    const count = buf.readInt32LE(jumpAt)
    for (let i = 0; i < count; i++) {
      const o = jumpAt + 4 + i * JUMP_SIZE
      jumps.push({
        handler: buf.readUInt16LE(o),
        dir: buf.readInt16LE(o + 2),
        bounds: readBounds(buf, o + 8),
        dx: buf.readInt16LE(o + 20),
        dy: buf.readInt16LE(o + 22),
        dz: buf.readInt16LE(o + 24),
        spriteAngle: buf.readInt16LE(o + 26),
        steps: buf.readInt16LE(o + 28),
        axis: buf.readUInt16LE(o + 30),
        inverted: buf.readUInt16LE(o + 32),
        facing: buf.readInt16LE(o + 34),
        platformKind: buf.readInt16LE(o + 36),
        platformIndex: buf.readUInt16LE(o + 38),
      })
    }
    if (jumpAt + 4 + count * JUMP_SIZE !== cameraAt) throw new Error('뛰는 자리 구역 크기가 안 맞는다')
  }

  const cameras = []
  if (cameraSize) {
    const count = buf.readInt32LE(cameraAt)
    for (let i = 0; i < count; i++) {
      const o = cameraAt + 4 + i * CAMERA_SIZE
      cameras.push({
        bounds: readBounds(buf, o),
        angleX: buf.readUInt16LE(o + 12),
        angleY: buf.readUInt16LE(o + 14),
        angleZ: buf.readUInt16LE(o + 16),
        dir: buf.readInt16LE(o + 18),
        steps: buf.readInt32LE(o + 20),
      })
    }
    if (cameraAt + 4 + count * CAMERA_SIZE !== ghostAt) throw new Error('카메라 구역 크기가 안 맞는다')
  }

  const templateCount = buf.readInt32LE(ghostAt)
  const triggerCount = buf.readInt32LE(ghostAt + 4)
  const visible = buf.readUInt32LE(ghostAt + 8)
  const props = []
  for (let i = 0; i < templateCount; i++) {
    const o = ghostAt + 12 + i * GHOST_TEMPLATE_SIZE
    props.push({
      group: buf.readUInt32LE(o),
      kind: buf.readUInt16LE(o + 4),
      x: buf.readInt16LE(o + 6), y: buf.readInt16LE(o + 8), z: buf.readInt16LE(o + 10),
    })
  }
  const triggers = []
  const triggerAt = ghostAt + 12 + templateCount * GHOST_TEMPLATE_SIZE
  for (let i = 0; i < triggerCount; i++) {
    const o = triggerAt + i * GHOST_TRIGGER_SIZE
    triggers.push({
      group: buf.readUInt32LE(o),
      dir: buf.readInt16LE(o + 4),
      show: buf.readInt16LE(o + 6),
      bounds: readBounds(buf, o + 8),
    })
  }
  const end = triggerAt + triggerCount * GHOST_TRIGGER_SIZE
  if (end !== buf.length) throw new Error(`맵 파일 크기가 안 맞는다: ${end} ≠ ${buf.length}`)

  return { platforms, jumps, cameras, props, triggers, visibleGroups: visible }
}

// ── 걷기 ─────────────────────────────────────────────────────────────────────

function extract() {
  const rom = openRom()
  const main = rom.narc('/fielddata/tornworld/tw_arc.narc')
  const attrNarc = rom.narc('/fielddata/tornworld/tw_arc_attr.narc')

  const info = main[0]
  const mapCount = info.readInt32LE(0)
  if (4 + mapCount * MAP_INFO_SIZE !== info.length) throw new Error('목차 크기가 안 맞는다')

  const maps = []
  for (let i = 0; i < mapCount; i++) {
    const o = 4 + i * MAP_INFO_SIZE
    const map = info.readUInt32LE(o)
    const fileIndex = info.readUInt16LE(o + 4)
    const body = readMapFile(main[fileIndex + 1])
    maps.push({
      map,
      offsetX: info.readInt16LE(o + 6),
      offsetY: info.readInt16LE(o + 8),
      offsetZ: info.readInt16LE(o + 10),
      ...body,
    })
  }

  // 통행 격자. 판마다 `rows × cols`만 쓰지만 파일은 늘 1024칸이다
  const attrs = []
  for (const key of Object.keys(attrNarc)) {
    const buf = attrNarc[key]
    if (buf.length % 2) throw new Error(`통행 격자가 u16 배수가 아니다: ${buf.length}`)
    const cells = new Array(buf.length / 2)
    for (let i = 0; i < cells.length; i++) cells[i] = buf.readUInt16LE(i * 2)
    attrs.push(cells)
  }

  // 판이 가리키는 격자 번호가 실제로 있는지, `rows × cols`가 격자 안에 드는지
  for (const m of maps) {
    for (const p of m.platforms) {
      const grid = attrs[p.attr]
      if (grid === undefined) throw new Error(`맵 ${m.map}: 통행 격자 ${p.attr}이 없다`)
      if (p.rows * p.cols > grid.length) {
        throw new Error(`맵 ${m.map}: 판 ${p.rows}×${p.cols}가 격자 ${grid.length}칸을 넘는다`)
      }
    }
  }

  return { maps, attrs }
}

function main() {
  const data = extract()
  const platformCount = data.maps.reduce((n, m) => n + m.platforms.length, 0)
  const jumpCount = data.maps.reduce((n, m) => n + m.jumps.length, 0)
  const cameraCount = data.maps.reduce((n, m) => n + m.cameras.length, 0)
  const propCount = data.maps.reduce((n, m) => n + m.props.length, 0)
  const out = writeJson('distortion.json', data)
  console.log(`깨어진 세계 맵 ${data.maps.length}개 → ${out.rel} (${out.kb}KB)`)
  console.log(`  떠 있는 판 ${platformCount} · 뛰는 자리 ${jumpCount} · 카메라 ${cameraCount}`)
  console.log(`  통행 격자 ${data.attrs.length}벌 · 유령 소품 ${propCount}`)
  console.log('  층 이음·사건·발판·승강 경로는 pnpm gen:distortionTables가 소스에 굽는다')
}

if (require.main === module) main()
module.exports = { extract }
