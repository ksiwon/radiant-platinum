// 배틀 한 판을 스토어로 끝까지 돌린다.
//
// 조각별 테스트가 다 통과해도 이어 붙인 곳에서 막힌다. 여기서 보는 것은 세 가지다:
// 파티가 없어도 배틀이 시작되는가, 승부가 날 때까지 고를 게 계속 오는가, 그리고
// **끝난 뒤 HP가 세이브로 돌아오는가**.
//
// 지연 로딩 경계도 여기서 지나간다 — `startWild`가 `@pkmn/sim`을 처음 끌어온다.
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, beforeEach, describe, it, expect } from 'vitest'
import { useBattleStore } from './battleStore'
import { useSaveStore, createNewSave, dexHas } from './saveStore'
import { Ball } from '../engine/battle/meta/capture'
import { createWild, fillPp, statsOf, wildMoves } from '../engine/pokemon/instance'
import { expForLevel } from '../engine/pokemon/exp'
import { loadItems, loadMoves, loadSpecies, loadTrainers } from '../data/gameData'
import { quantity } from '../engine/bag/bag'

// gameData는 fetch로 받는다. 테스트에서는 같은 파일을 디스크에서 읽어 준다
beforeAll(() => {
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input)
    const path = resolve(__dirname, '../../public', url.replace(/^\/?/, ''))
    const body = readFileSync(path, 'utf8')
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(body)) })
  }) as typeof fetch
})

const STARLY = 396
const RATTATA = 19

beforeEach(() => {
  // 닫기가 먼저다 — 앞 판이 남아 있으면 close가 새 세이브에 옛 결과를 쓴다
  useBattleStore.getState().close()
  useSaveStore.setState(createNewSave())
})

/**
 * 가장 센 기술을 골라 가며 배틀이 끝날 때까지 민다.
 *
 * ⚠️ "첫 기술"을 고르면 안 된다 — 그 칸이 광합성이면 아무리 때려도 상대가 안
 * 쓰러진다. 이 프로젝트에서 이미 한 번 그렇게 틀렸다
 */
async function playToEnd(limit = 60, shift = false): Promise<number> {
  const moves = await loadMoves()
  const power = (id: number | null) => (id === null ? 0 : moves.byId.get(id)?.power ?? 0)
  let steps = 0
  while (useBattleStore.getState().phase === 'running' && steps < limit) {
    // 시합규칙 「교체」는 상대가 다음 마리를 내보내기 전에 묻는다. 답하지 않으면
    // 고를 것이 안 오므로 여기서 막힌다
    if (useBattleStore.getState().shiftAsk !== null) {
      await useBattleStore.getState().answerShift(shift)
      steps++
      continue
    }
    const actions = useBattleStore.getState().actions
    if (!actions.length) break
    const attacks = actions.filter((a) => a.type === 'move')
    const best = attacks.sort((a, b) => power(b.move) - power(a.move))[0]
    await useBattleStore.getState().choose(best ?? actions[0]!)
    steps++
  }
  return steps
}

