// 스크립트가 바깥 세계에 부탁하는 것들 (DATA.md §2.10)
//
// 엔진(`engine/script`)은 React도 zustand도 모른다. 배틀 화면을 열고, 세이브의
// 파티를 세고, 트레이너 자료를 받는 일은 전부 여기서 이어 붙인다.
//
// 배틀 결과를 붙잡는 방식이 조금 특이하다. 배틀 스토어는 화면을 닫을 때
// `outcome`을 지우는데, 스크립트는 **닫힌 뒤에** 결과를 묻는다. 그래서 결과가
// 정해지는 순간 여기서 따로 받아 둔다.
import {
  loadDialogueBank, loadItemNames, loadItems, loadLabels, loadLocationNames, loadMarts,
  loadMoveNames, loadNpcTrades, loadSpecies, loadSpeciesNames, loadMoves, loadTrainerClasses,
  loadTrainerNames, loadTrainers,
} from '../data/gameData'
import type { NpcTrades } from '../data/schema'
import { UI_BANK } from '../data/uiText'
import type { DataLocale } from '../data/gameData'
import {
  createWild, fillPp, genderOf, natureOf, PARTY_MAX, setExp, statsOf,
  type PokemonInstance,
} from '../engine/pokemon/instance'
import { canFit, quantity } from '../engine/bag/bag'
import { commonStock, specialtyStock } from '../engine/bag/mart'
import { fieldMoveFromMenu, fieldScripts, resetStepFeatureTile } from '../engine/script/field'
import { cameraSystem } from '../engine/actor/camera'
import { setOnCyclingRoad } from '../engine/actor/bike'
import { FIELD_MOVES } from '../engine/script/fieldMoves'
import { BOX_MODE, countAll, freeSlots } from '../engine/pokemon/boxes'
import { music } from '../engine/audio/music'
import { SFX } from '../engine/audio/sfx'
import { fieldBgm } from '../engine/audio/songs'
import { timeOfDayForHour } from '../engine/map/timeOfDay'
import { isSoothing } from '../engine/pokemon/friendship'
import {
  mapById, setWarpDestination, setWarpEventPos, world as mapWorld,
} from '../engine/map/world'
import { LocationEvent } from '../engine/world/journal'
import { journalGiven, journalGotItem, journalPlain, journalUsedMove } from './journal'
import { poketchEnable, poketchEnabled, poketchHasApp, poketchRegister, poketchShow } from './poketch'
import { relearnableMoves } from '../engine/pokemon/relearn'
import {
  distortionAddObject, distortionPlayerPos, distortionRemoveObject, distortionResetCamera,
} from './distortion'
import { usePreviewStore } from '../state/previewStore'
import {
  TURNBACK_WARP_COUNT, turnbackDestination, turnbackEntryWarp,
} from '../engine/world/turnbackCave'
import { entryNumber } from '../engine/world/hallOfFame'
import { addCoins, canAddCoins, subtractCoins } from '../engine/world/coins'
import { sizeFactor } from '../engine/world/sizeContest'
import { partyChoice } from '../ui/menu/partyChoice'
import { itemChoice } from '../ui/menu/itemChoice'
import { pushesLevel } from '../engine/battle/encounterLead'
import {
  honeyTreeLevel, honeyTreeOf, honeyTreeSpecies, honeyTreeStatus, isMunchlaxTree,
  slatherTree, TREE_STATUS, unslatherTree, type HoneyTreeState,
} from '../engine/world/honeyTree'
import { honeyShake } from './honeyTree'
import { SYSTEM_FLAG } from '../engine/script/commands'
import {
  initPlatformLift, liftSound, platformLiftBusy, platformLiftNotUsedWhenEnteredMap,
  triggerPlatformLift,
} from './platformLift'
import {
  initPastoriaGym, pastoriaBusy, pastoriaSound, pressPastoriaButton,
} from './pastoriaGym'
import {
  initSunyshoreGym, pressSunyshoreButton, sunyshoreBusy, sunyshoreSound,
} from './sunyshoreGym'
import { SUNYSHORE_GYM_MAPS, type SunyshoreButton } from '../engine/world/sunyshoreGym'
import { advanceEternaClock, eternaBusy, eternaSound, initEternaGym } from './eternaGym'
import { canalaveArrived, canalaveSound, canalaveStepped, initCanalaveGym } from './canalaveGym'
import {
  deactivateLakeGuardianUnits, initLakeGuardianUnits, lakeGuardianSound,
  lakeGuardianUnitsSettled,
} from './lakeGuardianUnits'
import { hitVeilstoneBag, initVeilstoneGym, veilstoneSound } from './veilstoneGym'
import { initHearthomeGym } from './hearthomeGym'

/**
 * 지금 선 칸에 놓인 소품의 모델 번호 (`FieldSystem_FindCollidingLoadedMapProp*`).
 *
 * 물가시티 체육관의 단추가 이걸로 갈린다 — 스크립트는 색깔마다 나뉘어 있는데
 * 명령은 하나라, 어느 단추인지는 **밟은 칸**이 말한다. 없으면 −1이다
 */
function propModelUnderPlayer(): number {
  const grid = mapWorld.grid
  if (grid === null) return -1
  const p = worldState.player.position
  return grid.propModelAt(Math.floor(p.x), Math.floor(p.z))
}

/** 지금 선 맵의 꿀 나무. 나무가 없는 맵이면 null */
function honeyTreeHere(): HoneyTreeState | null {
  const at = honeyTreeOf(mapWorld.mapId)
  return at < 0 ? null : useSaveStore.getState().honeyTrees.trees[at] ?? null
}

/** 그 파티 자리가 되살릴 수 있는 기술 (`MoveReminderData_GetMoves`) */
function relearnFor(slot: number): number[] {
  const mon = useSaveStore.getState().party[slot]
  const table = speciesTable
  if (!mon || !table) return []
  return relearnableMoves(
    table.of(mon).learnset, mon.level, mon.moves.map((m) => m.move),
  )
}

/**
 * 포켓치 앱 이름 25개. 스크립트가 대사에 끼워 넣는다 (`BufferPoketchAppName`).
 *
 * 필드가 뜰 때 한 번 받아 둔다 — 스크립트 명령은 동기라 그 자리에서 못 기다린다
 */
let poketchAppNames: readonly string[] = []
export function setPoketchAppNames(names: readonly string[]): void { poketchAppNames = names }

/**
 * 스크립트가 여는 노트 일 중 **맵 번호를 곁값으로 받는** 것들
 * (`JournalEntry_CreateEventUsedMove`). 나머지는 곁값을 안 본다
 */
const AT_MAP_EVENTS = new Set<number>([
  LocationEvent.USED_CUT, LocationEvent.USED_SURF, LocationEvent.USED_STRENGTH,
  LocationEvent.USED_DEFOG, LocationEvent.USED_ROCK_SMASH, LocationEvent.USED_WATERFALL,
  LocationEvent.USED_ROCK_CLIMB,
])
import {
  caughtAt, eggFrom, MET_DAYCARE, metToday, SPECIAL_MET_BASE,
} from '../engine/pokemon/origin'
import { encounters } from '../engine/battle/encounterSystem'
import { activateRoamer } from './roamers'
import { computeStats } from '../engine/pokemon/stats'
import {
  changeForm, GIRATINA_ORIGIN, giratinaForm as giratinaFormOf, ITEM_GRISEOUS_ORB,
  SHAYMIN_LAND, SPECIES_GIRATINA, SPECIES_ROTOM, SPECIES_SHAYMIN, type FormTables,
} from '../engine/pokemon/form'
import { addTrophyMon, swarmMap, trophySpecies } from '../engine/world/daily'
import {
  compatibilityLevel, daycareCompatibility, daycarePrice, daycareState, EGG_LEVEL,
  emptySlot, makeEgg, MAX_LEVEL, type EggPlan,
} from '../engine/pokemon/breeding'
import { canLearnTm } from '../engine/bag/fieldUse'
import { useHatchStore } from '../state/hatchStore'
import { worldState } from '../state/worldState'
import { blackOut, healParty, loadHealTables, watchBlackOut } from './pokecenter'
import { useDoorVisualStore } from './doorVisualStore'
import { useBattleStore } from '../state/battleStore'
import { useCurrencyStore } from '../state/currencyStore'
import { useMenuStore } from '../state/menuStore'
import { playerTrainer, useSaveStore } from '../state/saveStore'
import { useSessionStore } from '../state/sessionStore'
import { naming as namingAnswer } from '../ui/menu/namingAnswer'
import type { ItemTable } from '../data/gameData'
import { FIRST_BERRY_ITEM } from '../engine/world/berryInit'
import { berryPatchServices } from './berryPatches'
import { safariServices } from './safari'
import type { FieldServices } from '../engine/script/world'
import type { MartTable, Trainer } from '../data/schema'

/** `TEXT_BANK_NPC_TRAINER_MESSAGES` — 트레이너 928명의 싸움 전후 대사 */
const TRAINER_MESSAGE_BANK = 617
/** `TEXT_BANK_BAG_POCKET_NAMES` — 주머니 8개 이름 */
const POCKET_NAME_BANK = 395
/** `TEXT_BANK_POKETCH_APP_NAMES` — 포켓치 앱 이름 25개 */
const POKETCH_APP_NAME_BANK = 457

