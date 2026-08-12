// 배회 포켓몬 (PARITY §6.3)
import { describe, expect, it } from 'vitest'
import {
  activate, afterBattle, emptyRoamer, moveAll, moveNearby, moveRandom, NEARBY_ROUTES,
  newRecentRoutes, newRoamers, randomizeAll, roamerHere, ROAMER_LEVEL, ROAMER_ROUTES,
  ROAMER_SLOT_COUNT, ROAMER_SPECIES, ROAMER_STATE_VAR, RoamerSlot, RoamerState,
  trackRoute, type Roamer,
} from './roamer'

/** 정해진 차례로 뽑아 주는 난수. 다 쓰면 처음으로 돌아간다 */
function feed(...values: number[]): () => number {
  let at = 0
  return () => {
    const v = values[at % values.length]!
    at++
    return v
  }
}

/** `n`분의 `want`가 나오게 하는 값 */
const pick = (want: number, n: number): number => (want + 0.5) / n

function roaming(at: number, over: Partial<Roamer> = {}): Roamer {
  return { ...emptyRoamer(), active: true, species: 481, level: 50, hp: 100, at, ...over }
}

describe('표', () => {
  it('스물아홉 곳이고 맵 번호가 안 겹친다', () => {
    expect(ROAMER_ROUTES).toHaveLength(29)
    expect(new Set(ROAMER_ROUTES).size).toBe(29)
    expect(NEARBY_ROUTES).toHaveLength(29)
  })

  /**
   * ⚠️ **이웃은 서로를 알아야 한다.** 한쪽만 적으면 배회가 들어갔다 못 나오는
   * 도로가 생긴다. 원작 표도 대칭이다 — **205번 북쪽의 208번 한 칸만 빼고**
   */
  it('이웃이 서로 대칭이다 — 원작이 어긋난 한 칸만 빼고', () => {
    const broken: string[] = []
    for (let a = 0; a < NEARBY_ROUTES.length; a++) {
      for (const b of NEARBY_ROUTES[a]!) {
        if (!NEARBY_ROUTES[b]!.includes(a)) broken.push(`${String(a)}→${String(b)}`)
      }
    }
    // 어긋난 둘은 **같은 한 칸에서 나온다.** 6 = 205번 북쪽의 셋째 이웃 자리에
    // 원작이 `9`(208번)를 적어 두었다 — 영원시티에 실제로 붙어 있는 것은
    // 211번 서쪽(13)이다. 그래서 6은 208번으로 갈 수 있는데 208번은 6을 모르고,
    // 13은 6을 이웃으로 아는데 6은 13을 모른다. 고치지 않고 그대로 옮겼다
    expect(broken).toEqual(['6→9', '13→6'])
  })

  it('자기 자신을 이웃으로 두지 않는다', () => {
    for (let a = 0; a < NEARBY_ROUTES.length; a++) {
      expect(NEARBY_ROUTES[a], String(a)).not.toContain(a)
    }
  })

  it('자리마다 종족과 레벨이 정해져 있다', () => {
    expect(ROAMER_SPECIES).toHaveLength(ROAMER_SLOT_COUNT)
    expect(ROAMER_SPECIES[RoamerSlot.MESPRIT]).toBe(481)
    expect(ROAMER_SPECIES[RoamerSlot.CRESSELIA]).toBe(488)
    expect(ROAMER_LEVEL[RoamerSlot.DARKRAI]).toBe(40)
    expect(ROAMER_LEVEL[RoamerSlot.ARTICUNO]).toBe(60)
  })

  /** ⚠️ 다크라이만 결말을 적을 칸이 없다. 원작 `switch`에 없어서다 */
  it('다크라이만 이야기 변수가 없다', () => {
    expect(ROAMER_STATE_VAR[RoamerSlot.DARKRAI]).toBeNull()
    expect(ROAMER_STATE_VAR.filter((v) => v !== null)).toHaveLength(5)
  })
})