describe('배틀 스토어', () => {
  it('파티가 비어 있어도 시작한다 — 첫 파트너를 지급한다', async () => {
    expect(useSaveStore.getState().party).toHaveLength(0)
    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })

    expect(useBattleStore.getState().error).toBeNull()
    expect(useBattleStore.getState().phase).toBe('running')
    // 지급된 개체가 세이브에 남아야 한다. 안 남으면 배틀마다 새 포켓몬이 생긴다
    expect(useSaveStore.getState().party).toHaveLength(1)

    const view = useBattleStore.getState().truth!
    expect(view.active.p1, '우리 쪽이 안 나왔다').not.toBeNull()
    expect(view.active.p2!.species).toBe(STARLY)
    expect(view.active.p2!.level).toBe(3)
    expect(useBattleStore.getState().actions.length, '고를 게 없다').toBeGreaterThan(0)
  }, 30_000)

  it('키가 파티 순서와 이어져 있다', async () => {
    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })
    const { roster, truth: view } = useBattleStore.getState()
    const key = view!.active.p1!.key
    expect(roster[key], `${key}가 명부에 없다`).toBeDefined()
    expect(roster[key]!.species).toBe(useSaveStore.getState().party[0]!.species)
    expect(roster[key]!.side).toBe('p1')
  }, 30_000)

  it('승부가 날 때까지 고를 게 계속 온다', async () => {
    // 레벨 3짜리 야생이면 첫 파트너(Lv5)가 이긴다
    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })
    const steps = await playToEnd()
    expect(steps, '한 수도 안 뒀다').toBeGreaterThan(0)
    expect(useBattleStore.getState().phase, '승부가 안 났다').toBe('over')
    expect(useBattleStore.getState().outcome).toBe('win')
    expect(useBattleStore.getState().truth!.ended).toBe(true)
  }, 30_000)

  it('배틀에서 깎인 HP가 세이브로 돌아온다', async () => {
    // **레벨 20을 상대로 붙인다.** 3레벨짜리와 붙이면 한 대도 안 맞고 끝나는 판이
    // 섞여서, 되돌리기를 통째로 지워도 테스트가 통과해 버린다 (실제로 3번 중 1번
    // 그랬다). 반드시 깎이는 상황을 만들어야 단언에 힘이 생긴다
    await useBattleStore.getState().startWild({ species: STARLY, level: 20 })
    const before = useSaveStore.getState().party[0]!
    const full = statsOf(before, (await loadSpecies()).get(before.species)).hp
    expect(before.hp, '시작부터 만피가 아니다').toBe(full)

    await playToEnd()
    const inBattle = useBattleStore.getState().truth!.active.p1!
    expect(inBattle.hp, 'HP가 하나도 안 깎였다 — 이 판으로는 검증이 안 된다')
      .toBeLessThan(full)
    useBattleStore.getState().close()

    const after = useSaveStore.getState().party[0]!
    // 화면이 보여 준 마지막 HP와 세이브가 같아야 한다 — 서로 다른 경로로 온 값이다
    expect(after.hp).toBe(inBattle.hp)
    expect(useBattleStore.getState().phase).toBe('off')
  }, 30_000)

  it('파티 순서를 바꾼다 — 맨 앞이 선두다', async () => {
    const species = await loadSpecies()
    const moves = await loadMoves()
    const pp = (id: number) => moves.byId.get(id)?.pp ?? 5
    const mon = (id: number, level: number) => fillPp(createWild({
      species: species.get(id), level, rng: () => 0.5, otId: 1, otSecretId: 1,
    }), pp)
    useSaveStore.setState({ party: [mon(STARLY, 5), mon(RATTATA, 6), mon(STARLY, 7)] })

    useSaveStore.getState().swapParty(0, 2)
    expect(useSaveStore.getState().party.map((m) => m.level)).toEqual([7, 6, 5])

    // 제자리로 바꾸는 것과 없는 칸은 아무 일도 아니다 — 눌러도 파티가 안 망가진다
    const before = useSaveStore.getState().party
    useSaveStore.getState().swapParty(1, 1)
    useSaveStore.getState().swapParty(0, 9)
    useSaveStore.getState().swapParty(-1, 0)
    expect(useSaveStore.getState().party).toBe(before)
  })

  it('전멸한 파티는 저절로 안 낫는다 — 회복은 포켓몬센터가 한다', async () => {
    // ⚠️ 예전엔 `ensureParty`가 "전부 쓰러졌으면 채운다"를 했다. 그러면 져도
    // 다음 배틀에서 멀쩡해져서 **진 것이 아무 일도 아니게 된다.** 지금은
    // `scene/pokecenter`가 전멸을 받아 부활 지점으로 옮기고 거기서 낫는다
    // 쓰러진 파티 하나를 만든다
    const species = await loadSpecies()
    const moves = await loadMoves()
    const starly = species.get(STARLY)
    const mon = fillPp(
      createWild({ species: starly, level: 5, rng: () => 0.5, otId: 1, otSecretId: 1 }),
      (id) => moves.byId.get(id)?.pp ?? 5,
    )
    useSaveStore.setState({ party: [{ ...mon, hp: 0, status: 'psn' as const }] })

    // 배틀을 열어도 안 낫는다 — 예전엔 여기서 저절로 멀쩡해졌다
    await useBattleStore.getState().startWild({ species: RATTATA, level: 3 })
    expect(useSaveStore.getState().party[0]!.hp).toBe(0)
    useBattleStore.getState().close()

    // 낫는 길 자체는 살아 있다 — 센터가 부르는 그 함수를 직접 걸어 본다
    useSaveStore.getState().healParty((mon) => ({ hp: 20, pp: mon.moves.map(() => 10) }))
    const healed = useSaveStore.getState().party
    expect(healed.length).toBeGreaterThan(0)
    expect(healed.every((m) => m.hp === 20)).toBe(true)
    expect(healed.every((m) => m.status === 'ok')).toBe(true)
    expect(healed.every((m) => m.moves.every((slot) => slot.pp === 10))).toBe(true)
  })

  it('이미 배틀 중이면 두 번째 조우가 안 겹친다', async () => {
    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })
    const view = useBattleStore.getState().truth
    await useBattleStore.getState().startWild({ species: 19, level: 40 })
    expect(useBattleStore.getState().truth).toBe(view)
  }, 30_000)
})

