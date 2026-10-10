// 시작 메뉴가 어떤 줄을 어떤 차례로 내는가 — 순수 함수 (`start_menu.c`의 `StartMenu_MakeOptionList`).
//
// 원작 차례는 고정이다: 포기한다 → 채팅 → 도감 → 포켓몬 → 가방 → 트레이너 카드 → 리포트 → 설정 → 닫는다.
// 숨김은 **흐리게 두지 않고 목록에서 뺀다**(원작도 뺀다). 우리 지름길 「공중날기」는 원작 시작 메뉴에 없고
// 포켓몬 다음, 가방 앞에 선다 — 판정은 부르는 쪽(`flyVerdictNow`)이 하고 여기서는 자리만 정한다.
//
// ⚠️ **끝 다섯 줄은 늘 가방 · 카드 · 리포트 · 설정 · 닫는다다**(사파리에서는 리포트가 빠져 넷). 하네스가 뒤에서부터
// 세어 리포트(끝에서 셋째)와 가방(끝에서 다섯째)을 찾는다(`drive.mjs`의 `n - 3`).
import type { MenuIconKey } from './menuIcon'

export type StartKey =
  | 'retire' | 'pokedex' | 'party' | 'fly' | 'bag' | 'trainerCard' | 'save' | 'options' | 'exit'

/** 줄을 정하는 사정 */
export interface StartMenuState {
  /** 도감을 받았는가 (`Pokedex_IsObtained`) */
  hasDex: boolean
  /** 첫 파트너를 받았는가 (`SystemVars_GetPlayerStarter`) — 우리는 파티가 비지 않았는가로 본다 */
  hasPartner: boolean
  /** 사파리게임 중인가 (`SystemFlag_CheckSafariGameActive`) */
  inSafari: boolean
  /** 교감광장 안인가 (`MapHeader_IsAmitySquare`) */
  inAmity: boolean
  /** 공중날기를 쓸 수 있는가 (`flyVerdictNow() === null`) */
  canFly: boolean
}

/**
 * `MAP_HEADER_AMITY_SQUARE` — 원작 맵 헤더 번호 (`generated/map_headers.txt` 254째 줄 = 253번).
 * 같은 표에서 `MAP_HEADER_PAL_PARK`가 251이고, 그 번호를 이미 `engine/audio/songs`가 쓴다
 */
export const MAP_AMITY_SQUARE = 253

/**
 * 「포기한다」가 거는 스크립트 — `SCRIPT_ID(SAFARI_GAME, 21)` (`start_menu.c:1455`).
 * `SCRIPT_ID_OFFSET_SAFARI_GAME`가 8800이다(`engine/world/safari`의 `SCRIPT_SAFARI_BASE`)
 */
export const SAFARI_RETIRE_SCRIPT = 8800 + 21

/**
 * 이 판에서 보이는 줄의 열쇠를 원작 차례로.
 *
 * - **일반** (`StartMenu_GetNormalHiddenOptions`): 도감은 받기 전에 없고, 포켓몬은 첫 파트너 전에 없다.
 *   교감광장에서는 포켓몬과 가방이 없다. 채팅과 포기한다는 늘 없다.
 * - **사파리** (`StartMenu_GetSafariHiddenOptions`): 리포트와 채팅만 숨긴다 — 포기한다가 맨 위에 서고,
 *   나머지는 일반 숨김 규칙을 **안 본다**(원작 목록이 따로다)
 */
export function startMenuKeys(state: StartMenuState): StartKey[] {
  const keys: StartKey[] = []
  if (state.inSafari) {
    keys.push('retire', 'pokedex', 'party', 'bag', 'trainerCard', 'options', 'exit')
    return keys
  }
  if (state.hasDex) keys.push('pokedex')
  if (state.hasPartner && !state.inAmity) keys.push('party')
  if (state.canFly) keys.push('fly')
  if (!state.inAmity) keys.push('bag')
  keys.push('trainerCard', 'save', 'options', 'exit')
  return keys
}

/** 줄의 아이콘 열쇠. 공중날기는 원작 아이콘이 없어 `null` — 그 줄은 날 포켓몬의 아이콘을 쓴다 */
export function iconKeyOf(key: StartKey): MenuIconKey | null {
  switch (key) {
    case 'fly': return null
    case 'party': return 'party'
    default: return key
  }
}

/** 엿보기가 보여 주는 것. 없으면 `null` — 엿보기를 **안 띄운다**(빈 판을 남기지 않는다) */
export type PeekKind = 'dex' | 'party' | 'fly' | 'bag' | 'card' | 'report'

export function peekKindOf(key: StartKey): PeekKind | null {
  switch (key) {
    case 'pokedex': return 'dex'
    case 'party': return 'party'
    case 'fly': return 'fly'
    case 'bag': return 'bag'
    case 'trainerCard': return 'card'
    case 'save': return 'report'
    default: return null
  }
}
