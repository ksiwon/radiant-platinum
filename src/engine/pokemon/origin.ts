// 어디서 왔는가 — 만난 자리·만난 날·원래 트레이너 (PARITY §3.8)
//
// 요약 화면의 **트레이너 메모**가 이 칸들로만 쓰인다. 칸이 없으면 그 쪽은
// 지어낸 글이 되므로 화면보다 이것이 먼저다.
//
// 원작은 `UpdateBoxMonStatusAndTrainerInfo(mon, trainer, sel, metLocation)`
// 하나로 다 처리하고 `sel`이 갈래를 고른다. 우리가 닿는 갈래는 셋이다 —
// 0(잡았다·받았다) · 3(알을 받았다) · 6(부화했다). 나머지(1 통신교환 ·
// 2 팔파크 · 4 이벤트 배포 · 5 통신으로 받은 알)는 §9 밖이라 안 옮긴다.
//
// ⚠️ **알과 만난 자리는 서로를 지운다.** 원작이 갈래마다
// `ResetMetLocationAndDate`를 먼저 부른다 — 알 자리가 남아 있으면 잡은
// 포켓몬이 "알에서 나왔다"로 읽힌다 (`DeterminePokemonStatus`가 알 자리가
// 0인지로 먼저 가른다)
import type { PokemonInstance } from './instance'

/**
 * 만난 날. 원작은 RTC에서 그대로 받아 세 바이트로 넣는다 —
 * `year`는 2000을 뺀 값이다 (`RTCDate.year`가 0~99)
 */
export interface MetDate {
  /** 2000년부터 몇 해. 화면은 "20{year}년"으로 찍는다 */
  year: number
  month: number
  day: number
}

/**
 * 만난 자리 하나.
 *
 * `location`이 0이면 **안 새겨졌다**. 원작도 그 값을 쓰고
 * (`ResetMetLocationAndDate`), 이름을 찾을 때 "수수께끼의 장소"로 떨어뜨린다
 * (`StringTemplate_SetMetLocationName`)
 */
export interface MetPlace {
  location: number
  date: MetDate | null
}

/**
 * 개체의 출신.
 *
 * ⚠️ 칸 차례가 `save/schema.ts`의 `originSchema`와 **같아야 한다.**
 * 리포트를 다시 읽으면 zod가 스키마 차례로 다시 세우는데, 저장할 때 쓴 차례가
 * 다르면 `JSON.stringify`가 다른 글을 내고 검사합이 안 맞는다
 */
export interface Origin {
  /** 원래 트레이너 이름. 색은 성별로 갈린다 — 남자 파랑, 여자 빨강 */
  otName: string
  otGender: 'male' | 'female'
  /** 잡거나 부화한 자리. 알이면 아직 비어 있다 */
  met: MetPlace
  /** 잡았을 때의 레벨. 부화한 개체는 이 줄을 안 찍으므로 0이다 */
  metLevel: number
  /** 알을 받은 자리. 알에서 안 나왔으면 `location`이 0이다 */
  egg: MetPlace
  /** 이벤트 배포. 우리는 아직 세우는 자리가 없다 */
  fateful: boolean
}

/** 2000을 넘으면 지역명 표가 아니라 특별한 자리 표다 (`sub_02017038`) */
export const SPECIAL_MET_BASE = 2000
/** `SpecialMetLoc_GetId(1, 0)` — 육성가 부부 */
export const MET_DAYCARE = SPECIAL_MET_BASE + 0
/** `SpecialMetLoc_GetId(1, 1)` — 통신교환 */
export const MET_LINK_TRADE = SPECIAL_MET_BASE + 1

/** 자리 번호를 표와 칸으로 가른다 (`sub_02017038` · `sub_02017058`) */
export function metBank(location: number): { special: boolean; index: number } {
  return location >= SPECIAL_MET_BASE
    ? { special: true, index: location - SPECIAL_MET_BASE }
    : { special: false, index: location }
}

const EMPTY: MetPlace = { location: 0, date: null }

/** 오늘. 원작은 RTC를 읽는다 (`GetCurrentDate`) */
export function metToday(now: Date = new Date()): MetDate {
  return { year: now.getFullYear() - 2000, month: now.getMonth() + 1, day: now.getDate() }
}

export interface Trainer {
  name: string
  gender: 'male' | 'female'
}

/** 원래 트레이너를 가리는 데 필요한 것 전부 (`TrainerInfo`) */
export interface TrainerIdentity extends Trainer {
  id: number
  secretId: number
}

