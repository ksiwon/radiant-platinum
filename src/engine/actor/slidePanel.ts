// 밟으면 도는 판 (PARITY §1.30 · `ov5_021E1154.c`)
//
// 골풀무제철소 한 맵에만 깔린 바닥이다. 밟으면 그 판이 가리키는 쪽으로 한 칸씩
// 밀리는데 **몸이 90도씩 돈다** — 판이 회전 벨트라 사람이 실려 돌아간다.
// 멈추는 자리의 거동값이 다음 방향을 정하므로, 판을 이어 붙여 길을 만든다.
//
// ⚠️ **얼음과 다르다.** 얼음은 한 방향으로 잠겨 부딪힐 때까지 가고 조작이 안
// 먹는다. 이쪽은 **한 칸마다 방향을 다시 묻는다** — 판을 벗어나도 한 칸은 더
// 가고(그때 방향이 한 번 더 돈다), 그 앞이 막혀야 선다.
//
// ⚠️ **도는 것이 진행 방향이 아니라 몸이다.** 원작은 한 칸을 가는 동안 얼굴만
// 세 번 돌리고(`ov5_021E11E0`), 진행 방향은 `unk_00`에 따로 든다. 칸이 끝날 때
// 그 방향을 다시 정한다 — 판 위면 판이, 판 밖이면 한 번 더 돈 값이.
import { Behavior } from '../map/zone'
import { DIR, DIR_STEP } from '../script/movement'
import type { IceView } from './ice'

/**
 * 도는 판의 거동값 넷 (`TILE_BEHAVIOR_SLIDE_*`).
 *
 * ⚠️ **이름과 미는 쪽이 같다** — `SLIDE_EASTWARD`가 동쪽으로 민다. 원작이
 * `ov5_021E1154`에서 그대로 갈래를 짓는다
 */
export const SLIDE_BEHAVIOR = {
  east: Behavior.SLIDE_EAST,
  west: Behavior.SLIDE_WEST,
  north: Behavior.SLIDE_NORTH,
  south: Behavior.SLIDE_SOUTH,
} as const

/**
 * 그 방향의 칸 증분.
 *
 * ⚠️ **제 방향표를 따로 들지 않는다** — 배치표·시선·이동이 다 `script/movement`의
 * `DIR` 규약이고, 하나만 어긋나면 90도 옆으로 돈다 (§1.13)
 */
export function dirStep(dir: number): { dx: number, dz: number } {
  const s = DIR_STEP[dir] ?? DIR_STEP[DIR.north]!
  return { dx: s.x, dz: s.z }
}

/** 이 거동값이 미는 방향. 도는 판이 아니면 `null` */
export function slideDirOf(behavior: number): number | null {
  if (behavior === SLIDE_BEHAVIOR.east) return DIR.east
  if (behavior === SLIDE_BEHAVIOR.west) return DIR.west
  if (behavior === SLIDE_BEHAVIOR.north) return DIR.north
  if (behavior === SLIDE_BEHAVIOR.south) return DIR.south
  return null
}

/**
 * 90도 돌린 방향 (`ov5_021E11E0`).
 *
 * ⚠️ **표를 그대로 옮긴다.** 북→서→남→동→북이다. `(dir + 1) % 4` 같은
 * 산술로 바꾸면 `DIR` 번호 차례(북0·남1·서2·동3)가 방위 차례가 아니라서
 * 엉뚱하게 돈다 — 남 다음이 서가 아니라 동이 된다
 */
export function turned(dir: number): number {
  if (dir === DIR.north) return DIR.west
  if (dir === DIR.west) return DIR.south
  if (dir === DIR.south) return DIR.east
  if (dir === DIR.east) return DIR.north
  return DIR.north
}

/**
 * 한 칸을 가는 동안 몸이 도는 횟수.
 *
 * 원작은 7프레임을 세면서 **6·4·2에서** 돌린다 (`ov5_021E120C`의 `unk_04`).
 * 세 번이고, 칸이 끝날 때 방향을 다시 잡으면서 얼굴이 거기로 붙는다
 */
export const SPINS_PER_TILE = 3

/** 미끄러지는 동안의 상태. 한 번에 하나뿐이라 모듈에 둔다 */
export interface PanelSlide {
  active: boolean
  /** 진행 방향 (`DIR`) */
  dir: number
  /** 몸이 보는 쪽. 진행 방향과 따로 돈다 */
  facing: number
  /** 목표 칸 한가운데 */
  toX: number
  toZ: number
  /** 이 칸에서 이미 몇 번 돌았는가 */
  spun: number
}

export const panelSlide: PanelSlide = {
  active: false, dir: DIR.north, facing: DIR.north, toX: 0, toZ: 0, spun: 0,
}

export function clearPanelSlide(): void {
  panelSlide.active = false
  panelSlide.spun = 0
}

