import { describe, expect, it } from 'vitest'
import {
  addHallOfFameEntry,
  entryAt,
  entryNumber,
  HALL_OF_FAME_PARTY,
  MAX_HALL_OF_FAME_ENTRIES,
  MAX_TOTAL_ENTRIES,
  MET_KIND,
  metKindNeedsPlace,
  metKindOf,
  newHallOfFame,
  storedEntries,
  type HallOfFameRecord,
} from './hallOfFame'
import { SPECIAL_MET_BASE } from '../pokemon/origin'
import type { PokemonInstance } from '../pokemon/instance'

const DATE = { year: 8, month: 3, day: 14 }

function mon(over: Partial<PokemonInstance> = {}): PokemonInstance {
  return {
    species: 387,
    pid: 0x1234,
    nickname: null,
    exp: 0,
    level: 5,
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [{ move: 33, pp: 35, ppUps: 0 }],
    hp: 20,
    status: 'ok',
    statusTurns: 0,
    heldItem: 0,
    friendship: 70,
    isEgg: false,
    otId: 1234,
    otSecretId: 0,
    ball: 4,
    origin: {
      otName: '나',
      otGender: 'male',
      met: { location: 12, date: DATE },
      metLevel: 5,
      egg: { location: 0, date: null },
      fateful: false,
    },
    form: 0,
    ...over,
  }
}

/** 마릿수만 다른 파티 */
const party = (n: number) => Array.from({ length: n }, (_, i) => mon({ species: 1 + i }))

describe('한 줄 더하기', () => {
  it('파티를 그대로 옮긴다 — 기술 넷과 별명·트레이너까지', () => {
    const one = mon({
      nickname: '토도',
      level: 68,
      form: 0,
      pid: 7,
      moves: [
        { move: 56, pp: 5, ppUps: 0 },
        { move: 89, pp: 10, ppUps: 0 },
      ],
    })
    const got = addHallOfFameEntry(newHallOfFame(), [one], DATE)
    expect(got.total).toBe(1)
    expect(got.next).toBe(1)
    const entry = entryAt(got, 0)!
    expect(entry).toMatchObject({ year: 8, month: 3, day: 14 })
    expect(entry.pokemon[0]).toEqual({
      species: 387,
      level: 68,
      form: 0,
      pid: 7,
      otId: 1234,
      otSecretId: 0,
      nickname: '토도',
      otName: '나',
      moves: [56, 89],
    })
  })

  it('⚠️ 알은 건너뛴다 — 뒤엣것이 앞으로 당겨진다', () => {
    const got = addHallOfFameEntry(
      newHallOfFame(),
      [mon({ species: 1 }), mon({ species: 2, isEgg: true }), mon({ species: 3 })],
      DATE,
    )
    expect(entryAt(got, 0)!.pokemon.map((p) => p.species)).toEqual([1, 3])
  })

  it('여섯을 넘겨 담지 않는다', () => {
    const got = addHallOfFameEntry(newHallOfFame(), party(8), DATE)
    expect(entryAt(got, 0)!.pokemon).toHaveLength(HALL_OF_FAME_PARTY)
  })

  it('⚠️ 9999번째부터는 아예 안 적는다', () => {
    const full: HallOfFameRecord = { entries: [], next: 0, total: MAX_TOTAL_ENTRIES }
    expect(addHallOfFameEntry(full, party(1), DATE)).toBe(full)
  })
})

describe('서른 칸 고리', () => {
  /** n번 이긴 기록. 첫 마리의 종족 번호가 곧 몇 번째인지다 */
  function won(n: number): HallOfFameRecord {
    let record = newHallOfFame()
    for (let i = 1; i <= n; i++) record = addHallOfFameEntry(record, [mon({ species: i })], DATE)
    return record
  }

  it('차기 전에는 들어간 만큼만 있다', () => {
    const got = won(3)
    expect(storedEntries(got)).toBe(3)
    expect(got.entries).toHaveLength(3)
    expect([0, 1, 2].map((i) => entryAt(got, i)!.pokemon[0]!.species)).toEqual([3, 2, 1])
  })

  it('서른한 번째가 제일 오래된 것을 덮어쓴다', () => {
    const got = won(MAX_HALL_OF_FAME_ENTRIES + 1)
    expect(storedEntries(got)).toBe(MAX_HALL_OF_FAME_ENTRIES)
    expect(got.entries).toHaveLength(MAX_HALL_OF_FAME_ENTRIES)
    expect(entryAt(got, 0)!.pokemon[0]!.species).toBe(31)
    // 1번은 사라지고 제일 오래된 것이 2번이다
    expect(entryAt(got, MAX_HALL_OF_FAME_ENTRIES - 1)!.pokemon[0]!.species).toBe(2)
  })

  it('⚠️ 번호는 안 감긴다 — 마흔 번 이기면 제일 오래된 줄이 11번이다', () => {
    const got = won(40)
    expect(entryNumber(got, 0)).toBe(40)
    expect(entryNumber(got, MAX_HALL_OF_FAME_ENTRIES - 1)).toBe(11)
  })

  it('빈 기록은 볼 줄이 없다', () => {
    expect(storedEntries(newHallOfFame())).toBe(0)
    expect(entryAt(newHallOfFame(), 0)).toBeNull()
  })
})

describe('만난 자리 글', () => {
  const ME = { id: 1234, name: '나' }
  const kind = (m: PokemonInstance) => metKindOf(m, ME.id, ME.name)

  it('잡은 것은 「만났다」, 깬 것은 「태어났다」', () => {
    expect(kind(mon())).toBe(MET_KIND.metAt)
    expect(
      kind(
        mon({
          origin: { ...mon().origin, egg: { location: 5, date: DATE } },
        }),
      ),
    ).toBe(MET_KIND.hatchedAt)
  })

  it('트레이너가 다르면 통신교환이다 — 번호든 이름이든', () => {
    expect(kind(mon({ otId: 999 }))).toBe(MET_KIND.linkTrade)
    expect(kind(mon({ origin: { ...mon().origin, otName: '남' } }))).toBe(MET_KIND.linkTrade)
  })

  it('⚠️ 「운명적인 만남」이 트레이너 검사보다 먼저다', () => {
    const fateful = mon({ otId: 999, origin: { ...mon().origin, fateful: true } })
    expect(kind(fateful)).toBe(MET_KIND.fateful)
  })

  it('특별한 자리(2000 이상)도 「운명적인 만남」으로 떨어진다', () => {
    const special = mon({
      origin: { ...mon().origin, met: { location: SPECIAL_MET_BASE + 1, date: DATE } },
    })
    expect(kind(special)).toBe(MET_KIND.fateful)
  })

  it('자리 이름이 들어가는 글은 둘뿐이다', () => {
    expect([MET_KIND.metAt, MET_KIND.hatchedAt].every(metKindNeedsPlace)).toBe(true)
    expect(
      [
        MET_KIND.linkTrade,
        MET_KIND.kanto,
        MET_KIND.hoenn,
        MET_KIND.distantLand,
        MET_KIND.fateful,
      ].some(metKindNeedsPlace),
    ).toBe(false)
  })
})
