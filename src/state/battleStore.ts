// 배틀 세션 상태 (PLAN §3.2 ②) — 저빈도. HP 바 애니메이션 같은 프레임 값은 여기 없다.
//
// **@pkmn/sim은 여기서 처음 로드된다.** 이 파일은 `engine/battle/sim/`을 정적으로
// 가져오지 않는다 — `startWild`가 불릴 때 `await import()`로만 들어온다 (PLAN §7.5.1).
// 위쪽 import에 `type`이 붙어 있는 것은 그래서다. 하나라도 값 import로 바꾸면
// 초기 청크에 715 kB가 실린다.
import { create } from 'zustand'
import {
  loadItems, loadMoves, loadSpecies, loadTrainerClasses, loadTrainerNames, loadTrainers,
  type ItemTable, type SpeciesLookup, type SpeciesTable,
} from '../data/gameData'
import type { Item, Species } from '../data/schema'
import { foeKey, partyKey, applyResults } from '../engine/battle/aftermath'
import type { ItemPlan } from '../engine/battle/meta/bagItem'
import { friendshipGain, isEscapeItem } from '../engine/battle/meta/bagItem'
import { clampFriendship } from '../engine/pokemon/friendship'
import { caughtAt, metToday } from '../engine/pokemon/origin'
import { mapById, world } from '../engine/map/world'
import { Terrain, terrainOf, type TerrainId } from '../engine/battle/terrain'
import { burmyCloak, SPECIES_BURMY } from '../engine/pokemon/form'
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
  createWild, fillPp, PARTY_MAX, statsOf, type PokemonInstance, type Status,
} from '../engine/pokemon/instance'
import { store as storeInBox } from '../engine/pokemon/boxes'
import { encounters } from '../engine/battle/encounterSystem'
import { LeadAbility, leadHas, wildGender, wildNature } from '../engine/battle/encounterLead'
import { gameLocale, useOptionsStore } from './optionsStore'
import { useSessionStore } from './sessionStore'
import { markBattle } from '../app/sceneMark'
import { useEvolutionStore } from './evolutionStore'
import { useMenuStore } from './menuStore'
import { dexSet, playerTrainer, useSaveStore } from './saveStore'
import { worldState } from './worldState'

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
  /** 배회 포켓몬과의 판 (PARITY §6.3). 묶어 두지 않으면 상대가 달아난다 */
  roamer?: boolean
}

/** 키로 찾는 개체 정보. 화면이 이름·모델을 고르는 데 쓴다 */
export interface RosterEntry {
  side: SideId
  species: number
  /**
   * 어느 모습인가 (PARITY §3.4).
   *
   * ⚠️ **뷰가 이 값을 들고 있어야 무대에 제 모습이 선다.** sim이 내는 프로토콜은
   * 이름을 실어 오지만 우리 씬은 번호로 돌고, 폼은 그 번호에 안 담긴다
   */
  form: number
  nickname: string | null
  level: number
}

