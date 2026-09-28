// 기술 창 · 가방에서 거는 필드 과제 — 빙글 워프 셋과 달콤한향기 (`field_move_tasks.c` · `item_use_functions.c`)
//
// 원작은 셋을 **필드 과제**로 돌린다: 파티 화면이나 가방을 닫고(`FieldSystem_StartFieldMap`) 필드로 돌아온 뒤
// 과제가 컷인 → 연출 → 맵 이동(또는 조우·대사)을 차례로 밟는다. 그동안은 발이 묶이고 메뉴도 안 열린다.
//
//   구멍파기 · 순간이동   컷인(`StartFieldMoveCutIn`) → 빙글 워프 (`engine/world/fieldWarp`)
//   동굴탈출로프          빙글 워프만 (`FieldWarp_InitEscapeRope`)
//   달콤한향기            컷인(`ov5_021F101C`) → 분홍 덮개 (`engine/world/sweetScent`)
//   달콤한꿀              분홍 덮개만 (`UseHoneyFromMenu`) — 하나는 가방이 이미 썼다
//
// 원작 인자가 프레임 수라 고정 스텝(1/60초)에서 민다 (`EngineDriver`의 등록 차례: 컷인 뒤 · 카메라 앞)
import { cameraDolly } from '../engine/actor/camera'
import { music } from '../engine/audio/music'
import { sweetScentEncounter, tileHasEncounterRate, tableForCurrentMap } from '../engine/battle/encounterSystem'
import { spawnWarp } from '../engine/map/spawns'
import { mapById, world, type PendingWarp } from '../engine/map/world'
import { coverScreen, fadeColor, fadeDone, screenTint, startFade } from '../engine/script/fade'
import { facingOfDir, start as startScript } from '../engine/script/field'
import { LocationEvent } from '../engine/world/journal'
import { FIELD_WARP_FADE, FIELD_WARP_SE, FieldWarpRun, fieldWarpColor, type FieldWarpKind } from '../engine/world/fieldWarp'
import { overworldWeather } from '../engine/world/overworldWeather'
import { SWEET_SCENT_TINT, SweetScentRun } from '../engine/world/sweetScent'
import { useBattleStore } from '../state/battleStore'
import { useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'
import { hmCutInDone, startHmCutInFor } from './hmCutInScene'
import { journalPlain, journalUsedMove, journalWarpedByMove } from './journal'

/** `StartScreenFade`의 종류 — 짝수가 아웃, 홀수가 인 (`engine/script/fade`) */
const FADE_OUT = 0
const FADE_IN = 1

type Task =
  /** 컷인이 도는 중 — 끝나면 `then`이 다음 과제를 건다 */
  | { kind: 'cutIn', then: () => Task | null }
  | { kind: 'warp', run: FieldWarpRun, target: PendingWarp, stage: 'out' | 'transit' | 'in' }
  | { kind: 'scent', run: SweetScentRun }
  /** 달콤한향기가 조우를 걸었다 — 배틀이 열릴 때까지 분홍을 붙들고 있는다 */
  | { kind: 'lured', frames: number }

let task: Task | null = null

/** 분홍을 붙드는 가장 긴 시간. 조우 연출이 어디서 멎어도 화면이 분홍으로 남지 않게 한다 */
const LURED_HOLD_FRAMES = 600

/** 지금 필드 과제가 도는가 — 발이 묶이고 메뉴가 안 열린다 (`fieldTask`) */
export function fieldMoveTaskBusy(): boolean {
  return task !== null && task.kind !== 'lured'
}

function warpTask(kind: FieldWarpKind, target: PendingWarp): Task {
  void music.playEffect(FIELD_WARP_SE[kind])
  return { kind: 'warp', run: new FieldWarpRun(kind, fadeDone), target, stage: 'out' }
}

/** 컷인을 먼저 돌리고 `then`으로 넘어간다. 자리가 비어 컷인이 안 열리면 곧바로 넘어간다 */
function afterCutIn(slot: number | null, then: () => Task | null): Task | null {
  if (slot === null) return then()
  startHmCutInFor(slot)
  return hmCutInDone() ? then() : { kind: 'cutIn', then }
}

/** 굴 입구 (`FieldOverworldState_GetExitLocation`). 로프와 구멍파기가 여기로 나간다 */
function exitTarget(): PendingWarp | null {
  const exit = useSaveStore.getState().exit
  if (!exit) return null
  return { to: exit.map, matrix: exit.matrix, x: exit.x, z: exit.z, viaDoor: false }
}

/**
 * 동굴탈출로프 (`FieldWarp_InitEscapeRope`). 돌아갈 굴 입구가 없으면 거짓 — 한 번도 굴에 안 들어간 판이다
 */
export function beginEscapeRope(): boolean {
  if (task !== null) return false
  const target = exitTarget()
  if (target === null) return false
  task = warpTask('escapeRope', target)
  return true
}

/**
 * 구멍파기 · 순간이동 (`FieldMoves_DigTask` · `FieldMoves_TeleportTask`). `slot`이 기술을 쓰는 파티 자리다.
 *
 * 순간이동은 부활 자리의 **공중날기 칸**으로 간다(`Location_InitFly(FieldOverworldState_GetBlackOutWarpId)`) —
 * 센터 안이 아니라 그 마을 바깥이다. 구멍파기는 로프와 같은 굴 입구다. 노트는 구멍파기가 떠날 때(쓴 맵),
 * 순간이동이 도착한 뒤(`CreateJournalEntryForTeleport` — 도착한 맵)에 적는다
 */
export function beginWarpMove(kind: 'dig' | 'teleport', slot: number): boolean {
  if (task !== null) return false
  const target = kind === 'teleport' ? spawnWarp(useSaveStore.getState().healSpot, 'fly') : exitTarget()
  if (target === null) return false
  if (kind === 'dig') journalUsedMove(LocationEvent.USED_DIG, world.mapId)
  task = afterCutIn(slot, () => warpTask(kind, target))
  return true
}

/**
 * 달콤한향기 · 달콤한꿀. `slot`이 null이면 꿀이다 — 컷인도 노트도 없다.
 *
 * 기술로 쓰면 그 자리에서 노트에 「포켓몬을 불러냈다」를 적는다 (`FieldMoves_SetSweetScentTask`) — 조우가
 * 나든 안 나든 적는다
 */
export function beginSweetScent(slot: number | null): boolean {
  if (task !== null) return false
  if (slot !== null) journalPlain(LocationEvent.LURED_POKEMON)
  task = afterCutIn(slot, () => ({
    kind: 'scent',
    run: new SweetScentRun({
      weather: overworldWeather.value,
      hasWild: tableForCurrentMap() !== null,
      tileHasRate: tileHasEncounterRate,
    }),
  }))
  return true
}

/**
 * 맵이 갈렸다 (`scene/MapStreamer`의 워프 끝). 빙글 워프로 온 것이면 덮개를 다시 덮고 들어오는 연출을 건다.
 *
 * ⚠️ **`enter` 뒤에 불러야 한다** — 그 안의 `resetFade`가 덮개를 걷는다
 */
export function fieldWarpArrived(): void {
  if (task?.kind !== 'warp' || task.stage !== 'transit') return
  coverScreen(fieldWarpColor(task.run.kind))
  task.run.arrive()
  task.stage = 'in'
}

function stepWarp(t: Extract<Task, { kind: 'warp' }>): Task | null {
  if (t.stage === 'transit') return t
  const frame = t.run.step()
  if (frame.dir !== null) worldState.player.facing = facingOfDir(frame.dir)
  cameraDolly.warp = frame.dolly
  if (frame.fade !== null) {
    startFade(FIELD_WARP_FADE.steps, FIELD_WARP_FADE.framesPerStep,
      frame.fade === 'out' ? FADE_OUT : FADE_IN, fieldWarpColor(t.run.kind))
  }
  if (frame.changeMap) {
    t.stage = 'transit'
    // 소리는 돌기 시작할 때 이미 냈다. 문·계단 소리를 또 내지 않는다
    world.pending = { ...t.target, silent: true, fieldWarp: t.run.kind }
    return t
  }
  if (!frame.done) return t
  cameraDolly.warp = 1
  if (t.run.kind === 'teleport') journalWarpedByMove(world.mapId)
  return null
}

function stepScent(t: Extract<Task, { kind: 'scent' }>): Task | null {
  const frame = t.run.step()
  screenTint.alpha = frame.tint
  screenTint.color = fadeColor(SWEET_SCENT_TINT)
  if (frame.se !== null) void music.playEffect(frame.se)
  if (frame.script !== null) startScript(frame.script, mapById(world.mapId)?.scripts ?? -1)
  if (frame.encounter) return sweetScentEncounter() ? { kind: 'lured', frames: 0 } : clearTint()
  return frame.done ? clearTint() : t
}

function clearTint(): null {
  screenTint.alpha = 0
  return null
}

/** 한 프레임. 고정 스텝에서 부른다 */
export function fieldMoveTaskTick(): void {
  const t = task
  if (t === null) return
  switch (t.kind) {
    case 'cutIn':
      task = hmCutInDone() ? t.then() : t
      break
    case 'warp':
      task = stepWarp(t)
      break
    case 'scent':
      task = stepScent(t)
      break
    case 'lured':
      // 배틀이 열리면 걷는다 — 조우 연출 동안은 원작도 BG2가 분홍인 채다
      t.frames++
      if (useBattleStore.getState().phase !== 'off' || t.frames > LURED_HOLD_FRAMES) task = clearTint()
      break
  }
  // 도는 동안은 발이 묶인다. 씬도 프레임마다 모으지만 거기는 그리는 틀이라 한 틀 늦을 수 있다
  if (fieldMoveTaskBusy()) worldState.player.riding = true
}

/** 새 판 · 이어하기. 남겨 두면 덮개와 카메라가 그대로 걸려 있다 */
export function resetFieldMoveTask(): void {
  task = null
  cameraDolly.warp = 1
  screenTint.alpha = 0
}
