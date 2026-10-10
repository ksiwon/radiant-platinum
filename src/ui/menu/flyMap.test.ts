// 가이드맵의 지도 셈 (`flyMap.ts`) — 영역이 그림과 맞고, 이름표 표가 스물과 1:1이고, Q/E가 열린 곳만 돌고, 이동이 지도 안에 든다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATA, decodePng, withData } from '../../data/romData.testkit'
import {
  FLY_SPOTS, GRID_MAX_X, GRID_MAX_Z, GRID_MIN_X, GRID_MIN_Z, gridX, gridY, SHAPE_SIZE,
} from '../../engine/map/townMap'
import {
  CROP, LABEL_SIDE, SHEET, ZOOM, captionParts, cellBox, flyFoot, labelAnchor, labelledSpots, mapSize, markBox, panFor, stepSpot,
} from './flyMap'
import type { Spot } from './flyMap'

interface Box { l: number, t: number, r: number, b: number }
const spotOf = (spawn: number): Spot => FLY_SPOTS.find((s) => s.spawn === spawn)!

describe('이름표 앉는 쪽 표', () => {
  it('날 수 있는 스물 자리와 일대일이다', () => {
    expect(FLY_SPOTS).toHaveLength(20)
    expect(Object.keys(LABEL_SIDE).map(Number).sort((a, b) => a - b))
      .toEqual(FLY_SPOTS.map((s) => s.spawn).sort((a, b) => a - b))
    for (const side of Object.values(LABEL_SIDE)) expect(['l', 'r', 't', 'b']).toContain(side)
  })

  it('이름표의 기준점이 쪽 방향으로 표식 바깥에 선다', () => {
    for (const s of FLY_SPOTS) {
      const m = markBox(s, 3)
      const a = labelAnchor(s, 3)
      switch (LABEL_SIDE[s.spawn]) {
        case 'l': expect(a.left).toBeLessThan(m.left); break
        case 'r': expect(a.left).toBeGreaterThan(m.left + m.width); break
        case 't': expect(a.top).toBeLessThan(m.top); break
        default: expect(a.top).toBeGreaterThan(m.top + m.height)
      }
    }
  })
})

describe('Q · E — 열린 날기 자리만 돈다', () => {
  const open = [0, 1, 5, 9].map(spotOf)

  it('E는 다음 열린 자리로, Q는 앞의 열린 자리로 간다', () => {
    expect(stepSpot(open, spotOf(1), 1)).toBe(spotOf(5))
    expect(stepSpot(open, spotOf(5), -1)).toBe(spotOf(1))
  })

  it('끝에서는 반대쪽 끝으로 돌아간다', () => {
    expect(stepSpot(open, spotOf(9), 1)).toBe(spotOf(0))
    expect(stepSpot(open, spotOf(0), -1)).toBe(spotOf(9))
  })

  it('닫힌 자리는 건너뛴다 — 목록에 없는 자리로는 안 간다', () => {
    let at: Spot | null = open[0]!
    const seen = new Set<number>()
    for (let i = 0; i < 12; i++) {
      at = stepSpot(open, at, 1)
      seen.add(at!.spawn)
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 5, 9])
  })

  it('날기 자리가 아닌 칸에서는 E가 첫 자리, Q가 마지막 자리다', () => {
    expect(stepSpot(open, null, 1)).toBe(open[0])
    expect(stepSpot(open, null, -1)).toBe(open[open.length - 1])
    // 닫힌 자리에 서 있어도 같다
    expect(stepSpot(open, spotOf(12), 1)).toBe(open[0])
  })

  it('열린 곳이 없으면 아무 데도 안 간다', () => {
    expect(stepSpot([], null, 1)).toBeNull()
    expect(stepSpot([], spotOf(0), -1)).toBeNull()
  })

  it('한 자리뿐이면 제자리다', () => {
    expect(stepSpot([spotOf(0)], spotOf(0), 1)).toBe(spotOf(0))
  })
})