describe('포획', () => {
  it('마스터볼로 잡으면 파티에 들어가고 도감이 켜진다', async () => {
    await useBattleStore.getState().startWild({ species: STARLY, level: 5 })
    const before = useSaveStore.getState().party.length
    await useBattleStore.getState().throwBall(Ball.MASTER)

    expect(useBattleStore.getState().outcome).toBe('caught')
    expect(useBattleStore.getState().phase).toBe('over')
    // 닫기 전에는 세이브가 안 바뀐다 — 연출이 도는 동안 파티가 늘면 안 된다
    expect(useSaveStore.getState().party).toHaveLength(before)

    useBattleStore.getState().close()
    const party = useSaveStore.getState().party
    expect(party).toHaveLength(before + 1)
    expect(party[party.length - 1]!.species).toBe(STARLY)
    // 잡은 개체의 원트레이너는 우리여야 한다. 안 그러면 교환 보정이 잘못 붙는다
    expect(party[party.length - 1]!.otId).toBe(useSaveStore.getState().trainer.id)
    expect(dexHas(useSaveStore.getState().pokedex.caught, STARLY)).toBe(true)
  }, 30_000)

  it('파티가 여섯이면 박스로 간다', async () => {
    await useBattleStore.getState().startWild({ species: STARLY, level: 5 })
    useBattleStore.getState().close()

    const one = useSaveStore.getState().party[0]!
    useSaveStore.setState({ party: Array.from({ length: 6 }, () => ({ ...one })) })

    await useBattleStore.getState().startWild({ species: RATTATA, level: 5 })
    await useBattleStore.getState().throwBall(Ball.MASTER)
    useBattleStore.getState().close()

    expect(useSaveStore.getState().party).toHaveLength(6)
    // 지금 열려 있는 박스(0번)의 **첫 빈 자리**로 간다. 마지막 박스에 쌓는 것이
    // 아니다 — 원작의 `PCBoxes_TryStoreBoxMon`이 현재 박스부터 훑는다
    expect(useSaveStore.getState().boxes[0]![0]?.species).toBe(RATTATA)
  }, 30_000)
})

describe('도망', () => {
  it('빠르면 도망친다', async () => {
    // 시작 파트너는 5레벨이라 느리다. 상대를 2레벨로 두면 우리가 더 빠르다
    await useBattleStore.getState().startWild({ species: STARLY, level: 2 })
    await useBattleStore.getState().run()
    // 실패할 수도 있으니 몇 번 더 시도한다. 시도할수록 쉬워진다
    for (let i = 0; i < 8 && useBattleStore.getState().phase === 'running'; i++) {
      await useBattleStore.getState().run()
    }
    expect(useBattleStore.getState().outcome).toBe('fled')
    useBattleStore.getState().close()
    expect(useSaveStore.getState().party.length).toBeGreaterThan(0)
  }, 30_000)
})

