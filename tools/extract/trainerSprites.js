// 트레이너 배틀 그림 (DATA.md §2.19)
//
// `poketool/trgra/trfgra.narc`에 한 갈래가 **5칸**을 쓴다
// (`pokemon.c`의 `TCFT_*`):
//
//   0 타일 · 1 팔레트 · 2 셀 · 3 애니 · 4 통짜 그림
//
// ⚠️ **원작이 쓰는 것은 0번인데 우리가 쓰는 것은 4번이다.** 0번은 OBJ 타일이라
// 셀(2번)을 읽어야 사람 모양으로 서고, 4번은 같은 그림이 **한 장으로 이미
// 펴져 있다**(160×80). 둘 중 어느 쪽을 골라도 픽셀은 같은 것이 나오므로,
// NCER 해석을 안 하는 쪽을 골랐다. 4번을 타일로 읽으면 줄무늬가 되고
// **선형으로 읽어야** 사람이 나온다 — 0번과 반대다.
//
// ⚠️ **4번만 암호가 걸려 있다.** 0번은 그대로 읽히는데(배경 82.5%) 4번은 풀기
// 전이 6.2%, 풀면 91.3%다. 암호는 `pl_pokegra`와 같은 16비트 LCG다 (§2.17).
//
// 한 줄이 160픽셀이고 80×80 두 컷이 나란히 있다 — 원작이 쓰는 것은 첫 컷이다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')

const OUT_DIR = path.join(ROOT, 'public/data/trainers')

/** 한 갈래가 쓰는 칸 수 (`TRAINER_CLASS_NUM_FILETYPES`) */
const PER_CLASS = 5
/** `TCFT_PALETTE` */
const FILE_PALETTE = 1
/** `TCFT_SCAN` — 통짜로 펴 둔 그림 */
const FILE_SCAN = 4
/** 한 컷의 크기 */
const CUT = 80
/** 한 줄의 실제 픽셀 수. 컷 둘이 나란히 있다 */
const ROW = 160
/** 배경이 이 비율을 넘어야 제대로 풀린 그림이다 */
const CLEAR_MIN = 0.3
/** 픽셀 암호 LCG (`pl_pokegra`와 같다) */
const LCG_MUL = 0x4e6d
const LCG_ADD = 0x6073

/**
 * ⚠️ **성 안내인만 팔레트 셋째 묶음을 쓴다** (`Pokemon_...`의
 * `if (trainerClass == TRAINER_CLASS_CASTLE_VALET) paletteIdx = 2`).
 * 0번 묶음으로 그리면 그 한 사람만 딴 색으로 선다
 */
const CASTLE_VALET = 102
const CASTLE_VALET_PALETTE = 2

/** NCGR 픽셀을 푼다. 첫 u16이 열쇠고, 그것으로 자기 자신을 XOR하면 0(배경)이다 */
function decipher(buf, start) {
  const out = Buffer.from(buf.subarray(start))
  let key = out.readUInt16LE(0)
  for (let i = 0; i + 1 < out.length; i += 2) {
    out.writeUInt16LE(out.readUInt16LE(i) ^ key, i)
    key = (Math.imul(key, LCG_MUL) + LCG_ADD) & 0xffff
  }
  return out
}

/** `RGCN` 안에서 픽셀 시작점. 헤더 뒤 0x30이다 */
function pixelsOf(file) {
  if (file.length < 0x40 || file.toString('ascii', 0, 4) !== 'RGCN') return null
  return decipher(file, 0x30)
}

/**
 * `RLCN`(NCLR)에서 16색 묶음 하나. 15비트 BGR → RGB.
 *
 * 트레이너 팔레트는 256색 한 판인데 그림이 4비트라 **16색씩 열여섯 묶음**으로
 * 쓰인다
 */
function paletteOf(file, group) {
  if (file.length < 0x40 || file.toString('ascii', 0, 4) !== 'RLCN') return null
  const body = file.subarray(0x28 + group * 32)
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

/** 4비트 선형 픽셀 → RGBA 한 컷. 색 0은 배경이라 투명하게 둔다 */
function toRgba(pixels, palette, cut) {
  const rgba = new Uint8Array(CUT * CUT * 4)
  for (let y = 0; y < CUT; y++) {
    for (let x = 0; x < CUT; x++) {
      const at = y * ROW + cut * CUT + x
      const byte = pixels[at >> 1]
      if (byte === undefined) continue
      const idx = at & 1 ? byte >> 4 : byte & 15
      if (idx === 0) continue
      const o = (y * CUT + x) * 4
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

/** 그림이 실제로 차지하는 상자. 발밑을 맞추려면 이것이 있어야 한다 */
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
  const files = rom.narc('/poketool/trgra/trfgra.narc')
  if (files.length % PER_CLASS !== 0) {
    throw new Error(`trfgra ${files.length}칸이 ${PER_CLASS}로 안 나뉜다`)
  }
  const classes = files.length / PER_CLASS
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const meta = {}
  let wrote = 0, dim = 0
  for (let c = 0; c < classes; c++) {
    const base = c * PER_CLASS
    const group = c === CASTLE_VALET ? CASTLE_VALET_PALETTE : 0
    const palette = paletteOf(files[base + FILE_PALETTE], group)
    const pixels = pixelsOf(files[base + FILE_SCAN] ?? Buffer.alloc(0))
    if (!palette || !pixels) { dim++; continue }

    const rgba = toRgba(pixels, palette, 0)
    // 제대로 안 풀린 그림은 배경이 안 생긴다. 노이즈를 싣느니 없는 편이 낫다
    if (clearRatio(rgba) < CLEAR_MIN) { dim++; continue }
    const box = boundsOf(rgba)
    if (!box) { dim++; continue }

    fs.writeFileSync(path.join(OUT_DIR, `${c}.png`), encodePng(rgba, CUT, CUT))
    meta[c] = box
    wrote++
  }

  writeJson('trainers/index.json', { size: CUT, sprites: meta })
  console.log(`트레이너 갈래 ${classes}종 → 그림 ${wrote}장 · 못 푼 것 ${dim}`)
}

main()
