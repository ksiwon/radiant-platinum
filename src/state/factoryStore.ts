// 배틀팩토리 한 도전의 모델 (PARITY §9.3)
//
// 규칙은 `engine/frontier`에, 차례는 `engine/frontier/factoryScene`에 있다. 여기는 **지금 판의 값**과
// 장면이 여는 두 화면(빌리기 · 바꾸기)과 배틀을 든다:
//
//   open → (rental) → fight → won → (trade) → fight … → finishRound | endChallenge | suspend
//
// ⚠️ **한 도전이 곧 한 라운드다** (`engine/frontier/challenge`). 이어 가는 연승은 리포트의 표식이 기억한다
import { create } from 'zustand'
import {
  loadDialogueBank, loadFrontier, loadLabels, loadMoveNames, loadMoves, loadSpecies, loadSpeciesNames,
  loadTrainerClasses,
} from '../data/gameData'
import type { FrontierData } from '../data/schema'
import { fillPp, statsOf, type PokemonInstance } from '../engine/pokemon/instance'
import { createFactoryMon } from '../engine/frontier/factoryMon'
import {
  applySwap, chooseParty, currentTrainer, openRound, resumeRound, roundReward, skipSwap, winBattle,
  type FactoryRound,
} from '../engine/frontier/challenge'
import { ChallengeType, commonType, factoryLevel, type DrawnSet } from '../engine/frontier/factory'
import { TRAINER_THORTON_GOLD, TRAINER_THORTON_SILVER } from '../engine/frontier/factoryTables'
import type { OpponentInfo } from '../engine/frontier/factoryScene'
import {
  beginChallenge, clearSuspended, dropStreak, factorySlot, finishChallenge, suspendChallenge,
} from '../engine/frontier/records'
import { addBattlePoints } from '../engine/bag/frontierMart'
import { gameLocale } from './optionsStore'
import { useSaveStore } from './saveStore'
import { useBattleStore } from './battleStore'
import { useMenuStore } from './menuStore'

/** `TEXT_BANK_FRONTIER_TRAINER_NAMES` — 미국 롬 번호다 (`data/uiText`와 같은 약속) */
const BANK_FRONTIER_NAMES = 21
/** `TEXT_BANK_BATTLE_FACTORY_OT_NAME` — 한 줄뿐이다("?????") */
const BANK_FACTORY_OT = 363
/** `TEXT_BANK_BATTLE_FACTORY_APP` — 빌리기 · 바꾸기 화면의 글 */
const BANK_FACTORY_APP = 364
/** `TEXT_BANK_BATTLE_FACTORY_SCENE` — 복도와 배틀룸의 글 */
const BANK_FACTORY_SCENE = 365
/**
 * `TEXT_BANK_FRONTIER_TRAINER_MESSAGES` — 트레이너마다 세 줄: 인사 · 이긴 말 · 진 말.
 * 인사는 `BattleFrontier_GetTrainer`가 `번호 × 3`을, 배틀은 `+ 1`(`TRMSG_WIN`) · `+ 2`를 읽는다 (`battle_system.c`)
 */
const BANK_FRONTIER_MESSAGES = 614

/**
 * 시설장의 AI (`BattleFactory_GetAIMask`).
 *
 * ⚠️ **라운드가 낮으면 상대가 일부러 약하게 둔다.** 라운드 0·1은 AI가 아예
 * 없고, 2·3은 기본만이다 — 안 옮기면 첫 도전부터 최상급 AI와 붙는다
 */
const AI_NONE = 0
const AI_BASIC = 1
const AI_FULL = 1 | 2 | 4

function aiMaskFor(round: number, trainer: number): number {
  if (trainer === TRAINER_THORTON_SILVER || trainer === TRAINER_THORTON_GOLD) return AI_FULL
  if (round <= 1) return AI_NONE
  if (round <= 3) return AI_BASIC
  return AI_FULL
}

/** 라운드 번호의 상한 (`unk_0E` — `ov104_02234480`이 8에서 멈춘다) */
const ROUND_CAP = 8

type FactoryPhase = 'off' | 'loading' | 'scene' | 'rental' | 'trade' | 'battle'

interface Tables {
  frontier: FrontierData
  species: Awaited<ReturnType<typeof loadSpecies>>
  moves: Awaited<ReturnType<typeof loadMoves>>
  names: readonly string[]
  moveNames: readonly string[]
  typeNames: readonly string[]
  trainerNames: readonly string[]
  trainerClasses: readonly string[]
  trainerLines: readonly string[]
  otName: string
  /** 화면 글 (뱅크 364) */
  app: readonly string[]
  /** 장면 글 (뱅크 365) */
  scene: readonly string[]
}

