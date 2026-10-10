// 박스 화면의 셈 (`box/boxMenus.ts`) — 격자가 벽지 안에 드는가, 아이콘이 이름과 같은 마리인가, 채움 수가 실제 칸 수인가.
//
// 사용자 지적 ②③ (DECISIONS 10-10)의 합격 조건이다: 6×5 칸이 벽지 안에 다 들고(밖으로 나가는 픽셀 0), 박스 개수는 실제 칸
// 수이며, 파티 아이콘은 `pixelSprite`로만 잘라 이름과 같은 종이다.
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATA, decodePng, withData } from '../../../data/romData.testkit'
import type { PokeIcons } from '../../../data/schema'
import { BOX_COLS, BOX_ROWS, BOX_SIZE, countInBox, emptyBoxes } from '../../../engine/pokemon/boxes'
import { ICON_SLOTS, SPECIES_EGG, iconSlot } from '../../../engine/pokemon/form'
import type { PokemonInstance } from '../../../engine/pokemon/instance'
import { noOrigin } from '../../../engine/pokemon/origin'
import { PIXEL } from '../../theme/scale'
import {
  GRID, LIFT, PARTY_SCALE, boxFoot, boxNote, compareBar, filled, filmCells, fitGrid, gridOverflow, iconCellIsolated, iconOf,
  liftOf, nameOfMon, occupancyDots, partyEntry, ringAt, ringSize, slotAt,
} from './boxMenus'
import { PARTY_BAR_OUTER, PARTY_CELL, WALL, WALL_PX } from './wallGeometry'

const mon = (over: Partial<PokemonInstance> = {}): PokemonInstance => ({
  species: 387, pid: 1, nickname: null, exp: 0, level: 5,
  ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  moves: [], hp: 20, status: 'ok', statusTurns: 0, heldItem: 0,
  friendship: 70, isEgg: false, otId: 0, otSecretId: 0, ball: 0,
  origin: noOrigin({ name: '', gender: 'male' }),
  form: 0, pokerus: 0, mail: null,
  ...over,
})

const ICONS: PokeIcons = { size: 32, cols: 24, rows: 23, count: 540 }

