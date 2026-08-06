// 시간대 조명과 인물 키 라이트 (PLAN §6.2)
import { describe, it, expect } from 'vitest'
import {
  CHAR_KEY_GAIN, CHAR_KEY_OFFSET, CHAR_KEY_RANGE, TIME_LOOKS,
  blendLooks, bodyLight, characterKey, litBody, mixHex,
} from './sky'

// 색인이 `TimeOfDay` 값이다 — 아침 · 낮 · 해질녘 · 밤 · 심야
const MORNING = TIME_LOOKS[0]!, DAY = TIME_LOOKS[1]!, DUSK = TIME_LOOKS[2]!
const NIGHT = TIME_LOOKS[3]!, LATE = TIME_LOOKS[4]!

describe('몸빛', () => {
  it('심야가 낮보다 훨씬 어둡다 — 키 라이트가 필요한 이유다', () => {
    // 이 비가 0.3 언저리라는 것이 "밤에 사람이 안 보인다"의 실체다
    expect(bodyLight(LATE) / bodyLight(DAY)).toBeLessThan(0.3)
  })

  it('시간이 갈수록 어두워진다', () => {
    expect(bodyLight(DAY)).toBeGreaterThan(bodyLight(MORNING))
    expect(bodyLight(MORNING)).toBeGreaterThan(bodyLight(DUSK))
    expect(bodyLight(DUSK)).toBeGreaterThan(bodyLight(NIGHT))
    expect(bodyLight(NIGHT)).toBeGreaterThan(bodyLight(LATE))
  })
})

describe('인물 키 라이트', () => {
  it('밝은 시간대에는 아예 꺼진다', () => {
    expect(characterKey(MORNING)).toBe(0)
    expect(characterKey(DAY)).toBe(0)
    expect(characterKey(DUSK)).toBe(0)
  })

  it('어두울수록 세진다', () => {
    expect(characterKey(NIGHT)).toBeGreaterThan(0)
    expect(characterKey(LATE)).toBeGreaterThan(characterKey(NIGHT))
  })

  it('모자란 만큼만 켠다 — 밤의 몸빛이 낮의 정확히 6할이 된다', () => {
    // 고정 상수를 눈으로 고른 것이 아니다. 프리셋을 바꾸면 세기도 따라 움직인다
    expect(litBody(NIGHT)).toBeCloseTo(0.6 * bodyLight(DAY), 10)
    expect(litBody(LATE)).toBeCloseTo(0.6 * bodyLight(DAY), 10)
  })

  it('밝은 시간대는 그대로 둔다 — 6할까지 낮추지 않는다', () => {
    expect(litBody(DAY)).toBe(bodyLight(DAY))
    expect(litBody(DUSK)).toBe(bodyLight(DUSK))
  })

  it('빛은 머리 위에 선다 — 몸 안에서 비추면 얼굴이 아니라 정수리만 밝다', () => {
    // 빛나의 신장은 1.5m다 (`scene/PlayerModel`의 PLAYER_HEIGHT)
    expect(CHAR_KEY_OFFSET[1]).toBeGreaterThan(1.5)
  })

  it('발밑에 번지는 몫은 몸에 얹히는 것보다 훨씬 적다', () => {
    // 빛에서 몸 표면까지는 0.93m, 발밑 땅까지는 1.98m다. 거리 제곱으로 죽는다
    expect(groundGain()).toBeLessThan(CHAR_KEY_GAIN / 3)
  })

  it('발밑 웅덩이는 달빛이지 손전등이 아니다', () => {
    const spill = characterKey(LATE) * groundGain()
    // 원래 밝기의 4분의 1을 넘으면 땅에 동그라미가 그려진 것으로 보인다
    expect(spill / groundLight(LATE)).toBeLessThan(0.25)
    // 그리고 밝혀도 낮보다는 어둡다 — 밤인 것이 먼저다
    expect(groundLight(LATE) + spill).toBeLessThan(groundLight(DAY))
  })

  it('사거리 밖은 0이다', () => {
    expect(attenuation(CHAR_KEY_RANGE, CHAR_KEY_RANGE)).toBe(0)
    expect(attenuation(CHAR_KEY_RANGE + 1, CHAR_KEY_RANGE)).toBe(0)
  })
})

describe('시간대 섞기', () => {
  it('끝값은 그대로 둔다', () => {
    expect(blendLooks(NIGHT, LATE, 0)).toBe(NIGHT)
    expect(blendLooks(NIGHT, LATE, 1)).toBe(LATE)
  })

  it('중간은 두 끝 사이다 — 경계에서 키 라이트가 툭 켜지지 않는다', () => {
    const mid = blendLooks(DUSK, NIGHT, 0.5)
    expect(characterKey(mid)).toBeGreaterThan(characterKey(DUSK))
    expect(characterKey(mid)).toBeLessThan(characterKey(NIGHT))
  })

  it('색도 섞는다', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

/** three의 `getDistanceAttenuation`(decay 2)을 시험 쪽에서 다시 쓴다 */
function attenuation(distance: number, range: number): number {
  const falloff = 1 / Math.max(distance * distance, 0.01)
  const cut = Math.max(0, 1 - (distance / range) ** 4)
  return falloff * cut * cut
}

/** 발밑 땅이 받는 몫. 빛은 머리 위 앞쪽에 있고 땅의 법선은 위를 본다 */
function groundGain(): number {
  const [x, y, z] = CHAR_KEY_OFFSET
  const d = Math.hypot(x, y, z)
  return attenuation(d, CHAR_KEY_RANGE) * (y / d)
}

/** 방향광이 위를 보는 면에 얹히는 몫 = 방향의 y 성분 */
const up = (v: readonly [number, number, number]) => v[1] / Math.hypot(...v)
/** `MapStreamer`의 두 방향광 자리 */
const SUN: readonly [number, number, number] = [24, 42, 18]
const FILL: readonly [number, number, number] = [-14, 12, 26]

/** 위를 보는 땅이 받는 조도. 반구광은 하늘을 통째로 보므로 세기 그대로다 */
function groundLight(look: { sun: number; ambient: number; fill: number }): number {
  return look.sun * up(SUN) + look.ambient + look.fill * up(FILL)
}