describe('가방 도구', () => {
  /** 도구마다 사는 주머니가 다르다. 상처약은 「약」, 삐삐인형은 「배틀용」이다 */
  const put = async (name: string, count: number): Promise<number> => {
    const bank = await loadItems()
    const id = bank.all.findIndex((one) => one.name === name)
    useSaveStore.getState().addItem(bank.get(id).pocket ?? 0, id, count)
    return id
  }
  const left = async (id: number): Promise<number> => {
    const bank = await loadItems()
    return quantity(useSaveStore.getState().bag, bank.get(id).pocket ?? 0, id)
  }

  /**
   * 한 대 맞은 30레벨짜리 한 마리로 배틀을 연다.
   *
   * ⚠️ **시작 파트너(5레벨)로는 못 한다.** 20레벨 찌르꼬 한 방에 쓰러져서
   * "깎였다"가 아니라 "끝났다"가 된다 — 실제로 이 시험이 처음에 그렇게 샜다
   */
  async function hurtBattle(): Promise<string> {
    const species = await loadSpecies()
    const moves = await loadMoves()
    const sp = species.get(387)
    const mine = fillPp(
      createWild({ species: sp, level: 30, rng: () => 0.5, otId: 1, otSecretId: 2 }),
      (id) => moves.byId.get(id)?.pp ?? 5,
    )
    mine.hp = statsOf(mine, sp).hp
    useSaveStore.setState({ party: [mine] })

    await useBattleStore.getState().startWild({ species: STARLY, level: 20 })
    for (let i = 0; i < 12; i++) {
      const mon = useBattleStore.getState().truth?.active.p1
      if (mon && mon.hp > 0 && mon.hp < mon.maxHp) return mon.key
      const move = useBattleStore.getState().actions.find((a) => a.type === 'move')
      if (!move) break
      await useBattleStore.getState().choose(move)
    }
    throw new Error('열두 턴을 둬도 성하게 안 깎였다')
  }

  it('상처약을 쓰면 체력이 차고 가방에서 한 개가 빠진다', async () => {
    const key = await hurtBattle()
    const potion = await put('potion', 3)
    const before = useBattleStore.getState().truth!.active.p1!.hp
    await useBattleStore.getState().useItem(potion, key)

    // 도구를 쓰고 나면 상대가 반격하므로 지금 체력이 아니라 **회복 사건**으로 잰다
    const healed = useBattleStore.getState().events.find(
      (e) => e.kind === 'heal' && e.actor.side === 'p1')
    expect(healed, '회복 사건이 안 왔다').toBeDefined()
    if (healed?.kind === 'heal') expect(healed.condition.hp).toBeGreaterThan(before)
    expect(await left(potion), '개수가 안 줄었다').toBe(2)
    // "빛나는 상처약을 썼다!"가 줄기에 남아야 화면이 그 줄을 찍는다
    expect(useBattleStore.getState().events.some(
      (e) => e.kind === 'bagItem' && e.item === potion)).toBe(true)
  }, 30_000)

  it('아무 일도 안 일어날 도구는 개수도 안 줄고 턴도 안 쓴다', async () => {
    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })
    const potion = await put('potion', 1)
    const key = useBattleStore.getState().truth!.active.p1!.key
    const turn = useBattleStore.getState().truth!.turn

    // 만피인 애에게 상처약. 원작도 "효과가 없을 것 같다"를 띄우고 되돌린다
    expect(useBattleStore.getState().plan(potion, key)).toBeNull()
    await useBattleStore.getState().useItem(potion, key)
    expect(await left(potion)).toBe(1)
    expect(useBattleStore.getState().truth!.turn).toBe(turn)
  }, 30_000)

  it('힘의가루를 먹이면 친밀도가 깎인다 — 배틀 결과에는 안 실려 오는 값이다', async () => {
    const key = await hurtBattle()
    const powder = await put('energypowder', 1)
    const before = useSaveStore.getState().party[0]!.friendship
    await useBattleStore.getState().useItem(powder, key)
    expect(useSaveStore.getState().party[0]!.friendship, '친밀도가 그대로다')
      .toBeLessThan(before)
  }, 30_000)

  it('삐삐인형은 야생에서 반드시 도망치고 트레이너에게는 안 통한다', async () => {
    await useBattleStore.getState().startWild({ species: STARLY, level: 30 })
    const doll = await put('poke_doll', 2)
    const key = useBattleStore.getState().truth!.active.p1!.key
    await useBattleStore.getState().useItem(doll, key)
    expect(useBattleStore.getState().outcome).toBe('fled')
    expect(await left(doll)).toBe(1)
    useBattleStore.getState().close()

    // 트레이너전에서는 `battle_bag.c`가 "지금은 그럴 때가 아니다"로 막는다
    await useBattleStore.getState().startTrainer(1)
    const mine = useBattleStore.getState().truth!.active.p1!.key
    await useBattleStore.getState().useItem(doll, mine)
    expect(useBattleStore.getState().outcome).toBeNull()
    expect(await left(doll), '트레이너전인데 줄었다').toBe(1)
  }, 30_000)
})