describe('격자는 벽지 안쪽에 다 든다', () => {
  const inner = WALL_PX.inner

  it('벽지는 정수 3배(504×480)이고 안쪽이 그 안에 있다', () => {
    expect(WALL.k).toBe(3)
    expect(WALL_PX.w).toBe(504)
    expect(WALL_PX.h).toBe(480)
    expect(inner.x).toBeGreaterThan(0)
    expect(inner.y).toBeGreaterThan(0)
    expect(inner.x + inner.w).toBeLessThanOrEqual(WALL_PX.w)
    expect(inner.y + inner.h).toBeLessThanOrEqual(WALL_PX.h)
  })

  it('원작 값(96px)은 안쪽에 안 들어가서 한 단 낮춘 2배(64px)다', () => {
    // 3배로 하면 칸 간격 72에서 맨 아랫줄이 안쪽 아래로 나간다 — 한때 12px 삐져나왔다
    expect(GRID.scale).toBe(PIXEL.x2)
    expect(GRID.icon).toBe(64)
  })

  it('쉬는 아이콘 · 위아래로 뛴 아이콘 · 맨 가장자리 커서 원이 안쪽 밖으로 한 픽셀도 안 나간다', () => {
    expect(gridOverflow(GRID, inner)).toBeLessThanOrEqual(0)
  })

  it('서른 칸 모두 아이콘 상자가 벽지 안쪽 안에 든다 (칸마다 잰다)', () => {
    for (let i = 0; i < BOX_SIZE; i++) {
      const at = slotAt(GRID, i)
      expect(at.left, `칸 ${String(i)} 왼쪽`).toBeGreaterThanOrEqual(inner.x)
      expect(at.top, `칸 ${String(i)} 위`).toBeGreaterThanOrEqual(inner.y)
      expect(at.left + GRID.icon, `칸 ${String(i)} 오른쪽`).toBeLessThanOrEqual(inner.x + inner.w)
      expect(at.top + GRID.icon, `칸 ${String(i)} 아래`).toBeLessThanOrEqual(inner.y + inner.h)
      // 커서 원도 안쪽 안이다 (금 고리 2px 포함)
      const ring = ringAt(GRID, i)
      expect(ring.left - 2).toBeGreaterThanOrEqual(inner.x)
      expect(ring.top - 2).toBeGreaterThanOrEqual(inner.y)
      expect(ring.left + ringSize(GRID) + 2).toBeLessThanOrEqual(inner.x + inner.w)
      expect(ring.top + ringSize(GRID) + 2).toBeLessThanOrEqual(inner.y + inner.h)
    }
  })

  it('들어 올린 아이콘은 어느 칸에서도 벽지 틀(안쪽 위 끝)을 안 넘는다 — 맨 윗줄은 덜 든다', () => {
    for (let i = 0; i < BOX_SIZE; i++) {
      const lift = liftOf(GRID, i)
      expect(lift, `칸 ${String(i)}`).toBeLessThanOrEqual(LIFT)
      expect(slotAt(GRID, i).top - lift, `칸 ${String(i)} 위`).toBeGreaterThanOrEqual(inner.y)
    }
    // 아랫줄은 그대로 14px 든다
    expect(liftOf(GRID, BOX_SIZE - 1)).toBe(LIFT)
  })

  it('칸은 6열 5줄이고 정수 위치다', () => {
    expect(BOX_COLS * BOX_ROWS).toBe(BOX_SIZE)
    expect(Number.isInteger(GRID.left) && Number.isInteger(GRID.top) && Number.isInteger(GRID.pitch)).toBe(true)
  })

  it('안쪽이 넓으면 더 큰 정수 배율을 고르고, 좁으면 한 단씩 낮춘다', () => {
    const wide = fitGrid({ x: 0, y: 0, w: 1200, h: 1000 })
    // 칸 간격은 원작 값(72)을 안 넘기므로 4배(128px)는 아이콘이 4분의 1보다 더 겹쳐서 3배까지다
    expect(wide.scale).toBe(PIXEL.x3)
    expect(gridOverflow(wide, { x: 0, y: 0, w: 1200, h: 1000 })).toBeLessThanOrEqual(0)
    const tight = { x: 0, y: 0, w: 300, h: 220 }
    const small = fitGrid(tight)
    expect(small.scale).toBe(PIXEL.x1)
    expect(gridOverflow(small, tight)).toBeLessThanOrEqual(0)
    // 어느 크기에서도 배율은 1~4의 정수다
    for (const h of [180, 220, 280, 354, 420, 560, 700]) {
      const box = { x: 0, y: 0, w: 474, h }
      expect(Object.values(PIXEL)).toContain(fitGrid(box).scale)
    }
  })
})

