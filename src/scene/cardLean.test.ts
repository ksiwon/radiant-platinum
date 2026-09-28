import { BufferAttribute, BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { applyLean, LEAN_BACK, LEAN_HINGE, leanAngle } from './cardLean'
import { standCard } from './plates'

/** 1타일 폭 · 판 길이 2타일, 북쪽(−z)으로 45° 눕힌 판 — 연고시티 체육관의 해골몽 판 모양 */
function romPlate(): Float32Array {
  const c = Math.SQRT1_2 * 2
  return new Float32Array([
    0, 0, 0,
    1, 0, 0,
    1, c, -c,
    0, c, -c,
  ])
}

function rigged(original: Float32Array): { geometry: BufferGeometry, stood: Float32Array } {
  const stood = original.slice()
  // 법선: (1,0,0) × (0,c,−c) 방향 = (0, c, c) → 정규화
  const h = standCard(stood, [0, 1, 2, 3], [0, Math.SQRT1_2, Math.SQRT1_2])
  if (h === null) throw new Error('경첩이 없다')
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(stood.slice(), 3))
  const hinge = new Float32Array(16), back = new Float32Array(8)
  for (let i = 0; i < 4; i++) {
    hinge.set([h.ox, h.oy, h.oz, h.rest], i * 4)
    back.set([h.bx, h.bz], i * 2)
  }
  geometry.setAttribute(LEAN_HINGE, new BufferAttribute(hinge, 4))
  geometry.setAttribute(LEAN_BACK, new BufferAttribute(back, 2))
  return { geometry, stood }
}

const pos = (g: BufferGeometry): number[] =>
  [...(g.getAttribute('position').array as Float32Array)].map((v) => +v.toFixed(5))

describe('cardLean', () => {
  it('세운 판은 2타일 키로 선다', () => {
    const { stood } = rigged(romPlate())
    expect(+stood[7]!.toFixed(5)).toBe(2)
    expect(+stood[8]!.toFixed(5)).toBe(0)
  })

  it('비율 1이면 원작 정점 그대로 돌아온다 — 45°·북쪽', () => {
    const original = romPlate()
    const { geometry } = rigged(original)
    expect(applyLean(geometry, 1)).toBe(true)
    expect(pos(geometry)).toEqual([...original].map((v) => +v.toFixed(5)))
  })

  it('비율 0이면 다시 선다 — 돌린 자리에 또 돌리지 않는다', () => {
    const { geometry, stood } = rigged(romPlate())
    applyLean(geometry, 1)
    applyLean(geometry, 0.37)
    applyLean(geometry, 0)
    expect(pos(geometry)).toEqual([...stood].map((v) => +v.toFixed(5)))
  })

  it('작은 흔들림에는 버퍼를 안 올린다', () => {
    const { geometry } = rigged(romPlate())
    expect(applyLean(geometry, 0.5)).toBe(true)
    expect(applyLean(geometry, 0.5 + 1 / 1000)).toBe(false)
  })

  it('두께 옆면의 점은 판과 한 몸으로 돈다 — 경첩에서의 거리가 그대로다', () => {
    const { geometry } = rigged(romPlate())
    // 판 뒤 0.05타일에 붙은 옆면 점 하나를 덧댄다
    const p = geometry.getAttribute('position').array as Float32Array
    const withShell = new Float32Array([...p, 0.5, 1, -0.05])
    geometry.setAttribute('position', new BufferAttribute(withShell, 3))
    const hinge = geometry.getAttribute(LEAN_HINGE).array as Float32Array
    const back = geometry.getAttribute(LEAN_BACK).array as Float32Array
    geometry.setAttribute(LEAN_HINGE, new BufferAttribute(new Float32Array([...hinge, ...hinge.slice(0, 4)]), 4))
    geometry.setAttribute(LEAN_BACK, new BufferAttribute(new Float32Array([...back, ...back.slice(0, 2)]), 2))
    applyLean(geometry, 1)
    const q = geometry.getAttribute('position').array as Float32Array
    // 경첩은 x축(y=z=0)이다 — 축 성분은 그대로, 축에서의 거리도 그대로다
    expect(q[12]!).toBeCloseTo(0.5, 5)
    expect(Math.hypot(q[13]!, q[14]!)).toBeCloseTo(Math.hypot(1, 0.05), 5)
    // 뒤로(−z) 눕는다
    expect(q[14]!).toBeLessThan(-0.05)
  })

  it('보는 각 → 비율: 원작 렌즈면 1 · 수평이면 0 · 올려다보면 0', () => {
    expect(leanAngle(59.05, 59.05, 1)).toBe(1)
    expect(leanAngle(0, 59.05, 1)).toBe(0)
    expect(leanAngle(-20, 59.05, 1)).toBe(0)
    expect(leanAngle(80, 59.05, 1)).toBe(1)
    expect(leanAngle(29.525, 59.05, Math.PI / 4)).toBeCloseTo(Math.PI / 8, 9)
  })
})
