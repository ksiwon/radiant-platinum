// 진화 검증 (PARITY §3.1)
//
// **표를 눈으로 옮겨 적는 시험은 안 만든다.** 그러면 표를 두 번 적는 것이고,
// 잘못 옮기면 시험이 그 잘못을 지켜 준다. 여기서 재는 것은 두 가지다:
//
//   ① 스물여섯 갈래가 **진짜 자료 위에서** 뜻대로 갈리는가
//   ② 갈래마다 **적어도 한 종**이 실제로 그 길로 진화하는가 — 안 그러면
//      구현했다고 적어 놓고 아무도 안 지나가는 코드가 된다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { speciesFileSchema, type Species } from '../../data/schema'
import { withData } from '../../data/romData.testkit'
import { ITEM_LINKING_CORD, ITEM_PRISM_SCALE } from '../bag/extraItems'
import type { PokemonInstance } from './instance'
import { noOrigin } from './origin'
import {
  Evo, EvoClass, evolutionTarget, evolve, FRIENDSHIP_THRESHOLD, HOLD_EFFECT_NO_EVOLVE,
  MAP_EVOLUTION, movesOnEvolve, spawnsShedinja, type EvoContext,
} from './evolution'

const maybe = withData('species.json')

maybe('진화', () => {
  const all = speciesFileSchema.parse(
    JSON.parse(readFileSync(resolve(__dirname, '../../../public/data/species.json'), 'utf8')),
  ).species
  const byId = new Map(all.map((s) => [s.id, s]))
  const of = (id: number): Species => {
    const s = byId.get(id)
    if (!s) throw new Error(`종족 ${String(id)}이 표에 없다`)
    return s
  }

  /** 시험용 개체. 진화가 보는 칸만 채운다 */
  const mon = (species: number, over: Partial<PokemonInstance> = {}): PokemonInstance => ({
    species,
    // PID 상위 16비트가 0이라 성별은 성비 문턱이 그대로 가른다(수컷 쪽)
    pid: 0,
    nickname: null,
    exp: 0,
    level: 50,
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [],
    hp: 1,
    status: 'ok',
    statusTurns: 0,
    heldItem: 0,
    friendship: 70,
    isEgg: false,
    otId: 0,
    otSecretId: 0,
    ball: 4,
    origin: noOrigin({ name: '', gender: 'male' }),
    form: 0, pokerus: 0,
    ...over,
  })

  const level = (m: PokemonInstance, ctx: EvoContext = {}) =>
    evolutionTarget(EvoClass.LEVEL, m, of(m.species), ctx)

  it('레벨만 보는 갈래 — 모부기 18, 미치지 못하면 안 한다', () => {
    // 문턱을 손으로 적지 않는다. 표가 18이라고 말하게 두고 그 앞뒤를 잰다
    const at = of(387).evolutions.find((e) => e.method === Evo.LEVEL)!
    expect(at.param).toBe(18)
    expect(level(mon(387, { level: at.param - 1 }))).toBeNull()
    expect(level(mon(387, { level: at.param }))).toEqual({ to: 388, method: Evo.LEVEL })
    expect(level(mon(387, { level: 99 }))).toEqual({ to: 388, method: Evo.LEVEL })
  })

  it('친밀도 220이 문턱이다 — 219는 안 한다', () => {
    // 럭키 → 해피너스는 `EVO_LEVEL_HAPPINESS`(방법 1)다
    expect(level(mon(113, { friendship: FRIENDSHIP_THRESHOLD - 1 }))).toBeNull()
    expect(level(mon(113, { friendship: FRIENDSHIP_THRESHOLD })))
      .toEqual({ to: 242, method: Evo.LEVEL_HAPPINESS })
  })

  it('낮·밤 친밀도가 서로 반대로 갈린다 — 이브이', () => {
    const happy = { friendship: FRIENDSHIP_THRESHOLD }
    // 에브이 → 에브이(불) 196 낮 · 블래키 197 밤
    expect(level(mon(133, happy), { night: false })).toEqual({ to: 196, method: Evo.LEVEL_HAPPINESS_DAY })
    expect(level(mon(133, happy), { night: true })).toEqual({ to: 197, method: Evo.LEVEL_HAPPINESS_NIGHT })
    // 친밀도가 모자라면 둘 다 아니다 — 돌 진화는 레벨로 안 걸린다
    expect(level(mon(133), { night: true })).toBeNull()
  })

  it('공격과 방어를 견주는 셋 — 헬가르가 개체값으로 갈린다', () => {
    // 개무소(265)는 PID로 갈리고, 공방 비교는 갱도(236 → 106/107/237)다
    const tyrogue = of(236)
    const methods = tyrogue.evolutions.map((e) => e.method).sort((a, b) => a - b)
    expect(methods).toEqual([Evo.LEVEL_ATK_GT_DEF, Evo.LEVEL_ATK_EQ_DEF, Evo.LEVEL_ATK_LT_DEF])

    const atk = mon(236, { level: 20, ivs: { hp: 0, atk: 31, def: 0, spa: 0, spd: 0, spe: 0 } })
    const def = mon(236, { level: 20, ivs: { hp: 0, atk: 0, def: 31, spa: 0, spd: 0, spe: 0 } })
    const same = mon(236, { level: 20 })
    expect(level(atk)?.method).toBe(Evo.LEVEL_ATK_GT_DEF)
    expect(level(def)?.method).toBe(Evo.LEVEL_ATK_LT_DEF)
    expect(level(same)?.method).toBe(Evo.LEVEL_ATK_EQ_DEF)
    // 셋이 서로 다른 종으로 간다
    expect(new Set([level(atk)?.to, level(def)?.to, level(same)?.to]).size).toBe(3)
  })

  it('PID 상위 16비트의 1의 자리가 개무소를 가른다', () => {
    // 상위 16비트가 4 → 4 % 10 = 4 < 5 → 물짱이 쪽(266)
    expect(level(mon(265, { level: 7, pid: 4 * 0x10000 }))?.method).toBe(Evo.LEVEL_PID_LOW)
    expect(level(mon(265, { level: 7, pid: 7 * 0x10000 }))?.method).toBe(Evo.LEVEL_PID_HIGH)
  })

  it('아둥지는 아이스크로 가고 껍질몬은 덤이다', () => {
    const got = level(mon(290, { level: 20 }))
    expect(got).toEqual({ to: 291, method: Evo.LEVEL_NINJASK })
    expect(spawnsShedinja(got!.method)).toBe(true)
    // 진화 자체가 껍질몬을 돌려주지는 않는다
    expect(got!.to).not.toBe(292)
  })

  it('빈티나는 아름다움 170이 필요하고, 우리에겐 그 값이 없어서 안 한다', () => {
    // ⚠️ **되는 척하지 않는다.** 콘테스트 능력치가 붙기 전까지 이 길은 막혀 있고,
    // 그 사실이 시험에 적혀 있어야 나중에 누가 문턱을 낮추지 않는다
    expect(level(mon(349, { level: 99 }))).toBeNull()
    expect(level(mon(349), { beauty: 170 })).toEqual({ to: 350, method: Evo.LEVEL_BEAUTY })
  })

  it('밤낮 + 지닌 도구 — 꼬링크가 아니라 무우마·잠만보 계열의 그 길', () => {
    const rows = all.flatMap((s) => s.evolutions
      .filter((e) => e.method === Evo.LEVEL_WITH_HELD_ITEM_DAY
        || e.method === Evo.LEVEL_WITH_HELD_ITEM_NIGHT)
      .map((e) => ({ from: s.id, ...e })))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      const wantNight = r.method === Evo.LEVEL_WITH_HELD_ITEM_NIGHT
      const holding = mon(r.from, { heldItem: r.param })
      expect(level(holding, { night: wantNight })).toEqual({ to: r.to, method: r.method })
      expect(level(holding, { night: !wantNight })).toBeNull()
      // 안 들고 있으면 시간대가 맞아도 안 한다
      expect(level(mon(r.from), { night: wantNight })).toBeNull()
    }
  })

  it('기술을 알아야 하는 갈래 — 꼬지지·흉내내는 기술 102를 배워야 한다', () => {
    expect(level(mon(438))).toBeNull()
    expect(level(mon(438, { moves: [{ move: 102, pp: 5, ppUps: 0 }] })))
      .toEqual({ to: 185, method: Evo.LEVEL_KNOW_MOVE })
  })

  it('파티에 그 종이 있어야 하는 갈래 — 랭커스', () => {
    const rows = all.flatMap((s) => s.evolutions
      .filter((e) => e.method === Evo.LEVEL_SPECIES_IN_PARTY).map((e) => ({ from: s.id, ...e })))
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(level(mon(r.from))).toBeNull()
    expect(level(mon(r.from), { party: [r.param] })).toEqual({ to: r.to, method: r.method })
  })

  it('성별로 갈리는 갈래 — 레벨도 같이 본다', () => {
    const rows = all.flatMap((s) => s.evolutions
      .filter((e) => e.method === Evo.LEVEL_MALE || e.method === Evo.LEVEL_FEMALE)
      .map((e) => ({ from: s.id, ...e })))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      // PID 하위 바이트 0이면 성비 문턱이 0보다 큰 모든 종에서 암컷이다
      const female = mon(r.from, { level: r.param, pid: 0 })
      const male = mon(r.from, { level: r.param, pid: 0xff })
      const want = r.method === Evo.LEVEL_FEMALE ? female : male
      const other = r.method === Evo.LEVEL_FEMALE ? male : female
      expect(level(want)).toEqual({ to: r.to, method: r.method })
      // ⚠️ 반대 성별이 **아무 데도 안 가는** 것이 아니다. 도롱마담·나메일은
      // 암수가 서로 다른 종으로 갈리므로, 재야 하는 것은 "이 갈래로는 안
      // 간다"이지 "진화를 안 한다"가 아니다
      expect(level(other)?.method).not.toBe(r.method)
      // 레벨이 모자라면 성별이 맞아도 안 한다
      expect(level({ ...want, level: r.param - 1 })).toBeNull()
    }
  })

  it('자력·이끼바위·얼음바위는 **맵이** 건다 — 레벨은 안 본다', () => {
    const rows = all.flatMap((s) => s.evolutions
      .filter((e) => e.method === Evo.LEVEL_MAGNETIC_FIELD || e.method === Evo.LEVEL_MOSS_ROCK
        || e.method === Evo.LEVEL_ICE_ROCK)
      .map((e) => ({ from: s.id, ...e })))
    // 자력 둘(레어코일·대코파스) · 이끼바위 하나 · 얼음바위 하나
    expect(rows).toHaveLength(4)
    for (const r of rows) {
      const where = [...MAP_EVOLUTION].filter(([, m]) => m === r.method).map(([id]) => id)
      expect(where.length).toBeGreaterThan(0)
      expect(level(mon(r.from, { level: 2 }), { mapId: where[0] }))
        .toEqual({ to: r.to, method: r.method })
      // 떡잎마을에서는 아무 일도 안 난다
      expect(level(mon(r.from, { level: 99 }), { mapId: 411 })).toBeNull()
    }
  })

  it('교환 진화는 레벨업으로는 안 걸린다', () => {
    // 고오스(93) → 팬텀(94)은 `EVO_TRADE`다
    expect(level(mon(93, { level: 99 }))).toBeNull()
    expect(evolutionTarget(EvoClass.TRADE, mon(93), of(93)))
      .toEqual({ to: 94, method: Evo.TRADE })
  })

  it('도구를 들고 교환하는 갈래는 그 도구여야 한다', () => {
    const rows = all.flatMap((s) => s.evolutions
      .filter((e) => e.method === Evo.TRADE_WITH_HELD_ITEM).map((e) => ({ from: s.id, ...e })))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      const right = mon(r.from, { heldItem: r.param })
      expect(evolutionTarget(EvoClass.TRADE, right, of(r.from)))
        .toEqual({ to: r.to, method: r.method })
      expect(evolutionTarget(EvoClass.TRADE, mon(r.from, { heldItem: 1 }), of(r.from))).toBeNull()
    }
  })

  it('돌 진화는 그 돌이어야 한다 — 이브이 셋이 서로 다른 돌이다', () => {
    const eevee = of(133)
    const stones = eevee.evolutions.filter((e) => e.method === Evo.USE_ITEM)
    expect(stones).toHaveLength(3)
    for (const s of stones) {
      expect(evolutionTarget(EvoClass.ITEM, mon(133), eevee, { item: s.param }))
        .toEqual({ to: s.to, method: Evo.USE_ITEM })
    }
    // 엉뚱한 돌은 아무 일도 안 한다
    expect(evolutionTarget(EvoClass.ITEM, mon(133), eevee, { item: 1 })).toBeNull()
  })

  it('성별로 갈리는 돌 진화 — 같은 돌인데 결과가 다르다', () => {
    const rows = all.flatMap((s) => s.evolutions
      .filter((e) => e.method === Evo.USE_ITEM_MALE || e.method === Evo.USE_ITEM_FEMALE)
      .map((e) => ({ from: s.id, ...e })))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      const want = r.method === Evo.USE_ITEM_FEMALE ? 0 : 0xff
      const other = r.method === Evo.USE_ITEM_FEMALE ? 0xff : 0
      expect(evolutionTarget(EvoClass.ITEM, mon(r.from, { pid: want }), of(r.from), { item: r.param }))
        .toEqual({ to: r.to, method: r.method })
      expect(evolutionTarget(EvoClass.ITEM, mon(r.from, { pid: other }), of(r.from), { item: r.param }))
        .toBeNull()
    }
  })

  it('변함없는돌이 막는다 — 다만 윤겔라는 못 막고 돌 진화도 못 막는다', () => {
    const stone = { holdEffect: HOLD_EFFECT_NO_EVOLVE }
    expect(level(mon(387, { level: 20 }), stone)).toBeNull()
    // 윤겔라(64) → 후딘(65)은 교환 진화이고, 원작이 이 종 하나만 예외로 뒀다
    expect(evolutionTarget(EvoClass.TRADE, mon(64), of(64), stone))
      .toEqual({ to: 65, method: Evo.TRADE })
    // 다른 교환 진화는 그 돌이 막는다
    expect(evolutionTarget(EvoClass.TRADE, mon(93), of(93), stone)).toBeNull()
    // 돌을 쓰는 진화는 변함없는돌이 못 막는다
    expect(evolutionTarget(EvoClass.ITEM, mon(133, { heldItem: 229 }), of(133),
      { ...stone, item: of(133).evolutions.find((e) => e.method === Evo.USE_ITEM)!.param }))
      .not.toBeNull()
  })

  it('스물여섯 갈래가 하나도 안 빠지고 적어도 한 종에서 걸린다', () => {
    // ⚠️ 이게 이 파일에서 제일 중요한 시험이다. 위의 낱개 시험은 내가 고른
    // 종만 보지만, 이건 **표에 있는 모든 방법**을 훑어 한 번도 안 걸리는
    // 갈래가 있으면 잡는다 — 구현을 빠뜨렸을 때 조용히 지나가지 않는다
    const used = new Set(all.flatMap((s) => s.evolutions.map((e) => e.method)))
    const never: number[] = []
    for (const method of [...used].sort((a, b) => a - b)) {
      // 껍질몬 갈래는 종족을 안 돌려주는 것이 정답이다
      if (method === Evo.LEVEL_SHEDINJA) continue
      const rows = all.flatMap((s) => s.evolutions
        .filter((e) => e.method === method).map((e) => ({ from: s.id, ...e })))
      const hit = rows.some((r) => {
        const base = mon(r.from, { level: 100, friendship: 255 })
        const ctx: EvoContext = {
          night: method === Evo.LEVEL_HAPPINESS_NIGHT
            || method === Evo.LEVEL_WITH_HELD_ITEM_NIGHT,
          party: [r.param],
          beauty: 255,
          mapId: [...MAP_EVOLUTION].find(([, m]) => m === method)?.[0],
          item: r.param,
        }
        const withItem = { ...base, heldItem: r.param, moves: [{ move: r.param, pp: 5, ppUps: 0 }] }
        for (const pid of [0, 0xff, 4 * 0x10000, 7 * 0x10000]) {
          const m = { ...withItem, pid }
          if (evolutionTarget(EvoClass.LEVEL, m, of(r.from), ctx)?.method === method) return true
          if (evolutionTarget(EvoClass.TRADE, m, of(r.from), ctx)?.method === method) return true
          if (evolutionTarget(EvoClass.ITEM, m, of(r.from), ctx)?.method === method) return true
        }
        return false
      })
      if (!hit) never.push(method)
    }
    expect(never).toEqual([])
    // 표에 실제로 쓰인 갈래가 스물여섯 중 몇인지도 못 박아 둔다
    expect(used.size).toBe(26)
  })

  it('진화해도 개체값·성격·경험치는 그대로다', () => {
    const before = mon(387, { level: 14, exp: 1234, pid: 0xabcdef01, friendship: 111 })
    const after = evolve(before, 388)
    expect(after.species).toBe(388)
    expect({ ...after, species: before.species }).toEqual(before)
  })

  it('진화한 자리에서 새 종족의 기술을 배운다', () => {
    // "진화한 그 레벨에 새 종족이 배우는 것이 있는" 짝을 표에서 직접 찾는다.
    // 종을 손으로 고르면 표가 바뀔 때 시험이 먼저 낡는다
    const pairs = all.flatMap((s) => s.evolutions
      .filter((e) => e.method === Evo.LEVEL && byId.has(e.to))
      .map((e) => ({ from: s.id, to: e.to, level: e.param }))
      .filter((p) => movesOnEvolve(of(p.to), p.level).length > 0))
    expect(pairs.length).toBeGreaterThan(0)
    for (const p of pairs.slice(0, 5)) {
      const learned = movesOnEvolve(of(p.to), p.level)
      expect(learned.length).toBeGreaterThan(0)
      // 새 종족의 표에서 온 것이지 옛 종족의 것이 아니다
      expect(of(p.to).learnset.some((e) => e.level === p.level && learned.includes(e.move)))
        .toBe(true)
    }
  })

  // ── 롬에 없는 도구 둘 (PARITY §12) ─────────────────────────────────────────

  describe('연결의 끈과 고운 비늘', () => {
    const use = (m: PokemonInstance, it: number) =>
      evolutionTarget(EvoClass.ITEM, m, of(m.species), { item: it })

    it('연결의 끈이 교환 진화를 건다 — 근육몬이 괴력몬이 된다', () => {
      expect(use(mon(67), ITEM_LINKING_CORD)).toEqual({ to: 68, method: Evo.TRADE })
    })

    it('⚠️ 지닌 도구까지 요구하는 갈래는 그대로다 — 스라크는 금속코트가 있어야 한다', () => {
      const scyther = of(123).evolutions
        .find((e) => e.method === Evo.TRADE_WITH_HELD_ITEM)
      expect(scyther, '스라크의 교환+지님 갈래').toBeDefined()
      // 끈만으로는 안 걸린다 — 조건 하나를 조용히 지우지 않는다
      expect(use(mon(123), ITEM_LINKING_CORD)).toBeNull()
      expect(use({ ...mon(123), heldItem: scyther!.param }, ITEM_LINKING_CORD))
        .toEqual({ to: scyther!.to, method: Evo.TRADE_WITH_HELD_ITEM })
    })

    it('고운 비늘이 빈티나를 밀로틱으로 만든다 — 아름다움이 0이라도', () => {
      expect(use(mon(349), ITEM_PRISM_SCALE)).toEqual({ to: 350, method: Evo.LEVEL_BEAUTY })
    })

    it('⚠️ 서로 남의 길을 안 연다', () => {
      expect(use(mon(349), ITEM_LINKING_CORD)).toBeNull()
      expect(use(mon(67), ITEM_PRISM_SCALE)).toBeNull()
    })

    it('걸릴 갈래가 없는 종에는 아무 일도 안 난다', () => {
      expect(use(mon(25), ITEM_LINKING_CORD)).toBeNull()
      expect(use(mon(25), ITEM_PRISM_SCALE)).toBeNull()
    })

    it('교환으로 되는 신오도감 열둘이 전부 끈으로 열린다', () => {
      const trade = all.flatMap((sp) => sp.evolutions
        .filter((e) => e.method === Evo.TRADE || e.method === Evo.TRADE_WITH_HELD_ITEM)
        .map((e) => ({ from: sp.id, e })))
      expect(trade.length).toBeGreaterThanOrEqual(12)
      for (const { from, e } of trade) {
        const held = e.method === Evo.TRADE_WITH_HELD_ITEM ? e.param : 0
        expect(use({ ...mon(from), heldItem: held }, ITEM_LINKING_CORD), `종족 ${String(from)}`)
          .toEqual({ to: e.to, method: e.method })
      }
    })
  })
})
