// 도트 시트 자르기 (`pixelSprite.ts`) — DECISIONS 사용자 지적 ③이 합격 조건이다.
//
// 박스 파티 아이콘이 **잘리고 엉뚱한 마리가 나왔다.** 아틀라스 칸 계산이 배율과 따로 놀았기 때문이다. 그래서 여기서
// 재는 것은 값 몇 개가 아니라 **성질**이다:
//
//   ① 배율은 1~4의 정수뿐이다 (소수배는 던진다)
//   ② 칸 상자 · 시트 · 위치가 **같은 배율** 하나로 움직인다 — 그래서 어떤 칸도 시트 밖으로 잘리지 않는다
//   ③ 칸 번호를 위치에서 거꾸로 풀면 처음 번호다 — 이웃 칸(다른 종)이 안 보인다
//   ④ 종 → 아이콘 칸 번호는 `iconSlot` 한 곳이고, 이름 옆의 아이콘이 가리키는 칸이 그 칸이다
import { describe, expect, it } from 'vitest'
import type { PokeIcons } from '../../data/schema'
import { MOVE_CLASS_SHEET, startMenuIconSheet, typeIconSheet } from '../../data/gameData'
import { sheetSize } from '../../data/spriteSheet'
import { iconSlot } from '../../engine/pokemon/form'
import { monIconAt, pokeIconAt, pokeSheet } from '../menu/pokeIcon'
import { menuIcon, menuIconRow } from '../menu/menuIcon'
import type { PixelScale } from '../theme/scale'
import { isPixelScale, pixelCell, pixelCellAt, pixelSprite, scaleFor } from './pixelSprite'

/** 실제 자료와 같은 값이다 (`public/data/pokeIcons.json`) */
const ICONS: PokeIcons = { size: 32, cols: 24, rows: 23, count: 540 }
const SHEET = pokeSheet(ICONS)
const SCALES: readonly PixelScale[] = [1, 2, 3, 4]

/** `-96px -0px` → [96, 0] */
function offset(css: string | undefined): [number, number] {
  const found = /^-?(\d+)px -?(\d+)px$/.exec(css ?? '')
  if (!found) throw new Error(`위치를 못 읽었다: ${String(css)}`)
  return [Number(found[1]), Number(found[2])]
}

describe('배율은 정수뿐이다', () => {
  it('1~4의 정수만 배율이다', () => {
    for (const k of SCALES) expect(isPixelScale(k)).toBe(true)
    for (const k of [0, 1.5, 2.2, 5, -1, Number.NaN]) expect(isPixelScale(k)).toBe(false)
  })

  it('소수 배율은 던진다 — 1.5배(교환 아이콘 48)와 2.2배(가이드맵)는 없다', () => {
    expect(() => pixelCell(SHEET, 0, 1.5 as PixelScale)).toThrow(RangeError)
    expect(() => pixelCell(SHEET, 0, 2.2 as PixelScale)).toThrow(RangeError)
    expect(() => pixelSprite(SHEET, 0, 0 as PixelScale)).toThrow(RangeError)
  })

  it('옛 픽셀 크기는 가장 가까운 정수배로 맞춘다', () => {
    expect(scaleFor(32, 32, 't')).toBe(1)
    expect(scaleFor(64, 32, 't')).toBe(2)
    expect(scaleFor(28, 32, 't')).toBe(1)
    expect(scaleFor(48, 32, 't')).toBe(2)
    expect(scaleFor(999, 32, 't')).toBe(4)
  })
})

