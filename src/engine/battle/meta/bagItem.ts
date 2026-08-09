// 배틀에서 가방 도구를 쓴다 (PLAN §7.8) — `BattleSystem_UseBagItem`을 그대로 옮긴다.
//
// **무엇을 할지는 우리가 안 정한다.** 도구 하나가 배틀에서 하는 일은 롬의
// `ItemPartyParam` 20바이트에 전부 적혀 있고(`items.json`의 `param`), 그것을
// 읽어 적용하는 순서까지 `src/battle/battle_system.c`의 한 함수에 있다.
// 이 파일은 그 함수를 계산과 적용으로 가른 앞쪽이다 — **무엇을 할지만** 정하고
// sim은 안 만진다.
//
// 원본이 `result`(BOOL) 하나로 "이 도구가 뭐라도 했는가"를 돌려주고, 아무것도
// 안 했으면 배틀 파티 화면이 "효과가 없을 것 같다"를 띄우고 턴을 안 쓴다
// (`battle_party.c`의 `PartyUseItemScreen`). 여기서는 그 자리가 `null`이다.
//
// sim을 import 하지 않는다 — 숫자와 상태만 본다.
import type { Item } from '../../../data/schema'
import type { Status } from '../../pokemon/instance'
import type { BoostStat } from '../events'

/**
 * 회복량 칸의 뜻 (`ITEM_PARAM_HP_RESTORED`).
 *
 * 254·253은 개수가 아니라 표지다 — 원본이 `switch (param)`으로 가른다.
 * 기력의조각이 254(절반), 자뭉열매가 253(¼)이고 둘 다 0이 되면 1로 올린다
 */
const RESTORE_ALL = 255
const RESTORE_HALF = 254
const RESTORE_QUARTER = 253

/** PP 칸도 같은 자리에 표지가 있다. PP회복·PP맥스가 127이다 */
const PP_RESTORE_ALL = 127

/** 롬의 `ITEM_PARAM_*_STAGES` → 우리 랭크 이름. 순서는 원본의 검사 순서다 */
const STAGE_PARAMS: readonly (readonly [string, BoostStat])[] = [
  ['atkStages', 'atk'],
  ['defStages', 'def'],
  ['spatkStages', 'spa'],
  ['spdefStages', 'spd'],
  ['speedStages', 'spe'],
  ['accStages', 'accuracy'],
]

/** 상태이상 하나를 푸는 칸 이름 */
const CURE_PARAMS: readonly (readonly [string, readonly Status[]])[] = [
  ['healSleep', ['slp']],
  ['healPoison', ['psn', 'tox']],
  ['healBurn', ['brn']],
  ['healFreeze', ['frz']],
  ['healParalysis', ['par']],
]

/** 4세대 랭크 상한. `MAX_STAT_STAGE`는 12(=+6)이고 우리 뷰는 0을 가운데로 쓴다 */
const MAX_STAGE = 6

/** `BATTLE_POCKET_MASK_*` (`constants/items.h`) */
export const BATTLE_POCKET = {
  ball: 1,
  battle: 2,
  hp: 4,
  status: 8,
  pp: 16,
} as const

/** 도구를 먹일 대상의 지금 상태. 벤치에 있는 애도 여기 모양으로 온다 */
export interface ItemTarget {
  hp: number
  maxHp: number
  status: Status
  fainted: boolean
  /**
   * 지금 **나와 있는** 한 마리인가.
   *
   * ⚠️ 원본의 `selectedSlot == partySlot || targetSlot == partySlot`이다. 랭크·
   * 급소·혼란·헤롱헤롱은 배틀 개체에만 있는 값이라 벤치에서는 아예 안 걸린다 —
   * 벤치에 플러스파워를 먹이면 "효과가 없을 것 같다"가 뜬다
   */
  active: boolean
  confused: boolean
  attracted: boolean
  /** 지금 랭크. 없는 칸은 0 */
  boosts: Partial<Record<BoostStat, number>>
  /** 이미 급소율이 올라 있는가 (`VOLATILE_CONDITION_FOCUS_ENERGY`) */
  focusEnergy: boolean
  /** 우리 쪽에 흰안개가 이미 깔려 있는가 (`SIDE_CONDITION_MIST`) */
  mist: boolean
  /** 기술 칸의 남은/최대 PP. 순서는 sim의 칸 순서와 같다 */
  moves: readonly { pp: number; maxPp: number }[]
}

