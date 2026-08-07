// 사람이 혼자 하는 짓 (`MapObject_Move`의 이동 유형, DATA.md §2.3)
//
// 배치표의 `move`는 "이 사람은 평소에 무엇을 하는가"다. 스크립트가 거는 걸음
// (`ApplyMovement`)과 **다른 표**이고, 말을 안 걸어도 매 프레임 돈다.
//
// 이게 없으면 신오 전체가 마네킹이다 — NPC 3,555명 중 1,504명이 0(가만히 있는다)이
// 아닌 유형을 달고 있는데 그 전부가 굳어 있었다. 그리고 `LockAll`이 **아무 뜻도
// 없었다**: 스크립트가 4,374번 "다들 멈춰"라고 말하는데 멈출 것이 없었기 때문이다.
//
// 갈래는 디컴프에서 기계로 뽑는다 (`tools/extract/movement-table.js`) — 방향
// 하나만 뒤집혀도 사람이 반대로 걷고 그건 화면으로 안 잡힌다.
//
//   look    n프레임 기다렸다 정해진 방향 중 아무 쪽이나 **돌아본다**
//   wander  기다렸다 아무 쪽이나 골라 **한 칸 걷는다**. 막히면 돌기만 한다
//   face    시작 방향만 본다 — 할 일이 없다
//   rotate  24프레임마다 시계/반시계로 한 칸씩 돈다
//   pace    시작 방향으로 걷다 막히면 되돌아온다
//   route   방향 넷을 차례로 돈다. 한 바퀴는 시작 자리로 돌아오는 것으로 센다
//
// ⚠️ **범위(`range`)는 안 쓴다.** 배치표에 돌아다닐 범위가 적혀 있고 원작에도 그
// 검사가 있는데(`sub_0206489C`), 백금에서 그 검사를 켜는 인자가 **어느 유형에도
// 안 들어간다** — 배회 유형 셋이 전부 0을 넘긴다. 그래서 원작에서도 배회를
// 가두는 것은 범위가 아니라 벽이다.
import type { ScriptFile } from '../../data/schema'
import { worldState } from '../../state/worldState'
import { activeZone, isSurfable } from '../map/zone'
import { DIR_STEP, MovementRunner, type MovementTable } from '../script/movement'
import { obstacleAt } from './obstacles'
import { npcActors, type NpcActor } from './npcs'

export type MovementTypeTable = ScriptFile['movementTypes']
type MovementType = MovementTypeTable[number]

/** `MOVEMENT_ACTION_WALK_NORMAL_NORTH`. 방향 번호를 더하면 그쪽 걸음이다 */
const WALK_NORMAL_NORTH = 12

/** 북↔남 · 서↔동 (`Direction_GetOpposite`) */
const OPPOSITE = [1, 0, 3, 2]

/**
 * `route`가 한 바퀴를 세는 차례 (`sub_02064D98`의 첫 인자 2).
 *
 * 차례가 여기 오면 축 좌표가 시작 자리로 돌아왔는지 보고, 돌아왔으면 다음
 * 방향으로 넘어간다
 */
const ROUTE_AXIS_CHECK = 2

/** 한 사람의 진행 상태. 처음 굴릴 때 만든다 */
export interface AmbientState {
  /** 다음 짓까지 남은 프레임 */
  wait: number
  /** 걷는 중이면 그 실행기. 걸음은 `movements` 표가 프레임을 정한다 */
  runner: MovementRunner | null
  /** 세워진 자리와 방향. `pace`·`route`가 여기를 기준으로 돈다 */
  homeX: number
  homeZ: number
  homeDir: number
  /** `route`가 지금 도는 차례 */
  index: number
  /** `pace`가 되돌아오는 중인가 */
  back: boolean
}

export const npcAmbient = {
  /** `scripts.json`의 `movementTypes`. 안 붙으면 아무도 안 움직인다 */
  types: [] as MovementTypeTable,
  /** 걸음 한 칸이 몇 프레임인지 아는 표 (`scripts.json`의 `movements`) */
  movements: [] as MovementTable,
  /** 기다림 후보. 실측 16·32·48·64프레임 */
  delays: [16, 32, 48, 64] as readonly number[],
  rotateFrames: 24,
  /**
   * 0 이상 1 미만. 원작은 `LCRNG_Next() % 개수`인데 그 난수열까지 맞출 이유가
   * 없다 — 시험이 갈아 끼울 수 있게 함수로 둔다
   */
  random: (): number => Math.random(),

  /** 한 프레임. `npcSystem`이 부른다 */
  tick(): void {
    // `MapObjectMan_PauseAllMovement` — 스크립트가 `LockAll`로 세운 것이다
    if (npcActors.paused) return
    for (const actor of npcActors.list) {
      if (!actor.visible) continue
      const type = npcAmbient.types[actor.movementType]
      if (type === undefined || type.kind === 'other' || type.kind === 'face') continue
      stepActor(actor, type)
    }
  },
}

