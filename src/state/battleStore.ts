// 배틀 세션 상태 (PLAN §3.2 ②) — 저빈도. HP 바 애니메이션 같은 프레임 값은 여기 없다.
//
// **@pkmn/sim은 여기서 처음 로드된다.** 이 파일은 `engine/battle/sim/`을 정적으로
// 가져오지 않는다 — `startWild`가 불릴 때 `await import()`로만 들어온다 (PLAN §7.5.1).
// 위쪽 import에 `type`이 붙어 있는 것은 그래서다. 하나라도 값 import로 바꾸면
// 초기 청크에 715 kB가 실린다.
import { create } from 'zustand'
import {
  loadDialogueBank,
  loadItems,
  loadMoves,
  loadSpecies,
  loadTrainerClasses,
  loadTrainerNames,
  loadTrainers,
  type ItemTable,
  type SpeciesLookup,
  type SpeciesTable,
} from '../data/gameData'
import type { Item, Species, Stats } from '../data/schema'
import {
  allyKey, foe2Key, foeKey, ownerOfKey, partyKey, applyResults,
} from '../engine/battle/aftermath'
import {
  addRecord, addTrainerScore, RECORD_CAUGHT_POKEMON, RECORD_FAINTED_IN_BATTLE,
  RECORD_TRAINER_BATTLES_FOUGHT, RECORD_WILD_BATTLES_FOUGHT,
  SCORE_CAPTURED_NATIONAL_MON, SCORE_CAPTURED_REGIONAL_MON,
  SCORE_WON_TRAINER_BATTLE, SCORE_WON_WILD_BATTLE,
} from '../engine/world/gameRecords'

import type { ItemPlan } from '../engine/battle/meta/bagItem'
import { friendshipGain, isEscapeItem } from '../engine/battle/meta/bagItem'
import { clampFriendship } from '../engine/pokemon/friendship'
import { caughtAt, isOriginalTrainer, metToday, type TrainerIdentity } from '../engine/pokemon/origin'
import { mapById, world } from '../engine/map/world'
import { Terrain, terrainOf, type TerrainId } from '../engine/battle/terrain'
import { frameStats, SPAN } from '../engine/loop/frameStats'
import { burmyCloak, SPECIES_BURMY, SPECIES_UNOWN } from '../engine/pokemon/form'
import type { BattleAction, PartySlot } from '../engine/battle/choice'
import type { BattleEvent, LevelStep, SideId } from '../engine/battle/events'
import type { BallId } from '../engine/battle/meta/capture'
import { Ball } from '../engine/battle/meta/capture'
import {
  applyReward, evYieldOf, expFor, expPool, HOLD_EFFECT_EXP_SHARE, HOLD_EFFECT_EXP_UP, learnMoves,
} from '../engine/battle/meta/reward'
import { afterBattle as pokerusAfterBattle, doublesEvs } from '../engine/pokemon/pokerus'
import { levelProgress } from '../engine/pokemon/exp'
import { badgeCount } from '../engine/battle/meta/obedience'
import { coverScreen, startFade } from '../engine/script/fade'
import { MAX_MONEY, prizeFor } from '../engine/battle/meta/prize'
import type { Trainer } from '../data/schema'
import { trainerMonToInstance } from '../engine/battle/meta/trainerParty'
import { TrainerItems } from '../engine/battle/meta/trainerItems'
import { applyEvents, emptyView, type BattleView } from '../engine/battle/view'
import type { BattleController, BattleFinish, BattleStep } from '../engine/battle/sim/controller'
import type { SideMon, SideSpec } from '../engine/battle/sim/session'
import {
  createWild,
  fillPp,
  genderOf,
  isShiny,
  PARTY_MAX,
  shinyPersonality,
  statsOf,
  type Gender,
  type PokemonInstance,
  type Status,
} from '../engine/pokemon/instance'
import { timeOfDayForHour } from '../engine/map/timeOfDay'
import { journalBeatTrainer, journalWildBattle } from '../scene/journal'
import { poketchGotMon } from '../scene/poketch'
import { store as storeInBox } from '../engine/pokemon/boxes'
import { encounters } from '../engine/battle/encounterSystem'
import {
  safariTurn, type SafariCommand, type SafariOutcome, type SafariState as SafariRun,
} from '../engine/battle/safariBattle'
import { newSafariBattle } from '../engine/world/safari'
import { LeadAbility, leadHas, wildGender, wildNature } from '../engine/battle/encounterLead'
import { gameLocale, useOptionsStore } from './optionsStore'
import { useSessionStore } from './sessionStore'
import { markBattle } from '../app/sceneMark'
import { useEvolutionStore } from './evolutionStore'
import { useMenuStore } from './menuStore'
import { dexSet, playerTrainer, useSaveStore } from './saveStore'
import { chatterActivation, chatterChance, decodeChatotCry } from '../engine/pokemon/chatotCry'
import { worldState } from './worldState'

/** 컨트롤러에 넘길 트레이너 도구 묶음 */
type ControllerItems = NonNullable<Parameters<(typeof BattleController)['start']>[0]['items']>

/** 신오의 첫 파트너. 나로 이벤트가 생기면 이 임시 지급은 사라진다 */
const STARTER = 387 // 모부기
/** 잡는 법 강습의 상대 (`SPECIES_BIDOOF`) */
const SPECIES_BIDOOF = 399

type BattlePhase = 'off' | 'loading' | 'running' | 'over'

/**
 * 야생전인가 트레이너전인가. 규칙이 갈리는 지점이 여럿이다 —
 * 볼·도망은 야생에서만 되고, 경험치는 트레이너전이 1.5배다.
 *
 * ⚠️ **`safari`는 sim이 아예 안 도는 갈래다** (PARITY §2.19). 기술도 체력도
 * 없어서 심판에게 넘길 것이 없고, `engine/battle/safariBattle`이 사건을 직접 낸다
 */
type BattleKind = 'wild' | 'trainer' | 'factory' | 'safari'

/**
 * 상대 쪽에 **트레이너가 서는** 판인가.
 *
 * 배틀팩토리도 트레이너전이다 — 원작의 프런티어 판은 `BATTLE_TYPE_FRONTIER_SINGLES`
 * = `FRONTIER | TRAINER`이고 더블도 `TRAINER_DOUBLES`를 품는다 (`constants/battle.h` 42~43).
 * 화면이 「야생 ○○」·트레이너 몸·첫 줄을 가를 때 이 술어 하나를 본다.
 *
 * ⚠️ **규칙까지 이걸로 가르지 않는다.** 경험치(팩토리는 0)·상금(BP로 셈)·시합규칙
 * 「교체」(`BATTLE_TYPE_FORCED_SET_MODE`에 `FRONTIER`가 들어 있다 — `battle_controller_player.c` 4145)는
 * 팩토리가 트레이너전과 다르게 돈다. 그 자리들은 `kind === 'trainer'`를 그대로 본다
 */
export function hasTrainer(kind: BattleKind): boolean {
  return kind === 'trainer' || kind === 'factory'
}

/**
 * 이 판에만 붙는 규칙 (`FieldBattleDTO.battleStatusMask`).
 *
 * 지금은 하나뿐이다 — 라이벌과의 **첫 배틀**은 급소가 안 난다
 * (`BATTLE_STATUS_FIRST_BATTLE` → `BtlCmd_CalcCrit`)
 */
interface BattleRules {
  noCrit?: boolean
  /** 배회 포켓몬과의 판 (PARITY §6.3). 묶어 두지 않으면 상대가 달아난다 */
  roamer?: boolean
  /** 모든 기술이 맞는다 — 잡는 법 강습 (`sim/session`의 `sureHit`) */
  sureHit?: boolean
  /**
   * 두 번째 상대 트레이너 (PARITY §2.2b · `Encounter_NewVsTrainer`).
   *
   * 첫 상대와 **다른 번호**면 트레이너 둘과의 2vs2다 — 편이 없으면
   * `BATTLE_TYPE_TAG_DOUBLES`, 있으면 `BATTLE_TYPE_TRAINER_WITH_AI_PARTNER`.
   * 같은 번호면 한 사람의 더블(`BATTLE_TYPE_TRAINER_DOUBLES`)이다 (`encounter.c` 728)
   */
  second?: number
  /**
   * 편 트레이너 (`BATTLE_TYPE_AI` · `dto->trainerIDs[BATTLER_PLAYER_2]`).
   *
   * ⚠️ **상대가 둘일 때만 편이 선다.** 원작은 동행 중에 혼자 오는 트레이너와도
   * 싸우는데, 그 판은 `BATTLE_TYPE_TRAINER`(싱글)라 편이 안 나온다 (`encounter.c` 728)
   */
  partner?: number
}

/**
 * 배틀에 선 트레이너 한 사람 (PARITY §2.2b). 롬의 줄들이 분류와 이름을 **두 칸으로**
 * 받으므로 둘을 따로 든다 (`foeClass`·`foeTrainer` 머리말)
 */
export interface TrainerTag {
  id: number
  cls: string | null
  name: string | null
  /** 분류와 이름을 이은 것. 화면 머리말에 쓴다 */
  label: string
  /** 트레이너 분류 번호. 무대의 몸을 고른다 */
  classId: number
}

/**
 * 사파리 판이 화면에 내주는 것 (PARITY §2.19).
 *
 * 칸 둘을 숨기지 않는다 — 미끼를 줬는지 진흙을 던졌는지가 화면에 안 남으면
 * 넷 중 무엇을 고를지 판단할 근거가 사라진다. 원작은 아래 화면에 볼 수만
 * 띄우지만 우리는 한 화면이라 그 자리가 없다
 */
interface SafariHud {
  balls: number
  /** 잡히는 칸 0~12. 6이 한가운데다 */
  catchStage: number
  /** 도망 칸 0~12 */
  escapeStage: number
}

/** 배틀팩토리 한 판의 양쪽 (PARITY §9.3) */
interface FactoryBout {
  /** 빌린 셋. 이미 `fillPp`·`statsOf`까지 끝난 개체여야 한다 */
  readonly team: readonly PokemonInstance[]
  readonly foe: readonly PokemonInstance[]
  /** "배틀걸 미나미" 같은 한 줄. 분류와 이름을 붙인 것이다 */
  readonly label: string
  /** 트레이너 AI 비트 (`BattleFactory_GetAIMask`) */
  readonly ai: number
  readonly doubles: boolean
  /** 롬의 두 칸짜리 줄이 받는 분류와 이름 (`PlayerDefeatedTr`) */
  readonly cls: string
  readonly name: string
  /**
   * 상대의 트레이너 분류 번호 — 프런티어 트레이너 자료의 `type`이다 (`cls`를 그 번호로 찾은 이름).
   *
   * 결과 화면이 이 번호로 상대의 갈래를 읽는다. ⚠️ **이름(`cls`)으로 거꾸로 찾지
   * 않는다** — 에이스트레이너처럼 같은 이름이 남녀·눈 지방으로 여럿이라 엉뚱한 갈래가 읽힌다
   */
  readonly classId?: number
  /** 진 뒤 상대의 말 — 뱅크 614의 `번호 × 3 + 2` (`TRMSG_DEFEAT`) */
  readonly defeat: string | null
  /** 이긴 뒤 상대의 말 — `번호 × 3 + 1` (`TRMSG_WIN`) */
  readonly victory: string | null
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
  /**
   * 들어 있는 볼 (`MON_DATA_POKEBALL`). 내보낼 때 이 볼이 날아가 열린다 (`BattleBallEffects`).
   * 0이나 빈 값이면 몬스터볼이다 — 트레이너 개체는 볼을 따로 안 적는다
   */
  ball?: number
  /**
   * 몸을 고르는 두 값. 무대가 판이 열린 뒤 **뒤에 나올 마리의 몸을 미리 받는** 데 쓴다
   * (`BattleStage`의 `usePrefetchBodies`) — 몸 캐시는 성별·색까지 열쇠로 든다 (`monModel.loadMonModel`)
   */
  gender?: Gender
  shiny?: boolean
  /**
   * 든 기술 번호. 무대가 판이 열리면 **그 기술들의 BDSP 연출 시퀀스를 미리 받는다**
   * (`scene/battle/fx/moveSeq`) — 박자가 기술 길이를 묻는 그 순간에 받고 있으면 늦다
   */
  moves?: number[]
}

