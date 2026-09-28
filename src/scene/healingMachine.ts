// 회복기 위의 볼과 화면 (PARITY §8.11 · 박자는 `engine/world/healingMachine`)
//
// 원작은 회복기 소품을 찾아(`FieldSystem_FindLoadedMapPropByModelID`) 그 자리에 미니 몬스터볼 소품을
// **새로 싣고**(`MapPropManager_LoadOne`), 다 놓이면 볼과 화면의 BTP0 클립을 한 번 돌린 뒤 볼을 치운다.
// 우리는 볼을 `HealingBalls`가 세우고, 화면은 청크가 이미 세운 소품을 `AnimatedProp`이 이 모듈에 물어 돌린다.
//
// 한 틱에 한 프레임이다 (`FRAME_MS`) — 스크립트가 기다리는 쪽도 같은 시계를 본다
import { FRAME_MS, loadPropAnimSet, type PropAnimSet } from './propAnim'
import { world as mapWorld } from '../engine/map/world'
import { propPlacement } from '../engine/map/propPlacement'
import {
  HALL_OF_FAME_MACHINE_MODEL, HEALING_BALL_MODEL, HEALING_MACHINE_MODEL, HEALING_SCREEN_MODEL,
  healBallCount, healBallOffset, healBallsPlaced, type HealingKind,
} from '../engine/world/healingMachine'

interface HealPlay {
  kind: HealingKind
  count: number
  /** 회복기 소품의 자리(칸) */
  at: { x: number, y: number, z: number }
  since: number
  /** 클립을 튼 시각. 아직이면 null */
  final: number | null
}

let play: HealPlay | null = null
let set: PropAnimSet | null = null

/**
 * 튼다. 지금 맵에 회복기가 없으면 false — 원작은 거기서 멎는다(`GF_ASSERT`). 부르는 쪽이 볼 없이 넘긴다
 */
export function startHealing(kind: HealingKind, count: number): boolean {
  const grid = mapWorld.grid
  if (grid === null) return false
  const model = kind === 'center' ? HEALING_MACHINE_MODEL : HALL_OF_FAME_MACHINE_MODEL
  const at = propPlacement(grid.meta, mapWorld.mapId, model)
  if (at === null) return false
  void loadPropAnimSet().then((s) => { set = s }).catch(() => { /* 볼만 안 깜빡인다 */ })
  play = { kind, count: healBallCount(count), at, since: performance.now(), final: null }
  return true
}

/** 시작한 뒤 몇 틱째인가. 안 돌면 null */
export function healingTick(): number | null {
  return play === null ? null : Math.floor((performance.now() - play.since) / FRAME_MS)
}

/** 볼과 화면의 클립을 튼다 (`PLAY_FINAL_ANIMATION`) */
export function playHealingFinal(): void {
  if (play !== null) play.final = performance.now()
}

/** 클립 한 바퀴 — 표를 못 받았으면 null */
function framesOf(model: number): number | null {
  const id = set?.table.props[String(model)]?.[0]
  return id === undefined ? null : set?.clip(id)?.frames ?? null
}

/** 이 연출에서 도는 클립의 소품들. 명예의 전당은 볼뿐이다 */
function clipModels(kind: HealingKind): number[] {
  return kind === 'center' ? [HEALING_BALL_MODEL, HEALING_SCREEN_MODEL] : [HEALING_BALL_MODEL]
}

/**
 * 클립이 다 돌았는가 (`IsAnimationLoopFinished`). 아직 안 틀었으면 false, 표를 못 받았으면 **길이를 모르므로** null
 */
export function healingFinalDone(): boolean | null {
  if (play === null) return true
  if (play.final === null) return false
  let longest = 0
  for (const model of clipModels(play.kind)) {
    const frames = framesOf(model)
    if (frames === null) return null
    longest = Math.max(longest, frames)
  }
  return (performance.now() - play.final) / FRAME_MS >= longest - 1
}

/** 끝났다 — 볼을 치우고 클립을 내린다 */
export function stopHealing(): void {
  play = null
}

/** 지금 회복기 위에 놓인 볼들의 자리(칸) */
export function healBalls(): { key: string, x: number, y: number, z: number }[] {
  const tick = healingTick()
  if (play === null || tick === null) return []
  const out = []
  const placed = healBallsPlaced(play.count, tick)
  for (let i = 0; i < placed; i++) {
    const [dx, dy, dz] = healBallOffset(i)
    out.push({ key: `회복볼${String(i)}`, x: play.at.x + dx, y: play.at.y + dy, z: play.at.z + dz })
  }
  return out
}

/**
 * 그리는 쪽이 묻는다 — 이 소품의 한 번짜리 클립이 지금 몇 프레임인가. 안 돌면 null(제자리 그림).
 *
 * 볼(517)과 센터 화면(124)만 답한다. 마지막 프레임에서 멎는다 — 치울 때까지 그 그림이다
 */
export function healingFrame(model: number, frames: number): number | null {
  if (play === null || play.final === null) return null
  if (!clipModels(play.kind).includes(model)) return null
  const since = (performance.now() - play.final) / FRAME_MS
  return Math.min(frames - 1, since)
}

/** 이 연출이 돌리는 소품인가 — 저절로 도는 것에서 뺀다 */
export function isHealingModel(model: number): boolean {
  return model === HEALING_BALL_MODEL || model === HEALING_SCREEN_MODEL
}
