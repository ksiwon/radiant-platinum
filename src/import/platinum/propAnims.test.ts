// 소품 애니 목차를 **디컴프와 바이트로** 견준다.
//
// ⚠️ **줄 크기가 하나만 틀려도 조용히 밀린다.** 20바이트가 아니면 그 뒤 소품이
// 전부 남의 애니를 가리키는데, 화면에서는 「문이 안 열린다」로만 보인다.
import { expect, it, describe } from 'vitest'
import { readFileSync } from 'node:fs'
import { bytesSource, openNds } from './nds'
import { romPath, withRom } from '../../data/romData.testkit'
import { buildPropAnims, DOOR_KIND, readAnimeList } from './propAnims'

const LIST = '/arc/bm_anime_list.narc'
const ANIM = '/arc/bm_anime.narc'
const MODELS = '/fielddata/build_model/build_model.narc'

describe('문 표', () => {
  it('원작이 찾는 스무 종을 다 든다', () => {
    // `DoorAnimation_FindDoorAndLoad`의 `doorModelIDs[]`가 스무 칸이다
    expect(Object.keys(DOOR_KIND)).toHaveLength(20)
    // 미닫이 여섯 · 백화점 종소리 하나 · 나머지가 여닫이
    const kinds = Object.values(DOOR_KIND)
    expect(kinds.filter((k) => k === 'sliding')).toHaveLength(6)
    expect(kinds.filter((k) => k === 'chime')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'hinged')).toHaveLength(13)
  })
})

withRom('en')('소품 애니 목차 — 롬 실측', () => {
  it('멤버 590개가 다 20바이트고 소품 수와 같다', async () => {
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const list = (await fs!.read(LIST))!
    const models = (await fs!.read(MODELS))!
    const rows = readAnimeList(list)
    // 크기가 틀리면 `readAnimeList`가 던진다 — 여기 오면 다 20바이트다
    expect(rows).toHaveLength(590)
    const { narcCount } = await import('./nds')
    expect(narcCount(models)).toBe(rows.length)
  })

  it('애니 있는 소품이 112개고 자전거 비탈이 정확히 둘이다', async () => {
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const index = buildPropAnims((await fs!.read(LIST))!, (await fs!.read(ANIM))!)

    expect(Object.keys(index.props)).toHaveLength(112)
    // ⚠️ **이 둘이 구조체를 제대로 읽었다는 증거다** — 303·304가
    // `map_prop_models.order`의 `bike_muddy_slope`·`bike_dungeon_muddy_slope`다
    expect(index.slopes).toEqual([303, 304])

    // 애니 개수별 소품 수 (실측)
    const by: Record<number, number> = {}
    for (const ids of Object.values(index.props)) by[ids.length] = (by[ids.length] ?? 0) + 1
    expect(by).toEqual({ 1: 81, 2: 19, 3: 1, 4: 11 })
  })

  it('애니 멤버 98개를 하나도 안 남기고 쓴다', async () => {
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const index = buildPropAnims((await fs!.read(LIST))!, (await fs!.read(ANIM))!)
    expect(index.members).toHaveLength(98)
    const used = new Set(Object.values(index.props).flat())
    expect(used.size).toBe(98)
    // 꼴이 셋뿐이다
    const kinds: Record<string, number> = {}
    for (const m of index.members) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1
    expect(kinds).toEqual({ BTA0: 43, BCA0: 32, BTP0: 23 })
    // 프레임 수가 0인 것이 없어야 한다 — 0이면 그 연출이 한 프레임에 끝난다
    for (const [at, m] of index.members.entries()) {
      expect(m.frames, `멤버 ${String(at)}`).toBeGreaterThan(0)
    }
  })

  it('여닫이는 클립 넷 · 미닫이는 둘이다', async () => {
    const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
    const index = buildPropAnims((await fs!.read(LIST))!, (await fs!.read(ANIM))!)
    for (const [id, kind] of Object.entries(DOOR_KIND)) {
      const ids = index.props[id]
      expect(ids, `문 ${id}`).toBeDefined()
      // 원작은 열 때 0번, 닫을 때 1번을 튼다 — 둘이든 넷이든 앞의 둘만 쓴다
      expect(ids!.length, `문 ${id} (${kind})`).toBeGreaterThanOrEqual(2)
      for (const at of ids!.slice(0, 2)) {
        expect(index.members[at]!.frames, `문 ${id} 클립 ${String(at)}`).toBeGreaterThan(1)
      }
    }
    // 여닫이 넷 · 미닫이 둘 (`door01` 66 · `pokecenter_door` 70)
    expect(index.props['66']).toHaveLength(4)
    expect(index.props['70']).toHaveLength(2)
  })
})
