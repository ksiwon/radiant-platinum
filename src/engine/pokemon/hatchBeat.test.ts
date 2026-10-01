// 알 부화 마디를 **롬 자료로** 잰다.
import { expect, it, describe } from 'vitest'
import { readFileSync } from 'node:fs'
import { bytesSource, narcEntry, openNds } from '../../import/platinum/nds'
import { romPath, withRom } from '../../data/romData.testkit'
import { readSpa } from '../battle/spl/resource'
import { bankIndex } from '../../import/platinum/textBanks'
import {
  EGG_BEATS, EGG_EMITTERS, EGG_HATCH_BANK, EGG_HATCH_TEXT, EGG_MEMBER, HATCH_SOUND,
  hatchBeats, hatchEggVisible, hatchShake, hatchSoundCues, hatchVeil,
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

describe('알 부화 소리 (`EggHatchCutscene_Normal`)', () => {
  /** `SEQ_SE_DP_EGG01` · `SEQ_SE_DP_BOWA3` — `pl_sound_data/InfoBlock.json`의 자리 */
  const EGG01 = 1812
  const BOWA3 = 1799

  it('흔들림 넷에 EGG01, 터질 때 BOWA3 하나', () => {
    const cues = hatchSoundCues(EGG_BEATS)
    expect(cues.filter((c) => c.seq === EGG01)).toHaveLength(4)
    expect(cues.filter((c) => c.seq === BOWA3)).toHaveLength(1)
    expect(cues).toHaveLength(5)
  })

  it('소리 프레임이 마디와 같다', () => {
    // 25프레임을 센 끝 · 잔 흔들림 첫 벌이 끝날 때 · 첫 조각 · 더 깨진 조각 · 터짐
    expect(hatchSoundCues(EGG_BEATS).map((c) => c.frame))
      .toEqual([25, 35, EGG_BEATS.first, EGG_BEATS.more, EGG_BEATS.burst])
    // 조각 이미터와 같은 프레임에 난다 (같은 상태 안에서 둘 다 건다)
    const emitter = (res: number): number => EGG_BEATS.cues.find((c) => c.res === res)!.frame
    const cues = hatchSoundCues(EGG_BEATS)
    expect(cues[2]!.frame).toBe(emitter(EGG_EMITTERS.first))
    expect(cues[3]!.frame).toBe(emitter(EGG_EMITTERS.more))
    expect(cues[4]!.frame).toBe(emitter(EGG_EMITTERS.burst))
  })

  it('소리는 차례대로 오고 알이 사라지기 전에 다 난다', () => {
    const frames = hatchSoundCues(EGG_BEATS).map((c) => c.frame)
    expect([...frames].sort((a, b) => a - b)).toEqual(frames)
    expect(Math.max(...frames)).toBeLessThan(EGG_BEATS.hide)
  })

  it('곡과 팡파르는 진화와 같은 번호다', () => {
    // `SEQ_SHINKA` · `SEQ_FANFA5` — 진화 화면(`EVOLUTION_BGM`) · 효과음 표(`FANFARE_EVOLVED`)와 같은 자리
    expect(HATCH_SOUND).toEqual({ bgm: 1141, fanfare: 1156 })
  })

  it('뱅크 번호가 미국 롬 이름 순서의 자리와 같다', () => {
    expect(EGG_HATCH_BANK).toBe(bankIndex('egg_hatch', 'us'))
    // `EggHatch_Text_MonHatched` · `_WantToNickname` · `_Yes` · `_No`
    expect(EGG_HATCH_TEXT).toEqual({ hatched: 0, nickname: 1, yes: 2, no: 3 })
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
