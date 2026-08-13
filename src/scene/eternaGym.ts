// 영원시티 체육관의 꽃시계를 돌린다 (PARITY §7.12)
//
// 규칙과 표는 `engine/world/eternaGym`이 들고 있고 여기는 **상태와 프레임**을
// 맡는다.
//
// ⚠️ **상태가 리포트에 남는다.** 다른 체육관 장치는 맵을 나가면 처음으로
// 돌아가는데(버퍼를 0으로 지운다) 이것만 `VAR_ETERNA_GYM_FLOWER_CLOCK_STATE`에
// 따로 적힌다 — 트레이너를 이긴 것을 되돌릴 수는 없기 때문이다.
//
// ⚠️ **바늘이 도는 것은 연출이다.** 통행 판정은 상태가 바뀌는 **즉시** 새
// 표로 간다 (`EternaGym_AdvanceClockState`가 태스크를 걸기 전에 상태를 올린다)
import {
  ETERNA_CLOCK, ETERNA_CLOCK_SFX, ETERNA_CLOCK_TIMES, ETERNA_GYM_MAP, ETERNA_HAND_MODEL,
  ETERNA_HAND_Y, ETERNA_CLOCK_CENTER_X, ETERNA_CLOCK_CENTER_Z,
  eternaBlocked, eternaHandAngles, eternaJumpsHourHand, eternaNextState,
} from '../engine/world/eternaGym'
import { MAP_FEATURE, setMapFeature } from '../engine/world/mapFeatures'
import { ledgeBridge } from '../engine/actor/ledge'
import type { FeatureProp } from './movingProps'

/**
 * 바늘이 한 상태만큼 도는 데 걸리는 시간(초).
 *
 * ⚠️ **우리가 고른 값이다.** 원작은 시각을 프레임마다 한 눈금씩 올리면서
 * 카메라를 시계 한가운데로 옮겼다 되돌리는 긴 연출인데, 그 카메라 장치가
 * 우리에게 없다. 규칙(어느 칸이 막히는가)은 상태가 바뀌는 즉시 원작과 같고
 * 여기서 정하는 것은 **바늘이 미끄러지는 시간**뿐이다
 */
const SWEEP_TIME = 1.2

interface Active {
  state: number
  /** 지금 바늘이 향한 각. 도는 동안 목표 각으로 미끄러진다 */
  angle: { hour: number; minute: number }
}

let active: Active | null = null
let sweep: { t: number; from: { hour: number; minute: number } } | null = null

/** 소리를 내는 자리. 씬이 꽂아 준다 */
export const eternaSound: { play: ((seq: number) => void) | null } = { play: null }

/** 맵에 들어설 때 (`EternaGym_DynamicMapFeaturesInit`) */
export function initEternaGym(map: number, state: number): boolean {
  if (map !== ETERNA_GYM_MAP) return false
  setMapFeature(MAP_FEATURE.eternaGym)
  const now = Math.min(Math.max(state, 0), ETERNA_CLOCK.gymLeader)
  active = { state: now, angle: anglesFor(now) }
  sweep = null
  return true
}

function anglesFor(state: number): { hour: number; minute: number } {
  const time = ETERNA_CLOCK_TIMES[state] ?? ETERNA_CLOCK_TIMES[0]!
  return eternaHandAngles(time.hour, time.minute)
}

/** 지금 시계 상태. 이 체육관이 아니면 null */
export function eternaState(): number | null {
  return active?.state ?? null
}

/**
 * 시계를 한 칸 넘긴다 (`EternaGym_AdvanceClockState`).
 *
 * @returns 넘겼으면 새 상태, 이미 끝까지 갔으면 `null`
 */
export function advanceEternaClock(): number | null {
  if (active === null || sweep !== null) return null
  const next = eternaNextState(active.state)
  if (next === null) return null
  sweep = { t: 0, from: active.angle }
  active.state = next
  eternaSound.play?.(ETERNA_CLOCK_SFX)
  return next
}

/** 바늘이 도는 동안은 스크립트가 기다린다 */
export function eternaBusy(): boolean {
  return sweep !== null
}

/** 그 칸이 지금 막혔는가. `null`이면 평소 판정으로 내려간다 */
export function eternaBlockedAt(tileX: number, tileZ: number): boolean | null {
  if (active === null) return null
  return eternaBlocked(active.state, tileX, tileZ)
}

/** 그 칸에서 그 쪽으로 시침을 뛰어넘는가 */
export function eternaJumpAt(tileX: number, tileZ: number, dir: number): boolean {
  if (active === null) return false
  return eternaJumpsHourHand(active.state, tileX, tileZ, dir)
}

/** 바늘 둘이 지금 그리는 자리와 각 */
export function eternaProps(): FeatureProp[] {
  const now = active
  if (now === null) return []
  return [
    {
      key: '시침', model: ETERNA_HAND_MODEL.hour,
      x: ETERNA_CLOCK_CENTER_X + 0.5, y: ETERNA_HAND_Y.hour, z: ETERNA_CLOCK_CENTER_Z + 0.5,
      rotY: now.angle.hour,
    },
    {
      key: '분침', model: ETERNA_HAND_MODEL.minute,
      x: ETERNA_CLOCK_CENTER_X + 0.5, y: ETERNA_HAND_Y.minute, z: ETERNA_CLOCK_CENTER_Z + 0.5,
      rotY: now.angle.minute,
    },
  ]
}

/** 한 프레임. 바늘을 목표 각으로 미끄러뜨린다 */
export function eternaTick(dt: number): void {
  if (active === null || sweep === null) return
  sweep.t = Math.min(SWEEP_TIME, sweep.t + dt)
  const k = sweep.t / SWEEP_TIME
  const to = anglesFor(active.state)
  active.angle = {
    hour: shortestLerp(sweep.from.hour, to.hour, k),
    minute: shortestLerp(sweep.from.minute, to.minute, k),
  }
  if (sweep.t < SWEEP_TIME) return
  active.angle = to
  sweep = null
}

/** 짧은 쪽으로 돈다. 한 바퀴를 넘겨 돌면 바늘이 거꾸로 도는 것으로 보인다 */
function shortestLerp(from: number, to: number, k: number): number {
  const full = Math.PI * 2
  let delta = (to - from) % full
  if (delta > Math.PI) delta -= full
  if (delta < -Math.PI) delta += full
  return from + delta * k
}

/** 맵을 옮기면 없어진다 */
export function resetEternaGym(): void {
  active = null
  sweep = null
}

// 시침을 뛰어넘는 자리는 거동값이 아니라 시계 상태가 정한다 — 걸음 판정이
// 그 답을 여기서 얻는다 (`PlayerAvatar_WillJump`의 첫 줄)
ledgeBridge.jumpsClockHand = (tileX, tileZ, dir) => eternaJumpAt(tileX, tileZ, dir)