withData('boxWallpapers.png')('벽지 그림을 재 본 값 (boxWallpapers.png)', () => {
  const sheet = decodePng(resolve(DATA, 'boxWallpapers.png'))
  const at = (wall: number, x: number, y: number): string => {
    const px = ((Math.floor(wall / 8) * WALL.h + y) * sheet.width + (wall % 8) * WALL.w + x) * 4
    return `${String(sheet.pixels[px])},${String(sheet.pixels[px + 1])},${String(sheet.pixels[px + 2])}`
  }
  const FRAME = '115,115,132'

  it('벽지 한 장은 168×160이고 시트가 8×4칸이다', () => {
    expect(sheet.width).toBe(8 * WALL.w)
    expect(sheet.height).toBe(4 * WALL.h)
  })

  it('서른두 장 모두 어두운 틀이 안쪽 값(inner)의 둘레를 두른다', () => {
    for (let wall = 0; wall < 32; wall++) {
      // 틀 안쪽 첫 칸 — 왼쪽 · 위 · 오른쪽 · 아래는 틀의 바로 바깥 줄이다
      expect(at(wall, WALL.inner.x - 1, 100), `벽지 ${String(wall)} 왼쪽 틀`).toBe(FRAME)
      expect(at(wall, WALL.inner.x + WALL.inner.w, 100), `벽지 ${String(wall)} 오른쪽 틀`).toBe(FRAME)
      expect(at(wall, 84, WALL.inner.y - 1), `벽지 ${String(wall)} 위 틀`).toBe(FRAME)
      expect(at(wall, 84, WALL.inner.y + WALL.inner.h), `벽지 ${String(wall)} 아래 틀`).toBe(FRAME)
      // 안쪽 첫 줄은 틀이 아니다
      expect(at(wall, WALL.inner.x, 100)).not.toBe(FRAME)
      expect(at(wall, 84, WALL.inner.y)).not.toBe(FRAME)
    }
  })

  it('이름 띠는 x 26~141 · y 9~31의 틀이다', () => {
    for (const wall of [0, 7, 31]) {
      expect(at(wall, WALL.banner.x, 20)).toBe(FRAME)
      expect(at(wall, WALL.banner.x + WALL.banner.w - 1, 20)).toBe(FRAME)
      expect(at(wall, 84, WALL.banner.y)).toBe(FRAME)
      expect(at(wall, 84, WALL.banner.y + WALL.banner.h - 1)).toBe(FRAME)
    }
  })
})

describe('아이콘은 이름과 같은 종이다 (사용자 지적 ③)', () => {
  it('칸 번호는 이름을 구한 그 개체에서 나온다 — 폼 없는 종은 종족 번호 그대로다', () => {
    const names: string[] = []
    for (let species = 1; species <= 493; species++) names[species] = `종${String(species)}`
    for (let species = 1; species <= 493; species++) {
      const entry = partyEntry(mon({ species }), names)
      expect(entry.name, `종 ${String(species)} 이름`).toBe(`종${String(species)}`)
      expect(entry.slot, `종 ${String(species)} 칸`).toBe(iconSlot(species, 0, false))
      expect(iconOf(mon({ species }))).toBe(entry.slot)
    }
    // 폼이 없는 종 — 그 종의 번호가 곧 칸이다 (이름에 쓴 번호와 같다)
    expect(partyEntry(mon({ species: 448 }), names).slot).toBe(448)
  })

  it('알은 알 칸과 「알」 이름이다 — 속의 종이 새지 않는다', () => {
    const names = ['', ...Array.from({ length: 600 }, (_, i) => `종${String(i + 1)}`)]
    names[SPECIES_EGG] = '알'
    const egg = partyEntry(mon({ species: 448, isEgg: true }), names)
    expect(egg.slot).toBe(SPECIES_EGG)
    expect(egg.name).toBe('알')
    // 별명이 있는 알도 「알」이다
    expect(nameOfMon(mon({ species: 448, isEgg: true, nickname: '비밀' }), names)).toBe('알')
  })

  it('별명이 있으면 별명이고 칸은 그대로 종 칸이다', () => {
    const names = ['', '이상해씨']
    expect(nameOfMon(mon({ species: 1, nickname: '풀돌이' }), names)).toBe('풀돌이')
    expect(partyEntry(mon({ species: 1, nickname: '풀돌이' }), names).slot).toBe(1)
  })

  it('아이콘 칸은 시트 안에서 이웃 칸과 안 겹친다 — 540칸 전부 상자는 원본 칸 × 배율이다', () => {
    for (const scale of Object.values(PIXEL)) {
      for (let slot = 0; slot < ICON_SLOTS; slot++) {
        expect(iconCellIsolated(ICONS, slot, scale), `칸 ${String(slot)} × ${String(scale)}`).toBe(true)
      }
    }
    // 시트 밖은 칸이 아니다 — 밀어서 다른 마리가 뜨지 않는다
    expect(iconCellIsolated(ICONS, ICON_SLOTS, PARTY_SCALE)).toBe(false)
    expect(iconCellIsolated(ICONS, -1, PARTY_SCALE)).toBe(false)
  })

  it('파티 칸의 세로 구성이 칸 높이 안에 든다 — 아이콘이 이름 · 막대와 겹치지 않는다', () => {
    const c = PARTY_CELL
    expect(c.icon).toBe(32 * PARTY_SCALE)
    expect(c.top + c.icon + c.gap + c.name + c.gap + PARTY_BAR_OUTER + c.bottom).toBeLessThanOrEqual(c.height)
    // 뛰는 폭(위로 3 × 배율)이 위 여백을 넘지 않는다
    expect(3 * PARTY_SCALE).toBeLessThanOrEqual(c.top)
  })
})

