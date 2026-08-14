import { expect, it } from 'vitest'
import {
  FLAG_FREED_GALACTIC_HQ, initialUnitState, openFinished, openProgress, UNIT_OPEN, UNIT_STATE,
} from './lakeGuardianUnits'

it('⚠️ 이미 풀어 줬으면 열린 채로 선다', () => {
  // 원작이 여는 애니를 마지막 프레임으로 보내 놓는 것이 이것이다. 안 그러면
  // 아지트에 다시 들어왔을 때 통이 도로 닫혀 있다
  expect(initialUnitState(false)).toBe(UNIT_STATE.held)
  expect(initialUnitState(true)).toBe(UNIT_STATE.freed)
})

it('플래그 번호가 `FLAG_FREED_GALACTIC_HQ_POKEMON`이다', () => {
  expect(FLAG_FREED_GALACTIC_HQ).toBe(2429)
})

it('기다리는 동안은 안 열린다 — 원작의 첫 마디다', () => {
  // 0번 애니가 한 바퀴를 마치기를 기다리는 그 마디. 그동안 통은 가만히 있다
  expect(openProgress(0)).toBe(0)
  expect(openProgress(UNIT_OPEN.settleSeconds * 0.99)).toBe(0)
  expect(openProgress(UNIT_OPEN.settleSeconds)).toBe(0)
})

it('그 뒤로 0에서 1까지 오르고 넘지 않는다', () => {
  const half = UNIT_OPEN.settleSeconds + UNIT_OPEN.openSeconds / 2
  expect(openProgress(half)).toBeCloseTo(0.5, 5)
  expect(openProgress(UNIT_OPEN.settleSeconds + UNIT_OPEN.openSeconds)).toBe(1)
  expect(openProgress(999)).toBe(1)
})

it('두 마디를 다 지나야 끝이다 — 스크립트가 이걸로 선다', () => {
  const total = UNIT_OPEN.settleSeconds + UNIT_OPEN.openSeconds
  expect(openFinished(0)).toBe(false)
  expect(openFinished(UNIT_OPEN.settleSeconds)).toBe(false)
  expect(openFinished(total * 0.99)).toBe(false)
  expect(openFinished(total)).toBe(true)
})
