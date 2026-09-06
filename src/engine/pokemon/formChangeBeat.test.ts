// 폼 변화 마디를 **롬 자료로** 잰다.
import { expect, it, describe } from 'vitest'
import { readFileSync } from 'node:fs'
import { bytesSource, narcCount, narcEntry, openNds } from '../../import/platinum/nds'
import { romPath, withRom } from '../../data/romData.testkit'
import { readSpa } from '../battle/spl/resource'
import {
  FORM_EMITTERS, FORM_MEMBER, GIRATINA_BEATS, SHAYMIN_BEATS,
  formChangeBeats, formChanged,
} from './formChangeBeat'

const NARC = '/particledata/pl_pokelist/pokelist_particle.narc'

describe('폼 변화 마디 — 자료 없이', () => {
  it('갈아 끼우는 것이 끝나기 전이다', () => {
    for (const beats of [GIRATINA_BEATS, SHAYMIN_BEATS]) {
      expect(beats.swap).toBeGreaterThan(0)
      expect(beats.swap).toBeLessThan(beats.end)
    }
    // 기라티나가 더 늦게 갈아 끼우고 쉐이미가 더 오래 흩어진다
    expect(GIRATINA_BEATS.swap).toBeGreaterThan(SHAYMIN_BEATS.swap)
    expect(SHAYMIN_BEATS.end).toBeGreaterThan(GIRATINA_BEATS.end)
  })

  it('갈아 끼우기 전에는 옛 모습이다', () => {
    expect(formChanged(SHAYMIN_BEATS.swap - 1, SHAYMIN_BEATS)).toBe(false)
    expect(formChanged(SHAYMIN_BEATS.swap, SHAYMIN_BEATS)).toBe(true)
  })

  it('자료가 없어도 끝이 갈아 끼우기 뒤에 온다', () => {
    const beats = formChangeBeats(65, null)
    expect(beats.end).toBeGreaterThan(beats.swap)
  })
})

withRom('en')('폼 변화 마디 — 롬 실측', () => {
  it('멤버 둘의 이미터 수가 원작이 세우는 수와 같다', async () => {
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const narc = (await fs!.read(NARC))!
    expect(narcCount(narc)).toBe(2)
    // `LoadParticleResources`가 기라티나에 셋 · 쉐이미에 둘을 세운다
    expect(readSpa(narcEntry(narc, FORM_MEMBER.giratina)!).resources)
      .toHaveLength(FORM_EMITTERS.giratina)
    expect(readSpa(narcEntry(narc, FORM_MEMBER.shaymin)!).resources)
      .toHaveLength(FORM_EMITTERS.shaymin)
  })

  it('자료에서 뽑은 끝이 적어 둔 값과 같다', async () => {
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const narc = (await fs!.read(NARC))!
    const giratina = formChangeBeats(65, readSpa(narcEntry(narc, FORM_MEMBER.giratina)!))
    const shaymin = formChangeBeats(35, readSpa(narcEntry(narc, FORM_MEMBER.shaymin)!))
    expect(giratina).toEqual(GIRATINA_BEATS)
    expect(shaymin).toEqual(SHAYMIN_BEATS)
  })
})
