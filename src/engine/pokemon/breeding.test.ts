// 알과 육성가 검증 (PARITY §3.2·§3.3)
//
// **진짜 종족표 위에서 잰다.** 손으로 만든 두 마리로는 "알 그룹을 안 본다"를
// 못 잡는데, 그게 이 계통에서 제일 조용한 실패다 — 아무 둘이나 맡겨도 알이
// 나오면 게임이 안 된다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { speciesFileSchema, type Species } from '../../data/schema'
import { withData } from '../../data/romData.testkit'
import {
  Compatibility, EggGroup, HATCHED_FRIENDSHIP, INCENSE_BABIES, INHERITED_IVS,
  compatibility, daycareStep, eggCycleLength, eggMoveset, eggSpeciesAndParents,
  hatch, hatchStep, incenseSpecies, inheritedIvs, newDaycare, offspringPid,
  voltTackle, type DaycareState,
} from './breeding'
import { ABILITY_FLAME_BODY, ABILITY_MAGMA_ARMOR } from './breeding'
import type { PokemonInstance } from './instance'
import { noOrigin } from './origin'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('species.json')

maybe('알과 육성가', () => {
  const file = speciesFileSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'species.json'), 'utf8')),
  )
  const byId = new Map(file.species.map((s) => [s.id, s]))
  const dataOf = (id: number): Species => {
    const s = byId.get(id)
    if (!s) throw new Error(`종족 ${String(id)}이 표에 없다`)
    return s
  }
  const babyOf = file.babyOf

  /** 그 종의 개체 하나. 성별은 PID 하위 바이트가 정한다 */
  const mon = (species: number, over: Partial<PokemonInstance> = {}): PokemonInstance => ({
    species, pid: 0, nickname: null, exp: 0, level: 20,
    ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [], hp: 30, status: 'ok', statusTurns: 0, heldItem: 0,
    origin: noOrigin({ name: '', gender: 'male' }),
    friendship: 70, isEgg: false, otId: 1, otSecretId: 1, ball: 4, form: 0, pokerus: 0, ...over,
  })
  /** 암컷이 되는 PID — 성비 문턱보다 낮은 하위 바이트 */
  const female = 0
  const male = 0xff

  const pair = (a: PokemonInstance, b: PokemonInstance): DaycareState => ({
    slots: [{ mon: a, steps: 0, levelIn: a.level }, { mon: b, steps: 0, levelIn: b.level }],
    eggPid: 0,
    cycle: 0,
  })

  const DITTO = 132, TURTWIG = 387, PIKACHU = 25, PICHU = 172

  it('알 그룹이 종족표에서 온다 — 미발견 그룹이 실제로 있다', () => {
    // 전설과 아기는 EGG_GROUP_UNDISCOVERED다. 하나도 없으면 표를 잘못 읽은 것
    const undiscovered = file.species.filter((s) => s.eggGroups[0] === EggGroup.UNDISCOVERED)
    expect(undiscovered.length).toBeGreaterThan(30)
    expect(dataOf(DITTO).eggGroups[0]).toBe(EggGroup.DITTO)
  })

  it('궁합 넷이 원작 값 그대로다 — 0 · 20 · 50 · 70', () => {
    const a = mon(TURTWIG, { pid: female })
    const b = mon(TURTWIG, { pid: male })
    // 같은 종 · 같은 트레이너 → 50
    expect(compatibility(a, b, dataOf)).toBe(Compatibility.MED)
    // 같은 종 · 다른 트레이너 → 70
    expect(compatibility(a, { ...b, otId: 2 }, dataOf)).toBe(Compatibility.MAX)
    // 같은 성별 → 0
    expect(compatibility(a, { ...b, pid: female }, dataOf)).toBe(Compatibility.NONE)
    // 메타몽 · 같은 트레이너 → 20
    expect(compatibility(a, mon(DITTO), dataOf)).toBe(Compatibility.LOW)
    // 메타몽 둘 → 0
    expect(compatibility(mon(DITTO), mon(DITTO), dataOf)).toBe(Compatibility.NONE)
  })

  it('전설은 아무와도 안 맞는다', () => {
    const legend = file.species.find((s) => s.eggGroups[0] === EggGroup.UNDISCOVERED)!
    expect(compatibility(mon(legend.id), mon(DITTO), dataOf)).toBe(Compatibility.NONE)
  })

  it('알 그룹이 안 겹치면 0이다', () => {
    // 표에서 그룹이 하나도 안 겹치는 암수 한 쌍을 실제로 찾는다
    const breedable = file.species.filter((s) =>
      s.eggGroups[0] !== EggGroup.UNDISCOVERED && s.eggGroups[0] !== EggGroup.DITTO
      && s.genderRatio > 0 && s.genderRatio < 254)
    const a = breedable[0]!
    const other = breedable.find((s) =>
      !s.eggGroups.some((g) => a.eggGroups.includes(g)))!
    expect(other, '그룹이 안 겹치는 종이 표에 있어야 한다').toBeTruthy()
    expect(compatibility(
      mon(a.id, { pid: female }), mon(other.id, { pid: male }), dataOf,
    )).toBe(Compatibility.NONE)
  })

  it('알에서는 계통의 맨 앞이 나온다 — 피카츄를 맡기면 피츄다', () => {
    const state = pair(mon(PIKACHU, { pid: female }), mon(PIKACHU, { pid: male }))
    expect(eggSpeciesAndParents(state, babyOf, dataOf)?.species).toBe(PICHU)
    // 어미 쪽이 종족을 준다. 메타몽이 섞이면 메타몽이 아닌 쪽이다
    const withDitto = pair(mon(DITTO), mon(PIKACHU, { pid: male }))
    expect(eggSpeciesAndParents(withDitto, babyOf, dataOf)?.species).toBe(PICHU)
  })

  it('향로를 안 들리면 아기가 아니라 어른이 나온다', () => {
    for (const [baby, incense, grown] of INCENSE_BABIES) {
      const empty = pair(mon(1), mon(1))
      expect(incenseSpecies(baby, empty), `${String(baby)}`).toBe(grown)
      const holding = pair(mon(1, { heldItem: incense }), mon(1))
      expect(incenseSpecies(baby, holding), `${String(baby)} + 향로`).toBe(baby)
    }
    // 아기표에 없는 종은 그대로다
    expect(incenseSpecies(TURTWIG, pair(mon(1), mon(1)))).toBe(TURTWIG)
  })

  it('개체값을 늘 셋 물려받는다 — 원작 버그는 안 옮긴다', () => {
    // ⚠️ 원작은 지우는 자리를 잘못 골라(`RemoveIVIndexFromList(availableIVs, i)`)
    // 같은 능력치를 두 번 뽑는다. 자기 모순이라 안 옮긴다 (BUGS.md §1.4)
    const mother = mon(TURTWIG, { ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } })
    const father = mon(TURTWIG, { ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } })
    const base = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }
    let seed = 1
    const rng = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const counts = new Map<number, number>()
    for (let i = 0; i < 4000; i++) {
      const ivs = inheritedIvs(mother, father, base, rng)
      const changed = Object.values(ivs).filter((v) => v !== 15).length
      counts.set(changed, (counts.get(changed) ?? 0) + 1)
    }
    // 부모 둘의 값(31·0)이 다 기준값 15와 달라서, 물려받은 자리는 **반드시**
    // 바뀐다. 그래서 바뀐 칸 수가 곧 서로 다른 자리의 수다
    expect([...counts], '4천 판 전부 정확히 셋').toEqual([[INHERITED_IVS, 4000]])
  })

  it('변함없는돌은 반쯤만 먹는다 — 4세대의 그 한 줄', () => {
    const ITEM_EVERSTONE = 230
    const mother = mon(DITTO, { pid: 7, heldItem: ITEM_EVERSTONE })
    const state = pair(mother, mon(TURTWIG, { pid: male }))
    let seed = 99
    const rng = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    // 동전이 뒤면 물려받는다 — 그 부모와 **같은 성격**이 나올 때까지 다시 굴린다
    for (let i = 0; i < 20; i++) {
      expect(offspringPid(state, rng, () => false) % 25).toBe(mother.pid % 25)
    }
    // 앞이면 안 물려받는다. 스무 번 굴려 성격이 하나로 몰리지 않는다
    const natures = new Set(
      Array.from({ length: 40 }, () => offspringPid(state, rng, () => true) % 25),
    )
    expect(natures.size).toBeGreaterThan(5)
  })

  it('알 기술은 **아비**가 물려준다', () => {
    const baby = dataOf(TURTWIG)
    expect(baby.eggMoves.length, '모부기는 알 기술이 있다').toBeGreaterThan(0)
    const eggMove = baby.eggMoves[0]!
    const father = mon(TURTWIG, { moves: [{ move: eggMove, pp: 10, ppUps: 0 }] })
    const mother = mon(TURTWIG, { moves: [] })
    const got = eggMoveset({
      baby, mother, father, ppOf: () => 10, tmMoves: [], canLearnTm: () => false,
    })
    expect(got.map((m) => m.move)).toContain(eggMove)
    // 어미가 갖고 있어도 안 넘어간다
    const flipped = eggMoveset({
      baby, mother: father, father: mother, ppOf: () => 10, tmMoves: [], canLearnTm: () => false,
    })
    expect(flipped.map((m) => m.move)).not.toContain(eggMove)
  })

  it('레벨 1 기술은 기본으로 붙고 네 칸을 안 넘는다', () => {
    const baby = dataOf(TURTWIG)
    const got = eggMoveset({
      baby, mother: mon(TURTWIG), father: mon(TURTWIG),
      ppOf: () => 10, tmMoves: [], canLearnTm: () => false,
    })
    expect(got.length).toBeGreaterThan(0)
    expect(got.length).toBeLessThanOrEqual(4)
    const first = baby.learnset.filter((e) => e.level <= 1).map((e) => e.move)
    for (const move of first.slice(-4)) expect(got.map((m) => m.move)).toContain(move)
  })

  it('전기구슬을 들려 두면 피츄가 볼테커를 갖고 나온다', () => {
    const ITEM_LIGHT_BALL = 237
    const MOVE_VOLT_TACKLE = 344
    const withBall = pair(mon(PIKACHU, { heldItem: ITEM_LIGHT_BALL }), mon(DITTO))
    expect(voltTackle(PICHU, withBall, [], () => 15).map((m) => m.move))
      .toEqual([MOVE_VOLT_TACKLE])
    // 안 들렸으면 안 붙고, 피츄가 아니면 애초에 안 본다
    expect(voltTackle(PICHU, pair(mon(PIKACHU), mon(DITTO)), [], () => 15)).toEqual([])
    expect(voltTackle(TURTWIG, withBall, [], () => 15)).toEqual([])
  })

  it('부화 걸음은 보통 1, 마그마의무장·불꽃몸이 있으면 2다', () => {
    const party = [mon(TURTWIG)]
    expect(hatchStep(party, () => 1)).toBe(1)
    expect(hatchStep(party, () => ABILITY_MAGMA_ARMOR)).toBe(2)
    expect(hatchStep(party, () => ABILITY_FLAME_BODY)).toBe(2)
    // ⚠️ **알은 안 센다.** 알이 자기를 데울 수는 없다
    expect(hatchStep([mon(TURTWIG, { isEgg: true })], () => ABILITY_FLAME_BODY)).toBe(1)
  })

  it('알 주기가 보통 255이고 열두 날만 230이다', () => {
    expect(eggCycleLength(6, 5)).toBe(255)
    expect(eggCycleLength(2, 14)).toBe(230) // 발렌타인
    expect(eggCycleLength(9, 28)).toBe(230) // 다이아·펄 일본 발매일
    const short = [...Array(12).keys()].flatMap((m) =>
      [...Array(31).keys()].filter((d) => eggCycleLength(m + 1, d + 1) === 230))
    expect(short).toHaveLength(12)
  })

  it('한 걸음마다 맡긴 마리의 걸음이 는다', () => {
    const world = {
      daycare: pair(mon(TURTWIG, { pid: female }), mon(TURTWIG, { pid: male })),
      party: [], month: 6, day: 5,
      abilityOf: () => 1, dataOf, rng: () => 0.99, coin: () => true,
    }
    const got = daycareStep(world)
    expect(got.daycare.slots[0]?.steps).toBe(1)
    expect(got.daycare.slots[1]?.steps).toBe(1)
    expect(got.daycare.cycle).toBe(1)
  })

  it('알은 256걸음에 한 번만 생긴다 — 걸음마다가 아니다', () => {
    let state = pair(mon(TURTWIG, { pid: female }), mon(TURTWIG, { pid: male, otId: 2 }))
    let made = -1
    for (let i = 0; i < 600; i++) {
      const got = daycareStep({
        daycare: state, party: [], month: 6, day: 5,
        abilityOf: () => 1, dataOf,
        // 궁합 70 > 0이라 판정이 도는 걸음에서는 반드시 생긴다
        rng: () => 0.5, coin: () => true,
      })
      state = got.daycare
      if (state.eggPid !== 0 && made < 0) made = i
    }
    // 걸음이 255가 되는 순간이다 — 0부터 세니 255번째 호출(i = 254)
    expect(made, '255걸음째에 처음 생긴다').toBe(254)
  })

  it('알 주기 한 바퀴마다 부화 걸음이 깎이고, 0이 되면 부화한다', () => {
    const egg = mon(TURTWIG, { isEgg: true, friendship: 2 })
    let party = [egg]
    let daycare: DaycareState = newDaycare()
    let hatchedAt = -1
    for (let i = 0; i < 255 * 3; i++) {
      const got = daycareStep({
        daycare, party, month: 6, day: 5,
        abilityOf: () => 1, dataOf, rng: () => 0.99, coin: () => true,
      })
      daycare = got.daycare
      party = got.party
      if (got.hatched >= 0 && hatchedAt < 0) hatchedAt = i
    }
    // 부화 걸음 2 → 255걸음마다 1씩 → 510걸음째에 0이 된다
    expect(hatchedAt).toBe(255 * 2 - 1)
    expect(party[0]?.friendship).toBe(0)
  })

  it('부화하면 친밀도가 120이다 — 종족 기본값이 아니다', () => {
    const baby = dataOf(TURTWIG)
    expect(baby.baseFriendship).not.toBe(HATCHED_FRIENDSHIP)
    const got = hatch(mon(TURTWIG, { isEgg: true, friendship: 0, nickname: '알' }), 411)
    expect(got.isEgg).toBe(false)
    expect(got.friendship).toBe(HATCHED_FRIENDSHIP)
    expect(got.nickname).toBeNull()
  })
})
