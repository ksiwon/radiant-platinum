// 크레딧 배경 세 장 (DATA.md §2.26)
//
// 엔딩이 흐르는 동안 뒤에 서 있는 그림이다. 없으면 크레딧이 검은 판 위의
// 글자만 된다.
//
// graphic/ending.narc의 파일 셋이 배경 한 장이다 (`overlay099/ov99_021D1A54.c:446-470`):
//
//   팔레트 18+k   타일 9+k   배치 3+k     (아래 화면 — `BG_LAYER_MAIN_2`)
//   팔레트 21+k   타일 12+k  배치 6+k     (위 화면 — `BG_LAYER_SUB_3`)
//
// ⚠️ **아래 화면 것을 쓴다 — 일부러다.** 크레딧은 3D를 아래로 돌리고 두 화면을 바꿔 단다
// (`ov99_021D0D80.c:156-158`) — 그래서 메인 엔진(18+k)이 **아래**, 서브(21+k)가 위다. 위 화면은 글이
// 흐르는 맑은 하늘이고, 아래 화면은 해·산 · 바다 · 은하가 걸린 지평선이다 — 그 위로 3D 장면 일곱이 선다.
// 한 화면인 우리는 그 장면이 없으므로(PARITY §8.12) 장면의 뒤판인 아래 그림에 글을 얹는다
//
// ⚠️ **팔레트가 한 파일에 여럿이다.** 16색짜리 두세 벌이 들어 있고 어느 벌을
// 쓸지는 **배치 칸의 위 4비트**가 정한다 — 한 벌만 읽으면 그림 절반이 딴 색이 된다.
//
// ⚠️ **장마다 크기가 다르고 그래서 파일도 따로다.** 첫 장이 512×256이고 나머지
// 둘이 256×256인데, 화면(256×192)보다 큰 것은 **흐르라고** 그렇다 — 화면이 이
// 그림을 감아 돌려야 하므로(`background-repeat`) 한 장에 모아 두면 옆 장이
// 딸려 나온다.
//
// ⚠️ **넓은 배치는 블록 차례다** — 512×256은 왼쪽 판 1024칸 뒤에 오른쪽 판이 온다(`cellAt` · REPAIR §132).
// 한 줄로 읽으면 하늘이 위 96줄로 접히고 나머지가 0번 색으로 남는다. **0번 색은 뚫는다** — 그 뒤는
// 뒤판 색이고(`backdrop`), 원작도 그렇게 깐다(`ov99_021D4134.c:197-198`)
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT, LOCALES, sources } = require('./rom')
const supported = require('../../src/import/platinum/supported.json')
const { encodePng } = require('./png')

const TILE = 8
/** 장수. 일곱 장면이 이 셋을 돌려 쓴다 */
const COUNT = 3
/** 아래 화면의 첫 파일 번호 — 팔레트·타일·배치 (머리말) */
const TOP = { pal: 18, chr: 9, scr: 3 }
/** 배치표 한 줄 — `{줄번호 u16, 띠 위 y u16, 가운데정렬 u16}` */
const ROW_BYTES = 6

/**
 * 크레딧 두루마리의 **배치표**를 오버레이 #99에서 읽는다 (PARITY §8.12).
 *
 * ⚠️ **브라우저 쪽(`import/platinum/credits.ts`의 `creditRows`)과 같은 규칙이다.**
 * 자리와 줄 수는 `supported.json`을 둘이 같이 읽고, 모양 검사도 같은 넷이다 —
 * 줄 번호가 0부터 하나씩 · y가 단조 · 정렬 칸이 0이나 1 · 적힌 줄에서 끊긴다.
 *
 * ⚠️ **미국판이 곧 잣대다.** 여기서 읽은 237줄이 디컴프의 `Unk_ov99_021D4CE4`와
 * 바이트로 같다 (`pnpm gen:credits`가 굽는 `creditsTable.ts`). 그 하나가 이
 * 자리와 이 구조가 맞다는 근거고, 나머지 두 판은 같은 자를 그대로 댄다
 */
