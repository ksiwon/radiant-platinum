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
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')

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

// ── 하늘 (`/data/tw_arc_etc.narc`) ─────────────────────────────────────────────
//
// 깨어진 세계의 하늘 배경 한 장과 도는 구름 일곱 (`InitSkyBackground` · `InitSkyClouds`).
// ⚠️ **브라우저 쪽(`src/import/platinum/distortionSky.ts`)과 한 줄씩 같아야 한다** — 머리말도 그쪽에 있다

const SKY_W = 256
const SKY_H = 192
const TILE = 8
const TILE_BYTES = 32
const CLOUD_CELLS = [0x3, 0x6, 0x9, 0xc, 0xf, 0x12, 0x15]
const CLOUD_CHARS = [0x4, 0x7, 0xa, 0xd, 0x10, 0x13, 0x16]
const CLOUD_PALETTE = 0x18
const CLOUD_PALETTES = 5
const OBJ_SIZE = [
  [[8, 8], [16, 16], [32, 32], [64, 64]],
  [[16, 8], [32, 8], [32, 16], [64, 32]],
  [[8, 16], [8, 32], [16, 32], [32, 64]],
]

function color5(v) {
  const r = v & 0x1f, g = (v >> 5) & 0x1f, b = (v >> 10) & 0x1f
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)]
}

/** NCLR 여러 벌 */
function skyPalettes(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'RLCN') throw new Error('NCLR이 아니다')
  const count = Math.max(1, Math.floor(buf.readUInt32LE(0x20) / 32))
  return Array.from({ length: count }, (_, p) =>
    Array.from({ length: 16 }, (_, i) => color5(buf.readUInt16LE(0x28 + (p * 16 + i) * 2))))
}

function skyChars(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'RGCN') throw new Error('NCGR이 아니다')
  const size = buf.readUInt32LE(0x28)
  return buf.subarray(0x30, 0x30 + size)
}

function drawSkyTile(rgba, sheetW, ox, oy, data, tile, pal, { hflip = false, vflip = false, sprite = false } = {}) {
  for (let i = 0; i < 64; i++) {
    const byte = data[tile * TILE_BYTES + (i >> 1)] ?? 0
    const idx = i & 1 ? byte >> 4 : byte & 0xf
    if (idx === 0 && sprite) continue
    const px = i & 7, py = i >> 3
    const x = hflip ? 7 - px : px
    const y = vflip ? 7 - py : py
    const c = pal[idx] ?? [0, 0, 0]
    const at = ((oy + y) * sheetW + ox + x) * 4
    rgba[at] = c[0]; rgba[at + 1] = c[1]; rgba[at + 2] = c[2]; rgba[at + 3] = 255
  }
}

const s9 = (v) => (v & 0x100 ? (v & 0x1ff) - 0x200 : v & 0x1ff)
const s8 = (v) => (v & 0x80 ? (v & 0xff) - 0x100 : v & 0xff)

function cellOams(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'RECN') throw new Error('NCER이 아니다')
  const cells = buf.readUInt16LE(0x18), bank = buf.readUInt16LE(0x1a)
  if (cells !== 1 || bank !== 0) throw new Error(`셀 ${cells}개 · 갈래 ${bank} — 한 칸짜리가 아니다`)
  const at = 0x18 + buf.readUInt32LE(0x1c)
  const count = buf.readUInt16LE(at)
  const oamAt = at + 8 + buf.readUInt32LE(at + 4)
  const out = []
  for (let k = 0; k < count; k++) {
    const a0 = buf.readUInt16LE(oamAt + k * 6), a1 = buf.readUInt16LE(oamAt + k * 6 + 2), a2 = buf.readUInt16LE(oamAt + k * 6 + 4)
    if (a0 & 0x2000) throw new Error('256색 OAM — 16색만 읽는다')
    const size = OBJ_SIZE[a0 >> 14]?.[a1 >> 14]
    if (!size) throw new Error(`OAM 모양 ${a0 >> 14}`)
    out.push({ x: s9(a1), y: s8(a0), w: size[0], h: size[1], tile: a2 & 0x3ff, pal: a2 >> 12, hflip: (a1 & 0x1000) !== 0, vflip: (a1 & 0x2000) !== 0 })
  }
  return out
}

