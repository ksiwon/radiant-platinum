// 대습초원 사파리 (PARITY §7.7)
import { describe, expect, it } from 'vitest'
import {
  endSafari, leaveSafari, newSafari, newSafariBattle, SAFARI_BALLS, SAFARI_RATE,
  SAFARI_STAGE_MAX, SAFARI_STAGE_START, SAFARI_STEPS, safariCatchRate, safariFlees, safariStep,
  startSafari, throwBait, throwMud, TRAM_STOP, TRAM_STOP_Z, tramMove, useSafariBall,
} from './safari'

describe('놀이 판', () => {
  it('시작하면 볼 서른에 걸음 0이다', () => {
    expect(startSafari()).toEqual({ active: true, balls: SAFARI_BALLS, steps: 0 })
  })

  it('⚠️ 끝나면 볼도 걸음도 지운다 — 남은 볼을 못 들고 나간다', () => {
    expect(endSafari()).toEqual({ active: false, balls: 0, steps: 0 })
  })

  it('밖으로 나가면 깃발만 내려간다', () => {
    const playing = { active: true, balls: 12, steps: 300 }
    expect(leaveSafari(playing)).toEqual({ active: false, balls: 12, steps: 300 })
    // 이미 꺼져 있으면 그대로다
    const off = newSafari()
    expect(leaveSafari(off)).toBe(off)
  })

  it('놀이 중이 아니면 걸음이 아무것도 안 한다', () => {
    expect(safariStep(newSafari())).toEqual({ kind: 'off' })
  })

  it('한 걸음이 하나 는다', () => {
    const got = safariStep(startSafari())
    expect(got).toEqual({ kind: 'walk', state: { active: true, balls: 30, steps: 1 } })
  })

  it('오백 걸음째에 끝난다', () => {
    const at = { active: true, balls: 5, steps: SAFARI_STEPS - 2 }
    expect(safariStep(at).kind).toBe('walk')
    expect(safariStep({ ...at, steps: SAFARI_STEPS - 1 }).kind).toBe('noSteps')
  })

  it('⚠️ 볼을 먼저 본다 — 볼이 없으면 걸음을 안 센다', () => {
    const at = { active: true, balls: 0, steps: 10 }
    expect(safariStep(at)).toEqual({ kind: 'noBalls' })
  })

  it('볼은 0 밑으로 안 내려간다', () => {
    expect(useSafariBall({ active: true, balls: 1, steps: 0 }).balls).toBe(0)
    expect(useSafariBall({ active: true, balls: 0, steps: 0 }).balls).toBe(0)
  })
})

describe('먹이와 진흙', () => {
  it('한가운데에서 시작한다', () => {
    expect(newSafariBattle()).toEqual({ catchStage: 6, escapeStage: 6 })
    expect(SAFARI_STAGE_START).toBe(6)
  })

  it('⚠️ 먹이는 잡힘을 늘 올리고 도망도 10분의 9로 올린다', () => {
    const at = newSafariBattle()
    // 굴린 값이 0이 아니면 둘 다 오른다
    expect(throwBait(at, 3)).toEqual({ catchStage: 7, escapeStage: 7 })
    // 0이면 도망만 안 오른다 — 「먹느라 바쁘다」
    expect(throwBait(at, 0)).toEqual({ catchStage: 7, escapeStage: 6 })
  })

  it('⚠️ 진흙은 도망을 늘 내리고 잡힘도 10분의 9로 내린다', () => {
    const at = newSafariBattle()
    expect(throwMud(at, 3)).toEqual({ catchStage: 5, escapeStage: 5 })
    // 0이면 잡힘이 안 내린다 — 「몹시 화났다」
    expect(throwMud(at, 0)).toEqual({ catchStage: 6, escapeStage: 5 })
  })

  it('열두 칸에서 멈추고 0 밑으로도 안 간다', () => {
    let at = { catchStage: SAFARI_STAGE_MAX, escapeStage: SAFARI_STAGE_MAX }
    at = throwBait(at, 3)
    expect(at).toEqual({ catchStage: SAFARI_STAGE_MAX, escapeStage: SAFARI_STAGE_MAX })
    at = { catchStage: 0, escapeStage: 0 }
    expect(throwMud(at, 3)).toEqual({ catchStage: 0, escapeStage: 0 })
  })
})