describe('보상', () => {
  it('쓰러뜨리면 경험치가 붙고 세이브에 남는다', async () => {
    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })
    const before = useSaveStore.getState().party[0]!.exp
    await playToEnd()

    const reward = useBattleStore.getState().events.find((e) => e.kind === 'reward')
    expect(reward, '경험치 이벤트가 없다').toBeDefined()
    expect(reward!.kind === 'reward' && reward!.exp).toBeGreaterThan(0)
    // 배틀 중에 이미 반영돼야 한다 — 닫을 때 몰아 주면 두 마리째에서 레벨이 안 맞는다
    expect(useSaveStore.getState().party[0]!.exp).toBeGreaterThan(before)
    useBattleStore.getState().close()
  }, 30_000)

  it('노력치도 붙는다', async () => {
    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })
    const before = { ...useSaveStore.getState().party[0]!.evs }
    await playToEnd()
    useBattleStore.getState().close()

    const after = useSaveStore.getState().party[0]!.evs
    const grew = (['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const)
      .some((k) => after[k] > before[k])
    expect(grew, '노력치가 하나도 안 늘었다').toBe(true)
  }, 30_000)

  it('쓰러진 개체는 경험치를 못 받는다', async () => {
    // 20레벨 상대에게 5레벨로 지면 아무것도 못 받는다
    await useBattleStore.getState().startWild({ species: STARLY, level: 20 })
    const before = useSaveStore.getState().party[0]!.exp
    await playToEnd()
    expect(useBattleStore.getState().outcome).toBe('loss')
    expect(useSaveStore.getState().party[0]!.exp).toBe(before)
    useBattleStore.getState().close()
  }, 30_000)
})

/**
 * 100레벨 강자 셋을 파티에 넣는다.
 *
 * 경험치도 레벨에 맞춰야 한다 — 안 맞추면 배틀 중 보상이 들어오는 순간
 * `levelForExp`가 레벨을 도로 5로 끌어내린다
 */
/**
 * 확실히 이기는 파티.
 *
 * **여섯 마리 다 채운다.** 배틀은 `Math.random`으로 돌아서 결과가 매번 다른데,
 * 세 마리로는 난천에게 여덟 판에 한 번쯤 진다(실측). 그러면 "이겼다" 단언이
 * 이유 없이 깨진다 — 씨앗을 심는 길이 스토어에 없으므로 표본을 늘려 막는다
 */
