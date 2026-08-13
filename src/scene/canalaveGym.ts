// 운하시티 체육관의 판을 실제로 움직인다 (PARITY §7.12)
//
// 규칙과 표는 `engine/world/canalaveGym`이 들고 있고 여기는 **판 스물넷의
// 지금 자리**와 **프레임**을 맡는다.
//
// 원작의 필드 태스크 셋(위아래·동서·남북)을 여기 하나로 접었다. 갈래마다
// 다른 것은 둘뿐이다:
//
//   위아래  판이 사람을 **들고 간다**. 한 프레임에 반 칸
//   옆으로  사람이 **걸어간다**. 판은 그 자리를 따라올 뿐이다
//     (`platformPos.x = playerPos.x` — 원작이 주인공에게 빠른 걸음을 걸고
//      판을 따라붙인다. 결과가 같아 우리는 둘을 함께 옮긴다)
//
// ⚠️ **자리가 둘이다.** 「어느 칸에 있는가」(`platformPositions`)는 밟는
// 순간 목적지로 **뛰고**, 그리는 자리만 미끄러진다 — 원작이 그렇다. 하나로
// 합치면 다 도착하기 전에는 그 판을 못 찾는다.
//
// ⚠️ **층이 바뀌는 때가 오르내림에 따라 다르다.** 내려갈 때는 **출발할 때**
// 아래층 것이 되고, 올라갈 때는 **닿은 뒤**에 위층 것이 된다. 그래야 내려가는
// 동안 그 판이 안 사라진다 (`UpdateVisibleProps`가 층으로 감춘다)
//
// ⚠️ **밟는 것으로 움직인다.** 단추도 좌표 트리거도 아니고, 한 걸음 옮길
// 때마다 「지금 선 칸에 판이 있는가」를 묻는다 (`Field_ProcessStep`의 첫 줄)
import {
  CANALAVE_FLOOR_MODELS, CANALAVE_FLOOR_POS, CANALAVE_FLOOR_HEIGHT, CANALAVE_GYM_MAP,
  CANALAVE_LIFT_STEP, CANALAVE_PLATFORMS, CANALAVE_PROP_OFFSET, CANALAVE_SFX,
  CANALAVE_SLIDE_SPEED, canalaveBlocked, canalaveInB, canalaveInitialStates,
  canalavePlatformAt, canalaveToggle,
} from '../engine/world/canalaveGym'
import { MAP_FEATURE, setMapFeature } from '../engine/world/mapFeatures'
import { worldState } from '../state/worldState'
import type { FeatureProp } from './movingProps'

interface Active {
  /** 판마다 자리 B에 있는가 (`platformStates`의 비트) */
  states: number
  /** 판마다 **어느 칸에 있는가**. 밟는 순간 목적지로 뛴다 */
  tile: [number, number, number][]
  /** 판마다 **그리는 자리**. 이쪽이 미끄러진다 */
  draw: [number, number, number][]
  /** 판마다 지금 어느 층의 것인가 */
  floor: number[]
}

interface Moving {
  index: number
  axis: 'y' | 'x' | 'z'
  /** 목표 자리(칸) */
  target: number
  up: boolean
  /** 다 갔고 뒤처리만 남았는가 */
  landed: boolean
}

let active: Active | null = null
let moving: Moving | null = null

/** 소리를 내는 자리. 씬이 꽂아 준다 */
export const canalaveSound: {
  play: ((seq: number) => void) | null
  stop: ((seq: number) => void) | null
} = { play: null, stop: null }

/** 다 탄 뒤에 「그 칸은 방금 밟았다」로 치는 자리. 씬이 꽂아 준다 */
export const canalaveArrived: { settle: (() => void) | null } = { settle: null }

/** 축 이름 → 좌표 번호 */
const AXIS_AT = { x: 0, y: 1, z: 2 } as const

/** 맵에 들어설 때 (`CanalaveGym_DynamicMapFeaturesInit`) */
export function initCanalaveGym(map: number): boolean {
  if (map !== CANALAVE_GYM_MAP) return false
  setMapFeature(MAP_FEATURE.canalaveGym)
  const states = canalaveInitialStates()
  const spots = CANALAVE_PLATFORMS.map((p, i) => canalavePlatformAt(p, canalaveInB(states, i)))
  active = {
    states,
    tile: spots.map((s) => [...s.pos]),
    draw: spots.map((s) => [...s.pos]),
    floor: spots.map((s) => s.floor),
  }
  moving = null
  return true
}

/** 판이 움직이는 동안은 조작이 멈춘다 */
export function canalaveBusy(): boolean {
  return moving !== null
}

/**
 * 그 칸이 막혔는가.
 *
 * ⚠️ **이 방은 「모른다」가 없다.** 원작이 늘 참을 내고 격자를 아예 안 본다 —
 * 바닥이 없는 방이라 층마다의 표가 곧 지형이다
 */
export function canalaveBlockedAt(tileX: number, tileZ: number, height: number): boolean | null {
  if (active === null) return null
  return canalaveBlocked(height, tileX, tileZ)
}

/**
 * 한 걸음 옮겼다 — 지금 선 칸에 판이 있으면 태운다
 * (`CanalaveGym_CheckIfPlayerOnPlatform`).
 *
 * ⚠️ **세 축이 다 맞아야 한다.** 층이 겹쳐 있어서 x·z만 보면 위층의 판을
 * 밟은 것으로 읽힌다
 *
 * @returns 태웠으면 true
 */