/** `scripts.json`에서 표 넷을 한 번에 받는다 */
export function setAmbientTables(meta: ScriptFile): void {
  npcAmbient.types = meta.movementTypes
  npcAmbient.movements = meta.movements
  npcAmbient.delays = meta.movementDelays
  npcAmbient.rotateFrames = meta.rotateFrames
}

/** 시험이 쓴다. 굴리던 것을 잊는다 */
export function clearAmbient(): void {
  for (const actor of npcActors.list) actor.ambient = null
}

function pick<T>(list: readonly T[]): T | undefined {
  return list[Math.floor(npcAmbient.random() * list.length)]
}

function newState(actor: NpcActor, kind: MovementType['kind']): AmbientState {
  return {
    // ⚠️ **기다렸다 시작하는 갈래와 곧바로 걷는 갈래가 갈린다.** 두리번거리기와
    // 배회는 원작도 시작할 때 기다림을 하나 뽑고(`sub_0206450C`), 왔다 갔다·차례로
    // 돌기는 첫 프레임부터 걷는다. 전부 기다리게 하면 방을 도는 사람이 한 박자
    // 늦게 출발하고, 전부 안 기다리게 하면 마을 사람이 **한 박자에 같이** 돌아본다
    wait: kind === 'look' || kind === 'wander' ? pick(npcAmbient.delays) ?? 16 : 0,
    runner: null,
    homeX: actor.x,
    homeZ: actor.z,
    homeDir: actor.dir,
    index: 0,
    back: false,
  }
}

/**
 * 지형이 막는가 (`sub_02063EBC`의 0번 비트).
 *
 * 이쪽이면 **방향을 바꾼다**. 사람이 서 있는 것과 구분해야 한다 — 원작도 벽은
 * 돌아가고 사람은 제자리걸음으로 기다린다
 */
function terrainBlocks(x: number, z: number): boolean {
  const grid = activeZone.grid
  // 격자가 없으면(회색 상자 월드) 아무 데도 못 간다. 안 막으면 허공을 걷는다
  if (!grid) return true
  const wx = x + 0.5
  const wz = z + 0.5
  // ⚠️ 물은 격자가 안 막는다 — 통행 가능으로 찍힌 물이 25,469칸이다. 주인공은
  // 파도타기 상태가 가르지만 NPC는 탈 일이 없으니 그냥 못 간다
  return grid.isBlockedAtWorld(wx, wz)
    || isSurfable(grid.behaviorAtWorld(wx, wz))
    || obstacleAt(x, z) !== null
}

/** 그 칸에 사람이 서 있는가. 이쪽이면 제자리에서 기다린다 */
function someoneAt(self: NpcActor, x: number, z: number): boolean {
  const p = worldState.player.position
  if (Math.floor(p.x) === x && Math.floor(p.z) === z) return true
  for (const other of npcActors.list) {
    if (other === self || !other.visible) continue
    if (Math.round(other.x) === x && Math.round(other.z) === z) return true
  }
  return false
}

/** 한 칸 걷기 시작한다. 프레임 수는 이동 동작 표가 정한다 (보통 걸음 8프레임) */
function startWalk(actor: NpcActor, state: AmbientState, dir: number): void {
  state.runner = new MovementRunner(
    actor, [{ action: WALK_NORMAL_NORTH + dir, count: 1 }], npcAmbient.movements,
  )
}

/**
 * 못 가는 칸 앞에서 제자리걸음 (`MOVEMENT_ACTION_WALK_ON_SPOT_*`).
 *
 * 원작은 걷는 시늉을 하고 우리는 그냥 그 프레임만큼 선다 — 서 있는 장과 걷는
 * 장을 가르는 것이 좌표라(`NpcSprites`) 제자리에서는 장이 안 넘어간다
 */
const WALK_ON_SPOT_FRAMES = 8

function stepActor(actor: NpcActor, type: MovementType): void {
  const state = actor.ambient ?? (actor.ambient = newState(actor, type.kind))

  if (state.runner !== null) {
    state.runner.tick()
    if (state.runner.done) state.runner = null
    return
  }
  // 스크립트가 걸어 옮기는 중이면 남의 걸음이다. 칸 사이에 서 있는데 우리
  // 실행기가 없으면 그쪽이니 손대지 않는다
  if (!Number.isInteger(actor.x) || !Number.isInteger(actor.z)) return

  if (state.wait > 0) { state.wait--; return }

  const dirs = type.dirs ?? []
  switch (type.kind) {
    case 'look': {
      state.wait = pick(npcAmbient.delays) ?? 16
      const dir = pick(dirs)
      if (dir !== undefined) actor.dir = dir
      return
    }
    case 'rotate': {
      state.wait = npcAmbient.rotateFrames
      const at = dirs.indexOf(actor.dir)
      // 표에 없는 방향에서 시작했으면 표의 첫 칸부터 돈다
      actor.dir = dirs[(at + 1) % dirs.length] ?? actor.dir
      return
    }
    case 'wander': return stepWander(actor, state, dirs)
    case 'pace': return stepPace(actor, state)
    case 'route': return stepRoute(actor, state, type)
    default: return
  }
}

