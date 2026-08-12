// 화면에서 폼을 갈아입히는 다리 (PARITY §3.4)
//
// 규칙은 전부 `engine/pokemon/form`에 있다. 여기 있는 것은 **표가 아직 안 왔을
// 때 아무것도 안 하는** 껍데기뿐이다 — 능력치를 못 세는 채로 폼만 바꾸면
// 기라티나가 어나더의 수치로 오리진이 된다 (BUGS.md §2.15).
import type { SpeciesLookup, MoveTable } from '../../data/gameData'
import { afterHeldItem, type FormTables } from '../../engine/pokemon/form'
import { statsOf, type PokemonInstance } from '../../engine/pokemon/instance'

/** 표 둘이 다 있어야 폼을 건드린다 */
export function formTables(
  species: SpeciesLookup | null | undefined, moves: MoveTable | null | undefined,
): FormTables | null {
  if (!species || !moves) return null
  return {
    maxHp: (mon) => statsOf(mon, species.of(mon)).hp,
    maxPp: (move) => moves.byId.get(move)?.pp ?? 5,
  }
}

/**
 * 지닌 물건이 바뀐 개체.
 *
 * ⚠️ 표가 없으면 **폼을 안 건드리고 그대로 돌려준다.** 반쯤 바뀐 개체를
 * 리포트에 넣느니 도구만 바뀐 편이 낫다 — 다음에 표가 오면 같은 자리가 다시 돈다
 */
export function withHeldItem(
  mon: PokemonInstance,
  species: SpeciesLookup | null | undefined,
  moves: MoveTable | null | undefined,
): PokemonInstance {
  const tables = formTables(species, moves)
  return tables ? afterHeldItem(mon, tables) : mon
}