export interface WildStart {
  species: number
  level: number
  /**
   * 어느 모습으로 나오는가 (PARITY §3.4).
   *
   * 맵이나 방이 정한다 (`wildForm`). 전설 조우처럼 스크립트가 부르는 자리는
   * 안 넘기고, 그러면 기본 모습이다
   */
  form?: number
  /**
   * 배회 포켓몬이면 그 자리 번호 (PARITY §6.3).
   *
   * 개체는 세이브에 있다 — 여기로는 **어느 자리인지**만 온다
   */
  roamer?: number | null
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
  /**
   * **지금 물어보고 있는 자리**에서 고를 수 있는 것.
   *
   * 싱글은 늘 한 자리라 예전과 같다. 더블은 자리마다 한 번씩 물어보므로
   * `atSlot`이 바뀔 때마다 이 목록도 갈린다
   */
  actions: BattleAction[]
  /** 더블인가 (PARITY §2.2). 화면이 자리 수를 이걸로 안다 */
  doubles: boolean
  /**
   * 지금 명령을 묻고 있는 자리 번호. 싱글은 늘 0.
   *
   * 더블은 첫째 마리 → 둘째 마리 차례로 묻고, B로 앞 자리로 되돌아간다 —
   * 원작도 그 자리에서 뒤로 갈 수 있다
   */
  atSlot: number
  /** 이번 턴에 이미 정한 명령들. 자리를 다 채우면 한 줄로 나간다 */
  pending: BattleAction[]
  /** 파티 여섯 칸의 지금 상태. 교체 화면이 그린다 */
  party: PartySlot[]
  /**
   * 지금 **턴을 쓸 수 있는가** — 볼·도망·가방이 열리는 조건이다.
   *
   * 쓰러져 갈아타는 턴, 참기·역린처럼 기술에 묶인 턴, 도발에 걸린 턴에는
   * 닫힌다. 원작도 그 자리에서는 명령 창을 안 띄운다 —
   * 눌러도 아무 일이 없는 칸을 남기지 않으려고 화면까지 이 값을 올린다
   */
  canSpendTurn: boolean
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
  /**
   * 앞 자리로 되돌아간다 (더블). 첫 자리면 아무것도 안 하고 false.
   *
   * 원작도 둘째 마리의 명령 창에서 B를 누르면 첫째로 돌아간다
   */
  backSlot: () => boolean
  /**
   * 기술 칸이 다 찼을 때의 답 (`BATTLE_SUBSCRIPT_LEARN_MOVE`).
   *
   * `forget`이 null이면 안 배운다. 아니면 그 칸을 새 기술로 갈아 끼운다 —
   * **PP는 새로 채운다.** 원작도 잊은 기술의 남은 PP를 물려주지 않는다
   */
  learnMove: (key: string, move: number, forget: number | null) => void
  /** 화면을 닫는다. 결과는 이 시점에 세이브로 넘어간다 */
  close: () => void
}

/** 컨트롤러는 직렬화되지 않는다 — 스토어 밖에 둔다 */
let current: BattleController | null = null
/** 이번 배틀에서 한 번이라도 나온 우리 개체의 키. 경험치를 나눠 가질 인원이다 */
let participants = new Set<string>()
/**
 * 이번 배틀에서 **레벨이 오른** 파티 자리. 원작의 `leveledUpMonsMask`다.
 *
 * 배틀이 닫힐 때 이 자리들만 진화를 확인한다 — 원작도 레벨이 안 오른 마리는
 * 안 본다(친밀도가 문턱을 넘어도 그 판에서는 안 진화한다)
 */
let leveledUp = new Set<number>()
/** 종족 표. 보상 계산이 매번 다시 받지 않도록 들고 있는다 */
let speciesTable: SpeciesLookup | null = null
/**
 * 도구 표. **화면이 동기로 물어보기 때문에** 들고 있어야 한다 —
 * "이 상처약을 이 마리에게 쓰면 어떻게 되나"를 그릴 때마다 기다릴 수는 없다
 */
let itemTable: ItemTable | null = null
/** 기술 번호 → 최대 PP. 레벨업으로 배운 기술의 PP를 채우는 데 쓴다 */
let ppOf: (move: number) => number = () => 5
/**
 * 이번 판의 상대가 배회 포켓몬이면 그 자리 번호 (PARITY §6.3).
 *
 * ⚠️ **닫을 때까지 들고 있어야 한다.** 남은 체력을 어느 자리에 적을지가
 * 여기서만 나온다 — 종족으로 되찾으려 하면 같은 종이 둘 도는 판에서 갈린다
 */
let roamerMet: number | null = null