let tables: Tables | null = null
let tablesLocale: string | null = null

async function ensureTables(): Promise<Tables> {
  const locale = gameLocale()
  if (tables && tablesLocale === locale) return tables
  const [
    frontier, species, moves, names, moveNames, labels, trainerNames, trainerClasses, trainerLines, ot, app, scene,
  ] = await Promise.all([
    loadFrontier(),
    loadSpecies(),
    loadMoves(),
    loadSpeciesNames(locale),
    loadMoveNames(locale),
    loadLabels(locale),
    loadDialogueBank(locale, BANK_FRONTIER_NAMES),
    loadTrainerClasses(locale),
    loadDialogueBank(locale, BANK_FRONTIER_MESSAGES),
    loadDialogueBank(locale, BANK_FACTORY_OT),
    loadDialogueBank(locale, BANK_FACTORY_APP),
    loadDialogueBank(locale, BANK_FACTORY_SCENE),
  ])
  tables = {
    frontier, species, moves, names, moveNames, typeNames: labels.types, trainerNames, trainerClasses, trainerLines,
    otName: ot[0] ?? '', app, scene,
  }
  tablesLocale = locale
  return tables
}

/** 불러 둔 표 — 장면이 글을 채울 때 쓴다. 도전이 열린 뒤에만 있다 */
export function factoryTables(): Tables | null {
  return tables
}

function setShape(t: Tables): (id: number) => { species: number, item?: number } {
  return (id) => {
    const s = t.frontier.sets[id]
    if (!s) throw new Error(`형 ${String(id)}가 없다`)
    return s.item === undefined ? { species: s.species } : { species: s.species, item: s.item }
  }
}

/** 뽑힌 형 하나를 실제 개체로. 체력과 PP까지 채워 내보낸다 */
function build(t: Tables, drawn: DrawnSet, level: number, rng: () => number): PokemonInstance {
  const set = t.frontier.sets[drawn.set]
  if (!set) throw new Error(`형 ${String(drawn.set)}가 없다`)
  const species = t.species.get(set.species)
  const mon = createFactoryMon({
    set,
    species,
    level,
    ivs: drawn.ivs,
    rng,
    maxPp: (move) => t.moves.byId.get(move)?.pp ?? 5,
    speciesName: t.names[set.species] ?? '',
    otName: t.otName,
  })
  const filled = fillPp(mon, (move) => t.moves.byId.get(move)?.pp ?? 5)
  return { ...filled, hp: statsOf(filled, species).hp }
}

/** 장면이 기다리는 화면 하나. 끝나면 푼다 */
let waiting: { resolve: (won: boolean) => void } | null = null

function wait(): Promise<boolean> {
  return new Promise((resolve) => { waiting = { resolve } })
}

function wake(won = true): void {
  const w = waiting
  waiting = null
  w?.resolve(won)
}

interface FactoryState {
  phase: FactoryPhase
  round: FactoryRound | null
  /** 빌린 여섯 */
  rentals: PokemonInstance[]
  /** 고른 셋. 원작이 판 앞에서 통째로 회복시키므로 늘 만피다 */
  party: PokemonInstance[]
  opponents: PokemonInstance[]
  /** 방금 이긴 셋. 바꾸기에서 여기서 하나를 받는다 */
  swapPool: PokemonInstance[]
  /** 방금 바꾼 두 마리 — 바꾸기 화면이 「교환했습니다」를 띄운다. 없으면 null */
  traded: { given: PokemonInstance, taken: PokemonInstance } | null
  error: string | null

  /** 도전을 연다. `resume`이면 「쉰다」로 접어 둔 판을 편다 */
  open: (challenge: ChallengeType, openLevel: boolean, resume: boolean) => Promise<boolean>
  /** 빌리기 화면을 열고 셋을 고를 때까지 기다린다 (`OpenBattleFactoryAppInitial`) */
  rental: () => Promise<void>
  /** 빌린 여섯에서 고른 자리로 파티를 짠다 */
  choose: (picks: readonly number[]) => void
  /** 바꾸기 화면을 열고 끝날 때까지 기다린다 (`OpenBattleFactoryAppForTrade`) */
  trade: () => Promise<void>
  /** 내 한 마리를 방금 이긴 상대의 한 마리와 바꾼다 */
  swap: (mySlot: number, theirSlot: number) => void
  /** 바꾸기를 닫는다 — 바꿨든 안 바꿨든 */
  endTrade: () => void
  fight: () => Promise<boolean>
  won: () => void
  finishRound: () => number
  endChallenge: () => void
  suspend: () => void
  close: () => void

