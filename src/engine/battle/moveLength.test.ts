// 연출 길이를 **롬의 자료로** 잰다.
//
// ⚠️ **「그럴듯한 수가 나온다」로는 모자란다.** 길이가 짧으면 입자가 서기도 전에
// 화면이 끝나는데 그건 화면을 봐도 안 보인다 — 안 나온 것이 원래 없는 것처럼
// 보이기 때문이다. 그래서 여기서 재는 것은 **한 이미터도 안 잘린다**는 성질이다.
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { bytesSource, narcEntry, openNds } from '../../import/platinum/nds'
import { romPath, withRom } from '../../data/romData.testkit'
import { readSpa, type SplFile } from './spl/resource'
import { splLifeFrames } from './spl/emitter'
import { MOVE_ANIMS } from './moveAnimTable'
import { moveAnimFrames } from './moveLength'
import { MOVE_FRAMES } from './vfx'

const WAZA = '/wazaeffect/effectdata/waza_particle.narc'

/** 대본이 부르는 멤버 하나 */
async function waza(): Promise<(member: number) => SplFile | null> {
  const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
  const narc = (await fs!.read(WAZA))!
  const cache = new Map<number, SplFile | null>()
  return (member) => {
    if (!cache.has(member)) {
      const bytes = narcEntry(narc, member)
      cache.set(member, bytes === null ? null : readSpa(bytes))
    }
    return cache.get(member) ?? null
  }
}

withRom('en')('moveAnimFrames — 롬 실측', () => {
  it('이미터가 하나도 안 잘린다', async () => {
    const fileFor = await waza()
    let checked = 0
    for (const [id, anim] of MOVE_ANIMS.entries()) {
      if (anim === null || !anim.waits) continue
      const frames = moveAnimFrames(anim, fileFor)
      const member = new Map(anim.loads.map((l) => [l.ps, l.member]))
      for (const e of anim.emitters) {
        const at = member.get(e.ps)
        const res = at === undefined ? undefined : fileFor(at)?.resources[e.res]
        if (res === undefined) continue
        const life = splLifeFrames(res)
        if (life === null) continue
        checked += 1
        // ⚠️ **이것이 이 파일의 이유다.** 길이가 마흔으로 굳어 있던 동안
        // 이미터 일흔아홉 벌이 「서는 프레임」에 닿기도 전에 화면이 끝났다
        expect(e.at_frame + life, `기술 ${String(id)}`).toBeLessThanOrEqual(frames)
      }
    }
    expect(checked).toBeGreaterThan(1200)
  })

  it('길이 0인 기술이 없다', () => {
    for (const [id, anim] of MOVE_ANIMS.entries()) {
      if (anim === null) continue
      // 입자 자료 없이도(설치 전) 길이는 나와야 한다 — 없으면 기술 이름이
      // 뜨자마자 사라진다
      expect(moveAnimFrames(anim, () => null), `기술 ${String(id)}`).toBeGreaterThan(0)
    }
  })

  it('대부분이 한 벌짜리 길이보다 길다 — 그래서 고정값이 틀렸다', async () => {
    const fileFor = await waza()
    let longer = 0
    let total = 0
    let max = 0
    for (const anim of MOVE_ANIMS) {
      if (anim === null) continue
      const f = moveAnimFrames(anim, fileFor)
      total += 1
      max = Math.max(max, f)
      if (f > MOVE_FRAMES) longer += 1
    }
    expect(total).toBe(468)
    // 실측 340 — 셋에 둘이 마흔 프레임보다 길다
    expect(longer).toBeGreaterThan(300)
    // 롬에서 제일 긴 대본이 194프레임(3.2초)이다. 이보다 커지면 자료가 아니라
    // 우리 계산이 바뀐 것이다
    expect(max).toBeLessThanOrEqual(200)
  })

  it('대본이 없으면 지금까지의 한 벌로 간다', () => {
    expect(moveAnimFrames(null, () => null)).toBe(MOVE_FRAMES)
  })
})
