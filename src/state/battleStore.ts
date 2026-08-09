// 배틀 세션 상태 (PLAN §3.2 ②) — 저빈도. HP 바 애니메이션 같은 프레임 값은 여기 없다.
//
// **@pkmn/sim은 여기서 처음 로드된다.** 이 파일은 `engine/battle/sim/`을 정적으로
// 가져오지 않는다 — `startWild`가 불릴 때 `await import()`로만 들어온다 (PLAN §7.5.1).
// 위쪽 import에 `type`이 붙어 있는 것은 그래서다. 하나라도 값 import로 바꾸면
// 초기 청크에 715 kB가 실린다.
import { create } from 'zustand'
import {
  loadItems, loadMoves, loadSpecies, loadTrainerClasses, loadTrainerNames, loadTrainers,
  type ItemTable, type SpeciesTable,
} from '../data/gameData'
import type { Item, Species } from '../data/schema'
import { foeKey, partyKey, applyResults } from '../engine/battle/aftermath'
import type { ItemPlan } from '../engine/battle/meta/bagItem'
import { friendshipGain, isEscapeItem } from '../engine/battle/meta/bagItem'
import { clampFriendship, NO_EGG_LOCATION } from '../engine/pokemon/friendship'
import type { BattleAction, PartySlot } from '../engine/battle/choice'
import type { BattleEvent, SideId } from '../engine/battle/events'
import type { BallId } from '../engine/battle/meta/capture'
import { Ball } from '../engine/battle/meta/capture'
import { applyReward, expGain, learnMoves } from '../engine/battle/meta/reward'
import { MAX_MONEY, prizeFor } from '../engine/battle/meta/prize'
import { trainerMonToInstance } from '../engine/battle/meta/trainerParty'
import { TrainerItems } from '../engine/battle/meta/trainerItems'
import { applyEvents, emptyView, type BattleView } from '../engine/battle/view'
import type { BattleController, BattleFinish, BattleStep } from '../engine/battle/sim/controller'
import type { SideMon, SideSpec } from '../engine/battle/sim/session'
import {
  createWild, fillPp, PARTY_MAX, statsOf, type PokemonInstance,
} from '../engine/pokemon/instance'
import { store as storeInBox } from '../engine/pokemon/boxes'
import { gameLocale, useOptionsStore } from './optionsStore'
import { useSessionStore } from './sessionStore'
import { dexSet, useSaveStore } from './saveStore'

/** 컨트롤러에 넘길 트레이너 도구 묶음 */
type ControllerItems = NonNullable<
  Parameters<typeof BattleController['start']>[0]['items']
>


/** 신오의 첫 파트너. 나로 이벤트가 생기면 이 임시 지급은 사라진다 */
const STARTER = 387 // 모부기

export type BattlePhase = 'off' | 'loading' | 'running' | 'over'

/**
 * 야생전인가 트레이너전인가. 규칙이 갈리는 지점이 여럿이다 —
 * 볼·도망은 야생에서만 되고, 경험치는 트레이너전이 1.5배다
 */
export type BattleKind = 'wild' | 'trainer'

/**
 * 이 판에만 붙는 규칙 (`FieldBattleDTO.battleStatusMask`).
 *
 * 지금은 하나뿐이다 — 라이벌과의 **첫 배틀**은 급소가 안 난다
 * (`BATTLE_STATUS_FIRST_BATTLE` → `BtlCmd_CalcCrit`)
 */
