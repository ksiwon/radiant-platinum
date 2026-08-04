// 배틀 세션 상태 (PLAN §3.2 ②) — 저빈도. HP 바 애니메이션 같은 프레임 값은 여기 없다.
//
// **@pkmn/sim은 여기서 처음 로드된다.** 이 파일은 `engine/battle/sim/`을 정적으로
// 가져오지 않는다 — `startWild`가 불릴 때 `await import()`로만 들어온다 (PLAN §7.5.1).
// 위쪽 import에 `type`이 붙어 있는 것은 그래서다. 하나라도 값 import로 바꾸면
// 초기 청크에 715 kB가 실린다.
import { create } from 'zustand'
import { loadMoves, loadSpecies } from '../data/gameData'
import type { Species } from '../data/schema'
import { partyKey, applyResults } from '../engine/battle/aftermath'
import type { BattleAction } from '../engine/battle/choice'
import type { BattleEvent, SideId } from '../engine/battle/events'
import type { BattleView } from '../engine/battle/view'
import type { BattleController } from '../engine/battle/sim/controller'
import type { SideMon } from '../engine/battle/sim/session'
import { createWild, statsOf, type PokemonInstance } from '../engine/pokemon/instance'
import { useSaveStore } from './saveStore'

/** 신오의 첫 파트너. 나로 이벤트가 생기면 이 임시 지급은 사라진다 */
const STARTER = 387 // 모부기

export type BattlePhase = 'off' | 'loading' | 'running' | 'over'

/** 키로 찾는 개체 정보. 화면이 이름·모델을 고르는 데 쓴다 */
export interface RosterEntry {
  side: SideId
  species: number
  nickname: string | null
  level: number
}

export interface WildStart {
  species: number
  level: number
}

interface BattleState {
  phase: BattlePhase
  view: BattleView | null
  actions: BattleAction[]
  /** 배틀 내내 쌓인 사건. 텍스트 박스와 연출이 같은 줄기를 본다 */
  events: BattleEvent[]
  roster: Record<string, RosterEntry>
  outcome: 'win' | 'loss' | null
  error: string | null
  startWild: (wild: WildStart) => Promise<void>
  choose: (action: BattleAction) => Promise<void>
  /** 화면을 닫는다. 결과는 이 시점에 세이브로 넘어간다 */
  close: () => void
}

/** 컨트롤러는 직렬화되지 않는다 — 스토어 밖에 둔다 */
let current: BattleController | null = null

/**
 * PP까지 채운 전투용 사본.
 *
 * 세이브의 객체를 그대로 넘기면 안 된다 — 여기서 PP를 채우는 순간 영속 상태를
 * 직접 건드리게 된다. 배틀 결과는 끝난 뒤 `applyResults`로만 돌아간다.
 * (PP 소모는 아직 세이브에 안 남는다. 도구·기술 관리와 같이 온다)
 */
function ready(
  mon: PokemonInstance,
  species: Species,
  key: string,
  pp: (move: number) => number,
): SideMon {
  const copy: PokemonInstance = {
    ...mon,
    moves: mon.moves.map((s) => ({ ...s, pp: s.pp > 0 ? s.pp : pp(s.move) })),
  }
  return { mon: copy, species, key }
}

/**
 * 싸울 수 있는 파티를 확보한다.
 *
 * 아직 나로 이벤트가 없어서 파티가 비어 있을 수 있고, 포켓몬센터도 없어서 전멸한
 * 채로 남을 수 있다. 둘 다 임시로 여기서 메운다 — 진짜 이벤트가 생기면 지운다
 */
function ensureParty(table: { get(id: number): Species }): PokemonInstance[] {
  const save = useSaveStore.getState()
  let party = save.party

  if (party.length === 0) {
    const species = table.get(STARTER)
    const mon = createWild({
      species, level: 5, rng: Math.random,
      otId: save.trainer.id, otSecretId: save.trainer.secretId,
    })
    mon.hp = statsOf(mon, species).hp
    party = [mon]
  } else if (party.every((m) => m.hp <= 0)) {
    party = party.map((m) => ({ ...m, hp: statsOf(m, table.get(m.species)).hp, status: 'ok' as const }))
  } else {
    return party
  }

  useSaveStore.setState({ party })
  return party
}

export const useBattleStore = create<BattleState>((set, get) => ({
  phase: 'off',
  view: null,
  actions: [],
  events: [],
  roster: {},
  outcome: null,
  error: null,

  startWild: async (wild) => {
    if (get().phase !== 'off') return
    set({ phase: 'loading', view: null, actions: [], events: [], roster: {}, outcome: null, error: null })

    try {
      // 여기가 지연 로딩 경계다. 첫 배틀에서만 0.4~0.8초 걸리고 이후 캐시된다
      const [{ BattleController }, species, moves] = await Promise.all([
        import('../engine/battle/sim/controller'),
        loadSpecies(),
        loadMoves(),
      ])
      const pp = (id: number) => moves.byId.get(id)?.pp ?? 5

      const party = ensureParty(species)
      const foeSpecies = species.get(wild.species)
      const foe = createWild({
        species: foeSpecies, level: wild.level, rng: Math.random,
        otId: 0, otSecretId: 0,
      })
      foe.hp = statsOf(foe, foeSpecies).hp

      const roster: Record<string, RosterEntry> = {}
      const team = party.map((mon, i) => {
        roster[partyKey(i)] = {
          side: 'p1', species: mon.species, nickname: mon.nickname, level: mon.level,
        }
        return ready(mon, species.get(mon.species), partyKey(i), pp)
      })
      roster['p2-0'] = { side: 'p2', species: foe.species, nickname: null, level: foe.level }

      const trainer = useSaveStore.getState().trainer
      const { controller, step } = await BattleController.start({
        player: { name: trainer.name || '나', team },
        foe: { name: '야생', team: [ready(foe, foeSpecies, 'p2-0', pp)] },
      })
      current = controller
      set({
        phase: 'running',
        view: step.view,
        events: step.events,
        actions: controller.actions,
        roster,
      })
    } catch (e) {
      // 배틀 청크를 못 받은 경우(오프라인, 캐시 실패)를 화면이 알아야 한다
      set({ phase: 'off', error: e instanceof Error ? e.message : String(e) })
    }
  },

  choose: async (action) => {
    const controller = current
    if (!controller || get().phase !== 'running') return
    // 고르는 즉시 후보를 비운다 — 계산 중에 두 번 누르면 sim이 거절한다
    set({ actions: [] })
    const step = await controller.choose(action)
    const ended = step.view.ended
    set({
      view: step.view,
      events: [...get().events, ...step.events],
      actions: controller.actions,
      phase: ended ? 'over' : 'running',
      // 승패는 이름이 아니라 파티 상태로 판단한다 — `|win|`은 트레이너 이름을
      // 주는데 그건 겹칠 수 있고, 우리 쪽이 다 쓰러졌는지는 겹칠 수 없다
      outcome: ended ? (controller.results('p1').every((r) => r.fainted) ? 'loss' : 'win') : null,
    })
  },

  close: () => {
    const controller = current
    if (controller) {
      // 결과를 먼저 꺼낸다 — destroy 뒤에는 배틀 객체가 사라진다
      const results = controller.results('p1')
      if (results.length) {
        useSaveStore.setState({ party: applyResults(useSaveStore.getState().party, results) })
      }
      controller.destroy()
      current = null
    }
    set({ phase: 'off', view: null, actions: [], events: [], roster: {}, outcome: null })
  },
}))
