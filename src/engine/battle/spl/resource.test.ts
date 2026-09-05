// `.spa` 파서를 **롬의 것 전부**로 잰다.
//
// ⚠️ **이 시험의 값은 「읽혔다」가 아니라 「자리가 맞았다」다.** 리소스를 다 읽은
// 자리가 머리의 `texOffset`과 같고, 텍스처를 다 읽은 자리가 파일 끝과 같아야
// `readSpa`가 던지지 않는다 — 구조체 크기를 하나라도 틀리면 그 뒤가 밀려서
// **그럴듯한 쓰레기**가 나오는데, 이 두 자리가 그것을 못 지나가게 한다.
import { expect, it } from 'vitest'
import { openNds, bytesSource, narcCount, narcEntry } from '../../../import/platinum/nds'
import { readSpa } from './resource'
import { romPath, withRom } from '../../../data/romData.testkit'
import { readFileSync } from 'node:fs'

/** 입자가 든 NARC 여덟 (`platinum.us/filesys.csv`) */
const NARCS = [
  '/wazaeffect/effectdata/waza_particle.narc',
  '/wazaeffect/effectdata/ball_particle.narc',
  '/demo/egg/data/particle/egg_demo_particle.narc',
  '/demo/shinka/data/particle/shinka_demo_particle.narc',
  '/particledata/pl_frontier/frontier_particle.narc',
  '/particledata/pl_pokelist/pokelist_particle.narc',
  '/particledata/pl_etc/pl_etc_particle.narc',
  '/particledata/particledata.narc',
] as const

/** 바이트로 ` `·A·P·S. 리틀엔디언 u32로 읽은 값이다 */
const MAGIC = 0x53504120

withRom('en')('.spa 파서 — 롬 실측', () => {
  it('입자 NARC 여덟의 멤버를 하나도 안 빼고 읽는다', async () => {
    const path = romPath('en')!
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(path))))
    expect(fs).not.toBeNull()

    let members = 0
    let read = 0
    let resources = 0
    let textures = 0
    const formats = new Set<number>()
    const draws = new Set<number>()

    for (const narcPath of NARCS) {
      const narc = await fs!.read(narcPath)
      expect(narc, narcPath).not.toBeNull()
      const n = narcCount(narc!)
      expect(n, narcPath).not.toBeNull()
      for (let i = 0; i < n!; i++) {
        const bytes = narcEntry(narc!, i)!
        members++
        // 입자가 아닌 멤버가 섞여 있으면 건너뛴다 — 지금 롬에는 없다
        const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        if (bytes.length < 32 || head.getUint32(0, true) !== MAGIC) continue
        const file = readSpa(bytes)
        read++
        resources += file.resources.length
        textures += file.textures.length
        for (const t of file.textures) formats.add(t.format)
        for (const r of file.resources) draws.add(r.header.flags.drawType)
      }
    }

    // 실측 (2026-09-05, 미국판). **이 수가 갈리면 롬이 다른 것이거나 파서가 틀렸다**
    expect(members).toBe(623)
    expect(read).toBe(623)
    expect(resources).toBe(1857)
    expect(textures).toBe(1765)

    // ⚠️ **텍스처 형식이 셋뿐이다** — A3I5(1) · 팔레트 4색(2) · A5I3(6).
    // 셋 다 `import/platinum/nitrotex`가 이미 푸는 것이라 새 디코더가 없다
    expect([...formats].sort((a, b) => a - b)).toEqual([1, 2, 6])

    // ⚠️ **방향 폴리곤(3·4)은 한 벌도 안 쓴다.** 그릴 갈래를 셋만 만들면 된다
    expect([...draws].sort((a, b) => a - b)).toEqual([0, 1, 2])
  })

  it('몸통박치기(63번)의 값이 원작 그대로다', async () => {
    const path = romPath('en')!
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(path))))
    const narc = await fs!.read('/wazaeffect/effectdata/waza_particle.narc')
    // `battle_particles.order`의 64번째 줄이 `tackle.spa`다 (0부터 세어 63)
    const file = readSpa(narcEntry(narc!, 63)!)

    expect(file.resources).toHaveLength(2)
    expect(file.textures).toHaveLength(3)

    const first = file.resources[0]!
    // 수명·개수는 프레임과 fx32다 — 0이면 아무것도 안 뿜는다
    expect(first.header.particleLifeTime).toBeGreaterThan(0)
    expect(first.header.emissionCount).toBeGreaterThan(0)
    // 그리는 갈래는 셋 안에 든다
    expect(first.header.flags.drawType).toBeLessThanOrEqual(2)
  })

  it('자식은 제 그리기 갈래를 들고 있다 — 부모 것과 다를 수 있다', async () => {
    const path = romPath('en')!
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(path))))
    const kind = [0, 0, 0, 0, 0]
    let kids = 0
    let differ = 0
    for (const narcPath of NARCS) {
      const narc = await fs!.read(narcPath)
      for (let i = 0; i < narcCount(narc!)!; i++) {
        for (const r of readSpa(narcEntry(narc!, i)!).resources) {
          const c = r.child
          if (c === null || !r.header.flags.hasChildResource) continue
          kids++
          kind[c.drawType]!++
          if (c.drawType !== r.header.flags.drawType) differ++
        }
      }
    }
    // 실측 (2026-09-05, 미국판)
    expect(kids).toBe(856)
    expect(kind).toEqual([788, 64, 4, 0, 0])
    // ⚠️ **62벌이 부모와 다르다.** 부모 갈래를 물려주면 그만큼이 틀리게 그려진다 —
    // 원작은 `childResource->flags.drawType`으로 함수를 따로 고른다
    // (`SPLManager_DrawChildParticles`)
    expect(differ).toBe(62)
  })

  it('.spa가 아닌 바이트는 거절한다 — 조용히 쓰레기를 읽지 않는다', () => {
    expect(() => readSpa(new Uint8Array(64))).toThrow(/spa가 아니다/)
  })
})
