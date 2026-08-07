// 시간대 조명과 인물 키 라이트 (PLAN §6.2)
import { describe, it, expect } from 'vitest'
import {
  CHAR_KEY_COLOR, CHAR_KEY_GAIN, CHAR_KEY_OFFSET, CHAR_KEY_RANGE, NIGHT_FLOOR, TIME_LOOKS,
  blendLooks, bodyLight, characterKey, groundLight, litBody, luminance, mixHex,
} from './sky'

// 색인이 `TimeOfDay` 값이다 — 아침 · 낮 · 해질녘 · 밤 · 심야
const MORNING = TIME_LOOKS[0]!, DAY = TIME_LOOKS[1]!, DUSK = TIME_LOOKS[2]!
const NIGHT = TIME_LOOKS[3]!, LATE = TIME_LOOKS[4]!

describe('몸빛', () => {
  it('밤은 키 라이트가 필요할 만큼 어둡다', () => {
    // 문턱은 `NIGHT_FLOOR`다. 밤 프리셋을 밝게 손봐도 이 아래에 있는 한 키
    // 라이트가 켜진다 — 숫자를 눈으로 고르지 않으려고 이렇게 쓴다
    expect(bodyLight(LATE)).toBeLessThan(NIGHT_FLOOR * bodyLight(DAY))
    expect(bodyLight(NIGHT)).toBeLessThan(NIGHT_FLOOR * bodyLight(DAY))
    // 그리고 **해질녘에는 안 켜진다** — 아직 해가 있다
    expect(bodyLight(DUSK)).toBeGreaterThan(NIGHT_FLOOR * bodyLight(DAY))
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

  it(`모자란 만큼만 켠다 — 밤의 몸빛이 낮의 정확히 ${String(NIGHT_FLOOR)}배가 된다`, () => {
    // 고정 상수를 눈으로 고른 것이 아니다. 프리셋을 바꾸면 세기도 따라 움직인다
    expect(litBody(NIGHT)).toBeCloseTo(NIGHT_FLOOR * bodyLight(DAY), 10)
    expect(litBody(LATE)).toBeCloseTo(NIGHT_FLOOR * bodyLight(DAY), 10)
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

/**
 * **밤이 얼마나 어두운가** (PLAN §6.2).
 *
 * ⚠️ 세기만 보면 속는다. 예전 밤 프리셋은 세기 합이 낮의 65%였는데 화면에서는
 * 15%였다 — 빛 **색**의 휘도가 그만큼 깎기 때문이다. 그래서 여기서 재는 것은
 * 세기가 아니라 `groundLight`(세기 × 빛 색 휘도)다.
 *
 * 밤은 어두워야 하지만 **무엇이 있는지는 보여야** 한다. 밤이라는 신호는
 * 밝기가 아니라 색이 나른다
 */
describe('밤의 밝기', () => {
  const pct = (look: typeof DAY) => groundLight(look) / groundLight(DAY)

  it('시간이 갈수록 어두워진다 — 사다리가 안 뒤집힌다', () => {
    expect(pct(MORNING)).toBeLessThan(1)
    expect(pct(DUSK)).toBeLessThan(pct(MORNING))
    expect(pct(NIGHT)).toBeLessThan(pct(DUSK))
    expect(pct(LATE)).toBeLessThan(pct(NIGHT))
  })

  it('밤이 낮과 확실히 갈린다 — 절반 아래다', () => {
    expect(pct(NIGHT)).toBeLessThan(0.5)
    expect(pct(LATE)).toBeLessThan(0.35)
  })

  it('그래도 지형이 검은 덩어리로 뭉치지는 않는다', () => {
    // 예전 값은 밤 15.2% · 심야 8.5%였다. 그 정도면 밤인 줄은 아는데
    // 무엇이 있는지가 안 보인다
    expect(pct(NIGHT)).toBeGreaterThan(0.28)
    expect(pct(LATE)).toBeGreaterThan(0.18)
  })

  it('밤은 색으로도 밤이다 — 하늘빛이 낮보다 훨씬 파랗다', () => {
    // 파랑/빨강 비. 색까지 낮에 맞춰 버리면 밝기만 낮은 대낮이 된다
    const blueness = (hex: string) => (parseInt(hex.slice(5, 7), 16) + 1)
      / (parseInt(hex.slice(1, 3), 16) + 1)
    expect(blueness(NIGHT.skyColor)).toBeGreaterThan(blueness(DAY.skyColor) * 1.2)
    expect(blueness(LATE.skyColor)).toBeGreaterThan(blueness(NIGHT.skyColor))
  })
})

describe('시간대 섞기', () => {
  it('끝값은 그대로 둔다', () => {
    expect(blendLooks(NIGHT, LATE, 0)).toBe(NIGHT)
    expect(blendLooks(NIGHT, LATE, 1)).toBe(LATE)
  })

  it('키 라이트가 툭 켜지지 않는다 — 계단이 아니라 경사다', () => {
    const STEPS = 40
    let prev = 0
    let jump = 0
    for (let i = 0; i <= STEPS; i++) {
      const now = characterKey(blendLooks(DUSK, NIGHT, i / STEPS))
      expect(now).toBeGreaterThanOrEqual(prev)
      jump = Math.max(jump, now - prev)
      prev = now
    }
    expect(prev).toBeCloseTo(characterKey(NIGHT), 10)
    // 한 칸 사이 변화가 끝값의 1/8을 안 넘는다. 켜지는 순간에도 계단이 없다
    expect(jump).toBeLessThan(characterKey(NIGHT) / 8)
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
  return attenuation(d, CHAR_KEY_RANGE) * (y / d) * luminance(CHAR_KEY_COLOR)
}