describe('칸 상자 · 시트 · 위치가 한 배율로 움직인다', () => {
  it('칸 상자는 원본 칸 × 배율이고 시트도 같은 배율이다', () => {
    for (const k of SCALES) {
      const at = pixelCell(SHEET, 387, k)!
      expect(at.w).toBe(32 * k)
      expect(at.h).toBe(32 * k)
      expect(at.sheetW).toBe(24 * 32 * k)
      expect(at.sheetH).toBe(23 * 32 * k)
      // 모부기 387 = 16 × 24 + 3
      expect([at.x, at.y]).toEqual([3 * 32 * k, 16 * 32 * k])
    }
  })

  it('어떤 칸도 어떤 배율에서도 시트 밖으로 잘리지 않는다', () => {
    for (const k of SCALES) {
      for (let cell = 0; cell < SHEET.cols * SHEET.rows; cell++) {
        const at = pixelCell(SHEET, cell, k)!
        expect(at.x + at.w, `${String(cell)}번 ×${String(k)}`).toBeLessThanOrEqual(at.sheetW)
        expect(at.y + at.h, `${String(cell)}번 ×${String(k)}`).toBeLessThanOrEqual(at.sheetH)
        expect(at.x).toBeGreaterThanOrEqual(0)
        expect(at.y).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('위치에서 칸 번호를 거꾸로 풀면 처음 번호다 — 옆 칸의 종이 안 나온다', () => {
    for (const k of SCALES) {
      for (let cell = 0; cell < SHEET.cols * SHEET.rows; cell++) {
        const at = pixelCell(SHEET, cell, k)!
        // 칸 상자가 칸 격자에 딱 맞는다 — 어긋나면 이웃 칸이 걸친다
        expect(at.x % at.w).toBe(0)
        expect(at.y % at.h).toBe(0)
        expect((at.y / at.h) * SHEET.cols + at.x / at.w).toBe(cell)
      }
    }
  })

  it('CSS로 나가는 값도 같다 — 배경 위치가 칸 위치의 음수이고 시트 크기는 시트 × 배율이다', () => {
    for (const k of SCALES) {
      const css = pixelSprite(SHEET, 25, k)
      // 25 = 1 × 24 + 1 → 두 번째 줄 두 번째 칸
      expect(offset(css.backgroundPosition as string)).toEqual([32 * k, 32 * k])
      expect(css.backgroundSize).toBe(`${String(24 * 32 * k)}px ${String(23 * 32 * k)}px`)
      expect([css.width, css.height]).toEqual([32 * k, 32 * k])
      expect(css.imageRendering).toBe('pixelated')
    }
  })

  it('시트 밖의 번호는 빈 상자다 — 밀면 다른 포켓몬이 뜬다', () => {
    for (const cell of [-1, SHEET.cols * SHEET.rows, 1.5, Number.NaN]) {
      const css = pixelSprite(SHEET, cell, 2)
      expect(css.backgroundImage).toBeUndefined()
      expect(css.backgroundPosition).toBeUndefined()
      expect([css.width, css.height]).toEqual([64, 64])
    }
  })
})

describe('칸 사이에 틈이 있는 시트', () => {
  const sheet = startMenuIconSheet('ko')

  it('시작 메뉴 아이콘은 64×329다 — 칸 열 둘 · 줄 열 · 줄 사이 한 줄', () => {
    expect(sheetSize(sheet)).toEqual({ w: 64, h: 329 })
  })

  it('줄 r의 위치는 r × 33이고 마지막 줄도 시트 안에 든다', () => {
    for (const k of SCALES) {
      for (let row = 0; row < sheet.rows; row++) {
        for (let col = 0; col < sheet.cols; col++) {
          const at = pixelCellAt(sheet, col, row, k)!
          expect([at.x, at.y]).toEqual([col * 32 * k, row * 33 * k])
          expect(at.y + at.h).toBeLessThanOrEqual(at.sheetH)
        }
      }
    }
  })

  it('타입 · 분류 시트는 32×16 칸이 가로로 선다 (18 · 3)', () => {
    expect(sheetSize(typeIconSheet('ko'))).toEqual({ w: 32 * 18, h: 16 })
    expect(sheetSize(MOVE_CLASS_SHEET)).toEqual({ w: 32 * 3, h: 16 })
    const at = pixelCell(typeIconSheet('en'), 17, 2)!
    expect([at.w, at.h, at.x, at.y]).toEqual([64, 32, 17 * 64, 0])
  })
})

describe('시작 메뉴 아이콘의 칸 표', () => {
  it('차례가 도감0 · 포켓몬1 · 가방(남)2 · 카드3 · 리포트4 · 설정5 · 닫기6 · 채팅7 · 포기8 · 가방(여)9다', () => {
    const keys = ['pokedex', 'party', 'bag', 'trainerCard', 'save', 'options', 'exit', 'chat', 'retire'] as const
    expect(keys.map((k) => menuIconRow(k, 'boy'))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(menuIconRow('bag', 'girl')).toBe(9)
    // 가방만 남·여가 다르다
    expect(menuIconRow('party', 'girl')).toBe(1)
  })

  it('컬러가 왼쪽 열, 회색이 오른쪽 열이다', () => {
    const lit = menuIcon('options', 'boy', true)
    const dim = menuIcon('options', 'boy', false)
    expect(offset(lit.backgroundPosition as string)).toEqual([0, 5 * 33])
    expect(offset(dim.backgroundPosition as string)).toEqual([32, 5 * 33])
  })
})

describe('이름과 아이콘의 종이 같다', () => {
  /** 위치에서 칸 번호를 거꾸로 푼다 */
  function slotAt(css: { backgroundPosition?: unknown }, k: number): number {
    const [x, y] = offset(css.backgroundPosition as string)
    return (y / (32 * k)) * ICONS.cols + x / (32 * k)
  }

  it('개체의 아이콘은 iconSlot이 답한 칸이다 — 모든 배율에서', () => {
    const cases = [
      { species: 1, form: 0, isEgg: false },
      { species: 25, form: 0, isEgg: false },
      { species: 387, form: 0, isEgg: false },
      { species: 479, form: 2, isEgg: false }, // 로토무 워시 — 폼 칸
      { species: 479, form: 0, isEgg: false },
      { species: 201, form: 5, isEgg: false }, // 안농 폼
      { species: 413, form: 1, isEgg: false }, // 도롱마담 옷감
      { species: 493, form: 0, isEgg: false },
      { species: 479, form: 2, isEgg: true }, // 알은 안을 안 보여 준다
    ]
    for (const k of SCALES) {
      for (const mon of cases) {
        const want = iconSlot(mon.species, mon.form, mon.isEgg)
        expect(slotAt(monIconAt(ICONS, mon, k), k), JSON.stringify(mon)).toBe(want)
        expect(slotAt(pokeIconAt(ICONS, want, k), k)).toBe(want)
      }
    }
  })

  it('알은 안의 종과 상관없이 같은 칸(494)이다', () => {
    const egg = (species: number) => ({ species, form: 0, isEgg: true })
    expect(iconSlot(1, 0, true)).toBe(494)
    expect(slotAt(monIconAt(ICONS, egg(1), 3), 3)).toBe(slotAt(monIconAt(ICONS, egg(493), 3), 3))
  })

  it('두 모습이 다른 칸이다 — 종이 바뀌면 그림이 바뀐다', () => {
    const a = slotAt(monIconAt(ICONS, { species: 387, form: 0, isEgg: false }, 2), 2)
    const b = slotAt(monIconAt(ICONS, { species: 388, form: 0, isEgg: false }, 2), 2)
    expect(a).not.toBe(b)
  })

  it('시트 밖의 칸 번호는 빈 상자다 (540칸까지만)', () => {
    expect(pokeIconAt(ICONS, 540, 2).backgroundPosition).toBeUndefined()
    expect(pokeIconAt(ICONS, -1, 2).backgroundPosition).toBeUndefined()
    expect(pokeIconAt(undefined, 25, 2).width).toBe(64)
  })
})