interface WildStart {
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
   * 색이 다른 개체로 만들어야 하는가 (PARITY §6.5).
   *
   * 레이더 사슬만 세운다. 다른 조우는 성격값이 알아서 정한다
   */
  shiny?: boolean
  /**
   * 「운명적인 만남」인가 (`MON_DATA_FATEFUL_ENCOUNTER`).
   *
   * 아르세우스·다크라이·쉐이미가 이 표시를 달고 나온다 (`StartFatefulEncounter`).
   * 요약 화면의 트레이너 메모가 갈리고, 쉐이미는 이게 있어야 스카이폼이 된다
   */
  fateful?: boolean
  /**
   * 땅을 부르는 쪽이 정한다 — 밟은 칸과 맵 배경(`CalcTerrain`)을 안 본다.
   *
   * 오리진폼 기라티나 하나뿐이다: `Encounter_NewVsGiratinaOrigin`이 `dto->terrain = TERRAIN_GIRATINA`로
   * 덮는다(`encounter.c` 989). 배경은 그대로 깨어진 세계다 (REPAIR §95)
   */
  terrain?: TerrainId
  /**
   * 배회 포켓몬이면 그 자리 번호 (PARITY §6.3).
   *
   * 개체는 세이브에 있다 — 여기로는 **어느 자리인지**만 온다
   */
  roamer?: number | null
  /**
   * 동행이 붙어 있을 때의 **둘째 야생** (PARITY §2.2b · `BATTLE_TYPE_AI_PARTNER`).
   *
   * 원작은 동행 중에 풀숲에서 만나면 칸을 **두 번** 굴려 둘을 내보낸다
   * (`wild_encounters.c` 730 `TryGenerateGrassEncounter_DoubleBattle`)
   */
  second?: { species: number; level: number; form?: number }
  /**
   * 동행 트레이너 (`VAR_PARTNER_TRAINER_ID`). 둘째 야생과 함께 온다 —
   * 우리 쪽 자리 b에 서고 제 AI로 싸운다 (`wild_encounters.c` 341)
   */
  partner?: number
}

/**
 * 잡는 법 강습의 동료 (`FieldBattleDTO_NewCatchingTutorial`) — 반대 성별 주인공이 제 파트너 Lv5로 선다.
 * 이름은 맞수 이름 뱅크 · 성별은 주인공의 반대다
 */
interface TutorialAlly {
  species: number
  name: string
  gender: 'boy' | 'girl'
}

interface BattleState {
  phase: BattlePhase
  /**
   * **무대가 다 서서 보여 줄 수 있는가.**
   *
   * `phase`가 `'running'`이 되는 것은 **규칙기와 자료**가 다 왔다는 뜻일 뿐이다.
   * 화면에 서는 것 — 무대 모델(`models/arena/*.glb`)과 앞에 나올 두 마리의 몸
   * (`models/pokemon/*.glb`) — 은 그 뒤에 받는다. 실측으로 그 사이가 **3.5초**라
   * (`scene/battle/EncounterBurst` 머리말) 그동안 배틀 곡이 흐르고 빈 무대에
   * 조우 연출이 터지고 나서야 포켓몬이 툭 나타났다.
   *
   * 그래서 기다림을 여기서 한 번 더 잡는다 — 무대가 다 서면
   * (`scene/battle/BattleStage`) 이 깃발이 서고, **그 순간** 막이 걷히고 곡이
   * 나고 재생기가 첫 박자를 푼다
   */
  sceneReady: boolean
  kind: BattleKind
  /** 상대 트레이너 표시 이름("체육관 관장 동관"). 야생이면 null */
  foeName: string | null
  /**
   * 그 이름을 **가른 두 조각**. 야생이면 둘 다 null.
   *
   * ⚠️ **왜 따로 드나.** 롬의 두 줄이 트레이너를 **두 칸으로** 받는다 —
   * 「{분류} {이름}은 {포켓몬}을 내보냈다!」(`TrSentOutPokemon`)와 도구 줄이다.
   * 합쳐 든 `foeName` 하나로는 그 두 칸을 못 채워서, 한동안 그 둘만 손 글이었다.
   * 화면 머리말과 「승부를 걸어왔다!」는 여전히 합친 이름이 맞다 — 롬도 그
   * 자리에서는 분류와 이름을 나란히 찍는다
   */
  foeClass: string | null
  foeTrainer: string | null
  /** Active opponent trainer identity, retained for the 3D battle stage. */
  trainerId: number | null
  trainerClass: number | null
  /**
   * 상대 트레이너 전부 (PARITY §2.2b). 야생이면 비고, 보통은 하나, 태그 배틀이면
   * 둘이다 — 둘째가 자리 b의 주인이다 (`aftermath.ownerOfKey`의 `foe2`)
   */
  foes: TrainerTag[]
  /** 편 (`BATTLE_TYPE_AI`). 우리 쪽 자리 b의 주인이다. 없으면 null */
  partner: TrainerTag | null
  /**
   * 이긴 뒤 상대가 하는 말 (`TRMSG_DEFEAT` · `subscript_battle_won.s`).
   *
   * 트레이너마다 한 줄이고 **차례가 원작 그대로**다 — 태그 배틀은 첫 상대·둘째 상대,
   * 한 사람의 더블은 `TRMSG_DOUBLE_BATTLE_DEFEAT_1`·`_2` 둘이다
   */
  defeatLines: string[]
  /**
   * 배틀팩토리에서 **졌을 때** 상대가 하는 말 (`TRMSG_WIN` = 뱅크 614의 `번호 × 3 + 1`).
   *
   * ⚠️ **프런티어에서 지면 「눈앞이 캄캄해졌다」가 없다** — `subscript_battle_lost.s`의 `_068` 갈래는
   * 상대를 불러내 이 한 줄만 말하게 한다. 다른 판에서는 비어 있다
   */
  foeWinLines: string[]
  /**
   * 재생기가 **지금까지 쓰러뜨려 보인** 마리의 키. 파티 공(`PartyGauge`)이 이걸로
   * 어두워진다 — 정본(`truth`)을 보면 쓰러지는 연출보다 공이 먼저 꺼진다
   */
  downKeys: string[]

