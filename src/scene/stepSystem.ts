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
import { StepTrace } from '../engine/actor/stepTrace'
import { addRecord, RECORD_EGGS_HATCHED, RECORD_STEPS } from '../engine/world/gameRecords'
import { VAR_FRIENDSHIP_STEPS } from '../engine/actor/steps'
import { HOLD_EFFECT_FRIENDSHIP_UP } from '../engine/pokemon/friendship'
import { fieldScripts, scriptBusy, start } from '../engine/script/field'
import { VARS_START } from '../engine/script/vars'
import { DIR } from '../engine/script/movement'
import { mapById, world as mapWorld } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { useSaveStore } from '../state/saveStore'
import { poketchStep } from './poketch'
import {
  distortionActive, distortionMoved, distortionRebindPlatform, distortionStepped,
} from './distortion'
import { pushDirection } from '../engine/input/move'
import {
  dayNumber, elapseMinutes, minuteNumber, rollOver, swarmMap, trophySpecies,
} from '../engine/world/daily'
import { elapseHoneyTrees } from '../engine/world/honeyTree'
import { berryPatchesStep, elapseBerries } from './berryPatches'
import { safariFieldStep } from './safari'
import { amityStep, VAR_AMITY_STEPS } from '../engine/world/amity'
import { elapseDays } from '../engine/pokemon/pokerus'
import { encounters } from '../engine/battle/encounterSystem'
import { radarStep } from './pokeRadar'
import { vsSeekerFieldStep } from './vsSeeker'
import { loadItems, loadSpecies, type ItemTable, type SpeciesTable } from '../data/gameData'
import { daycareStep } from '../engine/pokemon/breeding'
import {
  changeForm, SHAYMIN_LAND, SHAYMIN_SKY, shayminMustLand, SPECIES_SHAYMIN,
} from '../engine/pokemon/form'
import { abilityOf, genderOf, statsOf, type PokemonInstance } from '../engine/pokemon/instance'
import { useHatchStore } from '../state/hatchStore'
import { NO_LEAD, type Lead } from '../engine/battle/encounterLead'

/**
 * 보고 있는 쪽을 원작의 방향 번호로 (`FACE_UP`·`DOWN`·`LEFT`·`RIGHT`).
 *
 * `facing`은 `atan2(vx, vz)`라 0이 +z, 즉 **남쪽**이다
 */
