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
//   face    세우자마자 **한 번** 그쪽으로 돌아서고 그 뒤로는 아무것도 안 한다
//   rotate  24프레임마다 시계/반시계로 한 칸씩 돈다
//   spin    같은 회전인데 **시작 방향에 닿으면 반대로 돈다** (VS시커에 응한 사람)
//   pace    시작 방향으로 걷다 막히면 되돌아온다
//   route   방향 넷을 차례로 돈다. 한 바퀴는 시작 자리로 돌아오는 것으로 센다
//   follow  주인공이 **방금 떠난 칸**으로 한 칸 걷는다 (동행 여덟 자리)
//   partner 같은 트레이너 ID를 가진 짝이 떠난 칸으로 걷는다 (더블 트레이너 셋)
//
// ⚠️ **범위(`range`)는 안 쓴다.** 배치표에 돌아다닐 범위가 적혀 있고 원작에도 그
// 검사가 있는데(`sub_0206489C`), 백금에서 그 검사를 켜는 인자가 **어느 유형에도
// 안 들어간다** — 배회 유형 셋이 전부 0을 넘긴다. 그래서 원작에서도 배회를
// 가두는 것은 범위가 아니라 벽이다.
import type { ScriptFile } from '../../data/schema'
import { worldState } from '../../state/worldState'
import { activeZone, isOnWater } from '../map/zone'
import { NO_SCRIPT } from '../map/world'
import { DIR_STEP, MovementRunner, type MovementTable } from '../script/movement'
import { obstacleAt } from './obstacles'
import { npcActors, type NpcActor } from './npcs'
import { playerSpeed } from './player'

type MovementTypeTable = ScriptFile['movementTypes']
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
  /**
   * `follow`·`partner`가 **마지막으로 알아챈** 앞사람의 칸.
   *
   * 앞사람이 이 칸을 떠나면 우리가 그 칸으로 들어간다 — 원작의
   * `PlayerAvatar_XPosPrev`가 가리키는 자리와 같다. 우리는 매 프레임 보므로
   * 「마지막으로 알아챈 칸」이 곧 「앞사람이 방금 떠난 칸」이다.
   * −1이면 아직 한 번도 안 봤다
   */
  sawX: number
  sawZ: number
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
      if (type === undefined) continue
      // 변장은 **가만히 있는 것**이 하는 일의 전부다 — 굴릴 것이 없다.
      //
      // ⚠️ **`face`는 여기서 빠지면 안 된다.** 「서쪽을 본다」 유형은 세우면서
      // 한 번 돌려세우는 일이 있다 (`sub_02064918`이 `MapObject_TryFace`를
      // 부른다) — 배치표의 방향과 다른 사람이 519명 중 12명이고, 빼 두면 그
      // 열둘이 엉뚱한 쪽을 보고 서서 시선이 안 걸린다
      if (type.kind === 'other' || type.kind === 'disguise') continue
      stepActor(actor, type)
    }
  },
}

/**
 * 지금 변장하고 있는가 (PARITY §1.15). 하고 있으면 더미 번호(0~3)다.
 *
 * 원작은 사람을 32단위 **땅 아래로 내리고** 그 자리에 더미 모델을 그린다
 * (`sub_0206A0BC` + `ov5_021F3D90`). 우리는 사람을 안 그리고 더미만 그린다 —
 * 화면에 보이는 것은 같고, 땅 아래로 내린 몸이 다른 판정에 걸릴 일도 없다.
 *
 * ⚠️ **정체가 드러나면 이동 유형이 `NONE`으로 갈린다**
 * (`ApproachingTrainerTask_SwitchMovementTypeNone`). 그래서 「드러났는가」를
 * 따로 안 들고 있어도 된다 — 유형 하나가 그 상태다
 */
