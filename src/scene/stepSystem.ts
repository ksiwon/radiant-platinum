// 걸음 계수기를 세계에 붙인다 (PARITY §1.1) — `Field_ProcessStep`.
//
// 규칙은 `engine/actor/steps.ts`에 있고 여기는 **언제 한 걸음인가**와
// 세이브를 잇는 일만 한다. 엔진 쪽이 순수하게 남아야 시험이 판을 안 만들고도
// 주기를 잴 수 있다.
//
// ⚠️ **알리는 방법이 원작 그대로다.** 독도 리펠도 우리가 문장을 지어내지 않고
// 롬의 공용 스크립트를 돌린다 — 독은 `SCRIPT_ID(COMMON_SCRIPTS, 3)`,
// 리펠은 `…, 32`다. 그래야 글도 소리도 창 모양도 원작이다.
import { step as stepOnce, Poison } from '../engine/actor/steps'
import { VAR_FRIENDSHIP_STEPS } from '../engine/actor/steps'
import { HOLD_EFFECT_FRIENDSHIP_UP } from '../engine/pokemon/friendship'
import { fieldScripts, scriptBusy, start } from '../engine/script/field'
import { VARS_START } from '../engine/script/vars'
import { mapById, world as mapWorld } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { useSaveStore } from '../state/saveStore'
import { dayNumber, rollOver, swarmMap, trophySpecies } from '../engine/world/daily'
import { encounters } from '../engine/battle/encounterSystem'
import { loadItems, loadSpecies, type ItemTable, type SpeciesTable } from '../data/gameData'
import { daycareStep } from '../engine/pokemon/breeding'
import { abilitySlotOf, genderOf, type PokemonInstance } from '../engine/pokemon/instance'
import { useHatchStore } from '../state/hatchStore'
import { NO_LEAD, type Lead } from '../engine/battle/encounterLead'

/** `SCRIPT_ID(COMMON_SCRIPTS, 3)` — 독이 깎였을 때 */
const COMMON_SCRIPT_POISON = 2003
/** `SCRIPT_ID(COMMON_SCRIPTS, 32)` — 리펠이 다 됐을 때 */
const COMMON_SCRIPT_REPEL = 2032

/**
 * 도구 표. 평온의방울 판정에만 쓴다 — 없으면 그 보정만 안 붙고 나머지는 돈다.
 *
 * ⚠️ 표가 없다고 걸음을 안 세면 안 된다. 표는 언젠가 오지만 걸음은 지금 걷고 있다
 */
let items: ItemTable | null = null
void loadItems().then((table) => { items = table }).catch(() => { items = null })

/**
 * 종족 표. 육성가가 알 그룹과 성비를 본다.
 *
 * ⚠️ 표가 없으면 **육성가만** 쉰다 — 걸음과 독은 그대로 돈다. 알이 하루 늦게
 * 생기는 것과 걸음이 안 세어지는 것은 무게가 다르다
 */
let speciesTable: SpeciesTable | null = null
void loadSpecies().then((table) => { speciesTable = table }).catch(() => { speciesTable = null })

/** 그 개체의 특성 번호. 마그마의무장·불꽃몸이 부화를 두 배로 만든다 */
function abilityOf(mon: PokemonInstance): number {
  const species = speciesTable?.byId.get(mon.species)
  if (!species) return 0
  return species.abilities[abilitySlotOf(mon.pid)] ?? species.abilities[0] ?? 0
}

/**
 * 선두 포켓몬·피리·리펠·날짜를 조우 시스템에 넘긴다 (PARITY §1.22).
 *
 * ⚠️ **여기서 넘겨야 하는 이유가 규칙이다.** `src/engine`은 스토어를 못 읽는다
 * (PLAN §3.2). 파티도 가방도 세이브에 있으니 씬이 다리를 놓는다.
 *
 * ⚠️ **리펠 기준이 선두가 아니다.** 원작은 `Party_FindFirstEligibleBattler`,
 * 즉 **싸울 수 있는 첫 마리**의 레벨을 본다. 선두가 쓰러져 있으면 기준이
 * 뒤 마리로 넘어간다 — 선두를 쓰면 쓰러진 1레벨을 앞세워 리펠을 무력화할 수 있다
 */
function publishMods(): void {
  const save = useSaveStore.getState()
  const first = save.party[0]
  const species = first ? speciesTable?.byId.get(first.species) : undefined
  const lead: Lead = first && species && !first.isEgg
    ? {
      isEgg: false,
      ability: abilityOf(first),
      level: first.level,
      gender: genderOf(first.pid, species.genderRatio),
      pid: first.pid,
      heldItem: first.heldItem,
    }
    : NO_LEAD

  const battler = save.party.find((m) => !m.isEgg && m.hp > 0)
  const now = new Date()
  encounters.mods = {
    lead,
    weather: mapById(mapWorld.mapId)?.weather ?? 0,
    flute: save.flute,
    repelLevel: save.steps.repel > 0 ? battler?.level ?? 0 : 0,
    month: now.getMonth() + 1,
    day: now.getDate(),
  }
}