/**
 * 가방에서 고른 도구 한 칸.
 *
 * 번호와 자료를 같이 들고 다닌다 — `Item`에는 자기 번호가 없다. 번호가 곧
 * `items.json`의 배열 자리이고 이름·아이콘도 그 번호로 찾는다
 */
export interface BagItem {
  id: number
  data: Item
}

/** 도구 하나가 이번에 실제로 할 일 */
export interface ItemPlan {
  /** 채울 체력. 0이면 안 채운다 */
  heal: number
  /** 기절에서 되살리는가. `heal`이 되살린 뒤의 체력이다 */
  revive: boolean
  /** 풀 상태이상. 지금 걸린 것과 겹치는 것만 담긴다 */
  cure: Status[]
  /** 풀 휘발 상태 */
  clear: ('confusion' | 'attract')[]
  /** 흰안개 5턴 (`guardSpec`) */
  mist: boolean
  /** 한 단씩 올릴 랭크 */
  boosts: BoostStat[]
  /** 급소율 한 단 */
  focusEnergy: boolean
  /** PP를 채울 칸(0부터)과 그 칸에 넣을 양 */
  pp: { slot: number; amount: number }[]
}

/** 0이 아닌 칸만 실려 오므로 없는 칸은 0으로 본다 */
function num(item: Item, key: string): number {
  return item.param?.[key] ?? 0
}

/**
 * 이 도구는 파티에서 **누구를 먹일지 골라야 하는가**.
 *
 * 원작 배틀 가방은 주머니로 가른다 (`battle_bag.c`의 `TryUseItem`) — 배틀용은
 * 나와 있는 애에게 그 자리에서 먹이고, 볼은 던지고, 나머지(회복·상태·PP)만
 * 파티 화면을 연다. 그래서 플러스파워는 대상을 안 묻는다
 */
export function needsTarget(item: Item): boolean {
  const pocket = item.battlePocket ?? 0
  return (pocket & (BATTLE_POCKET.hp | BATTLE_POCKET.status | BATTLE_POCKET.pp)) !== 0
}

/**
 * 이 도구는 기술 칸 **하나**를 골라야 하는가.
 *
 * PP에이드·PP회복이 그렇다. PP에이더·PP맥스는 네 칸을 다 채우므로 안 묻는다
 * (`battle_party.c`의 `PartyUseItemScreen`)
 */
export function needsMoveSlot(item: Item): boolean {
  return num(item, 'ppRestore') !== 0 && num(item, 'ppRestoreAll') === 0
}

/** 도망 도구인가 — 삐삐인형·에나비꼬리. `battleUseFunc 3` 둘뿐이다 */
export function isEscapeItem(item: Item): boolean {
  return item.battleUseFunc === 3
}

/**
 * 채울 체력. 255·254·253은 개수가 아니라 표지다 (`RESTORE_*`).
 *
 * 절반·¼이 0이 되면 1로 올리는 것까지 원본 그대로다 — 최대 HP 3짜리에게
 * 기력의조각을 먹여도 1은 돌아온다
 */
function healAmount(item: Item, maxHp: number): number {
  const raw = num(item, 'hpRestored')
  if (raw === RESTORE_ALL) return maxHp
  if (raw === RESTORE_HALF) return Math.max(1, Math.floor(maxHp / 2))
  if (raw === RESTORE_QUARTER) return Math.max(1, Math.floor((maxHp * 25) / 100))
  return raw
}

/**
 * 이 도구를 이 대상에게 쓰면 무슨 일이 일어나는가. 아무 일도 안 일어나면 null.
 *
 * 검사 순서는 원본과 같다 — 상태이상 → 혼란·헤롱헤롱 → 흰안개 → 랭크 → 급소 →
 * PP → 체력 → 친밀도. 순서를 지키는 이유는 친밀도가 **앞에서 뭐라도 했을 때만**
 * 붙기 때문이다(`if (... && result == TRUE)`).
 *
 * `moveSlot`은 PP를 채울 칸(0부터). 한 칸짜리 PP 도구가 아니면 안 본다
 */