  /**
   * 이기면 받을 상금. 야생이면 0.
   *
   * 배틀을 열 때 정해 둔다 — 끝난 뒤에 계산하려면 트레이너 데이터를 다시 받아야 하고,
   * 그 사이에 트레이너 번호를 들고 있어야 한다
   */
  prize: number
  /**
   * 진 판에 잃은 돈 (`BtlCmd_PayPrizeMoney` → `BattleSystem_CalcMoneyPenalty`).
   *
   * 지는 그 순간 리포트에서 빠지고(`moneyPenalty`), 끝 줄이 이 값을 말한다
   * (`ui/battle/bookends`의 `closingLines`). 지지 않았거나 잃을 돈이 없으면 0이다
   */
  penalty: number
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
  /**
   * 이긴 곡 (`SEQ_VICTORY_*`). 박자가 신호를 단 줄에 닿으면 선다(`ui/battle/victoryCue`) — 배틀 곡을 이 곡이 덮는다.
   * 판이 열릴 때 비운다
   */
  victorySong: number | null
  setVictorySong: (song: number) => void
  /**
   * 잡는 법 강습의 동료 (`StartCatchingTutorial`). 있으면 우리 쪽 트레이너는 그 사람이고, 화면은 사람 입력 대신 손이
   * 누르며(`ui/battle/TutorialPilot`), 판이 끝나면 스스로 닫힌다. **리포트는 하나도 안 바뀐다**
   */
  ally: { name: string, gender: 'boy' | 'girl' } | null
  /** 잡는 법 강습 (202번도로) — 비버니 Lv2 하나 · 몬스터볼 스물의 버리는 가방 */
  startTutorial: (ally: TutorialAlly) => Promise<void>
  error: string | null
  startWild: (wild: WildStart) => Promise<void>
  /** 트레이너전을 연다. `trainerId`는 trdata 번호다 */
  startTrainer: (trainerId: number, options?: BattleRules) => Promise<void>
  /**
   * 배틀팩토리의 한 판 (PARITY §9.3).
   *
   * ⚠️ **양쪽 파티를 다 받는다.** 내 쪽이 리포트의 파티가 아니라 **빌린 셋**이라
   * `trdata`에도 세이브에도 기댈 수 없다
   */
  startFactory: (bout: FactoryBout) => Promise<void>
  /**
   * 사파리 판을 연다 (PARITY §2.19).
   *
   * ⚠️ **내 쪽 자리가 빈 채로 선다.** 사파리에는 내보내는 마리가 없다 —
   * 볼을 던지는 것은 사람이다
   */
  startSafari: (wild: WildStart) => Promise<void>
  /** 사파리의 명령 넷. 다른 갈래에서는 아무 일도 안 한다 */
  safariAct: (command: SafariCommand) => void
  /** 남은 사파리볼과 지금 칸. 화면이 그린다. 사파리가 아니면 null */
  safari: SafariHud | null
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
   * 재생기가 **마지막으로 접은** 사건들 (`playEvents`).
   *
   * 뷰는 서 있는 네 자리만 든다 — 벤치까지 닿는 일(치유방울·아로마테라피)은 뷰에 안
   * 남아서, 그것을 읽는 쪽(`ui/battle/benchStatus`)이 여기서 본다
   */
  played: readonly BattleEvent[]
  /**
   * 시합규칙 「교체」에서 물어볼 것이 남아 있으면 상대가 내보내려는 마리의 키.
   *
   * 이게 있는 동안 화면은 "포켓몬을 교체하겠습니까?"를 띄운다
   */
  shiftAsk: string | null
  /** 그 물음에 답한다. `true`면 우리도 한 마리 바꾼다 — 턴을 안 쓴다 */
  answerShift: (change: boolean) => Promise<void>
  /**
   * 지금 뜬 교체 화면이 「교체」의 **예**로 열린 것인가 (`controller.freeShift`).
   *
   * 기절한 뒤의 교체와 화면이 같다 — 고를 것이 교체뿐이다. 이쪽만 물러설 수 있다
   * (`cancelShift`)
   */
  freeShift: boolean
  /** 그 교체 화면에서 물러선다. 교체 없이 상대의 다음 마리만 나온다 (`subscript_replace_fainted.s` _060) */
  cancelShift: () => Promise<void>
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
/**
 * 판 번호. 자리를 잡을 때와 닫을 때마다 하나씩 오른다.
 *
 * ⚠️ **여는 길은 기다림이 길다** — 규칙기·자료·심판을 받는 사이에 「필드로 돌아가기」로
 * 닫으면(`close`), 늦게 돌아온 여는 길이 `phase`를 `'running'`으로 되살려 닫힌 판이
 * 다시 떴다. 기다림마다 이 번호가 그대로인지 보고, 바뀌었으면 손을 뗀다
 */
let ticket = 0
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
let speciesTable: SpeciesTable | null = null
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

/**
 * 방금 상대한 트레이너 번호. 이긴 판만 노트에 적으려면 배틀이 끝난 뒤에도
 * 알아야 한다 (`JournalEntry_CreateAndSaveEventTrainer`, PARITY §7.4)
 */
let metTrainer: number | null = null

/** 세이브에 적힌 그 배회의 남은 체력과 상태이상. 자리가 비었으면 아무것도 안 바꾼다 */
function foeVitals(slot: number, maxHp: number | null): { hp: number; status: Status } | object {
  const saved = useSaveStore.getState().roamers[slot]
  if (!saved?.active) return {}
  return { hp: maxHp === null ? saved.hp : Math.min(saved.hp, maxHp), status: saved.status }
}

/**
 * 배틀팩토리가 빌려 준 셋 (PARITY §9.3).
 *
 * ⚠️ **여기가 차 있으면 리포트의 파티를 아예 안 본다.** 경험치도 상금도 도감도
 * 노트도 안 남는다 — 원작의 프론티어 판이 그렇다(`BATTLE_TYPE_FRONTIER_*`).
 * 레벨이 50이나 100으로 고정인 판에 경험치를 주면 그 자리에서 규칙이 무너진다
 */
let rentalParty: PokemonInstance[] | null = null
/** 잡는 법 강습의 동료 — 판이 열려 있는 동안만 선다 (`startTutorial`) */
let tutorialAlly: TutorialAlly | null = null

/**
 * 도는 중인 사파리 판 (PARITY §2.19). 컨트롤러가 없는 갈래라 여기가 그 자리다.
 *
 * ⚠️ **`mon`이 잡히면 그대로 리포트로 간다.** 다시 만들지 않는다 — 성격값도
 * 개체값도 판이 열릴 때 이미 굴려졌고, 화면에 선 그 마리가 잡힌 그 마리다
 */
let safariRun: {
  run: SafariRun
  mon: PokemonInstance
  species: Species
  outcome: SafariOutcome
} | null = null

function hudOf(run: SafariRun): SafariHud {
  return {
    balls: run.balls,
    catchStage: run.stage.catchStage,
    escapeStage: run.stage.escapeStage,
  }
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
function ensureParty(table: SpeciesLookup, pp: (move: number) => number): PokemonInstance[] {
  // 배틀팩토리는 **빌린 셋**으로 싸운다. 리포트의 파티는 시설에 맡겨 두었다
  if (rentalParty) return rentalParty
  // 잡는 법 강습 — 동료의 파트너를 빌린 셋처럼 세운다. 그러면 도감 · 경험치 · 기록 · 판 닫기가 전부 시설 판의 길로
  // 가서 리포트를 안 건드린다 (`Pokemon_InitWith(…, 5, INIT_IVS_RANDOM, …)`)
  if (tutorialAlly) {
    const base = table.get(tutorialAlly.species)
    const mon = createWild({ species: base, level: 5, rng: Math.random, otId: 0, otSecretId: 0 })
    mon.hp = statsOf(mon, base).hp
    rentalParty = [fillPp(mon, pp)]
    return rentalParty
  }
  const save = useSaveStore.getState()
  let party = save.party

  if (party.length > 0) return party
  {
    const species = table.get(STARTER)
    const mon = createWild({
      species,
      level: 5,
      rng: Math.random,
      otId: save.trainer.id,
      otSecretId: save.trainer.secretId,
    })
    mon.hp = statsOf(mon, species).hp
    party = [fillPp(mon, pp)]
  }

  useSaveStore.setState({ party })
  return party
}

export const useBattleStore = create<BattleState>((set, get) => ({
  phase: 'off',
  sceneReady: false,
  kind: 'wild',
  foeName: null,
  foeClass: null,
  foeTrainer: null,
  trainerId: null,
  trainerClass: null,
  foes: [],
  partner: null,
  defeatLines: [],
  foeWinLines: [],
  downKeys: [],
  prize: 0,
  penalty: 0,
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
  victorySong: null,
  setVictorySong: (song) => { set({ victorySong: song }) },
  ally: null,
  error: null,
  shiftAsk: null,
  freeShift: false,
  played: [],
  safari: null,

  startTutorial: async (t) => {
    if (get().phase !== 'off') return
    tutorialAlly = t
    set({ trainerId: null, trainerClass: null, foes: [], partner: null, defeatLines: [], ally: { name: t.name, gender: t.gender } })
    await open(set, get, 'wild', null, null, null, 0, ({ species, pp }) => {
      // 무늬 없는 비버니 Lv2 — 선두 특성도 안 탄다(조우가 아니다)
      const base = species.get(SPECIES_BIDOOF)
      const foe = createWild({ species: base, level: 2, rng: Math.random, otId: 0, otSecretId: 0 })
      const sp = species.of(foe)
      foe.hp = statsOf(foe, sp).hp
      return { name: '야생', team: [ready(fillPp(foe, pp), sp, foeKey(0))] }
    }, undefined, { noCrit: true, sureHit: true })
  },

  startWild: async (wild) => {
    set({ trainerId: null, trainerClass: null, foes: [], partner: null, defeatLines: [], ally: null })
    // 동행과 함께 만난 야생 둘 (`BATTLE_TYPE_AI_PARTNER`). 편은 트레이너 자료에서 온다.
    //
    // ⚠️ **그 자료를 받기 전에 자리부터 잡는다** — `startTrainer` 머리말과 같은
    // 까닭이다. 받는 동안 `phase`가 `'off'`면 필드가 그 틈에 새 스크립트를 건다
    const paired = wild.second !== undefined && (wild.partner ?? 0) !== 0
    let ally: Awaited<ReturnType<typeof partnerOf>> = null
    let mine: number | null = null
    if (paired) {
      if (get().phase !== 'off') return
      set({ phase: 'loading', sceneReady: false, kind: 'wild', error: null })
      mine = ++ticket
      try {
        ally = await partnerOf(wild.partner!)
      } catch (e) {
        // 편을 못 세우면 야생 한 마리와의 싱글로 연다 — 조우를 통째로 버리지 않는다
        console.error('동행 트레이너를 못 읽었다', e)
      }
      // 기다리는 사이에 닫혔다 (`ticket`)
      if (mine !== ticket) return
      if (ally) set({ partner: ally.tag })
    }
    await open(
      set,
      get,
      'wild',
      null,
      null,
      null,
      0,
      ({ species, pp }) => {
        // ⚠️ **개체는 기본형으로 만들고 모습을 나중에 적는다.** 폼 칸을 넘기면
        // `createWild`가 그 칸의 번호(로토무 히트면 503)를 종족으로 박는다.
        // 원작도 `Pokemon_InitWith` 뒤에 `AddWildMonToParty`가 폼을 적는다
        const base = species.get(wild.species)
        // 선두 특성이 성격·성별·가진 도구까지 민다 (PARITY §1.22). 싱크로는
        // 성격을, 헤롱헤롱바디는 반대 성별을, 복안은 도구 확률을 올린다
        const lead = encounters.mods.lead
        const foe = createWild({
          species: base,
          level: wild.level,
          rng: Math.random,
          otId: 0,
          otSecretId: 0,
          bias: {
            nature: wildNature(lead, Math.random),
            gender: wildGender(lead, Math.random),
          },
          compoundEyes: leadHas(lead, LeadAbility.COMPOUND_EYES),
        })
        foe.form = wild.form ?? 0
        if (wild.fateful === true) foe.origin = { ...foe.origin, fateful: true }
        // ⚠️ **`open`이 밟은 칸으로 땅을 정한 뒤다** — 여기서 덮어야 조우 폭발(`burstMembers`)과
        // 도롱마담 옷감이 그 땅을 본다
        if (wild.terrain !== undefined) battleTerrain = wild.terrain
        // ⚠️ **레이더 사슬만 색을 못 박는다** (PARITY §6.5). 원작이 그 자리에서
        // 색이 다르게 나올 때까지 성격값을 다시 굴린다
        // (`CreateWildMonShinyWithGenderOrNature`) — 우리도 같은 자리에서 찾는다
        if (wild.shiny === true) {
          const me = useSaveStore.getState().trainer
          foe.pid = shinyPersonality(
            ((me.secretId << 16) | me.id) >>> 0, (n) => Math.floor(Math.random() * n))
        }
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
        const team = [ready(fillPp(foe, pp), foeSpecies, foeKey(0))]
        // ⚠️ **둘째 야생은 같은 쪽의 둘째 마리다** — 야생에는 「트레이너 둘」이
        // 없어서 자리 주인을 가를 것도 없다 (벤치가 없으니 채울 것도 없다)
        const second = ally ? wild.second : undefined
        if (second) {
          const base2 = species.get(second.species)
          const mon2 = createWild({
            species: base2, level: second.level, rng: Math.random, otId: 0, otSecretId: 0,
            bias: { nature: wildNature(lead, Math.random), gender: wildGender(lead, Math.random) },
            compoundEyes: leadHas(lead, LeadAbility.COMPOUND_EYES),
          })
          mon2.form = second.form ?? 0
          const sp2 = species.of(mon2)
          mon2.hp = statsOf(mon2, sp2).hp
          team.push(ready(fillPp(mon2, pp), sp2, foeKey(1)))
        }
        return { name: '야생', team }
      },
      undefined,
      wild.roamer == null ? undefined : { roamer: true },
      undefined,
      ally !== null && wild.second !== undefined,
      // 둘일 때는 위에서 자리를 이미 잡았다
      mine,
      ally ? { partner: ally.build, partnerAi: ally.trainer.ai } : {},
    )
  },

  /**
   * 트레이너전을 연다.
   *
   * ⚠️ **자리를 자료보다 먼저 잡는다.** 형제 셋(`startWild`·`startFactory`·
   * `startSafari`)은 `await` 앞에서 `phase`를 세우는데 여기만 표 셋을 받은
   * **뒤에** 세우고 있었다. 그 몇 프레임 동안 `phase`가 `'off'`라 밖에서는
   * **배틀이 없는 것과 구별이 안 된다** — 필드의 `tryStartScripts`가 바로 그
   * 값을 보고 새 스크립트를 막는다(`script/field.ts`).
   *
   * ⚠️ **실측으로 잡았다** (2026-09-09 · `pnpm story`의 gym3). 확인 지점으로
   * 연고 체육관에 뛰어들면 `useDevWarp`가 `abortScript()` 뒤에 이 함수를
   * 부르는데, 표를 받는 사이에 필드가 열려 **눈이 마주친 트레이너**의 다가오는
   * 연출이 시작됐다. 그 연출의 대사창이 배틀 화면 **밑에서** 영영 기다렸고
   * (12쪽 중 0쪽), 밖에서는 「대사가 통째로 날아갔다」로 보였다.
   *
   * ⚠️ **정상 플레이에는 이 구멍이 없었다.** 스크립트가 여는 길은 그 스크립트가
   * 계속 돌아서(`fieldScripts.ctx !== null`) `tryStartScripts`가 애초에 안
   * 불린다 — 스크립트를 **먼저 지우는** 자리만 뚫렸다. 그래도 여기서 막는다:
   * 뚫린 값을 내주고 있던 것은 이 함수다.
   *
   * ⚠️ **잡았으면 반드시 놓아준다.** 자리만 잡고 터지면 `phase`가 `'loading'`에
   * 묶여 배틀 화면이 빈 채로 남는다. 그래서 실패는 `'off'`로 되돌리고 **다시
   * 던진다** — 부르는 쪽(`scene/fieldServices`)이 그 예외를 받아 스크립트를
   * 놓아준다
   */
  startTrainer: async (trainerId, options) => {
    if (get().phase !== 'off') return
    set({
      phase: 'loading', sceneReady: false, kind: 'trainer', foeName: null, foeClass: null, foeTrainer: null, prize: 0,
      trainerId, trainerClass: null, foes: [], partner: null, defeatLines: [], downKeys: [],
      view: null, truth: null, actions: [], party: [], canSpendTurn: false, doubles: false,
      atSlot: 0, pending: [], events: [], roster: {}, outcome: null, error: null,
      shiftAsk: null, safari: null, penalty: 0, freeShift: false, played: [],
    })
    const mine = ++ticket
    try {
      const locale = gameLocale()
      const [table, names, classes, said] = await Promise.all([
        loadTrainers(),
        loadTrainerNames(locale),
        loadTrainerClasses(locale),
        // 이긴 뒤 상대가 하는 말 (`TRMSG_DEFEAT`). 없어도 배틀은 돈다 — 그 줄만 빈다
        loadDialogueBank(locale, TRAINER_MESSAGE_BANK).catch(() => [] as string[]),
      ])
      // 기다리는 사이에 닫혔다 (`ticket`)
      if (mine !== ticket) return
      const trainer = table.get(trainerId)
      metTrainer = trainerId
      // ⚠️ **둘째 상대가 첫 상대와 다를 때만 2vs2다.** 같은 번호면 한 사람의
      // 더블이고, 0이면 싱글이다 (`Encounter_NewVsTrainer` — `encounter.c` 728)
      const secondId = options?.second ?? 0
      const other = secondId !== 0 && secondId !== trainerId ? table.get(secondId) : null
      // 편은 상대가 둘일 때만 선다 (`BattleRules.partner` 머리말)
      const allyId = other && options?.partner ? options.partner : 0
      const ally = allyId !== 0 ? table.get(allyId) : null
      if (!trainer.party.length || (other && !other.party.length) || (ally && !ally.party.length)) {
        // ⚠️ **잡은 자리를 놓고 나간다.** 안 놓으면 `phase`가 `'loading'`에 묶여
        // 배틀 화면이 빈 채로 남는다
        console.error(`트레이너 #${String(trainerId)} — 파티가 비어 있어 배틀을 못 연다`)
        set({ phase: 'off', trainerId: null, trainerClass: null, error: OPEN_FAILED })
        return
      }
      const tag = (id: number, t: Trainer): TrainerTag => {
        const name = trainerNameOf(id, t.class, names, useSaveStore.getState().rivalName)
        return {
          id,
          cls: classes[t.class] ?? null,
          name,
          // "체육관 관장 동관". 분류만 있고 이름이 비면 분류로 부른다
          label: [classes[t.class], name].filter(Boolean).join(' '),
          classId: t.class,
        }
      }
      const first = tag(trainerId, trainer)
      const foes = other ? [first, tag(secondId, other)] : [first]
      const partner = ally ? tag(allyId, ally) : null
      const label = first.label

      // 상금 (`BattleScript_CalcPrizeMoney`). ⚠️ **트레이너 둘이면 둘의 합이고
      // 두 배가 없다** — 두 배는 한 사람의 더블에만 붙는다 (`battle_script.c` 3683:
      // `BATTLE_TYPE_TAG`·`TRAINER_WITH_AI_PARTNER`가 `DOUBLES`보다 먼저 걸린다).
      // 부적금화는 도구 데이터가 아직 없어서 안 본다
      const prize = other
        ? prizeFor(trainer, table.prizeMul, false, false) + prizeFor(other, table.prizeMul, false, false)
        : prizeFor(trainer, table.prizeMul)

      set({ trainerId, trainerClass: trainer.class, foes, partner })

      // 트레이너가 들고 나오는 회복 도구. 개수도 종류도 롬 기록 그대로다 —
      // 라이벌은 상처약, 관장은 좋은상처약, 사천왕·챔피언은 회복약이다.
      //
      // ⚠️ **편이 있는 판에서는 아무도 도구를 안 쓴다.** `BATTLE_TYPE_NO_AI_ITEMS`에
      // `BATTLE_TYPE_AI`가 들어 있다 (`constants/battle.h` 51 →
      // `BattleControllerPlayer_InitAI`가 도구 칸을 안 채운다). 태그 더블(편 없음)은
      // 두 트레이너가 **저마다** 제 도구를 쓴다
      const bank = await loadItems()
      if (mine !== ticket) return
      const kit = (t: Trainer): ControllerItems | undefined => (!ally && t.items.length > 0
        ? { bag: new TrainerItems(t.items, bank), item: (id) => bank.get(id) }
        : undefined)
      const items = kit(trainer)
      const items2 = other ? kit(other) : undefined

      // 더블 배틀 (PARITY §2.2). 롬이 트레이너마다 적어 둔 표식이다 —
      // 928명 중 28명이 참이다.
      //
      // ⚠️ **양쪽 다 두 마리가 있어야 연다.** 원작은 스크립트가 먼저 세어 보고
      // "포켓몬이 두 마리 필요하다"로 막지만(§10 「글 칸 채우기」), 우리는 아직
      // 그 자리가 없다 — 한 마리로 더블을 열면 sim이 시작하자마자 승부를 낸다.
      // 여기서 싱글로 떨어뜨리는 것이 그 사이의 방어선이다.
      //
      // 트레이너 둘과의 판은 **늘 더블이다** — 한 마리뿐이어도 편이 있거나(편 자리)
      // 원작 스크립트가 두 마리를 먼저 세어 본다(`CheckHasTwoAliveMons`)
      const able = useSaveStore.getState().party.filter((m) => !m.isEgg && m.hp > 0).length
      const doubles = other !== null || (trainer.double && trainer.party.length >= 2 && able >= 2)

      // 이긴 뒤의 말 (`subscript_battle_won.s`). 트레이너 둘이면 첫 상대·둘째 상대가
      // 저마다 `TRMSG_DEFEAT`(1)을, 한 사람의 더블이면 같은 사람이
      // `TRMSG_DOUBLE_BATTLE_DEFEAT_1`(4)·`_2`(8)을 잇는다
      const said1 = (t: Trainer, type: number): string | null => {
        const at = t.msg[String(type)]
        const text = at === undefined ? undefined : said[at]
        return text === undefined || text.trim() === '' ? null : text.replace(/\s+$/, '')
      }
      const defeat = other
        ? [said1(trainer, 1), said1(other, 1)]
        : doubles && trainer.double
          ? [said1(trainer, 4), said1(trainer, 8)]
          : [said1(trainer, 1)]
      set({ defeatLines: defeat.filter((x): x is string => x !== null) })

      const build = (t: Trainer, id: number, key: (i: number) => string): BuildFoe =>
        ({ species, pp }) => ({
          name: tag(id, t).label || '상대',
          team: t.party.map((entry, i) => {
            const sp = species.get(entry.species)
            const mon = trainerMonToInstance(entry, sp, id, i)
            mon.hp = statsOf(mon, sp).hp
            return ready(fillPp(mon, pp), sp, key(i))
          }),
        })

      await open(
        set,
        get,
        'trainer',
        label,
        first.cls,
        first.name,
        prize,
        build(trainer, trainerId, foeKey),
        trainer.ai,
        options,
        items,
        doubles,
        // 자리는 위에서 이미 잡았다 (머리말)
        mine,
        {
          ...(other ? { foe2: build(other, secondId, foe2Key), ai2: other.ai, items2 } : {}),
          ...(ally ? { partner: build(ally, allyId, allyKey), partnerAi: ally.ai } : {}),
        },
      )
    } catch (e) {
      // 원문은 콘솔에 남긴다. 화면 칸(`error`)에는 사람이 읽는 말만 간다 (`OPEN_FAILED`)
      console.error('트레이너전을 못 열었다', e)
      // 이미 닫힌 판이면 그 뒤에 선 것(필드나 다음 판)을 건드리지 않는다
      if (mine !== ticket) return
      set({ phase: 'off', trainerId: null, trainerClass: null, error: OPEN_FAILED })
      throw e
    }
  },

  startFactory: async ({ team, foe, label, ai, doubles, cls, name, defeat, victory, classId }) => {
    rentalParty = team.map((m) => ({ ...m }))
    metTrainer = null
    set({
      // ⚠️ **상대의 몸은 분류 번호로 선다** (`hasTrainer`). 비우면 무대에 상대 트레이너가 아예
      // 안 서고, 교체 볼이 빈 자리에서 날아온다. 더블도 한 사람이다 — 프런티어 더블은
      // `BATTLE_TYPE_FRONTIER_DOUBLES`(= `TRAINER_DOUBLES`)라 태그(`2vs2`)가 아니다.
      //
      // `foes`는 비워 둔다 — 그 칸은 **트레이너 표(trdata)의 번호**를 드는 자리라
      // (`TrainerTag.id` · 이긴 뒤 `journalBeatTrainer`) 프런티어 트레이너 번호를 넣으면 다른 사람이 된다
      trainerId: null, trainerClass: classId ?? null, foes: [], partner: null,
      defeatLines: defeat === null ? [] : [defeat], foeWinLines: victory === null ? [] : [victory],
    })
    await open(
      set,
      get,
      'factory',
      label,
      cls,
      name,
      // 상금이 없다. 프론티어는 BP로 셈한다
      0,
      ({ species }) => ({
        name: label,
        team: foe.map((mon, i) => ready(mon, species.get(mon.species), foeKey(i))),
      }),
      ai,
      undefined,
      undefined,
      doubles,
    )
  },

  startSafari: async (wild) => {
    if (get().phase !== 'off') return
    set({
      phase: 'loading', sceneReady: false, kind: 'safari', foeName: null, foeClass: null, foeTrainer: null, prize: 0,
      trainerId: null, trainerClass: null, foes: [], partner: null, defeatLines: [], downKeys: [],
      view: null, truth: null, actions: [], party: [], canSpendTurn: false, doubles: false,
      atSlot: 0, pending: [], events: [], roster: {}, outcome: null, error: null,
      shiftAsk: null, safari: null, penalty: 0, freeShift: false, played: [],
    })
    const mine = ++ticket
    try {
      const species = await loadSpecies()
      // 기다리는 사이에 닫혔다 (`ticket`)
      if (mine !== ticket) return
      speciesTable = species
      participants = new Set()
      roamerMet = null
      metTrainer = null
      battleTerrain = terrainOf(
        world.grid?.behaviorAtWorld(
          worldState.player.position.x, worldState.player.position.z) ?? null,
        mapById(world.mapId)?.battleBg ?? -1,
      )

      const base = species.get(wild.species)
      const mon = createWild({
        species: base, level: wild.level, rng: Math.random, otId: 0, otSecretId: 0,
      })
      mon.form = wild.form ?? 0
      const data = species.of(mon)
      mon.hp = statsOf(mon, data).hp

      // 사파리도 야생전으로 센다 (`FieldTask_SafariEncounter`)
      useSaveStore.setState((st) => ({
        records: addRecord(st.records, RECORD_WILD_BATTLES_FOUGHT, 1),
      }))

      const save = useSaveStore.getState()
      safariRun = {
        run: { stage: newSafariBattle(), balls: save.safari.balls },
        mon,
        species: data,
        outcome: null,
      }
      const actor = { slot: 'p2a' as const, side: 'p2' as const, name: foeKey(0) }
      const events: BattleEvent[] = [
        { kind: 'start' },
        {
          kind: 'switch',
          actor,
          species: mon.species,
          form: mon.form,
          speciesName: String(mon.species),
          level: mon.level,
          gender: genderOf(mon.pid, data.genderRatio),
          shiny: false,
          condition: { hp: mon.hp, maxHp: mon.hp, status: 'ok' },
          forced: false,
        },
      ]
      set({
        phase: 'running',
        truth: applyEvents(emptyView(), events),
        view: emptyView(),
        events,
        roster: {
          [foeKey(0)]: {
            side: 'p2', species: mon.species, form: mon.form, nickname: null, level: mon.level,
          },
        },
        safari: hudOf(safariRun.run),
      })
    } catch (e) {
      console.error('사파리 판을 못 열었다', e)
      if (mine !== ticket) return
      safariRun = null
      set({ phase: 'off', error: OPEN_FAILED })
    }
  },

  safariAct: (command) => {
    const run = safariRun
    if (!run || get().phase !== 'running') return
    const turn = safariTurn({
      state: run.run,
      command,
      foe: {
        catchRate: run.species.catchRate,
        fleeRate: run.species.safariFlee,
        hp: run.mon.hp,
        maxHp: run.mon.hp,
      },
      actor: { slot: 'p2a', side: 'p2', name: foeKey(0) },
      rng: Math.random,
    })
    run.run = turn.state
    run.outcome = turn.outcome
    // 볼은 **던진 그 자리에서** 리포트에 적힌다. 판이 끝나기를 기다리면
    // 도중에 창을 닫는 길에서 한 개가 되살아난다
    if (command === 'ball') {
      useSaveStore.setState((st) => ({
        safari: { ...st.safari, balls: turn.state.balls },
      }))
    }
    const events = [...get().events, ...turn.events]
    set({
      events,
      truth: applyEvents(get().truth ?? emptyView(), turn.events),
      safari: hudOf(turn.state),
      phase: turn.outcome === null ? 'running' : 'over',
      // 볼이 떨어진 것은 사람이 도망친 것으로 친다 (`BATTLE_RESULT_PLAYER_FLED`)
      outcome: turn.outcome === null ? null
        : turn.outcome === 'caught' ? 'caught'
          : turn.outcome === 'foeFled' ? 'foeFled' : 'fled',
    })
  },

  answerShift: async (change) => {
    if (!current?.shiftAsk) return
    await advance(set, get, (c) => c.answerShift(change))
  },

  cancelShift: async () => {
    if (!current?.freeShift) return
    await advance(set, get, (c) => c.cancelShift())
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
    const left = controller.chooseSlots.filter((i) => !pending.some((a) => (a.at ?? 0) === i))
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
    /**
     * **던진 볼은 가방에서 빠진다** — 잡히든 안 잡히든 (`battle_controller_player.c`):
     *
     *     case ITEM_BATTLE_CATEGORY_POKE_BALLS:
     *         nextSeq = subscript_throw_pokeball;
     *         if (트레이너전이 아니고 && 잡는 법 강습이 아니면) {
     *             Bag_TryRemoveItem(…, used->item, 1, …);
     *
     * ⚠️ **한동안 안 깎고 있었다.** 도구 쪽(`useItem`)은 `spendFromBag`을 부르는데
     * 볼 쪽만 빠져 있어서 **볼이 무한했다** — 실측(2026-09-16 `_catch42`)으로
     * 몬스터볼 여섯으로 한 마리를 잡고도 여섯 그대로였다.
     *
     * 원작의 두 조건 중 트레이너전은 바로 위에서 이미 걸렀고, 잡는 법 강습은
     * 우리에게 아직 없다 — 생기면 그때 여기에 갈래가 하나 는다.
     * 사파리는 제 볼을 따로 세므로(`engine/battle/safariBattle`) 여기 안 온다
     */
    // 잡는 법 강습은 안 깎는다 — 원작 조건의 둘째다. 가방도 스물짜리 버리는 가방이다
    if (tutorialAlly === null) spendFromBag(await loadItems(), ball)
    await advance(set, get, (c) =>
      c.throwBall(ball, {
        // 시간대·지형은 아직 없다. 다이브·다크볼이 보정을 못 받는다는 뜻이다
        caughtBefore: false,
        inWater: false,
        darkness: false,
        sure: tutorialAlly !== null,
      }),
    )
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
      const left = controller.chooseSlots.filter((i) => !pending.some((a) => (a.at ?? 0) === i))
      if (left.length > 0) {
        set(turnState(controller, pending))
        return
      }
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
    // 파티 공 (`PartyGauge`)은 **보여 준 만큼만** 어두워진다. 되살린 마리는 다시 켜진다
    let down = get().downKeys
    for (const e of events) {
      if (e.kind === 'faint' && !down.includes(e.actor.name)) down = [...down, e.actor.name]
      if ((e.kind === 'heal' || e.kind === 'switch') && down.includes(e.actor.name)
        && e.condition.hp > 0) down = down.filter((k) => k !== e.actor.name)
    }
    set({ view: applyEvents(get().view ?? emptyView(), events), downKeys: down, played: events })
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
    // 여는 중이던 판은 여기서 손을 뗀다 (`ticket`)
    ticket++
    const controller = current
    // ⚠️ **사파리는 파티를 통째로 건너뛴다** (PARITY §2.19). 내보낸 마리가
    // 없으니 되돌릴 체력도 PP도 없고, 경험치·상금·포켓루스·도롱마담도 안 돈다
    // (`BATTLE_TYPE_NO_EXPERIENCE`). 잡은 것만 리포트로 넘긴다
    if (safariRun) {
      const run = safariRun
      safariRun = null
      const save = useSaveStore.getState()
      if (run.outcome === 'caught') {
        const level = run.mon.level
        const mon: PokemonInstance = {
          ...run.mon,
          otId: save.trainer.id,
          otSecretId: save.trainer.secretId,
          ball: Ball.SAFARI,
          origin: caughtAt(
            playerTrainer(save.trainer),
            mapById(useSessionStore.getState().mapId)?.label ?? 0,
            level,
            metToday(),
          ),
        }
        const party = save.party.length < PARTY_MAX ? [...save.party, mon] : save.party
        const boxes = party === save.party
          ? storeInBox(save.boxes, save.currentBox, mon)?.boxes ?? save.boxes
          : save.boxes
        useSaveStore.setState({
          party,
          boxes,
          pokedex: {
            ...save.pokedex,
            seen: dexSet(save.pokedex.seen, mon.species),
            caught: dexSet(save.pokedex.caught, mon.species),
            battled: dexSet(save.pokedex.battled, mon.species),
          },
          records: addTrainerScore(
            addRecord(save.records, RECORD_CAUGHT_POKEMON, 1),
            (speciesTable?.sinnohOf[mon.species] ?? 0) > 0
              ? SCORE_CAPTURED_REGIONAL_MON
              : SCORE_CAPTURED_NATIONAL_MON),
          // 안내원이 물어보는 수 (`TVBroadcast_UpdateSafariGameData`)
          safari: { ...useSaveStore.getState().safari, caught: save.safari.caught + 1 },
        })
        poketchGotMon({ species: mon.species, form: mon.form })
        journalWildBattle({
          result: 'caught',
          species: mon.species,
          gender: genderOf(mon.pid, run.species.genderRatio),
          timeOfDay: timeOfDayForHour(worldState.time.gameHour),
          playtimeMs: save.trainer.playtimeMs,
        })
      }
      const spent = run.outcome === 'outOfBalls'
      set({
        phase: 'off', kind: 'wild', foeName: null, foeClass: null, foeTrainer: null, prize: 0, trainerId: null, trainerClass: null,
        view: null, truth: null, actions: [], party: [], canSpendTurn: false, events: [],
        roster: {}, outcome: null, shiftAsk: null, safari: null, penalty: 0, freeShift: false, played: [],
      })
      // 볼이 떨어진 판은 안내원 스크립트가 화면을 맡는다
      if (!spent) fadeInField()
      // ⚠️ **볼이 떨어졌으면 놀이가 그 자리에서 끝난다** (`FieldTask_SafariEncounter`의
      // 마지막 마디가 특별 자리로 되돌려 보낸다). 우리는 롬의 안내원 스크립트를
      // 돌린다 — 글도 워프도 그쪽이 갖고 있다
      if (spent) encounters.safariOutOfBalls?.()
      return
    }
    // ⚠️ **팩토리는 리포트에 아무것도 안 남긴다.** 빌린 셋이라 체력도 PP도
    // 다음 판 앞에서 원작이 통째로 회복시키고(`Party_HealAllMembers`), 도감·
    // 노트·포켓루스·도롱마담 옷감도 프론티어 판에서는 안 돈다. 여기를 안
    // 막으면 **빌린 마리가 내 파티를 덮어쓴다**
    if (controller && rentalParty) {
      // 잡는 법 강습은 필드로 돌아가며 검정에서 밝아진다 (`FieldTask_CatchingTutorialEncounter`의
      // `FieldTransition_FadeIn`). 팩토리는 시설 스크립트가 화면을 맡는다
      const tutorial = tutorialAlly !== null
      controller.destroy()
      current = null
      rentalParty = null
      tutorialAlly = null
      participants = new Set()
      leveledUp = new Set()
      set({
        phase: 'off', kind: 'wild', foeName: null, foeClass: null, foeTrainer: null, prize: 0, trainerId: null, trainerClass: null,
        view: null, truth: null, actions: [], party: [], canSpendTurn: false, events: [],
        roster: {}, outcome: null, shiftAsk: null, ally: null, penalty: 0, freeShift: false, played: [],
      })
      if (tutorial) fadeInField()
      return
    }
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
        // ⚠️ **더블에서는 잡은 마리가 자리 b에 있을 수 있다** — 편과 함께 만난
        // 야생 둘에서 한 마리가 먼저 쓰러지면 남은 쪽에 던진다 (`throwBall`)
        const truth = get().truth
        const seen = truth?.active.p2a?.key === caught.key ? truth.active.p2a
          : truth?.active.p2b?.key === caught.key ? truth.active.p2b : truth?.active.p2a
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
          ...pokedex,
          seen: dexSet(pokedex.seen, mon.species),
          caught: dexSet(pokedex.caught, mon.species),
          // 잡은 것도 상대해 본 것이다 (§2.22)
          battled: dexSet(pokedex.battled, mon.species),
        }
        // 포켓치의 포켓몬히스토리에도 붙는다 (PARITY §7.3)
        poketchGotMon({ species: mon.species, form: mon.form })
      }
      // 이기고 진 수와 트레이너 스코어 (PARITY §7.5)
      const finished = get().outcome
      let records = save.records
      if (finished === 'loss') records = addRecord(records, RECORD_FAINTED_IN_BATTLE, 1)
      if (finished === 'win') {
        records = addTrainerScore(records,
          get().kind === 'wild' ? SCORE_WON_WILD_BATTLE : SCORE_WON_TRAINER_BATTLE)
      }
      if (caught) {
        records = addRecord(records, RECORD_CAUGHT_POKEMON, 1)
        // ⚠️ **신오 도감 안이면 지역, 밖이면 전국이다** — 오르는 폭이 2와 3으로 다르다
        // ⚠️ **신오도감 번호가 0이 아니면 지역이다** (`GetDexNumber(0, ...)`).
        // 전국 번호로 자르면 안 된다 — 신오도감에 4세대 아닌 종이 잔뜩 있고
        // 4세대 신규 중에도 신오도감에 없는 것이 있다
        records = addTrainerScore(records, (speciesTable?.sinnohOf[caught.mon.species] ?? 0) > 0
          ? SCORE_CAPTURED_REGIONAL_MON
          : SCORE_CAPTURED_NATIONAL_MON)
      }

      // 도롱마담은 싸운 땅의 옷감으로 갈아입는다 (PARITY §3.4)
      party = dressBurmy(party)
      // 포켓루스가 걸리고 옆으로 옮는 자리 (PARITY §3.9).
      //
      // ⚠️ **판이 어떻게 끝났든 돈다.** 원작은 `BattleControllerPlayer_EndFight`에서
      // 통신 배틀만 빼고 무조건 부른다 — 이겼는지 도망쳤는지를 안 본다
      party = pokerusAfterBattle(party, Math.random)
      useSaveStore.setState({ party, boxes, pokedex, records })
      // 배회는 여기서 자리를 옮기거나 지워진다 (PARITY §6.3).
      //
      // ⚠️ **만난 판이 아니어도 부른다.** 원작은 야생을 한 판 치를 때마다
      // 30%로 이 맵의 배회를 흩어 놓는다 — 안 부르면 같은 도로에서 야생만
      // 잡는 동안 배회가 붙박이가 된다
      if (get().kind === 'wild') {
        const foe = get().truth?.active.p2a ?? null
        // 노트의 포켓몬 한 줄 (PARITY §7.4). 잡은 것은 그 자리에서, 쓰러뜨린 것은
        // **이 맵에서 다섯째부터** 적힌다 (`encounter.c`)
        const kept = caught ?? null
        const outcome = get().outcome
        if (kept || outcome === 'win') {
          journalWildBattle({
            result: kept ? 'caught' : 'defeated',
            species: kept?.mon.species ?? foe?.species ?? 0,
            gender: kept
              ? genderOf(kept.mon.pid, kept.species.genderRatio)
              : (foe?.gender ?? 'genderless'),
            timeOfDay: timeOfDayForHour(worldState.time.gameHour),
            playtimeMs: save.trainer.playtimeMs,
          })
        }
        // 레이더 사슬은 **잡거나 쓰러뜨린 판만** 산다 (PARITY §6.5).
        // 도망쳤거나 졌으면 끊긴다 — 원작이 `Encounter_ProcessResult`에서
        // 그 둘만 통과시킨다
        encounters.radarAfterBattle?.(
          get().outcome === 'caught' ? 'captured' : get().outcome === 'win' ? 'win' : 'other')
        encounters.roamerAfterBattle?.({
          met: roamerMet,
          mapId: world.mapId,
          hp: foe?.hp ?? 0,
          status: foe?.status ?? 'ok',
          outcome:
            get().outcome === 'caught' ? 'caught' : get().outcome === 'win' ? 'win' : 'other',
        })
      }
      // 이긴 트레이너를 노트에 적는다 (PARITY §7.4). 관장·사천왕·챔피언은
      // 자리 일로, 나머지는 따로 있는 한 줄로 간다
      if (get().kind === 'trainer' && get().outcome === 'win' && metTrainer !== null) {
        // 트레이너 둘과의 판은 둘 다 이긴 사람이다 (`UpdateJournal`이 적의 전투원마다 돈다)
        for (const foe of get().foes.length > 0 ? get().foes : [{ id: metTrainer }]) {
          journalBeatTrainer(world.mapId, foe.id)
        }
      }
      metTrainer = null
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
    // 여는 중에 닫힌 판은 컨트롤러가 없어도 빌린 셋을 들고 있을 수 있다 — 다음 판에 새지 않게 놓는다
    rentalParty = null
    tutorialAlly = null
    participants = new Set()
    leveledUp = new Set()
    const lost = get().outcome === 'loss'
    // 진화할 마리가 있으면 필드로 돌아가기 전에 그 장면이 먼저다. 원작도
    // 배틀 화면이 닫히면서 바로 이 화면으로 넘어간다
    const evolving = useEvolutionStore.getState().pending.length > 0
    if (evolving) useMenuStore.getState().open('evolution')
    // 필드는 검정에서 밝아진다 (`FieldTransition_FadeIn`). ⚠️ **진 판은 안 연다** — 원작은 그 자리에서
    // 필드로 안 돌아가고 눈앞이 캄캄해진 뒤의 길을 탄다 (`encounter.c` — `CheckPlayerWonEncounter`가
    // 거짓이면 곧장 끝난다). 진화 화면이 먼저 서는 판도 안 덮는다 — 덮개가 그 화면 위에 얹힌다
    if (!lost && !evolving && get().phase !== 'off') fadeInField()
    set({
      phase: 'off',
      kind: 'wild',
      foeName: null,
  foeClass: null,
  foeTrainer: null,
      prize: 0,
      trainerId: null,
      trainerClass: null,
      foes: [],
      partner: null,
      defeatLines: [],
      downKeys: [],
      view: null,
      truth: null,
      actions: [],
      party: [],
      canSpendTurn: false,
      events: [],
      roster: {},
      outcome: null,
      shiftAsk: null,
      penalty: 0,
      freeShift: false,
      played: [],
    })
  },
}))

