// 나무열매 밭이 도는 자리 (PARITY §4.6)
//
// 규칙은 `engine/world/berryPatches`가 들고 있고 여기는 **리포트를 잇는 일**과
// 물뿌리개를 맡는다.
//
// ⚠️ **밭은 눈으로 봐야 자란다.** `isGrowing`을 세우는 자리가 원작에 하나뿐이고
// 그게 「화면에 밭이 들어왔는가」다 (`BerryPatches_UpdateGrowthStates`). 한 걸음
// 걸을 때마다 절두체로 재는데, 우리도 카메라로 같은 것을 잰다.
import { DIR, DIR_STEP } from '../engine/script/movement'
import { npcActors } from '../engine/actor/npcs'
import { world as mapWorld } from '../engine/map/world'
import { scriptBusy } from '../engine/script/field'
import {
  BERRY_STAGE, berryGrowth, berryItemOf, berryTagOf, elapseBerryPatches, harvestPatch,
  mulchItemOf, mulchTypeOf, plantBerry, soilMoisture, waterPatch, type BerryPatch,
} from '../engine/world/berryPatches'
import { useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'

/** `OBJ_EVENT_GFX_BERRY_SOIL` — 밭 객체의 그림 번호 (`BerryPatchGraphics_IsBerryPatch`) */
const BERRY_SOIL_GFX = 100

/** `POCKET_BERRIES`. 열매는 늘 이 주머니라 도구 표를 안 기다린다 */
const POCKET_BERRIES = 4

/** 지금 맵의 밭 객체들. 배치표의 `data[0]`이 밭 번호다 */
export function berryPatchObjects(): { patch: number; x: number; z: number }[] {
  const out: { patch: number; x: number; z: number }[] = []
  for (const actor of npcActors.list) {
    if (actor.info.sprite !== BERRY_SOIL_GFX) continue
    out.push({ patch: actor.params[0] ?? 0, x: Math.round(actor.x), z: Math.round(actor.z) })
  }
  return out
}

/**
 * 화면에 들어왔는지 재는 자리. 씬이 카메라를 물려 준다 (`BerryPatchProps`).
 *
 * 안 물려 있으면 아무 밭도 안 자란다 — 원작도 절두체 판정이 없으면 그렇다
 */
export const berryView: { inView: ((x: number, z: number) => boolean) | null } = {
  inView: null,
}

const patchesOf = (): BerryPatch[] => useSaveStore.getState().berryPatches

function writePatch(patch: number, next: BerryPatch): void {
  const list = patchesOf()
  if (!list[patch]) return
  const out = list.slice()
  out[patch] = next
  useSaveStore.setState({ berryPatches: out })
}

/**
 * 화면에 든 밭에 「자란다」를 세운다 (`BerryPatches_UpdateGrowthStates`).
 *
 * 한 걸음마다 돈다 (`FieldMap_Main`이 칸이 바뀔 때 부른다).
 *
 * ⚠️ **되돌리지 않는다.** 한 번 서면 리포트에 남아 그 뒤로는 화면 밖에서도
 * 자란다 — 원작도 내리는 자리가 밭을 비울 때뿐이다
 */
export function berryPatchesStep(): void {
  const inView = berryView.inView
  if (inView === null) return
  const list = patchesOf()
  let out: BerryPatch[] | null = null
  for (const obj of berryPatchObjects()) {
    const patch = list[obj.patch]
    if (!patch || patch.isGrowing) continue
    if (!inView(obj.x, obj.z)) continue
    out ??= list.slice()
    out[obj.patch] = { ...patch, isGrowing: true }
  }
  if (out !== null) useSaveStore.setState({ berryPatches: out })
}

/** 지나간 분만큼 민다. 꿀 나무와 같은 자리에서 돈다 (`stepSystem`의 `checkMinutes`) */
export function elapseBerries(list: readonly BerryPatch[], minutes: number): BerryPatch[] {
  return elapseBerryPatches(list, minutes)
}

// ── 물뿌리개 (`BerryPatches_TaskMain`) ───────────────────────────────────────

/** `task->timer > 30 * 3` — 아무 키도 안 누르고 이만큼 지나면 끝난다 */
const WATER_HOLD_TICKS = 90

/**
 * 옆 밭으로 옮겨 서는 데 걸리는 시간.
 *
 * ⚠️ **우리가 정한 값이다.** 원작은 사람 그림의 10·11번 애니가 끝날 때까지
 * 기다리는데(`MapObject_HasAnimationEnded`) 그 길이가 그림 자료 안에 있다.
 * 한 칸을 옮기는 걸음이라 보통 걸음과 같은 속도로 둔다
 */
const WATER_SIDESTEP_SECONDS = 0.25

type WaterState = 'watering' | 'input' | 'animation'

interface WateringTask {
  state: WaterState
  /** 시작할 때 보고 있던 쪽. 끝나면 이쪽으로 돌아선다 */
  dir: number
  timer: number
  /** 옆으로 옮겨 서는 중이면 −1(서쪽) 또는 1(동쪽) */
  slide: number
  /** 옮겨 서기 시작한 x와 지난 시간 */
  fromX: number
  elapsed: number
}

export const watering: { task: WateringTask | null } = { task: null }

/** 물을 주고 있는가. 화면이 물뿌리개를 들지 말지 이걸 본다 */
export function wateringActive(): boolean { return watering.task !== null }

const tileX = (): number => Math.round(worldState.player.position.x)
const tileZ = (): number => Math.round(worldState.player.position.z)

/** 그 칸의 밭 번호. 밭이 아니면 null */
function patchAtTile(x: number, z: number): number | null {
  for (const obj of berryPatchObjects()) {
    if (obj.x === x && obj.z === z) return obj.patch
  }
  return null
}

/**
 * 물을 줄 밭 (`BerryPatches_GetTargetPatch`). 보고 있는 쪽 한 칸이다.
 *
 * ⚠️ **위아래로만 준다.** 원작이 좌우면 `GF_ASSERT(FALSE)`로 걸리고, 그래서
 * 스크립트도 `GetPlayerDir`이 0(북)일 때만 물뿌리개를 꺼낸다
 */
function targetPatch(dir: number): number | null {
  const step = DIR_STEP[dir]
  if (!step || (dir !== DIR.north && dir !== DIR.south)) return null
  return patchAtTile(tileX() + step.x, tileZ() + step.z)
}

/**
 * 옆에 밭이 또 있는가 (`BerryPatches_GetAdjacentObject`).
 *
 * ⚠️ **z를 늘 하나 뺀다.** 원작이 보고 있는 쪽과 상관없이 `playerZ -= 1`로 본다 —
 * 물을 주는 것이 북쪽뿐이라 그 자리가 곧 「지금 주고 있는 밭의 옆」이다
 */
function adjacentPatch(side: number): number | null {
  return patchAtTile(tileX() + side, tileZ() - 1)
}

/** 옆으로 옮겨 설 수 있는가 (`BerryPatches_CheckCollision`). 지형과 사람 둘 다 본다 */
function canSidestep(side: number): boolean {
  const x = tileX() + side
  const z = tileZ()
  if (mapWorld.grid?.isBlockedAtWorld(x, z) === true) return false
  return !npcActors.list.some((a) => Math.round(a.x) === x && Math.round(a.z) === z)
}

/** 물뿌리개를 든다 (`BerryPatches_StartWatering`) */
export function startWatering(): void {
  const p = worldState.player
  watering.task = {
    state: 'watering',
    dir: facingDir(),
    timer: 0,
    slide: 0,
    fromX: p.position.x,
    elapsed: 0,
  }
}

/** 물뿌리개를 벗는다 (`BerryPatches_EndWatering`) */
export function endWatering(): void {
  watering.task = null
}

/** 지금 보고 있는 쪽을 원작의 방향 번호로. `stepSystem`의 것과 같은 식이다 */
function facingDir(): number {
  const quarter = ((Math.round(worldState.player.facing / (Math.PI / 2)) % 4) + 4) % 4
  return [DIR.south, DIR.east, DIR.north, DIR.west][quarter] ?? DIR.north
}

/** 그쪽을 보게 한다. `facing`은 `atan2(vx, vz)`라 0이 남쪽이다 */
function face(dir: number): void {
  const quarter = ([DIR.south, DIR.east, DIR.north, DIR.west] as number[]).indexOf(dir)
  if (quarter < 0) return
  worldState.player.facing = quarter * (Math.PI / 2)
}

/**
 * 물을 주는 동안 도는 것 (`BerryPatches_TaskMain`).
 *
 * ⚠️ **발을 묶는다.** 물을 주는 동안은 방향키가 걸음이 아니라 **옆 밭으로
 * 옮겨 서기**다 — 안 묶으면 물뿌리개를 든 채로 걸어 나간다
 */
export const berryWateringSystem = {
  fixedUpdate(dt: number): void {
    const task = watering.task
    if (task === null) return

    // ⚠️ **지우기 전에 읽는다.** 원작은 `gSystem.heldKeys`를 따로 보지만 우리는
    // 같은 칸을 쓰므로, 먼저 지우면 옆 밭으로 옮겨 설 방향이 늘 0이 된다
    const pushX = worldState.input.move.x
    const pushY = worldState.input.move.y

    // 발을 묶는다. 입력 시스템 다음, 이동 시스템 앞에서 돌아야 이 지우기가 먹는다
    worldState.input.move.set(0, 0)
    worldState.player.velocity.set(0, 0, 0)

    switch (task.state) {
      case 'watering': {
        const patch = targetPatch(task.dir)
        if (patch !== null) {
          const list = patchesOf()
          const before = list[patch]
          if (before) writePatch(patch, waterPatch(before))
        }
        task.timer = 0
        task.state = 'input'
        return
      }

      case 'input': {
        const side = pushX < -0.5 ? -1 : pushX > 0.5 ? 1 : 0
        if (side !== 0) {
          // ⚠️ **옆에 밭이 없으면 그 자리에서 끝난다** — 옮겨 서지도 않는다.
          // 그래서 네 칸짜리 밭의 끝에서 옆을 누르면 물주기가 닫힌다
          if (adjacentPatch(side) === null) { stopWatering(task); return }
          if (canSidestep(side)) {
            task.slide = side
            task.fromX = worldState.player.position.x
            task.elapsed = 0
            task.state = 'animation'
            return
          }
        } else if (pushY < -0.5 && task.dir === DIR.south) {
          face(DIR.north)
          stopWatering(task)
          return
        } else if (pushY > 0.5 && task.dir === DIR.north) {
          stopWatering(task)
          return
        }
        task.timer++
        if (task.timer > WATER_HOLD_TICKS) stopWatering(task)
        return
      }

      case 'animation': {
        task.elapsed += dt
        const t = Math.min(1, task.elapsed / WATER_SIDESTEP_SECONDS)
        worldState.player.position.x = task.fromX + task.slide * t
        if (t < 1) return
        // 옮겨 선 자리 앞에 또 밭이 있으면 거기에 물을 준다. 없으면 끝난다
        if (targetPatch(task.dir) === null) stopWatering(task)
        else task.state = 'watering'
        return
      }
    }
  },
}

/** 끝난다. 원작은 여기서 보고 있던 쪽으로 돌려 세우고 발을 묶는다 */
function stopWatering(task: WateringTask): void {
  face(task.dir)
  watering.task = null
}

/**
 * 스크립트가 물뿌리개를 놓기 전에 끊겼을 때를 위한 안전장치.
 *
 * 원작은 태스크가 스크립트와 함께 돌므로 이런 자리가 없지만, 우리는 맵을 옮기거나
 * 배틀이 끼어들 수 있다 — 물뿌리개를 든 채로 남으면 발이 영영 묶인다
 */
export function berryWateringCancel(): void {
  if (watering.task !== null && !scriptBusy()) endWatering()
}

// ── 스크립트가 부르는 자리 (`FieldServices.berryPatches`) ────────────────────

export const berryPatchServices = {
  growthStage: (patch: number): number => patchesOf()[patch]?.growthStage ?? BERRY_STAGE.none,
  berryItem: (patch: number): number => berryItemOf(patchesOf()[patch]?.berryID ?? 0),
  mulchItem: (patch: number): number => mulchItemOf(patchesOf()[patch]?.mulchType ?? 0),
  moisture: (patch: number): number => {
    const at = patchesOf()[patch]
    return at ? soilMoisture(at) : 0
  },
  yield: (patch: number): number => patchesOf()[patch]?.yield ?? 0,

  setMulch: (patch: number, mulchItem: number): void => {
    const at = patchesOf()[patch]
    if (!at) return
    writePatch(patch, { ...at, mulchType: mulchTypeOf(mulchItem) })
  },

  plant: (patch: number, berryItem: number): void => {
    const at = patchesOf()[patch]
    if (!at) return
    const berryID = berryTagOf(berryItem)
    const growth = berryGrowth(berryID)
    if (growth === null) return
    writePatch(patch, plantBerry(at, growth, berryID))
  },

  /**
   * 딴다. 가방에 넣는 것까지 여기서 한다 (`Bag_TryAddItem`).
   *
   * ⚠️ **가방이 찼는지는 안 본다** — 스크립트가 `GoToIfCannotFitItem`으로
   * 먼저 갈라 놓았다
   */
  harvest: (patch: number): void => {
    const at = patchesOf()[patch]
    if (!at) return
    const item = berryItemOf(at.berryID)
    const got = harvestPatch(at)
    writePatch(patch, got.patch)
    if (item !== 0 && got.yield > 0) useSaveStore.getState().addItem(POCKET_BERRIES, item, got.yield)
  },

  water: (start: boolean): void => {
    if (start) startWatering()
    else endWatering()
  },
}
