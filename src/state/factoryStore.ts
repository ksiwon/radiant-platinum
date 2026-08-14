// 배틀팩토리 한 도전을 굴린다 (PARITY §9.3)
//
// 규칙은 `engine/frontier`에 있고 여기는 **차례**만 든다:
//
//   빌린 여섯 → 셋 고르기 → 상대 보기 → 배틀 → (이기면) 바꾸기 → … 일곱 판
//   → 라운드 끝 → BP · 기록 · 인쇄
//
// ⚠️ **한 도전이 곧 한 라운드다** (`engine/frontier/challenge`). 이어 가는
// 연승은 리포트의 표식이 기억한다
import { create } from 'zustand'
import {
  loadDialogueBank, loadFrontier, loadMoves, loadSpecies, loadSpeciesNames, loadTrainerClasses,
} from '../data/gameData'
import type { FrontierData } from '../data/schema'
import { fillPp, statsOf, type PokemonInstance } from '../engine/pokemon/instance'
import { createFactoryMon } from '../engine/frontier/factoryMon'
import {
  applySwap, chooseParty, currentTrainer, isRoundDone, openRound, roundReward, skipSwap, winBattle,
  type FactoryRound,
} from '../engine/frontier/challenge'
import {
  ChallengeType, commonType, factoryLevel, playerPartySize, printAtNext, type DrawnSet,
} from '../engine/frontier/factory'
import { TRAINER_THORTON_GOLD, TRAINER_THORTON_SILVER } from '../engine/frontier/factoryTables'
import { addBattlePoints } from '../engine/bag/frontierMart'
import { awardPrint, beginChallenge, factorySlot, finishChallenge } from '../engine/frontier/records'
import { addTrainerScore, SCORE_BATTLE_FACTORY_ROUND } from '../engine/world/gameRecords'
import { gameLocale } from './optionsStore'
import { useSaveStore } from './saveStore'
import { useBattleStore } from './battleStore'
import { useMenuStore } from './menuStore'

/** `TEXT_BANK_FRONTIER_TRAINER_NAMES` — 미국 롬 번호다 (`data/uiText`와 같은 약속) */
const BANK_FRONTIER_NAMES = 21
/** `TEXT_BANK_BATTLE_FACTORY_OT_NAME` — 한 줄뿐이다("?????") */
const BANK_FACTORY_OT = 363

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

export type FactoryPhase = 'off' | 'loading' | 'rental' | 'preview' | 'battle' | 'swap' | 'result'

interface Tables {
  frontier: FrontierData
  species: Awaited<ReturnType<typeof loadSpecies>>
  moves: Awaited<ReturnType<typeof loadMoves>>
  names: readonly string[]
  trainerNames: readonly string[]
  trainerClasses: readonly string[]
  otName: string
}

let tables: Tables | null = null