/**
 * 배틀이 닫힌 뒤 필드를 **검정에서** 연다 — `FieldTransition_FadeIn`의
 * `StartScreenFade(…, FADE_TYPE_BRIGHTNESS_IN, …, COLOR_BLACK, 6, 1, …)`, 곧 6프레임이다.
 *
 * 배틀 화면은 닫기 전에 16프레임에 검게 내린다(`ui/battle/BattleScreen`의 `closeWithFade`).
 * 여기서 덮개를 이어 받지 않으면 검정이 걷히는 그 프레임에 필드가 툭 나타난다.
 * 덮개를 굴리는 것은 필드의 틱이다 (`script/field`의 `tickFade`)
 */
function fadeInField(): void {
  coverScreen()
  startFade(FIELD_FADE_STEPS, 1, FADE_TYPE_BRIGHTNESS_IN, 0)
}

/** `FieldTransition_FadeIn`의 단계 수 (한 단계 1프레임) */
const FIELD_FADE_STEPS = 6
/** `generated/fade_types.txt`의 1 — 홀수가 인이다 (`engine/script/fade`) */
const FADE_TYPE_BRIGHTNESS_IN = 1

/**
 * 편 트레이너 한 사람 (PARITY §2.2b) — 이름표와 파티를 만드는 것.
 *
 * 동행이 붙은 채로 만난 야생 둘(`BATTLE_TYPE_AI_PARTNER`)이 쓴다. 트레이너전의
 * 편은 `startTrainer`가 같은 모양으로 만든다
 */