/**
 * 자전거 곡 (`SEQ_BICYCLE`).
 *
 * ⚠️ **줄 번호로 세면 1206이 나오는데 틀린 값이다.** `generated/sdat.txt`에
 * `= 값`으로 자리를 다시 잡는 줄이 섞여 있어서 열거형으로 풀어야 한다 —
 * 기라티나 곡이 1201로 떨어지는 것과 같은 계산이다 (`audio/songs`)
 */
const SEQ_BICYCLE = 1152


/** 지금 배틀의 결과. 스크립트가 물어볼 때까지 들고 있는다 */
let battleResult: 'win' | 'loss' | null = null
/**
 * 원작의 결과 마스크 (`BATTLE_RESULT_*`).
 *
 * ⚠️ **겹친 값이 있다** — 도망은 `CAPTURED_MON | WIN`이고 상대 도망은
 * `CAPTURED_MON | LOSE`다. 그래서 "잡았다"와 "달아났다"를 같은 비트로 세면
 * 안 되고, 스크립트는 이 수 전체를 `GoToIfEq`로 견준다
 */
let battleMask: number | null = null
/** 마지막으로 튼 팡파르. `WaitFanfare`가 이것이 끝나기를 기다린다 */
let fanfare: number | null = null
/** 배틀을 스크립트가 열었는가. 야생 조우까지 여기 걸리면 안 된다 */
let waiting = false

let trainers: { get(id: number): Trainer } | null = null
let trainerMessages: string[] = []
let items: ItemTable | null = null
let itemNames: string[] = []
let speciesNames: string[] = []
let moveNames: string[] = []
/** 주머니 이름 8개 (`TEXT_BANK_BAG_POCKET_NAMES`) */
let pocketNames: string[] = []
let marts: MartTable | null = null
/** 타입 열일곱 (`labels.*.json`) */
let typeNames: readonly string[] = []
/** 성격 25 (`TEXT_BANK_NATURE_NAMES`) */
let natureNames: readonly string[] = []
/** 나무열매 64 (`TEXT_BANK_BERRY_NAMES`). 차례가 도구 번호 − `FIRST_BERRY_ITEM`이다 */
let berryNames: readonly string[] = []
/** 트레이너 이름 928 · 분류 105 */
let trainerNames: readonly string[] = []
let trainerClassNames: readonly string[] = []
/** 지역명 (`names/locations.*.json`) */
let locationNames: readonly string[] = []
/**
 * 조사가 붙은 판과 복수형.
 *
 * ⚠️ **미국 롬에만 있는 표다.** 한국·일본 판에서는 이 넷이 끝까지 빈 배열로
 * 남고 `orPlain`이 맨 이름표로 떨어뜨린다 — 없는 것을 지어내지 않는다
 */
let itemArticleNames: readonly string[] = []
let itemPluralNames: readonly string[] = []
let speciesArticleNames: readonly string[] = []
let trainerClassArticleNames: readonly string[] = []

/** 조사 판이 없으면 맨 이름표로 (`ko`·`ja`) */
const orPlain = (fancy: readonly string[], plain: readonly string[], at: number): string =>
  fancy[at] ?? plain[at] ?? ''

/** 자료가 아직 안 왔으면 도구 주머니로 본다 — 번호 0이 그 자리다 */
const pocketOf = (item: number): number => items?.all[item]?.pocket ?? 0

/** `constants/items.h`의 `ITEM_TM01`. 여기서 100칸이 기술머신·비전머신이다 */
const ITEM_TM01 = 328
const TMHM_COUNT = 100

/** 기술머신이 가르치는 기술 (`Item_MoveForTMHM`). 머신이 아니면 0 */
function tmhmMove(item: number): number {
  const at = item - ITEM_TM01
  if (at < 0 || at >= TMHM_COUNT) return 0
  return items?.tmMoves[at] ?? 0
}

/**
 * NPC 교환 넷과 지금 말을 걸어 둔 번호 (PARITY §10).
 *
 * ⚠️ **`InitNPCTrade`와 `FinishNPCTrade`가 짝이다.** 원작이 힙에 한 벌을
 * 잡았다 놓는 것을 우리는 번호 하나로 대신한다 — 끝나고 안 지우면 다음에
 * 다른 사람에게 말을 걸어도 앞의 교환이 뜬다
 */
let npcTrades: NpcTrades['trades'] | null = null
let npcTradeId: number | null = null

const npcTradeRecord = (): NpcTrades['trades'][number] | null =>
  (npcTradeId === null ? null : npcTrades?.[npcTradeId] ?? null)

/** 종족값·기술 표. 개체를 만들려면 둘 다 있어야 한다 */
let speciesTable: Awaited<ReturnType<typeof loadSpecies>> | null = null
let moveTable: Awaited<ReturnType<typeof loadMoves>> | null = null

/**
 * 스크립트가 주는 한 마리 (`Pokemon_GiveMonFromScript`).
 *
 * ⚠️ **표가 안 왔으면 안 준다.** 반쯤 만들어진 개체를 파티에 넣느니 실패를
 * 돌려주는 편이 낫다 — 스크립트는 그것을 "자리가 없다"로 읽고 다시 말을 건다.
 *
 * 원작은 개체값을 굴리고(`INIT_IVS_RANDOM`) 몬스터볼로 잡은 것으로 적는다.
 * 우리 `createWild`가 같은 일을 하는데 **가진 도구까지 굴린다** — 그건 야생
 * 규칙이라 스크립트가 준 것으로 덮어쓴다
 */
function giveMon(species: number, level: number, heldItem: number): boolean {
  const table = speciesTable
  const moves = moveTable
  if (!table || !moves) return false
  const save = useSaveStore.getState()
  if (save.party.length >= PARTY_MAX) return false

  const info = table.get(species)
  const mon = fillPp(createWild({
    species: info, level, rng: Math.random,
    otId: save.trainer.id, otSecretId: save.trainer.secretId,
  }), (id) => moves.byId.get(id)?.pp ?? 5)
  save.addToParty({
    ...mon,
    heldItem,
    // `Pokemon_SetCatchData(..., ITEM_POKE_BALL, ...)` — 받은 것은 몬스터볼이다
    ball: ITEM_POKE_BALL,
    hp: statsOf(mon, info).hp,
    // 받은 것도 잡은 것과 같은 갈래다 (`sel = 0`). 자리는 지금 서 있는 곳의
    // 지역명 번호 — 연구소에서 받은 파트너는 "무성시티에서 만났다"가 된다
    origin: caughtAt(playerTrainer(save.trainer), hereLabel(), level, metToday()),
  })
  return true
}

/**
 * 조건에 맞는 첫 파티 자리 (`scrcmd_party.c`의 `FindPartySlotWith*`).
 *
 * ⚠️ **알은 건너뛴다.** 넷 다 `MON_DATA_IS_EGG`를 먼저 보고 넘어간다 —
 * 안 그러면 알이 아는 기술로 자리가 걸려서 알에게 기술을 가르치려 든다
 */
function findSlot(
  match: (mon: PokemonInstance) => boolean, none = 0xff,
): number {
  const party = useSaveStore.getState().party
  for (let slot = 0; slot < party.length; slot++) {
    const mon = party[slot]!
    if (mon.isEgg) continue
    if (match(mon)) return slot
  }
  return none
}

/** `MAX_PARTY_SIZE` — `FindPartySlotWithMove`만 이 값으로 「없다」를 말한다 */
const MAX_PARTY_SIZE = 6

/** 박스 한 칸의 마리 수 (`MAX_MONS_PER_BOX`) */
const BOX_SIZE = 30

/**
 * 기술 한 칸을 비우거나 갈아 끼운다 (`Pokemon_ClearMoveSlot`·`_ResetMoveSlot`).
 *
 * `move`가 null이면 비운다. 갈아 끼울 때 PP는 **새 기술의 최대치**로 돌아가고
 * 포인트업도 0이 된다 — 원작이 그렇다
 */
function editMoves(slot: number, moveSlot: number, move: number | null): void {
  const party = useSaveStore.getState().party
  const mon = party[slot]
  if (!mon || moveSlot < 0 || moveSlot >= 4) return
  const moves = [...mon.moves]
  if (move === null) moves.splice(moveSlot, 1)
  else moves[moveSlot] = { move, pp: moveTable?.byId.get(move)?.pp ?? 5, ppUps: 0 }
  const next = [...party]
  next[slot] = { ...mon, moves }
  useSaveStore.setState({ party: next })
}

/** 지금 서 있는 맵의 지역명 번호 (`MapHeader_GetMapLabelTextID`) */
function hereLabel(): number {
  return mapById(useSessionStore.getState().mapId)?.label ?? 0
}

/** `generated/items.txt` — 스크립트가 준 포켓몬이 들어 있는 볼 */
const ITEM_POKE_BALL = 4

// ── 폼 (PARITY §3.4) ─────────────────────────────────────────────────────────

/** 표가 있어야 능력치를 다시 셀 수 있다. 없으면 폼을 안 건드린다 */
function formTables(): FormTables | null {
  const table = speciesTable
  const moves = moveTable
  if (!table || !moves) return null
  return {
    maxHp: (mon) => statsOf(mon, table.of(mon)).hp,
    maxPp: (move) => moves.byId.get(move)?.pp ?? 5,
  }
}

