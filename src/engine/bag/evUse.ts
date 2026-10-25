// 노력치 도구 — 비타민 여섯 · 노력치 깎는 열매 여섯 (`item_use_pokemon.c`)
//
// 도구표의 `giveHPEVs`·`hpEVs`… 칸이 전부 정한다. 비타민은 +10, 열매는 −10이다.
// 원작은 쓸 수 있나(`Pokemon_CheckItemEffects`)와 적용(`Pokemon_ApplyItemEffects`)을
// 둘로 가르고, 파티 화면은 **쓸 수 있을 때만** 도구를 뺀다 (`ApplyItemEffectOnPokemon`).
// 여기는 화면이 없는 계산만 둔다 — 친밀도는 `rareCandy`의 `fieldFriendship`이 준다.
import type { Item, Species, Stats } from '../../data/schema'
import { statsOf, type PokemonInstance } from '../pokemon/instance'
import { MAX_FRIENDSHIP } from '../pokemon/friendship'

/** `MAX_EV_VITAMIN` — 비타민으로는 한 칸이 100까지다 */
const MAX_EV_VITAMIN = 100
/** `MAX_EVS_ALL_STATS` */
const MAX_EVS_ALL_STATS = 510
const SHEDINJA = 292

/**
 * 도구표의 칸 → 노력치 한 칸. **순서가 원작의 검사 순서다**
 * (HP · 공격 · 방어 · 스피드 · 특수공격 · 특수방어 — `Pokemon_CheckItemEffects`).
 * `name`은 뱅크 551(`TEXT_BANK_POKEMON_STAT_NAMES`)의 줄 번호이기도 하다 — 같은 차례다
 */
const EV_PARAMS: readonly { give: string; amount: string; stat: keyof Stats; name: number }[] = [
  { give: 'giveHPEVs', amount: 'hpEVs', stat: 'hp', name: 0 },
  { give: 'giveAtkEVs', amount: 'atkEVs', stat: 'atk', name: 1 },
  { give: 'giveDefEVs', amount: 'defEVs', stat: 'def', name: 2 },
  { give: 'giveSpeedEVs', amount: 'speedEVs', stat: 'spe', name: 3 },
  { give: 'giveSpAtkEVs', amount: 'spatkEVs', stat: 'spa', name: 4 },
  { give: 'giveSpDefEVs', amount: 'spdefEVs', stat: 'spd', name: 5 },
]

function num(item: Item, key: string): number {
  return item.param?.[key] ?? 0
}

/** 이 도구가 노력치를 움직이는가 */
export function isEvItem(item: Item): boolean {
  return EV_PARAMS.some((p) => num(item, p.give) !== 0)
}

/** 이 도구의 노력치 칸들. 원작의 검사 순서대로 */
export function evChanges(item: Item): { stat: keyof Stats; change: number; name: number }[] {
  return EV_PARAMS
    .filter((p) => num(item, p.give) !== 0)
    .map((p) => ({ stat: p.stat, change: num(item, p.amount), name: p.name }))
}

/** 깎는 도구인가 (`ITEMEFFECT_SUB_*_EVS` — 열매 여섯) */
function isEvSubtractor(item: Item): boolean {
  return evChanges(item).some((c) => c.change < 0)
}

/**
 * 노력치 한 칸의 새 값 (`CalculateEVUpdate`). 바뀌는 게 없으면 null (`EV_UNCHANGED`).
 *
 * - 0인데 깎으면 · 100 이상인데 올리면 · 합이 510 이상인데 올리면 → 안 바뀐다
 * - 그 밖에는 더한 뒤 100(비타민 한도)·0으로 자르고, 합이 510을 넘으면 넘는 만큼 깎는다
 */
export function calcEvUpdate(current: number, sumOthers: number, change: number): number | null {
  if (current === 0 && change < 0) return null
  if (current >= MAX_EV_VITAMIN && change > 0) return null
  if (current + sumOthers >= MAX_EVS_ALL_STATS && change > 0) return null
  let next = current + change
  if (next > MAX_EV_VITAMIN) next = MAX_EV_VITAMIN
  else if (next < 0) next = 0
  if (next + sumOthers > MAX_EVS_ALL_STATS) next = MAX_EVS_ALL_STATS - sumOthers
  return next
}

/**
 * 지금 친밀도 구간에서 이 도구가 친밀도를 **올리는가** (`CheckFriendshipItemEffect`).
 * 255면 끝이고, 구간은 100 미만 · 200 미만 · 그 이상이다. 깎는 값(음수)은 안 센다
 */
export function friendshipItemEffect(mon: PokemonInstance, item: Item): boolean {
  const now = mon.friendship
  if (now >= MAX_FRIENDSHIP) return false
  const band = now < 100 ? 'Low' : now < 200 ? 'Med' : 'High'
  return num(item, `giveFriendship${band}`) !== 0 && num(item, `friendship${band}`) > 0
}