async function giveStrongParty(ids = [483, 484, 445, 487, 493, 249]) {
  const [table, moves] = await Promise.all([loadSpecies(), loadMoves()])
  // PP를 안 채우면 전부 0으로 들어가서 발버둥만 쓴다. 세이브의 PP가 정본이 된
  // 뒤로는 개체를 만드는 쪽이 반드시 채워야 한다
  const pp = (id: number) => moves.byId.get(id)?.pp ?? 5
  const party = ids.map((id, i) => {
    const sp = table.get(id)
    const mon = createWild({ species: sp, level: 100, rng: rng(i + 1), otId: 1, otSecretId: 2 })
    mon.exp = expForLevel(sp.growthRate, 100)
    mon.moves = wildMoves(sp, 100)
    mon.hp = statsOf(mon, sp).hp
    return fillPp(mon, pp)
  })
  useSaveStore.setState({ party })
}

/** 재현 가능한 난수 (mulberry32) */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 강석(#250) 3마리 · 난천(#267) 6마리 — 실제 롬 데이터로 연다 */
const BYRON = 250
const CYNTHIA = 267

describe('트레이너전', () => {
  it('롬에서 읽은 파티가 그대로 등판한다', async () => {
    await useBattleStore.getState().startTrainer(BYRON)
    expect(useBattleStore.getState().error).toBeNull()
    expect(useBattleStore.getState().kind).toBe('trainer')
    expect(useBattleStore.getState().foeName).toBe('체육관 관장 동관')

    // 자철석 L37이 먼저 나온다 — 파티 순서가 그대로여야 한다
    const foe = useBattleStore.getState().truth!.active.p2!
    expect(foe.species).toBe(82)
    expect(foe.level).toBe(37)
    // 명부에 세 마리가 다 있어야 교체할 때 이름을 찾을 수 있다
    const p2 = Object.values(useBattleStore.getState().roster).filter((r) => r.side === 'p2')
    expect(p2.map((r) => r.species)).toEqual([82, 208, 411])
    useBattleStore.getState().close()
  }, 30_000)

  it('볼도 도망도 안 통한다', async () => {
    await useBattleStore.getState().startTrainer(BYRON)
    const before = useBattleStore.getState().events.length
    await useBattleStore.getState().throwBall(Ball.MASTER)
    await useBattleStore.getState().run()
    // 아무 일도 안 일어나야 한다. 마스터볼이 먹히면 관장을 잡아 버린다
    expect(useBattleStore.getState().events).toHaveLength(before)
    expect(useBattleStore.getState().phase).toBe('running')
    useBattleStore.getState().close()
  }, 30_000)

  it('여섯 마리를 상대로도 끝까지 간다 — 상대가 알아서 교체한다', async () => {
    // 상대가 쓰러지면 그쪽만 교체하는 턴이 오는데, 그 구간을 못 삼키면 여기서 멈춘다.
    //
    // ⚠️ 처음엔 Lv5 파트너로 붙였는데, 난천의 첫 마리도 못 넘기고 져서 교체 구간을
    // 아예 안 지나갔다. 끝까지 갔다는 것만 봤으면 통과했을 것이다 — 그래서
    // **이겨야** 하고, 상대가 실제로 갈아탔는지도 세야 한다
    await giveStrongParty()
    await useBattleStore.getState().startTrainer(CYNTHIA)
    const steps = await playToEnd(120)
    expect(steps, '한 수도 안 뒀다').toBeGreaterThan(0)
    expect(useBattleStore.getState().phase, '승부가 안 났다').toBe('over')
    expect(useBattleStore.getState().outcome).toBe('win')

    // 상대가 실제로 갈아탔는지 본다. 한 마리만 나오고 끝났다면 위 단언은
    // 교체 구간을 전혀 안 지나간 것이라 공허하다
    const sent = new Set(useBattleStore.getState().events
      .filter((e) => e.kind === 'switch' && e.actor.side === 'p2')
      .map((e) => (e.kind === 'switch' ? e.actor.name : '')))
    expect(sent.size, '상대가 한 마리도 안 바뀌었다').toBe(6)
    useBattleStore.getState().close()
  }, 60_000)

  it('경험치가 다음 마리가 나오기 전에 들어온다', async () => {
    // 원작은 쓰러뜨린 자리에서 경험치·레벨업·기술 습득을 다 보여주고 나서 다음
    // 마리를 내보낸다. 컨트롤러는 상대의 교체까지 삼키고 오므로, 보상을 사건
    // 목록 **뒤에** 붙이면 새 상대가 이미 선 뒤에 "경험치를 얻었다"가 뜬다
    await giveStrongParty()
    await useBattleStore.getState().startTrainer(CYNTHIA)
    await playToEnd(120)
    expect(useBattleStore.getState().outcome).toBe('win')

    const events = useBattleStore.getState().events
    let checked = 0
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      if (e.kind !== 'faint' || e.actor.side !== 'p2') continue
      // 이 자리 다음에 상대가 새로 서기 전까지의 구간
      let until = events.length
      for (let j = i + 1; j < events.length; j++) {
        const n = events[j]!
        if (n.kind === 'switch' && n.actor.side === 'p2') { until = j; break }
      }
      const gave = events.slice(i + 1, until).some((n) => n.kind === 'reward')
      expect(gave, `${String(i)}번째 쓰러짐 뒤에 경험치가 없다`).toBe(true)
      checked++
    }
    expect(checked, '상대가 한 마리도 안 쓰러졌다').toBe(6)
    useBattleStore.getState().close()
  }, 60_000)

  it('이기면 트레이너 보정이 붙은 경험치가 들어온다', async () => {
    // 3레벨 잡트레이너를 60레벨로 짓밟는다. 같은 상대를 야생으로 만났을 때보다
    // 1.5배여야 한다 — 그 배수가 빠지면 육성 속도가 통째로 달라진다
    const table = await loadTrainers()
    const weak = table.all.find((t) => t.party.length === 1 && t.party[0]!.level <= 5)!
    const foe = weak.party[0]!

    useSaveStore.setState({ party: [] })
    await useBattleStore.getState().startWild({ species: foe.species, level: foe.level })
    // 상대를 확실히 이기도록 우리 쪽을 키운다
    const boosted = useSaveStore.getState().party.map((m) => ({ ...m, level: 60 }))
    useBattleStore.getState().close()
    useSaveStore.setState({ party: boosted })

    const gained = async (start: () => Promise<void>) => {
      const before = useSaveStore.getState().party[0]!.exp
      await start()
      await playToEnd()
      const after = useSaveStore.getState().party[0]!.exp
      useBattleStore.getState().close()
      useSaveStore.setState({ party: boosted })
      return after - before
    }

    const wild = await gained(() =>
      useBattleStore.getState().startWild({ species: foe.species, level: foe.level }))
    const trainer = await gained(() => useBattleStore.getState().startTrainer(weak.id))
    expect(wild, '야생에서 경험치가 안 들어왔다').toBeGreaterThan(0)
    expect(trainer).toBe(Math.floor((wild * 3) / 2))
  }, 60_000)

  it('이기면 상금이 세이브의 돈에 들어온다', async () => {
    // 강석(#250)은 원작에서 4920엔을 준다
    await giveStrongParty()
    const before = useSaveStore.getState().money
    await useBattleStore.getState().startTrainer(250)
    await playToEnd(120)

    expect(useBattleStore.getState().outcome, '못 이겼다').toBe('win')
    expect(useSaveStore.getState().money - before).toBe(4920)

    // 화면에도 나와야 한다. 돈만 늘고 아무 말이 없으면 플레이어가 모른다
    const said = useBattleStore.getState().events.find((e) => e.kind === 'prize')
    expect(said).toBeDefined()
    useBattleStore.getState().close()
  }, 60_000)

  it('졌으면 상금이 없다', async () => {
    // 5레벨 하나로 강석에게 덤빈다
    useSaveStore.setState({ party: [] })
    const before = useSaveStore.getState().money
    await useBattleStore.getState().startTrainer(250)
    await playToEnd(120)

    expect(useBattleStore.getState().outcome, '이겨 버렸다 — 이 테스트가 공허하다').toBe('loss')
    expect(useSaveStore.getState().money).toBe(before)
    useBattleStore.getState().close()
  }, 60_000)
})

