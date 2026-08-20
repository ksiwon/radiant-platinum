// 포켓몬레이더가 도는 자리 (PARITY §6.5)
//
// 규칙은 `engine/world/pokeRadar`가 들고 있고 여기는 **지금 도는 사슬**과
// 격자를 맡는다.
//
// ⚠️ **사슬은 리포트에 안 남는다.** 원작도 `RadarChain`을 `FieldSystem`에 두고
// 세이브에는 배터리와 기록 셋만 적는다 — 리포트를 열면 사슬이 풀린다.
//
// ⚠️ **사슬이 풀리는 자리가 여럿이다** (`RadarChain_Clear`를 부르는 열 자리):
// 배틀에서 졌을 때 · 잡지도 쓰러뜨리지도 않고 끝났을 때 · 무더기 넷이 다 화면
// 밖으로 나갔을 때 · 맵을 옮길 때 · 자전거를 탈 때 · 꿀나무와 스크립트 배틀.
import { isRadarGrass, type WildEncounter } from '../engine/battle/encounter'
import { encounters } from '../engine/battle/encounterSystem'
import { mapById, world as mapWorld } from '../engine/map/world'
import { fieldScripts, start } from '../engine/script/field'
import {
  chargeStep, clearChain, lockSpecies, patchAt, patchTile, RADAR_BATTERY_STEPS, radarReady,
  RING_TILES, setupPatches, stepOnPatch, stepsLeft, updateRadarRecords,
  type Patch, type PatchStep, type RadarChain,
} from '../engine/world/pokeRadar'
import { useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'

/** 지금 도는 사슬. 리포트에 안 남는다 */
let chain: RadarChain = clearChain()

/** 소리를 내는 자리. 씬이 꽂아 준다 */
const radarSound: {
  music: ((seq: number | null) => void) | null
} = { music: null }

/** `SEQ_POKERADAR`. 무더기가 떠 있는 동안 나온다 */
const SEQ_POKERADAR = 1150

export function radarChain(): RadarChain { return chain }

/** 무더기가 떠 있는가 */
export function radarActive(): boolean { return chain.patches.length > 0 }

/** 지금 떠 있는 무더기들. 화면이 이걸 그린다 */
export function radarPatches(): readonly Patch[] { return chain.patches }

/**
 * 사슬을 푼다. 무더기가 있었으면 곡도 되돌린다.
 *
 * ⚠️ **종과 사슬까지 통째로 버린다** — 원작 `RadarChain_Clear`가 그렇다.
 * 무더기만 지우면 다음에 켰을 때 옛 종이 이어진다
 */
export function clearRadar(): void {
  const had = chain.patches.length > 0
  chain = clearChain()
  if (had) radarSound.music?.(null)
}

/**
 * 무더기 넷을 뿌린다 (`RadarSpawnPatches`).
 *
 * 고리마다 한 칸씩 뽑고, **큰 풀이고 높이와 맵이 주인공과 같아야** 산다.
 * 넷 다 죽으면 사슬이 풀린다
 */
function spawnPatches(
  playerX: number, playerZ: number, rand: (n: number) => number,
): { x: number, z: number }[] {
  const grid = mapWorld.grid
  if (grid === null) return []
  const here = grid.heightAtWorld(playerX, playerZ)
  const out: { x: number, z: number }[] = []
  for (const [ring, tiles] of RING_TILES.entries()) {
    const at = patchTile(ring, rand(tiles), playerX, playerZ)
    // ⚠️ **`TileBehavior_IsTallGrass`는 0x02 하나뿐이다** — 긴 풀(0x03)에는
    // 무더기가 안 선다. `isGrassTile`로 넓히면 원작에 없는 자리에 뜬다
    if (!isRadarGrass(grid.behaviorAtWorld(at.x, at.z))) continue
    if (grid.heightAtWorld(at.x, at.z) !== here) continue
    if (grid.zoneAt(at.x, at.z) !== mapWorld.mapId) continue
    out.push(at)
  }
  return out
}

/**
 * 레이더를 켠다. 배터리가 다 찼을 때만 부른다.
 *
 * `result`는 **앞 판의 결과**다 — 처음 켜는 것은 「쓰러뜨렸다」와 같은 확률표를
 * 쓴다(원작이 `SetupGrassPatches(fieldSystem, 0x1, ...)`로 `BATTLE_RESULT_WIN`을
 * 넘긴다)
 */
function startRadar(
  playerX: number, playerZ: number, rand: (n: number) => number,
  result: 'win' | 'captured' = 'win',
): boolean {
  const tiles = spawnPatches(playerX, playerZ, rand)
  if (tiles.length === 0) {
    clearRadar()
    return false
  }
  chain = { ...chain, patches: setupPatches(tiles, chain, result, rand) }
  radarSound.music?.(SEQ_POKERADAR)
  return true
}

/**
 * 무더기를 밟았다. 밟은 자리가 아니면 null.
 *
 * 조우표를 뽑는 쪽이 이걸 먼저 묻는다 — 답이 오면 그 판은 레이더 조우다
 */
function stepRadar(x: number, z: number): PatchStep | null {
  const patch = patchAt(chain, x, z)
  if (patch === null) return null
  const step = stepOnPatch(chain, patch)
  chain = step.chain
  return step
}

/** 조우가 끝난 뒤 사슬을 그대로 받아 둔다 (`lockSpecies`가 준 것) */
export function setRadarChain(next: RadarChain): void {
  chain = next
  if (next.patches.length === 0) radarSound.music?.(null)
}

/**
 * 도구를 골라서 켠다 (`RefreshRadarChain`).
 *
 * 원작이 갈래 셋이다 — 배터리가 덜 찼으면 공용 스크립트 0번(남은 걸음을 대사에
 * 끼운다), 무더기가 하나도 안 서면 1번, 서면 곡을 튼다. **글은 우리가 안
 * 짓는다** — 둘 다 롬의 스크립트다
 */
export function turnOnRadar(): void {
  const save = useSaveStore.getState()
  const header = mapById(mapWorld.mapId)
  const mapFile = header?.scripts ?? -1
  if (!radarReady(save.radar.charge)) {
    // 남은 걸음이 대사에 들어간다 (`SCRIPT_DATA_PARAMETER_0` = 0x8000)
    fieldScripts.vars?.set(SCRIPT_PARAM_0, stepsLeft(save.radar.charge))
    start(SCRIPT_POKE_RADAR_NOT_CHARGED, mapFile)
    return
  }
  useSaveStore.setState({ radar: { ...save.radar, charge: 0 } })
  const p = worldState.player
  const at = { x: Math.round(p.position.x), z: Math.round(p.position.z) }
  if (!startRadar(at.x, at.z, (n) => Math.floor(Math.random() * n))) {
    start(SCRIPT_POKE_RADAR_NO_GRASS, mapFile)
  }
}

/**
 * 한 걸음 (`RadarChargeStep` + `PokeRadar_ClearIfAllOutOfView`).
 *
 * ⚠️ **가방에 레이더가 있을 때만 찬다.** 원작이 `Bag_CanRemoveItem`으로 묻는다 —
 * 없는 동안 차 두면 받자마자 바로 쓸 수 있다
 */
export function radarStep(): void {
  const save = useSaveStore.getState()
  const p = worldState.player
  radarCheckView(Math.round(p.position.x), Math.round(p.position.z))
  if (!hasRadarInBag(save.bag)) return
  if (save.radar.charge >= RADAR_BATTERY_STEPS) return
  useSaveStore.setState({ radar: { ...save.radar, charge: chargeStep(save.radar.charge) } })
}

/** `ITEM_POKE_RADAR` */
const ITEM_POKE_RADAR = 431

function hasRadarInBag(bag: readonly { item: number, count: number }[][]): boolean {
  return bag.some((pocket) => pocket.some((s) => s.item === ITEM_POKE_RADAR && s.count > 0))
}

/** `SCRIPT_ID(POKE_RADAR, 0)` — 「아직 충전되지 않았다」 */
const SCRIPT_POKE_RADAR_NOT_CHARGED = 8970
/** `SCRIPT_ID(POKE_RADAR, 1)` — 풀 무더기가 하나도 안 섰다 */
const SCRIPT_POKE_RADAR_NO_GRASS = 8971
/** `SCRIPT_DATA_PARAMETER_0`. 남은 걸음이 여기로 들어간다 */
const SCRIPT_PARAM_0 = 0x8000

/**
 * 뽑은 조우를 사슬이 손본다 (`CreateWildMon_FromRadar*`).
 *
 * ⚠️ **이을 판은 조우표를 아예 안 본다** — 묶어 둔 종과 레벨을 그대로 낸다.
 * 그래서 사슬 40이면 같은 레벨의 같은 종이 마흔 번 나온다
 */
export function radarEncounter(
  step: PatchStep, got: WildEncounter | null,
): WildEncounter | null {
  if (step.preserve) {
    if (chain.species === 0) return got
    return {
      species: chain.species, level: chain.level, slot: -1, form: 0,
      roamer: null, shiny: step.shiny,
    }
  }
  if (got === null) { clearRadar(); return null }
  const locked = lockSpecies(chain, { species: got.species, level: got.level })
  // ⚠️ **무더기는 여기서 갈아 없앤다.** 원작이 조우가 잡히면 곧바로
  // `RadarSpawnPatches`를 다시 부른다 — 배틀에서 돌아오면 새 무더기가 서 있다
  chain = { ...locked.chain, patches: [] }
  return { ...got, species: locked.species, level: locked.level }
}

/**
 * 조우 시스템에 레이더를 꽂는다. 필드가 뜰 때 한 번
 */
export function installRadar(): () => void {
  encounters.radarStep = stepRadar
  encounters.radarEncounter = radarEncounter
  encounters.radarAfterBattle = radarAfterBattle
  return () => {
    encounters.radarStep = null
    encounters.radarEncounter = null
    encounters.radarAfterBattle = null
  }
}

/**
 * 배틀이 끝났다 (`Encounter_ProcessResult`의 상태 3).
 *
 * ⚠️ **잡거나 쓰러뜨린 판만 사슬이 산다.** 도망쳤거나 졌으면 끊긴다.
 * 산 판에서는 그 자리에서 무더기를 다시 뿌린다
 */
export function radarAfterBattle(result: 'win' | 'captured' | 'other'): void {
  if (!chain.fromPatch) return
  chain = { ...chain, fromPatch: false }
  if (result === 'other' || chain.species === 0) { clearRadar(); return }
  const save = useSaveStore.getState()
  useSaveStore.setState({
    radar: {
      ...save.radar,
      records: updateRadarRecords(save.radar.records, chain.species, chain.count),
    },
  })
  const p = worldState.player
  startRadar(
    Math.round(p.position.x), Math.round(p.position.z),
    (n) => Math.floor(Math.random() * n), result,
  )
}

/**
 * 무더기가 다 화면 밖으로 나갔는가 (`PokeRadar_ClearIfAllOutOfView`).
 *
 * 원작은 카메라 절두체로 재는데 우리는 **주인공과의 거리**로 본다 — 무더기가
 * 9×9 상자 안에서 나므로, 그 상자를 벗어나면 화면에도 없다
 */
function radarCheckView(playerX: number, playerZ: number): void {
  if (chain.patches.length === 0) return
  const half = Math.floor(9 / 2)
  const alive = chain.patches.filter(
    (p) => Math.abs(p.x - playerX) <= half && Math.abs(p.z - playerZ) <= half)
  if (alive.length === chain.patches.length) return
  if (alive.length === 0) { clearRadar(); return }
  chain = { ...chain, patches: alive }
}
