// 포켓몬 클립 거르개 — 본 번들의 배틀 동작 + 추가 동작 번들의 쓰러짐만 (`convert.ts`의 `monClipFilter`)
import { expect, it } from 'vitest'
import { monClipFilter } from './convert'

it('추가 번들에서는 쓰러짐(ba41)만 남기고 대기 둘째 · 공격 둘째 · 아미티광장 동작은 뺀다', () => {
  const extra = ['pm0025_00_00_ba10_waitB01', 'pm0025_00_00_ba20_buturi02', 'pm0025_00_00_ba41_down01', 'pm0025_00_00_kw11_turnB01']
  const keep = monClipFilter(extra)
  expect(keep.test('pm0025_00_00_ba41_down01')).toBe(true)
  expect(keep.test('pm0025_00_00_ba10_waitB01')).toBe(false)
  expect(keep.test('pm0025_00_00_ba20_buturi02')).toBe(false)
  expect(keep.test('pm0025_00_00_kw11_turnB01')).toBe(false)
  // 본 번들 것은 그대로
  expect(keep.test('pm0025_00_00_ba10_waitA01')).toBe(true)
  expect(keep.test('pm0025_00_00_ba01_landB01')).toBe(true)
})

it('추가 번들이 쓰러짐뿐이면 원래 거르개 그대로', () => {
  expect(monClipFilter(['pm0095_00_00_ba41_down01']).source).toBe('_ba\\d\\d_')
})
