// 게임코너 경품과 축복시티 복권 (PARITY §4.10 · §7.6)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { itemFileSchema } from '../../data/schema'
import { DATA, withData } from '../../data/romData.testkit'
import {
  GAME_CORNER_PRIZES, gameCornerPrize, LOTTERY_DIGITS, lotteryMatch, lotteryWinner,
} from './gameCorner'

describe('경품 열아홉', () => {
  it('앞 넷이 1,000코인짜리 지닌 도구고 나머지가 기술머신이다', () => {
    expect(GAME_CORNER_PRIZES).toHaveLength(19)
    expect(GAME_CORNER_PRIZES.slice(0, 4).every((p) => p.coins === 1000)).toBe(true)
  })

  it('값이 2,000에서 20,000까지 오르기만 한다', () => {
    const tms = GAME_CORNER_PRIZES.slice(4)
    for (let i = 1; i < tms.length; i++) {
      expect(tms[i]!.coins, `${String(i)}번째`).toBeGreaterThanOrEqual(tms[i - 1]!.coins)
    }
    expect(tms[0]!.coins).toBe(2000)
    expect(tms[tms.length - 1]!.coins).toBe(20000)
  })

  it('없는 번호는 null이다 — 0번 물건으로 안 떨어진다', () => {
    expect(gameCornerPrize(0)?.coins).toBe(1000)
    expect(gameCornerPrize(19)).toBe(null)
    expect(gameCornerPrize(-1)).toBe(null)
  })
})

const maybe = withData('items.json')

maybe('롬 표와 맞댄다', () => {
  const file = itemFileSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'items.json'), 'utf8')),
  )

  it('⚠️ 번호가 하나씩 밀려 있지 않다 — 이름표로 확인한다', () => {
    const names = GAME_CORNER_PRIZES.map((p) => file.items[p.item]?.constant)
    expect(names).toEqual([
      'ITEM_SILK_SCARF', 'ITEM_WIDE_LENS', 'ITEM_ZOOM_LENS', 'ITEM_METRONOME',
      'ITEM_TM90', 'ITEM_TM58', 'ITEM_TM75', 'ITEM_TM32', 'ITEM_TM44', 'ITEM_TM89',
      'ITEM_TM10', 'ITEM_TM27', 'ITEM_TM21', 'ITEM_TM35', 'ITEM_TM24', 'ITEM_TM13',
      'ITEM_TM29', 'ITEM_TM74', 'ITEM_TM68',
    ])
  })
})

describe('복권 맞추기', () => {
  it('⚠️ 끝자리부터 세고 한 자리라도 틀리면 멈춘다', () => {
    expect(lotteryMatch(12345, 12345)).toBe(LOTTERY_DIGITS)
    expect(lotteryMatch(12345, 22345)).toBe(4)
    // 앞이 다 맞아도 끝자리가 다르면 0이다
    expect(lotteryMatch(12345, 12340)).toBe(0)
    expect(lotteryMatch(12345, 54321)).toBe(0)
  })

  it('다섯 자리에서 끊는다', () => {
    // 여섯 자리가 다 같아도 다섯까지만 센다
    expect(lotteryMatch(111111, 111111)).toBe(LOTTERY_DIGITS)
  })
})

describe('당첨자 찾기', () => {
  const mon = (otId: number, isEgg = false) => ({ otId, isEgg })

  // ⚠️ **트레이너 번호는 16비트다** — 65,535를 넘는 값을 넣으면 원작이
  // `& 0xffff`로 자르므로 시험 값도 그 안에서 고른다
  it('제일 많이 맞은 하나를 고른다', () => {
    const got = lotteryWinner(12345, [mon(54321), mon(22345), mon(12345)], [])
    expect(got).toEqual({ index: 2, digits: 5, inBox: false })
  })

  it('⚠️ 알은 안 센다', () => {
    const got = lotteryWinner(12345, [mon(12345, true), mon(22345)], [])
    expect(got).toEqual({ index: 1, digits: 4, inBox: false })
  })

  it('⚠️ 같은 자릿수면 파티가 이긴다', () => {
    const got = lotteryWinner(12345, [mon(22345)], [mon(32345)])
    expect(got.inBox).toBe(false)
  })

  it('박스가 더 많이 맞으면 박스다 — 자리는 한 줄로 센 번호다', () => {
    const boxes = [null, mon(54321), mon(12345)]
    const got = lotteryWinner(12345, [mon(22345)], boxes)
    expect(got).toEqual({ index: 2, digits: 5, inBox: true })
  })

  it('아무도 안 맞으면 0이다', () => {
    expect(lotteryWinner(12345, [mon(54321)], [mon(11111)]))
      .toEqual({ index: 0, digits: 0, inBox: false })
  })

  it('⚠️ 트레이너 번호의 아래 16비트만 본다 — 원작이 `& 0xffff`를 한다', () => {
    // 0x13039 = 77,881. 아래 16비트가 12,345라 **다섯 자리가 다 맞는다**
    expect(lotteryWinner(12345, [mon(0x13039)], [])).toEqual({ index: 0, digits: 5, inBox: false })
  })
})
