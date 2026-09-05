// 이미터를 **롬의 자료로** 굴려 본다.
//
// ⚠️ **「안 터진다」로는 모자란다.** 입자계는 값이 조용히 틀려도 그럴듯한 그림이
// 나온다 — 그래서 여기서 재는 것은 성질이다: 뿜은 만큼 살고, 수명이 다하면 죽고,
// 자리가 발산하지 않고, 같은 씨앗이면 **같은 그림**이 나온다.
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { bytesSource, narcCount, narcEntry, openNds } from '../../../import/platinum/nds'
import { romPath, withRom } from '../../../data/romData.testkit'
import { readSpa, type SplFile } from './resource'
import { SplEmitter, splLifeFrames } from './emitter'
import { FX32_ONE, SplRandom } from './fx'

const WAZA = '/wazaeffect/effectdata/waza_particle.narc'

async function narcOf(path: string): Promise<Uint8Array> {
  const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
  return (await fs!.read(path))!
}

/** 한 벌을 프레임만큼 굴리고 본 것을 모은다 */
function run(file: SplFile, index: number, frames: number, seed = 1): {
  peak: number
  born: number
  maxAbs: number
  finiteAll: boolean
} {
  const e = new SplEmitter(file.resources[index]!, seed)
  let peak = 0
  let born = 0
  let maxAbs = 0
  let finiteAll = true
  let seen = 0
  for (let f = 0; f < frames; f++) {
    e.update()
    const live = e.particles.length + e.children.length
    if (live > peak) peak = live
    if (live > seen) born += live - seen
    seen = live
    for (const p of [...e.particles, ...e.children]) {
      for (const v of [p.position.x, p.position.y, p.position.z]) {
        if (!Number.isFinite(v)) finiteAll = false
        else maxAbs = Math.max(maxAbs, Math.abs(v))
      }
      if (!Number.isFinite(p.baseScale) || !Number.isFinite(p.animScale)) finiteAll = false
    }
  }
  return { peak, born, maxAbs, finiteAll }
}

withRom('en')('이미터 — 롬 실측', () => {
  it('기술 입자 485벌을 60프레임씩 굴려도 값이 안 터진다', async () => {
    const narc = await narcOf(WAZA)
    const n = narcCount(narc)!
    let ran = 0
    let emitted = 0
    const noParticles: number[] = []
    for (let i = 0; i < n; i++) {
      const file = readSpa(narcEntry(narc, i)!)
      for (let r = 0; r < file.resources.length; r++) {
        const out = run(file, r, 60)
        ran++
        expect(out.finiteAll, `${String(i)}#${String(r)} 값이 유한하지 않다`).toBe(true)
        // ⚠️ **자리가 4,096타일을 넘으면 고정소수가 넘친 것이다** — 화면에서는
        // 「아무것도 안 보인다」로만 나타나서 눈으로는 못 잡는다
        expect(out.maxAbs, `${String(i)}#${String(r)} 자리가 발산했다`)
          .toBeLessThan(4096 * FX32_ONE)
        if (out.born > 0) emitted++
        else noParticles.push(i)
      }
    }
    // 실측: 기술 입자 485벌에 리소스가 1,468개다
    expect(ran).toBe(1468)
    // 대부분은 실제로 뿜는다. 안 뿜는 것은 `startDelay`가 60프레임보다 긴 것들이다
    expect(emitted / ran).toBeGreaterThan(0.9)
  })

  it('같은 씨앗이면 같은 그림이 나온다 — 화면을 견줄 수 있어야 한다', async () => {
    const narc = await narcOf(WAZA)
    const file = readSpa(narcEntry(narc, 63)!)
    const a = run(file, 0, 40, 7)
    const b = run(file, 0, 40, 7)
    expect(a).toEqual(b)
  })

  it('씨앗이 다르면 그림도 다르다', async () => {
    const narc = await narcOf(WAZA)
    const file = readSpa(narcEntry(narc, 63)!)
    // 자리까지 같은지 본다 — 개수만 보면 우연히 같을 수 있다
    const trace = (seed: number): string => {
      const e = new SplEmitter(file.resources[0]!, seed)
      const out: number[] = []
      for (let f = 0; f < 20; f++) {
        e.update()
        for (const p of e.particles) out.push(p.position.x, p.position.y)
      }
      return out.join(',')
    }
    expect(trace(1)).not.toBe(trace(2))
  })

  // 몸통박치기 0번: 한 번에 넷씩 · 사이 1프레임 · 이미터 수명 2 · 입자 수명 19.
  // 그래서 **여덟이 났다가 스물한 프레임 안에 다 죽는다** — 그 모양을 그대로 잰다
  it('뿜은 만큼 살고 수명이 다하면 사라진다', async () => {
    const narc = await narcOf(WAZA)
    const file = readSpa(narcEntry(narc, 63)!)
    const h = file.resources[0]!.header
    expect(h.emissionCount).toBe(4 * 4096)
    expect(h.emitterLifeTime).toBe(2)
    expect(h.particleLifeTime).toBe(19)

    const e = new SplEmitter(file.resources[0]!, 3)
    let peak = 0
    for (let f = 0; f < 21; f++) { e.update(); peak = Math.max(peak, e.particles.length) }
    // 두 번 뿜고 멈춘다 — 넷씩 여덟
    expect(peak).toBe(8)
    expect(e.particles.length).toBe(0)

    // ⚠️ **자식이 남아 있으면 아직 안 끝난 것이다.** 몸통박치기는 부모마다 자식을
    // 뿌리므로(`hasChildResource`) 부모가 다 죽어도 자식이 제 수명을 산다 —
    // 여기를 부모만 보고 끝났다고 하면 대본이 연출 도중에 다음 줄로 넘어간다
    expect(h.flags.hasChildResource).toBe(true)
    expect(e.children.length).toBeGreaterThan(0)
    expect(e.done).toBe(false)

    let frames = 0
    while (!e.done && frames < 600) { e.update(); frames++ }
    expect(e.done).toBe(true)
    expect(e.children.length).toBe(0)
  })

  it('스스로 안 끝나는 이미터는 부른 쪽이 끝낼 때까지 산다', async () => {
    const narc = await narcOf(WAZA)
    // 되풀이하는 자료를 하나 찾는다 — `selfMaintaining`이 꺼진 것
    const file = readSpa(narcEntry(narc, 63)!)
    const res = file.resources[0]!
    const e = new SplEmitter(res, 5)
    for (let f = 0; f < 40; f++) e.update()
    if (!res.header.flags.selfMaintaining) {
      expect(e.done).toBe(false)
      e.terminated = true
      for (let f = 0; f < 40; f++) e.update()
      expect(e.done).toBe(true)
    } else {
      expect(e.done).toBe(true)
    }
  })

  it('난수가 원작 수열이다 — 씨앗 하나에서 나온 앞 넷', () => {
    // `state = state * 0x5eedf715 + 0x1b0cb173` (`SPLRandom_Next`)
    const r = new SplRandom(0)
    const want: number[] = []
    let s = 0
    for (let i = 0; i < 4; i++) {
      s = (Math.imul(s, 0x5eedf715) + 0x1b0cb173) >>> 0
      want.push(s)
    }
    expect([r.next(), r.next(), r.next(), r.next()]).toEqual(want)
    // 32비트를 넘지 않는다
    expect(want.every((v) => v >= 0 && v <= 0xffffffff)).toBe(true)
  })
})