/**
 * 이 마리의 원래 트레이너가 나인가 (`BattleSystem_PokemonIsOT`).
 *
 * ⚠️ **ID만 보면 안 된다.** 원작이 ID·성별·이름 셋을 다 맞춰 본다 — ID는
 * 65536분의 1로 겹치고, 그 하나가 겹치면 남에게 받은 마리가 내 마리로 읽혀서
 * 경험치 1.5배도 말 안 듣기도 통째로 사라진다.
 *
 * 이 판정이 갈라 놓는 것 둘: 받은 마리의 **경험치 1.5배**(`expFor`)와
 * **말 안 듣기**(`battle/meta/obedience.ts`)
 */
export function isOriginalTrainer(
  mon: { otId: number; otSecretId: number; origin: Origin },
  me: TrainerIdentity,
): boolean {
  return mon.otId === me.id
    && mon.otSecretId === me.secretId
    && mon.origin.otGender === me.gender
    && mon.origin.otName === me.name
}

/**
 * 잡았거나 받았다 (`sel = 0`).
 *
 * 알 자리를 지우고 만난 자리와 **그때 레벨**을 새긴다. 원작은 레벨을 개체에서
 * 다시 읽으므로(`SetMetLevelToCurrentLevel`) 진화·레벨업 뒤에 불러도 그 순간
 * 값이 들어간다 — 부르는 자리가 잡은 직후뿐이라 같은 값이다
 */
export function caughtAt(
  trainer: Trainer, location: number, level: number, date: MetDate,
): Origin {
  return {
    otName: trainer.name,
    otGender: trainer.gender,
    met: { location, date },
    metLevel: level,
    egg: EMPTY,
    fateful: false,
  }
}

/**
 * 알을 받았다 (`sel = 3`).
 *
 * 알 자리에 날짜가 들어가고 만난 자리는 **빈 채로 둔다** — 아직 안 만났다.
 * 육성가 알이면 자리가 2000이다
 */
export function eggFrom(trainer: Trainer, location: number, date: MetDate): Origin {
  return {
    otName: trainer.name,
    otGender: trainer.gender,
    met: EMPTY,
    metLevel: 0,
    egg: { location, date },
    fateful: false,
  }
}

/**
 * 알이 깼다 (`sel = 6`).
 *
 * 알 자리는 그대로 두고 만난 자리에 **깬 자리와 오늘**을 넣는다.
 * 레벨은 안 새긴다 — 부화한 개체의 메모에는 Lv 줄 자체가 없다.
 *
 * ⚠️ 원작은 원래 트레이너가 **다를 때만** 만난 자리를 알 자리로 옮겨 적는다
 * (`sub_0207884C`가 0). 남에게 받은 알은 "링크교환에서 받아 여기서 깼다"가
 * 되고, 내 알은 육성가 자리가 그대로 남는다. 통신이 없으므로 늘 내 알이다
 */
export function hatchedAt(origin: Origin, location: number, date: MetDate): Origin {
  return { ...origin, met: { location, date } }
}

/**
 * 트레이너 메모의 갈래 (`DeterminePokemonStatus`).
 *
 * 0~20을 그대로 돌려준다. 번호가 곧 문장 틀을 고르는 열쇠라 이름을 안 붙인다 —
 * 이름을 붙이면 원작의 스무 갈래 중 어디가 빠졌는지가 안 보인다
 */
export function memoStatus(origin: Origin, otMatches: boolean, isEgg = false): number {
  const mine = otMatches
  // ⚠️ **알인지가 맨 먼저다.** 알은 알 자리가 차 있어도 16~20으로 간다 —
  // 안 가르면 아직 안 깬 알에 성격과 개성이 붙어서 안에 든 것이 새어 나간다
  if (isEgg) {
    if (!origin.fateful) return mine ? 16 : 17
    if (!mine) return 19
    return origin.egg.location === 3000 + 1 ? 20 : 18
  }
  if (origin.egg.location === 0) {
    if (origin.fateful) return mine ? 7 : 8
    if (origin.met.location === MET_LINK_TRADE) return 2
    return mine ? 0 : 1
  }
  if (origin.fateful) {
    if (origin.egg.location === SPECIAL_MET_BASE + 2) return mine ? 13 : 14
    if (origin.egg.location === 3000 + 1) return mine ? 11 : 12
    return mine ? 9 : 10
  }
  // 육성가(2000)·통신교환(2001)·그리고 원작이 같이 묶어 둔 2009~2011
  const KNOWN_EGG = [MET_DAYCARE, MET_LINK_TRADE, 2009, 2010, 2011]
  if (KNOWN_EGG.includes(origin.egg.location)) return mine ? 5 : 6
  return mine ? 3 : 4
}

