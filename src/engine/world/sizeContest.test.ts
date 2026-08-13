import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compareSize, SIZE_RECORD_INITIAL, SIZE_RESULT, sizeFactor, sizeMillimeters,
  sizeMultiplier, sizeParts, tenthInches,
} from './sizeContest'

const ivs = (n: number) => ({ hp: n, atk: n, def: n, spa: n, spd: n, spe: n })

describe('크기 대회', () => {
  it('배수가 290~1725 안에 든다', () => {
    // 열여섯 토막이 0~65535를 빈틈없이 덮는지 — 한 칸이라도 새면 그 값에서
    // 키가 0이 되거나 터무니없이 커진다
    for (let f = 0; f <= 0xffff; f += 7) {
      const m = sizeMultiplier(f)
      expect(m).toBeGreaterThanOrEqual(290)
      expect(m).toBeLessThanOrEqual(1725)
    }
    expect(sizeMultiplier(0)).toBe(290)
    expect(sizeMultiplier(0xffff)).toBe(1725)
  })

  it('배수가 단조 증가한다', () => {
    let prev = -1
    for (let f = 0; f <= 0xffff; f += 13) {
      const m = sizeMultiplier(f)
      expect(m).toBeGreaterThanOrEqual(prev)
      prev = m
    }
  })

  it('가운데 값에 몰리고 양 끝이 드물다', () => {
    // 실측이다 — 65536개를 전부 돌려 세었다. 900~1100이 45.93%, 500 미만이나
    // 1500 초과가 0.967%다. 표를 손대면 이 수가 먼저 움직인다
    let near = 0, far = 0
    for (let f = 0; f < 0x10000; f++) {
      const m = sizeMultiplier(f)
      if (m >= 900 && m <= 1100) near++
      if (m < 500 || m > 1500) far++
    }
    expect(near).toBe(30_100)
    expect(far).toBe(634)
  })

  it('개체값의 윗비트는 크기에 안 쓰인다', () => {
    // 원작이 `& 0xf`로 자른다. 31과 15가 같은 값을 내야 한다
    expect(sizeFactor({ pid: 0x1234abcd, ivs: ivs(31) }))
      .toBe(sizeFactor({ pid: 0x1234abcd, ivs: ivs(15) }))
  })

  it('개체값이 같으면 성격값 아래 16비트만 남는다', () => {
    const a = sizeFactor({ pid: 0xffff0000 | 0x1234, ivs: ivs(7) })
    const b = sizeFactor({ pid: 0x00000000 | 0x1234, ivs: ivs(7) })
    expect(a).toBe(b)
  })

  it('짜낸 값이 16비트를 안 넘는다', () => {
    for (let n = 0; n < 16; n++) {
      const f = sizeFactor({ pid: 0xffffffff, ivs: ivs(n) })
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(0xffff)
    }
  })

  it('평균 배수에서 도감의 키가 그대로 나온다', () => {
    // 모부기 0.4m — 1000배수면 400mm다
    expect(sizeMillimeters(4, 32710)).toBe(400)
  })

  it('인치 환산이 원작 식과 같다', () => {
    // `((mm * 1000) / 254 + 5) / 10` — 정수 나눗셈 두 번이다.
    // 400mm는 15.7인치, 2540mm는 정확히 100인치다
    expect(tenthInches(400)).toBe(157)
    expect(tenthInches(0)).toBe(0)
    expect(tenthInches(2540)).toBe(1000)
  })

  it('첫 기록과 같은 개체는 「같은 크기」다', () => {
    expect(compareSize(4, SIZE_RECORD_INITIAL, SIZE_RECORD_INITIAL)).toBe(SIZE_RESULT.same)
    expect(compareSize(4, 0xffff, SIZE_RECORD_INITIAL)).toBe(SIZE_RESULT.larger)
    expect(compareSize(4, 0, SIZE_RECORD_INITIAL)).toBe(SIZE_RESULT.smaller)
  })

  it('글 칸 둘이 정수부와 소수 한 자리다', () => {
    // 모부기 0.4m가 평균 배수에서 15.7인치다
    expect(sizeParts(4, 32710)).toEqual({ whole: 15, tenth: 7 })
  })
})

/**
 * 우리 `heightDm`이 원작의 키 표와 같은 수인지.
 *
 * 원작 크기 대회는 `pokedex_heightweight`의 표를 읽는데 우리는 종족 자료의
 * `heightDm`을 쓴다. 둘이 같은 수라는 근거가 없으면 대회의 답이 통째로 어긋나므로,
 * 도감이 찍는 글("  0.4m")과 맞대 본다
 */
const SPECIES = resolve(__dirname, '../../../public/data/species.json')
const HEIGHT_BANK = resolve(__dirname, '../../../public/data/dialogue/ko/709.json')

describe.skipIf(!existsSync(SPECIES) || !existsSync(HEIGHT_BANK))('키 표', () => {
  it('heightDm이 도감의 키 글과 맞는다', () => {
    const file = JSON.parse(readFileSync(SPECIES, 'utf8')) as {
      species: { id: number, heightDm: number }[]
    }
    const species = file.species
    const text = JSON.parse(readFileSync(HEIGHT_BANK, 'utf8')) as string[]
    const bad: number[] = []
    for (const s of species) {
      const shown = text[s.id]
      if (shown === undefined) continue
      const meters = Number(shown.replace('m', '').trim())
      if (!Number.isFinite(meters)) continue
      if (Math.round(meters * 10) !== s.heightDm) bad.push(s.id)
    }
    // ⚠️ 기라티나 하나만 안 맞는다 — 종족 자료는 어나더폼의 4.5m인데 도감 글은
    // 오리진폼의 6.9m다. 크기 대회는 총어 전용이라(`scripts_route_222_east_house`)
    // 이 차이가 대회의 답에 닿지 않는다
    expect(bad).toEqual([487])
  })
})