export function disguiseOf(actor: NpcActor | undefined): number | null {
  if (actor === undefined) return null
  const type = npcAmbient.types[actor.movementType]
  if (type?.kind !== 'disguise') return null
  return type.prop ?? 0
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
    sawX: -1,
    sawZ: -1,
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
  // 파도타기 상태가 가르지만 NPC는 탈 일이 없으니 그냥 못 간다.
  //
  // ⚠️ **사람은 다리 위로 친다.** 물 위의 다리는 층에 따라 물이 되기도 하는데
  // (`isOnWater`), 배치표의 사람은 다리 **위**에 세워져 있다 — 밑으로 치면
  // 다리를 건너 도는 사람이 제자리에서 굳는다 (PARITY §1.16)
  return grid.isBlockedAtWorld(wx, wz)
    || isOnWater(grid.behaviorAtWorld(wx, wz), true)
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
    // `MapObject_TryFace` — **한 번만 돈다.** 원작도 상태를 하나 올려 두 번째
    // 프레임부터는 빈 갈래로 빠진다. 매 프레임 돌려세우면 스크립트가
    // `ApplyMovement`로 돌려놓은 얼굴을 곧바로 도로 뺏는다
    case 'face': {
      if (state.index !== 0) return
      state.index = 1
      const dir = dirs[0]
      if (dir !== undefined) actor.dir = dir
      return
    }
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
    // VS시커에 응한 사람 (`sub_02064B74`, PARITY §7.9).
    //
    // ⚠️ **시작 방향으로 돌아오면 반대로 돌기 시작한다.** 그래서 한 바퀴 돌고
    // 되돌아오는 「두리번거리는 것보다 급한」 몸짓이 된다 — 보통 회전은
    // 한 방향으로만 계속 돈다. 눈으로 그 둘을 가르는 것이 이 한 줄이다
    case 'spin': {
      state.wait = npcAmbient.rotateFrames
      const at = dirs.indexOf(actor.dir)
      const step = state.back ? -1 : 1
      const next = dirs[(at + step + dirs.length) % dirs.length]
      if (next === undefined) return
      actor.dir = next
      // ⚠️ **되돌아오는 기준은 배치표의 방향이다** (`MapObject_GetInitialDir`).
      // 지금 서 있던 방향이 아니다 — 두리번거리다 응한 사람은 시작 방향이
      // 제각각이라, 그걸 기준으로 잡으면 사람마다 되돌아오는 자리가 달라진다
      if (next === actor.info.facing) state.back = !state.back
      return
    }
    case 'wander': return stepWander(actor, state, dirs)
    case 'pace': return stepPace(actor, state)
    case 'route': return stepRoute(actor, state, type)
    case 'follow': return stepFollow(actor, state, playerTile())
    case 'partner': return stepFollow(actor, state, partnerTile(actor))
    default: return
  }
}

/**
 * 따라다니기 (`sub_02069C48` · `sub_02069E5C`).
 *
 * ⚠️ **앞사람이 지금 선 칸이 아니라 방금 떠난 칸으로 간다.** 지금 칸으로
 * 걸으면 두 몸이 겹치고, 앞사람이 멈춘 순간 옆으로 파고든다. 「한 칸 뒤를
 * 따라온다」가 이 한 줄이다.
 *
 * 벽도 사람도 안 본다 — 앞사람이 지나온 칸이라 갈 수 있는 것이 이미 증명됐고,
 * 원작도 여기서는 통행 검사를 안 한다
 */
function stepFollow(
  actor: NpcActor, state: AmbientState, lead: { x: number; z: number } | null,
): void {
  if (lead === null) return
  // 처음 보는 순간에는 안 움직인다. 아직 「방금 떠난 칸」이 없다
  if (state.sawX < 0) { state.sawX = lead.x; state.sawZ = lead.z; return }
  if (lead.x === state.sawX && lead.z === state.sawZ) return

  const goX = state.sawX
  const goZ = state.sawZ
  state.sawX = lead.x
  state.sawZ = lead.z
  // 벌써 그 칸이면 갈 데가 없다 — 앞사람이 제자리에서 돌기만 한 자리다
  if (actor.x === goX && actor.z === goZ) return

  const dir = towards(actor.x, actor.z, goX, goZ)
  actor.dir = dir
  state.runner = new MovementRunner(
    actor, [{ action: followAction(dir), count: 1 }], npcAmbient.movements,
  )
}