async function ensureTables(): Promise<Tables> {
  if (tables) return tables
  const locale = gameLocale()
  const [frontier, species, moves, names, trainerNames, trainerClasses, ot] = await Promise.all([
    loadFrontier(),
    loadSpecies(),
    loadMoves(),
    loadSpeciesNames(locale),
    loadDialogueBank(locale, BANK_FRONTIER_NAMES),
    loadTrainerClasses(locale),
    loadDialogueBank(locale, BANK_FACTORY_OT),
  ])
  tables = { frontier, species, moves, names, trainerNames, trainerClasses, otName: ot[0] ?? '' }
  return tables
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

interface FactoryState {
  phase: FactoryPhase
  round: FactoryRound | null
  /** 빌린 여섯 */
  rentals: PokemonInstance[]
  /** 고른 셋. 원작이 판 앞에서 통째로 회복시키므로 늘 만피다 */
  party: PokemonInstance[]
  opponents: PokemonInstance[]
  swapPool: PokemonInstance[]
  /** 고르는 중인 자리 */
  picks: number[]
  /** 이번 판 상대의 이름표 */
  foeLabel: string
  /** 상대 파티에 제일 많은 타입. 없으면 null */
  foeHint: number | null
  /** 라운드가 끝난 뒤 받은 BP */
  reward: number
  /** 이번 도전에서 받은 인쇄 — 0 없음 · 1 은 · 2 금 */
  print: number
  outcome: 'win' | 'loss' | null
  error: string | null

  begin: (challenge: ChallengeType, openLevel: boolean) => Promise<void>
  togglePick: (at: number) => void
  confirmPicks: () => void
  startBattle: () => Promise<void>
  /** 배틀이 끝났다. 이겼으면 다음으로, 졌으면 도전이 끝난다 */
  settle: (won: boolean) => void
  swap: (mySlot: number, theirSlot: number) => void
  skip: () => void
  close: () => void
}

const OFF = {
  phase: 'off' as FactoryPhase,
  round: null,
  rentals: [],
  party: [],
  opponents: [],
  swapPool: [],
  picks: [],
  foeLabel: '',
  foeHint: null,
  reward: 0,
  print: 0,
  outcome: null,
  error: null,
}

export const useFactoryStore = create<FactoryState>((set, get) => ({
  ...OFF,

  begin: async (challenge, openLevel) => {
    set({ ...OFF, phase: 'loading' })
    try {
      const t = await ensureTables()
      const save = useSaveStore.getState()
      const slot = factorySlot(openLevel, challenge)
      const { streak, trades } = beginChallenge(save.factory, slot)
      const rng = Math.random
      const round = openRound({
        challenge, openLevel, streak, tradeCount: trades, rng,
        setOf: (id) => {
          const s = t.frontier.sets[id]
          if (!s) throw new Error(`형 ${String(id)}가 없다`)
          return s.item === undefined ? { species: s.species } : { species: s.species, item: s.item }
        },
      })
      const level = factoryLevel(openLevel)
      useMenuStore.getState().open('factory')
      set({
        phase: 'rental',
        round,
        rentals: round.rentals.map((d) => build(t, d, level, rng)),
        opponents: round.opponents.map((d) => build(t, d, level, rng)),
      })
    } catch (e: unknown) {
      set({ phase: 'off', error: e instanceof Error ? e.message : String(e) })
    }
  },

  togglePick: (at) => {
    const { round, picks } = get()
    if (!round) return
    const want = playerPartySize(round.challenge)
    if (picks.includes(at)) set({ picks: picks.filter((i) => i !== at) })
    else if (picks.length < want) set({ picks: [...picks, at] })
  },

  confirmPicks: () => {
    const { round, picks, rentals } = get()
    if (!round || picks.length !== playerPartySize(round.challenge)) return
    set({
      phase: 'preview',
      round: chooseParty(round, picks),
      party: picks.map((i) => rentals[i]!),
      ...foeView(get(), round),
    })
  },

  startBattle: async () => {
    const state = get()
    const { round } = state
    if (!round || state.phase !== 'preview') return
    set({ phase: 'battle' })
    // ⚠️ **결과는 배틀이 닫히기 **전에** 잡아야 한다** — `close()`가 `outcome`을
    // 지우기 때문이다. 필드 스크립트가 트레이너전을 지켜보는 수법과 같다
    const stop = useBattleStore.subscribe((now, before) => {
      if (now.phase !== 'off' || before.phase === 'off') return
      stop()
      get().settle(before.outcome === 'win')
    })
    await useBattleStore.getState().startFactory({
      team: state.party,
      foe: state.opponents,
      label: state.foeLabel,
      ai: aiMaskFor(round.round, currentTrainer(round)),
      doubles: round.challenge === ChallengeType.DOUBLE,
    })
  },

  settle: (won) => {
    const state = get()
    const { round } = state
    if (!round) return
    const t = tables
    if (!t) return
    const save = useSaveStore.getState()
    const slot = factorySlot(round.openLevel, round.challenge)

    if (!won) {
      // 진다 — 표식이 꺼지므로 다음 도전은 0부터다
      useSaveStore.setState({
        factory: finishChallenge(save.factory, slot, round.streak, round.tradeCount, false),
      })
      set({ phase: 'result', outcome: 'loss', reward: 0 })
      return
    }

    const rng = Math.random
    const next = winBattle(round, rng, (id) => {
      const s = t.frontier.sets[id]
      if (!s) throw new Error(`형 ${String(id)}가 없다`)
      return s.item === undefined ? { species: s.species } : { species: s.species, item: s.item }
    })

    if (isRoundDone(next)) {
      const reward = roundReward(next)
      const print = printAtNext(round.challenge, round.streak) === 0
        ? 0
        : next.streak === 21 ? 1 : next.streak === 49 ? 2 : 0
      let records = finishChallenge(save.factory, slot, next.streak, next.tradeCount, true)
      if (print === 1 || print === 2) records = awardPrint(records, print)
      useSaveStore.setState({
        factory: records,
        battlePoints: addBattlePoints(save.battlePoints, reward),
        // 라운드 하나가 트레이너 스코어 7이다 (PARITY §7.5) — 원작도 로비
        // 스크립트가 `IncrementTrainerScore`로 올린다
        records: addTrainerScore(save.records, SCORE_BATTLE_FACTORY_ROUND),
      })
      set({ phase: 'result', outcome: 'win', reward, print, round: next })
      return
    }

    const level = factoryLevel(round.openLevel)
    set({
      phase: 'swap',
      round: next,
      swapPool: state.opponents,
      opponents: next.opponents.map((d) => build(t, d, level, rng)),
    })
  },

  swap: (mySlot, theirSlot) => {
    const state = get()
    const { round } = state
    if (!round || state.phase !== 'swap') return
    const taken = state.swapPool[theirSlot]
    if (!taken) return
    const party = [...state.party]
    party[mySlot] = taken
    set({
      phase: 'preview',
      round: applySwap(round, mySlot, theirSlot),
      party,
      swapPool: [],
      ...foeView({ ...state, party }, round),
    })
  },

  skip: () => {
    const state = get()
    const { round } = state
    if (!round || state.phase !== 'swap') return
    set({ phase: 'preview', round: skipSwap(round), swapPool: [], ...foeView(state, round) })
  },

  close: () => {
    set({ ...OFF })
    // 시설을 나가면 로비 스크립트가 이어서 돈다 (`LaunchBattleFrontierScene`이
    // `busy()`가 거짓이 될 때까지 서 있다)
    if (useMenuStore.getState().stack.includes('factory')) useMenuStore.getState().back()
  },
}))

/** 다음 상대의 이름표와 타입 귀띔 */
function foeView(state: FactoryState, round: FactoryRound): { foeLabel: string, foeHint: number | null } {
  const t = tables
  if (!t) return { foeLabel: '', foeHint: null }
  const id = currentTrainer(round)
  const base = t.frontier.trainers[id]
  const label = [t.trainerClasses[base?.type ?? 0], t.trainerNames[id]].filter(Boolean).join(' ')
  const hint = commonType(state.opponents.map((m) => {
    const sp = t.species.get(m.species)
    return [sp.types[0], sp.types[1]] as const
  }))
  return { foeLabel: label, foeHint: hint }
}