describe('자리 옮기기', () => {
  it('아무 데로나 뛸 때는 지금 자리와 방금 떠난 맵을 피한다', () => {
    // 0번(201번도로)에 있고 방금 202번도로(색인 1)에서 왔다
    const got = moveRandom(0, ROAMER_ROUTES[1]!, feed(pick(0, 29), pick(1, 29), pick(5, 29)))
    expect(got).toBe(5)
  })

  it('옆 도로로 갈 때는 방금 떠난 맵만 피한다', () => {
    // 201번(이웃 202·219)에서, 방금 202번에서 왔다면 219번뿐이다
    expect(moveNearby(0, ROAMER_ROUTES[1]!, feed(pick(0, 2), pick(1, 2)))).toBe(23)
  })

  /**
   * ⚠️ 막다른 도로에서 그 하나가 막히면 **아무 데로나 뛴다**. 원작이 그
   * 갈래를 따로 두었다 — 없으면 217번도로에서 무한히 돈다
   */
  it('갈 곳이 하나뿐인데 그게 막히면 아무 데로나 뛴다', () => {
    // 21 = 217번도로, 이웃은 216번(20) 하나뿐
    const got = moveNearby(21, ROAMER_ROUTES[20]!, feed(pick(7, 29)))
    expect(got).toBe(7)
  })

  it('열여섯에 하나는 아무 데로나, 나머지는 옆 도로다', () => {
    const roamers = [roaming(0), ...newRoamers().slice(1)]
    // 첫 값이 0이면 「아무 데로나」 갈래
    const jump = moveAll(roamers, -1, feed(0, pick(11, 29)))
    expect(jump[0]!.at).toBe(11)
    // 첫 값이 0이 아니면 옆 도로 — 201번의 이웃은 202(1)·219(23)
    const step = moveAll(roamers, -1, feed(pick(5, 16), pick(1, 2)))
    expect([1, 23]).toContain(step[0]!.at)
  })

  it('안 도는 자리는 안 건드린다', () => {
    const roamers = newRoamers()
    expect(moveAll(roamers, -1, feed(0, 0))).toEqual(roamers)
    expect(randomizeAll(roamers, -1, feed(0, 0))).toEqual(roamers)
  })

  it('날면 도는 것이 전부 뛴다', () => {
    const roamers = [roaming(0), roaming(5), ...newRoamers().slice(2)]
    const got = randomizeAll(roamers, -1, feed(pick(9, 29)))
    expect(got[0]!.at).toBe(9)
    expect(got[1]!.at).toBe(9)
  })
})

describe('방금 떠난 맵', () => {
  it('맵이 바뀔 때만 민다', () => {
    let at = newRecentRoutes()
    at = trackRoute(at, 342)
    expect(at).toEqual({ current: 342, previous: 0 })
    at = trackRoute(at, 343)
    expect(at).toEqual({ current: 343, previous: 342 })
    // ⚠️ 같은 맵이면 안 민다 — 밀면 「방금 떠난 맵」이 지금 맵이 되어
    // 배회를 막는 장치가 통째로 죽는다
    expect(trackRoute(at, 343)).toEqual({ current: 343, previous: 342 })
  })
})

describe('나오는가', () => {
  it('여기 없으면 안 나온다', () => {
    const roamers = [roaming(0), ...newRoamers().slice(1)]
    expect(roamerHere(roamers, ROAMER_ROUTES[1]!, feed(0))).toBeNull()
  })

  it('여기 있어도 절반은 안 나온다', () => {
    const roamers = [roaming(0), ...newRoamers().slice(1)]
    expect(roamerHere(roamers, ROAMER_ROUTES[0]!, feed(0))).toBeNull()
    expect(roamerHere(roamers, ROAMER_ROUTES[0]!, feed(0.9))).toBe(0)
  })

  it('둘이 겹쳐 있으면 그중 하나를 고른다', () => {
    const roamers = [roaming(3), roaming(3), ...newRoamers().slice(2)]
    const map = ROAMER_ROUTES[3]!
    expect(roamerHere(roamers, map, feed(0.9, pick(1, 2)))).toBe(1)
  })

  it('안 도는 자리는 세지 않는다', () => {
    expect(roamerHere(newRoamers(), ROAMER_ROUTES[0]!, feed(0.9))).toBeNull()
  })
})