function creditRows(overlay, site) {
  const need = site.offset + (site.rows + 1) * ROW_BYTES
  if (site.offset < 0 || need > overlay.length) {
    throw new Error(`크레딧 배치표가 오버레이 밖이다 (0x${site.offset.toString(16)} · ${site.rows}줄)`)
  }
  const rows = []
  let last = -1
  for (let i = 0; i < site.rows; i++) {
    const p = site.offset + i * ROW_BYTES
    const line = overlay.readUInt16LE(p)
    const y = overlay.readUInt16LE(p + 2)
    const centered = overlay.readUInt16LE(p + 4)
    if (line !== i) throw new Error(`크레딧 배치표 ${i}번째 줄 번호가 ${line}이다`)
    if (y < last) throw new Error(`크레딧 배치표 ${i}번째 자리 ${y}가 앞보다 위다`)
    if (centered > 1) throw new Error(`크레딧 배치표 ${i}번째 정렬 값이 ${centered}이다`)
    last = y
    rows.push({ at: y, centered: centered !== 0 })
  }
  if (overlay.readUInt16LE(site.offset + site.rows * ROW_BYTES) === site.rows) {
    throw new Error(`크레딧 배치표가 ${site.rows}줄에서 안 끝난다 — 더 이어진다`)
  }
  return rows
}

/** 그 판의 표가 오버레이 어디에 몇 줄로 놓였나. 브라우저 쪽 `creditsLocator`와 같은 값 */
function creditsSite(gameCode) {
  const release = supported.releases.find((r) => r.gameCode === gameCode)
  if (!release) throw new Error(`모르는 판이다: ${gameCode}`)
  return {
    overlay: supported.creditsOverlay,
    offset: Number(release.creditsOffset),
    rows: release.creditsRows,
  }
}

/** LZ77(0x10). 안 눌린 것은 그대로 돌려준다 */
function lz77(src) {
  if (src[0] !== 0x10) return src
  const size = src[1] | (src[2] << 8) | (src[3] << 16)
  const out = Buffer.alloc(size)
  let o = 0, p = 4
  while (o < size) {
    const flags = src[p++]
    for (let i = 0; i < 8 && o < size; i++) {
      if (flags & (0x80 >> i)) {
        const b1 = src[p++], b2 = src[p++]
        const len = (b1 >> 4) + 3
        let s = o - (((b1 & 0xf) << 8) | b2) - 1
        for (let j = 0; j < len; j++) out[o++] = out[s++]
      } else {
        out[o++] = src[p++]
      }
    }
  }
  return out
}

function color(v) {
  const r = v & 0x1f, g = (v >> 5) & 0x1f, b = (v >> 10) & 0x1f
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)]
}

/** NCLR. 16색 벌이 여럿이라 한 줄로 이어 담는다 — 벌 번호 × 16이 첫 색이다 */
function palette(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RLCN') throw new Error('NCLR이 아니다')
  const size = buf.readUInt32LE(0x20)
  const out = []
  for (let i = 0; i < size / 2; i++) out.push(color(buf.readUInt16LE(0x28 + i * 2)))
  return out
}

/** NCGR 4bpp 타일. `bpp` 칸 3이 4bpp다 */
function chars(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RGCN') throw new Error('NCGR이 아니다')
  const bpp = buf.readUInt32LE(0x1c)
  if (bpp !== 3) throw new Error(`4bpp가 아니다 (bpp 칸 ${bpp})`)
  const size = buf.readUInt32LE(0x28)
  return { data: buf.subarray(0x30, 0x30 + size), tiles: size / 32 }
}

/** NSCR 배치. 한 칸이 u16 — 아래 10비트가 타일, 뒤집기 둘, 위 4비트가 팔레트 벌 */
function screen(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RCSN') throw new Error('NSCR이 아니다')
  const width = buf.readUInt16LE(0x18) / TILE, height = buf.readUInt16LE(0x1a) / TILE
  const cells = []
  for (let i = 0; i < width * height; i++) cells.push(buf.readUInt16LE(0x24 + i * 2))
  return { width, height, cells }
}

