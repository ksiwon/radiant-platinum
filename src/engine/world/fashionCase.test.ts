// 장식 케이스 (PARITY §7.16)
import { describe, expect, it } from 'vitest'
import {
  ACCESSORY_COUNT, accessoryCount, addAccessory, canFitAccessory, canHaveMultiple,
  MAX_NON_UNIQUE, MAX_UNIQUE, newFashionCase, NON_UNIQUE_ACCESSORY_COUNT,
  NON_UNIQUE_WORDS, removeAccessory, totalAccessories, UNIQUE_WORDS,
} from './fashionCase'

/** 겹치는 것 하나 · 하나뿐인 것 하나 */
const FLUFF = 0
const PARASOL = NON_UNIQUE_ACCESSORY_COUNT
const LAST = ACCESSORY_COUNT - 1

describe('칸이 다 들어간다', () => {
  it('겹치는 61가지가 4비트씩 여덟 칸에 들어간다', () => {
    expect(Math.ceil(NON_UNIQUE_ACCESSORY_COUNT / 8)).toBeLessThanOrEqual(NON_UNIQUE_WORDS)
  })

  it('하나뿐인 39가지가 1비트씩 두 칸에 들어간다', () => {
    const unique = ACCESSORY_COUNT - NON_UNIQUE_ACCESSORY_COUNT
    expect(unique).toBe(39)
    expect(Math.ceil(unique / 32)).toBeLessThanOrEqual(UNIQUE_WORDS)
  })

  it('⚠️ 61이 경계다 — 그 앞은 겹치고 그 뒤는 하나뿐이다', () => {
    expect(canHaveMultiple(NON_UNIQUE_ACCESSORY_COUNT - 1)).toBe(true)
    expect(canHaveMultiple(NON_UNIQUE_ACCESSORY_COUNT)).toBe(false)
  })
})

describe('넣고 센다', () => {
  it('빈 케이스는 다 0이다', () => {
    const c = newFashionCase()
    expect(totalAccessories(c)).toBe(0)
    for (let i = 0; i < ACCESSORY_COUNT; i++) expect(accessoryCount(c, i)).toBe(0)
  })

  it('겹치는 것은 아홉까지 쌓인다', () => {
    let c = newFashionCase()
    for (let i = 1; i <= MAX_NON_UNIQUE; i++) {
      c = addAccessory(c, FLUFF, 1)
      expect(accessoryCount(c, FLUFF)).toBe(i)
    }
    // ⚠️ **넘겨도 안 터진다. 아홉에서 멈춘다**
    c = addAccessory(c, FLUFF, 5)
    expect(accessoryCount(c, FLUFF)).toBe(MAX_NON_UNIQUE)
  })

  it('하나뿐인 것은 하나에서 멈춘다', () => {
    let c = addAccessory(newFashionCase(), PARASOL, 1)
    expect(accessoryCount(c, PARASOL)).toBe(MAX_UNIQUE)
    c = addAccessory(c, PARASOL, 3)
    expect(accessoryCount(c, PARASOL)).toBe(MAX_UNIQUE)
  })

  it('⚠️ 옆칸을 안 건드린다 — 한 칸에 여덟 가지가 같이 산다', () => {
    let c = newFashionCase()
    for (let i = 0; i < 8; i++) c = addAccessory(c, i, i + 1)
    for (let i = 0; i < 8; i++) expect(accessoryCount(c, i), `장식 ${String(i)}`).toBe(i + 1)
    c = removeAccessory(c, 3, 4)
    expect(accessoryCount(c, 3)).toBe(0)
    for (const i of [0, 1, 2, 4, 5, 6, 7]) expect(accessoryCount(c, i)).toBe(i + 1)
  })

  it('⚠️ 맨 위 비트를 세워도 음수가 안 된다', () => {
    // 장식 7(첫 칸의 마지막 4비트)과 마지막 하나뿐인 것
    let c = addAccessory(newFashionCase(), 7, MAX_NON_UNIQUE)
    c = addAccessory(c, LAST, 1)
    for (const w of [...c.nonUnique, ...c.unique]) expect(w).toBeGreaterThanOrEqual(0)
    expect(accessoryCount(c, 7)).toBe(MAX_NON_UNIQUE)
    expect(accessoryCount(c, LAST)).toBe(1)
  })

  it('백 가지를 다 넣어도 서로 안 밀린다', () => {
    let c = newFashionCase()
    for (let i = 0; i < ACCESSORY_COUNT; i++) c = addAccessory(c, i, MAX_NON_UNIQUE)
    for (let i = 0; i < ACCESSORY_COUNT; i++) {
      expect(accessoryCount(c, i), `장식 ${String(i)}`)
        .toBe(canHaveMultiple(i) ? MAX_NON_UNIQUE : MAX_UNIQUE)
    }
    expect(totalAccessories(c)).toBe(NON_UNIQUE_ACCESSORY_COUNT * MAX_NON_UNIQUE
      + (ACCESSORY_COUNT - NON_UNIQUE_ACCESSORY_COUNT) * MAX_UNIQUE)
  })
})

describe('자리가 있는가', () => {
  it('빈 케이스에는 하나가 들어간다', () => {
    expect(canFitAccessory(newFashionCase(), FLUFF, 1)).toBe(true)
    expect(canFitAccessory(newFashionCase(), PARASOL, 1)).toBe(true)
  })

  it('⚠️ 가득 차면 거짓이다 — 스크립트가 이걸로 도구 쪽으로 샌다', () => {
    const full = addAccessory(newFashionCase(), FLUFF, MAX_NON_UNIQUE)
    expect(canFitAccessory(full, FLUFF, 1)).toBe(false)
    const one = addAccessory(newFashionCase(), PARASOL, 1)
    expect(canFitAccessory(one, PARASOL, 1)).toBe(false)
  })

  it('딱 맞으면 참이다', () => {
    const eight = addAccessory(newFashionCase(), FLUFF, 8)
    expect(canFitAccessory(eight, FLUFF, 1)).toBe(true)
    expect(canFitAccessory(eight, FLUFF, 2)).toBe(false)
  })
})

describe('범위 밖', () => {
  it('없는 번호는 0이고, 넣어도 아무 일도 안 난다', () => {
    const c = newFashionCase()
    expect(accessoryCount(c, ACCESSORY_COUNT)).toBe(0)
    expect(accessoryCount(c, -1)).toBe(0)
    expect(addAccessory(c, ACCESSORY_COUNT, 1)).toBe(c)
    expect(removeAccessory(c, -1, 1)).toBe(c)
  })

  it('⚠️ 망가진 칸이 열을 내지 않는다 — 읽을 때도 아홉으로 깎는다', () => {
    // 4비트에 15가 들어 있는 리포트
    const broken = { nonUnique: [0xf, 0, 0, 0, 0, 0, 0, 0], unique: [0, 0] }
    expect(accessoryCount(broken, 0)).toBe(MAX_NON_UNIQUE)
  })
})
