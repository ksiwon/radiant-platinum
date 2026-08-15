// NPC 교환 (PARITY §10) — `overlay006/npc_trade.c`
//
// 신오에서 포켓몬을 바꿔 주는 사람이 넷 있다. 저마다 **정해진 종 하나**를
// 요구하고 **정해진 한 마리**를 내준다. 요구한 종이 아니면 "그건 내가 원하던
// 게 아닌데"로 끝나고 교환은 안 일어난다.
//
// ⚠️ **이 넷이 「말 안 듣기」가 게임에 뜨는 유일한 문이다.** 통신교환이 없는
// 우리에게 남의 트레이너 번호를 단 포켓몬이 들어오는 길은 이것뿐이고,
// 뱃지 수를 넘긴 **남의** 포켓몬만 말을 안 듣는다
// (`battle/meta/obedience.ts`가 `isOriginalTrainer`로 가른다). 이 넷이 없으면
// 그 규칙은 코드에만 있고 화면에는 한 번도 안 나온다.
//
// ⚠️ **레벨은 내가 준 마리의 레벨이다.** 표에 레벨 칸이 없다 —
// `NPCTrade_FillAnimationTemplate`이 내가 고른 자리의 레벨을 읽어
// `NPCTrade_CreateMon`에 넘긴다. Lv.5 알통몬을 주면 Lv.5 아브라가 오고,
// Lv.60을 주면 Lv.60이 온다.
//
// ⚠️ **만난 자리는 지금 서 있는 맵이 아니라 「통신교환」이다.** 원작이
// `UpdateMonStatusAndTrainerInfo(mon, NULL, 1, MapHeader_GetMapLabelTextID(mapID), …)`로
// 맵 이름을 넘기지만, `sel == 1` 가지는 그 인자를 **안 쓰고**
// `SpecialMetLoc_GetId(1, 1)`(=2001)을 넣는다. 넘긴 맵 번호는 버려진다 —
// 여기를 맵 이름으로 채우면 요약 화면의 트레이너 메모가 원작과 다른 문장이 된다
// (`memoStatus`가 2001을 보고 갈래 2로 간다).
//
// ⚠️ **트레이너 정보를 덮어쓰지 않는다.** 같은 `sel == 1` 가지가
// `AssignTrainerInfoToBoxPokemon`을 **안 부른다** — 그래서 표가 준 트레이너
// 번호와 이름이 그대로 남고, 그것이 곧 말 안 듣기의 근거가 된다
import type { Species } from '../../data/schema'
import { expForLevel } from './exp'
import { wildMoves, type PokemonInstance } from './instance'
import { MET_LINK_TRADE, type MetDate, type Origin } from './origin'

/** `constants/npc_trades.h`의 `enum NPCTradeID` */
export const NPC_TRADE = {
  kazzaAbra: 0,
  charapChatot: 1,
  gasparHaunter: 2,
  foppaMagikarp: 3,
} as const

/** `MAX_NPC_TRADES` */
export const NPC_TRADE_COUNT = 4

/**
 * 별명 넷과 트레이너 이름 넷이 **한 뱅크**에 있다
 * (`TEXT_BANK_NPC_TRADE_NAMES` — `uiText`의 `npcTradeNames`).
 *
 * `NPCTrade_GetOTName`이 `NPCTrade_GetNickname(heapID, MAX_NPC_TRADES + id)`를
 * 부른다 — 앞 넷이 별명, 뒤 넷이 트레이너 이름이다
 */
export const NPC_TRADE_OT_NAME_BASE = NPC_TRADE_COUNT

/** `fld_trade.narc` 한 벌 (`NPCTradeMon`). 쓰지 않는 칸 둘은 안 담는다 */
export interface NpcTradeRecord {
  species: number
  ivs: { hp: number, atk: number, def: number, spa: number, spd: number, spe: number }
  /** 보이는 다섯 자리 번호. 표의 u32 아래 16비트다 */
  otId: number
  otSecretId: number
  personality: number
  heldItem: number
  /** 0 남 · 1 여 (`GENDER_MALE`·`GENDER_FEMALE`) */
  otGender: number
  /** `enum Language`. 킹킹이의 잉어킹만 독일어(5)고 나머지 셋은 영어(2)다 */
  language: number
  requestedSpecies: number
  /**
   * 콘테스트 능력치 다섯.
   *
   * ⚠️ **우리에게 담을 칸이 아직 없다** (PARITY §3.11). 그래도 버리지 않고
   * 여기까지 들고 온다 — 칸이 생기면 옮겨 담는 자리가 여기 하나다.
   * 조자리의 페라페만 다섯 다 20이고 나머지 셋은 전부 0이다
   */
  contest: { cool: number, beauty: number, cute: number, smart: number, tough: number }
}