/** `(cx, cy)` 칸의 배치 값 — 화면 블록(32×32칸) 차례로 읽는다 (`ntrgfx.ts`의 `screenCell`과 같다) */
function cellAt(scr, cx, cy) {
  const across = Math.ceil(scr.width / 32)
  const block = Math.floor(cx / 32) + Math.floor(cy / 32) * across
  const bw = Math.min(32, scr.width)
  return scr.cells[block * 32 * Math.min(32, scr.height) + (cy % 32) * bw + (cx % 32)] ?? 0
}

/** 배치 한 판을 통째로 rgba 버퍼의 (ox, oy)에 찍는다. 0번 색은 뚫는다 */
function paint(rgba, stride, ox, oy, { pal, chr, scr }) {
  for (let cy = 0; cy < scr.height; cy++) {
    for (let cx = 0; cx < scr.width; cx++) {
      const cell = cellAt(scr, cx, cy)
      const tile = cell & 0x3ff
      const hflip = (cell & 0x400) !== 0, vflip = (cell & 0x800) !== 0
      const bank = ((cell >> 12) & 0xf) * 16
      const tx = cx * TILE, ty = cy * TILE
      for (let i = 0; i < TILE * TILE; i++) {
        const byte = chr.data[tile * 32 + (i >> 1)]
        const idx = i & 1 ? byte >> 4 : byte & 0xf
        const px = i & 7, py = i >> 3
        const x = hflip ? TILE - 1 - px : px
        const y = vflip ? TILE - 1 - py : py
        const rgb = pal[bank + idx] ?? [0, 0, 0]
        const at = ((oy + ty + y) * stride + ox + tx + x) * 4
        rgba[at] = rgb[0]; rgba[at + 1] = rgb[1]; rgba[at + 2] = rgb[2]; rgba[at + 3] = idx === 0 ? 0 : 255
      }
    }
  }
}

function half(narc, base, k) {
  return {
    pal: palette(lz77(narc[base.pal + k])),
    chr: chars(lz77(narc[base.chr + k])),
    scr: screen(lz77(narc[base.scr + k])),
  }
}

function main() {
  const narc = openRom().narc('/graphic/ending.narc')

  const sheets = []
  for (let k = 0; k < COUNT; k++) sheets.push(half(narc, TOP, k))

  const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`
  // 뒤판 색 — 0번 벌의 0번 색 (`convertCredits`의 `backdropOf`와 같다)
  const sizes = sheets.map((s) => ({ w: s.scr.width * TILE, h: s.scr.height * TILE, backdrop: hex(s.pal[0] ?? [0, 0, 0]) }))
  for (const [k, size] of sizes.entries()) {
    if (size.w < 256 || size.h < 192) {
      throw new Error(`${k}장째가 ${size.w}×${size.h}픽셀이다 — 화면보다 작다`)
    }
  }

  let bytes = 0
  for (const [k, sheet] of sheets.entries()) {
    const { w, h } = sizes[k]
    const rgba = new Uint8Array(w * h * 4)
    paint(rgba, w, 0, 0, sheet)
    const png = encodePng(rgba, w, h)
    fs.writeFileSync(path.join(ROOT, `public/data/credits${String(k)}.png`), png)
    bytes += png.length
  }

  const meta = writeJson('credits.json', { count: COUNT, scenes: sizes })
  console.log(
    `크레딧 배경 ${COUNT}장 → public/data/credits0..${String(COUNT - 1)}.png ` +
    `(${(bytes / 1024).toFixed(1)}KB) · ${meta.rel}`,
  )
  console.log(`  ${sizes.map((s) => `${s.w}×${s.h}`).join(' · ')}`)

  // 배치표는 **판마다 다른 표**다. 개발 산출물은 롬 셋이 있으므로 세 벌을 굽는다
  for (const locale of LOCALES) {
    const rom = openRom(sources.requirePlatinumRom(locale))
    const site = creditsSite(rom.gameCode)
    const rows = creditRows(rom.overlay(site.overlay), site)
    const file = writeJson(`credits.${locale}.json`, { rows })
    const centered = rows.filter((r) => r.centered).length
    console.log(
      `  배치표 ${locale} — 줄 ${rows.length} · 가운데 ${centered} · ` +
      `마지막 자리 ${rows[rows.length - 1].at}px · ${file.rel} (${file.kb}KB)`,
    )
  }
}

if (require.main === module) main()