async function partnerOf(id: number): Promise<{ tag: TrainerTag; trainer: Trainer; build: BuildFoe } | null> {
  const locale = gameLocale()
  const [table, names, classes] = await Promise.all([
    loadTrainers(), loadTrainerNames(locale), loadTrainerClasses(locale),
  ])
  const trainer = table.get(id)
  if (!trainer.party.length) return null
  const tag: TrainerTag = {
    id,
    cls: classes[trainer.class] ?? null,
    name: names[id] ?? null,
    label: [classes[trainer.class], names[id]].filter(Boolean).join(' '),
    classId: trainer.class,
  }
  return {
    tag,
    trainer,
    build: ({ species, pp }) => ({
      name: tag.label || '편',
      team: trainer.party.map((entry, i) => {
        const sp = species.get(entry.species)
        const mon = trainerMonToInstance(entry, sp, id, i)
        mon.hp = statsOf(mon, sp).hp
        return ready(fillPp(mon, pp), sp, allyKey(i))
      }),
    }),
  }
}

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
  //
  // ⚠️ **레벨이 오른 마리는 그 뒤의 줄을 고친다** (`lift`). sim은 이 걸음을 이미 다 셈했으므로
  // 경험치 뒤에 오는 체력 줄(턴 끝의 독 따위)이 옛 레벨·옛 최대 HP를 싣는다 — 그대로 접으면
  // 레벨업 박자가 올린 최대 HP를 그 줄이 도로 덮는다. 다음 걸음부터는 sim이 안다(`controller.levelUp`)
  const events: BattleEvent[] = []
  const grown = new Map<string, Grown>()
  for (const raw of result.events) {
    const e = withExpBar(lift(raw, grown))
    events.push(e)
    if (e.kind === 'faint' && e.actor.side === 'p2') {
      const paid = grantRewards(get(), e.actor.name, controller)
      events.push(...paid.events)
      for (const [key, up] of paid.grown) {
        grown.set(key, { ...up, grew: (grown.get(key)?.grew ?? 0) + up.grew })
      }
    }
  }

  const ended = result.view.ended
  // 상금은 이긴 그 순간 한 번만. `phase`가 'over'로 바뀌므로 두 번 올 수 없다
  if (ended && controller.finish === 'win') events.push(...grantPrize(get()))
  // 진 판은 그 순간 돈을 잃는다 (`BtlCmd_PayPrizeMoney`의 진 갈래)
  if (ended && controller.finish === 'loss') set({ penalty: payPenalty(get()) })

  // ⚠️ `view`는 여기서 안 건드린다. 화면은 재생기가 박자마다 밀어 준다.
  // 정본은 걸음이 끝난 뒤의 컨트롤러 뷰다 — 레벨업을 접은 뒤라 `result.view`보다 새것이다
  set({
    truth: controller.state,
    events: [...get().events, ...events],
    ...turnState(controller),
    phase: ended ? 'over' : 'running',
    outcome: controller.finish,
    shiftAsk: controller.shiftAsk,
    freeShift: controller.freeShift,
  })
}