describe('배틀 뒤에 남는 것', () => {
  it('쓴 PP가 세이브에 남는다', async () => {
    // 안 남으면 기술을 무한히 쓸 수 있어서 PP라는 자원이 없는 것과 같다
    await giveStrongParty([483])
    const before = useSaveStore.getState().party[0]!.moves.map((m) => m.pp)
    expect(before.some((pp) => pp > 0), 'PP가 처음부터 0이다').toBe(true)

    await useBattleStore.getState().startWild({ species: RATTATA, level: 3 })
    const steps = await playToEnd(30)
    expect(steps, '한 수도 안 뒀다').toBeGreaterThan(0)
    useBattleStore.getState().close()

    const after = useSaveStore.getState().party[0]!.moves.map((m) => m.pp)
    expect(after.length).toBe(before.length)
    // 적어도 한 칸은 줄어 있어야 한다. 전부 그대로면 되돌리기가 안 된 것이다
    expect(after.some((pp, i) => pp < before[i]!), `${before} → ${after}`).toBe(true)
    // 안 쓴 칸까지 줄면 칸 순서로 되돌린 것이다
    expect(after.every((pp, i) => pp <= before[i]!)).toBe(true)
  }, 60_000)

  it('레벨업으로 배우는 기술이 빈 칸에 실제로 들어간다', async () => {
    // "배우고 싶어 한다"만 하고 안 넣으면 기술이 영영 안 늘어난다
    const species = await loadSpecies()
    const sp = species.get(STARLY)
    // 기술 한 칸만 들고 레벨업 직전까지 채워 둔다
    const mon = createWild({ species: sp, level: 4, rng: Math.random, otId: 1, otSecretId: 2 })
    mon.hp = statsOf(mon, sp).hp
    mon.moves = [{ move: 33, pp: 35, ppUps: 0 }]
    mon.exp = expForLevel(sp.growthRate, 5) - 1
    mon.level = 4
    useSaveStore.setState({ party: [mon] })

    await useBattleStore.getState().startWild({ species: RATTATA, level: 2 })
    await playToEnd(30)
    useBattleStore.getState().close()

    const after = useSaveStore.getState().party[0]!
    expect(after.level, '레벨이 안 올랐다 — 이 테스트가 공허하다').toBeGreaterThan(4)
    // 그 레벨에 배우는 기술이 실제로 있어야 비교가 성립한다
    const due = sp.learnset.filter((l) => l.level > 4 && l.level <= after.level).map((l) => l.move)
    expect(due.length, '그 구간에 배우는 기술이 없다').toBeGreaterThan(0)
    const have = after.moves.map((m) => m.move)
    expect(have).toContain(due[0])
    // PP도 채워져야 한다 — 0이면 배우자마자 못 쓰는 기술이다
    expect(after.moves.find((m) => m.move === due[0])!.pp).toBeGreaterThan(0)
  }, 60_000)

  it('네 칸이 차 있으면 안 넣고 물어본다', async () => {
    const species = await loadSpecies()
    const sp = species.get(STARLY)
    const mon = createWild({ species: sp, level: 4, rng: Math.random, otId: 1, otSecretId: 2 })
    mon.hp = statsOf(mon, sp).hp
    // 5레벨에 배우는 전광석화(98)는 일부러 뺀다 — 이미 알고 있으면 물어볼 일이 없다
    mon.moves = [33, 45, 116, 10].map((move) => ({ move, pp: 30, ppUps: 0 }))
    mon.exp = expForLevel(sp.growthRate, 5) - 1
    mon.level = 4
    useSaveStore.setState({ party: [mon] })

    await useBattleStore.getState().startWild({ species: RATTATA, level: 2 })
    await playToEnd(30)

    const reward = useBattleStore.getState().events.find((e) => e.kind === 'reward')
    expect(reward?.kind === 'reward' && reward.learned).toEqual([])
    expect(reward?.kind === 'reward' && reward.pending.length, '물어볼 게 없다').toBeGreaterThan(0)
    useBattleStore.getState().close()
    // 기술칸이 다섯 개가 되면 안 된다
    expect(useSaveStore.getState().party[0]!.moves).toHaveLength(4)
  }, 60_000)
})
