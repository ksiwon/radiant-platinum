// 알 부화 마디를 **롬 자료로** 잰다.
import { expect, it, describe } from 'vitest'
import { readFileSync } from 'node:fs'
import { bytesSource, narcEntry, openNds } from '../../import/platinum/nds'
import { romPath, withRom } from '../../data/romData.testkit'
import { readSpa } from '../battle/spl/resource'
import {
  EGG_BEATS, EGG_EMITTERS, EGG_MEMBER, hatchBeats, hatchEggVisible, hatchShake, hatchVeil,
} from './hatchBeat'

const NARC = '/demo/egg/data/particle/egg_demo_particle.narc'

describe('알 부화 마디 — 자료 없이', () => {
  it('이미터 넷을 한 번씩만 세운다', () => {
    expect(EGG_BEATS.cues).toHaveLength(4)
    expect([...EGG_BEATS.cues].map((c) => c.res).sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
    // 터짐과 반짝임은 **같은 프레임**에 선다 (`CompleteEggAnimation`)
    const burst = EGG_BEATS.cues.filter((c) => c.frame === EGG_BEATS.burst)
    expect(burst.map((c) => c.res).sort((a, b) => a - b))
      .toEqual([EGG_EMITTERS.burst, EGG_EMITTERS.sparkle])
  })

  it('마디가 차례대로 온다', () => {
    expect(EGG_BEATS.first).toBeLessThan(EGG_BEATS.more)
    expect(EGG_BEATS.more).toBeLessThan(EGG_BEATS.burst)
    expect(EGG_BEATS.burst).toBeLessThan(EGG_BEATS.hide)
    expect(EGG_BEATS.hide).toBeLessThan(EGG_BEATS.end)
  })

  it('스물다섯 프레임은 가만히 있는다', () => {
    // `InitializeEggAnimation`이 `subStateTimer >= 25`를 센다
    for (const f of [0, 10, 24]) expect(hatchShake(f, EGG_BEATS), `프레임 ${String(f)}`).toBe(0)
    let moved = false
    for (let f = 25; f < 45; f++) if (Math.abs(hatchShake(f, EGG_BEATS)) > 0.01) moved = true
    expect(moved).toBe(true)
  })

  it('큰 흔들림이 잔 흔들림보다 크다', () => {
    const worst = (from: number, to: number): number => {
      let out = 0
      for (let f = from; f < to; f++) out = Math.max(out, Math.abs(hatchShake(f, EGG_BEATS)))
      return out
    }
    expect(worst(EGG_BEATS.first, EGG_BEATS.more)).toBeGreaterThan(worst(25, 45))
  })

  it('알이 사라진 뒤에야 흰 막이 선다', () => {
    expect(hatchEggVisible(EGG_BEATS.hide - 1, EGG_BEATS)).toBe(true)
    expect(hatchEggVisible(EGG_BEATS.hide, EGG_BEATS)).toBe(false)
    expect(hatchShake(EGG_BEATS.hide, EGG_BEATS)).toBe(0)
    expect(hatchVeil(EGG_BEATS.hide, EGG_BEATS)).toBe(0)
    expect(hatchVeil(EGG_BEATS.end, EGG_BEATS)).toBeCloseTo(1)
  })
})

withRom('en')('알 부화 마디 — 롬 실측', () => {
  it('자료에서 뽑은 값이 적어 둔 값과 같다', async () => {
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const narc = (await fs!.read(NARC))!
    const file = readSpa(narcEntry(narc, EGG_MEMBER)!)
    expect(file.resources).toHaveLength(4)

    const beats = hatchBeats(file)
    // 흔들림 한 벌이 열 프레임 · 여섯째에 입자가 선다
    expect(beats.first).toBe(51)
    expect(beats.more).toBe(61)
    // 첫 둘이 다 죽고 나서야 터진다 (수명 22·26)
    expect(beats.burst).toBe(93)
    expect(beats.hide).toBe(97)
    expect(beats.end).toBe(123)
    expect(beats).toMatchObject({ first: EGG_BEATS.first, end: EGG_BEATS.end })
  })
})
