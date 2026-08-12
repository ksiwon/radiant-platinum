// 포켓몬 배틀 그림 (DATA.md §2.17)
//
// `poketool/pokegra/pl_pokegra.narc`에 한 종족이 **6칸**을 쓴다:
//
//   0 뒤 수 · 1 뒤 암 · 2 앞 수 · 3 앞 암 · 4 팔레트(보통) · 5 팔레트(색이 다른)
//
// 암수 구분이 없는 종은 암 칸이 0바이트고, 그러면 수 칸을 쓴다.
//
// ⚠️ **픽셀에 암호가 걸려 있다.** `RGCN`(NCGR) 헤더 뒤 0x30부터가 16비트 LCG로
// XOR돼 있고 앞에서 뒤로 간다. 첫 낱말이 자기 자신과 XOR돼 0(배경)이 되는 것이
// 방향이 맞다는 표시다 — 그대로 두면 배경이 6.4%인데 풀면 64~86%가 된다.
//
// ⚠️ 처음에 실패한 이유를 적어 둔다: **하필 0번 파일로 시험했다.** 그 하나가
// 스프라이트가 아닌 빈 칸이라 어느 방향으로 풀어도 노이즈였고, 알고리즘이
// 틀렸다고 결론지었다. 표본 하나로 판단하면 안 된다.
//
// 픽셀은 타일이 아니라 **선형**이다. 160×80 한 장에 80×80짜리 두 컷이 나란히
// 있고, 원작은 그중 첫 컷만 쓴다(둘째는 같은 그림의 다른 프레임이다).
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { rows, TOTAL_FILES } = require('./otherpokeTableModule.cjs')
const { encodePng } = require('./png')

/** 알의 종 번호. `pl_pokegra`에 칸이 없다 */
const EGG_SPECIES = 494

const OUT_DIR = path.join(ROOT, 'public/data/pokemon')
/** 한 종족이 쓰는 칸 수. 2964 ÷ 6 = 494종 */
const PER_SPECIES = 6
/** 한 컷의 크기. 원작 배틀 화면이 이 크기로 그린다 */
const CUT = 80
/** 배경이 이 비율을 넘어야 제대로 풀린 그림이다 */
const CLEAR_MIN = 0.3

/**
 * NCGR 픽셀을 푼다.
 *
 * `key`가 첫 u16이고, 그것으로 자기 자신을 XOR하면 0이 된다 — 그 0이 배경색
 * 번호다. 이어서 LCG로 열쇠를 굴린다
 */
function decipher(buf, start) {
  const out = Buffer.from(buf.subarray(start))
  let key = out.readUInt16LE(0)
  for (let i = 0; i + 1 < out.length; i += 2) {
    out.writeUInt16LE(out.readUInt16LE(i) ^ key, i)
    key = (Math.imul(key, 0x4e6d) + 0x6073) & 0xffff
  }
  return out
}

/** `RGCN` 안에서 픽셀 시작점. 헤더 뒤 0x30이다 */
function pixelsOf(file) {
  if (file.length < 0x40 || file.toString('ascii', 0, 4) !== 'RGCN') return null
  return decipher(file, 0x30)
}

/** `RLCN`(NCLR) 팔레트. 암호가 없다. 15비트 BGR → RGB */
function paletteOf(file) {
  if (file.length < 0x40 || file.toString('ascii', 0, 4) !== 'RLCN') return null
  const body = file.subarray(0x28)
  const out = []
  for (let i = 0; i + 1 < body.length && out.length < 16; i += 2) {
    const v = body.readUInt16LE(i)
    out.push([
      Math.round(((v & 31) * 255) / 31),
      Math.round((((v >> 5) & 31) * 255) / 31),
      Math.round((((v >> 10) & 31) * 255) / 31),
    ])
  }
  return out.length === 16 ? out : null
}

/**
 * 4비트 선형 픽셀 → RGBA 한 컷.
 *
 * 색 0은 배경이라 투명하게 둔다. 낮은 니블이 먼저다
 */
function toRgba(pixels, palette, cut) {
  const rgba = new Uint8Array(CUT * CUT * 4)
  for (let y = 0; y < CUT; y++) {
    for (let x = 0; x < CUT; x++) {
      // 한 줄이 160픽셀이고 컷이 나란히 있다
      const at = y * 160 + cut * CUT + x
      const byte = pixels[at >> 1]
      if (byte === undefined) continue
      const idx = at & 1 ? byte >> 4 : byte & 15
      const o = (y * CUT + x) * 4
      if (idx === 0) continue
      const c = palette[idx] ?? [255, 0, 255]
      rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255
    }
  }
  return rgba
}

/** 투명 픽셀 비율. 제대로 풀렸는지 가리는 잣대다 */
function clearRatio(rgba) {
  let clear = 0
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] === 0) clear++
  return clear / (rgba.length / 4)
}

