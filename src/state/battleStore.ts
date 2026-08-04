// 배틀 세션 상태 (PLAN §3.2 ②) — 저빈도. HP 바 애니메이션 같은 프레임 값은 여기 없다.
//
// **@pkmn/sim은 여기서 처음 로드된다.** 이 파일은 `engine/battle/sim/`을 정적으로
// 가져오지 않는다 — `startWild`가 불릴 때 `await import()`로만 들어온다 (PLAN §7.5.1).
// 위쪽 import에 `type`이 붙어 있는 것은 그래서다. 하나라도 값 import로 바꾸면
// 초기 청크에 715 kB가 실린다.
import { create } from 'zustand'
import {
  loadMoves, loadSpecies, loadTrainerClasses, loadTrainerNames, loadTrainers,
  type SpeciesTable,
} from '../data/gameData'
import type { Species } from '../data/schema'
import { foeKey, partyKey, applyResults } from '../engine/battle/aftermath'
import type { BattleAction } from '../engine/battle/choice'
import type { BattleEvent, SideId } from '../engine/battle/events'
import type { BallId } from '../engine/battle/meta/capture'
import { Ball } from '../engine/battle/meta/capture'
import { applyReward, expGain } from '../engine/battle/meta/reward'
import { trainerMonToInstance } from '../engine/battle/meta/trainerParty'
import type { BattleView } from '../engine/battle/view'
import type { BattleController, BattleFinish, BattleStep } from '../engine/battle/sim/controller'
import type { SideMon, SideSpec } from '../engine/battle/sim/session'
import { createWild, statsOf, type PokemonInstance } from '../engine/pokemon/instance'
import { dexSet, useSaveStore } from './saveStore'

/** 파티 최대 인원. 넘으면 박스로 간다 */
const PARTY_MAX = 6
/** 표시 로케일. 설정이 생기면 여기서 갈라진다 */
const LOCALE = 'ko' as const

/** 신오의 첫 파트너. 나로 이벤트가 생기면 이 임시 지급은 사라진다 */
const STARTER = 387 // 모부기

export type BattlePhase = 'off' | 'loading' | 'running' | 'over'

/**
 * 야생전인가 트레이너전인가. 규칙이 갈리는 지점이 여럿이다 —
 * 볼·도망은 야생에서만 되고, 경험치는 트레이너전이 1.5배다
 */
export type BattleKind = 'wild' | 'trainer'

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
  kind: BattleKind
  /** 상대 트레이너 표시 이름("체육관 관장 동관"). 야생이면 null */
  foeName: string | null
  view: BattleView | null
  actions: BattleAction[]
  /** 배틀 내내 쌓인 사건. 텍스트 박스와 연출이 같은 줄기를 본다 */
  events: BattleEvent[]
  roster: Record<string, RosterEntry>
  outcome: BattleFinish
  error: string | null
  startWild: (wild: WildStart) => Promise<void>
  /** 트레이너전을 연다. `trainerId`는 trdata 번호다 */
  startTrainer: (trainerId: number) => Promise<void>
  choose: (action: BattleAction) => Promise<void>
  /** 볼을 던진다. 우리 턴을 쓴다 — 실패하면 야생이 반격한다 */
  throwBall: (ball?: BallId) => Promise<void>
  /** 도망친다. 실패하면 마찬가지로 턴을 버린 것이다 */
  run: () => Promise<void>
  /** 화면을 닫는다. 결과는 이 시점에 세이브로 넘어간다 */
  close: () => void
}

