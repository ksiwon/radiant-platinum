// 진화 마디를 **롬 자료로** 잰다.
//
// ⚠️ **「그럴듯하게 돈다」로는 모자란다.** 길이가 짧으면 입자가 서기도 전에
// 화면이 끝나는데 그건 화면을 봐도 안 보인다 — 안 나온 것이 원래 없는 것처럼
// 보이기 때문이다. 실제로 이 파일이 생기기 전까지 우리 값은 132프레임이었고
// 원작은 242프레임이었다(55%에서 잘렸다).
import { expect, it, describe } from 'vitest'
import { readFileSync } from 'node:fs'
import { bytesSource, narcEntry, openNds } from '../../import/platinum/nds'
import { romPath, withRom } from '../../data/romData.testkit'
import { readSpa } from '../battle/spl/resource'
import {
  EVO_BEATS, EVO_EMITTERS, EVO_MEMBER, evolutionBeats, evolutionBodyWhite,
  evolutionCanCancel, evolutionClamp, evolutionScales, evolutionVeil,
} from './evolutionBeat'

const NARC = '/demo/shinka/data/particle/shinka_demo_particle.narc'

describe('진화 마디 — 자료 없이', () => {
  it('이미터 열셋을 하나도 안 빠뜨리고 한 번씩만 세운다', () => {
    const all = [
      ...EVO_EMITTERS.start, ...EVO_EMITTERS.clampIn,
      ...EVO_EMITTERS.swap, ...EVO_EMITTERS.clampOut,
    ]
    // `.spa` 자원이 열셋이고 `evolution.c`가 그 열셋을 다 부른다
    expect([...all].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(EVO_BEATS.cues).toHaveLength(13)
  })

  it('마디가 차례대로 온다', () => {
    expect(EVO_BEATS.swap).toBeLessThan(EVO_BEATS.clampOut)
    expect(EVO_BEATS.clampOut).toBeLessThan(EVO_BEATS.end)
    for (const cue of EVO_BEATS.cues) expect(cue.frame).toBeLessThanOrEqual(EVO_BEATS.end)
  })

  it('교대가 사인파가 아니라 **점점 빨라지는** 선형이다', () => {
    // 오가는 데 드는 프레임을 세면 32·32·16·16·8·8·4·4… 여야 한다
    // (`attributeDelta`가 왕복 한 벌마다 배로 붙고 64에서 멈춘다)
    const spans: number[] = []
    let last = 0
    let side = evolutionScales(0).before > evolutionScales(1).before
    for (let f = 1; f <= 200; f++) {
      const now = evolutionScales(f - 1).before > evolutionScales(f).before
      if (now !== side) {
        spans.push(f - 1 - last)
        last = f - 1
        side = now
      }
    }
    expect(spans.slice(0, 8)).toEqual([32, 32, 16, 16, 8, 8, 4, 4])
  })

  it('두 몸의 크기 합이 늘 하나다 — 한쪽이 줄면 한쪽이 큰다', () => {
    for (let f = 0; f <= 400; f++) {
      const s = evolutionScales(f)
      expect(s.before + s.after, `프레임 ${String(f)}`).toBeCloseTo(1, 6)
      expect(s.before).toBeGreaterThanOrEqual(0)
      expect(s.after).toBeGreaterThanOrEqual(0)
    }
  })

  it('진화 전 몸이 온전한 데서 시작한다', () => {
    expect(evolutionScales(0)).toEqual({ before: 1, after: 0 })
  })

  it('띠가 닫혔다 열리고, 그 사이에만 멈출 수 있다', () => {
    expect(evolutionClamp(0, EVO_BEATS)).toBe(0)
    // 스무 프레임에 다 닫힌다 (프레임마다 두 줄 × 40줄)
    expect(evolutionClamp(20, EVO_BEATS)).toBeCloseTo(40 / 192)
    expect(evolutionClamp(EVO_BEATS.swap, EVO_BEATS)).toBeCloseTo(40 / 192)
    expect(evolutionClamp(EVO_BEATS.swap + 20, EVO_BEATS)).toBe(0)

    // 취소 창은 교대하는 동안뿐이다
    expect(evolutionCanCancel(0, EVO_BEATS)).toBe(false)
    expect(evolutionCanCancel(39, EVO_BEATS)).toBe(false)
    expect(evolutionCanCancel(40, EVO_BEATS)).toBe(true)
    expect(evolutionCanCancel(EVO_BEATS.swap - 1, EVO_BEATS)).toBe(true)
    expect(evolutionCanCancel(EVO_BEATS.swap, EVO_BEATS)).toBe(false)
  })

  it('흰 막이 교대 자리에서만 선다', () => {
    expect(evolutionVeil(0, EVO_BEATS)).toBe(0)
    expect(evolutionVeil(EVO_BEATS.swap - 1, EVO_BEATS)).toBe(0)
    expect(evolutionVeil(EVO_BEATS.swap + 48, EVO_BEATS)).toBeCloseTo(1)
    expect(evolutionVeil(EVO_BEATS.end, EVO_BEATS)).toBeCloseTo(0)
  })

  it('몸이 하얘졌다 되돌아온다', () => {
    expect(evolutionBodyWhite(0, EVO_BEATS)).toBe(0)
    expect(evolutionBodyWhite(80, EVO_BEATS)).toBeCloseTo(1)
    // 교대하는 내내 흰 실루엣 둘이다
    expect(evolutionBodyWhite(EVO_BEATS.swap, EVO_BEATS)).toBeCloseTo(1)
    expect(evolutionBodyWhite(EVO_BEATS.end, EVO_BEATS)).toBeCloseTo(0)
  })
})

withRom('en')('진화 마디 — 롬 실측', () => {
  it('자료에서 뽑은 값이 적어 둔 값과 같다', async () => {
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const narc = (await fs!.read(NARC))!
    const file = readSpa(narcEntry(narc, EVO_MEMBER)!)

    // 자원 열셋이 다 있어야 `evolution.c`의 부름이 하나도 안 빈다
    expect(file.resources).toHaveLength(13)
    const beats = evolutionBeats(file)

    // ⚠️ **이것이 이 파일의 이유다.** 길이가 2,200ms(132프레임)로 굳어 있던
    // 동안 교대가 원작의 55%에서 잘렸다
    expect(beats.swap).toBe(242)
    expect(beats.clampOut).toBe(298)
    expect(beats.end).toBe(378)
    expect(beats).toMatchObject({
      swap: EVO_BEATS.swap, clampOut: EVO_BEATS.clampOut, end: EVO_BEATS.end,
    })
  })

  it('열셋이 다 스스로 끝난다 — 그래서 길이가 결정적이다', async () => {
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const narc = (await fs!.read(NARC))!
    const file = readSpa(narcEntry(narc, EVO_MEMBER)!)
    for (const [at, res] of file.resources.entries()) {
      // 하나라도 자기유지가 아니면 「살아 있는 이미터가 0」이 영영 안 되고,
      // 원작 상태 기계가 교대에서 못 빠져나온다
      expect(res.header.flags.selfMaintaining, `자원 ${String(at)}`).toBe(true)
    }
  })
})
