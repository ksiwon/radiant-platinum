// 텍스처 시트 굽기 — 브라우저에서 (DATA.md §2.2)
//
// 청크와 소품이 같은 일을 한다: 재질이 이름으로 가리키는 (그림, 팔레트) 쌍을 모아
// 한 장에 담고, 어디에 놓았는지를 목차로 남긴다.
//
// **텍스처 하나에 파일 하나로 두지 않는다.** 그러면 청크 하나 그리는 데 스무 번
// 왕복이다. 반복(repeat) 때문에 아틀라스를 그대로 샘플링할 수는 없으므로 받은 뒤
// 잘라서 각각 텍스처로 만든다 — 왕복은 한 번, 반복은 정확하게.
import { decode, type Tex0, type TexEntry } from './nitrotex'
import { encodePng } from './png'

/** 시트 폭. 가장 큰 텍스처가 128이라 두 장이 나란히 들어간다 */
export const SHEET_WIDTH = 256

export interface SheetItem {
  tex: string
  pal: string
  width: number
  height: number
  src: TexEntry
  x: number
  y: number
}

/** 선반 채우기 — 높이가 큰 것부터 줄을 채운다. 단순하지만 낭비가 적다 */
export function pack(items: SheetItem[]): { width: number, height: number } {
  const sorted = [...items].sort((a, b) => b.height - a.height || b.width - a.width)
  let x = 0, y = 0, rowHeight = 0
  for (const item of sorted) {
    if (x + item.width > SHEET_WIDTH) { x = 0; y += rowHeight; rowHeight = 0 }
    item.x = x
    item.y = y
    x += item.width
    rowHeight = Math.max(rowHeight, item.height)
  }
  return { width: SHEET_WIDTH, height: y + rowHeight }
}

/** 목차 한 줄: [그림 이름, 팔레트 이름, x, y, 너비, 높이] */
type SheetEntry = [string, string, number, number, number, number]

export interface Sheet { w: number, h: number, items: SheetEntry[] }

/** 담을 것들을 한 장에 굽는다. 빈 목록이면 null */
export async function bakeSheet(
  tex0: Tex0, items: SheetItem[], palAt: ReadonlyMap<string, number>,
): Promise<{ png: Uint8Array, sheet: Sheet } | null> {
  if (items.length === 0) return null
  const size = pack(items)
  const height = Math.max(1, size.height)
  const rgba = new Uint8Array(size.width * height * 4)
  for (const item of items) {
    // 팔레트가 없는 재질(direct color)은 0에서 읽는다
    const pixels = decode(tex0, item.src, palAt.get(item.pal) ?? 0)
    for (let y = 0; y < item.height; y++) {
      const from = y * item.width * 4
      const to = ((item.y + y) * size.width + item.x) * 4
      rgba.set(pixels.subarray(from, from + item.width * 4), to)
    }
  }
  return {
    png: await encodePng(rgba, size.width, height),
    sheet: {
      w: size.width,
      h: height,
      items: items.map((i): SheetEntry => [i.tex, i.pal, i.x, i.y, i.width, i.height]),
    },
  }
}
