// 특별한 날 (PARITY §6.12)
import { expect, it } from 'vitest'
import { dateGate, SPECIAL_DATE_COUNT } from './specialDates'

/** 기본 관문. 긴 풀·자전거가 아니면 이 값이다 */
const FLAT = 40

it('표에 마흔세 날이 있다', () => {
  expect(SPECIAL_DATE_COUNT).toBe(43)
})

it('보통 날은 안 건드린다', () => {
  // 1월 2일 · 6월 1일 — 표에 없는 날
  expect(dateGate(FLAT, 1, 2)).toBe(FLAT)
  expect(dateGate(FLAT, 6, 1)).toBe(FLAT)
  expect(dateGate(70, 6, 1)).toBe(70)
})

it('네 값이 다 나온다 — ±5 · ±10', () => {
  expect(dateGate(FLAT, 7, 7), '7월 7일 +10').toBe(50)
  expect(dateGate(FLAT, 1, 11), '1월 11일 +5').toBe(45)
  expect(dateGate(FLAT, 11, 3), '11월 3일 −5').toBe(35)
  expect(dateGate(FLAT, 1, 1), '1월 1일 −10').toBe(30)
})

it('⚠️ 보정 0인 날이 표에 남아 있다', () => {
  // 지우면 "왜 이 날만 표에 없지"를 다시 조사하게 된다
  for (const [m, d] of [[2, 14], [5, 1], [5, 4], [11, 23]]) {
    expect(dateGate(FLAT, m!, d!), `${String(m)}/${String(d)}`).toBe(FLAT)
  }
})

it('⚠️ 조우가 없는 곳을 열지 않는다', () => {
  // 관문 0은 0으로 나간다. 안 그러면 1월 11일에 실내에서 야생이 나온다
  expect(dateGate(0, 1, 11)).toBe(0)
})

it('⚠️ 음수로 내려가면 1이다 — 딱 0은 0이다', () => {
  // 원작이 `if (newModifier < 0) newModifier = 1;`이다. **0은 안 걸린다** —
  // 5 − 10 = −5는 1이 되지만 10 − 10 = 0은 0으로 나간다.
  // 관문의 바닥이 40이라 실제로 0까지 내려가는 일은 없지만, 규칙은 규칙이다
  expect(dateGate(5, 1, 1)).toBe(1)
  expect(dateGate(10, 1, 1)).toBe(0)
  expect(dateGate(12, 1, 1)).toBe(2)
})

it('시계를 돌린 벌칙이 서 있으면 통째로 쉰다', () => {
  expect(dateGate(FLAT, 7, 7, true)).toBe(FLAT)
})

it('긴 풀 위에서도 먹는다 — 100을 넘기는 것은 부르는 쪽이 자른다', () => {
  expect(dateGate(70, 7, 7)).toBe(80)
})
