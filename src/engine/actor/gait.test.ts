// 보행 사이클 검증.
//
// 걷는 모습이 "맞는지"는 눈으로만 판단할 수 있지만, 물리적으로 틀린 것들은
// 숫자로 잡힌다: 양다리가 같은 위상이면 깡충거리고, 무릎이 반대로 꺾이면
// 관절이 뒤집히고, 위상 속도가 속도에 안 묶이면 발이 미끄러진다.
import { describe, it, expect } from 'vitest'
import { phaseRate, sampleGait, idleBreath, STRIDE_LENGTH } from './gait'

const TWO_PI = Math.PI * 2

describe('위상 속도', () => {
  it('보폭에서 유도된다 — 속도 × 시간 = 걸음 수 × 보폭', () => {
    const speed = 4.5
    const seconds = 10
    const cycles = (phaseRate(speed) * seconds) / TWO_PI
    // 한 사이클이 두 걸음이다
    const distance = cycles * 2 * STRIDE_LENGTH
    expect(distance).toBeCloseTo(speed * seconds, 6)
  })

  it('정지하면 위상이 멈춘다 — 제자리걸음이 나오지 않는다', () => {
    expect(phaseRate(0)).toBe(0)
  })

  it('속도에 비례한다', () => {
    expect(phaseRate(9)).toBeCloseTo(phaseRate(4.5) * 2, 6)
  })
})

describe('보행 사이클', () => {
  it('양다리가 정확히 반주기 어긋난다 — 같으면 깡충거린다', () => {
    for (const p of [0, 0.7, 1.9, 3.3, 5.1]) {
      const a = sampleGait(p, 1, 0)
      const b = sampleGait(p + Math.PI, 1, 0)
      expect(a.thighL).toBeCloseTo(b.thighR, 10)
      expect(a.thighR).toBeCloseTo(b.thighL, 10)
    }
  })

  it('팔은 같은 쪽 다리와 반대로 흔들린다', () => {
    for (const p of [0.4, 1.2, 2.8, 4.6]) {
      const g = sampleGait(p, 1, 0)
      expect(Math.sign(g.armL)).toBe(-Math.sign(g.thighL))
      expect(Math.sign(g.armR)).toBe(-Math.sign(g.thighR))
    }
  })

  it('무릎은 한 방향으로만 접힌다 — 음수면 관절이 뒤집힌 것이다', () => {
    for (let p = 0; p < TWO_PI; p += 0.05) {
      const g = sampleGait(p, 1, 1)
      expect(g.kneeL, `phase ${p.toFixed(2)}`).toBeGreaterThanOrEqual(0)
      expect(g.kneeR, `phase ${p.toFixed(2)}`).toBeGreaterThanOrEqual(0)
      expect(g.forearmL).toBeGreaterThanOrEqual(0)
      expect(g.forearmR).toBeGreaterThanOrEqual(0)
    }
  })

  it('골반은 내려가기만 한다 — 발이 지면을 뚫고 뜨지 않는다', () => {
    for (let p = 0; p < TWO_PI; p += 0.05) {
      expect(sampleGait(p, 1, 0).bob).toBeLessThanOrEqual(0)
    }
  })

  it('정지하면 스윙이 사라진다', () => {
    const g = sampleGait(1.3, 0, 0)
    for (const v of [g.thighL, g.thighR, g.kneeL, g.kneeR, g.armL, g.armR, g.torsoYaw, g.bob]) {
      expect(v).toBeCloseTo(0, 10)
    }
  })

  it('팔 내림은 이동과 무관하다 — 서 있어도 T포즈로 돌아가지 않는다', () => {
    expect(sampleGait(0, 0, 0).armDrop).toBeGreaterThan(1)
    expect(sampleGait(2, 1, 1).armDrop).toBe(sampleGait(0, 0, 0).armDrop)
  })

  it('달리면 진폭이 커진다', () => {
    const peak = (run: number) => {
      let max = 0
      for (let p = 0; p < TWO_PI; p += 0.02) max = Math.max(max, Math.abs(sampleGait(p, 1, run).thighL))
      return max
    }
    expect(peak(1)).toBeGreaterThan(peak(0))
  })

  it('moving·run은 범위 밖 값을 넣어도 안전하다', () => {
    const g = sampleGait(1, 5, -3)
    expect(Number.isFinite(g.thighL)).toBe(true)
    expect(g.kneeL).toBeGreaterThanOrEqual(0)
  })
})

describe('정지 호흡', () => {
  it('이동 중에는 잦아든다', () => {
    let movingMax = 0, idleMax = 0
    for (let t = 0; t < 10; t += 0.05) {
      movingMax = Math.max(movingMax, Math.abs(idleBreath(t, 1)))
      idleMax = Math.max(idleMax, Math.abs(idleBreath(t, 0)))
    }
    expect(movingMax).toBeCloseTo(0, 10)
    expect(idleMax).toBeGreaterThan(0.01)
  })
})
