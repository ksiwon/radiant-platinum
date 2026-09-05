// 굽는 쪽 둘이 **바이트로** 같은가 (「굽는 쪽이 둘이다」).
//
// ⚠️ **개발 서버와 설치본이 갈리는 자리가 여기다.** 노드 추출기가 만든
// `public/data/particles`는 개발 서버가 그대로 주고, 설치본은 브라우저 변환기가
// 롬에서 새로 굽는다 — 둘이 다르면 「개발에서는 되는데 설치본에서만」이 된다.
import { expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { bytesSource, openNds } from './nds'
import { PARTICLE_NARCS, packNarc, type ParticleIndex } from './particles'
import { readSpa } from '../../engine/battle/spl/resource'
import { DATA, romPath, withRom } from '../../data/romData.testkit'

withRom('en')('입자 자료 — 굽는 쪽 둘', () => {
  it('브라우저가 구운 바이트가 노드 산출물과 같다', async () => {
    const dir = resolve(DATA, 'particles')
    if (!existsSync(resolve(dir, 'index.json'))) {
      throw new Error('public/data/particles가 없다 — `pnpm extract:particles`를 먼저 돌린다')
    }
    const index = JSON.parse(
      readFileSync(resolve(dir, 'index.json'), 'utf8')) as ParticleIndex

    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    let members = 0
    for (const group of PARTICLE_NARCS) {
      const narc = await fs!.read(group.path)
      expect(narc, group.path).not.toBeNull()
      const { bytes, pack } = packNarc(narc!, group.name)
      const node = new Uint8Array(readFileSync(resolve(dir, `${group.name}.bin`)))
      expect(bytes.length, `${group.name} 길이`).toBe(node.length)
      // 바이트로 견준다 — 크기만 같고 속이 다른 것을 지나 보내지 않는다
      expect(Buffer.from(bytes).equals(Buffer.from(node)), `${group.name} 바이트`).toBe(true)
      expect(pack.at, `${group.name} 자리표`).toEqual(index[group.name]!.at)
      expect(pack.size, `${group.name} 크기표`).toEqual(index[group.name]!.size)
      members += pack.at.length
    }
    expect(members).toBe(623)
  })

  it('자리표대로 잘라 내면 그대로 읽힌다', () => {
    const dir = resolve(DATA, 'particles')
    const index = JSON.parse(
      readFileSync(resolve(dir, 'index.json'), 'utf8')) as ParticleIndex
    let read = 0
    let resources = 0
    let empty = 0
    for (const group of PARTICLE_NARCS) {
      const bin = new Uint8Array(readFileSync(resolve(dir, `${group.name}.bin`)))
      const pack = index[group.name]!
      for (const [i, at] of pack.at.entries()) {
        // 자리표가 한 칸이라도 밀리면 여기서 던진다 (`readSpa`가 끝자리를 잰다)
        const file = readSpa(bin.subarray(at, at + pack.size[i]!))
        resources += file.resources.length
        if (file.resources.length === 0) empty++
        read++
      }
    }
    expect(read).toBe(623)
    expect(resources).toBe(1857)
    // ⚠️ **리소스가 0개인 자료가 실제로 있다** (기술 입자에 몇 벌). 빈 껍데기이지
    // 자르기가 틀린 것이 아니다 — 갯수를 못 박아 두어 늘면 알아채게 한다
    expect(empty).toBe(34)
  })
})
