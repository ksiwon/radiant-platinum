import { describe, expect, it } from 'vitest'
import { moveSoundTimes } from './moveSound'

const s = (at: number, seq = 1) => ({ at, seq, pan: 0 })

describe('moveSoundTimes — 원작 소리를 BDSP 소리 칸에 짝짓는다', () => {
  it('시퀀스가 없으면 원작 프레임(60fps) 그대로다', () => {
    expect(moveSoundTimes([s(0), s(30)], null).map((x) => x.at)).toEqual([0, 0.5])
  })

  it('몸통박치기 — 원작 소리 하나는 BDSP 첫 칸(돌진 23프레임)에 난다', () => {
    // 원작 `SE_DP_050`은 0프레임, BDSP `ew033`은 23(돌진) · 33(충돌)
    expect(moveSoundTimes([s(0, 1833)], [23, 33])).toEqual([{ at: 23 / 30, seq: 1833, pan: 0 }])
  })

  it('수가 같으면 차례대로 붙는다', () => {
    expect(moveSoundTimes([s(26, 1), s(106, 2)], [10, 70]).map((x) => [x.seq, x.at])).toEqual([[1, 10 / 30], [2, 70 / 30]])
  })

  it('BDSP 칸이 하나면 그 칸에서 원작 간격대로 편다', () => {
    expect(moveSoundTimes([s(0), s(20)], [30]).map((x) => x.at)).toEqual([1, 1 + 10 / 30])
  })

  it('수가 다르면 첫 소리 → 첫 칸, 끝 소리 → 끝 칸이고 사이는 원작 간격의 비로 편다', () => {
    expect(moveSoundTimes([s(0), s(10), s(40)], [30, 90]).map((x) => x.at)).toEqual([1, (30 + 15) / 30, 3])
  })

  it('원작 차례가 뒤섞여 와도 시각 차례로 짝짓는다', () => {
    expect(moveSoundTimes([s(40, 2), s(0, 1)], [6, 12]).map((x) => x.seq)).toEqual([1, 2])
  })

  it('소리가 없으면 아무것도 안 낸다', () => {
    expect(moveSoundTimes([], [10])).toEqual([])
  })
})
