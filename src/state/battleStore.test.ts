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
import { statsOf } from '../engine/pokemon/instance'
import { loadSpecies } from '../data/gameData'

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

/** 아무거나 골라 가며 배틀이 끝날 때까지 민다 */
async function playToEnd(limit = 60): Promise<number> {
  let steps = 0
  while (useBattleStore.getState().phase === 'running' && steps < limit) {
    const actions = useBattleStore.getState().actions
    if (!actions.length) break
    // 기술이 있으면 기술을 쓴다 — 교체만 고르면 승부가 안 난다
    const pick = actions.find((a) => a.type === 'move') ?? actions[0]!
    await useBattleStore.getState().choose(pick)
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

    const view = useBattleStore.getState().view!
    expect(view.active.p1, '우리 쪽이 안 나왔다').not.toBeNull()
    expect(view.active.p2!.species).toBe(STARLY)
    expect(view.active.p2!.level).toBe(3)
    expect(useBattleStore.getState().actions.length, '고를 게 없다').toBeGreaterThan(0)
  }, 30_000)

  it('키가 파티 순서와 이어져 있다', async () => {
    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })
    const { roster, view } = useBattleStore.getState()
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
    expect(useBattleStore.getState().view!.ended).toBe(true)
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
    const inBattle = useBattleStore.getState().view!.active.p1!
    expect(inBattle.hp, 'HP가 하나도 안 깎였다 — 이 판으로는 검증이 안 된다')
      .toBeLessThan(full)
    useBattleStore.getState().close()

    const after = useSaveStore.getState().party[0]!
    // 화면이 보여 준 마지막 HP와 세이브가 같아야 한다 — 서로 다른 경로로 온 값이다
    expect(after.hp).toBe(inBattle.hp)
    expect(useBattleStore.getState().phase).toBe('off')
  }, 30_000)

  it('전멸한 파티는 다음 배틀 전에 회복된다', async () => {
    // 포켓몬센터가 생기기 전까지의 임시 규칙. 이게 없으면 한 번 지고 나면
    // 영영 배틀을 못 연다
    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })
    await playToEnd()
    useBattleStore.getState().close()

    const party = useSaveStore.getState().party.map((m) => ({ ...m, hp: 0 }))
    useSaveStore.setState({ party })

    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })
    expect(useBattleStore.getState().phase).toBe('running')
    expect(useSaveStore.getState().party[0]!.hp).toBeGreaterThan(0)
    useBattleStore.getState().close()
  }, 30_000)

  it('이미 배틀 중이면 두 번째 조우가 안 겹친다', async () => {
    await useBattleStore.getState().startWild({ species: STARLY, level: 3 })
    const view = useBattleStore.getState().view
    await useBattleStore.getState().startWild({ species: 19, level: 40 })
    expect(useBattleStore.getState().view).toBe(view)
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
    expect(useSaveStore.getState().boxes.flat().map((m) => m.species)).toContain(RATTATA)
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