withRom('en')('splLifeFrames — 롬 실측', () => {
  it('굴려서 나온 길이를 한 번도 안 넘는다 (씨앗을 바꿔 가며)', async () => {
    const narc = await narcOf(WAZA)
    // ⚠️ **상한이라는 말을 증명한다.** 씨앗 하나로 재면 다른 판에서 꼬리가
    // 잘린다 — 원작 난수(`SPLRandom_ScaledRange`)가 수명을 **줄이기만** 하므로
    // 헤더로 낸 값이 모든 씨앗의 위끝이어야 한다
    const seeds = [7, 0x1234_5678, 1, 99_991]
    let checked = 0
    let tight = Number.POSITIVE_INFINITY
    for (let m = 0; m < narcCount(narc)!; m++) {
      const file = readSpa(narcEntry(narc, m)!)
      for (const res of file.resources) {
        const bound = splLifeFrames(res)
        if (bound === null) continue
        checked += 1
        for (const seed of seeds) {
          const e = new SplEmitter(res, seed)
          let got = -1
          for (let f = 0; f < bound + 200; f++) {
            e.update()
            if (e.done) {
              got = f + 1
              break
            }
          }
          expect(got, `멤버 ${String(m)} 씨앗 ${String(seed)}`).toBeGreaterThan(0)
          expect(got, `멤버 ${String(m)} 씨앗 ${String(seed)}`).toBeLessThanOrEqual(bound)
          tight = Math.min(tight, bound - got)
        }
      }
    }
    expect(checked).toBeGreaterThan(1400)
    // 넉넉한 값을 내놓고 「안 넘었다」고 하면 안 된다 — 실제로 딱 맞는 자원이 있다
    expect(tight).toBe(0)
  })

  it('스스로 안 끝나는 자원은 길이를 안 내놓는다', async () => {
    const narc = await narcOf(WAZA)
    let never = 0
    for (let m = 0; m < narcCount(narc)!; m++) {
      for (const res of readSpa(narcEntry(narc, m)!).resources) {
        if (splLifeFrames(res) === null) never += 1
      }
    }
    // `selfMaintaining`이 꺼진 자원들이다. 원작도 `UnloadParticleSystem`이
    // 걷어 갈 때까지 살아서 `WaitForAllEmitters`로는 못 센다
    expect(never).toBeGreaterThan(0)
  })
})