/**
 * 파티를 훑으며 폼을 다시 정한다.
 *
 * `want`가 null을 주면 그 마리는 그대로 둔다. 실제 갈아입기는 전부
 * `changeForm`을 지나가므로 능력치와 로토무 기술칸이 여기서 어긋날 일이 없다
 */
function forEachParty(
  want: (mon: PokemonInstance) => number | null, moveSlot = 0,
): boolean {
  const tables = formTables()
  if (!tables) return false
  const party = useSaveStore.getState().party
  let touched = false
  const next = party.map((mon) => {
    const to = want(mon)
    if (to === null) return mon
    const grown = changeForm(mon, to, tables, moveSlot)
    if (grown !== mon) touched = true
    return grown
  })
  if (touched) useSaveStore.setState({ party: next })
  return touched
}

/** 한 자리의 폼을 바꾼다 */
function reshape(slot: number, want: (mon: PokemonInstance) => number, moveSlot: number): void {
  forEachParty((mon) => (useSaveStore.getState().party.indexOf(mon) === slot ? want(mon) : null),
    moveSlot)
}

/**
 * 폼이 바뀐 마리를 되돌린다 (`ScrCmd_TryRevertPartyPokemonForms`).
 *
 * ⚠️ **백금옥을 먼저 가방에 넣어 본다.** 자리가 없으면 **아무것도 안 하고**
 * 0xFF를 돌려준다 — 반쯤 되돌려 놓고 구슬만 사라지면 안 된다
 */
function revertForms(slot?: number): number {
  const save = useSaveStore.getState()
  const inScope = (i: number): boolean => slot === undefined || i === slot
  const orbs = save.party.filter((m, i) => inScope(i) && m.heldItem === ITEM_GRISEOUS_ORB).length
  if (orbs > 0) {
    const pocket = items?.all[ITEM_GRISEOUS_ORB]?.pocket ?? 0
    if (!save.addItem(pocket, ITEM_GRISEOUS_ORB, orbs)) return 0xff
    useSaveStore.setState({
      party: useSaveStore.getState().party.map((m, i) => (
        inScope(i) && m.heldItem === ITEM_GRISEOUS_ORB ? { ...m, heldItem: 0 } : m
      )),
    })
  }
  const at = useSaveStore.getState().party
  forEachParty((mon) => {
    if (!inScope(at.indexOf(mon)) || mon.form === 0) return null
    if (mon.species === SPECIES_GIRATINA) return giratinaFormOf(mon.heldItem)
    if (mon.species === SPECIES_ROTOM) return 0
    if (mon.species === SPECIES_SHAYMIN) return SHAYMIN_LAND
    return null
  })
  return 0
}

/**
 * 리포트 안의 로토무가 가진 폼 비트 (`SaveData_GetRotomFormsInSave`).
 *
 * ⚠️ **파티만 세면 안 된다.** 박스에 넣어 둔 로토무도 세고 육성가에 맡긴
 * 로토무도 센다 — 가전 방의 스크립트가 이 비트로 「이미 해 본 가전」을 가린다
 */
function rotomForms(): number {
  const save = useSaveStore.getState()
  let bits = 0
  const count = (mon: PokemonInstance | null): void => {
    if (mon && mon.species === SPECIES_ROTOM && !mon.isEgg) bits |= 1 << mon.form
  }
  for (const mon of save.party) count(mon)
  for (const box of save.boxes) for (const mon of box) count(mon)
  for (const kept of save.daycare.slots) count(kept?.mon ?? null)
  return bits
}

/**
 * 알 하나를 만들어 파티에 넣는다 (`Egg_CreateEgg`).
 *
 * 육성가에서 받는 알도, 선물로 받는 알도 이 길로 온다. 레벨 1에 **남은 부화
 * 걸음이 친밀도 칸에** 들어간다 — 원작이 칸을 하나로 쓴다
 */
function makeEggMon(
  species: number, plan: EggPlan | null, from: number = MET_DAYCARE,
): PokemonInstance | null {
  const table = speciesTable
  const moves = moveTable
  if (!table || !moves) return null
  const save = useSaveStore.getState()
  if (save.party.length >= PARTY_MAX) return null

  const info = table.get(species)
  const ppOf = (id: number): number => moves.byId.get(id)?.pp ?? 5
  const base = fillPp(createWild({
    species: info, level: EGG_LEVEL, rng: Math.random,
    otId: save.trainer.id, otSecretId: save.trainer.secretId,
  }), ppOf)
  return {
    ...base,
    // 육성가에서 온 알은 PID·개체값·기술이 이미 정해져 있다
    pid: plan?.pid ?? base.pid,
    ivs: plan?.ivs ?? base.ivs,
    moves: plan?.moves ?? base.moves,
    heldItem: 0,
    ball: ITEM_POKE_BALL,
    isEgg: true,
    friendship: plan?.eggCycles ?? info.eggCycles,
    hp: statsOf(base, info).hp,
    nickname: null,
    // 알을 받았다 (`sel = 3`). **만난 자리는 비운다** — 아직 안 만났고,
    // 깨는 자리에서 `hatchedAt`이 채운다. 육성가 알이든 선물 알이든
    // 원작이 같은 자리(`SpecialMetLoc_GetId(1, 0)`)를 적는다
    origin: eggFrom(playerTrainer(save.trainer), from, metToday()),
  }
}

/**
 * 배틀이 어떻게 끝났는가 → 원작의 `BATTLE_RESULT_*` (`constants/battle.h`).
 *
 * 이겼다 1 · 졌다 2 · 잡았다 4. 나머지 셋은 그 셋을 겹친 값이다 —
 * 비긴 판 3(승|패) · 내가 달아난 판 5(포획|승) · 상대가 달아난 판 6(포획|패)
 */
const BATTLE_RESULT_OF: Record<string, number> = {
  win: 1, loss: 2, caught: 4, fled: 5, foeFled: 6,
}

/** `constants/string.h`의 `MON_NAME_LEN`. 우리가 정한 상한이 아니다 */
const MON_NAME_LEN = 10

/**
 * 배틀 스토어를 지켜본다.
 *
 * `outcome`이 정해지는 순간을 잡는다 — 화면이 닫히면 지워지기 때문이다
 */
function watchBattle(): () => void {
  return useBattleStore.subscribe((state, prev) => {
    if (!waiting) return
    if (state.outcome !== null && prev.outcome === null) {
      battleResult = state.outcome === 'win' ? 'win' : 'loss'
      battleMask = BATTLE_RESULT_OF[state.outcome]
    }
    // 화면이 닫혀야 스크립트를 놓아준다. 결과만 나오고 화면이 떠 있으면
    // 대사창이 배틀 위에 겹친다
    if (state.phase === 'off' && prev.phase !== 'off') waiting = false
  })
}