describe('이동(pan)과 배율', () => {
  const view = { w: 598, h: 530 }

  it('배율은 정수 3 · 4뿐이다', () => {
    expect([ZOOM.out, ZOOM.in]).toEqual([3, 4])
    expect(Number.isInteger(ZOOM.out) && Number.isInteger(ZOOM.in)).toBe(true)
  })

  it('3배 지도는 세로가 창보다 작아 가운데에 놓이고, 가로는 커서를 따라가되 끝을 안 넘는다', () => {
    const map = mapSize(ZOOM.out)
    expect(map).toEqual({ w: 648, h: 504 })
    for (let x = GRID_MIN_X; x <= GRID_MAX_X; x++) {
      const p = panFor({ x, z: 20 }, ZOOM.out, view)
      expect(p.y).toBe((view.h - map.h) / 2)
      expect(p.x).toBeLessThanOrEqual(0)
      expect(p.x).toBeGreaterThanOrEqual(view.w - map.w)
    }
  })

  it('4배 지도는 두 방향 다 창을 덮는다 — 어느 칸에서도 바다색 여백이 안 보인다', () => {
    const map = mapSize(ZOOM.in)
    for (let x = GRID_MIN_X; x <= GRID_MAX_X; x++) {
      for (let z = GRID_MIN_Z; z <= GRID_MAX_Z; z++) {
        const p = panFor({ x, z }, ZOOM.in, view)
        expect(p.x).toBeLessThanOrEqual(0)
        expect(p.x).toBeGreaterThanOrEqual(view.w - map.w)
        expect(p.y).toBeLessThanOrEqual(0)
        expect(p.y).toBeGreaterThanOrEqual(view.h - map.h)
      }
    }
  })

  it('커서 칸이 가운데 가까이 온다 (끝에 닿은 자리는 빼고)', () => {
    const p = panFor({ x: 14, z: 17 }, ZOOM.in, view)
    const cell = cellBox(14, 17, ZOOM.in)
    expect(Math.abs(cell.left + p.x + cell.width / 2 - view.w / 2)).toBeLessThanOrEqual(ZOOM.in * 3)
    expect(Math.abs(cell.top + p.y + cell.height / 2 - view.h / 2)).toBeLessThanOrEqual(ZOOM.in * 3)
  })

  it('표식 · 칸 상자는 모두 정수 px다 (도트가 번지지 않는다)', () => {
    for (const k of [ZOOM.out, ZOOM.in]) {
      for (const s of FLY_SPOTS) {
        for (const v of Object.values(markBox(s, k))) expect(Number.isInteger(v)).toBe(true)
      }
      for (const v of Object.values(cellBox(9, 16, k))) expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('표식은 영역 안에 든다 — 영역 밖의 띠로 안 나간다', () => {
    for (const k of [ZOOM.out, ZOOM.in]) {
      const map = mapSize(k)
      for (const s of FLY_SPOTS) {
        const m = markBox(s, k)
        expect(m.left).toBeGreaterThanOrEqual(0)
        expect(m.top).toBeGreaterThanOrEqual(0)
        expect(m.left + m.width).toBeLessThanOrEqual(map.w)
        expect(m.top + m.height).toBeLessThanOrEqual(map.h)
      }
    }
  })

  it('격자 한 칸 상자는 7 원본px이고 안쪽으로 1 붙는다', () => {
    const c = cellBox(3, 27, ZOOM.out)
    expect(c.width).toBe(7 * ZOOM.out)
    expect(c.left).toBe((gridX(3) - 1 - CROP.x) * ZOOM.out)
    expect(c.top).toBe((gridY(27) - 1 - CROP.y) * ZOOM.out)
    expect(SHAPE_SIZE[0]).toEqual([7, 7])
  })
})

describe('글', () => {
  it('날기 줄은 키캡 글자와 말로 갈린다', () => {
    expect(captionParts('Z · 여기로 날아간다')).toEqual({ key: 'Z', text: '여기로 날아간다' })
    expect(captionParts('날 수 있는 곳')).toEqual({ key: null, text: '날 수 있는 곳' })
    expect(captionParts('아직 가 본 적이 없다')).toEqual({ key: null, text: '아직 가 본 적이 없다' })
  })

  it('바닥 안내는 「X 닫기」이고 보기 전용은 날기를 안 말한다', () => {
    expect(flyFoot(false, false)).toBe('↑↓←→ 옮기기 · Q/E 날 수 있는 곳 · Tab 확대 · Z 날아간다 · X 닫기')
    expect(flyFoot(true, false)).toContain('Tab 전체')
    expect(flyFoot(false, true)).not.toContain('Z')
    expect(flyFoot(false, true)).toContain('X 닫기')
  })
})

withData('townMap.png')('지도 영역이 그림의 실제 띠 경계와 맞는다 (townMap.png)', () => {
  const img = decodePng(resolve(DATA, 'townMap.png'))
  const px = (x: number, y: number): string => {
    const i = (y * img.width + x) * 4
    return `${String(img.pixels[i])},${String(img.pixels[i + 1])},${String(img.pixels[i + 2])}`
  }
  const WHITE = '255,255,255'

  it('그림은 256×192다', () => {
    expect(img.width).toBe(SHEET.w)
    expect(img.height).toBe(SHEET.h)
  })

  it('영역 둘레: 왼쪽 · 오른쪽에 흰 선이 바로 붙어 있고 영역 안쪽은 흰 선이 아니다', () => {
    for (const y of [10, 60, 120, 160]) {
      expect(px(CROP.x - 1, y), `x ${String(CROP.x - 1)} · y ${String(y)}`).toBe(WHITE)
      expect(px(CROP.x + CROP.w, y), `x ${String(CROP.x + CROP.w)} · y ${String(y)}`).toBe(WHITE)
      expect(px(CROP.x, y)).not.toBe(WHITE)
      expect(px(CROP.x + CROP.w - 1, y)).not.toBe(WHITE)
    }
  })

  it('영역 아래 첫 줄부터는 이름 띠다 — 영역 마지막 줄과 색이 다르다', () => {
    for (const x of [40, 100, 160, 220]) {
      expect(px(x, CROP.y + CROP.h), `x ${String(x)}`).not.toBe(px(x, CROP.y + CROP.h - 1))
    }
  })

  it('왼쪽 위 (0,0)은 바다색(map.sea)이다 — 영역 바깥 여백이 이 색이다', () => {
    expect(px(CROP.x, CROP.y)).toBe('24,165,189')
  })
})

withData('townMap.json', 'names/locations.ko.json')('스물 자리가 다 열렸을 때 이름표 (townMap.json · locations.ko.json)', () => {
  const file = JSON.parse(readFileSync(resolve(DATA, 'townMap.json'), 'utf8')) as {
    cells: { x: number, z: number, label: number }[]
  }
  const names = JSON.parse(readFileSync(resolve(DATA, 'names/locations.ko.json'), 'utf8')) as string[]
  const nameOf = (s: Spot): string => names[file.cells.find((c) => c.x === s.x && c.z === s.z)!.label]!

  it('스물 자리 모두 칸에서 이름이 나온다', () => {
    for (const s of FLY_SPOTS) expect(nameOf(s), `spawn ${String(s.spawn)}`).not.toBe('')
  })

  // 글 폭은 어림이다(12px 굵은 한글 ≈ 12.5px/글자 + 바깥 외곽선 3px). 실제 겹침은 사람이 `pnpm shot`으로 본다.
  const hit = (a: Box, b: Box): boolean => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
  const rect = (s: Spot, k: number) => {
    const a = labelAnchor(s, k)
    const w = nameOf(s).length * 12.5 + 3
    const h = 14 + 3
    const [tx, ty] = a.transform.includes('-100%, -50%') ? [-w, -h / 2]
      : a.transform.includes('-50%, -100%') ? [-w / 2, -h]
        : a.transform.includes('-50%, 0') ? [-w / 2, 0] : [0, -h / 2]
    return { l: a.left + tx!, t: a.top + ty!, r: a.left + tx! + w, b: a.top + ty! + h }
  }

  for (const k of [ZOOM.out, ZOOM.in]) {
    it(`${String(k)}배: 이름표가 지도 영역 안에 든다`, () => {
      const map = mapSize(k)
      for (const s of FLY_SPOTS) {
        const r = rect(s, k)
        expect(r.l, `${nameOf(s)} 왼쪽`).toBeGreaterThanOrEqual(0)
        expect(r.t, `${nameOf(s)} 위`).toBeGreaterThanOrEqual(0)
        expect(r.r, `${nameOf(s)} 오른쪽`).toBeLessThanOrEqual(map.w)
        expect(r.b, `${nameOf(s)} 아래`).toBeLessThanOrEqual(map.h)
      }
    })

    it(`${String(k)}배: 이름표끼리 안 겹치고 어느 표식도 안 덮는다 (같은 이름은 하나만 붙는다)`, () => {
      const shown = labelledSpots(FLY_SPOTS, nameOf)
      for (let i = 0; i < shown.length; i++) {
        const a = shown[i]!
        for (let j = i + 1; j < shown.length; j++) {
          const b = shown[j]!
          expect(hit(rect(a, k), rect(b, k)), `${nameOf(a)}(${String(a.spawn)}) × ${nameOf(b)}(${String(b.spawn)})`).toBe(false)
        }
        for (const m of FLY_SPOTS) {
          const mb = markBox(m, k)
          const mr = { l: mb.left, t: mb.top, r: mb.left + mb.width, b: mb.top + mb.height }
          expect(hit(rect(a, k), mr), `${nameOf(a)} 이름표 × ${nameOf(m)} 표식`).toBe(false)
        }
      }
    })
  }

  it('같은 이름은 하나만 붙고 이름 없는 자리는 안 붙는다', () => {
    const shown = labelledSpots(FLY_SPOTS, nameOf)
    expect(shown).toHaveLength(FLY_SPOTS.length - 1)
    expect(shown.map((s) => s.spawn)).not.toContain(19)
    expect(labelledSpots(FLY_SPOTS, () => '')).toHaveLength(0)
  })
})