/** 그림이 실제로 차지하는 상자. 배틀에서 발밑을 맞추려면 이것이 있어야 한다 */
function boundsOf(rgba) {
  let x0 = CUT, x1 = -1, y0 = CUT, y1 = -1
  for (let y = 0; y < CUT; y++) {
    for (let x = 0; x < CUT; x++) {
      if (rgba[(y * CUT + x) * 4 + 3] === 0) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

function main() {
  const rom = openRom(process.argv[2])
  const narc = rom.narc('/poketool/pokegra/pl_pokegra.narc')
  const files = narc.files ?? narc
  const species = Math.floor(files.length / PER_SPECIES)
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const meta = {}
  let wrote = 0, dim = 0, blank = 0
  for (let s = 0; s < species; s++) {
    const base = s * PER_SPECIES
    const palette = paletteOf(files[base + 4])
    if (!palette) { blank++; continue }
    // 앞모습(상대)과 뒷모습(내 것)을 한 장씩. 암 칸이 비면 수 칸을 쓴다
    const pick = { back: [1, 0], front: [3, 2] }
    const entry = {}
    for (const [name, order] of Object.entries(pick)) {
      let px = null
      for (const k of order) {
        const got = pixelsOf(files[base + k] ?? Buffer.alloc(0))
        if (got) { px = got; break }
      }
      if (!px) continue
      const rgba = toRgba(px, palette, 0)
      const clear = clearRatio(rgba)
      if (clear < CLEAR_MIN) { dim++; continue }
      const box = boundsOf(rgba)
      if (!box) { dim++; continue }
      fs.writeFileSync(
        path.join(OUT_DIR, `${s}_${name}.png`), encodePng(rgba, CUT, CUT))
      entry[name] = box
      wrote++
    }
    if (Object.keys(entry).length > 0) meta[s] = entry
  }

  const forms = otherpoke(rom, meta)

  writeJson('pokemon/index.json', { size: CUT, sprites: meta })
  console.log(`종족 ${species}종 · 그림 ${wrote}장 · 팔레트 없음 ${blank} · 못 푼 것 ${dim}`)
  console.log(`  폼·알 그림 ${forms}장 (pl_otherpoke)`)
}

/**
 * 폼 그림과 **알 그림** (`pl_otherpoke.narc`).
 *
 * ⚠️ **알은 여기에만 있다.** `pl_pokegra`는 494종뿐이라 알의 배틀 그림이 없다.
 * 어느 칸인지는 표가 안다 — 픽셀 암호도 팔레트 모양도 `pl_pokegra`와 같다.
 *
 * ⚠️ **브라우저 쪽(`src/import/platinum/pokegra.ts`)과 한 줄씩 같아야 한다.**
 */
function otherpoke(rom, meta) {
  const files = rom.narc('/poketool/pokegra/pl_otherpoke.narc')
  if (files.length !== TOTAL_FILES) {
    throw new Error(`pl_otherpoke ${files.length}칸 ≠ ${TOTAL_FILES}칸`)
  }
  let wrote = 0
  for (const row of rows().rows) {
    // 기본형은 `pl_pokegra`에 같은 그림이 있다. 알(494)만 여기가 낸다
    const first = row.id === EGG_SPECIES ? 0 : 1
    for (let form = first; form < row.forms; form++) {
      const palette = paletteOf(files[palIndex(row, form)])
      if (!palette) continue
      const key = form === 0 ? String(row.id) : `${row.id}-${form}`
      const entry = {}
      for (const [name, front] of [['back', false], ['front', true]]) {
        const at = charIndex(row, form, front)
        if (at === null) continue
        const px = pixelsOf(files[at] ?? Buffer.alloc(0))
        if (!px) continue
        const rgba = toRgba(px, palette, 0)
        if (clearRatio(rgba) < CLEAR_MIN) continue
        const box = boundsOf(rgba)
        if (!box) continue
        fs.writeFileSync(path.join(OUT_DIR, `${key}_${name}.png`), encodePng(rgba, CUT, CUT))
        entry[name] = box
        wrote++
      }
      if (Object.keys(entry).length > 0) meta[key] = entry
    }
  }
  return wrote
}

/** 그 폼의 그림 칸. 알의 뒷모습은 없다 */
function charIndex(row, form, front) {
  if (row.frontOnly) return front ? row.chars + form : null
  if (row.backsThenFronts) return row.chars + (front ? row.forms : 0) + form
  return row.chars + form * 2 + (front ? 1 : 0)
}

/** 그 폼의 보통색 팔레트 칸 */
function palIndex(row, form) {
  if (row.shared) return row.pals
  if (row.frontOnly || row.normalsThenShinies) return row.pals + form
  return row.pals + form * 2
}

main()