/** 컨트롤러는 직렬화되지 않는다 — 스토어 밖에 둔다 */
let current: BattleController | null = null
/** 이번 배틀에서 한 번이라도 나온 우리 개체의 키. 경험치를 나눠 가질 인원이다 */
let participants = new Set<string>()
/** 종족 표. 보상 계산이 매번 다시 받지 않도록 들고 있는다 */
let speciesTable: { get(id: number): Species } | null = null

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
  kind: 'wild',
  foeName: null,
  view: null,
  actions: [],
  events: [],
  roster: {},
  outcome: null,
  error: null,

  startWild: async (wild) => {
    await open(set, get, 'wild', null, ({ species, pp }) => {
      const foeSpecies = species.get(wild.species)
      const foe = createWild({
        species: foeSpecies, level: wild.level, rng: Math.random, otId: 0, otSecretId: 0,
      })
      foe.hp = statsOf(foe, foeSpecies).hp
      return { name: '야생', team: [ready(foe, foeSpecies, foeKey(0), pp)] }
    })
  },

  startTrainer: async (trainerId) => {
    const [table, names, classes] = await Promise.all([
      loadTrainers(), loadTrainerNames(LOCALE), loadTrainerClasses(LOCALE),
    ])
    const trainer = table.get(trainerId)
    if (!trainer.party.length) {
      set({ error: `트레이너 #${trainerId}은(는) 파티가 없다` })
      return
    }
    // "체육관 관장 동관". 분류만 있고 이름이 비면 분류로 부른다
    const label = [classes[trainer.class], names[trainerId]].filter(Boolean).join(' ')

    await open(set, get, 'trainer', label, ({ species, pp }) => ({
      name: label || '상대',
      team: trainer.party.map((entry, i) => {
        const sp = species.get(entry.species)
        const mon = trainerMonToInstance(entry, sp, trainerId, i)
        mon.hp = statsOf(mon, sp).hp
        return ready(mon, sp, foeKey(i), pp)
      }),
    }))
  },

  choose: async (action) => {
    await advance(set, get, (c) => c.choose(action))
  },

  throwBall: async (ball = Ball.POKE) => {
    // 트레이너의 포켓몬에는 볼을 못 던진다. 화면도 버튼을 안 보여주지만,
    // 규칙은 화면이 아니라 여기가 갖고 있어야 한다
    if (get().kind !== 'wild') return
    await advance(set, get, (c) => c.throwBall(ball, {
      // 시간대·지형은 아직 없다. 다이브·다크볼이 보정을 못 받는다는 뜻이다
      caughtBefore: false, inWater: false, darkness: false,
    }))
  },

  run: async () => {
    // 트레이너전은 도망칠 수 없다
    if (get().kind !== 'wild') return
    await advance(set, get, (c) => c.run())
  },

  close: () => {
    const controller = current
    if (controller) {
      // 결과를 먼저 꺼낸다 — destroy 뒤에는 배틀 객체가 사라진다
      const results = controller.results('p1')
      const save = useSaveStore.getState()
      let party = results.length ? applyResults(save.party, results) : save.party
      let boxes = save.boxes
      let pokedex = save.pokedex

      const caught = controller.captured
      if (caught) {
        const seen = get().view?.active.p2
        const mon: PokemonInstance = {
          ...caught.mon,
          hp: seen?.hp ?? caught.mon.hp,
          status: seen?.status ?? 'ok',
          otId: save.trainer.id,
          otSecretId: save.trainer.secretId,
          ball: Ball.POKE,
        }
        // 파티가 차 있으면 박스로 간다. 원작과 같다
        if (party.length < PARTY_MAX) party = [...party, mon]
        else boxes = [...boxes.slice(0, -1), [...(boxes[boxes.length - 1] ?? []), mon]]
        pokedex = {
          seen: dexSet(pokedex.seen, mon.species),
          caught: dexSet(pokedex.caught, mon.species),
        }
      }
      useSaveStore.setState({ party, boxes, pokedex })
      controller.destroy()
      current = null
    }
    participants = new Set()
    set({
      phase: 'off', kind: 'wild', foeName: null,
      view: null, actions: [], events: [], roster: {}, outcome: null,
    })
  },
}))

type SetState = (partial: Partial<BattleState>) => void
type GetState = () => BattleState

/**
 * 한 걸음을 밀고 그 결과를 스토어에 반영한다. 고르기·볼·도망이 전부 여기로 온다.
 *
 * 경험치는 **이 안에서** 준다. 배틀이 끝난 뒤 몰아서 주면 레벨업이 승부가 난
 * 뒤에야 뜨고, 두 마리째를 상대할 때 이미 올라 있어야 할 레벨이 안 올라 있다
 */
async function advance(
  set: SetState,
  get: GetState,
  step: (controller: BattleController) => Promise<BattleStep>,
): Promise<void> {
  const controller = current
  if (!controller || get().phase !== 'running') return
  // 미는 즉시 후보를 비운다 — 계산 중에 두 번 누르면 sim이 거절한다
  set({ actions: [] })

  const result = await step(controller)
  const events = [...result.events]

  trackParticipants(events)
  // 쓰러뜨린 만큼 보상을 준다. 여러 마리가 한 턴에 쓰러질 수 있다
  for (const e of result.events) {
    if (e.kind === 'faint' && e.actor.side === 'p2') {
      events.push(...grantRewards(get(), e.actor.name, controller))
    }
  }

  const ended = result.view.ended
  set({
    view: result.view,
    events: [...get().events, ...events],
    actions: controller.actions,
    phase: ended ? 'over' : 'running',
    outcome: controller.finish,
  })
}