/** 이 걸음에서 레벨이 오른 마리 — 그 뒤 줄을 고칠 값 (`lift`) */
interface Grown {
  level: number
  maxHp: number
  /** 최대 HP가 는 폭. 한 걸음에 여러 번 오르면 더한다 */
  grew: number
}

/**
 * 레벨이 오른 **뒤의** 줄을 새 레벨로 고친다 (`advance` 머리말).
 *
 * 체력은 원작처럼 는 폭을 더한다 (`Pokemon_CalcStats` — 쓰러진 마리는 그대로다).
 * sim의 개체도 같은 폭만큼 고쳤으므로(`controller.levelUp`) 판이 끝나 세이브로 가는 값과 맞는다
 */
function lift(e: BattleEvent, grown: ReadonlyMap<string, Grown>): BattleEvent {
  if (grown.size === 0) return e
  if (e.kind !== 'switch' && e.kind !== 'damage' && e.kind !== 'heal') return e
  const up = e.actor.side === 'p1' ? grown.get(e.actor.name) : undefined
  if (up === undefined) return e
  const condition = {
    ...e.condition,
    hp: e.condition.hp > 0 ? e.condition.hp + up.grew : e.condition.hp,
    maxHp: e.condition.maxHp === null ? null : up.maxHp,
  }
  return e.kind === 'switch' ? { ...e, condition, level: up.level } : { ...e, condition }
}

/**
 * 우리 파티 마리의 등판에 경험치 막대를 싣는다 (`Healthbox_DrawExpBar`).
 *
 * 프로토콜에는 경험치가 없다 — 세이브(빌린 셋이면 그 셋)를 아는 여기서 그 레벨 안의
 * 진행도(`levelProgress`)를 붙인다. 편의 마리는 우리 파티가 아니라 안 붙는다.
 * ⚠️ **등판 그 순간의 값이다.** 같은 걸음에 앞서 받은 경험치까지 든 세이브를 읽는다
 */
function withExpBar(e: BattleEvent): BattleEvent {
  if (e.kind !== 'switch' || e.actor.side !== 'p1') return e
  const at = expBarOf(e.actor.name)
  return at === null ? e : { ...e, expProgress: at }
}

/** 그 키의 경험치 막대 (0~1). 우리 파티가 아니거나 종족표가 없으면 null */
function expBarOf(key: string): number | null {
  if (ownerOfKey(key) !== 'player' || speciesTable === null) return null
  const party = rentalParty ?? useSaveStore.getState().party
  const mon = party.find((_, i) => partyKey(i) === key)
  if (!mon || mon.isEgg) return null
  return levelProgress(speciesTable.of(mon).growthRate, mon.exp)
}

/**
 * 뱃지 수마다의 배수 (`BattleSystem_CalcMoneyPenalty`의 `badgeMul`). 0개부터 8개까지 아홉 칸이다
 */
const PENALTY_MUL = [2, 4, 6, 9, 12, 16, 20, 25, 30] as const

/**
 * 진 판에 잃는 돈 (`BattleSystem_CalcMoneyPenalty`).
 *
 * `파티 최고 레벨 × 4 × 뱃지 배수`이고 가진 돈보다 많이 잃지 않는다. 최고 레벨은 알을 빼고
 * 세며 1에서 시작한다 (`Party_GetMaxLevel`)
 */
export function moneyPenalty(
  party: readonly Pick<PokemonInstance, 'species' | 'isEgg' | 'level'>[], badges: number, money: number,
): number {
  let top = 1
  for (const mon of party) if (mon.species > 0 && !mon.isEgg && mon.level > top) top = mon.level
  const mul = PENALTY_MUL[Math.min(badgeCount(badges), PENALTY_MUL.length - 1)]!
  return Math.max(0, Math.min(money, top * 4 * mul))
}

/**
 * 진 판의 돈을 리포트에서 뺀다 (`TrainerInfo_TakeMoney`). 뺀 값을 돌려준다.
 *
 * 프런티어는 `PayPrizeMoney`까지 안 간다(`subscript_battle_lost.s` _068). 잡는 법 강습은
 * 동료의 판이라 리포트를 안 건드린다
 */
