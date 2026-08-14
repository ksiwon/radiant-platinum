// 감금장치 셋을 그린다 (PARITY §1.25)
//
// 규칙과 박자는 `engine/world/lakeGuardianUnits`가 들고 있고 여기는 **지금
// 자리와 꼴**을 맡는다.
//
// ⚠️ **여는 그림이 우리 것이다.** 원작은 소품에 딸린 nsbca 두 벌을 얹는데
// 우리 파이프라인은 정지 메시만 굽는다. 통을 통째로 **위로 들어 올리는 것**으로
// 대신한다 — 값 둘이 아래 `OPEN_LIFT`에 있고 그것이 우리 것이라는 표시다.
import { propPlacements } from '../engine/map/propPlacement'
import { world as mapWorld } from '../engine/map/world'
import {
  initialUnitState, LAKE_GUARDIAN_MAP, LAKE_GUARDIAN_MODEL, openFinished, openProgress,
  UNIT_STATE, type UnitState,
} from '../engine/world/lakeGuardianUnits'
import type { FeatureProp } from './movingProps'

/** 다 열렸을 때 통이 올라간 높이(타일)와 그때까지의 흔들림. **우리 값이다** */
const OPEN_LIFT = { height: 1.35, shudder: 0.05 } as const

interface Active {
  state: UnitState
  /** 열리기 시작한 시각. 안 열고 있으면 null */
  since: number | null
}

let active: Active | null = null

/** 소리를 내는 자리. 씬이 꽂아 준다 */
export const lakeGuardianSound: { play: ((seq: number) => void) | null } = { play: null }

/** 통이 열릴 때 나는 소리 — 문이 열리는 것과 같은 것을 쓴다 (`SEQ_SE_DP_DOOR_OPEN`) */
const SEQ_DOOR_OPEN = 1541

/**
 * 맵에 들어설 때 세운다 (`InitLakeGuardianContainmentUnits`).
 *
 * `freed`는 `FLAG_FREED_GALACTIC_HQ`다 — 이미 풀어 줬으면 열린 채로 선다
 */
export function initLakeGuardianUnits(freed: boolean): void {
  active = { state: initialUnitState(freed), since: null }
}

/**
 * 푼다 (`DeactivateLakeGuardianContainmentUnits`).
 *
 * 이미 열려 있거나 열리는 중이면 아무것도 안 한다 — 스크립트가 두 번 부를 수
 * 있고, 그때 처음부터 다시 열리면 화면이 튄다
 */
export function deactivateLakeGuardianUnits(now: number): void {
  if (active === null || active.state !== UNIT_STATE.held) return
  active = { state: UNIT_STATE.opening, since: now }
  lakeGuardianSound.play?.(SEQ_DOOR_OPEN)
}

/** 다 열렸는가. 스크립트의 기다림이 이걸 본다 */
export function lakeGuardianUnitsSettled(now: number): boolean {
  if (active === null) return true
  if (active.state === UNIT_STATE.freed) return true
  if (active.state !== UNIT_STATE.opening || active.since === null) return false
  if (!openFinished((now - active.since) / 1000)) return false
  active = { state: UNIT_STATE.freed, since: null }
  return true
}

/** 맵을 나가면 지운다 — 다음에 들어설 때 다시 세운다 */
export function resetLakeGuardianUnits(): void { active = null }

/** 지금 세워야 할 통들. 그 맵이 아니면 빈 목록 */
export function lakeGuardianProps(): FeatureProp[] {
  if (mapWorld.mapId !== LAKE_GUARDIAN_MAP) return []
  const grid = mapWorld.grid
  if (grid === null) return []
  const placed = propPlacements(grid.meta, LAKE_GUARDIAN_MAP, LAKE_GUARDIAN_MODEL)
  if (placed.length === 0) return []

  const lift = liftOf()
  return placed.map((p, i) => ({
    key: `감금장치${String(i)}`,
    model: LAKE_GUARDIAN_MODEL,
    x: p.x,
    y: p.y + lift.y,
    z: p.z,
    rotZ: lift.tilt,
  }))
}

/** 지금 얼마나 들려 있는가 */
function liftOf(): { y: number, tilt: number } {
  if (active === null || active.state === UNIT_STATE.held) return { y: 0, tilt: 0 }
  if (active.state === UNIT_STATE.freed) return { y: OPEN_LIFT.height, tilt: 0 }
  if (active.since === null) return { y: 0, tilt: 0 }

  // `settle` 동안은 t가 0이라 통이 가만히 있는다 — 원작이 0번 애니가 끝나기를
  // 기다리는 그 마디다
  const t = openProgress((performance.now() - active.since) / 1000)
  const eased = t * t * (3 - 2 * t)
  const shudder = t === 0 || t === 1
    ? 0
    : Math.sin(t * Math.PI * 6) * OPEN_LIFT.shudder * (1 - t)
  return { y: OPEN_LIFT.height * eased, tilt: shudder }
}
