// 도구 아이콘 아틀라스 자르기 (`itemIcon.ts`)
//
// ⚠️ 여기가 조용히 틀리는 자리다. 칸은 32픽셀인데 목록에서는 28, 설명칸에서는
// 96픽셀로 쓴다. 배경 **위치**만 옮기고 시트 크기를 안 늘리면 그림이 안 바뀐 채
// 잘리기만 해서, 화면에서는 "아이콘이 좀 이상하다" 정도로만 보인다.
import { describe, it, expect } from 'vitest'
import type { ItemIcons } from '../../data/schema'
import { itemIcon } from './itemIcon'

/** 실제 자료와 같은 값이다 (`public/data/itemIcons.json`) */
const ATLAS: ItemIcons = { size: 32, cols: 24, rows: 20, count: 468 }

/** `-96px -0px` → [96, 0] */
function offset(css: string | undefined): [number, number] {
  const found = /^-?(\d+)px -?(\d+)px$/.exec(css ?? '')
  if (!found) throw new Error(`위치를 못 읽었다: ${String(css)}`)
  return [Number(found[1]), Number(found[2])]
}

describe('아틀라스 한 칸', () => {
  it('0번은 왼쪽 위 모서리다', () => {
    const at = itemIcon(ATLAS, 0, 32)
    expect(offset(at.backgroundPosition as string)).toEqual([0, 0])
    expect(at.backgroundSize).toBe('768px 640px')
  })

  it('칸 번호가 열 수를 넘으면 다음 줄로 내려간다', () => {
    // 24열이라 25번은 두 번째 줄의 두 번째 칸이다
    expect(offset(itemIcon(ATLAS, 25, 32).backgroundPosition as string)).toEqual([32, 32])
    expect(offset(itemIcon(ATLAS, 23, 32).backgroundPosition as string)).toEqual([23 * 32, 0])
  })

  /**
   * 이 시험이 잘린 아이콘을 잡는다.
   *
   * 크기를 바꾸면 **위치와 시트가 같은 배율로** 움직여야 한다. 한쪽만 움직이면
   * 시트 안에서 칸이 가리키는 자리가 어긋난다 — 그 어긋남은 비율로 드러난다
   */
  it('어떤 크기로 그려도 시트 안의 같은 칸을 가리킨다', () => {
    for (const px of [16, 28, 32, 96]) {
      const at = itemIcon(ATLAS, 300, px)
      const [x, y] = offset(at.backgroundPosition as string)
      const [w, h] = String(at.backgroundSize).split(' ').map(parseFloat)
      // 300 = 12 × 24 + 12 이므로 열도 행도 12번이다
      expect(x / w!).toBeCloseTo(12 / ATLAS.cols, 10)
      expect(y / h!).toBeCloseTo(12 / ATLAS.rows, 10)
      expect(at.width).toBe(px)
    }
  })

  it('자료를 아직 못 받았으면 자리만 잡는다', () => {
    const at = itemIcon(undefined, 5, 28)
    expect(at.width).toBe(28)
    expect(at.backgroundImage).toBeUndefined()
  })
})