function facingDir(): number {
  const quarter = ((Math.round(worldState.player.facing / (Math.PI / 2)) % 4) + 4) % 4
  return [DIR.south, DIR.east, DIR.north, DIR.west][quarter]!
}

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
function monAbility(mon: PokemonInstance): number {
  const species = speciesTable?.of(mon)
  return species ? abilityOf(mon.pid, species.abilities) : 0
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
  const species = first ? speciesTable?.of(first) : undefined
  const lead: Lead = first && species && !first.isEgg
    ? {
      isEgg: false,
      ability: monAbility(first),
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

/**
 * 지금 밀고 있는 방향. 안 밀고 있으면 −1.
 *
 * 원작은 누른 키를 그대로 읽지만 (`PlayerAvatar_CalcFaceDirection`) 우리는
 * 이동이 연속이라 **미는 벡터**가 그 자리다 — 벽에 막혀 속도가 0이어도
 * 밀고 있으면 방아쇠가 돈다 (원작도 부딪히는 걸음에서 돈다)
 */
function pushedDir(): number {
  const { x, z } = pushDirection()
  if (Math.abs(x) < 0.2 && Math.abs(z) < 0.2) return -1
  if (Math.abs(x) > Math.abs(z)) return x > 0 ? DIR.east : DIR.west
  return z > 0 ? DIR.south : DIR.north
}

/**
 * 지나온 거리와 지나온 칸을 세는 자 (PARITY §1.1).
 *
 * ⚠️ **걸음은 칸 변화가 아니라 거리다.** 칸으로 세면 45도로 걸을 때 x와 z가
 * 따로 경계를 넘어 같은 거리에 √2배가 세어진다 — 독·친밀도·알 부화·만보기가
 * 그만큼 빨라졌다 (실측 1.444, `node .audit/diagonalSteps.mjs`)
 */
const trace = new StepTrace()
/** 지난 프레임의 「칸 × 방향」. 같으면 떠나는 칸 처리를 다시 안 한다 */
let lastMove = -1

/**
 * 맵이 바뀌면 "같은 칸" 판정을 초기화한다.
 *
 * ⚠️ 안 하면 워프로 도착한 칸이 이미 밟은 것으로 남아, 그 칸을 벗어날 때까지
 * 걸음이 한 번도 안 세어진다
 */
export function resetStepTile(): void {
  const p = worldState.player.position
  trace.reset(p.x, p.z)
  lastMove = -1
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
  const now = new Date()
  const today = dayNumber(now)
  const daily = rollOver(save.daily, today)
  if (daily !== save.daily) {
    // 포켓루스는 **하루에 한 칸씩** 낫는다 (`Party_UpdatePokerusStatus`).
    // 며칠을 안 켰으면 그만큼 한꺼번에 깎이고, 나흘을 넘겼으면 통째로 낫는다.
    //
    // ⚠️ 시계를 뒤로 돌린 경우는 0이다 — `rollOver`가 그때 씨앗을 안 굴리는
    // 것과 같은 이유로, 균주도 시계를 돌려 가며 늘릴 수 없어야 한다
    const days = Math.max(0, today - save.daily.day)
    useSaveStore.setState({ daily, party: elapseDays(save.party, days) })
  }
  // 조우 시스템은 세이브를 못 읽는다 (PLAN §3.2). 갈아 끼울 값을 여기서 넘긴다
  encounters.swarmAt = swarmMap(daily)
  const garden = encounters.ex?.trophyGarden
  encounters.trophy = garden ? trophySpecies(daily, garden, save.nationalDex) : null
  checkMinutes(now)
}

/**
 * 분 단위로 흐르는 것 (`inline_020559DC` → `sub_02055B64`).
 *
 * 꿀 나무 스물한 그루(PARITY §6.6)와 나무열매 밭 118곳(§4.6)이 여기서 흐른다.
 * **켜 둔 동안만 세지 않는다** — 마지막으로 본 분을 리포트에 두고 그 차이를
 * 쓴다. 원작이 DS의 시계를 같은 방식으로 본다
 */
function checkMinutes(now: Date): void {
  const save = useSaveStore.getState()
  const stepped = elapseMinutes(save.daily, minuteNumber(now))
  if (stepped.state === save.daily) return
  const honeyTrees = elapseHoneyTrees(save.honeyTrees, stepped.minutes)
  const berryPatches = elapseBerries(save.berryPatches, stepped.minutes)
  useSaveStore.setState({
    daily: stepped.state,
    ...(honeyTrees === save.honeyTrees ? {} : { honeyTrees }),
    berryPatches,
  })
}

/**
 * 밤이 되면 스카이 쉐이미가 랜드로 돌아간다 (`Party_SetShayminForm`).
 *
 * ⚠️ **20시부터 4시까지다.** 원작은 필드 시계가 1분 단위로 이 판정을 돌리는데,
 * 우리는 프레임마다 봐도 결과가 같다 — 조건이 시각 하나뿐이라서다.
 * 리포트를 이어 열 때도 같은 판정이 돈다 (`game_start.c`가 그렇게 한다)
 */
function landShaymin(): void {
  if (!shayminMustLand(worldState.time.gameHour)) return
  const table = speciesTable
  if (!table) return
  const party = useSaveStore.getState().party
  if (!party.some((m) => m.species === SPECIES_SHAYMIN && m.form === SHAYMIN_SKY)) return
  useSaveStore.setState({
    party: party.map((mon) => (
      mon.species === SPECIES_SHAYMIN && mon.form === SHAYMIN_SKY
        ? changeForm(mon, SHAYMIN_LAND, { maxHp: (m) => statsOf(m, table.of(m)).hp })
        : mon
    )),
  })
}

export const stepSystem = {
  fixedUpdate(): void {
    checkDay()
    landShaymin()
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
    const moved = trace.advance(p.x, p.z)

    // ⚠️ **떠나는 칸에서 도는 것이 따로 있다** (PARITY §6.10). 원작은 유령
    // 소품 방아쇠·카메라 각·뛰는 자리를 걸음이 **시작될 때** 지금 서 있는
    // 칸과 누른 방향으로 돌린다 (`DistWorld_HandlePlayerMoved`). 도착한 칸에서
    // 돌리면 「방아쇠 칸에 서서 돌아선 뒤 걷기」가 빠져 블록이 안 나타난다.
    // 칸이나 방향이 바뀐 프레임에만 본다 — 누르고 있는 동안 매번 돌면 안 된다
    if (distortionActive()) {
      const dir = pushedDir()
      const moveKey = dir < 0 ? -1 : key * 4 + dir
      if (moveKey !== lastMove) {
        lastMove = moveKey
        if (moveKey >= 0) distortionMoved(p.x, p.y, p.z, dir)
      }
    }

    // 닿은 칸에서는 승강 발판·사건·스크립트 칸을 본다
    // (`DistWorld_HandlePlayerPositionChanged`).
    //
    // ⚠️ **칸이 바뀐 틱에 한 번이다.** 지나온 칸이 여럿이어도 넘길 좌표는 지금
    // 자리 하나뿐이라, 칸마다 부르면 같은 자리를 되풀이해 묻게 된다
    if (moved.tiles.length > 0 && distortionActive()) {
      distortionRebindPlatform(p.x, p.y, p.z)
      distortionStepped(p.x, p.y, p.z, facingDir())
    }

    // ⚠️ **여기부터가 「한 걸음」이다.** 「칸이 바뀌었는가」가 아니라 **1칸을
    // 지나왔는가**로 센다. 한 틱에 두 걸음이 나는 일은 거의 없지만, 나면 난 만큼 돈다
    for (let i = 0; i < moved.steps; i++) if (oneStep()) return
  },
}

/**
 * 한 걸음 (`Field_ProcessStep`).
 *
 * 참을 돌려주면 이 틱은 거기서 끝난다 — 알이 깼거나 스크립트가 걸린 것이고,
 * 원작도 첫 참에서 돌아온다
 */
function oneStep(): boolean {
  // 포켓치 만보기가 한 걸음 는다 (PARITY §7.3). 만보기를 안 받았으면
  // `poketchStep`이 앞에서 막는다
  poketchStep()

  // VS시커 배터리가 한 걸음 찬다 (`VsSeeker_UpdateStepCount`, PARITY §7.9) —
  // 가방에 있을 때만. 느낌표가 서 있으면 그 100걸음도 여기서 센다.
  // ⚠️ **레이더보다 먼저다** — 원작 `Field_ProcessStep`의 차례가 그렇다
  vsSeekerFieldStep()

  // 레이더 배터리가 한 걸음 찬다 (`RadarChargeStep`) — 가방에 있을 때만.
  // 그리고 무더기가 화면 밖으로 나갔는지도 걸음마다 본다
  radarStep()

  // 화면에 든 나무열매 밭이 자라기 시작한다 (`BerryPatches_UpdateGrowthStates`).
  // 원작도 칸이 바뀔 때마다 절두체로 잰다 (PARITY §4.6)
  berryPatchesStep()

  // 사파리는 걸음 오백을 센다 (`Field_UpdateSafari`, PARITY §7.7).
  // 볼이나 걸음이 떨어지면 롬의 스크립트가 안내원을 부른다
  safariFieldStep()


  const save = useSaveStore.getState()
  const vars = fieldScripts.vars
  // ⚠️ **상호교류광장 걸음은 광장 안에서만 세는 것이 아니다** (PARITY §7.8).
  // 원작이 어느 맵에서든 한 칸마다 올리고, 광장에 들어설 때 스크립트가
  // 0으로 지운다 — 그래서 「들어온 뒤 몇 걸음」이 된다
  vars.set(VAR_AMITY_STEPS, amityStep(vars.get(VAR_AMITY_STEPS)))
  // 걸은 수를 센다 (PARITY §7.5). ⚠️ **여기 말고 셀 자리가 없다** —
  // 원작도 `Field_ProcessStep` 한 자리에서 올린다
  useSaveStore.setState((st) => ({ records: addRecord(st.records, RECORD_STEPS, 1) }))
  const got = stepOnce({
    party: save.party,
    label: mapById(mapWorld.mapId)?.label ?? 0,
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
    return false
  }
  const bred = daycareStep({
    daycare: save.daycare,
    party: got.party,
    month: now.getMonth() + 1,
    day: now.getDate(),
    abilityOf: monAbility,
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
  if (bred.hatched >= 0) {
    // 알을 깬 수 (PARITY §7.5)
    useSaveStore.setState((st) => ({ records: addRecord(st.records, RECORD_EGGS_HATCHED, 1) }))
    useHatchStore.getState().open(bred.hatched)
    return true
  }

  // 알리는 것은 하나뿐이다 — 원작도 `Field_ProcessStep`이 첫 참에서 돌아온다
  const scripts = mapById(mapWorld.mapId)?.scripts
  if (scripts === undefined) return false
  if (got.poison !== Poison.NONE) { start(COMMON_SCRIPT_POISON, scripts); return true }
  if (got.repelExpired) { start(COMMON_SCRIPT_REPEL, scripts); return true }
  return false
}