/** 화면에 뜨는 이름 둘. 뱅크에서 온다 */
export interface NpcTradeNames {
  nickname: string
  otName: string
}

/** 뱅크 하나에서 그 교환의 이름 둘을 집는다 */
export function npcTradeNames(bank: readonly string[], tradeId: number): NpcTradeNames {
  return {
    nickname: bank[tradeId] ?? '',
    otName: bank[NPC_TRADE_OT_NAME_BASE + tradeId] ?? '',
  }
}

/** 내가 고른 마리가 이 사람이 원하던 것인가 (`GetNPCTradeRequestedSpecies` 뒤의 `GoToIfNe`) */
export function npcTradeAccepts(record: NpcTradeRecord, species: number): boolean {
  return record.requestedSpecies === species
}

/**
 * 받는 한 마리를 만든다 (`NPCTrade_CreateMon`).
 *
 * 원작은 `INIT_IVS_RANDOM`으로 개체값을 굴려 놓고 **바로 표의 값으로 여섯을 다
 * 덮어쓴다** — 굴린 값은 한 칸도 안 남는다. 그래서 여기에는 난수가 없다.
 * 성격값도 트레이너 번호도 표가 준 고정값이라 **넷 다 늘 같은 개체**다.
 *
 * PP는 채우지 않는다. 기술 표를 여기서 안 보므로 부르는 쪽이 `fillPp`로 채운다 —
 * `createWild`와 같은 약속이다
 *
 * @param level 내가 건네는 마리의 레벨 (`MON_DATA_LEVEL`)
 */
export function createTradedMon(
  record: NpcTradeRecord, species: Species, level: number,
  names: NpcTradeNames, today: MetDate,
): PokemonInstance {
  return {
    species: record.species,
    pid: record.personality,
    // ⚠️ **별명이 늘 붙어 있다** (`MON_DATA_HAS_NICKNAME`에 TRUE). 종족 이름이
    // 아니라 "케이케이"·"조자리"로 뜨는 것이 이 한 줄이다
    nickname: names.nickname,
    exp: expForLevel(species.growthRate, level),
    level,
    ivs: { ...record.ivs },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: wildMoves(species, level),
    // 부르는 쪽이 `statsOf`로 채운다 — `createWild`와 같다
    hp: 0,
    status: 'ok',
    statusTurns: 0,
    heldItem: record.heldItem,
    friendship: species.baseFriendship,
    isEgg: false,
    otId: record.otId,
    otSecretId: record.otSecretId,
    // `BoxPokemon_InitWith`이 몬스터볼을 넣는다 (`MON_DATA_POKEBALL = ITEM_POKE_BALL`)
    ball: ITEM_POKE_BALL,
    origin: tradedOrigin(record, names, level, today),
    form: 0,
    pokerus: 0,
    // 교환으로 오는 마리는 편지를 안 지닌다 — 통신교환이 아니라 NPC다
    mail: null,
  }
}

/** `constants/items.h` */
const ITEM_POKE_BALL = 4

/**
 * 받은 마리의 출신 (`UpdateBoxMonStatusAndTrainerInfo`의 `sel == 1`).
 *
 * 알 자리를 지우고 만난 자리에 **통신교환**을 넣는다. 만난 레벨은 그 순간의
 * 레벨이다 (`BoxPokemon_SetMetLevelToCurrentLevel`)
 */
export function tradedOrigin(
  record: NpcTradeRecord, names: NpcTradeNames, level: number, today: MetDate,
): Origin {
  return {
    otName: names.otName,
    otGender: record.otGender === 0 ? 'male' : 'female',
    met: { location: MET_LINK_TRADE, date: today },
    metLevel: level,
    egg: { location: 0, date: null },
    fateful: false,
  }
}
