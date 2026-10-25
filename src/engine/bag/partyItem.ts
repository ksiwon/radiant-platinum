// 파티 화면에서 마리에게 쓰는 도구의 갈래 (`ApplyItemEffectOnPokemon` · `NormalizeItemEffect`)
//
// 화면이 어느 길로 보낼지와 시험이 「몇 종이 도는가」를 세는 기준이 같은 함수다.
// 순서가 원작의 검사 순서다 — 이상한사탕이 상태·체력보다 먼저고, 성스러운재가
// 마리 고르기보다 먼저고, PP 도구는 `CheckItemEffects`보다 먼저 기술을 묻는다.
import type { Item } from '../../data/schema'
import { isLevelUpItem } from './rareCandy'
import { isEvItem } from './evUse'
import { isPpUpItem, needsMoveChoice } from './ppUse'
import { isSacredAsh } from './sacredAsh'

export type PartyItemKind =
  /** 쓰러진 전원을 살린다 — 마리를 안 고른다 */
  | 'sacredAsh'
  /** 이상한사탕 */
  | 'candy'
  /** 포인트업 · 포인트맥스 — 기술 칸을 고른다 */
  | 'ppUp'
  /** 에테르 · 맥스에테르 · 잎새열매 — 기술 칸을 고른다 */
  | 'ppRestoreOne'
  /** 비타민 · 노력치 깎는 열매 */
  | 'ev'
  /** 체력 · 상태 · 엘릭서 · 되살리기 — 배틀 가방과 같은 계산기 */
  | 'plan'

export function partyItemKind(item: Item): PartyItemKind {
  if (isSacredAsh(item)) return 'sacredAsh'
  if (isLevelUpItem(item)) return 'candy'
  if (isPpUpItem(item)) return 'ppUp'
  if (needsMoveChoice(item)) return 'ppRestoreOne'
  if (isEvItem(item)) return 'ev'
  return 'plan'
}
