// 머리 위 표시 (PARITY §1.13 · §7.9)
import { describe, expect, it } from 'vitest'
import { emoteAlive, emoteRise, EMOTE_CELL, EMOTE_FRAMES, EMOTE_HOLD, EMOTE_RISE } from './emote'

describe('튀어 오르는 곡선', () => {
  it('⚠️ 속도 하나로 만든 값이다 — 6에서 시작해 2씩 깎인다', () => {
    // 원작의 되풀이를 여기서 다시 돌려 표와 맞댄다. 손으로 적은 표가 아니라는
    // 것을 이 시험이 증명한다 (`ov5_021F5CD4`의 상태 0)
    const got: number[] = []
    let y = 0
    let v = 6
    for (let i = 0; i < 20; i++) {
      y += v
      got.push(y)
      if (y === 0) break
      v -= 2
    }
    expect(got).toEqual([...EMOTE_RISE])
  })

  it('꼭대기가 4분의 3칸이다', () => {
    expect(Math.max(...EMOTE_RISE)).toBe(12)
    expect(emoteRise(2)).toBeCloseTo(0.75)
  })

  it('일곱 프레임 만에 제자리로 내려앉는다', () => {
    expect(EMOTE_RISE).toHaveLength(7)
    expect(emoteRise(6)).toBe(0)
  })

  it('내려앉은 뒤 서른 프레임 서 있다 — 다 해서 0.6초쯤', () => {
    expect(EMOTE_HOLD).toBe(30)
    expect(EMOTE_FRAMES).toBe(37)
    expect(EMOTE_FRAMES / 60).toBeCloseTo(0.617, 2)
  })

  it('서 있는 동안은 안 얹힌다', () => {
    for (let f = EMOTE_RISE.length; f < EMOTE_FRAMES; f++) expect(emoteRise(f)).toBe(0)
  })

  it('끝나면 사라진다', () => {
    expect(emoteAlive(EMOTE_FRAMES - 1)).toBe(true)
    expect(emoteAlive(EMOTE_FRAMES)).toBe(false)
    expect(emoteAlive(-1)).toBe(false)
    expect(emoteRise(EMOTE_FRAMES)).toBe(0)
  })
})

describe('그림 칸', () => {
  it('시선이 앞이고 재전이 뒤다 — 뽑는 차례와 같다', () => {
    expect(EMOTE_CELL.exclaim).toBe(0)
    expect(EMOTE_CELL.rematch).toBe(1)
  })
})
