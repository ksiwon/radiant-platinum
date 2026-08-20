// 배회 포켓몬을 세계에 이어 붙인다 (PARITY §6.3)
//
// 규칙은 전부 `engine/world/roamer`에 있고, 여기서는 **누가 언제 부르는가**만
// 정한다. 원작이 부르는 자리를 그대로 옮긴다:
//
//   걸어서 맵을 넘었다  → 방금 온 맵을 적고 **전부 움직인다**
//                          (`FieldSystem_InitFlagsOnMapChange`)
//   워프했다            → 적기만 한다. 안 움직인다 (`FieldSystem_InitFlagsWarp`)
//   날거나 순간이동했다 → 전부 아무 데로나 뛴다 (`FieldSystem_SetFlyFlags`)
//   풀숲을 밟았다       → 여기 있으면 절반 (`TryEncounterRoamer`)
//   배틀이 끝났다       → 체력을 적거나 자리를 지운다
//
// ⚠️ **워프에서 안 움직이는 것이 요점이다.** 움직이면 문을 들락거리는 것만으로
// 배회를 흔들 수 있게 되어, 도로를 걸어 찾는다는 놀이가 통째로 사라진다.
import type { WildEncounter } from '../engine/battle/encounter'
import { encounters } from '../engine/battle/encounterSystem'
import type { Status } from '../engine/pokemon/instance'
import { fieldScripts } from '../engine/script/field'
import {
  activate, afterBattle, moveAll, randomizeAll, roamerHere, ROAMER_LEVEL,
  ROAMER_SPECIES, ROAMER_STATE_VAR, trackRoute, type Rng,
} from '../engine/world/roamer'
import type { Stats } from '../data/schema'
import { useSaveStore } from '../state/saveStore'

/** 걸어서 맵을 넘었다 (`FieldSystem_InitFlagsOnMapChange`) */
export function roamersWalked(mapId: number, rng: Rng = Math.random): void {
  const save = useSaveStore.getState()
  const recentRoutes = trackRoute(save.recentRoutes, mapId)
  // 아무도 안 돌고 있으면 자리 기록도 안 민다 — 원작이
  // `RoamingPokemon_AnyRoamersActive`로 통째로 건너뛴다
  if (!save.roamers.some((r) => r.active)) return
  useSaveStore.setState({
    recentRoutes,
    roamers: moveAll(save.roamers, recentRoutes.previous, rng),
  })
}

/** 워프로 맵을 넘었다. 자리만 적는다 (`FieldSystem_InitFlagsWarp`) */
export function roamersWarped(mapId: number): void {
  const save = useSaveStore.getState()
  if (!save.roamers.some((r) => r.active)) return
  const recentRoutes = trackRoute(save.recentRoutes, mapId)
  if (recentRoutes !== save.recentRoutes) useSaveStore.setState({ recentRoutes })
}

/** 하늘을 날았거나 순간이동했다 (`FieldSystem_SetFlyFlags`) */
export function roamersFlew(rng: Rng = Math.random): void {
  const save = useSaveStore.getState()
  if (!save.roamers.some((r) => r.active)) return
  useSaveStore.setState({
    roamers: randomizeAll(save.roamers, save.recentRoutes.previous, rng),
  })
}

/**
 * 풀숲을 밟았다. 여기 있으면 절반의 확률로 배회가 나온다.
 *
 * `encounterSystem`이 야생 칸을 뽑기 **전에** 부른다
 */
function roamerEncounter(mapId: number, rng: Rng): WildEncounter | null {
  const { roamers } = useSaveStore.getState()
  const slot = roamerHere(roamers, mapId, rng)
  if (slot === null) return null
  const r = roamers[slot]!
  return { species: r.species, level: r.level, slot: -1, form: 0, roamer: slot }
}

/**
 * 배틀이 끝났다 (`RoamerAfterBattle_UpdateRoamers`).
 *
 * `met`은 방금 상대한 자리(안 만났으면 null), `hp`·`status`는 그 마리가
 * 배틀을 나온 상태다. 잡았거나 쓰러뜨렸으면 자리를 지우고 이야기 변수에
 * 결말을 적는다 — **그래야 「이미 잡았다」를 스크립트가 안다**
 */
function roamersAfterBattle(
  { met, mapId, hp, status, outcome, rng = Math.random }: {
    met: number | null
    mapId: number
    hp: number
    status: Status
    outcome: 'win' | 'caught' | 'other'
    rng?: Rng
  },
): void {
  const save = useSaveStore.getState()
  if (!save.roamers.some((r) => r.active)) return
  const got = afterBattle(save.roamers, {
    met, mapId, previousMap: save.recentRoutes.previous, hp, status, outcome, rng,
  })
  useSaveStore.setState({ roamers: got.roamers })
  if (met === null || got.cleared === null) return
  const at = ROAMER_STATE_VAR[met]
  // ⚠️ 다크라이는 적을 칸이 없다. 원작 `switch`에 없어서다 — 자리를 지어내지 않는다
  if (at == null) return
  // 엔진의 변수통과 세이브 둘 다에 적는다. 한쪽만 적으면 지금 도는 스크립트가
  // 옛 값을 보거나, 리포트를 다시 열었을 때 결말이 사라진다 (`scene/stepSystem`)
  const vars = fieldScripts.vars
  vars.set(at, got.cleared)
  useSaveStore.setState({ vars: Uint16Array.from(vars.saved) })
}

/**
 * 스크립트가 한 자리를 연다 (`RoamingPokemon_ActivateSlot`).
 *
 * ⚠️ **여기서 개체가 정해진다.** 원작은 포켓몬을 한 마리 만들어 개체값·성격값·
 * 최대 체력만 베껴 적고 버린다. 최대 체력은 종족값 표가 있어야 나오므로
 * 표를 못 받았으면 자리를 안 연다 — 체력 0짜리 전설을 풀어놓지 않는다
 */
export function activateRoamer(
  slot: number,
  maxHpOf: (species: number, level: number, ivs: Stats) => number | null,
  rng: Rng = Math.random,
): void {
  const species = ROAMER_SPECIES[slot]
  const level = ROAMER_LEVEL[slot]
  if (species === undefined || level === undefined) return
  const iv = () => Math.floor(rng() * 32)
  const ivs: Stats = {
    hp: iv(), atk: iv(), def: iv(), spa: iv(), spd: iv(), spe: iv(),
  }
  const maxHp = maxHpOf(species, level, ivs)
  if (maxHp === null) return
  const pid = Math.floor(rng() * 0x100000000) >>> 0
  useSaveStore.setState({
    roamers: activate(
      useSaveStore.getState().roamers, slot,
      useSaveStore.getState().recentRoutes.previous,
      { pid, ivs, maxHp },
    ),
  })
}

/** 조우 시스템에 배회를 물어보는 길을 꽂는다. 필드가 뜰 때 한 번 */
export function installRoamers(): () => void {
  encounters.roamerHere = roamerEncounter
  encounters.roamerAfterBattle = roamersAfterBattle
  return () => {
    encounters.roamerHere = null
    encounters.roamerAfterBattle = null
  }
}