export interface BattleRules {
  noCrit?: boolean
}

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
  /**
   * 이기면 받을 상금. 야생이면 0.
   *
   * 배틀을 열 때 정해 둔다 — 끝난 뒤에 계산하려면 트레이너 데이터를 다시 받아야 하고,
   * 그 사이에 트레이너 번호를 들고 있어야 한다
   */
  prize: number
  /**
   * **화면에 보이는** 뷰. sim이 내놓은 최종 상태가 아니라 재생기가 여기까지
   * 접은 것이다 (`engine/battle/playback.ts`).
   *
   * 이 둘을 안 나누면 한 턴의 결과가 통째로 0ms에 반영된다 — 체력이 동시에
   * 깎이고 "몸통박치기!"보다 게이지가 먼저 움직인다. 정본은 `finalView`다
   */
  view: BattleView | null
  /**
   * sim이 내놓은 **정본**. 화면(`view`)보다 늘 앞서 있다.
   *
   * 세이브로 옮길 값이나 규칙 판단은 이쪽을 본다 — 재생이 어디까지 갔든
   * 계산 결과는 이미 나와 있다
   */
  truth: BattleView | null
  actions: BattleAction[]
  /** 파티 여섯 칸의 지금 상태. 교체 화면이 그린다 */
  party: PartySlot[]
  /** 배틀 내내 쌓인 사건. 텍스트 박스와 연출이 같은 줄기를 본다 */
  events: BattleEvent[]
  roster: Record<string, RosterEntry>
  outcome: BattleFinish
  error: string | null
  startWild: (wild: WildStart) => Promise<void>
  /** 트레이너전을 연다. `trainerId`는 trdata 번호다 */
  startTrainer: (trainerId: number, options?: BattleRules) => Promise<void>
  choose: (action: BattleAction) => Promise<void>
  /** 볼을 던진다. 우리 턴을 쓴다 — 실패하면 야생이 반격한다 */
  throwBall: (ball?: BallId) => Promise<void>
  /**
   * 가방 도구를 쓴다. **우리 턴을 쓴다.**
   *
   * `key`는 먹일 마리(벤치도 된다), `moveSlot`은 PP 도구가 채울 칸(0부터).
   * 아무 일도 안 일어날 도구면 개수도 안 깎고 턴도 안 쓴다
   */
  useItem: (item: number, key: string, moveSlot?: number) => Promise<void>
  /**
   * 그 도구를 그 마리에게 쓰면 무슨 일이 일어나는가. 아무 일도 안 일어나면 null.
   *
   * 화면이 대상 칸을 잠그고 미리보기를 띄우는 데 쓴다. **`useItem`과 같은 함수를
   * 본다** — 안 그러면 "고를 수는 있는데 눌러도 아무 일도 없는" 칸이 생긴다.
   *
   * 도구표를 아직 못 받았으면 null이다. 화면은 그동안 다 잠긴 것으로 그린다
   */
  plan: (item: number, key: string, moveSlot?: number) => ItemPlan | null
  /** 그 마리의 기술 칸과 남은 PP. PP 도구가 어느 칸을 채울지 고르는 데 쓴다 */
  moveSlotsOf: (key: string) => { move: number | null; pp: number; maxPp: number }[]
  /** 도망친다. 실패하면 마찬가지로 턴을 버린 것이다 */
  run: () => Promise<void>
  /** 재생기가 박자 하나분을 화면에 접는다. 이것 말고는 `view`를 건드리는 곳이 없다 */
  playEvents: (events: readonly BattleEvent[]) => void
  /**
   * 시합규칙 「교체」에서 물어볼 것이 남아 있으면 상대가 내보내려는 마리의 키.
   *
   * 이게 있는 동안 화면은 "포켓몬을 교체하겠습니까?"를 띄운다
   */
  shiftAsk: string | null
  /** 그 물음에 답한다. `true`면 우리도 한 마리 바꾼다 — 턴을 안 쓴다 */
  answerShift: (change: boolean) => Promise<void>
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
 * 도구 표. **화면이 동기로 물어보기 때문에** 들고 있어야 한다 —
 * "이 상처약을 이 마리에게 쓰면 어떻게 되나"를 그릴 때마다 기다릴 수는 없다
 */
let itemTable: ItemTable | null = null
/** 기술 번호 → 최대 PP. 레벨업으로 배운 기술의 PP를 채우는 데 쓴다 */
let ppOf: (move: number) => number = () => 5

/**
 * 전투용 사본.
 *
 * 세이브의 객체를 그대로 넘기면 안 된다 — sim이 안에서 손대면 영속 상태가 같이
 * 바뀐다. 배틀 결과는 끝난 뒤 `applyResults`로만 돌아간다.
 *
 * **PP는 세이브 값을 그대로 쓴다.** 여기서 "0이면 채운다"를 하면 다 쓴 기술이
 * 배틀마다 되살아난다 — 개체를 만들 때 `fillPp`로 채우는 것이 그래서다
 */
function ready(mon: PokemonInstance, species: Species, key: string): SideMon {
  return { mon: { ...mon, moves: mon.moves.map((s) => ({ ...s })) }, species, key }
}