/** 세이브에 적힌 그 배회의 남은 체력과 상태이상. 자리가 비었으면 아무것도 안 바꾼다 */
function foeVitals(slot: number, maxHp: number | null): { hp: number; status: Status } | object {
  const saved = useSaveStore.getState().roamers[slot]
  if (!saved?.active) return {}
  return { hp: maxHp === null ? saved.hp : Math.min(saved.hp, maxHp), status: saved.status }
}

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
  table: SpeciesLookup,
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
  doubles: false,
  atSlot: 0,
  pending: [],
  party: [],
  canSpendTurn: false,
  events: [],
  roster: {},
  outcome: null,
  error: null,
  shiftAsk: null,

  startWild: async (wild) => {
    await open(set, get, 'wild', null, 0, ({ species, pp }) => {
      // ⚠️ **개체는 기본형으로 만들고 모습을 나중에 적는다.** 폼 칸을 넘기면
      // `createWild`가 그 칸의 번호(로토무 히트면 503)를 종족으로 박는다.
      // 원작도 `Pokemon_InitWith` 뒤에 `AddWildMonToParty`가 폼을 적는다
      const base = species.get(wild.species)
      // 선두 특성이 성격·성별·가진 도구까지 민다 (PARITY §1.22). 싱크로는
      // 성격을, 헤롱헤롱바디는 반대 성별을, 복안은 도구 확률을 올린다
      const lead = encounters.mods.lead
      const foe = createWild({
        species: base, level: wild.level, rng: Math.random, otId: 0, otSecretId: 0,
        bias: {
          nature: wildNature(lead, Math.random),
          gender: wildGender(lead, Math.random),
        },
        compoundEyes: leadHas(lead, LeadAbility.COMPOUND_EYES),
      })
      foe.form = wild.form ?? 0
      const foeSpecies = species.of(foe)
      foe.hp = statsOf(foe, foeSpecies).hp
      // ⚠️ **배회는 그때그때 만드는 개체가 아니다** (PARITY §6.3). 성격값과
      // 개체값이 세이브에 적혀 있고, 남은 체력과 상태이상도 지난번 그대로다 —
      // 여기서 덮어써야 도망친 그 마리가 같은 마리로 다시 선다
      const at = wild.roamer ?? null
      if (at !== null) {
        const saved = useSaveStore.getState().roamers[at]
        if (saved?.active) {
          foe.pid = saved.pid
          foe.ivs = saved.ivs
          foe.status = saved.status
          foe.hp = Math.min(saved.hp, statsOf(foe, foeSpecies).hp)
        }
      }
      roamerMet = at
      return { name: '야생', team: [ready(fillPp(foe, pp), foeSpecies, foeKey(0))] }
    }, undefined, wild.roamer == null ? undefined : { roamer: true })
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

    // 더블 배틀 (PARITY §2.2). 롬이 트레이너마다 적어 둔 표식이다 —
    // 928명 중 28명이 참이다.
    //
    // ⚠️ **양쪽 다 두 마리가 있어야 연다.** 원작은 스크립트가 먼저 세어 보고
    // "포켓몬이 두 마리 필요하다"로 막지만(§10 「글 칸 채우기」), 우리는 아직
    // 그 자리가 없다 — 한 마리로 더블을 열면 sim이 시작하자마자 승부를 낸다.
    // 여기서 싱글로 떨어뜨리는 것이 그 사이의 방어선이다
    const able = useSaveStore.getState().party.filter((m) => !m.isEgg && m.hp > 0).length
    const doubles = trainer.double && trainer.party.length >= 2 && able >= 2

    await open(set, get, 'trainer', label, prize, ({ species, pp }) => ({
      name: label || '상대',
      team: trainer.party.map((entry, i) => {
        const sp = species.get(entry.species)
        const mon = trainerMonToInstance(entry, sp, trainerId, i)
        mon.hp = statsOf(mon, sp).hp
        return ready(fillPp(mon, pp), sp, foeKey(i))
      }),
    }), trainer.ai, options, items, doubles)
  },

  answerShift: async (change) => {
    if (!current?.shiftAsk) return
    await advance(set, get, (c) => c.answerShift(change))
  },

  /**
   * 이 자리의 명령을 정한다 (PARITY §2.2).
   *
   * ⚠️ **싱글은 곧바로 나가고 더블은 모았다 나간다.** sim이 더블에서 두 자리의
   * 명령을 쉼표로 묶은 한 줄로만 받기 때문이다 — 자리마다 따로 보내면 첫 줄이
   * 거절되고 배틀이 그 자리에 선다
   */
  choose: async (action) => {
    const controller = current
    if (!controller || get().phase !== 'running') return
    const at = get().atSlot
    const pending = [...get().pending.filter((a) => (a.at ?? 0) !== at), { ...action, at }]
    const left = controller.chooseSlots.filter(
      (i) => !pending.some((a) => (a.at ?? 0) === i),
    )
    if (left.length > 0) {
      // 아직 물어볼 자리가 남았다. 화면만 다음 자리로 옮긴다
      set(turnState(controller, pending))
      return
    }
    await advance(set, get, (c) => c.chooseTurn(pending))
  },

  backSlot: () => {
    const controller = current
    const pending = get().pending
    if (!controller || pending.length === 0) return false
    set(turnState(controller, pending.slice(0, -1)))
    return true
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

    // ⚠️ **더블에서는 도구가 그 자리의 이번 턴 명령이다.** 원작도 가방이
    // 명령 창의 한 칸이라, 도구를 쓰면 그 마리는 그 턴에 기술을 못 쓴다.
    // 나머지 자리는 그대로 물어봐야 하므로 여기서 보내지 않고 모은다
    if (get().doubles) {
      const at = get().atSlot
      const armed = controller.armBagItem(item, key, at, moveSlot)
      if (!armed) return
      spendFromBag(bank, id)
      grantFriendship(data, key)
      const pending = [...get().pending.filter((a) => (a.at ?? 0) !== at), armed.action]
      set({ events: [...get().events, ...armed.events] })
      const left = controller.chooseSlots.filter(
        (i) => !pending.some((a) => (a.at ?? 0) === i),
      )
      if (left.length > 0) { set(turnState(controller, pending)); return }
      await advance(set, get, (c) => c.chooseTurn(pending))
      return
    }

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

  learnMove: (key, move, forget) => {
    if (forget === null) return
    const party = [...useSaveStore.getState().party]
    const index = party.findIndex((_, i) => partyKey(i) === key)
    const mon = party[index]
    if (!mon || forget < 0 || forget >= mon.moves.length) return
    // 이미 아는 기술이면 아무것도 안 한다 — 같은 기술이 두 칸에 서면 안 된다
    if (mon.moves.some((s) => s.move === move)) return
    const moves = [...mon.moves]
    moves[forget] = { move, pp: ppOf(move), ppUps: 0 }
    party[index] = { ...mon, moves }
    useSaveStore.setState({ party })
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
        const seen = get().truth?.active.p2a
        // 잡은 자리·잡은 레벨·오늘 날짜를 새긴다 (`Pokemon_SetCatchData` →
        // `sel = 0`). 자리는 맵 번호가 아니라 **지역명 번호**다 —
        // 원작도 `MapHeader_GetMapLabelTextID`를 넘긴다
        const level = seen?.level ?? caught.mon.level
        const mon: PokemonInstance = {
          ...caught.mon,
          hp: seen?.hp ?? caught.mon.hp,
          status: seen?.status ?? 'ok',
          otId: save.trainer.id,
          otSecretId: save.trainer.secretId,
          ball: controller.capturedBall ?? Ball.POKE,
          origin: caughtAt(
            playerTrainer(save.trainer),
            mapById(useSessionStore.getState().mapId)?.label ?? 0,
            level,
            metToday(),
          ),
        }
        // 파티가 차 있으면 박스로 간다 (`PCBoxes_TryStoreBoxMon`). **지금 열려
        // 있는 박스**부터 자리를 찾고 차 있으면 다음 박스로 넘어간다 — 마지막
        // 박스에 쌓는 것이 아니다. 540칸이 다 차면 그 마리는 잃는다
        if (party.length < PARTY_MAX) party = [...party, mon]
        else boxes = storeInBox(boxes, save.currentBox, mon)?.boxes ?? boxes
        pokedex = {
          seen: dexSet(pokedex.seen, mon.species),
          caught: dexSet(pokedex.caught, mon.species),
          // 잡은 것도 상대해 본 것이다 (§2.22)
          battled: dexSet(pokedex.battled, mon.species),
        }
      }
      // 도롱마담은 싸운 땅의 옷감으로 갈아입는다 (PARITY §3.4)
      party = dressBurmy(party)
      useSaveStore.setState({ party, boxes, pokedex })
      // 배회는 여기서 자리를 옮기거나 지워진다 (PARITY §6.3).
      //
      // ⚠️ **만난 판이 아니어도 부른다.** 원작은 야생을 한 판 치를 때마다
      // 30%로 이 맵의 배회를 흩어 놓는다 — 안 부르면 같은 도로에서 야생만
      // 잡는 동안 배회가 붙박이가 된다
      if (get().kind === 'wild') {
        const foe = get().truth?.active.p2a ?? null
        encounters.roamerAfterBattle?.({
          met: roamerMet,
          mapId: world.mapId,
          hp: foe?.hp ?? 0,
          status: foe?.status ?? 'ok',
          outcome: get().outcome === 'caught' ? 'caught'
            : get().outcome === 'win' ? 'win' : 'other',
        })
      }
      // 레벨이 오른 자리를 진화 큐에 넘긴다. 이긴 판·잡은 판·도망친 판에서만이다
      // (`Battle_FindEvolvingPartyMember`가 그 셋으로 거른다) — 진 판에서는
      // 병원으로 실려 가므로 진화 장면이 끼어들면 안 된다
      const finish = get().outcome
      if (leveledUp.size > 0 && (finish === 'win' || finish === 'caught' || finish === 'fled')) {
        useEvolutionStore.getState().queue([...leveledUp])
      }
      controller.destroy()
      current = null
    }
    participants = new Set()
    leveledUp = new Set()
    // 진화할 마리가 있으면 필드로 돌아가기 전에 그 장면이 먼저다. 원작도
    // 배틀 화면이 닫히면서 바로 이 화면으로 넘어간다
    if (useEvolutionStore.getState().pending.length > 0) useMenuStore.getState().open('evolution')
    set({
      phase: 'off', kind: 'wild', foeName: null, prize: 0,
      view: null, truth: null, actions: [], party: [], canSpendTurn: false,
      events: [], roster: {}, outcome: null, shiftAsk: null,
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
/**
 * 다음에 물어볼 자리와 그 자리의 후보.
 *
 * ⚠️ **자리를 다시 셀 때마다 이걸로 만든다.** 예전에는 `controller.actions`
 * 하나였는데, 더블은 「지금 몇 번째 자리를 묻고 있는가」가 있어야 후보가 정해진다 —
 * 그 값을 세 군데에서 따로 만들면 한 곳이 곧 어긋난다
 */
function turnState(controller: BattleController, pending: BattleAction[] = []) {
  const slots = controller.chooseSlots
  const done = new Set(pending.map((a) => a.at ?? 0))
  const at = slots.find((i) => !done.has(i)) ?? slots[0] ?? 0
  const taken = pending.filter((a) => a.type === 'switch').map((a) => a.index)
  return {
    atSlot: at,
    pending,
    actions: controller.actionsAt(at, taken),
    party: controller.party,
    canSpendTurn: controller.canSpendAt(at),
  }
}

async function advance(
  set: SetState,
  get: GetState,
  step: (controller: BattleController) => Promise<BattleStep>,
): Promise<void> {
  const controller = current
  if (!controller || get().phase !== 'running') return
  // 미는 즉시 후보를 비운다 — 계산 중에 두 번 누르면 sim이 거절한다
  set({ actions: [], party: [], canSpendTurn: false, pending: [], atSlot: 0 })

  const result = await step(controller)

  trackParticipants(result.events)
  trackDex(result.events, get().roster)
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
    ...turnState(controller),
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
    eggLocation: mon.origin.egg.location,
    // 원작이 견주는 것은 맵 번호가 아니라 **지역명 번호**다 (`Pokemon_UpdateFriendship`이
    // 알 자리와 견주는데, 알 자리에 들어간 값이 지역명 번호다)
    mapId: mapById(useSessionStore.getState().mapId)?.label ?? 0,
  })
  if (delta === 0) return
  const next = [...party]
  next[index] = { ...mon, friendship: clampFriendship(mon.friendship + delta) }
  useSaveStore.setState({ party: next })
}