/**
 * `GetDirectionBetweenPoints` — **x를 먼저 본다.**
 *
 * 대각선으로 벌어져 있으면 좌우부터 좁힌다. 원작이 그 차례라, 뒤집으면 모퉁이를
 * 돌 때 동행이 반대쪽으로 한 칸 새어 나간다
 */
function towards(x: number, z: number, toX: number, toZ: number): number {
  if (x > toX) return 2
  if (x < toX) return 3
  return z > toZ ? 0 : 1
}

/**
 * 따라가는 한 걸음이 몇 프레임짜리인가.
 *
 * ⚠️ **원작은 주인공의 이동 동작을 그대로 베낀다** (`sub_02069D50`) — 주인공이
 * 뛰면 동행도 뛴다. 우리 주인공은 동작이 아니라 **속도**로 움직이므로
 * (`actor/player`의 4.5·8·최대 18타일/초) 그 속도를 낼 수 있는 가장 느린 걸음을
 * 고른다. 안 그러면 자전거를 탄 순간 동행이 화면 밖으로 떨어진다
 */
function followAction(dir: number): number {
  const tilesPerSecond = playerSpeed()
  for (const [frames, action] of FOLLOW_STEPS) {
    if (FRAMES_PER_SECOND / frames >= tilesPerSecond) return action + dir
  }
  return WALK_FASTEST_NORTH + dir
}

/** 원작 필드는 60프레임/초다 */
const FRAMES_PER_SECOND = 60
/** `MOVEMENT_ACTION_WALK_FASTEST_NORTH` — 한 칸에 한 프레임 */
const WALK_FASTEST_NORTH = 84
/**
 * 느린 것부터 본 걸음 사다리. 프레임 수와 그 걸음의 북쪽 동작 번호다
 * (`generated/movement_actions.txt`)
 */
const FOLLOW_STEPS: readonly (readonly [number, number])[] = [
  [8, WALK_NORMAL_NORTH],
  [7, 96], // WALK_EVER_SO_SLIGHTLY_FAST
  [6, 76], // WALK_SLIGHTLY_FAST
  [4, 16], // WALK_FAST
  [3, 80], // WALK_SLIGHTLY_FASTER
  [2, 20], // WALK_FASTER
]

/** 주인공이 선 칸 */
function playerTile(): { x: number; z: number } {
  const p = worldState.player.position
  return { x: Math.floor(p.x), z: Math.floor(p.z) }
}

/**
 * 짝 트레이너가 선 칸 (`sub_02069F48`).
 *
 * 같은 맵에서 **트레이너 ID가 같은 다른 사람**이 짝이다. 더블 트레이너 셋이
 * 그렇게 두 줄로 적혀 있다 — 티와 수, 잭과 젠, 조와 팻
 */
function partnerTile(self: NpcActor): { x: number; z: number } | null {
  const id = self.info.script
  if (id === NO_SCRIPT) return null
  for (const other of npcActors.list) {
    if (other === self || !other.visible) continue
    if (other.info.script !== id) continue
    // 걷는 도중이면 소수 자리가 남는다. 반올림하면 **반 칸을 지난 순간**부터
    // 새 칸으로 읽혀서, 따라가는 쪽이 한 박자 일찍 떠난다 — 원작의
    // `MapObject_GetX`도 걸음이 시작될 때 도착 칸으로 갈아 끼운다
    return { x: Math.round(other.x), z: Math.round(other.z) }
  }
  return null
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
