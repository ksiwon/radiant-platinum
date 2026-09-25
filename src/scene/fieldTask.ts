// 필드 태스크가 도는 중인가 — 시작 메뉴가 열리면 안 되는 때 (REPAIR §93)
//
// 원작은 필드 입력을 **태스크가 없을 때만** 받는다 (`field_system.c`의 `HandleFieldInput`):
//
//     if (!pause && runningFieldMap && FieldSystem_IsRunningTask(fieldSystem) == FALSE) processInput = TRUE;
//
// 시작 메뉴는 그 입력의 한 갈래다(`FieldInput_Process` → `StartMenu_Open`). 그리고 그 입력도 주인공이
// 걸음 한가운데가 아닐 때만 메뉴를 받는다(`PLAYER_MOVE_STATE_END`·`_NONE` — `overlay005/field_control.c` 127줄).
// 깨어진 세계의 승강 발판(`CallElevatorPlatformHandler`)·판 사이 뛰기(`JumpOnFloatingPlatform`)·
// 사건(`FieldTask_CallLoadedEventHandler` — 판 밀기·폭포·호수 셋·기라티나의 그림자)이 전부
// `FieldSystem_CreateTask`로 도는 필드 태스크라, 그동안은 메뉴도 리포트도 못 연다.
import { world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { cutInRunning } from './encounterCutIn'

/**
 * 지금 필드 태스크가 도는가.
 *
 * - `riding` — 깨어진 세계의 승강 발판·판 사이 뛰기·바위 떨어짐·사건·폭포, 체육관 장치
 *   (`MapStreamer`가 프레임마다 모은다)
 * - `flying` — 공중날기 연출 · `hop` — 턱·비전기술로 뛰는 걸음
 * - `world.pending` — 워프가 걸렸다(`FieldTask_ChangeMap*`)
 * - 조우 컷인 — `FieldTask_Encounter`의 첫 두 단
 */
export function fieldTaskRunning(): boolean {
  const p = worldState.player
  return p.riding || p.flying || p.hop.active || world.pending !== null || cutInRunning()
}