/** 스크립트가 쓰는 바깥 세계를 붙인다. 정리 함수를 돌려준다 */
export function installFieldServices(locale: DataLocale = 'ko'): () => void {
  void loadTrainers().then((table) => { trainers = table }).catch(() => { /* 이름만 빈다 */ })
  void loadDialogueBank(locale, TRAINER_MESSAGE_BANK)
    .then((bank) => { trainerMessages = bank })
    .catch(() => { /* 대사만 빈다 */ })
  void loadItems().then((table) => { items = table }).catch(() => { /* 주머니가 0으로 뭉친다 */ })
  void loadItemNames(locale).then((names) => { itemNames = names }).catch(() => { /* 이름만 빈다 */ })
  void loadMarts().then((table) => { marts = table }).catch(() => { /* 상점이 빈 채로 뜬다 */ })
  // NPC 교환 넷. 못 받으면 `species()`가 0이라 스크립트가 늘 "그건 아닌데"로 간다 —
  // 조용히 아무 종이나 주는 것보다 안 일어나는 편이 낫다 (PARITY §10)
  void loadNpcTrades().then((table) => { npcTrades = table.trades })
    .catch(() => { /* 교환이 안 열린다 */ })
  // 글 칸을 채우는 이름표들. 없으면 대사에 빈칸이 남는다
  void loadSpeciesNames(locale).then((names) => { speciesNames = names }).catch(() => { /* 이름만 빈다 */ })
  void loadMoveNames(locale).then((names) => { moveNames = names }).catch(() => { /* 이름만 빈다 */ })
  void loadDialogueBank(locale, POCKET_NAME_BANK)
    .then((bank) => { pocketNames = [...bank] })
    .catch(() => { /* 주머니 이름만 빈다 */ })
  void loadLabels(locale).then((l) => { typeNames = l.types }).catch(() => { /* 타입 이름만 빈다 */ })
  void loadTrainerNames(locale).then((n) => { trainerNames = n }).catch(() => { /* 이름만 빈다 */ })
  void loadTrainerClasses(locale).then((n) => { trainerClassNames = n }).catch(() => { /* 이름만 빈다 */ })
  void loadLocationNames(locale).then((n) => { locationNames = n }).catch(() => { /* 지역명만 빈다 */ })
  void loadDialogueBank(locale, UI_BANK.natureNames)
    .then((bank) => { natureNames = bank })
    .catch(() => { /* 성격 이름만 빈다 */ })
  void loadDialogueBank(locale, UI_BANK.berryNames)
    .then((bank) => { berryNames = bank })
    .catch(() => { /* 열매 이름만 빈다 */ })
  // 아래 넷은 미국 롬에만 있다. 못 받는 것이 정상이라 조용히 넘긴다
  void loadDialogueBank(locale, UI_BANK.itemNamesWithArticles)
    .then((bank) => { itemArticleNames = bank }).catch(() => { /* 맨 이름표로 */ })
  void loadDialogueBank(locale, UI_BANK.itemNamesPlural)
    .then((bank) => { itemPluralNames = bank }).catch(() => { /* 맨 이름표로 */ })
  void loadDialogueBank(locale, UI_BANK.speciesNamesWithArticles)
    .then((bank) => { speciesArticleNames = bank }).catch(() => { /* 맨 이름표로 */ })
  void loadDialogueBank(locale, UI_BANK.trainerClassNamesWithArticles)
    .then((bank) => { trainerClassArticleNames = bank }).catch(() => { /* 맨 이름표로 */ })
  // 회복량은 종족값 표가 있어야 나온다. 전멸은 첫 배틀부터 날 수 있으므로 미리 받는다
  loadHealTables()
  // 스크립트가 주는 포켓몬도 같은 표로 만든다. 못 받으면 `GivePokemon`이
  // 실패를 돌려준다 — 반쯤 만들어진 개체를 파티에 넣지 않는다
  void loadSpecies().then((table) => { speciesTable = table }).catch(() => { /* 못 준다 */ })
  void loadMoves().then((table) => { moveTable = table }).catch(() => { /* 못 준다 */ })
  // 포켓치 앱 이름 25개. 스크립트가 대사에 끼워 넣는다 (PARITY §7.3)
  void loadDialogueBank(locale, POKETCH_APP_NAME_BANK)
    .then((bank) => { setPoketchAppNames(bank) })
    .catch(() => { /* 이름만 빈다 */ })

  // 장치가 내는 소리. 엔진 쪽 모듈이 오디오를 직접 안 부르므로 여기서 꽂는다
  liftSound.play = (seq) => { void music.playEffect(seq) }
  liftSound.stop = (seq) => { music.stopEffect(seq) }
  pastoriaSound.play = (seq) => { void music.playEffect(seq) }
  pastoriaSound.stop = (seq) => { music.stopEffect(seq) }
  sunyshoreSound.play = (seq) => { void music.playEffect(seq) }
  sunyshoreSound.stop = (seq) => { music.stopEffect(seq) }
  eternaSound.play = (seq) => { void music.playEffect(seq) }
  canalaveSound.play = (seq) => { void music.playEffect(seq) }
  canalaveSound.stop = (seq) => { music.stopEffect(seq) }
  veilstoneSound.play = (seq) => { void music.playEffect(seq) }
  veilstoneSound.stop = (seq) => { music.stopEffect(seq) }
  lakeGuardianSound.play = (seq) => { void music.playEffect(seq) }
  // 판에서 내린 칸은 「방금 밟았다」로 친다 — 안 그러면 그 자리에서 다시 탄다
  canalaveArrived.settle = () => { resetStepFeatureTile() }

  // 세계가 먼저 만들어져 있을 수 있다. 그 자리에도 넣어 준다
  if (fieldScripts.world !== null) fieldScripts.world.services = services
  fieldScripts.services = services
  const stop = watchBattle()
  const stopBlackOut = watchBlackOut()
  return () => {
    stop()
    stopBlackOut()
    fieldScripts.services = {}
  }
}