export function planItemUse(
  item: Item,
  target: ItemTarget,
  moveSlot?: number,
): ItemPlan | null {
  const plan: ItemPlan = {
    heal: 0, revive: false, cure: [], clear: [], mist: false,
    boosts: [], focusEnergy: false, pp: [],
  }
  let did = false

  // ── 상태이상. 걸려 있는 것과 겹칠 때만 ────────────────────────────────────
  for (const [key, statuses] of CURE_PARAMS) {
    if (num(item, key) === 0) continue
    if (!statuses.includes(target.status)) continue
    plan.cure.push(target.status)
    did = true
  }

  // ── 혼란·헤롱헤롱은 배틀 개체에만 있다. 벤치에서는 안 걸린다 ───────────────
  if (num(item, 'healConfusion') !== 0 && target.active && target.confused) {
    plan.clear.push('confusion')
    did = true
  }
  if (num(item, 'healAttract') !== 0 && target.active && target.attracted) {
    plan.clear.push('attract')
    did = true
  }

  // ── 이펙트가드. 진영에 거는 것이라 **대상이 벤치여도 걸린다** ─────────────
  // 원본에도 여기만 자리 검사가 없다
  if (num(item, 'guardSpec') !== 0 && !target.mist) {
    plan.mist = true
    did = true
  }

  // ── 랭크. 이미 +6이면 안 올라가고, 그러면 그 도구는 아무 일도 안 한 것이다 ──
  for (const [key, stat] of STAGE_PARAMS) {
    if (num(item, key) === 0 || !target.active) continue
    if ((target.boosts[stat] ?? 0) >= MAX_STAGE) continue
    plan.boosts.push(stat)
    did = true
  }
  if (num(item, 'critStages') !== 0 && target.active && !target.focusEnergy) {
    plan.focusEnergy = true
    did = true
  }

  // ── PP. 가득 찬 칸은 건너뛴다 ─────────────────────────────────────────────
  const ppFill = num(item, 'ppRestored')
  const ppTo = (slot: number): boolean => {
    const m = target.moves[slot]
    if (!m || m.pp >= m.maxPp) return false
    plan.pp.push({
      slot,
      amount: ppFill === PP_RESTORE_ALL ? m.maxPp - m.pp : Math.min(ppFill, m.maxPp - m.pp),
    })
    return true
  }
  if (num(item, 'ppRestore') !== 0 && moveSlot !== undefined && ppTo(moveSlot)) did = true
  if (num(item, 'ppRestoreAll') !== 0) {
    for (let i = 0; i < target.moves.length; i++) if (ppTo(i)) did = true
  }

  // ── 체력. 되살리는 도구는 **쓰러진 애에게만**, 나머지는 **서 있는 애에게만** ─
  if (num(item, 'hpRestore') !== 0) {
    const revives = num(item, 'revive') !== 0
    const applies = revives ? target.hp === 0 : target.hp > 0
    if (applies && target.hp !== target.maxHp) {
      plan.heal = Math.min(healAmount(item, target.maxHp), target.maxHp - target.hp)
      plan.revive = revives
      did = true
    }
  }

  return did ? plan : null
}

/**
 * 이 도구가 친밀도를 얼마나 움직이는가. 힘의가루·부활초가 깎고 배틀용이 올린다.
 *
 * ⚠️ **구간은 지금 친밀도가 정한다** — 100 미만·200 미만·그 이상에 각각 다른
 * 값이 적혀 있고, 그 구간에 해당하는 `giveFriendship*` 칸이 서 있어야 붙는다.
 * 그래서 계획(`planItemUse`)이 아니라 세이브를 든 쪽에서 부른다.
 *
 * 원본은 뭐라도 한 뒤에만 이걸 준다 (`&& result == TRUE`). 그 판단은 부르는
 * 쪽에 있다 — 계획이 null이면 애초에 여기까지 안 온다.
 *
 * 럭셔리볼·알을 받은 자리 보정과 친밀도업 소지품 배수는 안 본다. 우리는 아직
 * 배틀 중에 소지품을 안 들고 알 부화 장소도 안 적는다
 */
export function friendshipGain(item: Item, friendship: number): number {
  if (friendship < 100) {
    return num(item, 'giveFriendshipLow') ? num(item, 'friendshipLow') : 0
  }
  if (friendship < 200) {
    return num(item, 'giveFriendshipMed') ? num(item, 'friendshipMed') : 0
  }
  return num(item, 'giveFriendshipHigh') ? num(item, 'friendshipHigh') : 0
}