/**
 * 싸울 수 있는 파티를 확보한다.
 *
 * 아직 나로 이벤트가 없어서 파티가 비어 있을 수 있다. 그것만 여기서 메운다.
 *
 * ⚠️ **전멸한 파티는 여기서 안 고친다.** 예전엔 "전부 쓰러졌으면 채운다"를
 * 여기 뒀는데, 그러면 져도 다음 배틀에서 저절로 멀쩡해져서 진 것이 아무 일도
 * 아니게 된다. 회복은 포켓몬센터가 한다 (`scene/pokecenter`)
 */
function ensureParty(
  table: { get(id: number): Species },
  pp: (move: number) => number,
): PokemonInstance[] {
  const save = useSaveStore.getState()
  let party = save.party

  if (party.length > 0) return party
  {
    const species = table.get(STARTER)
    const mon = createWild({
      species, level: 5, rng: Math.random,
      otId: save.trainer.id, otSecretId: save.trainer.secretId,
    })
    mon.hp = statsOf(mon, species).hp
    party = [fillPp(mon, pp)]
  }

  useSaveStore.setState({ party })
  return party
}

export const useBattleStore = create<BattleState>((set, get) => ({
  phase: 'off',
  kind: 'wild',
  foeName: null,
  prize: 0,
  view: null,
  truth: null,
  actions: [],
  party: [],
  events: [],
  roster: {},
  outcome: null,
  error: null,
  shiftAsk: null,

  startWild: async (wild) => {
    await open(set, get, 'wild', null, 0, ({ species, pp }) => {
      const foeSpecies = species.get(wild.species)
      const foe = createWild({
        species: foeSpecies, level: wild.level, rng: Math.random, otId: 0, otSecretId: 0,
      })
      foe.hp = statsOf(foe, foeSpecies).hp
      return { name: '야생', team: [ready(fillPp(foe, pp), foeSpecies, foeKey(0))] }
    })
  },

  startTrainer: async (trainerId, options) => {
    const [table, names, classes] = await Promise.all([
      loadTrainers(), loadTrainerNames(gameLocale()), loadTrainerClasses(gameLocale()),
    ])
    const trainer = table.get(trainerId)
    // 부적금화는 도구 데이터가 아직 없어서 안 본다
    const prize = prizeFor(trainer, table.prizeMul)
    if (!trainer.party.length) {
      set({ error: `트레이너 #${trainerId}은(는) 파티가 없다` })
      return
    }
    // "체육관 관장 동관". 분류만 있고 이름이 비면 분류로 부른다
    const label = [classes[trainer.class], names[trainerId]].filter(Boolean).join(' ')

    // 트레이너가 들고 나오는 회복 도구. 개수도 종류도 롬 기록 그대로다 —
    // 라이벌은 상처약, 관장은 좋은상처약, 사천왕·챔피언은 회복약이다
    let items: ControllerItems | undefined
    if (trainer.items.length > 0) {
      const bank = await loadItems()
      items = { bag: new TrainerItems(trainer.items, bank), item: (id) => bank.get(id) }
    }

    await open(set, get, 'trainer', label, prize, ({ species, pp }) => ({
      name: label || '상대',
      team: trainer.party.map((entry, i) => {
        const sp = species.get(entry.species)
        const mon = trainerMonToInstance(entry, sp, trainerId, i)
        mon.hp = statsOf(mon, sp).hp
        return ready(fillPp(mon, pp), sp, foeKey(i))
      }),
    }), trainer.ai, options, items)
  },

  answerShift: async (change) => {
    if (!current?.shiftAsk) return
    await advance(set, get, (c) => c.answerShift(change))
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

  useItem: async (id, key, moveSlot) => {
    const controller = current
    if (!controller || get().phase !== 'running') return
    const bank = await loadItems()
    const data = bank.get(id)
    const item = { id, data }

    // 삐삐인형·에나비꼬리. 야생에서만 되고 판정 없이 도망친다
    if (isEscapeItem(data)) {
      if (get().kind !== 'wild') return
      spendFromBag(bank, id)
      await advance(set, get, () => Promise.resolve(controller.useEscapeItem(item)))
      return
    }

    // 아무 일도 안 일어날 도구는 개수도 안 깎는다. 화면이 미리 잠그지만
    // 규칙은 화면이 아니라 여기가 갖고 있어야 한다
    if (!controller.planFor(data, key, moveSlot)) return
    spendFromBag(bank, id)
    grantFriendship(data, key)
    await advance(set, get, (c) => c.useBagItem(item, key, moveSlot))
  },

  plan: (id, key, moveSlot) => {
    if (!current || !itemTable) return null
    return current.planFor(itemTable.get(id), key, moveSlot)
  },

  moveSlotsOf: (key) => current?.moveSlotsOf(key) ?? [],

  run: async () => {
    // 트레이너전은 도망칠 수 없다
    if (get().kind !== 'wild') return
    await advance(set, get, (c) => c.run())
  },

  playEvents: (events) => {
    if (!events.length) return
    set({ view: applyEvents(get().view ?? emptyView(), events) })
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
        // 화면(`view`)이 아니라 정본을 본다 — 재생이 아직 못 따라왔을 수 있다
        const seen = get().truth?.active.p2
        const mon: PokemonInstance = {
          ...caught.mon,
          hp: seen?.hp ?? caught.mon.hp,
          status: seen?.status ?? 'ok',
          otId: save.trainer.id,
          otSecretId: save.trainer.secretId,
          ball: Ball.POKE,
        }
        // 파티가 차 있으면 박스로 간다 (`PCBoxes_TryStoreBoxMon`). **지금 열려
        // 있는 박스**부터 자리를 찾고 차 있으면 다음 박스로 넘어간다 — 마지막
        // 박스에 쌓는 것이 아니다. 540칸이 다 차면 그 마리는 잃는다
        if (party.length < PARTY_MAX) party = [...party, mon]
        else boxes = storeInBox(boxes, save.currentBox, mon)?.boxes ?? boxes
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
      phase: 'off', kind: 'wild', foeName: null, prize: 0,
      view: null, truth: null, actions: [], party: [], events: [], roster: {}, outcome: null,
      shiftAsk: null,
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
  set({ actions: [], party: [] })

  const result = await step(controller)

  trackParticipants(result.events)
  // 쓰러뜨린 만큼 보상을 준다. 여러 마리가 한 턴에 쓰러질 수 있다.
  //
  // ⚠️ **쓰러진 그 자리에 끼워 넣는다.** 뒤에 몰아 붙이면 상대의 다음 마리가
  // 이미 나온 뒤에 "경험치를 얻었다"가 뜬다 — `controller.advance`가 상대의
  // 교체까지 삼키고 오기 때문에 `result.events`에는 등장 사건이 이미 들어 있다.
  // 원작은 쓰러뜨린 뒤 경험치·레벨업·기술 습득을 다 보여주고 나서 다음 마리를
  // 내보낸다 (`BattleController_CheckExpPayout` → `BattleScript_SwitchIn`)
  const events: BattleEvent[] = []
  for (const e of result.events) {
    events.push(e)
    if (e.kind === 'faint' && e.actor.side === 'p2') {
      events.push(...grantRewards(get(), e.actor.name, controller))
    }
  }

  const ended = result.view.ended
  // 상금은 이긴 그 순간 한 번만. `phase`가 'over'로 바뀌므로 두 번 올 수 없다
  if (ended && controller.finish === 'win') events.push(...grantPrize(get()))

  // ⚠️ `view`는 여기서 안 건드린다. 화면은 재생기가 박자마다 밀어 준다
  set({
    truth: result.view,
    events: [...get().events, ...events],
    actions: controller.actions,
    party: controller.party,
    phase: ended ? 'over' : 'running',
    outcome: controller.finish,
    shiftAsk: controller.shiftAsk,
  })
}

/** 쓴 도구를 가방에서 한 개 뺀다. 주머니는 도구 자료가 알고 있다 */
function spendFromBag(bank: ItemTable, id: number): void {
  useSaveStore.getState().removeItem(bank.get(id).pocket ?? 0, id, 1)
}

/**
 * 도구를 먹은 마리의 친밀도를 움직인다. 힘의가루가 깎고 배틀용이 조금 올린다.
 *
 * **세이브를 바로 고친다.** 배틀 결과(`applyResults`)는 체력·상태이상·PP만
 * 되돌리고 친밀도는 안 실어 오기 때문이다 — 여기서 안 주면 영영 안 준다.
 *
 * 구간이 지금 친밀도로 갈리므로 세이브 값을 보고 정해야 한다 (`friendshipGain`)
 */
function grantFriendship(item: Item, key: string): void {
  const party = useSaveStore.getState().party
  const index = party.findIndex((_, i) => partyKey(i) === key)
  const mon = party[index]
  if (!mon) return
  const delta = friendshipGain(item, mon.friendship, {
    ball: mon.ball,
    eggLocation: NO_EGG_LOCATION,
    mapId: useSessionStore.getState().mapId,
  })
  if (delta === 0) return
  const next = [...party]
  next[index] = { ...mon, friendship: clampFriendship(mon.friendship + delta) }
  useSaveStore.setState({ party: next })
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
    // 레벨업 기술은 **여기서 실제로 넣는다.** 배틀이 끝난 뒤로 미루면 다음
    // 상대를 새 기술 없이 맞이한다 — 원작은 오른 그 자리에서 배운다
    const taught = learnMoves(reward.mon, reward.levelUps.flatMap((l) => l.moves), ppOf)
    party[index] = taught.mon
    out.push({
      kind: 'reward',
      key,
      exp: reward.gainedExp,
      levels: reward.levelUps.map((l) => l.level),
      learned: taught.learned,
      pending: taught.pending,
    })
  }
  useSaveStore.setState({ party })
  return out
}

/** 트레이너를 이겼으면 상금을 준다. 이미 끝난 판에서 두 번 부르면 안 된다 */
function grantPrize(state: BattleState): BattleEvent[] {
  if (state.kind !== 'trainer' || !state.prize) return []
  const save = useSaveStore.getState()
  useSaveStore.setState({ money: Math.min(MAX_MONEY, save.money + state.prize) })
  return [{ kind: 'prize', money: state.prize }]
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
  prize: number,
  buildFoe: BuildFoe,
  /** 트레이너 AI 비트. 안 주면 상대는 무작위로 둔다 — 야생이 그렇다 */
  aiFlags?: number,
  rules?: BattleRules,
  items?: ControllerItems,
): Promise<void> {
  if (get().phase !== 'off') return
  set({
    phase: 'loading', kind, foeName, prize,
    view: null, truth: null, actions: [], party: [], events: [], roster: {}, outcome: null, error: null,
    shiftAsk: null,
  })

  try {
    const [{ BattleController }, species, moves, bank] = await Promise.all([
      import('../engine/battle/sim/controller'),
      loadSpecies(),
      loadMoves(),
      loadItems(),
    ])
    const pp = (id: number) => moves.byId.get(id)?.pp ?? 5
    speciesTable = species
    itemTable = bank
    ppOf = pp
    participants = new Set()

    const party = ensureParty(species, pp)
    const roster: Record<string, RosterEntry> = {}
    const team = party.map((mon, i) => {
      roster[partyKey(i)] = {
        side: 'p1', species: mon.species, nickname: mon.nickname, level: mon.level,
      }
      return ready(mon, species.get(mon.species), partyKey(i))
    })

    const foe = buildFoe({ species, pp })
    foe.team.forEach((m, i) => {
      roster[foeKey(i)] = { side: 'p2', species: m.mon.species, nickname: null, level: m.mon.level }
    })

    const trainer = useSaveStore.getState().trainer
    const { controller, step } = await BattleController.start({
      player: { name: trainer.name || '나', team },
      foe,
      // 기술 칸에 남은 PP를 띄우려면 최대치를 알아야 한다. sim 값은 못 쓴다
      basePp: pp,
      // 야생은 AI가 없다. 원작도 야생은 사실상 무작위로 둔다
      ...(aiFlags === undefined ? {} : { ai: { flags: aiFlags, moves } }),
      ...(rules?.noCrit === true ? { noCrit: true } : {}),
      ...(items ? { items } : {}),
      // 시합규칙 「교체」는 트레이너전에만 뜻이 있다 — 야생은 다음 마리가 없다
      ...(kind === 'trainer' && useOptionsStore.getState().battleRule === 0
        ? { shift: true } : {}),
    })
    current = controller
    // 첫 등판도 참가자다. 여기서 안 담으면 첫 상대를 쓰러뜨려도 경험치가 안 간다
    trackParticipants(step.events)
    set({
      phase: 'running',
      truth: step.view,
      // 빈 무대에서 시작한다. 등판도 재생기가 한 박자씩 올린다
      view: emptyView(),
      events: step.events,
      actions: controller.actions,
      party: controller.party,
      roster,
      shiftAsk: controller.shiftAsk,
    })
  } catch (e) {
    // 배틀 청크를 못 받은 경우(오프라인, 캐시 실패)를 화면이 알아야 한다
    set({ phase: 'off', error: e instanceof Error ? e.message : String(e) })
  }
}