const services: FieldServices = {
  startTrainerBattle(trainerID: number): void {
    battleResult = null
    battleMask = null
    waiting = true
    void useBattleStore.getState().startTrainer(trainerID).catch((e: unknown) => {
      // 배틀을 못 열면 스크립트가 영영 기다린다. 진 것으로 놓아준다
      battleResult = 'loss'
      battleMask = 2
      waiting = false
      // ⚠️ **조용히 넘기면 안 된다.** 한때 여기서 소리 없이 삼켰더니 브라우저
      // 실측에서 트레이너전이 **한 번도 안 열리는데** 이야기는 그냥 지나갔다 —
      // 배틀이 없었다는 것을 아무도 몰랐다. 못 여는 것은 이상한 일이므로 남긴다
      console.error(`트레이너 #${String(trainerID)} 배틀을 못 열었다:`,
        e instanceof Error ? e.message : String(e))
    })
  },

  battleResult(): 'win' | 'loss' | null {
    return waiting ? null : battleResult
  },

  battleMask(): number | null {
    return waiting ? null : battleMask
  },

  trainer(id: number): { double: boolean, msg: Record<string, number>, class: number } | null {
    const found = trainers?.get(id)
    return found === undefined
      ? null
      : { double: found.double, msg: found.msg, class: found.class }
  },

  trainerMessage(index: number): string {
    return trainerMessages[index] ?? ''
  },

  aliveMons(): number {
    return useSaveStore.getState().party.filter((mon) => mon.hp > 0).length
  },

  /**
   * 파티 조회 (`scrcmd_party.c`).
   *
   * ⚠️ **알은 안 센다.** 원작이 종을 물을 때마다 `MON_DATA_IS_EGG`를 함께 보고
   * 알이면 0을 돌려준다. 우리 개체에 알 표시가 아직 없어서 그 갈래는 늘 거짓이다 —
   * 알을 실을 때 이 세 곳(`species`·`hasSpecies`·`aliveExcept`)에 조건이 붙는다
   */
  party: {
    count: () => useSaveStore.getState().party.length,
    species: (slot) => useSaveStore.getState().party[slot]?.species ?? 0,
    nickname: (slot) => {
      const mon = useSaveStore.getState().party[slot]
      return mon?.nickname ?? speciesNames[mon?.species ?? 0] ?? ''
    },
    hasSpecies: (species) => useSaveStore.getState().party.some((m) => m.species === species),
    aliveExcept: (slot) =>
      useSaveStore.getState().party.filter((m, i) => i !== slot && m.hp > 0).length,
    give: giveMon,
    level: (slot) => useSaveStore.getState().party[slot]?.level ?? 0,
    // 성격은 개체값에서 나온다 (`Pokemon_GetNature` = PID % 25). 빈 자리는
    // 원작이 `NATURE_HARDY`(0)를 준다
    nature: (slot) => {
      const mon = useSaveStore.getState().party[slot]
      return mon === undefined ? 0 : natureOf(mon.pid)
    },
    friendship: (slot) => useSaveStore.getState().party[slot]?.friendship ?? 0,
    // 지금 맵과 소지품의 홀드 효과는 세이브가 모른다. 여기가 둘 다 아는
    // 자리라 얹어서 넘긴다 (`pokemon/friendship`)
    addFriendship: (slot, amount) => {
      const mon = useSaveStore.getState().party[slot]
      useSaveStore.getState().addFriendship(slot, amount, {
        mapId: useSessionStore.getState().mapId,
        soothing: isSoothing(mon === undefined ? undefined : items?.all[mon.heldItem]),
      })
    },
    hasMove: (slot, move) =>
      useSaveStore.getState().party[slot]?.moves.some((s) => s.move === move) === true,
    move: (slot, moveSlot) => useSaveStore.getState().party[slot]?.moves[moveSlot]?.move ?? 0,
    form: (slot) => useSaveStore.getState().party[slot]?.form ?? 0,
    setForm: (slot, form, moveSlot = 0) => { reshape(slot, () => form, moveSlot) },
    // 깨어진 세계 안에서는 백금옥과 상관없이 오리진이다 (`Party_SetGiratinaForm`)
    giratinaForm: (origin) => {
      forEachParty((mon) => (
        mon.species === SPECIES_GIRATINA
          ? (origin ? GIRATINA_ORIGIN : giratinaFormOf(mon.heldItem))
          : null
      ))
    },
    revertForms,
    rotomForms,
    rotomCount: () => {
      const party = useSaveStore.getState().party
      const first = party.findIndex((m) => m.species === SPECIES_ROTOM && !m.isEgg)
      return {
        count: party.filter((m) => m.species === SPECIES_ROTOM && !m.isEgg).length,
        // 원작의 `PARTY_SLOT_NONE`. 없으면 스크립트가 이 값으로 갈라진다
        first: first < 0 ? 0xff : first,
      }
    },
    moveCount: (slot) => {
      const mon = useSaveStore.getState().party[slot]
      // ⚠️ **알은 0이다.** 알도 기술을 갖고 있어서 세면 부화 전에 배우려 든다
      if (!mon || mon.isEgg) return 0
      return mon.moves.filter((m) => m.move !== 0).length
    },
    hasHeldItem: (item) => useSaveStore.getState().party.some((m) => m.heldItem === item),
    types: (slot) => {
      const mon = useSaveStore.getState().party[slot]
      const info = mon === undefined ? undefined : speciesTable?.of(mon)
      // 한 타입인 종족도 표에 두 칸이 같은 값으로 들어 있다
      return [info?.types[0] ?? 0, info?.types[1] ?? 0]
    },
    countAtOrBelowLevel: (level) =>
      useSaveStore.getState().party.filter((m) => !m.isEgg && m.level <= level).length,
    isOutsider: (slot) => {
      const mon = useSaveStore.getState().party[slot]
      // ⚠️ 원작은 **보이는 번호만** 견준다 (`MON_DATA_OT_ID` 아래 16비트)
      return mon !== undefined && (mon.otId & 0xffff) !== useSaveStore.getState().trainer.id
    },
    evTotal: (slot) => {
      const ev = useSaveStore.getState().party[slot]?.evs
      return ev === undefined ? 0 : ev.hp + ev.atk + ev.def + ev.spa + ev.spd + ev.spe
    },
    findWithMove: (move) => findSlot(
      (m) => m.moves.some((s) => s.move === move), MAX_PARTY_SIZE,
    ),
    findWithNature: (nature) => findSlot((m) => natureOf(m.pid) === nature),
    findWithSpecies: (species) => findSlot((m) => m.species === species),
    findFateful: (species) => findSlot((m) => m.species === species && m.origin.fateful),
    clearMoveSlot: (slot, moveSlot) => { editMoves(slot, moveSlot, null) },
    setMoveSlot: (slot, moveSlot, move) => { editMoves(slot, moveSlot, move) },
    sizeOf: (slot) => {
      const mon = useSaveStore.getState().party[slot]
      const info = mon === undefined ? undefined : speciesTable?.of(mon)
      if (!mon || !info) return null
      return { factor: sizeFactor(mon), heightDm: info.heightDm }
    },
    heightOf: (species) => speciesTable?.get(species).heightDm ?? 0,
  },

  chooseMon: {
    open: () => { useMenuStore.getState().openPartyToChoose() },
    picked: () => partyChoice.slot,
  },

  npcTrade: {
    // ⚠️ **표를 못 받았어도 번호는 적어 둔다.** 그래야 화면 쪽이 나중에
    // 표를 받아 같은 교환을 집는다 — 여기서 null로 눌러 버리면 그 사람만
    // 조용히 말이 안 통한다
    init: (tradeId) => { npcTradeId = tradeId },
    species: () => npcTradeRecord()?.species ?? 0,
    requestedSpecies: () => npcTradeRecord()?.requestedSpecies ?? 0,
    start: (partySlot) => {
      if (npcTradeId === null) return
      useMenuStore.getState().openTrade({ tradeId: npcTradeId, slot: partySlot })
    },
    free: () => { npcTradeId = null },
  },

  boxes: {
    nickname: (boxSlot) => {
      const mon = useSaveStore.getState().boxes[Math.floor(boxSlot / BOX_SIZE)]
        ?.[boxSlot % BOX_SIZE]
      return mon?.nickname ?? speciesNames[mon?.species ?? 0] ?? ''
    },
  },

  tablet: {
    name: () => useSaveStore.getState().trainer.tabletName,
    open: () => {
      namingAnswer.answer = null
      useMenuStore.getState().openNaming({
        kind: 'tablet', slot: 0,
        initial: useSaveStore.getState().trainer.tabletName,
        // 원작도 열 글자다 (`sub_0203DFE8(..., 0, 10, ...)`)
        max: 10,
      })
    },
  },

  appearance: {
    get: () => useSaveStore.getState().trainer.appearance,
    set: (appearance) => {
      useSaveStore.setState((s) => ({ trainer: { ...s.trainer, appearance } }))
    },
  },

  trainerInfo: {
    // 원작 번호는 남 0 · 여 1이다 (`TrainerInfo_Gender`)
    gender: () => (useSaveStore.getState().trainer.gender === 'girl' ? 1 : 0),
    id: () => useSaveStore.getState().trainer.id,
    hasBadge: (badge) => (useSaveStore.getState().badges & (1 << badge)) !== 0,
    giveBadge: (badge) => { useSaveStore.getState().giveBadge(badge) },
    nationalDex: (set) => {
      if (set) useSaveStore.getState().obtainNationalDex()
      return useSaveStore.getState().nationalDex
    },
    unownFormsSeen: () => useSaveStore.getState().pokedex.unownForms.length,
  },

  berryPatches: berryPatchServices,

  safari: safariServices,

  chooseItem: {
    open: (pocket) => {
      // 열기 전에 지운다 — 앞서 고른 도구가 남아 있으면 취소가 「그대로 심기」가 된다
      itemChoice.item = 0
      useMenuStore.getState().openBagToPick(pocket)
    },
    picked: () => itemChoice.item,
  },

  labels: {
    move: (move) => moveNames[move] ?? '',
    // ⚠️ 도구 표가 아니라 **열매 이름 뱅크**다 — 「체리열매」가 아니라 「체리」
    berry: (item) => berryNames[item - FIRST_BERRY_ITEM] ?? '',
    pocket: (pocket) => pocketNames[pocket] ?? '',
    species: (species) => speciesNames[species] ?? '',
    type: (type) => typeNames[type] ?? '',
    nature: (nature) => natureNames[nature] ?? '',
    trainer: (id) => trainerNames[id] ?? '',
    trainerClass: (c) => trainerClassNames[c] ?? '',
    map: (mapHeaderId) => locationNames[mapById(mapHeaderId)?.label ?? 0] ?? '',
    tmMove: (item) => moveNames[tmhmMove(item)] ?? '',
    itemWithArticle: (item) => orPlain(itemArticleNames, itemNames, item),
    itemPlural: (item) => orPlain(itemPluralNames, itemNames, item),
    speciesWithArticle: (s) => orPlain(speciesArticleNames, speciesNames, s),
    trainerClassWithArticle: (c) => orPlain(trainerClassArticleNames, trainerClassNames, c),
  },

  /**
   * 비전머신 자격 (`FieldMoves_Check*`).
   *
   * 어느 뱃지에 어느 기술인지는 엔진의 표가 안다 (`engine/script/fieldMoves`).
   * 여기서는 세이브를 읽어 주기만 한다
   */
  fieldMoves: {
    badges: () => useSaveStore.getState().badges,
    knows: (move: number) =>
      useSaveStore.getState().party.some((mon) => mon.moves.some((s) => s.move === move)),
    // 메뉴에서 고르는 길과 **같은 규칙**을 쓴다 — 지형을 보고 뛰거나 오른다
    use: (id) => fieldMoveFromMenu(FIELD_MOVES[id].move) === 'used',
    strength: (mode) => {
      const p = worldState.player
      if (mode === 'check') return p.strength
      p.strength = mode === 'set'
      return p.strength
    },
  },

  coins: {
    get: () => useSaveStore.getState().coins,
    add: (amount) => {
      useSaveStore.setState((s) => ({ coins: addCoins(s.coins, amount).coins }))
    },
    subtract: (amount) => {
      useSaveStore.setState((s) => ({ coins: subtractCoins(s.coins, amount).coins }))
    },
    canAdd: (amount) => canAddCoins(useSaveStore.getState().coins, amount),
  },

  currency: {
    showMoney: (left, top) => {
      useCurrencyStore.getState().showMoney(left, top, useSaveStore.getState().money)
    },
    hideMoney: () => { useCurrencyStore.getState().hideMoney() },
    updateMoney: () => { useCurrencyStore.getState().updateMoney(useSaveStore.getState().money) },
    showCoins: (left, top) => {
      useCurrencyStore.getState().showCoins(left, top, useSaveStore.getState().coins)
    },
    hideCoins: () => { useCurrencyStore.getState().hideCoins() },
    updateCoins: () => { useCurrencyStore.getState().updateCoins(useSaveStore.getState().coins) },
  },

  bike: {
    riding: () => worldState.player.cycling,
    ride: (on) => {
      const p = worldState.player
      if (p.cycling === on) return
      p.cycling = on
      p.pedalling = 0
      // 원작도 여기서 자전거 곡으로 갈아 끼우고, 내리면 **가로채기를 비워**
      // 맵 곡으로 되돌린다 (`FieldBGM_SetOverride(fieldSystem, SEQ_NONE)`)
      fieldBgm.override = on ? SEQ_BICYCLE : null
    },
    setRoad: (on) => { setOnCyclingRoad(on) },
  },

  healParty: () => { healParty() },
  setHealSpot: (index) => { useSaveStore.getState().setHealSpot(index) },
  blackOut: () => { blackOut() },

  bag: {
    pocketOf,
    add: (item, count) => useSaveStore.getState().addItem(pocketOf(item), item, count),
    remove: (item, count) => useSaveStore.getState().removeItem(pocketOf(item), item, count),
    canFit: (item, count) => canFit(useSaveStore.getState().bag, pocketOf(item), item, count),
    quantity: (item) => quantity(useSaveStore.getState().bag, pocketOf(item), item),
    pocketHasItems: (pocket) => (useSaveStore.getState().bag[pocket]?.length ?? 0) > 0,
    name: (item) => itemNames[item] ?? '',
  },

  openStartMenu: () => { useMenuStore.getState().open('start') },
  menuOpen: () => useMenuStore.getState().stack.length > 0,

  openShop: (stock) => { useMenuStore.getState().openShop(stock) },

  /** 보관 시스템 다섯 갈래 (`OpenPokemonStorage`) */
  openStorage: (mode) => {
    if (mode < 0 || mode > BOX_MODE.compare) return
    useMenuStore.getState().openBox(mode)
  },

  /**
   * 소리 (`scrcmd_sound.c`).
   *
   * ⚠️ **팡파르를 따로 기억해 둔다.** 원작은 "팡파르 때문에 곡이 멎어 있는가"를
   * 보는데(`Sound_IsBGMPausedByFanfare`) 우리는 곡을 멈추지 않으므로, 마지막에
   * 튼 팡파르가 아직 울리는지로 대신한다
   */
  sound: {
    playEffect: (seq) => { void music.playEffect(seq) },
    stopEffect: (seq) => { music.stopEffect(seq) },
    effectPlaying: (seq) => music.isEffectPlaying(seq),
    playCry: (species) => { void music.playCry(species) },
    cryPlaying: () => music.isCryPlaying(),
    playFanfare: (seq) => { fanfare = seq; void music.playEffect(seq) },
    fanfarePlaying: () => fanfare !== null && music.isEffectPlaying(fanfare),
    setMusic: (seq) => { fieldBgm.override = seq },
    sequencePlaying: (seq) => music.playing === seq || music.isEffectPlaying(seq),
    fadeVolume: (volume, frames) => { music.fadeVolume(volume, frames) },
  },

  boxFreeSlots: () => freeSlots(useSaveStore.getState().boxes),

  aliveAndBoxMons: () => {
    const save = useSaveStore.getState()
    return save.party.filter((mon) => mon.hp > 0).length + countAll(save.boxes)
  },

  martStock: {
    // 재고표를 아직 못 받았으면 빈 상점이 뜬다. 물건을 지어내지 않는다
    common: () => (marts ? commonStock(marts, useSaveStore.getState().badges) : []),
    specialties: (martID) => (marts ? specialtyStock(marts, martID) : []),
  },

  money: {
    get: () => useSaveStore.getState().money,
    add: (amount) => { useSaveStore.getState().addMoney(amount) },
    spend: (amount) => useSaveStore.getState().spendMoney(amount),
  },

  timeOfDay: () => timeOfDayForHour(worldState.time.gameHour),

  daycare: {
    state: () => daycareState(useSaveStore.getState().daycare),
    compatibility: () => {
      const table = speciesTable
      if (!table) return 3
      return compatibilityLevel(
        daycareCompatibility(useSaveStore.getState().daycare, (id) => table.get(id)),
      )
    },
    hasEgg: () => useSaveStore.getState().daycare.eggPid !== 0,

    store: (partySlot) => {
      const save = useSaveStore.getState()
      const mon = save.party[partySlot]
      const at = emptySlot(save.daycare)
      if (!mon || at < 0) return
      const slots = [...save.daycare.slots]
      slots[at] = { mon, steps: 0, levelIn: mon.level }
      useSaveStore.setState({
        party: save.party.filter((_, i) => i !== partySlot),
        daycare: { ...save.daycare, slots },
      })
    },

    withdraw: (slot) => {
      const save = useSaveStore.getState()
      const held = save.daycare.slots[slot]
      const table = speciesTable
      if (!held || !table) return 0
      const info = table.get(held.mon.species)
      const grown = { ...held.mon }
      // ⚠️ **걸음 하나가 경험치 1이다.** 100레벨은 안 받는다
      if (grown.level < MAX_LEVEL) setExp(grown, info, grown.exp + held.steps)
      grown.hp = statsOf(grown, info).hp
      // 앞으로 당긴다 (`Daycare_ShiftMonSlots`) — 두 자리가 늘 앞에서부터 찬다
      const rest = save.daycare.slots.filter((_, i) => i !== slot)
      useSaveStore.setState({
        party: [...save.party, grown],
        daycare: { ...save.daycare, slots: [rest[0] ?? null, null] },
      })
      return held.mon.species
    },

    price: (slot) => {
      const save = useSaveStore.getState()
      const held = save.daycare.slots[slot]
      const table = speciesTable
      if (!held || !table) return { money: daycarePrice(0), levels: 0 }
      const info = table.get(held.mon.species)
      const after = { ...held.mon }
      if (after.level < MAX_LEVEL) setExp(after, info, after.exp + held.steps)
      const levels = after.level - held.levelIn
      return { money: daycarePrice(levels), levels }
    },

    takeEgg: () => {
      const save = useSaveStore.getState()
      const table = speciesTable
      const moves = moveTable
      if (save.daycare.eggPid === 0 || !table || !moves || !items) return false
      const plan = makeEgg(
        save.daycare, table.babyOf, (id) => table.get(id),
        (id) => moves.byId.get(id)?.pp ?? 5,
        items.tmMoves,
        (species, index) => canLearnTm(table.get(species).tm, index),
        Math.random,
      )
      if (!plan) return false
      const mon = makeEggMon(plan.species, plan)
      if (!mon) return false
      useSaveStore.setState({
        party: [...useSaveStore.getState().party, mon],
        daycare: { ...useSaveStore.getState().daycare, eggPid: 0, cycle: 0 },
      })
      return true
    },

    resetEgg: () => {
      const save = useSaveStore.getState()
      useSaveStore.setState({ daycare: { ...save.daycare, eggPid: 0, cycle: 0 } })
    },

    info: (slot) => {
      const held = useSaveStore.getState().daycare.slots[slot]
      const table = speciesTable
      if (!held || !table) return null
      const ratio = table.get(held.mon.species).genderRatio
      const gender = genderOf(held.mon.pid, ratio)
      return {
        name: held.mon.nickname ?? speciesNames[held.mon.species] ?? '',
        level: held.mon.level,
        gender: gender === 'female' ? 1 : gender === 'male' ? 0 : 2,
      }
    },
  },

  /**
   * 선물 알 (`ScrCmd_GiveEgg`) — 육성가 밖에서 받는 것.
   *
   * 이야기에서 받는 알(우호광장의 리오르, 마나피)이 이 길로 온다.
   * 그동안 이 자리가 비어 있어서 **말은 걸리는데 알이 안 들어왔다**
   */
  giveEgg: (species, giver) => {
    // `giver`가 알 받은 자리를 고른다 (`SpecialMetLoc_GetId(1, giver)`) —
    // 9 여행하는 남자(마나피) · 10 라이리(리오르) · 11 난천(토게피)
    const mon = makeEggMon(species, null, SPECIAL_MET_BASE + giver)
    if (mon) useSaveStore.setState({ party: [...useSaveStore.getState().party, mon] })
  },

  eggs: {
    nonEggs: () => useSaveStore.getState().party.filter((m) => !m.isEgg).length,
    count: () => useSaveStore.getState().party.filter((m) => m.isEgg).length,
    firstNonEgg: () => Math.max(0, useSaveStore.getState().party.findIndex((m) => !m.isEgg)),
    hatchFirst: () => {
      const at = useSaveStore.getState().party.findIndex((m) => m.isEgg)
      if (at >= 0) useHatchStore.getState().open(at)
    },
  },

  /**
   * 날마다 바뀌는 것 (PARITY §6.11).
   *
   * 스크립트가 여는 것이 둘이다 — 무리는 신오방송국 사람이 켜 주고
   * (`EnableSwarms`), 트로피가든은 저택 사무실 스크립트가 하루에 한 마리씩
   * 더한다 (`AddTrophyGardenMon`)
   */
  daily: {
    enableSwarms: () => {
      const daily = useSaveStore.getState().daily
      if (!daily.swarms) useSaveStore.setState({ daily: { ...daily, swarms: true } })
    },
    swarm: () => {
      const at = swarmMap(useSaveStore.getState().daily)
      if (at === null) return null
      // 원작도 **그 맵의 표**에서 무리 슬롯 0번을 읽는다
      // (`Swarm_GetMapIdAndSpecies`) — 지금 서 있는 맵의 표가 아니다
      const index = mapWorld.maps?.[at]?.encounters
      const table = index == null ? null : encounters.tables?.[index] ?? null
      return { map: at, species: table?.swarm[0] ?? 0 }
    },
    addTrophyMon: () => {
      const table = encounters.ex?.trophyGarden
      if (!table) return
      const { daily } = useSaveStore.getState()
      useSaveStore.setState({ daily: addTrophyMon(daily, table, Math.random) })
    },
    trophySpecies: (slot) => {
      const table = encounters.ex?.trophyGarden
      if (!table) return 0
      const { daily, nationalDex } = useSaveStore.getState()
      return trophySpecies(daily, table, nationalDex)[slot] ?? 0
    },
  },

  /**
   * 배회 포켓몬 (PARITY §6.3).
   *
   * 최대 체력은 종족값 표에서 온다 — 개체값까지 넣고 실제로 계산해야
   * 「만피로 시작해서 맞은 만큼 들고 다닌다」가 맞는 수가 된다
   */
  roamers: {
    activate: (slot) => {
      activateRoamer(slot, (species, level, ivs) => {
        const table = speciesTable
        if (!table) return null
        return computeStats({
          base: table.get(species).stats, ivs, level, speciesId: species,
          evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
          // 성격은 체력에 안 걸린다. 그래서 아무 값이나 넣어도 같은 수가 나온다
          nature: 0,
        }).hp
      })
    },
  },

  /**
   * 모험노트 (PARITY §7.4).
   *
   * ⚠️ **비전기술 자리는 맵 번호가 인자로 온다.** 스크립트가 「어디에서 썼는가」를
   * 직접 넘기므로 지금 서 있는 맵을 우리가 다시 물어보면 안 된다 —
   * 락클라임처럼 두 맵의 경계에서 쓰는 것이 어긋난다
   */
  journal: {
    give: () => { journalGiven(mapWorld.mapId) },
    event: (type, param) => {
      if (type === LocationEvent.ITEM_WAS_OBTAINED) { journalGotItem(param); return }
      if (AT_MAP_EVENTS.has(type)) { journalUsedMove(type, param); return }
      journalPlain(type)
    },
  },

  /**
   * 포켓치 (PARITY §7.3).
   *
   * ⚠️ **앱을 처음 등록할 때 기계도 같이 켠다.** 원작은 축복시티의 포켓치
   * 화면(필드 과제)이 `Poketch_Enable`을 부르는데 그건 스크립트 명령이
   * 아니다 — 사장이 기계를 주면서 앱을 등록하므로 같은 순간이다
   */
  poketch: {
    enabled: poketchEnabled,
    register: (app) => {
      poketchEnable()
      return poketchRegister(app)
    },
    has: poketchHasApp,
    appName: (app) => poketchAppNames[app] ?? '',
    show: poketchShow,
  },

  /**
   * 기술 되살리기·기술가르침 (PARITY §5).
   *
   * 목록은 학습표에서 나온다 — 종족 표를 못 받았으면 아무것도 못 가르치므로
   * 「없다」로 답한다 (스크립트가 그 갈래로 흘러간다)
   */
  reminder: {
    count: (slot) => relearnFor(slot).length,
    open: (slot, move) => {
      const moves = move === undefined ? relearnFor(slot) : [move]
      useMenuStore.getState().openReminder({ slot, moves, tutor: move !== undefined })
    },
    learned: () => useMenuStore.getState().reminderLearned,
  },

  diploma: { show: (national) => { useMenuStore.getState().openDiploma(national) } },

  /**
   * 명예의 전당 (PARITY §7.11) — `ClearGame`.
   *
   * 장면을 열기 **전에** 세이브를 손본다. 원작도 `ClearGame()`이 깃발과 자리를
   * 먼저 세우고 나서 화면을 띄운다 (`FieldTask_InitCall`)
   */
  hallOfFame: {
    clear: () => {
      const vars = fieldScripts.vars
      // ⚠️ **전당에 든 날은 처음 한 번만 적는다** (`if (CheckGameCompleted() == FALSE)`)
      if (!vars.checkFlag(SYSTEM_FLAG.gameCompleted)) {
        const save = useSaveStore.getState()
        useSaveStore.setState({ trainer: { ...save.trainer, firstClearedAt: Date.now() } })
      }
      // ⚠️ **이 깃발을 세우는 것은 스크립트가 아니다** (`SystemFlag_SetGameCompleted`가
      // `ClearGame()` 안에 있다). 여기서 안 세우면 후반부가 통째로 안 열린다
      vars.setFlag(SYSTEM_FLAG.gameCompleted)
      useMenuStore.getState().openHallOfFame()
    },
    victories: () => entryNumber(useSaveStore.getState().hallOfFame, 0),
    openPC: () => { useMenuStore.getState().push('pcHallOfFame') },
  },

  gear: {
    giveRunningShoes: () => { useSaveStore.setState({ runningShoes: true }) },
    hasRunningShoes: () => useSaveStore.getState().runningShoes,
  },

  warpEvents: { setPos: setWarpEventPos },

  door: {
    load: (x, z, tag) => { door.load(x, z, tag) },
    open: (tag) => { door.open(tag) },
    close: (tag) => { door.close(tag) },
    busy: (tag) => door.busy(tag),
    unload: (tag) => { door.unload(tag) },
  },

  lakeGuardianUnits: {
    init: (freed) => { initLakeGuardianUnits(freed) },
    open: () => { deactivateLakeGuardianUnits(performance.now()) },
    settled: () => lakeGuardianUnitsSettled(performance.now()),
  },

  chooseStarter: {
    open: () => {
      starterChoice = null
      useMenuStore.getState().open('chooseStarter')
    },
    chosen: () => starterChoice,
  },

  startFirstBattle: (trainerID) => {
    battleResult = null
    battleMask = null
    waiting = true
    // ⚠️ 보통 트레이너전과 딱 하나 다르다 — **급소가 안 난다**
    // (`BATTLE_STATUS_FIRST_BATTLE` → `BtlCmd_CalcCrit`이 `criticalMul = 1`)
    void useBattleStore.getState().startTrainer(trainerID, { noCrit: true }).catch(() => {
      battleResult = 'loss'
      battleMask = 2
      waiting = false
    })
  },

  /**
   * 전설 조우 (`Encounter_NewVsSpeciesAtLevel`).
   *
   * 인카운터 표를 안 거치고 종과 레벨을 스크립트가 준다. 곡은 야생과 같은
   * 길로 갈린다 — `wildSongFor`가 종족 번호를 보고 기라티나면 플래티넘
   * 전용 곡을 고른다 (`audio/songs`)
   */
  startLegendaryBattle: (species, level) => {
    battleResult = null
    battleMask = null
    waiting = true
    void useBattleStore.getState().startWild({ species, level }).catch(() => {
      battleResult = 'loss'
      battleMask = 2
      waiting = false
    })
  },

  /**
   * 오리진폼 기라티나 (`Encounter_NewVsGiratinaOrigin`).
   *
   * ⚠️ **백금옥과 무관하다.** 깨어진 세계 안이라 그 모습인 것이고
   * (`Pokemon_SetGiratinaOriginForm`), 잡아서 밖으로 데리고 나오면 도로
   * 어나더폼이 된다 — 그 되돌림은 `SetPartyGiratinaForm`이 한다
   */
  startGiratinaOriginBattle: (species, level) => {
    battleResult = null
    battleMask = null
    waiting = true
    void useBattleStore.getState().startWild({ species, level, form: GIRATINA_ORIGIN })
      .catch(() => { battleResult = 'loss'; battleMask = 2; waiting = false })
  },

  /**
   * 꿀 나무 (PARITY §6.6).
   *
   * 지금 선 맵이 스물한 그루 중 하나라는 것은 스크립트가 열린 것으로 이미
   * 정해져 있다 (`tryHoneyTree`가 소품을 보고 연다)
   */
  honeyTree: {
    status: () => {
      const tree = honeyTreeHere()
      return tree === null ? TREE_STATUS.bare : honeyTreeStatus(tree)
    },
    slather: () => {
      const at = honeyTreeOf(mapWorld.mapId)
      if (at < 0) return
      const save = useSaveStore.getState()
      // ⚠️ **트레이너 번호를 32비트로 넘긴다.** 보이는 다섯 자리만 주면
      // 먹이몬 나무 넷 중 둘이 늘 0·1번으로 굳는다 (`munchlaxTrees`)
      const id32 = ((save.trainer.secretId << 16) | save.trainer.id) >>> 0
      const roll = (): number => Math.floor(Math.random() * 100)
      useSaveStore.setState({
        honeyTrees: slatherTree(save.honeyTrees, at, isMunchlaxTree(id32, at), {
          keep: roll(), group: roll(), slot: roll(), shakes: roll(),
        }),
      })
    },
    startBattle: () => {
      const at = honeyTreeOf(mapWorld.mapId)
      const tree = honeyTreeHere()
      const tables = encounters.ex?.honeyTree
      if (at < 0 || tree === null || !tables) return
      const species = honeyTreeSpecies(tree, tables)
      if (species === 0) return
      // ⚠️ **싸우기 전에 떼어 낸다** (`HoneyTree_Unslather`가
      // `CreateWildMon_HoneyTree` 안에 있다) — 도망쳐도 그 나무는 비었다
      useSaveStore.setState({
        honeyTrees: unslatherTree(useSaveStore.getState().honeyTrees, at),
      })
      // 선두 특성은 `stepSystem`이 프레임마다 넘겨 둔 것을 쓴다 —
      // 여기서 다시 세면 같은 규칙이 두 벌이 된다
      const boost = pushesLevel(encounters.mods.lead)
      const level = honeyTreeLevel(
        Math.floor(Math.random() * 11), boost, Math.floor(Math.random() * 2),
      )
      battleResult = null
      battleMask = null
      waiting = true
      void useBattleStore.getState().startWild({ species, level })
        .catch(() => { battleResult = 'loss'; battleMask = 2; waiting = false })
    },
    stopShaking: () => { honeyShake.stop?.(honeyTreeOf(mapWorld.mapId)) },
  },

  /** 「운명적인 만남」 (`Encounter_NewFatefulVsSpeciesAtLevel`) */
  startFatefulEncounter: (species, level) => {
    battleResult = null
    battleMask = null
    waiting = true
    void useBattleStore.getState().startWild({ species, level, fateful: true })
      .catch(() => { battleResult = 'loss'; battleMask = 2; waiting = false })
  },

  /**
   * 태그 배틀 (`ScrCmd_StartTagBattle`).
   *
   * ⚠️ **파트너가 안 붙는다.** 옆에서 같이 싸우는 사람은 배틀 쪽에 자리가
   * 없어서(`@pkmn/sim`은 되지만 우리 컨트롤러가 2인용이다) 지금은 **앞의
   * 상대 하나와 1:1**로 연다. 창기둥에서 마스·쥬피터를 함께 상대하는 장면이
   * 마스 한 명이 된다 — 이야기는 그대로 지나가고 없는 것은 옆에 선 둘이다
   */
  startTagBattle: (_partner, enemy1) => {
    battleResult = null
    battleMask = null
    waiting = true
    void useBattleStore.getState().startTrainer(enemy1).catch(() => {
      battleResult = 'loss'
      waiting = false
    })
  },

  /** 도감에 봤다고 적는다 (`FieldSystem_WriteSpeciesSeen`) */
  seeSpecies: (species) => { useSaveStore.getState().markSeen(species) },

  /** 깨어진 세계 (PARITY §6.10) */
  distortion: {
    addObject: (localID) => { distortionAddObject(localID, fieldScripts.vars) },
    removeObject: (localID) => { distortionRemoveObject(localID) },
    resetCamera: () => { distortionResetCamera() },
  },

  /**
   * 주인공의 세 좌표 (`ScrCmd_GetPlayer3DPos`).
   *
   * 깨어진 세계에서는 **세계 좌표**다 — 층마다의 오프셋이 이미 더해져 있다.
   * 밖에서는 그냥 지금 칸이다
   */
  playerPos: () => distortionPlayerPos(),

  /**
   * 그 맵에만 있는 장치 (PARITY §7.12).
   *
   * ⚠️ **선 자리가 아니라 들어선 칸이다.** 원작이 `fieldSystem->location->z`를
   * 보는데 그것은 워프 표가 적어 둔 값이고, 문 앞에서 한 칸 내려 세운 뒤의
   * 자리와 다를 수 있다
   */
  mapFeatures: {
    initPlatformLift: () => { initPlatformLift(mapWorld.mapId, mapWorld.enteredZ) },
    triggerPlatformLift: () => triggerPlatformLift(),
    platformLiftBusy: () => platformLiftBusy(),
    platformLiftNotUsedWhenEnteredMap: () => platformLiftNotUsedWhenEnteredMap(),
    initPastoriaGym: () => { initPastoriaGym(mapWorld.mapId) },
    pressPastoriaButton: () => pressPastoriaButton(propModelUnderPlayer()),
    pastoriaBusy: () => pastoriaBusy(),
    initSunyshoreGym: (room) => { initSunyshoreGym(SUNYSHORE_GYM_MAPS[room] ?? -1, mapWorld.enteredZ) },
    pressSunyshoreButton: (button) => pressSunyshoreButton(button as SunyshoreButton),
    sunyshoreBusy: () => sunyshoreBusy(),
    initEternaGym: (state) => { initEternaGym(mapWorld.mapId, state) },
    advanceEternaClock: () => advanceEternaClock(),
    eternaBusy: () => eternaBusy(),
    initCanalaveGym: () => { initCanalaveGym(mapWorld.mapId) },
    stepOnFeature: () => { canalaveStepped() },
    initVeilstoneGym: () => { initVeilstoneGym(mapWorld.mapId) },
    kickBag: (x, z, dir) => hitVeilstoneBag(x, z, dir),
    initHearthomeGym: () => { initHearthomeGym(mapWorld.mapId, Math.random) },
  },

  /** 전설을 만나기 전의 미리보기 창 */
  preview: {
    draw: (species, gender) => { usePreviewStore.getState().draw(species, gender) },
    remove: () => { usePreviewStore.getState().remove() },
  },

  /**
   * 귀혼동굴의 다음 방을 굴린다 (`ScrCmd_InitTurnbackCave`).
   *
   * ⚠️ **들어온 문만 빼고 셋을 전부 같은 방으로 돌린다.** 어느 문으로 나가도
   * 같은 곳이다 — 길을 고르는 것이 아니라 굴리는 것이다. 들어온 문은 서 있는
   * 칸으로 역산한다(원작이 x·z를 보고 0~3을 고른다)
   */
  turnbackCave: (pillarsSeen, roomsVisited) => {
    const dest = turnbackDestination(pillarsSeen, roomsVisited, Math.random)
    const p = worldState.player.position
    const entry = turnbackEntryWarp(Math.floor(p.x), Math.floor(p.z))
    for (let warp = 0; warp < TURNBACK_WARP_COUNT; warp++) {
      if (warp === entry) continue
      setWarpDestination(warp, dest)
    }
  },

  /**
   * 별명 짓는 화면 (`ScrCmd_OpenPokemonNamingScreen`).
   *
   * 답을 화면이 `naming.answer`에 적어 두고 여기서 가져간다 — 배틀 결과와 같은
   * 이유다. 화면이 닫히는 프레임에 스토어가 비므로 스크립트가 못 받는다
   */
  naming: {
    openForParty: (slot) => {
      namingAnswer.answer = null
      const mon = useSaveStore.getState().party[slot]
      useMenuStore.getState().openNaming({
        kind: 'pokemon',
        slot,
        // 지금 이름 — 없으면 종족 이름이다. 창의 물음("○○의 이름은?")이 이걸 쓴다
        initial: mon?.nickname ?? speciesNames[mon?.species ?? 0] ?? '',
        max: MON_NAME_LEN,
      })
    },
    named: () => {
      const got = namingAnswer.answer
      if (got === null) return null
      // 지었으면 세이브에 넣는다. 빈 글이면 안 지은 것이라 그대로 둔다
      if (got.name === '') return got.name
      if (got.kind === 'tablet') {
        useSaveStore.setState((s) => ({ trainer: { ...s.trainer, tabletName: got.name } }))
      } else {
        useSaveStore.getState().renameMon(got.slot, got.name)
      }
      return got.name
    },
  },

  /**
   * 독으로 쓰러지기 직전 1로 버틴다 (`Pokemon_TrySurvivePoison`).
   *
   * 조건이 둘이고 **둘 다** 맞아야 한다 — 독(맹독 포함)이고 체력이 정확히 1.
   * 맞으면 상태를 지우고 참을 돌려준다. 걸어 다니다 독으로 깎이는 마지막
   * 한 칸에서 쓰러지는 대신 독이 풀리는 4세대 규칙이 이것이다
   */
  survivePoison: (slot) => {
    const mon = useSaveStore.getState().party[slot]
    if (!mon || mon.hp !== 1) return false
    if (mon.status !== 'psn' && mon.status !== 'tox') return false
    useSaveStore.getState().setStatus(slot, 'ok')
    return true
  },

  /**
   * 자유 카메라 (`AddFreeCamera`·`RestoreCamera`).
   *
   * 좌표는 타일 번호라 칸 한가운데(+0.5)로 옮긴다 — 배치표의 좌표를 그대로
   * 쓰는 다른 명령들과 같은 셈이다
   */
  camera: {
    free: (x, z) => { cameraSystem.free = { x: x + 0.5, z: z + 0.5 } },
    restore: () => { cameraSystem.free = null },
  },
}

