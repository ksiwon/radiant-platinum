// 교체 화면의 순수한 규칙 — 처음 커서 · 못 고르는 까닭의 롬 줄 · 상성 표시.
//
// 화면(`SwitchScreen`)이 그리는 일만 하도록 판단을 여기로 뺀다. 시험이 이 함수를 직접 본다.
import { matchLabel, sharedMatch, type MoveMatch } from '../../engine/battle/movePreview'
import type { DataLocale } from '../../data/gameData'
import type { Move, Stats } from '../../data/schema'
import { PARTY } from './romText'

/**
 * 처음 커서가 설 칸 — **첫 번째로 고를 수 있는 칸**이다.
 *
 * ⚠️ 한때 0번에 섰다. 기절한 뒤에는 0번이 쓰러진 마리라 사람도 한 번 더 눌러야 했고 하네스가 이 때문에 두 번
 * 섰다. 하네스는 맨 위로 올린 뒤 시작하므로 처음 자리가 어디든 영향이 없다. 고를 수 있는 칸이 없으면 0이다
 */
export function firstPickable(can: readonly boolean[]): number {
  const at = can.findIndex(Boolean)
  return at < 0 ? 0 : at
}

/** 커서 밑의 한 마리를 두고 원작이 하는 말(`CheckCanSwitchPokemon`의 순서)의 롬 줄. 고를 수 있으면 원래 물음이다 */
export function whyLine(
  slot: { fainted: boolean, active: boolean } | null, can: boolean,
): number | null {
  if (slot === null) return null
  if (slot.fainted) return PARTY.cantSwitchWithFaintedPokemon
  if (slot.active) return PARTY.cantSwitchWithPokemonAlreadyInBattle
  // 쓰러지지도 나와 있지도 않은데 못 고르면 앞 자리가 이미 골랐다 (더블)
  return can ? PARTY.chooseAPokemon : PARTY.cantSwitchWithAlreadySelectedPokemon
}

/** 상대 한 마리 — 이름은 둘이 갈릴 때 붙인다 */
export interface Foe {
  name: string
  types: readonly number[] | null
  known: boolean
}

/** 한 기술의 상성 표시. `split`은 더블에서 상대 둘의 결과가 다를 때 이름을 붙여 둘 다 적는 꼴이다 */
export type MatchView =
  | { kind: 'one', match: MoveMatch }
  | { kind: 'split', parts: { name: string, match: MoveMatch }[] }

export function matchView(data: Move | undefined, foes: readonly Foe[], ivs: Stats | null): MatchView | null {
  const shared = sharedMatch(data, foes, ivs)
  if (shared !== null) return { kind: 'one', match: shared }
  if (foes.length < 2) return null
  const parts: { name: string, match: MoveMatch }[] = []
  for (const foe of foes) {
    const match = sharedMatch(data, [foe], ivs)
    if (match !== null) parts.push({ name: foe.name, match })
  }
  return parts.length > 0 ? { kind: 'split', parts } : null
}

/** 표시 글 — 기술 메뉴와 같은 말이다 */
export function matchText(view: MatchView, locale: DataLocale): string {
  return view.kind === 'one'
    ? matchLabel(view.match, locale)
    : view.parts.map((p) => `${p.name} ${matchLabel(p.match, locale)}`).join(' · ')
}

const RANK: Record<MoveMatch, number> = { super: 3, resisted: 2, immune: 1 }

/**
 * 띠 칸 모서리의 표시 하나 — 그 마리 기술 가운데 **가장 잘 듣는** 것이다.
 *
 * 보통으로 듣는 기술(표시가 없는 피해 기술)이 하나라도 있으면 그 마리는 약점이 아니면 안 적는다 — 「효과가
 * 없음」만 띄우면 보통으로 칠 수 있는 마리를 못 칠 것처럼 보인다. 피해 기술이 전부 막혔을 때만 막힌 쪽을 적는다.
 * 변화 기술(위력 ≤ 1)은 세지 않는다. 더블에서 둘이 갈리면 둘 중 나은 쪽이다
 */
export function bestMatch(
  moves: readonly (Move | undefined)[], foes: readonly Foe[], ivs: Stats | null,
): MoveMatch | null {
  let best: MoveMatch | null = null
  let plain = false
  for (const data of moves) {
    if (!data || data.power <= 1) continue
    const view = matchView(data, foes, ivs)
    if (view === null) { plain = true; continue }
    const ones = view.kind === 'one' ? [view.match] : view.parts.map((p) => p.match)
    for (const m of ones) if (best === null || RANK[m] > RANK[best]) best = m
  }
  if (best === 'super') return best
  return plain ? null : best
}
