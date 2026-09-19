// 바위 그림 (FIRST_PERSON §6.3).
import { describe, expect, it } from 'vitest'
import { rockCrop, rockUvs } from './rockPaint'
import { rockPositions, ROCK_RECIPES } from './rockShape'
import type { TexSheet } from './chunkMesh'

/** 가운데만 불투명한 8×8 한 장 */
function sheet(): TexSheet {
  const w = 8, h = 8
  const pixels = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const inside = x >= 2 && x <= 5 && y >= 1 && y <= 6
      pixels[o] = inside ? 120 + x * 4 : 0
      pixels[o + 1] = inside ? 110 : 0
      pixels[o + 2] = inside ? 100 : 0
      pixels[o + 3] = inside ? 255 : 0
    }
  }
  return { width: w, height: h, items: [], pixels }
}

const ITEM = { x: 0, y: 0, w: 8, h: 8 }

describe('그림 칸 잘라 오기', () => {
  it('실루엣 비율을 메우기 전에 센다', () => {
    const crop = rockCrop(sheet(), ITEM, 0, 1, 0, 1)!
    expect(crop.width).toBe(8)
    expect(crop.height).toBe(8)
    // 불투명한 줄 여섯 / 여덟, 칸 넷 / 여덟
    expect(crop.rows).toBeCloseTo(6 / 8, 6)
    expect(crop.cols).toBeCloseTo(4 / 8, 6)
  })

  it('투명 여백을 이웃 색으로 메운다 — 구멍도 얼룩도 안 생긴다', () => {
    const crop = rockCrop(sheet(), ITEM, 0, 1, 0, 1)!
    for (let i = 0; i < crop.width * crop.height; i++) {
      expect(crop.pixels[i * 4 + 3], `${String(i)}번 텍셀이 아직 투명하다`).toBe(255)
      // 검정으로 안 남는다 — 이웃한 바위 색을 물려받는다
      expect(crop.pixels[i * 4]! + crop.pixels[i * 4 + 1]! + crop.pixels[i * 4 + 2]!)
        .toBeGreaterThan(0)
    }
  })

  it('칸 안의 자리를 주면 그만큼만 잘라 온다', () => {
    const crop = rockCrop(sheet(), ITEM, 0.25, 0.75, 0, 1)!
    expect(crop.width).toBe(4)
  })

  it('불투명한 텍셀이 없으면 안 만든다', () => {
    const blank = sheet()
    blank.pixels.fill(0)
    expect(rockCrop(blank, ITEM, 0, 1, 0, 1)).toBeNull()
  })
})

describe('UV', () => {
  const pos = rockPositions(ROCK_RECIPES[0]!, 0.42, 0.1)
  const uv = rockUvs(pos, 0.42)

  it('정점마다 하나씩 나온다', () => {
    expect(uv.length).toBe((pos.length / 3) * 2)
  })

  it('전부 그림 안에 든다', () => {
    for (let i = 0; i < uv.length; i++) {
      expect(uv[i]!, `${String(i)}`).toBeGreaterThanOrEqual(0)
      expect(uv[i]!, `${String(i)}`).toBeLessThanOrEqual(1)
    }
  })

  it('앞면은 그림 전체를, 옆·뒤는 가운데 조각을 쓴다', () => {
    let wide = 0, inner = 0
    for (let i = 0; i < uv.length; i += 2) {
      if (uv[i]! < 0.28 || uv[i]! > 0.72) wide++
      else inner++
    }
    expect(wide, '그림 전체를 쓰는 면이 없다').toBeGreaterThan(0)
    expect(inner, '가운데 조각을 쓰는 면이 없다').toBeGreaterThan(0)
  })

  it('한 면 안에서 UV가 안 뭉친다 — 한 줄이 늘어나면 그렇게 된다', () => {
    let flat = 0
    for (let t = 0; t + 5 < uv.length; t += 6) {
      const du = Math.max(uv[t]!, uv[t + 2]!, uv[t + 4]!) - Math.min(uv[t]!, uv[t + 2]!, uv[t + 4]!)
      const dv = Math.max(uv[t + 1]!, uv[t + 3]!, uv[t + 5]!)
        - Math.min(uv[t + 1]!, uv[t + 3]!, uv[t + 5]!)
      if (du < 1e-6 && dv < 1e-6) flat++
    }
    expect(flat).toBe(0)
  })
})