function stepWander(actor: NpcActor, state: AmbientState, dirs: readonly number[]): void {
  state.wait = pick(npcAmbient.delays) ?? 16
  const dir = pick(dirs)
  if (dir === undefined) return
  actor.dir = dir
  const step = DIR_STEP[dir]
  if (step === undefined) return
  const x = actor.x + step.x
  const z = actor.z + step.z
  // 막히면 **돌아보기만 한다**. 원작도 걸음을 접고 처음 상태로 돌아간다 —
  // 그래서 벽에 붙은 사람은 벽 쪽으로 고개만 돌린다
  if (terrainBlocks(x, z) || someoneAt(actor, x, z)) return
  startWalk(actor, state, dir)
}

/**
 * 왔다 갔다 (`MOVEMENT_TYPE_WALK_BACK_AND_FORTH`).
 *
 * 시작 방향으로 걷다 막히면 돌아서고, 시작 칸으로 돌아오면 다시 돌아선다.
 * 그래서 오가는 구간은 **시작 칸과 그 앞 벽 사이**다
 */
function stepPace(actor: NpcActor, state: AmbientState): void {
  let dir = state.back ? OPPOSITE[state.homeDir]! : state.homeDir
  if (state.back && actor.x === state.homeX && actor.z === state.homeZ) {
    dir = state.homeDir
    state.back = false
  }
  // 막히면 **돌아선다**. 차례로 도는 갈래와 다른 자리다 — 그쪽은 고리의 다음
  // 방향으로 넘어간다 (`sub_02064CA8` vs `sub_02064EEC`)
  walkOrTurn(actor, state, dir, (blocked) => { state.back = true; return OPPOSITE[blocked]! })
}

/**
 * 네 방향을 차례로 (`MOVEMENT_TYPE_WALK_*_*_*_*` 24가지).
 *
 * ⚠️ **차례를 4로 나눈 나머지로 돌린다.** 원작은 막힐 때마다 차례를 하나 올리고
 * 4가 되면 방향 배열 **바깥**을 읽는다(항목이 넷뿐이다). 그 자리에서 무엇이
 * 나올지는 롬 배치에 달린 것이라 옮길 값이 없다 — 고리를 처음으로 돌린다
 */
function stepRoute(actor: NpcActor, state: AmbientState, type: MovementType): void {
  const dirs = type.dirs ?? []
  if (dirs.length === 0) return

  if (state.index === ROUTE_AXIS_CHECK) {
    const home = type.axis === 0 ? state.homeX : state.homeZ
    const now = type.axis === 0 ? actor.x : actor.z
    if (home === now) state.index++
  }
  if (state.index === 3 && actor.x === state.homeX && actor.z === state.homeZ) state.index = 0

  const dir = dirs[state.index % dirs.length]!
  walkOrTurn(actor, state, dir, () => {
    state.index = (state.index + 1) % dirs.length
    return dirs[state.index]!
  })
}

/**
 * `pace`·`route`가 공유하는 한 걸음.
 *
 * 벽이면 `onBlocked`가 **다음 방향을 골라 준다** — 두 갈래가 여기서 갈린다.
 * 그러고도 못 가면 제자리걸음이다 (원작이 `WALK_ON_SPOT`으로 바꿔 다는 자리)
 */
function walkOrTurn(
  actor: NpcActor, state: AmbientState, first: number, onBlocked: (dir: number) => number,
): void {
  let dir = first
  let step = DIR_STEP[dir]!
  if (terrainBlocks(actor.x + step.x, actor.z + step.z)) {
    dir = onBlocked(dir)
    step = DIR_STEP[dir]!
  }
  actor.dir = dir
  const x = actor.x + step.x
  const z = actor.z + step.z
  if (terrainBlocks(x, z) || someoneAt(actor, x, z)) {
    state.wait = WALK_ON_SPOT_FRAMES
    return
  }
  startWalk(actor, state, dir)
}

/** 게임 루프에 다는 자리. 스크립트 다음 · 주인공 이동 앞이다 */
export const npcSystem = {
  fixedUpdate(): void { npcAmbient.tick() },
}