/**
 * 지금 먹여서 뭐라도 되는가 (`Pokemon_CheckItemEffects`의 `CHECK_EV_ITEM_EFFECT`).
 *
 * - 올리는 도구: 그 칸이 100 미만이고 **여섯 칸의 합이 510 미만**일 때
 * - 깎는 도구: 그 칸이 0보다 크거나, 아니면 **친밀도가 오를 수 있을 때**
 *   (그래서 노력치가 0이어도 열매를 먹이면 친해진다)
 * - 껍질몬의 HP 칸은 아예 안 본다
 *
 * 알은 화면이 먼저 막는다 (`HandleSpecialInput`) — 여기서도 거른다
 */
export function canUseEvItem(mon: PokemonInstance, item: Item): boolean {
  if (mon.isEgg) return false
  const sum = Object.values(mon.evs).reduce((a, b) => a + b, 0)
  for (const p of EV_PARAMS) {
    if (num(item, p.give) === 0) continue
    if (p.stat === 'hp' && mon.species === SHEDINJA) continue
    const change = num(item, p.amount)
    if (change > 0) {
      if (mon.evs[p.stat] < MAX_EV_VITAMIN && sum < MAX_EVS_ALL_STATS) return true
    } else if (change < 0) {
      if (mon.evs[p.stat] > 0) return true
      if (friendshipItemEffect(mon, item)) return true
    }
  }
  return false
}

interface EvUseResult {
  mon: PokemonInstance
  /** 노력치가 실제로 바뀌었는가. 깎는 열매는 0에서도 쓸 수 있어서(친밀도) 이 값이 갈린다 */
  evChanged: boolean
}

/**
 * 노력치 도구를 먹인다 (`Pokemon_ApplyItemEffects`의 `APPLY_EV_EFFECT`).
 *
 * 쓸 수 없으면 null — 도구는 그대로 둔다. 친밀도는 따로 준다(`fieldFriendship`).
 *
 * ⚠️ **체력은 `Pokemon_CalcStats`가 옮긴다.** 서 있는 마리는 `hp += 새 최대 − 옛 최대`,
 * 쓰러진 마리는 0 그대로, 껍질몬은 1이다 (`pokemon.c:633`). 원본은 셈한 값이
 * 0 **이 아닐 때만** 쓰는데, **음수는 걸러 주지 않는다** — 열매로 최대 HP가 깎여
 * 합이 0 아래로 가면 u16으로 넘쳐 체력이 6만대가 된다. 폼그 글리치(BUGS §2.18)가
 * 거기서 난다. 우리는 0 이하이면 옛 체력을 두고(원본의 0 규칙) **새 최대로 자른다** —
 * 서 있는 마리는 열매로 쓰러지지도, 최대를 넘지도 않는다
 */
export function applyEvItem(mon: PokemonInstance, species: Species, item: Item): EvUseResult | null {
  if (!canUseEvItem(mon, item)) return null
  const evs: Stats = { ...mon.evs }
  let evChanged = false
  for (const p of EV_PARAMS) {
    if (num(item, p.give) === 0) continue
    if (p.stat === 'hp' && mon.species === SHEDINJA) continue
    const sumOthers = Object.values(evs).reduce((a, b) => a + b, 0) - evs[p.stat]
    const updated = calcEvUpdate(evs[p.stat], sumOthers, num(item, p.amount))
    if (updated === null) continue
    evs[p.stat] = updated
    evChanged = true
  }
  const next: PokemonInstance = { ...mon, evs }
  if (!evChanged) return { mon: next, evChanged }
  const oldMax = statsOf(mon, species).hp
  const newMax = statsOf(next, species).hp
  if (mon.hp > 0) {
    if (mon.species === SHEDINJA) next.hp = 1
    else {
      const moved = mon.hp + (newMax - oldMax)
      next.hp = Math.min(moved > 0 ? moved : mon.hp, newMax)
    }
  }
  return { mon: next, evChanged }
}

/** 깎는 도구가 쓴 뒤 띄울 줄 (`PartyMenuCB_UseItem_SubtractEVs`) */
type EvLine = 'rose' | 'fell' | 'adores' | 'floor'

/**
 * 결과 글 (뱅크 453). 올리는 도구는 늘 75 「기초포인트가 올라갔다」다.
 * 깎는 도구는 노력치와 친밀도가 **둘 다** 바뀌었으면 110, 노력치만이면 111(친밀도가 이미 255),
 * 노력치가 안 바뀌었으면 112 「더 떨어지지 않는다」다
 */
export function evUseLine(item: Item, evChanged: boolean, friendshipChanged: boolean): EvLine {
  if (!isEvSubtractor(item)) return 'rose'
  if (!evChanged) return 'floor'
  return friendshipChanged ? 'fell' : 'adores'
}