  opponentInfo: () => OpponentInfo
  partyNames: () => readonly string[]
  /** 이번 판 상대 트레이너의 번호 */
  trainer: () => number
  /** 이번 판 상대의 트레이너 분류 (`FrontierTrainerBase.trainerType`) — 장면이 그 그림을 세운다 */
  trainerClass: () => number
  /** 그 트레이너의 인사 (뱅크 614의 `번호 × 3`) */
  trainerIntro: (trainer: number) => string
  /** 라운드 번호 (`unk_0E`) */
  roundNumber: () => number
}

const OFF = {
  phase: 'off' as FactoryPhase,
  round: null,
  rentals: [],
  party: [],
  opponents: [],
  swapPool: [],
  traded: null,
  error: null,
}

function slotOf(round: FactoryRound): number {
  return factorySlot(round.openLevel, round.challenge)
}

export const useFactoryStore = create<FactoryState>((set, get) => ({
  ...OFF,

  open: async (challenge, openLevel, resume) => {
    set({ ...OFF, phase: 'loading' })
    try {
      const t = await ensureTables()
      const save = useSaveStore.getState()
      const level = factoryLevel(openLevel)
      const rng = Math.random
      const setOf = setShape(t)
      const paused = save.factory.suspended
      if (resume && paused !== null) {
        const slot = factorySlot(paused.openLevel, paused.challenge)
        const record = save.factory.records[slot]
        const round = resumeRound({
          challenge: paused.challenge,
          openLevel: paused.openLevel,
          streak: record?.streak ?? 0,
          tradeCount: record?.trades ?? 0,
          battle: paused.battle,
          trainers: paused.trainers,
          party: paused.partySets,
          defeated: paused.defeatedSets,
          rng,
          setOf,
        })
        useSaveStore.setState({ factory: clearSuspended(save.factory) })
        set({
          phase: 'scene',
          round,
          party: paused.party.map((m) => ({ ...m })),
          swapPool: paused.defeated.map((m) => ({ ...m })),
          opponents: round.opponents.map((d) => build(t, d, factoryLevel(paused.openLevel), rng)),
        })
        return true
      }
      // 새 도전은 접어 둔 판을 버린다 — 원작도 `BattleFactorySave_Init`으로 지운다
      const records = clearSuspended(save.factory)
      const { streak, trades } = beginChallenge(records, factorySlot(openLevel, challenge))
      const round = openRound({ challenge, openLevel, streak, tradeCount: trades, rng, setOf })
      useSaveStore.setState({ factory: records })
      set({
        phase: 'scene',
        round,
        rentals: round.rentals.map((d) => build(t, d, level, rng)),
        opponents: round.opponents.map((d) => build(t, d, level, rng)),
      })
      return true
    } catch (e: unknown) {
      set({ ...OFF, error: e instanceof Error ? e.message : String(e) })
      return false
    }
  },

  rental: () => {
    set({ phase: 'rental' })
    useMenuStore.getState().open('factory')
    return wait().then(() => undefined)
  },

  choose: (picks) => {
    const { round, rentals, phase } = get()
    if (!round || phase !== 'rental') return
    set({ phase: 'scene', round: chooseParty(round, picks), party: picks.map((i) => rentals[i]!) })
    backOut()
    wake()
  },

  trade: () => {
    set({ phase: 'trade', traded: null })
    useMenuStore.getState().open('factory')
    return wait().then(() => undefined)
  },

  swap: (mySlot, theirSlot) => {
    const state = get()
    const { round } = state
    if (!round || state.phase !== 'trade') return
    const taken = state.swapPool[theirSlot]
    const given = state.party[mySlot]
    if (!taken || !given) return
    const party = [...state.party]
    party[mySlot] = taken
    set({ round: applySwap(round, mySlot, theirSlot), party, swapPool: [], traded: { given, taken } })
  },

  endTrade: () => {
    const { round, phase, traded } = get()
    if (!round || phase !== 'trade') return
    set({ phase: 'scene', round: traded === null ? skipSwap(round) : round, swapPool: [], traded: null })
    backOut()
    wake()
  },

  fight: async () => {
    const state = get()
    const { round } = state
    const t = tables
    if (!round || !t) return false
    set({ phase: 'battle' })
    const id = currentTrainer(round)
    const base = t.frontier.trainers[id]
    const cls = t.trainerClasses[base?.type ?? 0] ?? ''
    const name = t.trainerNames[id] ?? ''
    const line = (at: number): string | null => {
      const text = t.trainerLines[id * 3 + at]
      return text === undefined || text.trim() === '' ? null : text.replace(/\s+$/, '')
    }
    const done = wait()
    // ⚠️ **결과는 배틀이 닫히기 **전에** 잡아야 한다** — `close()`가 `outcome`을
    // 지우기 때문이다. 필드 스크립트가 트레이너전을 지켜보는 수법과 같다
    const stop = useBattleStore.subscribe((now, before) => {
      if (now.phase !== 'off' || before.phase === 'off') return
      stop()
      set({ phase: 'scene' })
      wake(before.outcome === 'win')
    })
    await useBattleStore.getState().startFactory({
      team: state.party,
      foe: state.opponents,
      label: [cls, name].filter(Boolean).join(' '),
      cls,
      name,
      ai: aiMaskFor(round.round, id),
      doubles: round.challenge === ChallengeType.DOUBLE,
      defeat: line(2),
      victory: line(1),
    })
    return done
  },

  won: () => {
    const state = get()
    const { round } = state
    const t = tables
    if (!round || !t) return
    const rng = Math.random
    const next = winBattle(round, rng, setShape(t))
    const level = factoryLevel(round.openLevel)
    set({
      round: next,
      swapPool: state.opponents,
      opponents: next.opponents.map((d) => build(t, d, level, rng)),
    })
  },

  finishRound: () => {
    const { round } = get()
    if (!round) return 0
    const save = useSaveStore.getState()
    useSaveStore.setState({
      factory: finishChallenge(save.factory, slotOf(round), round.streak, round.tradeCount, true),
    })
    return roundReward(round)
  },

  endChallenge: () => {
    const { round } = get()
    if (!round) return
    const save = useSaveStore.getState()
    useSaveStore.setState({
      factory: finishChallenge(save.factory, slotOf(round), round.streak, round.tradeCount, false),
    })
  },

  suspend: () => {
    const { round, party, swapPool } = get()
    if (!round) return
    const save = useSaveStore.getState()
    useSaveStore.setState({
      factory: suspendChallenge(save.factory, slotOf(round), round.streak, round.tradeCount, {
        challenge: round.challenge,
        openLevel: round.openLevel,
        battle: round.battle,
        trainers: round.trainers,
        party: party.map((m) => ({ ...m })),
        partySets: round.party,
        defeated: swapPool.map((m) => ({ ...m })),
        defeatedSets: round.swapPool,
      }),
    })
  },

  close: () => {
    set({ ...OFF })
    backOut()
    wake(false)
  },

  opponentInfo: () => {
    const t = tables
    const { opponents } = get()
    if (!t) return { species: [], firstMove: '', commonType: null }
    const common = commonType(opponents.map((m) => {
      const sp = t.species.get(m.species)
      return [sp.types[0], sp.types[1]] as const
    }))
    return {
      species: opponents.slice(0, 3).map((m) => t.names[m.species] ?? ''),
      firstMove: t.moveNames[opponents[0]?.moves[0]?.move ?? 0] ?? '',
      commonType: common === null ? null : t.typeNames[common] ?? null,
    }
  },

  partyNames: () => {
    const t = tables
    return t ? get().party.map((m) => t.names[m.species] ?? '') : []
  },

  trainer: () => {
    const { round } = get()
    return round ? currentTrainer(round) : 0
  },
  trainerClass: () => {
    const { round } = get()
    if (!round || !tables) return 0
    return tables.frontier.trainers[currentTrainer(round)]?.type ?? 0
  },

  trainerIntro: (trainer) => tables?.trainerLines[trainer * 3] ?? '',

  roundNumber: () => Math.min(get().round?.round ?? 0, ROUND_CAP),
}))

/** 빌리기 · 바꾸기 화면을 내린다 */
function backOut(): void {
  const menu = useMenuStore.getState()
  if (menu.stack.includes('factory')) menu.back()
}

/** `ScrCmd_2C5` — 저장 안 하고 끈 도전의 연승을 끊는다 */
export function dropFactoryStreak(type: number, level: number): void {
  if (type !== 0 && type !== 1) return
  const save = useSaveStore.getState()
  const slot = factorySlot(level === 1, type === 1 ? ChallengeType.DOUBLE : ChallengeType.SINGLE)
  useSaveStore.setState({ factory: dropStreak(save.factory, slot) })
}

/** 받은 BP를 더한다 (`GiveBattlePoints`) */
export function giveFactoryBattlePoints(bp: number): void {
  const save = useSaveStore.getState()
  useSaveStore.setState({ battlePoints: addBattlePoints(save.battlePoints, bp) })
}