/**
 * 이 칸을 지나고 나서 어디로 가는가 (`ov5_021E120C`의 `unk_04 === 0` 갈래).
 *
 * 선 칸이 판이면 **판이 정한다**. 판이 아니면 한 번 더 돌아간 쪽이다 —
 * 그래서 판을 벗어나도 한 칸은 더 가고, 그 앞이 막혀야 선다
 */
export function nextDir(behavior: number, dir: number): number {
  return slideDirOf(behavior) ?? turned(dir)
}

/** 얼음과 같은 모양을 묻는다 — 격자를 두 벌로 두지 않는다 */
export type PanelView = IceView

/** 이 걸음을 판이 가져갔는가 */
export interface PanelStep {
  vx: number
  vz: number
  /** 몸이 보는 쪽 (라디안). 진행 방향과 다르다 */
  facing: number
}

/**
 * 한 프레임.
 *
 * `null`이면 판이 안 잡은 것이라 평소 이동으로 내려간다. 값이 오면 **입력을
 * 무시하고** 그 속도로 간다
 */
export function panelStep(view: PanelView, pos: { x: number, z: number },
  speed: number): PanelStep | null {
  const tx = Math.floor(pos.x)
  const tz = Math.floor(pos.z)
  const here = view.behaviorAt(tx, tz)

  if (!panelSlide.active) {
    const dir = slideDirOf(here)
    // ⚠️ **밟는 순간 잡는다** — 얼음과 달리 걸음을 내디딜 필요가 없다.
    // 원작이 칸에 들어서면 도는 `sTileBehaviorCheckTable`에서 부른다
    if (dir === null) return null
    panelSlide.active = true
    panelSlide.dir = dir
    panelSlide.facing = dir
    panelSlide.spun = 0
    aim(view, tx, tz)
  }

  if (reached(pos)) {
    // 칸 하나가 끝났다. 다음 방향을 정하고, 그쪽이 막혔으면 여기서 선다
    const dir = nextDir(here, panelSlide.dir)
    const { dx, dz } = dirStep(dir)
    if (view.blockedAt(tx + dx, tz + dz)) {
      panelSlide.facing = dir
      clearPanelSlide()
      return { vx: 0, vz: 0, facing: facingRad(dir) }
    }
    panelSlide.dir = dir
    panelSlide.facing = dir
    panelSlide.spun = 0
    aim(view, tx, tz)
  }

  // 한 칸을 가는 동안 몸이 세 번 돈다. 얼마나 왔는지로 나눈다
  const done = progress(pos)
  const want = Math.min(SPINS_PER_TILE, Math.floor(done * (SPINS_PER_TILE + 1)))
  while (panelSlide.spun < want) {
    panelSlide.facing = turned(panelSlide.facing)
    panelSlide.spun += 1
  }

  const { dx, dz } = dirStep(panelSlide.dir)
  const left = Math.max(0, (panelSlide.toX - pos.x) * dx + (panelSlide.toZ - pos.z) * dz)
  const v = Math.min(speed, left * 60)
  return { vx: dx * v, vz: dz * v, facing: facingRad(panelSlide.facing) }
}

/** 다음 칸 한가운데를 목표로 잡는다 */
function aim(view: PanelView, tx: number, tz: number): void {
  const { dx, dz } = dirStep(panelSlide.dir)
  // 막힌 쪽으로는 안 잡는다 — 잡으면 벽에 붙어 영영 `reached`가 안 된다
  const can = !view.blockedAt(tx + dx, tz + dz)
  panelSlide.toX = tx + (can ? dx : 0) + 0.5
  panelSlide.toZ = tz + (can ? dz : 0) + 0.5
}

/** 목표 칸 한가운데를 지났는가. 진행 축만 본다 */
function reached(pos: { x: number, z: number }): boolean {
  const { dx, dz } = dirStep(panelSlide.dir)
  return (panelSlide.toX - pos.x) * dx + (panelSlide.toZ - pos.z) * dz <= 0
}

/** 이 칸을 얼마나 왔는가 (0~1) */
function progress(pos: { x: number, z: number }): number {
  const { dx, dz } = dirStep(panelSlide.dir)
  const left = (panelSlide.toX - pos.x) * dx + (panelSlide.toZ - pos.z) * dz
  return Math.min(1, Math.max(0, 1 - left))
}

/** `DIR`을 우리 각으로. 걷기와 같은 규약이다 (남쪽이 0) */
export function facingRad(dir: number): number {
  const { dx, dz } = dirStep(dir)
  return Math.atan2(dx, dz)
}

/** 판이 잡고 있는가 */
export function isPanelSliding(): boolean {
  return panelSlide.active
}

/** 거동값이 도는 판인가. 거동표를 두 벌로 두지 않으려고 여기서만 판정한다 */
export function isSlidePanel(behavior: number): boolean {
  return slideDirOf(behavior) !== null
}