/**
 * 이번 배틀이 선 땅. 배틀이 열릴 때 한 번 정한다.
 *
 * ⚠️ **끝날 때 다시 재면 안 된다.** 도롱마담 옷감은 배틀이 끝나면서 정해지는데
 * (`BattleMain_CopyBattleSysToDTOAndFree`) 그 시점에 플레이어는 이미 다른 칸에
 * 서 있을 수 있다 — 워프로 들어간 배틀이 그렇다
 */
let battleTerrain: TerrainId = Terrain.PLAIN

/**
 * 도롱마담이 싸운 땅의 옷감을 입는다 (`BattleSystem_SetBurmyForm`).
 *
 * ⚠️ **나온 마리만 갈아입는다.** 원작이 `battleParticipantMask`로 거른다 —
 * 뒤에서 구경만 한 도롱마담은 그대로다
 */
function dressBurmy(party: readonly PokemonInstance[]): PokemonInstance[] {
  const cloak = burmyCloak(battleTerrain)
  return party.map((mon, i) => (
    mon.species === SPECIES_BURMY && !mon.isEgg
      && participants.has(partyKey(i)) && mon.form !== cloak
      ? { ...mon, form: cloak }
      : mon
  ))
}

/** 나온 적이 있어야 경험치를 나눠 가진다 */
function trackParticipants(events: readonly BattleEvent[]): void {
  for (const e of events) {
    if (e.kind === 'switch' && e.actor.side === 'p1') participants.add(e.actor.name)
  }
}

