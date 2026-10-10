import { describe, expect, it } from 'vitest'
import { EGG_SCALE, EGG_SPOTS, eggColors } from './cinematicEgg'

/** 알 한 알의 대강 — 중심에서 같은 거리의 점 여섯 */
function ring(): Float32Array {
  const pts: number[] = []
  for (const [x, y, z] of [[0, 0, 1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, -1]]) pts.push(x!, y!, z!)
  return new Float32Array(pts)
}

describe('알 정점 색', () => {
  it('정점마다 세 값을 낸다', () => {
    expect(eggColors(ring(), [0, 0, 0])).toHaveLength(6 * 3)
  })

  it('얼룩에서 먼 쪽은 바탕 크림이다', () => {
    const colors = eggColors(ring(), [0, 0, 0])
    // 뒤(0,0,-1) — 얼룩이 다 앞쪽(+z)에 있다. 크림은 빨강이 가장 크고 파랑이 가장 작다
    const back = [colors[15]!, colors[16]!, colors[17]!]
    expect(back[0]).toBeGreaterThan(back[1]!)
    expect(back[1]).toBeGreaterThan(back[2]!)
  })

  it('얼룩 한가운데는 바탕과 다르다', () => {
    const [spot] = EGG_SPOTS
    const len = Math.hypot(...spot!.dir)
    const at = new Float32Array(spot!.dir.map((v) => v / len))
    const away = new Float32Array([0, 0, -1])
    expect([...eggColors(at, [0, 0, 0])]).not.toEqual([...eggColors(away, [0, 0, 0])])
  })

  it('예전 도형 알과 같은 키로 선다', () => {
    // 모델 키 0.785(-0.376 ~ 0.410) × 배율 = 예전 도형 알 높이 1.77 안팎
    expect(0.785 * EGG_SCALE).toBeGreaterThan(1.6)
    expect(0.785 * EGG_SCALE).toBeLessThan(1.9)
  })
})
