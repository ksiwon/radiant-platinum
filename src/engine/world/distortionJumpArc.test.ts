// 판을 건너뛰는 포물선 (`sFloatingPlatformJumpOffsets`, `ov9_02249960.c:9765`)
import { describe, expect, it } from 'vitest'
import {
  JUMP_ARC_OFFSETS, jumpArcIndex, jumpArcLift, jumpArcLiftAtTick, jumpArcOffset,
} from './distortionJumpArc'

describe('원작 표', () => {
  it('열여섯 개고 정점이 12/16칸(0.75칸)이다', () => {
    expect(JUMP_ARC_OFFSETS).toHaveLength(16)
    expect(Math.max(...JUMP_ARC_OFFSETS)).toBe(12)
  })
})

describe('틱마다 뜬 높이 (steps 16)', () => {
  it('틱을 더한 뒤 읽는다 — 첫 틱이 1번(6)이고 표의 0번(4)은 안 읽힌다', () => {
    const want = [6, 8, 10, 11, 12, 12, 12, 11, 10, 9, 8, 6, 4, 0, 0, 0] // 틱 1..16
    for (let tick = 1; tick <= 16; tick++) {
      expect(jumpArcLiftAtTick(tick, 16) * 16, `틱 ${tick}`).toBe(want[tick - 1])
    }
  })

  it('시작 전(0틱)과 끝(16틱)은 0이다 — 끝에서 오프셋을 0으로 되돌린다', () => {
    expect(jumpArcLiftAtTick(0, 16)).toBe(0)
    expect(jumpArcLiftAtTick(16, 16)).toBe(0)
  })

  it('표 번호는 `틱 · 16 / steps`의 정수 나눗셈이다', () => {
    expect(jumpArcIndex(1, 16)).toBe(1)
    expect(jumpArcIndex(15, 16)).toBe(15)
    // steps 8이면 한 틱에 두 칸씩 간다
    expect(jumpArcIndex(1, 8)).toBe(2)
    expect(jumpArcIndex(7, 8)).toBe(14)
    // steps 32면 두 틱에 한 칸이다
    expect(jumpArcIndex(1, 32)).toBe(0)
    expect(jumpArcIndex(2, 32)).toBe(1)
  })

  it('어느 틱도 정점(0.75칸)을 넘지 않고 끝 프레임엔 0이다', () => {
    for (const steps of [4, 8, 16, 24, 32]) {
      for (let tick = 0; tick <= steps; tick++) {
        const lift = jumpArcLiftAtTick(tick, steps)
        expect(lift).toBeGreaterThanOrEqual(0)
        expect(lift).toBeLessThanOrEqual(0.75)
      }
      expect(jumpArcLiftAtTick(steps, steps)).toBe(0)
    }
  })
})

describe('프레임이 60Hz에 안 맞을 때', () => {
  it('정수 프레임에서는 표 값 그대로고 사이는 이어진다', () => {
    expect(jumpArcLift(5, 16)).toBe(12 / 16)
    expect(jumpArcLift(4.5, 16)).toBeCloseTo((11 + 12) / 2 / 16)
    expect(jumpArcLift(0, 16)).toBe(0)
    expect(jumpArcLift(16, 16)).toBe(0)
    // 넘치거나 모자라도 끝 · 처음에 붙는다
    expect(jumpArcLift(99, 16)).toBe(0)
    expect(jumpArcLift(-3, 16)).toBe(0)
  })
})

describe('축과 부호', () => {
  it('자료의 뛰는 축은 Y(1)다 — 세계 y로 뜬다', () => {
    expect(jumpArcOffset(5, 16, 1, 0)).toEqual([0, 0.75, 0])
  })
  it('X(0) · Z(2)면 그 축으로 뜨고 inverted면 부호가 뒤집힌다', () => {
    expect(jumpArcOffset(5, 16, 0, 0)).toEqual([0.75, 0, 0])
    expect(jumpArcOffset(5, 16, 2, 1)).toEqual([0, 0, -0.75])
  })
})