/** 파트너 고르는 화면이 고른 것. 화면이 닫히기 전에 여기 적는다 */
let starterChoice: number | null = null

/** 화면이 부른다. 스크립트는 `chooseStarter.chosen()`으로 이 값을 본다 */
export function setStarterChoice(species: number): void {
  starterChoice = species
}

/**
 * 문 여닫는 그림 (`ov5_021D431C.c`).
 *
 * ⚠️ **아직 그림이 없다.** 소품 590종을 기하와 텍스처로 뽑아 두었지만
 * 애니메이션(NSBCA)은 안 뽑았다. 그래서 여기서 하는 일은 **소리와 시간**뿐이다 —
 * 문이 열릴 때 나는 소리는 원작 그대로고, `WaitForAnimation`이 서는 길이도
 * 원작의 한 바퀴(`MapPropOneShotAnimationManager_IsAnimationLoopFinished`)와
 * 같은 자리에 있다. 문짝이 **움직이는 모습**만 없다.
 *
 * 소리는 문 종류가 정한다 (`DoorAnimation_GetSoundEffectType`):
 * 미닫이는 열 때 `SEQ_SE_DP_DOOR10`·닫을 때 소리 없음, 나머지는
 * `SEQ_SE_DP_DOOR_OPEN`과 `SEQ_SE_DP_DOOR_CLOSE2`다. 어느 쪽인지는 **문 모델
 * 번호**로 갈리는데 그 표를 아직 안 옮겼으므로 여닫이 소리를 쓴다
 */
