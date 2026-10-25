// 성스러운재 — 쓰러진 파티 마리 **전원**을 살린다 (`PartyMenuCB_HandleSacredAsh`)
//
// 원작은 마리를 고르지 않는다. 파티 화면이 열리자마자(`CheckItemSacredAsh`가 참이면
// 「누구에게 쓰겠습니까?」도 안 띄운다) 앞에서부터 쓰러진 마리를 하나씩 찾아
// `Pokemon_ApplyItemEffects`를 돌리고, 마리마다 「기력을 회복했다」를 A·B로 넘긴다.
// **도구는 마지막 마리 뒤에 한 번만** 빠진다. 쓰러진 마리가 없으면 105 「써도 효과가 없다!」다.
import type { Item } from '../../data/schema'
import type { PokemonInstance } from '../pokemon/instance'

/** `ITEM_PARAM_REVIVE_ALL` — 롬에 성스러운재 하나뿐이다 */
export function isSacredAsh(item: Item): boolean {
  return (item.param?.reviveAll ?? 0) !== 0
}

/**
 * 살릴 자리들 (`FindNextFaintedMember` — 앞에서부터).
 * 알은 거른다 — 원작의 알은 체력이 0이 아니다(`Egg_CreateEgg`가 능력치를 센다)
 */
export function faintedSlots(party: readonly PokemonInstance[]): number[] {
  const out: number[] = []
  party.forEach((mon, i) => { if (!mon.isEgg && mon.hp <= 0) out.push(i) })
  return out
}

/**
 * 한 마리를 최대 체력으로 (`RestorePokemonHP` — `hpRestored` 255).
 * 상태이상은 안 건드린다 — 성스러운재에는 상태 칸이 없다
 */
export function reviveFull(mon: PokemonInstance, maxHp: number): PokemonInstance {
  return { ...mon, hp: maxHp }
}
