// VS시커가 도는 자리 (PARITY §7.9) — `overlay005/vs_seeker.c`
//
// 규칙은 `engine/world/vsSeeker`가 들고 있고 여기는 **지금 맵에 선 사람들**과
// 세이브를 잇는 일만 한다.
//
// ⚠️ **자리 표시는 세이브에 안 남는다.** 「지금 느낌표가 서 있는 사람」은 맵
// 객체의 이동 유형 하나로만 있고, 맵을 옮기면 통째로 사라진다 — 원작도
// `field_map_change.c`가 맵을 갈 때마다 `SystemVars_ResetVsSeeker`를 부른다.
// 그래서 여기 있는 `marks`도 맵과 함께 죽는다.
//
// ⚠️ **배터리와 걸음은 롬의 변수 그대로다** (`VAR_VS_SEEKER_BATTERY_LEVEL`·
// `_STEP_COUNT`). 새 세이브 칸을 안 만든다 — 스크립트가 같은 번호를 읽는다
import { npcActors, switchMovementType } from '../engine/actor/npcs'
import { mapById, world as mapWorld, NO_SCRIPT } from '../engine/map/world'
import { fieldScripts } from '../engine/script/field'
import {
  SCRIPT_ID_OFFSET_SINGLE_BATTLES, TRAINER_DEFEATED_FLAGS_START, trainerIdOf,
} from '../engine/script/commands'
import type { VarStore } from '../engine/script/vars'
import { DIR } from '../engine/script/movement'
import { EMOTE_FRAMES } from '../engine/actor/emote'
import { clearEmotes, showEmote } from './emotes'
import {
  pickRematchTrainers, viableTrainers, vsSeekerStep, vsSeekerUsable,
  VsSeekerResult, type SeekerTrainer,
} from '../engine/world/vsSeeker'
import {
  FLAG_VS_SEEKER_USED, MOVEMENT_TYPE_LOOK_AROUND, MOVEMENT_TYPE_VS_SEEKER_SPIN,
  VAR_VS_SEEKER_BATTERY, VAR_VS_SEEKER_STEPS,
} from '../engine/world/vsSeekerTable'
import { loadTrainers, type TrainerTable } from '../data/gameData'
import { music } from '../engine/audio/music'
import { SFX } from '../engine/audio/sfx'
import { useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'

/** `ITEM_VS_SEEKER` (`generated/items.txt`의 줄 번호 − 1) */
export const ITEM_VS_SEEKER = 443

/** `SCRIPT_ID(VS_SEEKER, 0)` — 「배터리가 모자라다」까지 다 이 스크립트 하나다 */
export const SCRIPT_VS_SEEKER = 8950

/**
 * 훑기가 끝날 때까지 스크립트를 세우는 시간 (초).
 *
 * ⚠️ **길이는 원작이 정한다.** 스크립트가 서 있는 것은 느낌표 동작이 다 돌고
 * (`WAIT_FOR_REMATCH_ANIMS`) 삑 소리가 끝날 때까지인데(`WAIT_FOR_VS_SEEKER_SFX`),
 * 소리 길이는 자료 안에 있어 밖에서 못 잰다 — 느낌표 37프레임에 소리 몫으로
 * 반 마디를 더 얹는다
 */
const SCAN_SECONDS = EMOTE_FRAMES / 60 + 0.5

let scanLeft = 0

/** 트레이너 표. 더블 판정에만 쓴다 — 없으면 짝을 못 찾고 혼자 선다 */
let trainers: TrainerTable | null = null
void loadTrainers().then((t) => { trainers = t }).catch(() => { trainers = null })

/** 맵을 옮겼다. 표시도 걸음도 통째로 버린다 (`SystemVars_ResetVsSeeker`) */
export function resetVsSeeker(): void {
  scanLeft = 0
  clearEmotes()
  const vars = fieldScripts.vars
  vars.clearFlag(FLAG_VS_SEEKER_USED)
  vars.set(VAR_VS_SEEKER_STEPS, 0)
}


/**
 * 지금 맵에 선 사람들을 훑기가 아는 모양으로.
 *
 * ⚠️ **트레이너 번호는 배치표의 스크립트 번호에서 나온다** (`Script_GetTrainerID`).
 * 배치표에 트레이너 번호 칸이 따로 없다 — 3000번대 스크립트가 곧 그 사람의 팀이다
 */
function seekerTrainers(): SeekerTrainer[] {
  return npcActors.list.map((a) => ({
    localID: a.localID,
    trainerID: a.info.script === NO_SCRIPT || a.info.script < SCRIPT_ID_OFFSET_SINGLE_BATTLES
      ? 0
      : trainerIdOf(a.info.script),
    trainerType: a.info.trainerType,
    movementType: a.movementType,
    x: Math.round(a.x),
    z: Math.round(a.z),
  }))
}

/**
 * 훑는다 (`VsSeeker_Start`의 상태 기계).
 *
 * ⚠️ **배터리는 아무도 안 응해도 나간다.** 원작이 `VS_SEEKER_STATE_START`에서
 * 0으로 지우고 **그 다음** 상태에서 사람을 고른다 — 헛걸음도 100걸음이다
 */
function scan(): number {
  const vars = fieldScripts.vars
  const p = worldState.player.position
  const px = Math.round(p.x), pz = Math.round(p.z)
  const all = seekerTrainers()
  // 트레이너가 아닌 사람은 애초에 안 든다 (`MapObject_GetTrainerType`가 0이다)
  const visible = viableTrainers(all.filter((t) => t.trainerID !== 0), px, pz)

  const usable = vsSeekerUsable(vars.get(VAR_VS_SEEKER_BATTERY), visible.length)
  if (usable !== VsSeekerResult.ok) return usable

  vars.set(VAR_VS_SEEKER_BATTERY, 0)
  void music.playEffect(SFX.VS_SEEKER)
  scanLeft = SCAN_SECONDS

  const picked = pickRematchTrainers({
    visible,
    all,
    defeated: (id) => vars.checkFlag(TRAINER_DEFEATED_FLAGS_START + id),
    isDouble,
    roll: () => Math.floor(Math.random() * 100),
  })
  for (const localID of picked.spin) switchMovementType(localID, MOVEMENT_TYPE_VS_SEEKER_SPIN)
  // ⚠️ **느낌표 둘이 뜬 사람은 남쪽을 본 채로 시작한다** —
  // `sVsSeekerAnimDoubleExclamationMark`가 `FACE_SOUTH`부터다. 회전은 거기서 돈다
  for (const m of picked.marks) {
    if (m.mark === 'double') {
      const actor = npcActors.byLocalID.get(m.localID)
      if (actor) actor.dir = DIR.south
    }
    showEmote(m.localID, m.mark === 'double' ? 'rematch' : 'exclaim')
  }
  // ⚠️ **「썼다」 깃발은 재대결이 하나라도 섰을 때만 선다.** 느낌표 하나(아직
  // 안 싸운 사람)로는 안 선다 — 그 표시는 100걸음 계수기를 안 쓴다
  if (picked.spin.length > 0) vars.setFlag(FLAG_VS_SEEKER_USED)
  save(vars)
  return picked.any ? VsSeekerResult.ok : VsSeekerResult.noneReady
}

/** 변수 상자를 리포트에 옮긴다 — 배터리·걸음이 거기 산다 */
function save(vars: VarStore): void {
  useSaveStore.setState({ vars: Uint16Array.from(vars.saved) })
}

/** 그 트레이너가 더블인가 (`Script_IsTrainerDoubleBattle`). 표가 없으면 아니다 */
function isDouble(id: number): boolean {
  const table = trainers
  if (table === null || id <= 0 || id >= table.all.length) return false
  return table.get(id).double
}

/**
 * 한 걸음 (`VsSeeker_UpdateStepCount`).
 *
 * ⚠️ **가방에 있을 때만 배터리가 찬다.** 없는 동안 걸은 걸음은 안 쌓인다 —
 * 원작이 `Bag_CanRemoveItem`을 먼저 본다
 */
export function vsSeekerFieldStep(): void {
  const vars = fieldScripts.vars
  const bag = useSaveStore.getState().bag
  const has = bag.some((pocket) => pocket.some((s) => s.item === ITEM_VS_SEEKER && s.count > 0))
  const got = vsSeekerStep(
    vars.get(VAR_VS_SEEKER_BATTERY), vars.get(VAR_VS_SEEKER_STEPS),
    vars.checkFlag(FLAG_VS_SEEKER_USED), has,
  )
  vars.set(VAR_VS_SEEKER_BATTERY, got.battery)
  vars.set(VAR_VS_SEEKER_STEPS, got.steps)
  if (got.expired) {
    vars.clearFlag(FLAG_VS_SEEKER_USED)
    clearRematchMarks()
  }
  save(vars)
}

/**
 * 느낌표를 끈다 (`VsSeeker_ClearRematchMoveCode`).
 *
 * ⚠️ **원래 유형으로 안 돌아간다.** 원작이 돌던 사람을 전부
 * `MOVEMENT_TYPE_LOOK_AROUND`로 갈아 끼운다 — 옆을 보던 사람도 두리번거리게
 * 된다. 배치표를 안 들고 있어서 되돌릴 자리가 없기 때문이다
 */
function clearRematchMarks(): void {
  for (const actor of npcActors.list) {
    if (actor.movementType === MOVEMENT_TYPE_VS_SEEKER_SPIN) {
      switchMovementType(actor.localID, MOVEMENT_TYPE_LOOK_AROUND)
    }
  }
}

/** 훑기 연출이 도는 동안 스크립트를 세워 둔다 */
export function vsSeekerFrame(dt: number): void {
  if (scanLeft > 0) scanLeft = Math.max(0, scanLeft - dt)
}

export const vsSeekerServices = {
  scan,
  busy: (): boolean => scanLeft > 0,
}

/** 지금 맵에서 이 도구를 쓸 수 있는가 (`CanUseVsSeeker` — `MapHeader_IsOnMainMatrix`) */
export function vsSeekerAllowedHere(): boolean {
  return (mapById(mapWorld.mapId)?.matrix ?? -1) === 0
}
