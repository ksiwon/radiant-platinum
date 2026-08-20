// 트레이너 배틀 그림 — 브라우저에서 (DATA.md §2.19)
//
// `poketool/trgra/trfgra.narc`에 한 갈래가 **5칸**을 쓴다
// (`pokemon.c`의 `TCFT_*`):
//
//   0 타일 · 1 팔레트 · 2 셀 · 3 애니 · 4 통짜 그림
//
// ⚠️ **원작이 쓰는 것은 0번인데 우리가 쓰는 것은 4번이다.** 0번은 OBJ 타일이라
// 셀(2번)을 읽어야 사람 모양으로 서고, 4번은 같은 그림이 **한 장으로 이미
// 펴져 있다**(160×80). 4번을 타일로 읽으면 줄무늬가 되고 **선형으로 읽어야**
// 사람이 나온다 — 0번과 반대다.
//
// ⚠️ **4번만 암호가 걸려 있다.** 0번은 그대로 읽히는데(배경 82.5%) 4번은 풀기
// 전이 6.2%, 풀면 91.3%다. 암호는 `pl_pokegra`와 같은 16비트 LCG라 그쪽 함수를
// 그대로 쓴다 (§2.17).
//
// ⚠️ **노드 쪽(`tools/extract/trainerSprites.js`)과 한 줄씩 같아야 한다.**
import { narcEntry } from './nds'
import { boundsOf, CUT, clearRatio, pixelsOf, toRgba, type Box } from './pokegra'
import { encodePng } from './png'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

/** 한 갈래가 쓰는 칸 수 (`TRAINER_CLASS_NUM_FILETYPES`) */
const PER_CLASS = 5
/** `TCFT_PALETTE` */
const FILE_PALETTE = 1
/** `TCFT_SCAN` — 통짜로 펴 둔 그림 */
const FILE_SCAN = 4
/** 배경이 이 비율을 넘어야 제대로 풀린 그림이다 */
const CLEAR_MIN = 0.3

/**
 * ⚠️ **성 안내인만 팔레트 셋째 묶음을 쓴다** (`Pokemon_...`의
 * `if (trainerClass == TRAINER_CLASS_CASTLE_VALET) paletteIdx = 2`).
 * 0번 묶음으로 그리면 그 한 사람만 딴 색으로 선다
 */
const CASTLE_VALET = 102
const CASTLE_VALET_PALETTE = 2

const magic = (b: Uint8Array): string => String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!)

/**
 * `RLCN`(NCLR)에서 16색 묶음 하나. 15비트 BGR → RGB.
 *
 * 트레이너 팔레트는 256색 한 판인데 그림이 4비트라 **16색씩 열여섯 묶음**으로
 * 쓰인다 — `pokegra`의 것은 늘 첫 묶음이라 이쪽이 따로 있다
 */
function subPalette(
  file: Uint8Array, group: number,
): [number, number, number][] | null {
  if (file.byteLength < 0x40 || magic(file) !== 'RLCN') return null
  const body = file.subarray(0x28 + group * 32)
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)
  const out: [number, number, number][] = []
  for (let i = 0; i + 1 < body.byteLength && out.length < 16; i += 2) {
    const v = view.getUint16(i, true)
    out.push([
      Math.round(((v & 31) * 255) / 31),
      Math.round((((v >> 5) & 31) * 255) / 31),
      Math.round((((v >> 10) & 31) * 255) / 31),
    ])
  }
  return out.length === 16 ? out : null
}

export async function convertTrainerSprites(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/poketool/trgra/trfgra.narc')
  if (!narc) throw new Error('trfgra.narc을 못 읽었다')

  const out: Produced = new Map()
  const meta: Record<string, Box> = {}
  const empty = new Uint8Array(0)
  let classes = 0
  for (let c = 0; ; c++) {
    const base = c * PER_CLASS
    const palFile = narcEntry(narc, base + FILE_PALETTE)
    if (!palFile) break
    classes = c + 1
    if (c % 16 === 0) { check(ctx); ctx.onProgress?.(c, 105); await breathe(ctx) }

    const group = c === CASTLE_VALET ? CASTLE_VALET_PALETTE : 0
    const palette = subPalette(palFile, group)
    const pixels = pixelsOf(narcEntry(narc, base + FILE_SCAN) ?? empty)
    if (!palette || !pixels) continue

    const rgba = toRgba(pixels, palette, 0)
    // 제대로 안 풀린 그림은 배경이 안 생긴다. 노이즈를 싣느니 없는 편이 낫다
    if (clearRatio(rgba) < CLEAR_MIN) continue
    const box = boundsOf(rgba)
    if (!box) continue

    out.set(`data/trainers/${String(c)}.png`, await encodePng(rgba, CUT, CUT))
    meta[c] = box
  }

  out.set('data/trainers/index.json', json({ size: CUT, sprites: meta }))
  ctx.onProgress?.(classes, classes)
  return out
}