describe('배수 표', () => {
  it('열세 줄이고 한가운데가 1배다', () => {
    expect(SAFARI_RATE).toHaveLength(SAFARI_STAGE_MAX + 1)
    expect(SAFARI_RATE[SAFARI_STAGE_START]).toEqual([10, 10])
  })

  it('아래로 갈수록 줄고 위로 갈수록 는다', () => {
    const value = (i: number): number => SAFARI_RATE[i]![0] / SAFARI_RATE[i]![1]
    for (let i = 1; i <= SAFARI_STAGE_MAX; i++) {
      expect(value(i), `칸 ${String(i)}`).toBeGreaterThan(value(i - 1))
    }
    expect(value(0)).toBeCloseTo(0.25)
    expect(value(SAFARI_STAGE_MAX)).toBe(4)
  })

  it('⚠️ 포획값이 버림이다 — 낮은 칸에서 뚝 떨어진다', () => {
    // 종족값 190(꼬렛)이 한가운데면 그대로, 0칸이면 4분의 1이다
    expect(safariCatchRate(190, 6)).toBe(190)
    expect(safariCatchRate(190, 0)).toBe(47) // 190*10/40 = 47.5 → 47
    expect(safariCatchRate(190, 12)).toBe(760)
  })

  it('칸이 범위를 벗어나도 안 터진다', () => {
    expect(safariCatchRate(100, -1)).toBe(25)
    expect(safariCatchRate(100, 99)).toBe(400)
  })
})

describe('도망', () => {
  it('⚠️ 굴린 값이 도망값과 같아도 도망간다 — `<=`다', () => {
    // 도망값 50, 한가운데(1배)
    expect(safariFlees(50, 6, 50)).toBe(true)
    expect(safariFlees(50, 6, 51)).toBe(false)
  })

  it('도망값이 0이면 영영 안 간다', () => {
    for (const stage of [0, 6, 12]) expect(safariFlees(0, stage, 0)).toBe(true)
    // 0은 「굴린 값 0 <= 0」이라 딱 한 칸만 걸린다
    expect(safariFlees(0, 6, 1)).toBe(false)
  })

  it('진흙을 던져 칸을 내리면 덜 도망간다', () => {
    // 도망값 100. 한가운데면 100까지 걸리고, 0칸이면 25까지만 걸린다
    expect(safariFlees(100, 6, 100)).toBe(true)
    expect(safariFlees(100, 0, 100)).toBe(false)
    expect(safariFlees(100, 0, 25)).toBe(true)
  })
})

describe('습초원 열차', () => {
  it('정거장 셋의 z가 청크 경계에서 온다', () => {
    expect(TRAM_STOP_Z).toEqual([40, 82, 108])
  })

  it('1·2구역에서는 어디로 가든 남쪽이다', () => {
    expect(tramMove(TRAM_STOP.area12, TRAM_STOP.area34)).toMatchObject({ destZ: 82, south: true })
    expect(tramMove(TRAM_STOP.area12, TRAM_STOP.area56)).toMatchObject({ destZ: 108, south: true })
  })

  it('5·6구역에서는 어디로 가든 북쪽이다', () => {
    expect(tramMove(TRAM_STOP.area56, TRAM_STOP.area34)).toMatchObject({ destZ: 82, south: false })
    expect(tramMove(TRAM_STOP.area56, TRAM_STOP.area12)).toMatchObject({ destZ: 40, south: false })
  })

  it('⚠️ 가운데 정거장만 줄이기 시작하는 자리가 둘이다', () => {
    // 북쪽에서 내려올 때와 남쪽에서 올라올 때가 다르다
    expect(tramMove(TRAM_STOP.area12, TRAM_STOP.area34).slowZ).toBe(74)
    expect(tramMove(TRAM_STOP.area56, TRAM_STOP.area34).slowZ).toBe(88)
  })

  it('가운데에서는 목적지가 방향을 정한다', () => {
    expect(tramMove(TRAM_STOP.area34, TRAM_STOP.area12).south).toBe(false)
    expect(tramMove(TRAM_STOP.area34, TRAM_STOP.area56).south).toBe(true)
  })
})