describe('배틀이 끝난 뒤', () => {
  const here = ROAMER_ROUTES[0]!

  it('도망친 배회는 맞은 만큼을 들고 다음에 나온다', () => {
    const got = afterBattle([roaming(0, { hp: 100 }), ...newRoamers().slice(1)], {
      met: 0, mapId: here, previousMap: -1, hp: 37, status: 'par',
      outcome: 'other', rng: feed(pick(9, 29)),
    })
    expect(got.roamers[0]!.hp).toBe(37)
    expect(got.roamers[0]!.status).toBe('par')
    expect(got.roamers[0]!.active).toBe(true)
    // 만난 판에는 반드시 자리를 뜬다
    expect(got.roamers[0]!.at).toBe(9)
    expect(got.cleared).toBeNull()
  })

  it('쓰러뜨리면 자리가 지워지고 「쓰러뜨렸다」가 남는다', () => {
    const got = afterBattle([roaming(0), ...newRoamers().slice(1)], {
      met: 0, mapId: here, previousMap: -1, hp: 0, status: 'ok',
      outcome: 'win', rng: feed(pick(9, 29)),
    })
    expect(got.roamers[0]!.active).toBe(false)
    expect(got.cleared).toBe(RoamerState.DEFEATED)
  })

  /** ⚠️ 이겼는데 체력이 남아 있으면 **도망친 것**이다 — 지우면 안 된다 */
  it('이겨도 체력이 남아 있으면 안 지운다', () => {
    const got = afterBattle([roaming(0), ...newRoamers().slice(1)], {
      met: 0, mapId: here, previousMap: -1, hp: 12, status: 'ok',
      outcome: 'win', rng: feed(pick(9, 29)),
    })
    expect(got.roamers[0]!.active).toBe(true)
    expect(got.roamers[0]!.hp).toBe(12)
    expect(got.cleared).toBeNull()
  })

  it('잡으면 「잡았다」가 남는다', () => {
    const got = afterBattle([roaming(0), ...newRoamers().slice(1)], {
      met: 0, mapId: here, previousMap: -1, hp: 5, status: 'slp',
      outcome: 'caught', rng: feed(pick(9, 29)),
    })
    expect(got.roamers[0]!.active).toBe(false)
    expect(got.cleared).toBe(RoamerState.CAPTURED)
  })

  /**
   * ⚠️ **안 만난 판에서도 30%로 흩어진다.** 빠뜨리면 같은 도로에서 야생만
   * 잡는 동안 배회가 붙박이가 된다
   */
  it('안 만나도 100 중 30은 이 맵을 뜬다', () => {
    const roamers = [roaming(0), ...newRoamers().slice(1)]
    const stay = afterBattle(roamers, {
      met: null, mapId: here, previousMap: -1, hp: 0, status: 'ok',
      outcome: 'win', rng: feed(0.5),
    })
    expect(stay.roamers[0]!.at).toBe(0)
    const leave = afterBattle(roamers, {
      met: null, mapId: here, previousMap: -1, hp: 0, status: 'ok',
      outcome: 'win', rng: feed(0.1, pick(9, 29)),
    })
    expect(leave.roamers[0]!.at).toBe(9)
  })

  it('다른 맵에 있는 배회는 안 건드린다', () => {
    const got = afterBattle([roaming(0), roaming(5), ...newRoamers().slice(2)], {
      met: 0, mapId: here, previousMap: -1, hp: 3, status: 'ok',
      outcome: 'other', rng: feed(pick(9, 29)),
    })
    expect(got.roamers[1]!.at).toBe(5)
  })
})

describe('자리 열기', () => {
  const ivs = { hp: 31, atk: 30, def: 29, spa: 28, spd: 27, spe: 26 }

  it('종족·레벨·만피로 열리고 곧바로 어딘가로 뛴다', () => {
    const got = activate(newRoamers(), RoamerSlot.CRESSELIA, -1, {
      pid: 0x12345678, ivs, maxHp: 180,
    })
    const at = got[RoamerSlot.CRESSELIA]!
    expect(at.active).toBe(true)
    expect(at.species).toBe(488)
    expect(at.level).toBe(50)
    expect(at.hp).toBe(180)
    expect(at.ivs).toEqual(ivs)
    expect(at.status).toBe('ok')
    // 0번 자리에서 시작해 다른 곳으로 옮겨 갔다
    expect(at.at).not.toBe(0)
    // 다른 자리는 그대로다
    expect(got[RoamerSlot.MESPRIT]!.active).toBe(false)
  })

  it('없는 자리는 아무 일도 안 한다', () => {
    const before = newRoamers()
    expect(activate(before, 9, -1, { pid: 1, ivs, maxHp: 1 })).toEqual(before)
  })
})
