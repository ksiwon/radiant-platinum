// 경험치 곡선 검증.
//
// 대조할 구현이 없다(sim은 레벨업을 다루지 않는다). 대신 두 가지가 식을 못박는다:
//  ① **레벨 100 총량**이 여섯 곡선 모두 공표된 상수다. 식을 한 글자 틀리면 어긋난다
//  ② 곡선은 단조증가여야 하고, levelForExp는 expForLevel의 역이어야 한다
import { describe, it, expect } from 'vitest'
import {
  GrowthRate, MAX_LEVEL, TOTAL_AT_100,
  expForLevel, expToNextLevel, levelForExp, levelProgress,
} from './exp'

const RATES = Object.values(GrowthRate)

describe('경험치 곡선', () => {
  it('레벨 100 총량이 공표된 값과 정확히 같다', () => {
    for (const rate of RATES) {
      expect(expForLevel(rate, 100), `곡선 ${rate}`).toBe(TOTAL_AT_100[rate])
    }
  })

  it('레벨 1은 언제나 0이다 — 식을 그대로 넣으면 음수도 나온다', () => {
    for (const rate of RATES) {
      expect(expForLevel(rate, 1), `곡선 ${rate}`).toBe(0)
      expect(expForLevel(rate, 0), `곡선 ${rate}`).toBe(0)
    }
    // 굼뜸 식은 2레벨부터라 1을 넣으면 −54가 나온다. 그 값이 새어 나오면 안 된다
    expect((6 * 1 ** 3) / 5 - 15 + 100 - 140).toBeLessThan(0)
  })

  it('단조증가한다 — 레벨이 오르는데 필요 경험치가 줄면 곡선이 깨진 것이다', () => {
    for (const rate of RATES) {
      for (let n = 2; n <= MAX_LEVEL; n++) {
        expect(expForLevel(rate, n), `곡선 ${rate} Lv${n}`)
          .toBeGreaterThan(expForLevel(rate, n - 1))
      }
    }
  })

  it('불규칙·변동 곡선이 구간 경계에서 튀지 않는다', () => {
    // 두 곡선만 구간별 정의라 경계(50/68/98, 15/36)에서 어긋나기 쉽다.
    // 단조증가 테스트가 이미 잡지만 어디서 깨졌는지 알려면 경계를 따로 본다
    for (const [rate, edges] of [
      [GrowthRate.ERRATIC, [50, 68, 98]],
      [GrowthRate.FLUCTUATING, [15, 36]],
    ] as const) {
      for (const e of edges) {
        const jump = expForLevel(rate, e + 1) - expForLevel(rate, e)
        const prev = expForLevel(rate, e) - expForLevel(rate, e - 1)
        expect(jump, `곡선 ${rate} Lv${e}→${e + 1}`).toBeGreaterThan(0)
        // 경계에서 한 레벨 증가분이 직전의 5배를 넘으면 식이 어긋난 것이다
        expect(jump, `곡선 ${rate} Lv${e} 경계`).toBeLessThan(prev * 5)
      }
    }
  })

  it('levelForExp가 expForLevel의 역이다', () => {
    for (const rate of RATES) {
      for (let n = 1; n <= MAX_LEVEL; n++) {
        expect(levelForExp(rate, expForLevel(rate, n)), `곡선 ${rate} Lv${n}`).toBe(n)
        // 1 모자라면 한 레벨 아래여야 한다
        if (n > 1) {
          expect(levelForExp(rate, expForLevel(rate, n) - 1), `곡선 ${rate} Lv${n}−1exp`).toBe(n - 1)
        }
      }
    }
  })

  it('100레벨을 넘겨도 100에서 멈춘다', () => {
    for (const rate of RATES) {
      expect(levelForExp(rate, 99_999_999)).toBe(MAX_LEVEL)
      expect(expToNextLevel(rate, 99_999_999)).toBe(0)
      expect(levelProgress(rate, 99_999_999)).toBe(1)
    }
  })

  it('진행도가 레벨 시작에서 0, 다음 레벨 직전에서 1 미만이다', () => {
    for (const rate of RATES) {
      for (const n of [2, 17, 50, 73, 99]) {
        const at = expForLevel(rate, n)
        expect(levelProgress(rate, at), `곡선 ${rate} Lv${n}`).toBe(0)
        expect(levelProgress(rate, expForLevel(rate, n + 1) - 1)).toBeLessThan(1)
        expect(expToNextLevel(rate, at)).toBe(expForLevel(rate, n + 1) - at)
      }
    }
  })
})
