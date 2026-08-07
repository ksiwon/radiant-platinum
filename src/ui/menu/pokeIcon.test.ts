// 포켓몬 아이콘·벽지 아틀라스 자르기 (`pokeIcon.ts`)
//
// ⚠️ 도구 아이콘에서 한 번 겪은 자리다. 배경 **위치**만 옮기고 시트 크기를 안
// 늘리면 그림이 안 바뀐 채 잘리기만 해서, 화면에서는 "아이콘이 좀 이상하다"
// 정도로만 보인다. 그래서 여기서 보는 것은 값이 아니라 **비율**이다.
//
// 벽지 쪽은 칸이 네모가 아니라(168×160) 가로세로를 따로 밀어야 한다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { boxWallpapersSchema, pokeIconsSchema } from '../../data/schema'
import type { BoxWallpapers, PokeIcons } from '../../data/schema'
import { boxWallpaper, pokeIcon } from './pokeIcon'

/** 실제 자료와 같은 값이다 (`public/data/pokeIcons.json`) */
const ICONS: PokeIcons = { size: 32, cols: 24, rows: 21, count: 496 }
/** `public/data/boxWallpapers.json` */
const WALLS: BoxWallpapers = { count: 32, cols: 8, rows: 4, width: 168, height: 160 }

/** `-96px -0px` → [96, 0] */
function offset(css: string | undefined): [number, number] {
  const found = /^-?(\d+)px -?(\d+)px$/.exec(css ?? '')
  if (!found) throw new Error(`위치를 못 읽었다: ${String(css)}`)
  return [Number(found[1]), Number(found[2])]
}

function size(css: string | undefined): [number, number] {
  return String(css).split(' ').map(parseFloat) as [number, number]
}

const DATA = resolve(__dirname, '../../../public/data')

describe('아틀라스가 실제 자료와 맞는다', () => {
  it('구워 둔 json이 여기 적어 둔 값과 같다', () => {
    // 추출기를 다시 돌려 칸 수가 바뀌면 아래 시험이 통째로 헛돈다
    const icons = resolve(DATA, 'pokeIcons.json')
    if (!existsSync(icons)) return
    expect(pokeIconsSchema.parse(JSON.parse(readFileSync(icons, 'utf8')))).toEqual(ICONS)
    const walls = resolve(DATA, 'boxWallpapers.json')
    if (!existsSync(walls)) return
    expect(boxWallpapersSchema.parse(JSON.parse(readFileSync(walls, 'utf8')))).toEqual(WALLS)
  })
})

describe('포켓몬 아이콘', () => {
  it('색인이 종족 번호 그대로다 — 0번은 빈 칸이라 왼쪽 위다', () => {
    expect(offset(pokeIcon(ICONS, 0, 32).backgroundPosition as string)).toEqual([0, 0])
    // 모부기 387 = 16 × 24 + 3
    expect(offset(pokeIcon(ICONS, 387, 32).backgroundPosition as string)).toEqual([3 * 32, 16 * 32])
  })

  it('어떤 크기로 그려도 시트 안의 같은 칸을 가리킨다', () => {
    for (const px of [40, 64, 96]) {
      const at = pokeIcon(ICONS, 387, px)
      const [x, y] = offset(at.backgroundPosition as string)
      const [w, h] = size(at.backgroundSize as string)
      expect(x / w).toBeCloseTo(3 / ICONS.cols, 10)
      expect(y / h).toBeCloseTo(16 / ICONS.rows, 10)
      expect(at.width).toBe(px)
    }
  })

  it('없는 번호는 자리만 잡는다', () => {
    // 496칸뿐이다. 시트 밖을 가리키면 **빈 칸이 아니라 다른 포켓몬**이 뜬다
    expect(pokeIcon(ICONS, 900, 40).backgroundImage).toBeUndefined()
    expect(pokeIcon(undefined, 25, 40).backgroundImage).toBeUndefined()
    expect(pokeIcon(undefined, 25, 40).width).toBe(40)
  })
})

describe('박스 벽지', () => {
  it('칸이 네모가 아니라 가로세로를 따로 민다', () => {
    const at = boxWallpaper(WALLS, 9, 3)
    // 9 = 1 × 8 + 1 → 두 번째 줄 두 번째 칸
    expect(offset(at.backgroundPosition as string)).toEqual([168 * 3, 160 * 3])
    expect(size(at.backgroundSize as string)).toEqual([8 * 168 * 3, 4 * 160 * 3])
  })

  it('배수를 바꿔도 같은 칸을 가리킨다', () => {
    for (const k of [1, 2, 3]) {
      const at = boxWallpaper(WALLS, 17, k)
      const [x, y] = offset(at.backgroundPosition as string)
      const [w, h] = size(at.backgroundSize as string)
      // 17 = 2 × 8 + 1
      expect(x / w).toBeCloseTo(1 / WALLS.cols, 10)
      expect(y / h).toBeCloseTo(2 / WALLS.rows, 10)
    }
  })

  it('없는 번호는 돌려서 채운다 — 벽지가 비면 박스가 통째로 비어 보인다', () => {
    expect(boxWallpaper(WALLS, 32, 1).backgroundPosition)
      .toBe(boxWallpaper(WALLS, 0, 1).backgroundPosition)
    expect(boxWallpaper(undefined, 0, 3)).toEqual({})
  })
})
