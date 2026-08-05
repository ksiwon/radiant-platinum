// 설정 검증.
//
// 여기 값은 두 종류다. **원작이 정한 것**(글자 속도 프레임)과 **우리가 연
// 것**(배틀 진행). 앞엣것이 원작과 어긋나면 그건 버그고, 뒤엣것은 우리 판단이라
// 바뀔 수 있다 — 그래서 어느 쪽인지 시험이 구분해 둔다.
import { beforeEach, describe, expect, it } from 'vitest'
import { TEXT_SPEED } from '../engine/script/printer'
import {
  BATTLE_PACE, battlePaceScale, SPEED_FRAMES, textSpeedFrames, useOptionsStore,
} from './optionsStore'

beforeEach(() => { useOptionsStore.getState().reset() })

describe('글자 속도 — 원작 값', () => {
  it('앞 셋이 `Options_TextFrameDelay` 그대로다', () => {
    // 느림 8 · 보통 4 · 빠름 1. `include/text.h`
    expect(SPEED_FRAMES.slice(0, 3)).toEqual([TEXT_SPEED.slow, TEXT_SPEED.normal, TEXT_SPEED.fast])
  })

  it('네 번째도 지어낸 값이 아니라 `TEXT_SPEED_INSTANT`다', () => {
    expect(SPEED_FRAMES[3]).toBe(TEXT_SPEED.instant)
    expect(TEXT_SPEED.instant).toBe(0)
  })

  it('설정을 바꾸면 인쇄기가 받는 값이 바뀐다', () => {
    for (let i = 0; i < SPEED_FRAMES.length; i++) {
      useOptionsStore.getState().set('speed', i as 0 | 1 | 2 | 3)
      expect(textSpeedFrames()).toBe(SPEED_FRAMES[i])
    }
  })
})

describe('배틀 진행 — 우리가 연 자리', () => {
  it('원작대로가 1이다 — 곱해도 원작 길이가 그대로여야 한다', () => {
    expect(BATTLE_PACE[0]).toBe(1)
  })

  it('갈수록 빨라지고 0이 되지는 않는다', () => {
    for (let i = 1; i < BATTLE_PACE.length; i++) {
      expect(BATTLE_PACE[i]).toBeLessThan(BATTLE_PACE[i - 1] as number)
      expect(BATTLE_PACE[i]).toBeGreaterThan(0)
    }
  })

  it('설정을 바꾸면 곱이 바뀐다', () => {
    for (let i = 0; i < BATTLE_PACE.length; i++) {
      useOptionsStore.getState().set('battlePace', i as 0 | 1 | 2)
      expect(battlePaceScale()).toBe(BATTLE_PACE[i])
    }
  })
})

describe('기본값', () => {
  it('글자는 "빠름", 배틀은 "빠르게"로 시작한다', () => {
    const o = useOptionsStore.getState()
    // 원작 기본은 보통·원작대로다. 느리다고 오래 비판받은 값이라 우리는 한 칸씩
    // 당겨 두고, 원작대로 보고 싶으면 설정에서 되돌릴 수 있게 남긴다
    expect(o.speed).toBe(2)
    expect(textSpeedFrames()).toBe(TEXT_SPEED.fast)
    expect(o.battlePace).toBe(1)
    expect(battlePaceScale()).toBe(0.5)
  })

  it('원작대로 되돌릴 수 있다', () => {
    const o = useOptionsStore.getState()
    o.set('speed', 1)
    o.set('battlePace', 0)
    expect(textSpeedFrames()).toBe(TEXT_SPEED.normal)
    expect(battlePaceScale()).toBe(1)
  })
})
