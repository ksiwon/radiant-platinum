import { expect, it } from 'vitest'
import { FOSSILS, fossilAtThreshold, fossilCount, speciesFromFossil } from './fossil'

/** 가방 흉내 */
const bag = (have: Record<number, number>) => (item: number): number => have[item] ?? 0

it('일곱 짝이고 도구도 종족도 안 겹친다', () => {
  expect(FOSSILS).toHaveLength(7)
  expect(new Set(FOSSILS.map((f) => f.item)).size).toBe(7)
  expect(new Set(FOSSILS.map((f) => f.species)).size).toBe(7)
})

it('⚠️ 차례가 도구 번호순이 아니다 — 목록의 줄 순서가 이것이다', () => {
  // 옛호박(103)이 첫 줄이고 뿌리화석(99)이 넷째다
  expect(FOSSILS.map((f) => f.item)).toEqual([103, 101, 102, 99, 100, 104, 105])
})

it('짝이 원작 표 그대로다', () => {
  expect(speciesFromFossil(103)).toBe(142) // 옛호박 → 프테라
  expect(speciesFromFossil(101)).toBe(138) // 나선화석 → 암나이트
  expect(speciesFromFossil(102)).toBe(140) // 껍질화석 → 투구
  expect(speciesFromFossil(99)).toBe(345) //  뿌리화석 → 릴링
  expect(speciesFromFossil(100)).toBe(347) // 발톱화석 → 아노딥스
  expect(speciesFromFossil(104)).toBe(410) // 갑옷화석 → 쉘돈
  expect(speciesFromFossil(105)).toBe(408) // 두개화석 → 두개도스
})

it('화석이 아니면 0이다', () => {
  expect(speciesFromFossil(4)).toBe(0)
  expect(speciesFromFossil(0)).toBe(0)
})

it('가진 화석을 다 센다', () => {
  expect(fossilCount(bag({}))).toBe(0)
  expect(fossilCount(bag({ 105: 1 }))).toBe(1)
  // 같은 화석 여러 개도 개수만큼 센다
  expect(fossilCount(bag({ 105: 3, 99: 2 }))).toBe(5)
  // 화석이 아닌 도구는 안 센다
  expect(fossilCount(bag({ 4: 99 }))).toBe(0)
})

it('문턱에 닿는 화석을 집는다 — 표 차례대로 쌓는다', () => {
  const have = bag({ 101: 1, 105: 1 })
  // 표에서 나선화석(101)이 두개화석(105)보다 앞이다
  expect(fossilAtThreshold(have, 1)).toEqual({ item: 101, index: 1 })
  expect(fossilAtThreshold(have, 2)).toEqual({ item: 105, index: 6 })
})

it('⚠️ 같은 화석 둘은 목록에서 두 줄을 먹는다', () => {
  const have = bag({ 105: 2 })
  // 누적 개수로 세니까 첫 줄도 둘째 줄도 두개화석이다
  expect(fossilAtThreshold(have, 1)).toEqual({ item: 105, index: 6 })
  expect(fossilAtThreshold(have, 2)).toEqual({ item: 105, index: 6 })
})

it('없으면 둘 다 0이다', () => {
  expect(fossilAtThreshold(bag({}), 1)).toEqual({ item: 0, index: 0 })
  // 가진 것보다 큰 문턱도 마찬가지다
  expect(fossilAtThreshold(bag({ 105: 1 }), 2)).toEqual({ item: 0, index: 0 })
})
