import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HALL_OF_FAME_MACHINE_MODEL, HEAL_BALL_TICKS, HEALING_BALL_MODEL, HEALING_MACHINE_MODEL,
  HEALING_SCREEN_MODEL, SEQ_HEAL_FANFARE, SFX_HEAL_BALL, healBallCount, healBallOffset,
  healBallsPlaced, healBallTick, healFinalTick,
} from './healingMachine'

/** `pokecenter.c`의 상태 기계를 틱마다 그대로 돌려 볼이 놓인 틱과 클립을 튼 틱을 적는다 */
function romTimeline(count: number): { adds: number[], final: number } {
  const adds: number[] = []
  let state = 0, index = 0, ticks = 0
  for (let tick = 0; tick < 1000; tick++) {
    switch (state) {
      case 0: state++; break
      case 1: adds.push(tick); state++; break
      case 2:
        if (ticks < 15) { ticks++; break }
        ticks = 0
        index++
        state = index < count ? 1 : 3
        break
      case 3: return { adds, final: tick }
    }
  }
  throw new Error('안 끝났다')
}

describe('회복기 볼의 박자 (`overlay006/healing_machine_animation`)', () => {
  it('볼이 놓이는 틱 · 클립을 트는 틱이 원작 상태 기계와 같다', () => {
    for (let n = 1; n <= 6; n++) {
      const rom = romTimeline(n)
      expect(rom.adds).toEqual(Array.from({ length: n }, (_, i) => healBallTick(i)))
      expect(rom.final).toBe(healFinalTick(n))
    }
    expect(HEAL_BALL_TICKS).toBe(17)
    expect(healFinalTick(6)).toBe(103)
  })

  it('알만 있어도 볼 하나는 놓인다 — 얹는 걸음이 마릿수를 보기 전에 돈다', () => {
    expect(romTimeline(0).adds).toEqual([1])
    expect(healBallCount(0)).toBe(1)
    expect(healFinalTick(0)).toBe(romTimeline(0).final)
  })

  it('놓인 볼 수가 틱마다 하나씩 는다', () => {
    expect(healBallsPlaced(3, 0)).toBe(0)
    expect(healBallsPlaced(3, 1)).toBe(1)
    expect(healBallsPlaced(3, 17)).toBe(1)
    expect(healBallsPlaced(3, 18)).toBe(2)
    expect(healBallsPlaced(3, 35)).toBe(3)
    expect(healBallsPlaced(3, 500)).toBe(3)
  })

  it('자리는 위 왼쪽부터 두 줄씩 — 4.5유닛 · 높이 12유닛', () => {
    expect(healBallOffset(0)).toEqual([-4.5 / 16, 12 / 16, -4.5 / 16])
    expect(healBallOffset(1)).toEqual([4.5 / 16, 12 / 16, -4.5 / 16])
    expect(healBallOffset(2)).toEqual([-4.5 / 16, 12 / 16, 0])
    expect(healBallOffset(5)).toEqual([4.5 / 16, 12 / 16, 4.5 / 16])
  })
})

const HEADER = 'raw/decomp/include/overlay006/healing_machine_animation.h'
const ORDER = 'raw/decomp/res/field/props/models/map_prop_models.order'
const SDAT = 'raw/decomp/generated/sdat.txt'

describe.runIf(existsSync(HEADER))('디컴프와 맞대 본다', () => {
  it('틱 · 자리 상수', () => {
    const h = readFileSync(HEADER, 'utf8')
    expect(h).toMatch(/POKEBALL_MAX_TICKS 15\b/)
    expect(h).toMatch(/OFFSET_POSITIVE \(\(FX32_ONE \* 4\) \+ \(FX32_ONE \/ 2\)\)/)
    expect(h).toMatch(/OFFSET_Y_ALL\s+\(FX32_ONE \* 12\)/)
  })

  it('소품 번호가 모델 목록의 차례다', () => {
    const order = readFileSync(ORDER, 'utf8').split(/\r?\n/)
    expect(order[HEALING_MACHINE_MODEL]).toBe('pokecenter_healing_machine.nsbmd')
    expect(order[HEALING_SCREEN_MODEL]).toBe('pokecenter_healing_machine_tv.nsbmd')
    expect(order[HEALING_BALL_MODEL]).toBe('pokecenter_healing_machine_mini_pokeball.nsbmd')
    expect(order[HALL_OF_FAME_MACHINE_MODEL]).toBe('pokemon_league_hall_of_fame_machine.nsbmd')
  })

  it('소리 번호 (`generated/sdat.txt`의 닻을 세어서)', () => {
    const ids = new Map<string, number>()
    let next = 0
    for (const line of readFileSync(SDAT, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (t === '') continue
      const m = /^(\w+)\s*=\s*(\d+)$/.exec(t)
      if (m) { next = Number(m[2]); ids.set(m[1]!, next++); continue }
      if (/^\w+$/.test(t)) ids.set(t, next++)
    }
    expect(ids.get('SEQ_SE_DP_BOWA')).toBe(SFX_HEAL_BALL)
    expect(ids.get('SEQ_ASA')).toBe(SEQ_HEAL_FANFARE)
  })
})
