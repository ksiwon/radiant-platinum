// 파티 화면의 글 고르기 — 어떤 일로 열렸는가 → 뱅크 453의 줄 번호 (순수 함수).
//
// 원작은 파티 화면이 열린 목적에 따라 아래 글 창의 안내문을 바꾼다 (`main.c:305-327`). 우리도 같은 표를 쓴다.
// 줄 번호는 `PARTY_MENU_TEXT`(`data/uiText.ts`)가 갖고 있고, 여기는 **무엇이 어느 줄이 되는가**만 안다.
// 시험이 브라우저 없이 그 표를 본다 (`partyText.test.ts`).
import { PARTY_MENU_TEXT } from '../../data/uiText'

/** 파티 화면이 지금 하는 일. 아래 글 띠의 안내문을 정한다 */
type PartyMode = 'choose' | 'moveTo' | 'give' | 'use' | 'teach' | 'milk'

/** 이 화면이 열린 까닭 — 위쪽 상태 기계가 아는 것들을 모은 것 */
export interface PartyModeInput {
  /** 자리를 바꾸려고 집어 든 마리가 있다 */
  held: boolean
  /** 우유마시기 · 알낳기로 받을 마리를 고르는 중이다 */
  milkPick: boolean
  /** 가방의 「건네준다」로 열렸다 */
  giving: boolean
  /** 가방의 「쓴다」로 열렸다. 무엇을 쓰는가 */
  using: 'heal' | 'tmhm' | 'evoStone' | 'mail' | 'gracidea' | null
}

/**
 * 어느 안내문인가 (`main.c:305-327`의 `sMessageIds`).
 *
 * 집은 마리가 있으면 그것이 먼저다 — 원작도 집으면 「어디로 이동할까?」로 바뀐다. 기본과 스크립트가 고르라고 연
 * 화면은 같은 29번이다
 */
export function partyMode(input: PartyModeInput): PartyMode {
  if (input.milkPick) return 'milk'
  if (input.held) return 'moveTo'
  if (input.giving) return 'give'
  if (input.using === 'tmhm') return 'teach'
  if (input.using !== null) return 'use'
  return 'choose'
}

const MODE_LINE: Readonly<Record<PartyMode, number>> = {
  choose: PARTY_MENU_TEXT.choose,
  moveTo: PARTY_MENU_TEXT.moveTo,
  give: PARTY_MENU_TEXT.give,
  use: PARTY_MENU_TEXT.use,
  teach: PARTY_MENU_TEXT.teach,
  milk: PARTY_MENU_TEXT.milk,
}

/** 그 모드의 안내문이 있는 뱅크 453의 줄 */
export function modeLine(mode: PartyMode): number {
  return MODE_LINE[mode]
}

/**
 * 갈래 창을 연 마리에 대한 물음의 줄. 알이면 198 「알을 어떻게 할까?」, 아니면 37 「{이름} 어떻게 할까?」
 * (`PartyMenu_LoadContextMenuPrompt` · `windows.c:819`)
 */
export function askLine(isEgg: boolean): number {
  return isEgg ? PARTY_MENU_TEXT.eggAsk : 37
}

/** 기술머신 · 진화의돌 모드에서 판마다 붙는 한 줄의 가름 */
export type PlateVerdict = 'canLearn' | 'cannotLearn' | 'alreadyKnows' | 'canUse' | 'cannotUse'

const VERDICT_LINE: Readonly<Record<PlateVerdict, number>> = {
  canLearn: PARTY_MENU_TEXT.canLearn,
  cannotLearn: PARTY_MENU_TEXT.cannotLearn,
  alreadyKnows: PARTY_MENU_TEXT.alreadyKnows,
  canUse: PARTY_MENU_TEXT.canUse,
  cannotUse: PARTY_MENU_TEXT.cannotUse,
}

/** 판 줄의 뱅크 453 줄 번호 (175~179) */
export function verdictLine(verdict: PlateVerdict): number {
  return VERDICT_LINE[verdict]
}

/** 하는 쪽(175 · 178)만 강조한다 — 못 하는 판은 흐리고, 이미 아는 판은 흐리다 */
export function verdictIsGood(verdict: PlateVerdict): boolean {
  return verdict === 'canLearn' || verdict === 'canUse'
}

/** 기술머신 판정 결과(`teachMoveCheck`의 `kind`) → 판 줄. 칸이 차서 잊을 것을 묻는 쪽(`mustForget`)도 배울 수 있다 */
export function teachVerdict(kind: 'already' | 'cannot' | 'mustForget' | 'learn'): PlateVerdict {
  if (kind === 'already') return 'alreadyKnows'
  if (kind === 'cannot') return 'cannotLearn'
  return 'canLearn'
}

/** 진화의돌 판정(`evolutionTarget`이 null이 아닌가) → 판 줄 */
export function stoneVerdict(canEvolve: boolean): PlateVerdict {
  return canEvolve ? 'canUse' : 'cannotUse'
}