function extractSky(rom) {
  const narc = rom.narc('/data/tw_arc_etc.narc')
  const skyPal = skyPalettes(narc[1])[0]
  const skyData = skyChars(narc[0])
  const scr = narc[2]
  if (scr.subarray(0, 4).toString('latin1') !== 'RCSN') throw new Error('NSCR이 아니다')
  const scrW = scr.readUInt16LE(0x18) / TILE, scrH = scr.readUInt16LE(0x1a) / TILE
  if (scrW < SKY_W / TILE || scrH < SKY_H / TILE) throw new Error('하늘 배치가 화면보다 작다')

  const cloudPals = skyPalettes(narc[CLOUD_PALETTE]).slice(0, CLOUD_PALETTES)
  const clouds = CLOUD_CELLS.map((c, i) => {
    const oams = cellOams(narc[c])
    const data = skyChars(narc[CLOUD_CHARS[i]])
    const x0 = Math.min(...oams.map((o) => o.x)), y0 = Math.min(...oams.map((o) => o.y))
    const x1 = Math.max(...oams.map((o) => o.x + o.w)), y1 = Math.max(...oams.map((o) => o.y + o.h))
    return { oams, data, x0, y0, w: x1 - x0, h: y1 - y0 }
  })

  const rects = []
  let cx = 0, cy = SKY_H, row = 0
  for (const c of clouds) {
    if (cx + c.w > SKY_W) { cx = 0; cy += row; row = 0 }
    rects.push([cx, cy, c.w, c.h, -c.x0, -c.y0])
    cx += c.w
    row = Math.max(row, c.h)
  }
  const width = SKY_W, height = cy + row
  const rgba = new Uint8Array(width * height * 4)

  for (let ty = 0; ty < SKY_H / TILE; ty++) {
    for (let tx = 0; tx < SKY_W / TILE; tx++) {
      const cell = scr.readUInt16LE(0x24 + (ty * scrW + tx) * 2)
      if (cell >> 12 !== 0) throw new Error(`하늘 칸 (${tx},${ty})이 팔레트 ${cell >> 12}을 쓴다 — 0만 싣는다`)
      drawSkyTile(rgba, width, tx * TILE, ty * TILE, skyData, cell & 0x3ff, skyPal, { hflip: (cell & 0x400) !== 0, vflip: (cell & 0x800) !== 0 })
    }
  }

  for (const [i, c] of clouds.entries()) {
    const [rx, ry, , , ox, oy] = rects[i]
    for (const o of [...c.oams].reverse()) {
      const pal = cloudPals[o.pal] ?? []
      const across = o.w / TILE
      for (let t = 0; t < across * (o.h / TILE); t++) {
        const col = t % across, rowT = Math.floor(t / across)
        const px = o.hflip ? across - 1 - col : col
        const py = o.vflip ? o.h / TILE - 1 - rowT : rowT
        const tile = o.tile + t
        if ((tile + 1) * TILE_BYTES > c.data.length) throw new Error(`구름 ${i}: 타일 ${tile}이 없다`)
        drawSkyTile(rgba, width, rx + ox + o.x + px * TILE, ry + oy + o.y + py * TILE, c.data, tile, pal, { hflip: o.hflip, vflip: o.vflip, sprite: true })
      }
    }
  }

  return { png: encodePng(rgba, width, height), sheet: { width, height, sky: [0, 0, SKY_W, SKY_H], clouds: rects } }
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
  const sky = extractSky(openRom())
  fs.writeFileSync(path.join(ROOT, 'public/data/distortionSky.png'), sky.png)
  const meta = writeJson('distortionSky.json', sky.sheet)
  console.log(`  하늘 ${sky.sheet.width}×${sky.sheet.height} · 구름 ${sky.sheet.clouds.length} → ${meta.rel}`)
}

if (require.main === module) main()
module.exports = { extract }
