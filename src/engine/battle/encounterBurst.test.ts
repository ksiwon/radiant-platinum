// 배틀이 열리는 순간의 땅 이펙트를 **롬 자료로** 잰다.
import { expect, it, describe } from 'vitest'
import { readFileSync } from 'node:fs'
import { bytesSource, narcEntry, openNds } from '../../import/platinum/nds'
import { romPath, withRom } from '../../data/romData.testkit'
import { readSpa } from './spl/resource'
import { splLifeFrames } from './spl/emitter'
import { BURST, burstMembers, burstWhite, TERRAIN_BURST } from './encounterBurst'
import { Terrain } from './terrain'

const WAZA = '/wazaeffect/effectdata/waza_particle.narc'

describe('조우 이펙트 — 자료 없이', () => {
  it('땅 스물넷이 다 자기 자원을 갖는다', () => {
    expect(TERRAIN_BURST).toHaveLength(Object.keys(Terrain).length)
    for (const [i, id] of TERRAIN_BURST.entries()) {
      // 자원 번호가 5~26 안이다 (`battle_particles.order`의 `encounter_*`)
      expect(id, `땅 ${String(i)}`).toBeGreaterThanOrEqual(5)
      expect(id, `땅 ${String(i)}`).toBeLessThanOrEqual(25)
      // `_a`는 홀수 자리에서 시작한다 — `_b`가 바로 다음 번호다
      expect(id % 2, `땅 ${String(i)}`).toBe(1)
    }
    // 표를 그대로 옮겼는지 몇 자리로 확인한다 (`sTerrainFlashAnimIDs`)
    expect(burstMembers(Terrain.GRASS)).toEqual([5, 6])
    expect(burstMembers(Terrain.WATER)).toEqual([7, 8])
    expect(burstMembers(Terrain.CAVE)).toEqual([17, 18])
    expect(burstMembers(Terrain.GREAT_MARSH)).toEqual([25, 26])
    // ⚠️ 깨어진 세계만 얼음을 쓴다 — 나머지 시설은 다 실내다
    expect(burstMembers(Terrain.DISTORTION_WORLD)).toEqual([21, 22])
    expect(burstMembers(Terrain.BATTLE_TOWER)).toEqual([11, 12])
  })

  it('흰 막이 열째에 차고 스물여덟째에 걷힌다', () => {
    expect(burstWhite(0)).toBe(0)
    expect(burstWhite(BURST.whiteIn - 1)).toBe(0)
    expect(burstWhite(BURST.whiteIn + BURST.fade)).toBe(1)
    // 꼭대기에서 두 프레임 머문다 (26~28)
    expect(burstWhite(BURST.whiteOut)).toBe(1)
    expect(burstWhite(BURST.whiteOut + BURST.fade)).toBe(0)
    expect(burstWhite(BURST.hold)).toBe(0)
    // 둘째 벌은 흰색이 제일 짙어지기 전에 선다
    expect(BURST.second).toBeLessThan(BURST.whiteIn + BURST.fade)
  })
})

withRom('en')('조우 이펙트 — 롬 실측', () => {
  it('⚠️ 원작 이미터 수 표가 `.spa`의 자원 수와 스물둘 다 같다', async () => {
    // `ov12_02238088`이 `resourceID - 5`로 찾는 표다. 값이 자원 수와 같으므로
    // 「파일에 든 것을 다 세운다」로 옮겨도 어긋날 데가 없다 —
    // 그것을 **여기서 지킨다**. 표가 바뀌면 이 시험이 빨개진다
    const table = [5, 11, 6, 7, 2, 1, 2, 1, 1, 4, 3, 3, 2, 9, 1, 1, 1, 2, 1, 1, 1, 1]
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const narc = (await fs!.read(WAZA))!
    for (const [i, want] of table.entries()) {
      const file = readSpa(narcEntry(narc, 5 + i)!)
      expect(file.resources.length, `멤버 ${String(5 + i)}`).toBe(want)
    }
  })

  it('짝지은 둘이 짧게 터지고 길게 흩어진다', async () => {
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const narc = (await fs!.read(WAZA))!
    const life = (member: number): number => {
      const file = readSpa(narcEntry(narc, member)!)
      return Math.max(...file.resources.map((r) => splLifeFrames(r) ?? 0))
    }
    for (const terrain of [Terrain.PLAIN, Terrain.SAND, Terrain.PUDDLE, Terrain.ICE]) {
      const [a, b] = burstMembers(terrain)
      expect(life(a), `땅 ${String(terrain)} 첫 벌`).toBeLessThan(life(b))
    }
    // 제일 긴 것이 대본이 기다리는 122프레임 안에서 끝난다
    for (const terrain of Object.values(Terrain)) {
      const [, b] = burstMembers(terrain)
      expect(BURST.second + life(b), `땅 ${String(terrain)}`).toBeLessThanOrEqual(BURST.hold)
    }
  })
})
