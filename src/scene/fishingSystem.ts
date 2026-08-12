// 낚시를 세계에 붙인다 (PARITY §1.5) — `FieldTask_Fishing`.
//
// 규칙(창 길이·기다림·결과)은 `engine/actor/fishing.ts`에 있고 여기는
// **언제 시작하고 무엇을 끊는가**만 한다.
//
// ⚠️ **물릴지는 던지기 전에 정해진다.** 원작이 그 순서라 "안 물리는 판"의
// 기다림이 4초로 고정이다. 던지고 나서 굴리면 그 고정 길이를 만들 수 없다.
import {
  castSounds, startFishing, tickFishing, type FishingResult, type FishingState,
} from '../engine/actor/fishing'
import { hooksFish, rollRod, wildForm, type Rod, type WildEncounter } from '../engine/battle/encounter'
import { encounters, tableForCurrentMap } from '../engine/battle/encounterSystem'
import { fishRate, forcedSlot, waterLevel, waterSpeciesOf } from '../engine/battle/encounterLead'
import { facingFeebas, FEEBAS_LEVELS, MAP_MT_CORONET_B1F } from '../engine/world/daily'
import { frontTile, scriptBusy } from '../engine/script/field'
import { world as mapWorld } from '../engine/map/world'
import { useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'

export const fishing = {
  /** 지금 낚는 중이면 그 판. 화면이 이걸 들여다본다 */
  state: null as FishingState | null,
  /** 낚았을 때 나올 것. 던지는 순간 이미 굴려 둔다 */
  catch: null as WildEncounter | null,
  /** 물소리를 내라는 신호. 화면이 한 번 울리고 스스로 내린다 */
  splash: false,
  rng: Math.random as () => number,
}

/** A가 **이번 프레임에 새로 눌렸는가** (`TryPressA`). 누르고 있는 것과 다르다 */
let heldA = false
let heldB = false

/**
 * 지금 보고 있는 칸이 오늘의 빈티나 칸인가 (PARITY §1.5 · §6.11).
 *
 * ⚠️ **표를 갈아 끼우는 것이 아니라 통째로 덮는다.** 원작이
 * `WildEncounters_TryFishingEncounter`에서 다섯 칸을 전부 빈티나로 채운다 —
 * 그래서 그 칸에서는 **낚싯대 종류와 무관하게** 빈티나만 나온다
 */
function feebasHere(): WildEncounter | null {
  const ex = encounters.ex
  const grid = mapWorld.grid
  if (!ex || !grid || mapWorld.mapId !== MAP_MT_CORONET_B1F) return null
  const front = frontTile()
  const got = facingFeebas(
    useSaveStore.getState().daily.rand, ex.feebas, grid.tileWidth / 32,
    front.x, front.z, () => fishing.rng() < 0.5,
  )
  if (!got) return null
  const span = FEEBAS_LEVELS.max - FEEBAS_LEVELS.min + 1
  return {
    species: ex.feebas.species,
    level: FEEBAS_LEVELS.min + Math.floor(fishing.rng() * span),
    slot: 0,
    form: 0,
    // 배회는 낚시로 안 나온다 — 원작도 물 위 조우 자리에서만 물어본다
    roamer: null,
  }
}

/**
 * 낚싯대를 던진다. 던질 수 있는지는 이미 `fieldAction`이 봤다.
 *
 * 표가 없는 자리(인카운터 표가 안 붙은 물)에서는 아무것도 안 물린다 —
 * 원작도 출현률 0이면 `TryFishingEncounter`가 거짓이다
 */
export function castRod(rod: Rod): void {
  const table = tableForCurrentMap()
  const lead = encounters.mods.lead
  const rng = fishing.rng
  // ⚠️ **낚시에는 피리도 클리어부적도 안 붙는다.** 원작이 낚시 갈래에서만
  // 특성 보정을 부른다 — 그 안의 끈끈이·흡반 2배는 되살렸다 (BUGS.md §1.2)
  const hooked = table !== null && hooksFish(table, rod, rng, (r) => fishRate(r, lead))
  fishing.catch = hooked && table
    ? feebasHere() ?? rollRod(table, rod, rng, {
      // 자력·정전기가 물에서도 돈다 (BUGS.md §1.3)
      pick: (t) => forcedSlot(waterSpeciesOf(t), lead, encounters.typeOf, rng),
      level: (min, max) => waterLevel(min, max, lead, rng),
    })
    : null
  // 낚아 올린 것도 모습을 정한다 — 조개무지는 낚싯대에도 걸린다 (PARITY §3.4)
  if (fishing.catch && table) fishing.catch.form = wildForm(table, fishing.catch.species, rng)
  // 표에는 걸렸는데 그 칸이 비어 있으면 아무것도 안 나온다. 그건 "안 물린 것"이다
  fishing.state = startFishing(rod, fishing.catch !== null, fishing.rng)
  // 낚는 동안은 야생이 안 튀어나온다. 물 위에서 낚으면 그 칸이 조우 칸이다
  encounters.suspended = true
  // 가방을 닫은 그 A가 낚싯대를 당기면 안 된다 — 눌린 채로 시작하는 셈이라
  // 첫 프레임이 곧바로 "너무 일렀다"가 된다
  heldA = true
  heldB = true
}

/** 화면이 결과 글을 다 보여 준 뒤에 부른다. 배틀로 갈지 여기서 갈린다 */
export function endFishing(): WildEncounter | null {
  const got = fishing.state?.result === 'caught' ? fishing.catch : null
  fishing.state = null
  fishing.catch = null
  encounters.suspended = false
  return got
}

export const fishingSystem = {
  fixedUpdate(): void {
    const s = fishing.state
    if (s === null) return
    // 스크립트가 끼어들면 낚시를 접는다 — 원작은 애초에 스크립트가 못 끼어든다
    if (scriptBusy()) { fishing.state = null; fishing.catch = null; return }

    // 발을 묶는다. 입력 시스템 다음, 이동 시스템 앞에서 돌아야 이 지우기가 먹는다
    worldState.input.move.set(0, 0)
    worldState.player.velocity.set(0, 0, 0)

    const down = worldState.input.interact
    const pressed = down && !heldA
    heldA = down
    // 글은 A **또는 B**로 닫는다 (`TryPressAOrB`). 취소 키도 같은 자리다
    const cancel = worldState.input.cancel
    const closing = pressed || (cancel && !heldB)
    heldB = cancel

    if (castSounds(s)) fishing.splash = true
    fishing.state = tickFishing(s, pressed, closing)
  },
}

/** 결과 글을 몇 프레임 띄우고 있을 것인가는 화면이 정한다. 여기는 무엇인지만 */
export function fishingResult(): FishingResult | null {
  return fishing.state?.result ?? null
}