/** 종족 번호 → 타입 둘. 자력·정전기가 조우 칸을 집을 때 본다 */
function typeOf(species: number): readonly [number, number] {
  const s = speciesTable?.byId.get(species)
  return s ? [s.types[0], s.types[1]] : [-1, -1]
}

let lastTile = -1

/**
 * 맵이 바뀌면 "같은 칸" 판정을 초기화한다.
 *
 * ⚠️ 안 하면 워프로 도착한 칸이 이미 밟은 것으로 남아, 그 칸을 벗어날 때까지
 * 걸음이 한 번도 안 세어진다
 */
export function resetStepTile(): void {
  lastTile = -1
}

/**
 * 날이 넘어갔는지 본다 (PARITY §6.11) — `FieldSystem_HandleDailyEvents`.
 *
 * ⚠️ **걸음이 아니라 프레임마다 본다.** 원작은 시계 인터럽트로 도는데, 우리는
 * 걸음에 붙이면 서 있는 동안 자정이 지나도 안 넘어간다 — 밤새 켜 둔 화면에서
 * 어제의 빈티나 칸이 그대로 남는다. 값을 실제로 쓰는 것은 날이 바뀐 프레임뿐이다
 */
function checkDay(): void {
  const save = useSaveStore.getState()
  const daily = rollOver(save.daily, dayNumber(new Date()))
  if (daily !== save.daily) useSaveStore.setState({ daily })
  // 조우 시스템은 세이브를 못 읽는다 (PLAN §3.2). 갈아 끼울 값을 여기서 넘긴다
  encounters.swarmAt = swarmMap(daily)
  const garden = encounters.ex?.trophyGarden
  encounters.trophy = garden ? trophySpecies(daily, garden, save.nationalDex) : null
}

export const stepSystem = {
  fixedUpdate(): void {
    checkDay()
    // ⚠️ **걸음이 아니라 프레임마다 맞춘다.** 조우 판정은 걸음이 아니라 칸이
    // 바뀔 때 도는데(`encounterSystem`), 그 사이에 가방에서 피리를 불거나
    // 선두를 바꿀 수 있다 — 걸음에 붙이면 한 칸 늦게 먹는다
    publishMods()
    encounters.typeOf = typeOf
    const grid = mapWorld.grid
    if (!grid || mapWorld.pending) return
    // 스크립트가 걸어 옮기는 중이면 그것은 내 걸음이 아니다
    // (`PlayerAvatar_CheckForcedMovement`)
    if (scriptBusy()) return

    const p = worldState.player.position
    const tx = Math.floor(p.x), tz = Math.floor(p.z)
    const key = tz * grid.tileWidth + tx
    if (key === lastTile) return
    const first = lastTile < 0
    lastTile = key
    // 맵에 막 들어선 칸은 세지 않는다 — 원작도 이동이 끝난 자리에서만 센다
    if (first) return

    const save = useSaveStore.getState()
    const vars = fieldScripts.vars
    const got = stepOnce({
      party: save.party,
      mapId: mapWorld.mapId,
      poisonSteps: save.steps.poison,
      repelSteps: save.steps.repel,
      friendshipSteps: vars.get(VARS_START + VAR_FRIENDSHIP_STEPS),
      soothing: (mon) => mon.heldItem > 0
        && items?.get(mon.heldItem).holdEffect === HOLD_EFFECT_FRIENDSHIP_UP,
      // 원작의 `LCRNG_Next() & 1`. 우리 난수로는 같은 수열을 못 만들지만
      // **절반을 버린다**는 성질이 이 규칙의 전부다
      coin: () => Math.random() < 0.5,
    })

    // 육성가와 알도 같은 한 걸음에 돈다 (`Daycare_Update`)
    const now = new Date()
    const table = speciesTable
    if (!table) {
      vars.set(VARS_START + VAR_FRIENDSHIP_STEPS, got.friendshipSteps)
      useSaveStore.setState({
        party: got.party,
        steps: { poison: got.poisonSteps, repel: got.repelSteps },
        vars: Uint16Array.from(vars.saved),
      })
      return
    }
    const bred = daycareStep({
      daycare: save.daycare,
      party: got.party,
      month: now.getMonth() + 1,
      day: now.getDate(),
      abilityOf: (mon) => abilityOf(mon),
      dataOf: (id) => table.get(id),
      rng: Math.random,
      coin: () => Math.random() < 0.5,
    })

    vars.set(VARS_START + VAR_FRIENDSHIP_STEPS, got.friendshipSteps)
    useSaveStore.setState({
      party: bred.party,
      daycare: bred.daycare,
      steps: { poison: got.poisonSteps, repel: got.repelSteps },
      vars: Uint16Array.from(vars.saved),
    })

    // 알이 깼다. 원작도 여기서 걸음을 멈추고 부화 장면으로 넘어간다
    if (bred.hatched >= 0) { useHatchStore.getState().open(bred.hatched); return }

    // 알리는 것은 하나뿐이다 — 원작도 `Field_ProcessStep`이 첫 참에서 돌아온다
    const scripts = mapById(mapWorld.mapId)?.scripts
    if (scripts === undefined) return
    if (got.poison !== Poison.NONE) { start(COMMON_SCRIPT_POISON, scripts); return }
    if (got.repelExpired) start(COMMON_SCRIPT_REPEL, scripts)
  },
}
