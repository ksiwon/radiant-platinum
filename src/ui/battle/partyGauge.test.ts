// 파티 공 줄 (REPAIR §122 · `PartyGaugeData_New` · `battle_controller.c` 2122)
import { describe, expect, it } from 'vitest'
import { gaugeSlots } from './partyGauge'

describe('쪽마다 공 한 줄', () => {
  it('트레이너 둘이면 첫 상대가 0~2번, 둘째가 3~5번 칸이다 (창기둥 마스·쥬피터)', () => {
    const keys = ['p2-0', 'p2-1', 'p2-2', 'p4-0', 'p4-1', 'p4-2', 'p1-0', 'p3-0']
    expect(gaugeSlots(keys, ['foe', 'foe2']))
      .toEqual(['p2-0', 'p2-1', 'p2-2', 'p4-0', 'p4-1', 'p4-2'])
  })

  it('둘씩이면 가운데가 빈다 — 창기둥 조무래기 521·527', () => {
    expect(gaugeSlots(['p2-0', 'p2-1', 'p4-0', 'p4-1'], ['foe', 'foe2']))
      .toEqual(['p2-0', 'p2-1', undefined, 'p4-0', 'p4-1', undefined])
  })

  it('편이 있어도 우리 줄은 내 파티만이다', () => {
    expect(gaugeSlots(['p1-0', 'p1-1', 'p3-0', 'p3-1'], ['player']))
      .toEqual(['p1-0', 'p1-1', undefined, undefined, undefined, undefined])
  })

  it('파티 칸 차례다 — 키가 섞여 와도', () => {
    expect(gaugeSlots(['p2-2', 'p2-0', 'p2-1'], ['foe']).slice(0, 3)).toEqual(['p2-0', 'p2-1', 'p2-2'])
  })
})