export function canalaveStepped(): boolean {
  if (active === null || moving !== null) return false
  const p = worldState.player.position
  const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z)
  const index = active.tile.findIndex(([x, y, z]) => x === px && y === py && z === pz)
  if (index < 0) return false

  const path = CANALAVE_PLATFORMS[index]!
  const toB = !canalaveInB(active.states, index)
  active.states = canalaveToggle(active.states, index)
  const dest = canalavePlatformAt(path, toB)
  const axis: 'y' | 'x' | 'z' = path.axis === 'x' ? 'x' : path.axis === 'z' ? 'z' : 'y'
  const at = AXIS_AT[axis]

  // 「어느 칸에 있는가」는 여기서 곧바로 목적지로 뛴다
  const up = dest.pos[at]! > active.tile[index]![at]!
  active.tile[index] = [...dest.pos]
  // 내려가는 판은 **지금** 아래층 것이 된다. 올라가는 판은 닿은 뒤다
  if (axis === 'y' && !up) active.floor[index] = dest.floor

  moving = { index, axis, target: dest.pos[at]!, up, landed: false }
  canalaveSound.play?.(CANALAVE_SFX.move)
  return true
}

/**
 * 판들과 층 바닥이 지금 그리는 자리.
 *
 * ⚠️ **딛는 높이보다 위의 층은 안 그린다** (`CanalaveGym_UpdateVisibleProps`) —
 * 안 그러면 아래층에서 위층 바닥이 천장처럼 덮여 앞이 안 보이고, 어느 판을
 * 밟을 수 있는지도 구별이 안 된다
 */
export function canalaveProps(): FeatureProp[] {
  const now = active
  if (now === null) return []
  const eye = worldState.player.position.y
  const out: FeatureProp[] = []
  for (const [i, model] of CANALAVE_FLOOR_MODELS.entries()) {
    // 원작의 문턱 그대로다 — 2층 바닥은 y ≥ 1칸, 3층은 ≥ 11칸, 4층은 ≥ 21칸
    if (eye < CANALAVE_FLOOR_HEIGHT * i + 1) continue
    out.push({
      key: `${String(i + 2)}층바닥`, model,
      x: CANALAVE_FLOOR_POS.x, y: CANALAVE_FLOOR_HEIGHT * (i + 1), z: CANALAVE_FLOOR_POS.z,
    })
  }
  for (const [i, path] of CANALAVE_PLATFORMS.entries()) {
    const floor = now.floor[i]!
    if (floor > 0 && eye < CANALAVE_FLOOR_HEIGHT * (floor - 1) + 1) continue
    const [x, y, z] = now.draw[i]!
    out.push({
      key: `판${String(i)}`, model: path.model,
      x: x + CANALAVE_PROP_OFFSET, y, z: z + CANALAVE_PROP_OFFSET,
    })
  }
  return out
}

/** 한 프레임 (`FieldTask_CanalaveGym_MovePlatform*`) */
export function canalaveTick(dt: number): void {
  if (active === null || moving === null) return
  if (moving.landed) {
    // 올라간 판은 여기서야 위층 것이 된다
    const path = CANALAVE_PLATFORMS[moving.index]!
    if (moving.axis === 'y' && moving.up) active.floor[moving.index] = path.floorB
    canalaveSound.play?.(CANALAVE_SFX.arrive)
    moving = null
    // 닿은 칸은 「방금 밟았다」로 친다 — 안 그러면 그 자리에서 다시 탄다
    canalaveArrived.settle?.()
    return
  }

  const at = AXIS_AT[moving.axis]
  const step = moving.axis === 'y'
    ? CANALAVE_LIFT_STEP * dt * 60
    : CANALAVE_SLIDE_SPEED * dt
  const from = active.draw[moving.index]![at]!
  const next = moving.up ? from + step : from - step
  const done = moving.up ? next >= moving.target : next <= moving.target
  const value = done ? moving.target : next
  active.draw[moving.index]![at] = value

  // 사람은 판 위에 붙어 간다
  const p = worldState.player.position
  if (moving.axis === 'y') { p.y = value; worldState.player.prevPosition.y = value }
  else if (moving.axis === 'x') {
    p.x = value + CANALAVE_PROP_OFFSET
    worldState.player.prevPosition.x = p.x
  } else {
    p.z = value + CANALAVE_PROP_OFFSET
    worldState.player.prevPosition.z = p.z
  }

  if (!done) return
  canalaveSound.stop?.(CANALAVE_SFX.move)
  moving.landed = true
}

/** 맵을 옮기면 없어진다 */
export function resetCanalaveGym(): void {
  active = null
  moving = null
}

/** 판이 지금 어느 칸에 있는가 — 시험이 쓴다 */
export function canalavePlatformTile(index: number): readonly number[] | null {
  return active?.tile[index] ?? null
}

/** 판이 지금 그리는 자리 — 시험이 쓴다 */
export function canalavePlatformDraw(index: number): readonly number[] | null {
  return active?.draw[index] ?? null
}

/** 판이 지금 어느 층의 것인가 — 시험이 쓴다 */
export function canalavePlatformFloor(index: number): number | null {
  return active?.floor[index] ?? null
}
