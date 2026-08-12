// 낚시 검증 (PARITY §1.5)
//
// **창 길이를 프레임으로 잰다.** 낚시가 어려운 이유가 통째로 이 숫자들이라,
// "대충 맞다"로 넘기면 세 낚싯대가 같은 물건이 된다.
import { describe, expect, it } from 'vitest'
import {
  CAST_FRAMES, CAST_SOUND_FRAME, HOOK_FRAMES, NO_FISH_FRAMES, REEL_FRAMES,
  castSounds, startFishing, tickFishing, type FishingState,
} from './fishing'
import type { Rod } from '../battle/encounter'

/** 늘 같은 값을 내는 난수 — 기다림을 지목한다 */
const fixed = (v: number) => () => v

/** 아무것도 안 누르고 n프레임 흘린다 */
function idle(s: FishingState, n: number): FishingState {
  let at = s
  for (let i = 0; i < n; i++) at = tickFishing(at, false)
  return at
}

/** 「!」가 뜰 때까지 흘린다. 몇 프레임 걸렸는지도 돌려준다 */
function untilBite(s: FishingState): { at: FishingState, frames: number } {
  let at = s
  let frames = 0
  while (at.phase !== 'bite' && at.phase !== 'message' && frames < 1000) {
    at = tickFishing(at, false)
    frames++
  }
  return { at, frames }
}

describe('낚시', () => {
  it('기다림이 30·60·90·120 넷 중 하나다', () => {
    // `((LCRNG_Next() % 4) + 1) * 30`. 난수 네 구간이 네 값으로 떨어진다
    const got = [0, 0.25, 0.5, 0.75].map((v) => startFishing('old', true, fixed(v)).delay)
    expect(got).toEqual([30, 60, 90, 120])
  })

  it('던지는 데 34프레임이고 10프레임째에 물소리가 난다', () => {
    let s = startFishing('old', true, fixed(0))
    const sounded: number[] = []
    for (let i = 0; i < CAST_FRAMES; i++) {
      if (castSounds(s)) sounded.push(i + 1)
      s = tickFishing(s, false)
    }
    expect(sounded).toEqual([CAST_SOUND_FRAME])
    expect(s.phase).toBe('wait')
  })

  it.each<[Rod, number]>([['old', 45], ['good', 30], ['super', 15]])(
    '%s 낚싯대의 창이 %d프레임이다',
    (rod, frames) => {
      expect(HOOK_FRAMES[rod]).toBe(frames)
      const { at } = untilBite(startFishing(rod, true, fixed(0)))
      expect(at.phase).toBe('bite')
      expect(at.frames).toBe(frames)
      // 창 안에서는 낚이고
      expect(tickFishing(at, true).phase).toBe('reel')
      // 창을 다 흘려보내면 도망간다
      const missed = idle(at, frames)
      expect(missed.phase).toBe('message')
      expect(missed.result).toBe('away')
    },
  )

  it('「!」는 던지기가 끝난 뒤 기다림만큼 지나서 뜬다', () => {
    const s = startFishing('old', true, fixed(0.75)) // 기다림 120
    const { at, frames } = untilBite(s)
    expect(at.phase).toBe('bite')
    expect(frames).toBe(CAST_FRAMES + 120)
  })

  it('안 물리는 판은 기다림이 4초로 고정이다 — 난수를 안 본다', () => {
    for (const v of [0, 0.25, 0.5, 0.75]) {
      const s = idle(startFishing('super', false, fixed(v)), CAST_FRAMES)
      expect(s.phase).toBe('wait')
      expect(s.delay).toBe(NO_FISH_FRAMES)
      // 「!」가 아예 안 뜬다
      const end = idle(s, NO_FISH_FRAMES)
      expect(end.phase).toBe('message')
      expect(end.result).toBe('nothing')
    }
  })

  it('「!」 전에 누르면 너무 이른 것이다', () => {
    const s = idle(startFishing('old', true, fixed(0)), CAST_FRAMES) // 기다림 30
    const early = tickFishing(idle(s, 10), true)
    expect(early.phase).toBe('message')
    expect(early.result).toBe('early')
  })

  it('안 물리는 판에서도 일찍 당길 수 있다', () => {
    const s = idle(startFishing('old', false, fixed(0)), CAST_FRAMES)
    expect(tickFishing(s, true).result).toBe('early')
  })

  it('낚은 뒤 16프레임을 감아올리고 나서야 글이 뜬다', () => {
    const { at } = untilBite(startFishing('old', true, fixed(0)))
    let s = tickFishing(at, true)
    expect(s.phase).toBe('reel')
    // ⚠️ 감는 시간은 **언제 눌렀는지와 무관하다.** 원작이 카운터를 0으로
    // 되돌리고 오므로, 빨리 눌렀다고 오래 감지 않는다
    expect(s.frames).toBe(0)
    s = idle(s, REEL_FRAMES - 1)
    expect(s.phase).toBe('reel')
    s = tickFishing(s, false)
    expect(s.phase).toBe('message')
    expect(s.result).toBe('caught')
  })

  it('글은 A나 B로 닫는다 — 가만두면 안 닫힌다', () => {
    const s = idle(startFishing('old', false, fixed(0)), CAST_FRAMES + NO_FISH_FRAMES)
    expect(s.phase).toBe('message')
    expect(idle(s, 600).phase).toBe('message')
    // A로도 B로도 닫힌다 (`TryPressAOrB`)
    expect(tickFishing(s, true).phase).toBe('done')
    expect(tickFishing(s, false, true).phase).toBe('done')
  })

  it('끝난 판은 더 굴려도 안 바뀐다', () => {
    const done = tickFishing(
      idle(startFishing('old', false, fixed(0)), CAST_FRAMES + NO_FISH_FRAMES), true,
    )
    expect(done.phase).toBe('done')
    expect(idle(done, 100)).toEqual(done)
  })
})
