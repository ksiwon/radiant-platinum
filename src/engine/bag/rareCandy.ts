// 이상한사탕 — 필드에서 쓰기 (`docs/orders/RARE_CANDY_20260917.md`)
//
// 원작은 파티 화면이 도구를 고를 때 **레벨업 칸을 상태·체력보다 먼저** 본다
// (`NormalizeItemEffect` → `ITEMEFFECT_RARE_CANDY`). 여기에는 화면이 없는 계산만
// 둔다 — 올린 뒤의 개체, 오르기 전후 능력치, 그 레벨에서 배우는 기술.
import type { Item, Species, Stats } from '../../data/schema'
import { MAX_LEVEL, expToNextLevel } from '../pokemon/exp'
import {
  clampFriendship, HOLD_EFFECT_FRIENDSHIP_UP, LUXURY_BALL,
} from '../pokemon/friendship'
import { setExp, statsOf, type PokemonInstance } from '../pokemon/instance'

function num(item: Item, key: string): number {
  return item.param?.[key] ?? 0
}

/** 레벨을 올리는 도구인가 (`ITEM_PARAM_LEVEL_UP`). 롬에는 이상한사탕 하나뿐이다 */
export function isLevelUpItem(item: Item): boolean {
  return num(item, 'levelUp') !== 0
}

/** 지금 먹여서 뭐라도 되는가 (`Pokemon_CheckItemEffects`) — 레벨 100 미만이면 된다 */
export function canLevelUp(mon: PokemonInstance): boolean {
  return !mon.isEgg && mon.level < MAX_LEVEL
}

interface LevelUpResult {
  mon: PokemonInstance
  /** 오르기 전 능력치 — 화면이 「+n」을 적는다 */
  before: Stats
  /** 오른 뒤 능력치 */
  after: Stats
  /** 새 레벨에서 배우는 기술. 롬의 차례 그대로, 이미 아는 것도 들어 있다 */
  moves: number[]
}

/**
 * 한 레벨 올린다 (`Pokemon_ApplyItemEffects`의 레벨업 갈래).
 *
 * 1. 경험치에 「다음 레벨까지」를 더한다 — 올린 뒤의 경험치는 **새 레벨의 시작값**이다
 *    (`Pokemon_GetExpToNextLevel`이 `다음 레벨 기준 − 지금`이다).
 * 2. 체력은 원작의 두 자리가 정한다:
 *    - `Pokemon_CalcStats` — 서 있는 마리는 `hp += 새 최대 − 옛 최대`.
 *      쓰러진 마리는 거기서 0 그대로다.
 *    - 사탕은 `revive`와 `levelUp`을 **둘 다** 단다. 그래서 쓰러진 마리면
 *      `RestorePokemonHP(0, 새 최대, 새 최대 − 옛 최대)`가 한 번 더 돈다 —
 *      **최대 체력이 늘어난 만큼으로 되살아난다.** 그 함수는 최대가 1이면
 *      무엇을 넘겨도 1을 채운다(껍질몬).
 *
 * 친밀도는 따로 준다 (`fieldFriendship`) — 원작도 효과가 들었을 때만 끝에서 움직인다.
 * 레벨 100이면 null이다
 */
export function levelUpOnce(mon: PokemonInstance, species: Species): LevelUpResult | null {
  if (!canLevelUp(mon)) return null
  const before = statsOf(mon, species)
  const next: PokemonInstance = { ...mon }
  setExp(next, species, mon.exp + expToNextLevel(species.growthRate, mon.exp))
  const after = statsOf(next, species)
  if (mon.hp > 0) {
    next.hp = after.hp === 1 ? 1 : mon.hp + (after.hp - before.hp)
  } else {
    next.hp = after.hp === 1 ? 1 : Math.min(after.hp, after.hp - before.hp)
  }
  const moves = species.learnset.filter((e) => e.level === next.level).map((e) => e.move)
  return { mon: next, before, after, moves }
}

/** 필드 친밀도에 쓰는 개체의 사정 */
interface FieldFriendshipContext {
  /** 지닌 도구의 홀드 효과 */
  heldEffect: number
  /** 지금 자리의 **지역명 번호** (`GetCurrentMapLabel`) */
  mapLabel: number
}

/**
 * 필드에서 도구를 먹인 뒤의 친밀도 (`Pokemon_ApplyItemEffects` 끝 ·
 * `UpdatePokemonFriendship`).
 *
 * ⚠️ **배틀·걷기와 곱하는 차례가 다르다.** 이 루틴은 평온의방울 1.5배를
 * **먼저** 곱하고(`change * 150 / 100` — 정수) 그 다음에 럭셔리볼과 알 자리를
 * 1씩 더한다. `Pokemon_UpdateFriendship`은 더한 뒤에 곱한다 — 같은 +5가
 * 여기서는 7+1=8, 거기서는 (5+1)×1.5=9다. 그리고 여기서는 **지닌 도구**를 본다.
 *
 * 구간은 지금 친밀도로 가른다: 100 미만 · 200 미만 · 그 이상.
 * 효과가 안 들었으면 부르지 않는다 — 원작이 그 전에 돌아간다
 */
export function fieldFriendship(
  item: Item, mon: PokemonInstance, ctx: FieldFriendshipContext,
): number {
  const now = mon.friendship
  const band = now < 100 ? 'Low' : now < 200 ? 'Med' : 'High'
  if (num(item, `giveFriendship${band}`) === 0) return now
  let change = num(item, `friendship${band}`)
  if (change > 0) {
    if (ctx.heldEffect === HOLD_EFFECT_FRIENDSHIP_UP) change = Math.trunc((change * 150) / 100)
    if (mon.ball === LUXURY_BALL) change++
    if (mon.origin.egg.location === ctx.mapLabel) change++
  }
  return clampFriendship(now + change)
}
