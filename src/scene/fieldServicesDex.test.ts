// 스크립트가 준 마리의 도감 기록과 전국도감 완성 기준 (시원 · `Pokemon_GiveMonFromScript` · `Pokedex_NationalDexCompleted`)
//
// ⚠️ 화강돌(442)은 시원의 선물이 **유일한 「잡은 것」 길**이다. 선물이 도감에 안 적히면 전국도감 완성(잡은 482종)이
// 영영 안 찬다. 원작은 마리를 파티에 넣는 데 성공하면 `SaveData_UpdateCatchRecords`로 본 것·잡은 것을 적는다
// (`raw/decomp/src/unk_02054884.c:32-60`).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fieldScripts } from '../engine/script/field'
import { dexHas } from '../engine/pokemon/dex'
import { createNewSave, useSaveStore } from '../state/saveStore'
import { installNodeAssets, withData, withDecomp } from '../data/romData.testkit'
import { installFieldServices } from './fieldServices'

/** `sExcludedMonsNational` (`pokedex.c:15-26`) */
const EXCLUDED = [151, 249, 250, 251, 385, 386, 489, 490, 491, 492, 493]

const maybe = withData('species.json', 'moves.json')

maybe('스크립트가 준 마리가 도감에 적힌다', () => {
  let stop: () => void
  let unassets: () => void
  beforeAll(async () => {
    unassets = installNodeAssets()
    stop = installFieldServices()
    // 종·기술 표는 비동기로 온다 — 올 때까지 기다린다
    useSaveStore.setState({ ...createNewSave() })
    for (let i = 0; i < 200; i++) {
      if (fieldScripts.services.party!.give(1, 5, 0)) break
      await new Promise((r) => setTimeout(r, 25))
    }
  })
  afterAll(() => { stop(); unassets() })

  const fresh = (): void => { useSaveStore.setState({ ...createNewSave() }) }

  it('GivePokemon 갈래(`party.give`)가 본 것과 잡은 것을 적는다', () => {
    fresh()
    expect(dexHas(useSaveStore.getState().pokedex.caught, 442)).toBe(false)
    expect(fieldScripts.services.party!.give(442, 25, 0)).toBe(true)
    const dex = useSaveStore.getState().pokedex
    expect(dexHas(dex.seen, 442)).toBe(true)
    expect(dexHas(dex.caught, 442)).toBe(true)
  })

  it('운명적 만남(레지기가스)도 같다', () => {
    fresh()
    expect(fieldScripts.services.party!.giveFateful(486, 1)).toBe(true)
    expect(dexHas(useSaveStore.getState().pokedex.caught, 486)).toBe(true)
  })

  it('⚠️ 파티가 가득 차면 못 준 것이고 도감도 안 적는다', () => {
    fresh()
    const party = fieldScripts.services.party!
    for (let i = 0; i < 6; i++) expect(party.give(1, 5, 0)).toBe(true)
    expect(party.give(442, 25, 0)).toBe(false)
    expect(dexHas(useSaveStore.getState().pokedex.caught, 442)).toBe(false)
  })

  it('스타터처럼 따로 적는 길과 겹쳐도 해가 없다 — 비트 OR이라 한 번 더 적어도 그대로다', () => {
    fresh()
    const save = useSaveStore.getState()
    save.markCaught(1)
    const before = Array.from(useSaveStore.getState().pokedex.caught)
    expect(fieldScripts.services.party!.give(1, 5, 0)).toBe(true)
    expect(Array.from(useSaveStore.getState().pokedex.caught)).toEqual(before)
  })
})

describe('전국도감 완성 기준 — 열하나를 뺀다', () => {
  let stop: () => void
  let unassets: () => void
  beforeAll(() => { unassets = installNodeAssets(); stop = installFieldServices() })
  afterAll(() => { stop(); unassets() })

  const caughtAll = (skip: readonly number[]): void => {
    useSaveStore.setState({ ...createNewSave() })
    const save = useSaveStore.getState()
    for (let s = 1; s <= 493; s++) if (!skip.includes(s)) save.markCaught(s)
  }
  const done = (): boolean => fieldScripts.services.trainerInfo!.dexCompleted(true)

  it('열하나만 빼고 다 잡았으면 완성이다 (뮤 · 루기아 · 칠색조 · 세레비 · 지라치 · 테오키스 · 피오네 · 마나피 · 다크라이 · 쉐이미 · 아르세우스)', () => {
    caughtAll(EXCLUDED)
    expect(done()).toBe(true)
  })

  it('⚠️ 셋만 빼던 옛 기준이면 여기서 막혔다 — 뮤 하나 안 잡아도 완성이다', () => {
    caughtAll([151])
    expect(done()).toBe(true)
  })

  it('뺀 열하나 말고 하나라도 빠지면 아니다 — 화강돌(442)도 마찬가지', () => {
    caughtAll([...EXCLUDED, 442])
    expect(done()).toBe(false)
    caughtAll([...EXCLUDED, 1])
    expect(done()).toBe(false)
  })

  it('UI 쪽 `nationalDexCompleted`와 같은 판정이다', async () => {
    const { nationalDexCompleted } = await import('../ui/menu/dexCounts')
    for (const skip of [EXCLUDED, [...EXCLUDED, 442], [...EXCLUDED, 1], []]) {
      caughtAll(skip)
      expect(done()).toBe(nationalDexCompleted(useSaveStore.getState().pokedex.caught))
    }
  })
})

const scripts = withDecomp(
  'res/field/scripts/scripts_counterpart_talk.s',
  'res/field/scripts/scripts_grand_lake_valor_lakefront_west_house.s',
)

scripts('전국도감 상장 둘은 `CheckNationalDexCompleted`가 연다', () => {
  const read = (name: string): string => readFileSync(
    resolve(__dirname, '../../raw/decomp/res/field/scripts', name), 'utf8')

  it('두 스크립트가 그 명령으로 갈라진다 — 위 판정이 곧 상장이 열리는 조건이다', () => {
    for (const file of ['scripts_counterpart_talk.s', 'scripts_grand_lake_valor_lakefront_west_house.s']) {
      expect(read(file), file).toMatch(/CheckNationalDexCompleted VAR_RESULT/)
    }
  })
})
