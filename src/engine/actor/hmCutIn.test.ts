import { describe, it, expect } from 'vitest'
import { bandFraction, bodyOffset, startHmCutIn, tickHmCutIn } from './hmCutIn'

/** 끝날 때까지 굴리고 프레임 수와 울음소리가 난 프레임을 돌려준다 */
function run(): { frames: number; cryAt: number; centered: number } {
  const s = startHmCutIn(2)
  let frames = 0, cryAt = -1, centered = Number.NaN
  for (; frames < 600; frames++) {
    if (tickHmCutIn(s)) break
    if (s.cry) { cryAt = frames; centered = bodyOffset(s) }
  }
  return { frames, cryAt, centered }
}

describe('비전기술 컷인', () => {
  it('한가운데에서 정확히 멈추고 거기서 운다', () => {
    const { cryAt, centered } = run()
    expect(cryAt).toBeGreaterThan(0)
    // ⚠️ 원작이 192에서 32·16·8·4·2·2를 빼서 **정확히 128**에 선다
    // (`HMCutIn_SlideMonToCenter`). 어긋나면 몸이 한가운데를 지나쳐서 운다
    expect(centered).toBe(0)
  })

  it('원작 프레임 안에서 끝난다', () => {
    const { frames } = run()
    // 원작 단계를 다 더하면 마흔 몇 프레임이다 — 1초 안쪽이어야 대사와
    // 행동 사이가 안 늘어진다
    expect(frames).toBeGreaterThan(30)
    expect(frames).toBeLessThan(70)
  })

  it('밴드가 열렸다 닫힌다', () => {
    const s = startHmCutIn(0)
    expect(bandFraction(s)).toBe(0)
    let open = 0
    for (let i = 0; i < 600; i++) {
      if (tickHmCutIn(s)) break
      open = Math.max(open, bandFraction(s))
    }
    // 반높이 40px이 화면 192px의 위아래로 벌어지므로 41.7%다
    expect(open).toBeCloseTo(80 / 192, 3)
    expect(bandFraction(s)).toBe(0)
  })

  it('몸이 오른쪽 밖에서 들어와 왼쪽 밖으로 나간다', () => {
    const s = startHmCutIn(0)
    expect(bodyOffset(s)).toBeGreaterThan(1)
    let last = bodyOffset(s)
    for (let i = 0; i < 600; i++) {
      if (tickHmCutIn(s)) break
      // 되돌려 놓는 한 프레임(`SNAP_TO`)만 빼고 늘 왼쪽으로 간다
      last = bodyOffset(s)
    }
    expect(last).toBeLessThan(-0.3)
  })
})