/** 갈래 → 요약 뱅크의 문장 틀 번호. 원작이 `switch`로 늘어놓은 것을 표로 편 것 */
export function memoTemplate(status: number): number {
  if (status <= 15) return 49 + status
  // 16~20은 알 화면이다. 101·102·103·103·104 — 103이 두 번 나온다
  return [101, 102, 103, 103, 104][status - 16] ?? 101
}

/** 갈래가 알인가. 알은 성격도 개성도 안 찍고 **친밀도 한 줄**만 붙는다 */
export function memoIsEgg(status: number): boolean {
  return status >= 16
}

/**
 * 알의 친밀도 한 줄 (`InitializeFriendshipLevelString`).
 *
 * ⚠️ 알에게 친밀도 칸은 **남은 부화 걸음**이다. 그래서 작을수록 곧 깬다 —
 * 105가 "곧 나온다"고, 108이 "아직 멀었다"다
 */
export function eggFriendshipLine(friendship: number): number {
  if (friendship <= 5) return 105
  if (friendship <= 10) return 106
  if (friendship <= 40) return 107
  return 108
}

/** 성격 한 줄. 뱅크 24부터 성격 번호만큼 뒤 */
export function natureLine(nature: number): number {
  return 24 + nature
}

/**
 * 다섯 맛 차례. 성격이 올리는 능력에 붙은 맛을 좋아한다
 * (`sNatureFlavorAffinities`가 이 짝으로 되어 있다)
 */
export const FLAVOR_STATS = ['atk', 'spa', 'spe', 'spd', 'def'] as const

/**
 * 좋아하는 맛 한 줄 (`InitializeFlavorAffinityString`).
 *
 * 무보정 성격은 좋아하는 맛이 없어서 70번("무엇이든 잘 먹는다")이다
 */
export function flavorLine(up: string | null): number {
  const at = FLAVOR_STATS.indexOf(up as (typeof FLAVOR_STATS)[number])
  return at < 0 ? 70 : 65 + at
}

/**
 * 개성이 보는 능력 차례 (`InitializeIVsString`).
 *
 * ⚠️ **스피드가 셋째다.** 능력 화면 차례(HP·공격·방어·특공·특방·스피드)가
 * 아니라 개체값 저장 차례다 — 잘못 놓으면 특공이 높은 개체에게 스피드 개성이 붙는다
 */
export const CHARACTERISTIC_STATS = ['hp', 'atk', 'def', 'spe', 'spa', 'spd'] as const

/**
 * 개성 한 줄.
 *
 * PID % 6에서 **시작해서** 여섯 개체값을 돌며 가장 큰 것을 고른다. 앞선 것이
 * 이기므로 같은 값이면 시작 자리에 가까운 쪽이다 — 그래서 PID가 개성을 가른다.
 * 고른 능력과 그 개체값 % 5가 서른 줄 중 하나를 고른다
 */
export function characteristicLine(pid: number, ivs: Record<string, number>): number {
  const start = pid % 6
  let best = start
  let value = ivs[CHARACTERISTIC_STATS[start]!] ?? 0
  for (let i = 1; i < 6; i++) {
    const at = (start + i) % 6
    const iv = ivs[CHARACTERISTIC_STATS[at]!] ?? 0
    if (value < iv) { best = at; value = iv }
  }
  return 71 + best * 5 + (value % 5)
}

/** 새 리포트의 개체가 갖는 빈 출신. 아직 아무 데서도 안 왔다 */
export function noOrigin(trainer: Trainer): Origin {
  return {
    otName: trainer.name,
    otGender: trainer.gender,
    met: EMPTY,
    metLevel: 0,
    egg: EMPTY,
    fateful: false,
  }
}

/** 내가 잡은 것인가. 이름·성별·ID 셋이 다 맞아야 한다 (`sub_0207884C`) */
export function otMatches(mon: PokemonInstance, trainer: Trainer, id: number): boolean {
  return mon.otId === id
    && mon.origin.otName === trainer.name
    && mon.origin.otGender === trainer.gender
}
