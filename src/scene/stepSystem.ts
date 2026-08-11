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
import { loadItems, type ItemTable } from '../data/gameData'

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

export const stepSystem = {
  fixedUpdate(): void {
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

    vars.set(VARS_START + VAR_FRIENDSHIP_STEPS, got.friendshipSteps)
    useSaveStore.setState({
      party: got.party,
      steps: { poison: got.poisonSteps, repel: got.repelSteps },
      vars: Uint16Array.from(vars.saved),
    })

    // 알리는 것은 하나뿐이다 — 원작도 `Field_ProcessStep`이 첫 참에서 돌아온다
    const scripts = mapById(mapWorld.mapId)?.scripts
    if (scripts === undefined) return
    if (got.poison !== Poison.NONE) { start(COMMON_SCRIPT_POISON, scripts); return }
    if (got.repelExpired) start(COMMON_SCRIPT_REPEL, scripts)
  },
}
