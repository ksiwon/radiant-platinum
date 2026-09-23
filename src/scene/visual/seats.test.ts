// 바닥에 눕혀 그린 방석·의자 (파일럿 보고 ⑥ · `seats.propSeat`)
import { describe, expect, it } from 'vitest'
import { propSeat, seatBands } from './seats'
import { VISUAL_RECIPES } from './recipes'
import { withData } from '../../data/romData.testkit'

const load = async (id: number) => {
  const { loadPropMesh, loadPropSheet } = await import('../chunkMesh')
  const { installNodeAssets } = await import('../../data/romData.testkit')
  installNodeAssets()
  return { mesh: await loadPropMesh(id), sheet: await loadPropSheet(id) }
}

describe('그림 줄 가르기', () => {
  // 방석 그림의 뼈대 — 테두리 1 · 윗면(밝음) · 옆 띠(어두움) · 테두리
  const O = 0x636363, TOP = 0xffe75a, SIDE = 0xce8c42
  const px = (c: number, r: number) => {
    if (c < 1 || c > 14 || r < 1 || r > 14) return { rgb: 0, a: 0 }
    if (r === 1 || r === 14 || c === 1 || c === 14) return { rgb: O, a: 255 }
    return { rgb: r >= 10 ? SIDE : TOP, a: 255 }
  }

  it('윗면 · 옆 띠를 가르고 다리가 없다', () => {
    const b = seatBands(16, 16, px)!
    expect(b).not.toBeNull()
    expect([b.sideFrom, b.legFrom]).toEqual([10, 14])
    expect(b.legs).toEqual([])
    // 윗면 8줄 ÷ 안쪽 폭 12열
    expect(b.sin).toBeCloseTo(8 / 12)
  })

  it('윗면이 폭보다 깊으면 3/4 그림이 아니다 — 안 가른다', () => {
    // 같은 줄 배치에 폭만 6열(안쪽 4열) — 윗면 8줄이 폭보다 깊다
    const narrow = (c: number, r: number) => (c < 5 || c > 10 ? { rgb: 0, a: 0 }
      : r === 1 || r === 14 || c === 5 || c === 10 ? { rgb: O, a: 255 }
        : r >= 1 && r <= 14 ? { rgb: r >= 10 ? SIDE : TOP, a: 255 } : { rgb: 0, a: 0 })
    expect(seatBands(16, 16, narrow)).toBeNull()
  })
})

withData(
  'props/index.json', 'props/117.bin', 'props/118.bin', 'props/92.bin', 'props/138.bin', 'props/139.bin', 'props/140.bin',
  'props/117.png', 'props/118.png', 'props/92.png', 'props/138.png', 'props/139.png', 'props/140.png',
)('실제 자료 — 방석 둘과 의자 넷', () => {
  for (const id of [117, 118]) {
    it(`방석 ${String(id)} — 낮은 덩이 하나 (높이 0.34칸)`, async () => {
      const { mesh, sheet } = await load(id)
      const made = propSeat(mesh, sheet, id, VISUAL_RECIPES, 'candidate')
      expect(made, '방석을 못 세웠다').not.toBeNull()
      expect(made!.shape).toBe('cushion')
      // 띠 4줄 ÷ cos θ (sin θ = 8/12) × 한 텍셀 1/16칸
      expect(made!.height).toBeCloseTo(4 / 16 / Math.sqrt(1 - (8 / 12) ** 2), 3)
      // 판 하나(삼각형 둘)를 맡는다 — 방석 모델에는 그것뿐이다
      expect(made!.claims.size).toBe(2)
      // 윗면 1 + 옆 4
      expect(made!.geometry.getAttribute('position').count).toBe(5 * 6)
    })
  }

  for (const id of [92, 138, 139, 140]) {
    it(`의자 ${String(id)} — 앉는 판과 다리 넷, 그림자 판은 둔다`, async () => {
      const { mesh, sheet } = await load(id)
      const made = propSeat(mesh, sheet, id, VISUAL_RECIPES, 'candidate')
      expect(made, '의자를 못 세웠다').not.toBeNull()
      expect(made!.shape).toBe('stool')
      // 그림 판(재질 0)의 삼각형 둘만 맡는다 — 그림자 판(재질 1)은 안 건드린다
      expect(made!.claims.size).toBe(2)
      expect([...made!.claims.keys()].every((o) => o < mesh.groups[0]![2])).toBe(true)
      // 판(윗면 1 + 옆 4 + 밑 1) + 다리 넷 × 옆 4
      expect(made!.geometry.getAttribute('position').count).toBe((6 + 16) * 6)
      // 원래 판이 있던 타일 안에만 선다
      const p = made!.geometry.getAttribute('position')
      for (let i = 0; i < p.count; i++) {
        expect(Math.abs(p.getX(i))).toBeLessThanOrEqual(0.5 + 1e-6)
        expect(Math.abs(p.getZ(i))).toBeLessThanOrEqual(0.5 + 1e-6)
        expect(p.getY(i)).toBeGreaterThanOrEqual(-1e-6)
      }
    })
  }

  it('chair01은 앉는 판 위가 0.44칸이다 — 띠 3줄 + 다리 2줄을 cos θ로 편 값', async () => {
    const { mesh, sheet } = await load(92)
    const made = propSeat(mesh, sheet, 92, VISUAL_RECIPES, 'candidate')!
    // 윗면 7줄 ÷ 안쪽 폭 10열
    expect(made.height).toBeCloseTo(5 / 16 / Math.sqrt(1 - 0.7 ** 2), 3)
  })

  it('검수됐다 — 기본 게임(verified)에서 선다 · legacy에서는 안 선다', async () => {
    const { mesh, sheet } = await load(117)
    expect(propSeat(mesh, sheet, 117, VISUAL_RECIPES, 'verified')).not.toBeNull()
    expect(propSeat(mesh, sheet, 117, VISUAL_RECIPES, 'legacy')).toBeNull()
  })
})