/**
 * 무대에 선 것과 쓰러진 것을 도감에 적는다 (`BattleSystem_DexFlagSeen`).
 *
 * ⚠️ **여기서 안 적으면 도감이 배틀을 통째로 못 본다.** 지금까지 「본 적 있다」는
 * 스크립트(`SetSpeciesSeen`)와 부화·진화에서만 섰다 — 풀숲에서 백 마리를
 * 만나도 도감은 비어 있었다.
 *
 * 원작이 거르는 조건 둘을 그대로 옮긴다:
 *   · **상대 쪽만** 본 것으로 친다. 내 포켓몬은 이미 내 것이다
 *   · 통신·프론티어는 안 적는다 (우리는 아직 그 판이 없다)
 *
 * 「쓰러뜨려 봤다」(`battled`)는 원작에 없는 칸이다 — BDSP의 상성 표시가 본다.
 */
function trackDex(events: readonly BattleEvent[], roster: Record<string, RosterEntry>): void {
  const save = useSaveStore.getState()
  for (const e of events) {
    if (e.kind === 'switch') {
      const at = roster[e.actor.name]
      if (!at) continue
      if (at.side === 'p2') save.markSeen(at.species)
      // ⚠️ **내 도롱충이는 「잡았다」로 적힌다** — 원작이 `Pokedex_Capture`를
      // 부른다. 배틀이 끝나면서 옷감이 바뀌므로(§3.4) 그 모습을 도감에
      // 남겨야 하기 때문이다
      else if (at.species === SPECIES_BURMY) save.markCaught(at.species)
    } else if (e.kind === 'faint') {
      const at = roster[e.actor.name]
      if (at?.side === 'p2') save.markBattled(at.species)
    }
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
    const reward = applyReward(mon, table.of(mon), gain, foeSpecies.ev)
    // 레벨업 기술은 **여기서 실제로 넣는다.** 배틀이 끝난 뒤로 미루면 다음
    // 상대를 새 기술 없이 맞이한다 — 원작은 오른 그 자리에서 배운다
    const taught = learnMoves(reward.mon, reward.levelUps.flatMap((l) => l.moves), ppOf)
    party[index] = taught.mon
    if (reward.levelUps.length > 0) leveledUp.add(index)
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
  doubles = false,
): Promise<void> {
  if (get().phase !== 'off') return
  set({
    phase: 'loading', kind, foeName, prize,
    view: null, truth: null, actions: [], party: [], canSpendTurn: false,
    doubles: false, atSlot: 0, pending: [],
    events: [], roster: {}, outcome: null, error: null, shiftAsk: null,
  })

  try {
    // ⚠️ **표를 먼저 채운다.** sim의 데이터 폴더는 빌드에서 빠져 있고 종족값·
    // 위력은 사용자의 롬에서 온다 (`dex/provider.ts`). sim이 표를 한 번 읽으면
    // 그 결과를 캐시하므로, 비어 있는 채로 그 순간이 지나가면 그 뒤로 아무리
    // 채워도 종족을 하나도 모르는 심판이 된다
    const { primeBattleDex } = await import('../engine/battle/dex/provider')
    await primeBattleDex()
    const [{ BattleController }, species, moves, bank] = await Promise.all([
      import('../engine/battle/sim/controller'),
      loadSpecies(),
      loadMoves(),
      loadItems(),
    ])
    const pp = (id: number) => moves.byId.get(id)?.pp ?? 5
    // ⚠️ **밟고 선 칸도 본다.** 원작 `CalcTerrain`이 그렇다 — 무대 고르기와
    // 같은 잣대이고(`arenaFor`), 도롱마담 옷감이 이 값에서 나온다
    const here = world.grid?.behaviorAtWorld(
      worldState.player.position.x, worldState.player.position.z,
    ) ?? null
    battleTerrain = terrainOf(here, mapById(world.mapId)?.battleBg ?? -1)
    speciesTable = species
    itemTable = bank
    ppOf = pp
    participants = new Set()
    roamerMet = null

    const party = ensureParty(species, pp)
    const roster: Record<string, RosterEntry> = {}
    const team = party.map((mon, i) => {
      roster[partyKey(i)] = {
        side: 'p1', species: mon.species, form: mon.form, nickname: mon.nickname, level: mon.level,
      }
      return ready(mon, species.of(mon), partyKey(i))
    })
    // ⚠️ **쓰러진 마리를 앞세우고 배틀을 열 수 없다.** 원작도 첫 번째
    // **의식이 있는** 마리를 내보낸다 (`BATTLECTX_SELECTED_PARTY_SLOT`).
    // sim은 팀의 0번을 그냥 세우므로 여기서 앞으로 당긴다 — 키가 같이
    // 따라가고 세이브 순서는 안 바뀐다 (`applyResults`가 키로 짝짓는다)
    const awake = team.findIndex((m) => m.mon.hp > 0)
    if (awake > 0) team.unshift(...team.splice(awake, 1))

    const foe = buildFoe({ species, pp })
    foe.team.forEach((m, i) => {
      roster[foeKey(i)] = {
        side: 'p2', species: m.mon.species, form: m.mon.form, nickname: null, level: m.mon.level,
      }
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
      ...(rules?.roamer === true ? { roamer: true } : {}),
      ...(items ? { items } : {}),
      ...(doubles ? { doubles: true } : {}),
      // 시합규칙 「교체」는 트레이너전에만 뜻이 있다 — 야생은 다음 마리가 없다.
      // ⚠️ 더블에는 안 걸린다. 원작의 그 설정은 1대1 전용이다
      ...(kind === 'trainer' && !doubles && useOptionsStore.getState().battleRule === 0
        ? { shift: true } : {}),
    })
    current = controller
    // 첫 등판도 참가자다. 여기서 안 담으면 첫 상대를 쓰러뜨려도 경험치가 안 간다
    // ⚠️ **배회의 첫 체력만 화면 쪽에서 고쳐 준다** (PARITY §6.3).
    //
    // sim 안의 값은 이미 맞다 (`syncVitals`). 그런데 등장 줄(`|switch|`)은
    // 상대가 자리에 들어서는 **그 순간** 만들어져서 우리가 값을 맞추기
    // 한 걸음 앞서 나간다 — 고치지 않으면 첫 타를 맞을 때까지 게이지만
    // 만피로 거짓말을 한다
    const met = roamerMet
    const events = met === null ? step.events
      : step.events.map((e) => (
        e.kind === 'switch' && e.actor.side === 'p2'
          ? { ...e, condition: { ...e.condition, ...foeVitals(met, e.condition.maxHp) } }
          : e
      ))
    trackParticipants(events)
    trackDex(events, roster)
    set({
      phase: 'running',
      truth: events === step.events ? step.view : applyEvents(emptyView(doubles), events),
      // 빈 무대에서 시작한다. 등판도 재생기가 한 박자씩 올린다
      view: emptyView(doubles),
      events,
      doubles,
      ...turnState(controller),
      roster,
      shiftAsk: controller.shiftAsk,
    })
  } catch (e) {
    // ⚠️ **삼키지 않는다.** `phase: 'off'`로 돌아가면 배틀 화면이 곧바로 사라져서
    // 밖에서는 "잠깐 깜빡이고 필드로 돌아왔다"로만 보인다 — 실제로 그 상태로
    // 야생도 트레이너도 안 열리는 것을 사람이 눈으로 먼저 찾아냈고, 로그에도
    // 화면에도 이유가 한 줄도 없었다. 이유는 반드시 어딘가에 남는다
    console.error('배틀을 못 열었다', e)
    set({ phase: 'off', error: e instanceof Error ? e.message : String(e) })
  }
}

// ⚠️ **배틀 화면 마운트 스위치를 여기서 민다** (`sessionStore.battleScreen`).
//
// 전환 자리마다 손으로 켜고 끄면 언젠가 하나를 빠뜨리고, 그러면 배틀이 안 뜨거나
// 끝나고도 안 사라진다. `phase` 하나가 임자이므로 그것을 구독해서 따라가게 둔다.
// 이 모듈은 필드가 불러올 때 처음 들어오고, 배틀은 필드에서만 시작한다
useBattleStore.subscribe((now, before) => {
  const on = now.phase !== 'off'
  if (on !== (before.phase !== 'off')) {
    useSessionStore.getState().setBattleScreen(on)
    // 어느 갈래의 배틀인지도 문서에 적어 둔다 — 읽기 전용이고 `data-scene`과
    // 같은 자리다 (`app/sceneMark.ts`). `data-scene="battle"`만으로는 야생과
    // 트레이너를 밖에서 못 가른다
    markBattle(on ? now.kind : null)
  }
})
