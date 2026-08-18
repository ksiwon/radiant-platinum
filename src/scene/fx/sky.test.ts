// 시간대 조명과 인물 키 라이트 (PLAN §6.2)
import { describe, it, expect } from 'vitest'
import {
  CHAR_KEY_COLOR, CHAR_KEY_GAIN, CHAR_KEY_OFFSET, CHAR_KEY_RANGE, DOWN_DIR, NIGHT_FLOOR,
  TIME_LOOKS, backFill, blendLooks, bodyLight, characterKey, downFill, faceLight, groundLight,
  litBody, luminance, mixHex,
} from './sky'

/** 사방을 보는 세로면 넷 — 건물의 네 벽 */
const WALLS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
]
const UP: readonly [number, number, number] = [0, 1, 0]
/** 아래를 보는 면 — 깨어진 세계의 천장 판이 걷는 면 */
const DOWN: readonly [number, number, number] = [0, -1, 0]

/** 밑빛까지 얹은 면빛. `faceLight`는 되비침만 받으므로 여기서 더한다 */
function withDown(
  look: (typeof TIME_LOOKS)[number], normal: readonly [number, number, number],
): number {
  const len = Math.hypot(...DOWN_DIR)
  const dot = (DOWN_DIR[0] * normal[0] + DOWN_DIR[1] * normal[1] + DOWN_DIR[2] * normal[2]) / len
  return faceLight(look, normal, backFill(look))
    + luminance(look.skyColor) * downFill(look) * (dot > 0 ? dot : 0)
}

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
    // 땅이 낮의 15.2%(밤) · 8.5%(심야)이던 시절에는 밤인 줄은 아는데 무엇이
    // 있는지가 안 보였다. 바닥은 `NIGHT_FLOOR`다 — 사람에게 준 것과 같은 값을
    // **키 라이트가 없는 지형에도** 준다. 눈으로 고른 숫자가 아니다
    expect(pct(NIGHT)).toBeGreaterThanOrEqual(NIGHT_FLOOR)
    // 심야는 밤 아래 같은 비율(0.66)을 지킨다
    expect(pct(LATE)).toBeGreaterThan(pct(NIGHT) * 0.6)
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

  it('빛의 항마다 시간 순으로 줄기만 한다 — 반올림된 색의 계단 사이가 안 뒤집힌다', () => {
    // ⚠️ `mixHex`가 8비트로 **반올림**해서 섞인 색의 휘도는 계단이다. 태양 항이
    // 그 계단으로 내려오는 동안 반구 항이 매끄럽게 오르면, 계단 사이에서 반구가
    // 이겨 몸빛이 도로 오른다 — 키 라이트가 세졌다 약해진다. 계단을 없앨 수는
    // 없으니(색은 16진 문자열이다) **항마다** 줄기만 하게 프리셋을 잡는다
    const hemi = (l: typeof DAY) => l.ambient * luminance(l.skyColor)
    const solar = (l: typeof DAY) => l.sun * luminance(l.sunColor)
    for (let i = 2; i + 1 < TIME_LOOKS.length; i++) {
      const a = TIME_LOOKS[i]!, b = TIME_LOOKS[i + 1]!
      expect(hemi(b), `반구 항 ${String(i)}→${String(i + 1)}`).toBeLessThan(hemi(a))
      expect(solar(b), `태양 항 ${String(i)}→${String(i + 1)}`).toBeLessThan(solar(a))
    }
  })

  it('중간이 양끝보다 어두워지지 않는다', () => {
    // ⚠️ 세기와 색을 따로 섞으면 **곱이 이차식이라 중간이 팬다.** 해질녘
    // 반구광이 0.66이던 때, 밤(0.96)으로 넘어가는 사이에 양끝보다 1.3% 어두운
    // 구간이 있었다 — 저녁에 걷다 보면 어두워졌다 도로 밝아졌다.
    // 태양 쪽이 반구광보다 빨리 꺼져서 생기는 일이라 프리셋으로만 막을 수 있다
    for (let i = 0; i + 1 < TIME_LOOKS.length; i++) {
      const a = TIME_LOOKS[i]!, b = TIME_LOOKS[i + 1]!
      for (const at of [groundLight, bodyLight]) {
        const floor = Math.min(at(a), at(b))
        for (let s = 0; s <= 40; s++) {
          expect(at(blendLooks(a, b, s / 40)), `${String(i)}→${String(i + 1)} k=${String(s / 40)}`)
            .toBeGreaterThanOrEqual(floor - 1e-12)
        }
      }
    }
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

/**
 * **네 벽이 서로 얼마나 차이 나는가** (DATA.md §2.2).
 *
 * ⚠️ 태양(24, 42, 18)도 필(−14, 12, 26)도 남쪽에서 온다. 3인칭 카메라가 남쪽
 * 고정이라 그렇게 잡았는데, 그러면 **북쪽을 보는 벽에는 방향광이 하나도 안
 * 닿는다.** 되비침을 넣기 전에 재 보면 남쪽 벽의 42.8%다 — 마을에서 내 남쪽에
 * 선 집은 늘 그 면을 보이므로, 걷다 보면 벽이 검게 뭉친 집만 지나가게 된다
 */
describe('벽마다 다른 밝기', () => {
  const walls = (look: typeof DAY, back: number) => WALLS.map((n) => faceLight(look, n, back))

  it('되비침이 없으면 북쪽 벽에 방향광이 하나도 안 닿는다', () => {
    const dark = faceLight(DAY, [0, 0, -1])
    const bright = Math.max(...walls(DAY, 0))
    expect(dark / bright).toBeCloseTo(0.428, 2)
    // 반구광만 받는다 — 방향광 둘의 몫이 정확히 0이다
    expect(dark).toBeCloseTo(faceLight({ ...DAY, sun: 0, fill: 0 }, [0, 0, -1]), 10)
  })

  it('되비침을 넣으면 제일 어두운 벽이 해가 만든 대비까지 올라온다', () => {
    // 목표는 우리가 고른 숫자가 아니라 **이미 있던 대비**다 — 볕 드는 벽이
    // 지붕의 몇 할인가. 낮은 64.7%다
    for (const look of TIME_LOOKS) {
      const back = backFill(look)
      const lit = walls(look, back)
      const want = Math.max(...walls(look, 0)) / faceLight(look, UP, 0)
      expect(Math.min(...lit) / Math.max(...lit), `되비침 ${back.toFixed(2)}`)
        .toBeGreaterThanOrEqual(want - 1e-9)
    }
  })

  it('지붕까지 밝히지는 않는다 — 낮게 넣는 이유다', () => {
    // 되비침이 지붕에 얹는 몫이 벽에 얹는 몫의 절반 아래여야 한다.
    // 위에서 들어오면 지붕만 밝아지고 정작 벽은 그대로다
    const back = backFill(DAY)
    const onRoof = faceLight(DAY, UP, back) - faceLight(DAY, UP, 0)
    const onWall = faceLight(DAY, [0, 0, -1], back) - faceLight(DAY, [0, 0, -1], 0)
    expect(onRoof).toBeLessThan(onWall * 0.5)
  })

  it('밤에도 벽이 안 뭉친다 — 시간대 다섯 벌 전부', () => {
    for (const [i, look] of TIME_LOOKS.entries()) {
      const lit = walls(look, backFill(look))
      expect(Math.min(...lit) / Math.max(...lit), `시간대 ${String(i)}`).toBeGreaterThan(0.6)
    }
  })
})

describe('밑빛 — 깨어진 세계', () => {
  it('아래를 보는 면은 빛을 거의 못 받는다 — 그래서 필요하다', () => {
    // 광원 넷이 전부 위에서 온다. 아랫면에는 방향광 셋이 하나도 안 닿는다
    const down = faceLight(DAY, DOWN, backFill(DAY))
    expect(down / faceLight(DAY, UP, backFill(DAY))).toBeCloseTo(0.118, 3)
    expect(down).toBeCloseTo(faceLight({ ...DAY, sun: 0, fill: 0 }, DOWN), 10)
  })

  it('밑빛을 넣으면 볕 드는 벽까지 올라온다', () => {
    // `backFill`과 같은 잣대다 — 우리가 고른 숫자가 아니라 해가 이미 만들어 둔 대비
    for (const look of TIME_LOOKS) {
      const bright = Math.max(...WALLS.map((n) => faceLight(look, n)))
      expect(withDown(look, DOWN), `밑빛 ${downFill(look).toFixed(2)}`)
        .toBeGreaterThanOrEqual(bright - 1e-9)
    }
  })

  it('지붕은 안 건드린다 — 밑에서 쏘기 때문이다', () => {
    expect(withDown(DAY, UP)).toBeCloseTo(faceLight(DAY, UP, backFill(DAY)), 10)
  })

  it('그늘지는 쪽이 안 바뀐다 — 태양을 수평면에 비춘 방향이다', () => {
    // 위아래만 뒤집고 좌우·앞뒤는 그대로라, 볕 드는 벽과 그늘진 벽이 안 뒤바뀐다
    const sun = [24, 42, 18] as const
    expect(DOWN_DIR[0]).toBe(sun[0])
    expect(DOWN_DIR[1]).toBe(-sun[1])
    expect(DOWN_DIR[2]).toBe(sun[2])
  })

  it('시간대 다섯 벌 전부에서 아랫면이 윗면의 절반은 넘는다', () => {
    for (const [i, look] of TIME_LOOKS.entries()) {
      const ratio = withDown(look, DOWN) / withDown(look, UP)
      expect(ratio, `시간대 ${String(i)}`).toBeGreaterThan(0.5)
    }
  })
})