function payPenalty(state: BattleState): number {
  if (state.kind === 'factory' || state.kind === 'safari' || tutorialAlly !== null) return 0
  const save = useSaveStore.getState()
  const lost = moneyPenalty(save.party, save.badges, save.money)
  if (lost > 0) useSaveStore.setState({ money: save.money - lost })
  return lost
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
 * 지금 배틀이 서 있는 땅.
 *
 * 도롱마담 옷감이 이걸로 갈리고 (`burmyCloak`), 배틀이 열리는 순간의 땅
 * 이펙트도 이걸로 갈린다 (`engine/battle/encounterBurst`)
 */
export function battleTerrainNow(): TerrainId {
  return battleTerrain
}

/**
 * 도롱마담이 싸운 땅의 옷감을 입는다 (`BattleSystem_SetBurmyForm`).
 *
 * ⚠️ **나온 마리만 갈아입는다.** 원작이 `battleParticipantMask`로 거른다 —
 * 뒤에서 구경만 한 도롱마담은 그대로다
 */
function dressBurmy(party: readonly PokemonInstance[]): PokemonInstance[] {
  const cloak = burmyCloak(battleTerrain)
  return party.map((mon, i) =>
    mon.species === SPECIES_BURMY &&
    !mon.isEgg &&
    participants.has(partyKey(i)) &&
    mon.form !== cloak
      ? { ...mon, form: cloak }
      : mon,
  )
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
  // ⚠️ **프론티어 판은 도감에 안 적는다.** 원작이 그렇게 거른다 —
  // 빌린 마리로 만난 것은 내가 만난 것이 아니다
  if (rentalParty) return
  const save = useSaveStore.getState()
  for (const e of events) {
    if (e.kind === 'switch') {
      const at = roster[e.actor.name]
      if (!at) continue
      if (at.side === 'p2') {
        save.markSeen(at.species)
        // ⚠️ **안농은 글자까지 적는다** (`SetUnownForm`). 스물여섯을 다 본
        // 사람에게만 열리는 방이 있어서(PARITY §6.8) 이 기록이 곧 열쇠다
        if (at.species === SPECIES_UNOWN) save.markUnownForm(at.form)
      }
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

/** 지금 리포트의 주인. 원래 트레이너 판정이 이 넷을 다 본다 */
function myIdentity(): TrainerIdentity {
  const t = useSaveStore.getState().trainer
  return { ...playerTrainer(t), id: t.id, secretId: t.secretId }
}

/**
 * 쓰러진 상대 하나분의 경험치를 나눠 준다. 세이브를 바로 갱신한다.
 *
 * 받는 사람이 둘 갈래다 — **나갔던 마리**와 **학습장치를 든 마리**.
 * 학습장치가 하나라도 있으면 경험치가 반으로 갈려 한쪽은 나간 마리들이,
 * 다른 한쪽은 장치를 든 마리들이 나눠 갖는다 (`BtlCmd_CalcExpGain`)
 */
function grantRewards(
  state: BattleState,
  foeKey: string,
  controller: BattleController,
): { events: BattleEvent[]; grown: Map<string, Grown> } {
  const none = { events: [], grown: new Map<string, Grown>() }
  const table = speciesTable
  const foe = state.roster[foeKey]
  if (!table || !foe) return none

  // 쓰러진 마리는 4세대에서도 경험치를 못 받는다 — 나간 몫도 학습장치 몫도
  const down = new Set(
    controller
      .results('p1')
      .filter((r) => r.fainted)
      .map((r) => r.key),
  )
  // ⚠️ **팩토리는 한 점도 안 준다.** 레벨이 고정인 판이라 원작도 안 준다
  if (state.kind === 'factory') return none
  const party = [...useSaveStore.getState().party]
  const me = myIdentity()
  const hold = (mon: PokemonInstance): number =>
    mon.heldItem > 0 ? itemTable?.get(mon.heldItem).holdEffect ?? 0 : 0

  /** 받을 자격이 있는 파티 칸 — 나갔거나 학습장치를 들었고, 안 쓰러졌고, 알이 아니다 */
  const takers = party.flatMap((mon, i) => {
    const key = partyKey(i)
    if (mon.isEgg || mon.hp <= 0 || down.has(key)) return []
    const share = hold(mon) === HOLD_EFFECT_EXP_SHARE
    const went = participants.has(key)
    return went || share ? [{ index: i, key, share, went }] : []
  })
  // ⚠️ **인원은 `takers`가 아니라 원작의 두 셈이다.** 레벨 100도 나눌 인원에
  // 들어간다 — 자기는 한 점도 못 받으면서 남의 몫을 깎는다 (원작이 인원을 셀 때
  // 레벨을 안 본다). 여기서 걸러 내면 다 큰 마리를 데리고 다니는 것이 이득이 된다
  const foeSpecies = table.get(foe.species)
  const pool = expPool(
    foeSpecies.baseExp,
    foe.level,
    takers.filter((t) => t.went).length,
    takers.filter((t) => t.share).length,
  )

  const out: BattleEvent[] = []
  const grown = new Map<string, Grown>()
  for (const taker of takers) {
    const mon = party[taker.index]
    if (!mon) continue
    const species = table.of(mon)
    const effect = hold(mon)
    const gain = expFor(pool, {
      participant: taker.went,
      expShare: taker.share,
      luckyEgg: effect === HOLD_EFFECT_EXP_UP,
      trainerBattle: state.kind === 'trainer',
      traded: !isOriginalTrainer(mon, me),
    })
    const reward = applyReward(mon, table.of(mon), gain, evYieldOf(table.of(mon), {
      holdEffect: effect,
      itemPower: mon.heldItem > 0 ? itemTable?.get(mon.heldItem).effectParam ?? 0 : 0,
      pokerus: doublesEvs(mon),
    }))
    // 레벨업 기술은 **여기서 실제로 넣는다.** 배틀이 끝난 뒤로 미루면 다음
    // 상대를 새 기술 없이 맞이한다 — 원작은 오른 그 자리에서 배운다.
    //
    // 레벨마다 따로 든다 (`SEQ_GET_EXP_WAIT_LEVEL_UP_EFFECT` → `…_CHECK_LEARN_MOVE`). 원작은
    // 한 레벨씩 능력치를 다시 셈하고(`Pokemon_CalcStats`) 그 레벨의 기술을 묻고 나서야 다음
    // 레벨로 간다. 오르기 전 값은 그 앞 레벨의 값이고, 오른 뒤 값은 **받은 뒤의** 노력치로 셈한다
    let taught = reward.mon
    let before: Stats = statsOf(mon, species)
    const levels: LevelStep[] = []
    const learned: number[] = []
    const pending: number[] = []
    for (const up of reward.levelUps) {
      const after = statsOf({ ...reward.mon, level: up.level }, species)
      const step = learnMoves(taught, up.moves, ppOf)
      taught = step.mon
      levels.push({ level: up.level, before, after, learned: step.learned, pending: step.pending })
      learned.push(...step.learned)
      pending.push(...step.pending)
      before = after
    }
    party[taker.index] = taught
    if (reward.levelUps.length > 0) {
      leveledUp.add(taker.index)
      // 판도 새 레벨을 안다 — 안 그러면 다음 체력 줄이 옛 최대 HP로 덮는다 (`controller.levelUp`)
      const grew = controller.levelUp(taker.key, taught.level, before)
      if (grew !== null) grown.set(taker.key, { level: taught.level, maxHp: before.hp, grew })
    }
    // 한 점도 안 받은 마리는 줄을 안 낸다 — 레벨 100이 그렇다
    if (reward.gainedExp === 0 && learned.length === 0) continue
    out.push({
      kind: 'reward',
      key: taker.key,
      exp: reward.gainedExp,
      levels,
      learned,
      pending,
      // 막대는 그 레벨 안의 진행도다 — 받기 전과 다 받은 뒤 (`Task_UpdateExpGauge`)
      expFrom: levelProgress(species.growthRate, mon.exp),
      expTo: levelProgress(species.growthRate, taught.exp),
    })
  }
  useSaveStore.setState({ party })
  return { events: out, grown }
}

/** 트레이너를 이겼으면 상금을 준다. 이미 끝난 판에서 두 번 부르면 안 된다 */
function grantPrize(state: BattleState): BattleEvent[] {
  if (state.kind !== 'trainer' || !state.prize) return []
  const save = useSaveStore.getState()
  useSaveStore.setState({ money: Math.min(MAX_MONEY, save.money + state.prize) })
  return [{ kind: 'prize', money: state.prize }]
}

/**
 * 여는 등판의 차례를 원작 것으로 돌린다 — **상대가 먼저다.**
 *
 * sim은 첫 스텝에서 `|switch|`를 우리 쪽부터 내놓는데, 원작은 야생이면
 * 「앗! 야생 {0}가 튀어나왔다!」를 찍고 30프레임 뒤에 「가랏! {0}!」로 우리 공을
 * 던지고(`subscript_start_encounter.s` _000), 트레이너전이면
 * `PrintFirstSendOutMessage ENEMY` → 던지기 → `PrintFirstSendOutMessage PLAYER`
 * 차례다(_118). 그대로 두면 **우리 것이 먼저 서 있는 채로** 야생이 나타난다.
 *
 * ⚠️ **맨 앞의 등판 묶음만 건드린다.** 뒤엣것을 옮기면 사건 차례가 흐트러지고,
 * 재생기는 이미 틀어 버린 앞자리를 못 고친다 (`buildBeats` 머리말)
 *
 * **우리 쪽은 편이 먼저다** (PARITY §2.2b).
 * 편이 있는 판의 첫 등판 줄은 「{편}은 {편의 포켓몬}을 내보냈다! 가랏! {내
 * 포켓몬}!」이다 (`TrSentOutPokemon1GoPokemon2` · `battle_display.c`
 * `LoadLeadMonMessage`의 `BATTLE_TYPE_2vs2` 갈래 — 첫 칸이 편의 전투원이다).
 * 편 자리(`p1b`)가 앞에 와야 줄과 공이 같은 차례로 선다
 */
function leadOrder(events: readonly BattleEvent[]): BattleEvent[] {
  // ⚠️ **등판이 0번이 아니다.** 줄기는 `start`로 열린다 — 실측으로
  // `start | switch:p1a | switch:p2a | turn`이다. 0번부터 세면 이 함수가
  // 아무것도 안 하고 조용히 지나간다
  let from = 0
  while (from < events.length && events[from]!.kind !== 'switch') from++
  let to = from
  while (to < events.length && events[to]!.kind === 'switch') to++
  const lead = events.slice(from, to)
  const foe = lead.filter((e) => e.kind === 'switch' && e.actor.side === 'p2')
  const ours = lead.filter((e) => !foe.includes(e))
  const allyFirst = [
    ...ours.filter((e) => e.kind === 'switch' && ownerOfKey(e.actor.name) === 'partner'),
    ...ours.filter((e) => !(e.kind === 'switch' && ownerOfKey(e.actor.name) === 'partner')),
  ]
  if (foe.length === 0 && allyFirst.every((e, i) => e === ours[i])) return [...events]
  return [
    ...events.slice(0, from),
    ...foe,
    ...allyFirst,
    ...events.slice(to),
  ]
}

/**
 * 배틀을 여는 데 이만큼 걸리면 **무언가 잘못된 것이다** (ms).
 *
 * 정상값은 첫 판 0.4~0.8초이고 그 뒤는 캐시다 (PLAN §7.5.1). 이 값은 판정이
 * 아니라 **말해 주는 시한**이다 — 넘겨도 배틀을 접지 않는다. 늦게라도 열리면
 * 그대로 열린다
 */
const LOADING_TELL_MS = 20_000

/**
 * 화면에 띄우는 말 (`error` 칸 → `ui/battle/BattleScreen`).
 *
 * ⚠️ **진단 문장은 여기 안 든다.** 무엇을 기다리는지, 어느 트레이너의 파티가 비었는지,
 * 예외의 원문은 `console.error`에만 남긴다 — 그 말들은 우리 모듈 별명과 번호라 플레이어가
 * 읽을 말이 아니다. 화면에는 지금 무슨 일인지만 뜬다
 */
const SLOW_OPEN = '배틀을 여는 데 시간이 걸리고 있습니다'
const OPEN_FAILED = '배틀을 열지 못했습니다'

/**
 * 지금 **무엇을 기다리는가**. 화면에 적을 말이다.
 *
 * ⚠️ **오래 걸리는 것과 영영 안 오는 것을 밖에서 못 가른다.** `open()`의
 * `await`은 터지면 `catch`가 잡아 이유를 남기지만, **안 돌아오면** 아무 데도
 * 아무것도 안 남는다 — `phase`가 `'loading'`에 묶이고 배틀 화면은 「배틀
 * 준비 중…」인 채로 선다. 실측(파일럿 보고 2026-09-22): 「배틀 배경으로
 * 바뀌긴 했는데 BGM도 안 바뀌고 포켓몬들도 안 나오면서 그냥 멈췄다」가
 * 바로 그 모양이고, 콘솔에도 화면에도 단서가 한 줄도 없었다
 */
type Waiting = '규칙기' | '게임 자료' | '파티' | '심판'

/**
 * 명부 한 칸 중 **개체에서 바로 읽히는 몫** (`RosterEntry`).
 *
 * 볼은 0(적힌 것 없음)이면 비운다 — 무대가 몬스터볼로 떨어진다. 성별·색은 sim에 넣는 값과 같은
 * 셈이다 (`sim/session`의 `genderOf` · `isShiny`)
 */
function bodyEntry(
  mon: PokemonInstance, species: Species,
): Pick<RosterEntry, 'species' | 'form' | 'level' | 'ball' | 'gender' | 'shiny' | 'moves'> {
  return {
    species: mon.species,
    moves: mon.moves.map((s) => s.move).filter((m) => m > 0),
    form: mon.form,
    level: mon.level,
    ...(mon.ball > 0 ? { ball: mon.ball } : {}),
    gender: genderOf(mon.pid, species.genderRatio),
    shiny: isShiny(mon.pid, mon.otId, mon.otSecretId),
  }
}

/** 상대 쪽을 만드는 것. 야생 한 마리든 트레이너 여섯 마리든 모양은 같다 */
type BuildFoe = (ctx: { species: SpeciesTable; pp: (move: number) => number }) => SideSpec

/** `TRAINER_CLASS_RIVAL` (`generated/trainer_classes.txt`) */
const TRAINER_CLASS_RIVAL = 63

/**
 * 트레이너의 이름 (`Trainer_Encounter` · `trainer_data.c` 39).
 *
 * ⚠️ **라이벌 분류는 롬 이름이 아니라 세이브의 라이벌 이름이다** — 원작이
 * `MiscSaveBlock_RivalName`을 그대로 베낀다. 창기둥에서 편으로 서는 라이벌(607·619·620)도
 * 그렇다. 세이브에 이름이 비었으면(시험·옛 세이브) 롬 이름으로 떨어진다
 */
export function trainerNameOf(
  id: number, trainerClass: number, names: readonly (string | undefined)[], rivalName: string,
): string | null {
  if (trainerClass === TRAINER_CLASS_RIVAL && rivalName.trim() !== '') return rivalName
  return names[id] ?? null
}

/**
 * 한 쪽에 트레이너가 둘인 판의 나머지 (PARITY §2.2b).
 *
 * `foe2`는 상대 쪽 자리 b의 주인(`BATTLER_ENEMY_2`), `partner`는 우리 쪽 자리 b의
 * 주인(`BATTLER_PLAYER_2`)이다. AI 비트와 도구도 **사람마다 제 것**이다
 */
interface MultiSide {
  foe2?: BuildFoe
  ai2?: number
  items2?: ControllerItems
  partner?: BuildFoe
  partnerAi?: number
}

/**
 * 트레이너 대사 뱅크 (`TEXT_BANK_TRAINER_MESSAGES` · us 617). 이긴 뒤 상대가 하는
 * 말(`TRMSG_DEFEAT`)이 여기 있다 — 필드의 `PrintTrainerDialogue`와 같은 뱅크다
 */
const TRAINER_MESSAGE_BANK = 617

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
  /** 그 이름을 가른 두 조각. 롬의 두 칸짜리 줄이 이것을 받는다 */
  foeClass: string | null,
  foeTrainer: string | null,
  prize: number,
  buildFoe: BuildFoe,
  /** 트레이너 AI 비트. 안 주면 상대는 무작위로 둔다 — 야생이 그렇다 */
  aiFlags?: number,
  rules?: BattleRules,
  items?: ControllerItems,
  doubles = false,
  /**
   * 부르는 쪽이 **이미 자리를 잡았는가.**
   *
   * ⚠️ **왜 필요한가.** 이 함수의 첫 두 줄이 「비어 있으면 잡는다」인데, 그
   * 두 줄은 부르는 쪽이 `await`을 하나라도 지나온 뒤에야 돈다. 자료를 받는
   * 동안 `phase`가 `'off'`로 남으면 그 몇 프레임이 **필드에게는 배틀이 없는
   * 시간**이라, 필드가 그 사이에 새 스크립트를 시작한다
   * (`script/field.ts`의 `tryStartScripts` — 그 가드가 보는 것이 `phase`다).
   * 그래서 `startTrainer`는 자료보다 **먼저** 잡고 여기에 그때 받은 판 번호(`ticket`)를 준다.
   * null이면 여기서 잡는다
   */
  claimed: number | null = null,
  /** 트레이너가 넷인 판 · 편과 함께 만난 야생 둘 (PARITY §2.2b) */
  multi: MultiSide = {},
): Promise<void> {
  if (claimed === null && get().phase !== 'off') return
  set({
    phase: 'loading',
    sceneReady: false,
    kind,
    foeName,
    foeClass,
    foeTrainer,
    prize,
    view: null,
    truth: null,
    actions: [],
    party: [],
    canSpendTurn: false,
    doubles: false,
    atSlot: 0,
    pending: [],
    events: [],
    roster: {},
    outcome: null,
    error: null,
    shiftAsk: null,
    freeShift: false,
    played: [],
    penalty: 0,
    downKeys: [],
  })
  const mine = claimed ?? ++ticket
  /** 기다리는 사이에 닫혔는가 (`ticket`). 닫혔으면 손을 뗀다 */
  const stale = (): boolean => mine !== ticket

  /**
   * 안 돌아오는 `await`을 **말하게 한다** (`Waiting` 머리말).
   *
   * 시한을 넘겨도 배틀을 접지 않는다 — 늦게 열리면 그대로 열린다. 여기서 하는
   * 일은 화면과 콘솔에 **무엇을 기다리는 중인지** 적는 것뿐이다
   */
  let waiting: Waiting = '규칙기'
  const tell = setTimeout(() => {
    if (stale() || get().phase !== 'loading') return
    // ⚠️ **별명은 콘솔에만 간다.** `Waiting`은 우리 모듈을 부르는 말이라 화면에 뜨면 개발 문장이다.
    // 조사도 별명마다 갈리므로(`규칙기를`·`파티를`) 「기다리는 대상:」으로 피해 쓴다
    console.error(
      `배틀이 안 열린다 — 기다리는 대상: ${waiting} (${String(LOADING_TELL_MS / 1000)}초째)`)
    set({ error: SLOW_OPEN })
  }, LOADING_TELL_MS)

  try {
    // ⚠️ **표를 먼저 채운다.** sim의 데이터 폴더는 빌드에서 빠져 있고 종족값·
    // 위력은 사용자의 롬에서 온다 (`dex/provider.ts`). sim이 표를 한 번 읽으면
    // 그 결과를 캐시하므로, 비어 있는 채로 그 순간이 지나가면 그 뒤로 아무리
    // 채워도 종족을 하나도 모르는 심판이 된다
    const { primeBattleDex } = await import('../engine/battle/dex/provider')
    await primeBattleDex()
    if (stale()) return
    waiting = '게임 자료'
    const [{ BattleController }, species, moves, bank] = await Promise.all([
      import('../engine/battle/sim/controller'),
      loadSpecies(),
      loadMoves(),
      loadItems(),
    ])
    if (stale()) return
    waiting = '파티'
    const pp = (id: number) => moves.byId.get(id)?.pp ?? 5
    // ⚠️ **밟고 선 칸도 본다.** 원작 `CalcTerrain`이 그렇다 — 무대 고르기와
    // 같은 잣대이고(`arenaFor`), 도롱마담 옷감이 이 값에서 나온다
    const here =
      world.grid?.behaviorAtWorld(worldState.player.position.x, worldState.player.position.z) ??
      null
    battleTerrain = terrainOf(here, mapById(world.mapId)?.battleBg ?? -1)
    speciesTable = species
    itemTable = bank
    ppOf = pp
    participants = new Set()
    roamerMet = null

    const party = ensureParty(species, pp)
    const roster: Record<string, RosterEntry> = {}
    const team = party.map((mon, i) => {
      roster[partyKey(i)] = { side: 'p1', nickname: mon.nickname, ...bodyEntry(mon, species.of(mon)) }
      return ready(mon, species.of(mon), partyKey(i))
    })
    // ⚠️ **쓰러진 마리를 앞세우고 배틀을 열 수 없다.** 원작도 첫 번째
    // **의식이 있는** 마리를 내보낸다 (`BATTLECTX_SELECTED_PARTY_SLOT`).
    // sim은 팀의 0번을 그냥 세우므로 여기서 앞으로 당긴다 — 키가 같이
    // 따라가고 세이브 순서는 안 바뀐다 (`applyResults`가 키로 짝짓는다)
    const awake = team.findIndex((m) => m.mon.hp > 0)
    if (awake > 0) team.unshift(...team.splice(awake, 1))
    // ⚠️ **내가 두 자리를 다 채우는 더블은 둘째도 깨어 있는 마리다.** 원작은 자리
    // b에 「자리 a가 안 고른, 알이 아니고 체력이 남은 첫 마리」를 세운다
    // (`battle_main.c` 1163 — `i > BATTLER_ENEMY_1`이면 짝의 칸을 건너뛴다).
    // 그대로 두면 쓰러진 둘째 칸이 첫 등판에 선다. 편이 있으면 자리 b는 편의 것이다
    const both = (doubles || multi.foe2 !== undefined) && multi.partner === undefined
    if (both) {
      const next = team.findIndex((m, i) => i > 0 && m.mon.hp > 0 && !m.mon.isEgg)
      if (next > 1) team.splice(1, 0, ...team.splice(next, 1))
    }

    // 몇 판 싸웠는가 (PARITY §7.5). ⚠️ **프론티어 판은 안 센다** — 원작의
    // 기록도 시설 쪽에 따로 있다 (§9.3)
    if (kind !== 'factory' && tutorialAlly === null) {
      useSaveStore.setState((st) => ({
        records: addRecord(st.records,
          kind === 'wild' ? RECORD_WILD_BATTLES_FOUGHT : RECORD_TRAINER_BATTLES_FOUGHT, 1),
      }))
    }

    const foe = buildFoe({ species, pp })
    // 상대 쪽 두 파티와 편의 파티도 명부에 싣는다 — 키가 곧 주인이다
    // (`aftermath.ownerOfKey`). 편의 마리는 우리 쪽이라 「상대 」가 안 붙는다
    const foe2 = multi.foe2?.({ species, pp })
    const partner = multi.partner?.({ species, pp })
    for (const [side, list] of [
      ['p2', foe.team], ['p2', foe2?.team ?? []], ['p1', partner?.team ?? []],
    ] as const) {
      for (const m of list) {
        roster[m.key] = { side, nickname: null, ...bodyEntry(m.mon, m.species) }
      }
    }
    // 둘이 서는 판이면 더블이다 (`sim/session`이 같은 셈을 한다)
    const twoSided = doubles || foe2 !== undefined || partner !== undefined

    const trainer = useSaveStore.getState().trainer
    waiting = '심판'
    const { controller, step } = await BattleController.start({
      player: { name: tutorialAlly?.name || trainer.name || '나', team },
      foe,
      // 기술 칸에 남은 PP를 띄우려면 최대치를 알아야 한다. sim 값은 못 쓴다
      basePp: pp,
      // ⚠️ **지닌 도구가 배틀에 들어가는 자리다.** 안 넘기면 오랭열매도
      // 구애머리띠도 아무 일을 안 한다 (`sim/session`의 `item`)
      itemName: (id) => itemTable?.get(id).name,
      // 야생은 AI가 없다. 원작도 야생은 사실상 무작위로 둔다
      ...(aiFlags === undefined ? {} : { ai: { flags: aiFlags, moves } }),
      ...(rules?.noCrit === true ? { noCrit: true } : {}),
      ...(rules?.sureHit === true ? { sureHit: true } : {}),
      ...(rules?.roamer === true ? { roamer: true } : {}),
      // 수다의 확률은 페라페가 배운 말이 정한다 — 우리 쪽만 세이브의 녹음이다 (`engine/pokemon/chatotCry`)
      chatterOdds: [
        chatterChance(chatterActivation(decodeChatotCry(useSaveStore.getState().chatotCry))),
        chatterChance(0),
      ],
      // 자연의힘·비밀의힘·위장이 땅을 본다 (`dex/mechanics`)
      terrain: battleTerrain,
      ...(items ? { items } : {}),
      ...(twoSided ? { doubles: true } : {}),
      ...(foe2 ? { foe2 } : {}),
      ...(foe2 && multi.ai2 !== undefined ? { ai2: { flags: multi.ai2, moves } } : {}),
      ...(multi.items2 ? { items2: multi.items2 } : {}),
      ...(partner ? { partner } : {}),
      ...(partner && multi.partnerAi !== undefined ? { partnerAi: { flags: multi.partnerAi, moves } } : {}),
      // 시합규칙 「교체」는 트레이너전에만 뜻이 있다 — 야생은 다음 마리가 없다.
      // ⚠️ 더블에는 안 걸린다. 원작의 그 설정은 1대1 전용이다
      ...(kind === 'trainer' && !twoSided && useOptionsStore.getState().battleRule === 0
        ? { shift: true }
        : {}),
      // 남에게 받은 마리는 뱃지 수만큼만 말을 듣는다 (PARITY §2.18)
      obedience: { badges: useSaveStore.getState().badges, trainer: myIdentity() },
    })
    // 심판을 세우는 사이에 닫혔다 — 세운 것을 거두고 손을 뗀다
    if (stale()) { controller.destroy(); return }
    current = controller
    // 첫 등판도 참가자다. 여기서 안 담으면 첫 상대를 쓰러뜨려도 경험치가 안 간다
    // ⚠️ **배회의 첫 체력만 화면 쪽에서 고쳐 준다** (PARITY §6.3).
    //
    // sim 안의 값은 이미 맞다 (`syncVitals`). 그런데 등장 줄(`|switch|`)은
    // 상대가 자리에 들어서는 **그 순간** 만들어져서 우리가 값을 맞추기
    // 한 걸음 앞서 나간다 — 고치지 않으면 첫 타를 맞을 때까지 게이지만
    // 만피로 거짓말을 한다
    const met = roamerMet
    const events = leadOrder(
      met === null
        ? step.events.map(withExpBar)
        : step.events.map(withExpBar).map((e) =>
            e.kind === 'switch' && e.actor.side === 'p2'
              ? { ...e, condition: { ...e.condition, ...foeVitals(met, e.condition.maxHp) } }
              : e,
          ),
    )
    trackParticipants(events)
    trackDex(events, roster)
    set({
      phase: 'running',
      victorySong: null,
      // 늦게라도 열렸으면 하던 말은 지운다
      error: null,
      truth: events === step.events ? step.view : applyEvents(emptyView(twoSided), events),
      // 빈 무대에서 시작한다. 등판도 재생기가 한 박자씩 올린다
      view: emptyView(twoSided),
      events,
      doubles: twoSided,
      // 처음부터 쓰러져 있는 내 마리는 파티 공이 처음부터 꺼져 있다
      downKeys: team.filter((m) => m.mon.hp <= 0).map((m) => m.key),
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
    if (stale()) return
    set({
      phase: 'off',
      trainerId: null,
      trainerClass: null,
      error: OPEN_FAILED,
    })
  } finally {
    clearTimeout(tell)
  }
}

// ⚠️ **배틀 화면 마운트 스위치를 여기서 민다** (`sessionStore.battleScreen`).
//
// 전환 자리마다 손으로 켜고 끄면 언젠가 하나를 빠뜨리고, 그러면 배틀이 안 뜨거나
// 끝나고도 안 사라진다. `phase` 하나가 임자이므로 그것을 구독해서 따라가게 둔다.
// 이 모듈은 필드가 불러올 때 처음 들어오고, 배틀은 필드에서만 시작한다
useBattleStore.subscribe((now, before) => {
  // 배틀이 열리는 동안의 최장 프레임 (`engine/loop/frameStats`).
  //
  // ⚠️ **처음 한 번이 임자다** — `@pkmn/sim`이 그때 처음 들어오고(PLAN §7.5.1)
  // 무대·모델도 그 판에 처음 굽는다. 다음부터는 다 캐시라 값이 다른 것을 잰다
  if (now.phase === 'loading' && before.phase === 'off') frameStats.openSpan(SPAN.battle)
  else if (now.phase === 'running' && before.phase === 'loading') frameStats.closeSpan()

  const on = now.phase !== 'off'
  if (on !== (before.phase !== 'off')) {
    useSessionStore.getState().setBattleScreen(on)
    // 어느 갈래의 배틀인지도 문서에 적어 둔다 — 읽기 전용이고 `data-scene`과
    // 같은 자리다 (`app/sceneMark.ts`). `data-scene="battle"`만으로는 야생과
    // 트레이너를 밖에서 못 가른다
    markBattle(on ? now.kind : null)
  }
})