/** `generated/sdat.txt`. 디컴프가 닫는 소리를 생값 1543으로 적어 둔 것과 맞는다 */
const DOOR_OPEN_SE = SFX.DOOR
const DOOR_CLOSE_SE = 1543

/**
 * 문이 한 바퀴 도는 시간(ms).
 *
 * ⚠️ 원작은 NSBCA 한 바퀴가 끝나기를 기다리는데 그 길이를 우리가 못 읽는다.
 * 열고 닫는 사이가 **눈에 띄게 끊기는** 정도면 되는 자리라 짧게 잡았다
 */
const DOOR_MS = 200

/** 태그 → 이 시각까지 도는 중 */
const doorUntil = new Map<number, number>()

const door = {
  load: (x: number, z: number, tag: number): void => {
    doorUntil.delete(tag)
    useDoorVisualStore.getState().load(x, z, tag, worldState.player.position.x, worldState.player.position.z)
  },
  open: (tag: number): void => {
    doorUntil.set(tag, performance.now() + DOOR_MS)
    useDoorVisualStore.getState().open(tag)
    void music.playEffect(DOOR_OPEN_SE)
  },
  close: (tag: number): void => {
    doorUntil.set(tag, performance.now() + DOOR_MS)
    useDoorVisualStore.getState().close(tag)
    void music.playEffect(DOOR_CLOSE_SE)
  },
  busy: (tag: number): boolean => performance.now() < (doorUntil.get(tag) ?? 0),
  unload: (tag: number): void => {
    doorUntil.delete(tag)
    useDoorVisualStore.getState().unload(tag)
  },
}
