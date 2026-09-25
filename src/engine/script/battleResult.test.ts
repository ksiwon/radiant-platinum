// 이겼나·졌나 (REPAIR §122 · `field_battle_data_transfer.c` 512·524)
//
// 원작의 두 물음은 서로의 뒤집기가 **아니다**. 잡았다·달아났다가 「이겼다」 쪽이고,
// 「졌다」는 이겼다·잡았다만 아니면 참이다
import { describe, expect, it } from 'vitest'
import { lostBattle, wonBattle } from './commands'

/** `constants/battle.h` 72 — 이김 1 · 짐 2 · 비김 3 · 잡음 4 · 내가 달아남 5 · 상대가 달아남 6 */
const WIN = 1
const LOSE = 2
const DRAW = 3
const CAUGHT = 4
const FLED = 5
const FOE_FLED = 6

describe('CheckWonBattle · CheckLostBattle', () => {
  it('이겼다: 짐·비김만 거짓이다 — 잡거나 달아나도 눈앞이 캄캄해지지 않는다', () => {
    expect([WIN, LOSE, DRAW, CAUGHT, FLED, FOE_FLED].map(wonBattle))
      .toEqual([true, false, false, true, true, true])
  })

  it('졌다: 이김·잡음만 거짓이다', () => {
    expect([WIN, LOSE, DRAW, CAUGHT, FLED, FOE_FLED].map(lostBattle))
      .toEqual([false, true, true, false, true, true])
  })

  it('결과가 없으면(배틀을 못 열었다) 진 판이다', () => {
    expect(wonBattle(null)).toBe(false)
    expect(lostBattle(null)).toBe(true)
  })
})
