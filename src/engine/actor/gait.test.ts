// 보행 사이클 검증.
//
// 걷는 모습이 "맞는지"는 눈으로만 판단할 수 있지만, 물리적으로 틀린 것들은
// 숫자로 잡힌다: 양다리가 같은 위상이면 깡충거리고, 무릎이 반대로 꺾이면
// 관절이 뒤집히고, 위상 속도가 속도에 안 묶이면 발이 미끄러진다.
import { describe, it, expect } from 'vitest'
import { phaseRate, sampleGait, idleBreath, strideLength, STRIDE_LENGTH, hopGait } from './gait'

const TWO_PI = Math.PI * 2

/** 넓적다리 각이 sin(p)이고 양수가 앞이므로 접지는 π/2, 이탈은 3π/2다 */
const CONTACT = Math.PI / 2
const MID_STANCE = Math.PI
const TOE_OFF = (3 * Math.PI) / 2
const MID_SWING = 0

describe('위상 속도', () => {
  it('보폭에서 유도된다 — 속도 × 시간 = 걸음 수 × 보폭', () => {
    const speed = 4.5
    const seconds = 10
    const cycles = (phaseRate(speed) * seconds) / TWO_PI
    // 한 사이클이 두 걸음이다
    const distance = cycles * 2 * STRIDE_LENGTH
    expect(distance).toBeCloseTo(speed * seconds, 6)
  })

  it('달릴 때도 보폭에서 유도된다 — 진폭만 키우면 발이 미끄러진다', () => {
    const speed = 8
    const cycles = phaseRate(speed, 1) / TWO_PI
    expect(cycles * 2 * strideLength(1)).toBeCloseTo(speed, 6)
  })

  it('보폭이 넓적다리 진폭과 함께 늘어난다', () => {
    expect(strideLength(1) / strideLength(0)).toBeCloseTo(
      Math.abs(sampleGait(CONTACT, 1, 1).thighL / sampleGait(CONTACT, 1, 0).thighL), 6,
    )
  })

  it('달리기 회전수가 사람 범위 안에 있다', () => {
    // 보폭을 걷기 값에 고정하면 8m/s에서 초당 9.4걸음이 나온다. 그렇게 뛰는 사람은 없다
    const stepsPerSecond = (2 * phaseRate(8, 1)) / TWO_PI
    expect(stepsPerSecond).toBeGreaterThan(4)
    expect(stepsPerSecond).toBeLessThan(6.5)
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

  it('무릎이 완전히 펴지는 순간이 없다 — 락되면 죽마를 짚은 것처럼 보인다', () => {
    for (let p = 0; p < TWO_PI; p += 0.05) {
      expect(sampleGait(p, 1, 1).kneeL, `phase ${p.toFixed(2)}`).toBeGreaterThan(0.1)
      expect(sampleGait(p, 1, 0).kneeL, `phase ${p.toFixed(2)}`).toBeGreaterThan(0.1)
    }
  })

  it('유각기에 입각기보다 훨씬 많이 접힌다 — 두 굽힘의 크기가 다르다', () => {
    for (const run of [0, 1]) {
      const swing = sampleGait(MID_SWING, 1, run).kneeL
      const stance = sampleGait(MID_STANCE, 1, run).kneeL
      expect(swing / stance, `run=${run}`).toBeGreaterThan(2.5)
      // 그래도 입각기 흡수는 있어야 한다 — 없으면 뻣뻣하게 착지한다
      expect(stance, `run=${run}`).toBeGreaterThan(0.2)
    }
  })

  it('달릴 때 무릎이 90°를 넘게 접힌다 — 다리를 쭉 편 채 벌리지 않는다', () => {
    expect(sampleGait(MID_SWING, 1, 1).kneeL).toBeGreaterThan(Math.PI / 2)
  })

  it('접지·이탈 순간에는 다리가 거의 펴져 있다', () => {
    expect(sampleGait(CONTACT, 1, 0).kneeL).toBeLessThan(0.4)
    expect(sampleGait(TOE_OFF, 1, 0).kneeL).toBeLessThan(0.4)
  })

  it('팔꿈치는 앞으로 나올 때 더 접힌다', () => {
    // armL은 sOpp 위상이라 이탈(3π/2)에서 최대 전방이다
    expect(sampleGait(TOE_OFF, 1, 1).armL).toBeGreaterThan(0)
    expect(sampleGait(TOE_OFF, 1, 1).forearmL).toBeGreaterThan(sampleGait(CONTACT, 1, 1).forearmL)
  })

  it('달릴 때 팔꿈치가 60°를 넘게 접힌다 — 팔을 쭉 펴고 뛰지 않는다', () => {
    expect(sampleGait(MID_SWING, 1, 1).forearmL).toBeGreaterThan(1.05)
    // 걷기는 그 정도까지 접지 않는다
    expect(sampleGait(MID_SWING, 1, 0).forearmL).toBeLessThan(0.9)
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

  it('팔 내림은 스윙과 무관하다 — 서 있어도 T포즈로 돌아가지 않는다', () => {
    expect(sampleGait(0, 0, 0).armDrop).toBeGreaterThan(1)
    // 위상이 바뀌어도 흔들리지 않는다. 자세지 스윙이 아니다
    expect(sampleGait(2, 1, 0).armDrop).toBe(sampleGait(5, 1, 0).armDrop)
  })

  it('달리면 팔을 몸에 더 붙인다 — 벌리고 뛰면 손이 몸 옆으로 크게 돈다', () => {
    expect(sampleGait(0, 1, 1).armDrop).toBeGreaterThan(sampleGait(0, 1, 0).armDrop)
  })

  /** 한 사이클에서 팔이 앞뒤로 간 최대 각 */
  function armRange(run: number) {
    let front = -Infinity, back = Infinity
    for (let p = 0; p < TWO_PI; p += 0.02) {
      const g = sampleGait(p, 1, run)
      const swing = g.armL + g.armBias
      front = Math.max(front, swing)
      back = Math.min(back, swing)
    }
    return { front, back: -back }
  }

  it('걸을 때 팔이 뒤로도 확실히 간다 — 앞으로만 흔들면 어색하다', () => {
    // ⚠️ 서 있는 자세의 앞쪽 오프셋을 이동 중에도 걸어 뒀다가 앞 26° / 뒤 10°가 됐다.
    // 정면에서 보면 팔이 아예 안 뒤로 가는 것처럼 보인다
    const { front, back } = armRange(0)
    expect(back, `앞 ${front.toFixed(2)} 뒤 ${back.toFixed(2)}`).toBeGreaterThan(0.3)
    // 걷기는 대칭에 가깝고 뒤가 조금 더 크다
    expect(back).toBeGreaterThan(front)
    expect(back).toBeLessThan(front * 1.6)
  })

  it('달릴 때는 앞보다 뒤로 훨씬 더 간다 — 팔꿈치를 뒤로 당겨 친다', () => {
    const { front, back } = armRange(1)
    expect(front, '앞으로 아예 안 나온다').toBeGreaterThan(0.15)
    expect(back, `앞 ${front.toFixed(2)} 뒤 ${back.toFixed(2)}`).toBeGreaterThan(front * 1.5)
  })

  it('서 있을 때만 팔이 몸통보다 앞에 온다 — 쉬는 자세다', () => {
    expect(sampleGait(0, 0, 0).armBias).toBeGreaterThan(0)
    expect(sampleGait(0, 1, 0).armBias).toBeLessThan(0)
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

describe('턱 넘는 자세', () => {
  it('두 다리가 같이 움직인다 — 갈리면 걷는 것으로 보인다', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const g = hopGait(t)
      expect(g.thighL, `t=${String(t)}`).toBe(g.thighR)
      expect(g.kneeL).toBe(g.kneeR)
      expect(g.footL).toBe(g.footR)
      expect(g.armL).toBe(g.armR)
    }
  })

  it('가운데서 제일 접힌다 — 포물선 꼭대기와 맞는다', () => {
    // `player.ts`가 4k(1−k)로 띄우므로 꼭대기가 t=0.5다. 몸이 그때 제일
    // 접혀 있어야 뛰는 것으로 보인다
    const mid = hopGait(0.5)
    for (const t of [0.02, 0.98]) {
      expect(hopGait(t).kneeL, `t=${String(t)}`).toBeLessThan(mid.kneeL)
      expect(hopGait(t).thighL).toBeLessThan(mid.thighL)
    }
    // 팔도 가운데서 제일 위다
    expect(mid.armL).toBeGreaterThan(hopGait(0.02).armL)
  })

  it('무릎이 늘 굽어 있다 — 완전히 펴면 죽마가 된다', () => {
    for (let t = 0; t <= 1; t += 0.05) expect(hopGait(t).kneeL).toBeGreaterThan(0)
  })

  it('받아 낼 때 무릎이 다시 깊어진다', () => {
    // 착지 구간(뒤 22%)에서 무릎이 공중보다 덜 접히되 끝에서 다시 깊어진다 —
    // 곧게 편 채로 떨어지면 충격이 안 읽힌다
    expect(hopGait(0.97).kneeL).toBeGreaterThan(hopGait(0.80).kneeL)
  })

  it('걷기와 섞이지 않는다 — 몸통 비틀림이 0이다', () => {
    // 걷기는 팔과 반대로 상체를 비트는데, 도약에서 그것이 남으면 뛰면서
    // 걷는 것처럼 보인다
    for (const t of [0, 0.3, 0.6, 1]) expect(hopGait(t).torsoYaw).toBe(0)
  })
})
