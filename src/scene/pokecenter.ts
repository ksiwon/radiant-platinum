// 포켓몬센터와 전멸 (DATA.md §2.3)
//
// 원작이 이 둘을 한 표로 묶어 놓았다 — `sSpawnLocations` 한 줄에 **전멸했을 때
// 서는 자리**(센터 1층 안)와 **공중날기로 내리는 자리**(그 마을 바깥)가 같이
// 들어 있다. 그래서 여기서도 한 자리에서 다룬다 (`engine/map/spawns`).
//
// 부활 지점이 정해지는 방식이 특이하다. 간호사에게 말을 걸 필요가 없다 —
// 원작은 **맵을 갈아 끼울 때마다** `GetMapBlackOutWarpId`를 돌려서, 새 맵이
// 센터 1층이면 그 자리로 옮긴다(`field_map_change.c` 291줄). 들어서기만 하면 된다.
import { loadMoves, loadSpecies, type SpeciesLookup } from '../data/gameData'
import { shouldPartnerHeal } from '../engine/battle/aftermath'
import { fieldScripts } from '../engine/script/field'
import { SYSTEM_FLAG } from '../engine/script/commands'
import { statsOf, maxPpOf, type PokemonInstance } from '../engine/pokemon/instance'
import { flyUnlockedAt, spawnAt, spawnWarp } from '../engine/map/spawns'
import { world } from '../engine/map/world'
import { useSaveStore } from '../state/saveStore'
import { useBattleStore } from '../state/battleStore'

/** 종족값·기술 표. 회복량을 내려면 둘 다 있어야 한다 */
let species: SpeciesLookup | null = null
let pp: ((move: number) => number) | null = null

export function loadHealTables(): void {
  void loadSpecies().then((t) => { species = t }).catch(() => { /* 회복이 안 될 뿐이다 */ })
  void loadMoves().then((t) => { pp = (move) => t.get(move)?.pp ?? 5 })
    .catch(() => { /* PP만 안 찬다 */ })
}

/**
 * 파티 전원 회복 (`ScrCmd_HealParty`).
 *
 * 표를 아직 못 받았으면 **아무것도 안 한다** — 반쯤 회복시키느니 안 하는 편이
 * 낫다. 표는 필드가 뜰 때 같이 받는다
 */
export function healParty(): void {
  const table = species
  if (!table) return
  useSaveStore.getState().healParty((mon: PokemonInstance) => ({
    hp: statsOf(mon, table.of(mon)).hp,
    pp: mon.moves.map((slot) => (pp ? maxPpOf(slot, pp(slot.move)) : slot.pp)),
  }))
}

/**
 * 전멸 (`FieldTask_BlackOutFromBattle`).
 *
 * ```c
 * Location_InitBlackOut(warpId, &location);
 * FieldTask_ChangeMapByLocation(task, &location);
 * ```
 *
 * 회복이 먼저다 — 원작도 깨어난 자리에서 이미 다 나아 있다
 */
export function blackOut(): void {
  healParty()
  const target = spawnWarp(useSaveStore.getState().healSpot, 'blackOut')
  if (target) world.pending = target
}

/**
 * 맵을 갈아 끼웠다. 부활 지점과 공중날기 자리를 갱신한다.
 *
 * 원작이 맵 전환마다 하는 일 그대로다 — 센터에 들어서면 부활 지점이 옮겨지고,
 * 마을 바깥에 발을 들이면 그 마을이 공중날기 목록에 오른다
 */
export function arriveAt(mapId: number): void {
  const save = useSaveStore.getState()
  const heal = spawnAt(mapId)
  if (heal !== null) save.setHealSpot(heal)
  const fly = flyUnlockedAt(mapId)
  if (fly !== null && (save.flySpots & (1 << fly)) === 0) save.unlockFly(fly)
}

/**
 * 배틀에서 지면 전멸이다.
 *
 * 스크립트가 연 트레이너전은 `BlackOutFromBattle` 명령이 따로 부르지만
 * **야생에게 지는 것**은 명령이 없다 — 원작도 `FieldTask_StartBlackOutFromBattle`이
 * 자동으로 돈다. 두 번 불려도 하는 일이 같아서 탈이 없다.
 *
 * 화면이 닫힌 **뒤에** 옮긴다. 결과가 나오자마자 옮기면 배틀 화면 뒤에서 맵이
 * 갈리고, 돌아왔을 때 어디인지 모르게 된다
 */
export function watchBlackOut(): () => void {
  let lost = false
  return useBattleStore.subscribe((state, prev) => {
    if (state.outcome === 'loss' && prev.outcome !== 'loss') lost = true
    if (state.phase === 'off' && prev.phase !== 'off' && lost) {
      lost = false
      blackOut()
    }
  })
}

/**
 * **동행이 붙어 있는 동안은 배틀이 끝날 때마다 다 낫는다**
 * (`encounter.c` · 규칙은 `battle/aftermath`의 `shouldPartnerHeal`).
 *
 * 영원의 숲의 모미가 그 자리다 — 원작에서 숲이 험하지 않은 까닭이 이것이고,
 * 이것이 없어서 우리 쪽은 숲에서 전멸을 거듭했다.
 *
 * 전멸과 같은 자리에서 본다 — **화면이 닫힌 뒤에** 손댄다. 결과가 나오자마자
 * 파티를 고치면 배틀 화면이 아직 제 값을 되돌리는 중이라 덮어쓰기가 엇갈린다
 */
export function watchPartnerHeal(): () => void {
  let finish: 'win' | 'loss' | 'caught' | 'fled' | 'foeFled' | null = null
  return useBattleStore.subscribe((state, prev) => {
    if (state.outcome !== null && state.outcome !== prev.outcome) finish = state.outcome
    if (state.phase === 'off' && prev.phase !== 'off') {
      const had = finish
      finish = null
      const partner = fieldScripts.vars?.checkFlag(SYSTEM_FLAG.hasPartner) === true
      if (shouldPartnerHeal(had, partner)) healParty()
    }
  })
}
