// 조우 컷인을 세계에 붙인다 (`engine/battle/encounterCutIn`)
//
// 규칙과 프레임 표는 엔진 쪽에 있고, 여기는 **언제 걸고 무엇이 그것을 보는가**만
// 한다 — 걸음 계수기가 `engine/actor/steps`와 `scene/stepSystem`으로 갈린 것과
// 같은 나눔이다.
//
// 원작의 차례가 그대로다 (`encounter.c`의 `FieldTask_Encounter`):
//
//   ① 사람과 사람을 멈춘다        `MapObjectMan_PauseAllMovement`
//   ② 컷인을 돌린다               `FieldTransition_StartEncounterEffect`
//   ③ **끝나면** 맵을 내리고 배틀을 부른다
//
// ⚠️ **③이 ②를 기다리는 것이 요점이다.** 안 기다리면 배틀 화면이 컷인 위로
// 덮여서, 두 번 번쩍이는 동안 화면에 이미 체력 상자가 서 있다.
import { cutInForBattle, cutInFrame, EncounterCutIn } from '../engine/battle/encounterCutIn'
import { terrainOf } from '../engine/battle/terrain'
import { mapById, world as mapWorld } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { useSaveStore } from '../state/saveStore'
import { loadTrainers } from '../data/gameData'
import { markCutIn } from '../app/sceneMark'

let running: EncounterCutIn | null = null
let waiting: (() => void)[] = []

/**
 * 컷인 하나를 걸고 **끝날 때까지 기다린다.**
 *
 * 돌아온 뒤에 배틀을 연다 — 원작의 `FieldTask_Encounter`가 그 차례다.
 * 이미 도는 것이 있으면 그것이 끝나기를 기다리고 새로 안 건다
 */
function runCutIn(effect: number): Promise<void> {
  if (running === null) {
    running = new EncounterCutIn(effect)
    cutInFrame.now = null
    markCutIn(effect)
  }
  return new Promise((resolve) => waiting.push(resolve))
}

/**
 * 맵을 옮기거나 배틀이 딴 길로 열리면 지운다.
 *
 * ⚠️ **기다리던 쪽을 반드시 풀어 준다.** 안 풀면 `runCutIn`을 기다리던 자리가
 * 영영 서고 그 배틀이 안 열린다
 */
export function resetCutIn(): void {
  running = null
  cutInFrame.now = null
  markCutIn(null)
  const woken = waiting
  waiting = []
  for (const resolve of woken) resolve()
}

export const cutInSystem = {
  fixedUpdate(): void {
    if (running === null) return
    const at = running.tick()
    cutInFrame.now = at
    if (!at.done) return
    // ⚠️ **끝난 프레임의 그림은 남겨 둔다** — 그 프레임이 검정이고, 배틀 화면이
    // 제 검은 막을 올리기 전까지 그 검정이 이음매를 덮는다. 지우는 것은
    // `resetCutIn`이고 배틀이 열린 뒤에 부른다
    running = null
    const woken = waiting
    waiting = []
    for (const resolve of woken) resolve()
  },
}

/**
 * 이 자리에서 배틀을 열면 어느 컷인인가.
 *
 * 지형은 **밟고 선 칸**이 먼저다 — 무대 고르기·도롱마담 옷감과 같은 자
 * (`battle/terrain`의 `terrainOf`)를 쓴다. 원작도 컷인과 무대가 같은 `dto->terrain`을 본다.
 *
 * ⚠️ **파도타기 중이면 물이다.** 그때 밟고 선 칸이 실제로 물 거동값이라
 * `terrainOf`가 알아서 물을 낸다 — 여기서 따로 갈라 두면 두 자리가 갈린다
 */
function cutInFor(o: { trainer: boolean, foeLevel: number }): number {
  const here = mapWorld.grid?.behaviorAtWorld(
    worldState.player.position.x, worldState.player.position.z) ?? null
  // ⚠️ **선두가 아니라 「싸울 수 있는 첫 마리」다** (`Party_FindFirstEligibleBattler`).
  // 리펠이 보는 그 마리와 같다 (`scene/stepSystem`의 `publishMods`)
  const mine = useSaveStore.getState().party.find((m) => !m.isEgg && m.hp > 0)
  return cutInForBattle({
    trainer: o.trainer,
    terrain: terrainOf(here, mapById(mapWorld.mapId)?.battleBg ?? -1),
    myLevel: mine?.level ?? 0,
    foeLevel: o.foeLevel,
  })
}

/**
 * 컷인을 돌리고 **끝난 뒤에** 배틀을 연다 (`FieldTask_Encounter`의 0 → 2단계).
 *
 * ⚠️ **연 다음 곧바로 지운다.** 배틀 화면이 제 검은 막을 들고 뜨므로
 * (`ui/battle/battleScreen.css`의 `wipe`) 이음매는 그쪽이 덮는다. 안 지우면
 * 컷인의 마지막 검정이 배틀 위에 영영 남는다
 */
export async function cutInThenBattle(
  o: { trainer: boolean, foeLevel: number }, open: () => void,
): Promise<void> {
  await runCutIn(cutInFor(o))
  open()
  resetCutIn()
}

/**
 * 트레이너전도 같은 차례다 (`FieldTask_Encounter`가 야생·트레이너를 안 가른다).
 *
 * ⚠️ **상대 레벨을 먼저 알아야 한다** — 컷인 번호가 그것으로 갈린다. 트레이너의
 * 첫 마리가 곧 `Party_FindFirstEligibleBattler`의 답이다(막 만든 파티라 아무도
 * 안 쓰러져 있다). 표를 여기서 먼저 받지만 **더 기다리게 되지는 않는다** —
 * 배틀이 어차피 같은 표를 받고(`battleStore`), 받아 둔 것은 캐시된다
 *
 * ⚠️ **못 받으면 컷인 없이 연다.** 소리·연출 때문에 배틀 자체가 안 열리면 안 된다
 */
export async function cutInThenTrainerBattle(
  trainerID: number, open: () => void,
): Promise<void> {
  let foeLevel: number
  try {
    foeLevel = (await loadTrainers()).get(trainerID).party[0]?.level ?? 0
  } catch { open(); return }
  await cutInThenBattle({ trainer: true, foeLevel }, open)
}

/**
 * 컷인의 **한 프레임에 세워 둔다** (개발 콘솔 `pt.cutIn`).
 *
 * ⚠️ **화면으로 확인할 길이 이것뿐이다.** 컷인은 서른여덟 프레임에 지나가는데
 * 헤드리스는 초당 네댓 장밖에 못 그려서(`pnpm shot` 머리말) 도중을 못 잡는다.
 * 그래서 굴리지 않고 **그 프레임의 값을 그대로 얹어 둔다** — 덮개도 후처리도
 * 카메라도 `cutInFrame.now` 하나만 보므로 그 프레임이 화면에 그대로 선다.
 *
 * `frame`이 음수면 지운다
 */
export function pinCutIn(effect: number, frame: number): void {
  resetCutIn()
  if (frame < 0) return
  const cut = new EncounterCutIn(effect)
  let at = cut.tick()
  for (let i = 0; i < frame; i += 1) at = cut.tick()
  cutInFrame.now = at
}
