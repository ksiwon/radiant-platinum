// 포켓몬 배틀 그림 — 브라우저에서 (DATA.md §2.17)
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
// ⚠️ 노드 쪽이 처음에 실패한 이유가 적혀 있다: **하필 0번 파일로 시험했다.** 그
// 하나가 스프라이트가 아닌 빈 칸이라 어느 방향으로 풀어도 노이즈였다. 표본 하나로
// 판단하면 안 된다.
//
// 픽셀은 타일이 아니라 **선형**이다. 160×80 한 장에 80×80짜리 두 컷이 나란히
// 있고, 원작은 그중 첫 컷만 쓴다(둘째는 같은 그림의 다른 프레임이다).
import { narcEntry } from './nds'
import { encodePng } from './png'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

/** 한 종족이 쓰는 칸 수. 2964 ÷ 6 = 494종 */
const PER_SPECIES = 6
/** 한 컷의 크기. 원작 배틀 화면이 이 크기로 그린다 */
export const CUT = 80
/** 한 줄의 실제 픽셀 수. 컷 둘이 나란히 있다 */
const ROW = 160
/** 배경이 이 비율을 넘어야 제대로 풀린 그림이다 */
const CLEAR_MIN = 0.3
/** 픽셀 암호 LCG */
const LCG_MUL = 0x4e6d
const LCG_ADD = 0x6073

const magic = (b: Uint8Array): string => String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!)

/**
 * NCGR 픽셀을 푼다.
 *
 * 첫 u16이 열쇠고, 그것으로 자기 자신을 XOR하면 0이 된다 — 그 0이 배경색 번호다.
 * 이어서 LCG로 열쇠를 굴린다
 */
export function decipher(buf: Uint8Array, start: number): Uint8Array {
  const out = buf.slice(start)
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
  let key = view.getUint16(0, true)
  for (let i = 0; i + 1 < out.byteLength; i += 2) {
    view.setUint16(i, view.getUint16(i, true) ^ key, true)
    key = (Math.imul(key, LCG_MUL) + LCG_ADD) & 0xffff
  }
  return out
}

/** `RGCN` 안에서 픽셀 시작점. 헤더 뒤 0x30이다 */
export function pixelsOf(file: Uint8Array): Uint8Array | null {
  if (file.byteLength < 0x40 || magic(file) !== 'RGCN') return null
  return decipher(file, 0x30)
}

/** `RLCN`(NCLR) 팔레트. 암호가 없다. 15비트 BGR → RGB */
export function paletteOf(file: Uint8Array): [number, number, number][] | null {
  if (file.byteLength < 0x40 || magic(file) !== 'RLCN') return null
  const body = file.subarray(0x28)
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

/**
 * 4비트 선형 픽셀 → RGBA 한 컷.
 *
 * 색 0은 배경이라 투명하게 둔다. 낮은 니블이 먼저다
 */
export function toRgba(
  pixels: Uint8Array, palette: readonly [number, number, number][], cut: number,
): Uint8Array {
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
export function clearRatio(rgba: Uint8Array): number {
  let clear = 0
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] === 0) clear++
  return clear / (rgba.length / 4)
}

export interface Box { x: number, y: number, w: number, h: number }

/** 그림이 실제로 차지하는 상자. 배틀에서 발밑을 맞추려면 이것이 있어야 한다 */
export function boundsOf(rgba: Uint8Array): Box | null {
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

/** 앞모습(상대)과 뒷모습(내 것). 암 칸이 비면 수 칸을 쓴다 */
const PICK: readonly (readonly [string, readonly number[]])[] = [
  ['back', [1, 0]],
  ['front', [3, 2]],
]

export async function convertPokegra(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/poketool/pokegra/pl_pokegra.narc')
  if (!narc) throw new Error('pl_pokegra.narc을 못 읽었다')

  const out: Produced = new Map()
  const meta: Record<number, Record<string, Box>> = {}
  const empty = new Uint8Array(0)
  let species = 0
  for (let s = 0; ; s++) {
    const base = s * PER_SPECIES
    // 팔레트 칸이 없으면 표가 끝난 것이다
    const palFile = narcEntry(narc, base + 4)
    if (!palFile) break
    species = s + 1
    if (s % 16 === 0) { check(ctx); ctx.onProgress?.(s, 494); await breathe(ctx) }

    const palette = paletteOf(palFile)
    if (!palette) continue

    const entry: Record<string, Box> = {}
    for (const [name, order] of PICK) {
      let px: Uint8Array | null = null
      for (const k of order) {
        const got = pixelsOf(narcEntry(narc, base + k) ?? empty)
        if (got) { px = got; break }
      }
      if (!px) continue
      const rgba = toRgba(px, palette, 0)
      // 제대로 안 풀린 그림은 배경이 안 생긴다. 그런 것은 안 싣는다 —
      // 노이즈를 그리느니 없는 편이 화면에서 바로 보인다
      if (clearRatio(rgba) < CLEAR_MIN) continue
      const box = boundsOf(rgba)
      if (!box) continue
      out.set(`data/pokemon/${String(s)}_${name}.png`, await encodePng(rgba, CUT, CUT))
      entry[name] = box
    }
    if (Object.keys(entry).length > 0) meta[s] = entry
  }

  out.set('data/pokemon/index.json', json({ size: CUT, sprites: meta }))
  ctx.onProgress?.(species, species)
  return out
}