describe('박스 개수는 실제 칸 수다 (사용자 지적 ②)', () => {
  const boxes = emptyBoxes()
  boxes[0]![3] = mon()
  boxes[0]![29] = mon({ species: 448 })
  boxes[2]![0] = mon()

  it('채움 수는 칸을 센 값이다', () => {
    expect(filled(boxes, 0)).toBe(2)
    expect(filled(boxes, 0)).toBe(countInBox(boxes, 0))
    expect(filled(boxes, 1)).toBe(0)
  })

  it('필름 띠 칸과 점유 점이 같은 수를 센다', () => {
    const cells = filmCells(boxes, 18)
    expect(cells).toHaveLength(18)
    expect(cells[0]).toMatchObject({ count: 2, empty: false, full: false })
    expect(cells[0]!.fill).toBeCloseTo(2 / BOX_SIZE)
    expect(cells[1]).toMatchObject({ count: 0, empty: true })
    expect(occupancyDots(boxes[0]!, null).filter((d) => d.filled)).toHaveLength(2)
    expect(occupancyDots(boxes[0]!, 3).filter((d) => d.here)).toEqual([{ filled: true, here: true }])
    expect(occupancyDots(boxes[0]!, null)).toHaveLength(BOX_SIZE)
  })

  it('가득 찬 박스는 full이다', () => {
    const full = emptyBoxes()
    full[5] = full[5]!.map(() => mon())
    expect(filmCells(full, 18)[5]).toMatchObject({ count: BOX_SIZE, full: true, fill: 1 })
  })

  it('머리 한 줄은 지금 박스의 실제 수 · 전체 · 파티다', () => {
    expect(boxNote(2, 3, 4, 6, 540)).toBe('박스 2/30 · 전체 3/540 · 파티 4/6')
  })
})

describe('바닥 안내와 비교 막대', () => {
  const base = { say: false, menu: false, mode: 2, held: false, heldItem: false, comparePage: '능력치' }
  const modes = { compare: 4, items: 3 }

  it('지금 문장 그대로다 — 낱말만 「X 닫기」로 모였다', () => {
    expect(boxFoot(base, modes)).toBe('↑↓←→ 고르기 · Z 메뉴 · Tab 파티/박스 · Q/E 박스 · X 닫기')
    expect(boxFoot({ ...base, held: true }, modes)).toBe('↑↓←→ 옮기기 · Z 놓기 · Q/E 박스 · X 되돌리기')
    expect(boxFoot({ ...base, say: true }, modes)).toBe('Z 다음')
    expect(boxFoot({ ...base, menu: true }, modes)).toBe('↑↓ 고르기 · Z 결정 · X 그만둔다')
    expect(boxFoot({ ...base, mode: 4 }, modes)).toBe('↑↓←→ 고르기 · Z 올린다/내린다 · Tab 능력치 · X 닫기')
    expect(boxFoot({ ...base, mode: 3, heldItem: true }, modes)).toContain('X 도구 돌려놓기')
  })

  it('비교 막대는 같은 기준에 맞춘다', () => {
    expect(compareBar(150, 150)).toBe(1)
    expect(compareBar(75, 150)).toBe(0.5)
    expect(compareBar(10, 0)).toBe(0)
    expect(compareBar(999, 150)).toBe(1)
  })
})