/** 나온 적이 있어야 경험치를 나눠 가진다 */
function trackParticipants(events: readonly BattleEvent[]): void {
  for (const e of events) {
    if (e.kind === 'switch' && e.actor.side === 'p1') participants.add(e.actor.name)
  }
}

/** 쓰러진 상대 하나분의 경험치를 참가자에게 나눠 준다. 세이브를 바로 갱신한다 */
function grantRewards(
  state: BattleState,
  foeKey: string,
  controller: BattleController,
): BattleEvent[] {
  const table = speciesTable
  const foe = state.roster[foeKey]
  if (!table || !foe) return []

  // 쓰러진 참가자는 4세대에서도 경험치를 못 받는다
  const down = new Set(controller.results('p1').filter((r) => r.fainted).map((r) => r.key))
  const alive = [...participants].filter((k) => !down.has(k))
  if (!alive.length) return []

  const foeSpecies = table.get(foe.species)
  const gain = expGain({
    baseExp: foeSpecies.baseExp,
    level: foe.level,
    participants: alive.length,
    trainerBattle: state.kind === 'trainer',
  })

  const party = [...useSaveStore.getState().party]
  const out: BattleEvent[] = []
  for (const key of alive) {
    const index = party.findIndex((_, i) => partyKey(i) === key)
    const mon = party[index]
    if (!mon) continue
    const reward = applyReward(mon, table.get(mon.species), gain, foeSpecies.ev)
    party[index] = reward.mon
    out.push({
      kind: 'reward',
      key,
      exp: reward.gainedExp,
      levels: reward.levelUps.map((l) => l.level),
      learned: reward.levelUps.flatMap((l) => l.moves),
    })
  }
  useSaveStore.setState({ party })
  return out
}

/** 상대 쪽을 만드는 것. 야생 한 마리든 트레이너 여섯 마리든 모양은 같다 */
type BuildFoe = (ctx: { species: SpeciesTable; pp: (move: number) => number }) => SideSpec

/**
 * 배틀을 연다. 야생·트레이너가 다른 것은 상대를 어떻게 만드느냐뿐이다.
 *
 * **여기가 지연 로딩 경계다** — `@pkmn/sim`은 이 `await import()`에서 처음 들어온다.
 * 첫 배틀에서만 0.4~0.8초 걸리고 이후 캐시된다 (PLAN §7.5.1)
 */
async function open(
  set: SetState,
  get: GetState,
  kind: BattleKind,
  foeName: string | null,
  buildFoe: BuildFoe,
): Promise<void> {
  if (get().phase !== 'off') return
  set({
    phase: 'loading', kind, foeName,
    view: null, actions: [], events: [], roster: {}, outcome: null, error: null,
  })

  try {
    const [{ BattleController }, species, moves] = await Promise.all([
      import('../engine/battle/sim/controller'),
      loadSpecies(),
      loadMoves(),
    ])
    const pp = (id: number) => moves.byId.get(id)?.pp ?? 5
    speciesTable = species
    participants = new Set()

    const party = ensureParty(species)
    const roster: Record<string, RosterEntry> = {}
    const team = party.map((mon, i) => {
      roster[partyKey(i)] = {
        side: 'p1', species: mon.species, nickname: mon.nickname, level: mon.level,
      }
      return ready(mon, species.get(mon.species), partyKey(i), pp)
    })

    const foe = buildFoe({ species, pp })
    foe.team.forEach((m, i) => {
      roster[foeKey(i)] = { side: 'p2', species: m.mon.species, nickname: null, level: m.mon.level }
    })

    const trainer = useSaveStore.getState().trainer
    const { controller, step } = await BattleController.start({
      player: { name: trainer.name || '나', team },
      foe,
    })
    current = controller
    // 첫 등판도 참가자다. 여기서 안 담으면 첫 상대를 쓰러뜨려도 경험치가 안 간다
    trackParticipants(step.events)
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
}
