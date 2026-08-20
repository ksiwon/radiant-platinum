// 물가시티 체육관의 톱니를 실제로 돌린다 (PARITY §7.12)
//
// 규칙과 표는 `engine/world/sunyshoreGym`이 들고 있고 여기는 **프레임**을
// 맡는다. 원작의 필드 태스크가 프레임마다 5.625도씩 돌리다가 목표에 닿으면
// 끝난다 — 90도가 열여섯 프레임이다.
//
// ⚠️ **회전 상태는 단추를 누르는 순간 바뀐다.** 톱니가 다 돌기를 기다리지
// 않는다(`SunyshoreGym_PressButton`이 태스크를 걸기 **전에** 적는다) — 그래서
// 도는 도중에도 통행 판정은 이미 새 상태다
import {
  SUNYSHORE_BUTTON, SUNYSHORE_GEARS, SUNYSHORE_PROP_OFFSET, SUNYSHORE_SFX, SUNYSHORE_STEP,
  sunyshoreBlocked, sunyshoreGearAngle, sunyshoreNextState, sunyshoreRoomOf,
  sunyshoreStateOnEnter, sunyshoreTurnAngle, type SunyshoreButton,
} from '../engine/world/sunyshoreGym'
import { MAP_FEATURE, setMapFeature } from '../engine/world/mapFeatures'
import type { FeatureProp } from './movingProps'

interface Active {
  room: number
  state: number
  /** 지금 톱니가 향한 각(라디안). 상태에서 나온 값에 도는 중의 몫을 더한 것이다 */
  angle: number[]
}

interface Turning {
  /** 아직 돌아야 하는 각(라디안) */
  left: number
  button: SunyshoreButton
}

let active: Active | null = null
let turning: Turning | null = null

/** 소리를 내는 자리. 씬이 꽂아 준다 */
export const sunyshoreSound: {
  play: ((seq: number) => void) | null
  stop: ((seq: number) => void) | null
} = { play: null, stop: null }

/**
 * 맵에 들어설 때
 * (`PersistedMapFeatures_InitForSunyshoreGym` + `SunyshoreGym_DynamicMapFeaturesInit`).
 *
 * ⚠️ **처음 회전 상태가 방마다 다르다.** 앞 방에서 걸어 들어오면 0이고,
 * 뒤에서 돌아오면 2·1·0으로 선다 — 되돌아 나가는 길이 그때 열려 있어야 한다
 */
export function initSunyshoreGym(map: number, enterZ: number): boolean {
  const room = sunyshoreRoomOf(map)
  if (room === null) return false
  setMapFeature(MAP_FEATURE.sunyshoreGym)
  const state = sunyshoreStateOnEnter(room, enterZ)
  active = {
    room, state,
    angle: (SUNYSHORE_GEARS[room] ?? []).map((g) => sunyshoreGearAngle(g, state)),
  }
  turning = null
  return true
}

/** 지금 회전 상태. 이 체육관이 아니면 null */
export function sunyshoreState(): number | null {
  return active?.state ?? null
}

/**
 * 단추를 눌렀다 (`SunyshoreGym_PressButton`).
 *
 * @returns 늘 true — 두 배 단추로 두 번 돌아 제자리에 와도 톱니는 돈다
 */
export function pressSunyshoreButton(button: SunyshoreButton): boolean {
  if (active === null || turning !== null) return false
  active.state = sunyshoreNextState(active.state, button)
  turning = { left: sunyshoreTurnAngle(button), button }
  sunyshoreSound.play?.(SUNYSHORE_SFX)
  return true
}

/** 도는 동안은 스크립트가 기다린다 */
export function sunyshoreBusy(): boolean {
  return turning !== null
}

/** 그 칸이 톱니에 막혔는가. `null`이면 평소 판정으로 내려간다 */
export function sunyshoreBlockedAt(tileX: number, tileZ: number): boolean | null {
  if (active === null) return null
  return sunyshoreBlocked(active.room, active.state, tileX, tileZ)
}

/** 톱니들이 지금 그리는 자리와 각 */
export function sunyshoreProps(): FeatureProp[] {
  const now = active
  if (now === null) return []
  const gears = SUNYSHORE_GEARS[now.room] ?? []
  return gears.map((g, i) => ({
    key: `톱니${String(i)}`,
    model: g.model,
    x: g.x + SUNYSHORE_PROP_OFFSET,
    y: g.y + (g.vertical ? SUNYSHORE_PROP_OFFSET : 0),
    z: g.z + SUNYSHORE_PROP_OFFSET,
    // 벽에 붙은 톱니는 x축으로, 바닥의 톱니는 y축으로 돈다
    rotX: g.vertical ? now.angle[i] ?? 0 : 0,
    rotY: g.vertical ? 0 : now.angle[i] ?? 0,
  }))
}

/** 한 프레임 (`FieldTask_SunyshoreGym_RotateGears`) */
export function sunyshoreTick(dt: number): void {
  if (active === null || turning === null) return
  const gears = SUNYSHORE_GEARS[active.room] ?? []
  const step = Math.min(turning.left, SUNYSHORE_STEP * dt * 60)
  // 거꾸로 단추는 반대로 간다. 톱니마다의 방향은 그 위에 또 곱한다
  const signed = turning.button === SUNYSHORE_BUTTON.reverse ? -step : step
  for (let i = 0; i < gears.length; i++) {
    active.angle[i] = (active.angle[i] ?? 0) + (gears[i]?.cw === true ? -signed : signed)
  }
  turning.left -= step
  if (turning.left > 0) return

  // 다 돌았으면 상태에서 나오는 각으로 맞춘다 — 프레임 누적 오차를 안 남긴다
  active.angle = gears.map((g) => sunyshoreGearAngle(g, active?.state ?? 0))
  sunyshoreSound.stop?.(SUNYSHORE_SFX)
  turning = null
}

/** 맵을 옮기면 없어진다 */
export function resetSunyshoreGym(): void {
  active = null
  turning = null
}
