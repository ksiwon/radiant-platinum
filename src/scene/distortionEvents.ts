// 깨어진 세계 — 칸을 밟으면 도는 사건 (PARITY §6.10)
//
// 층 자료의 `events`가 명령 줄을 들고 있고, 여기서 한 줄씩 돌린다. 미는 판
// (`slide`)과 뛰는 판(`hop`)은 프레임을 세며 도는 것이라 여기 상태가 남는다.
import { EVENT_CMD, findPlatform, flagHolds } from '../engine/world/distortion'
import { DIR_STEP } from '../engine/script/movement'
import {
  HOP_FRAMES, HOP_TILES, VIBRATION, hopDirOf, hopLift, platformFrames,
} from '../engine/world/distortionMovePlatform'
import { worldState } from '../state/worldState'
import {
  FACING_YAW, bindPlatform, distortionData, distortionHooks, distortionFloor, setState, state, toWorldTiles,
} from './distortionCore'
import {
  beginArrival, distortionShadowDone, finishDistortionShadow, startDistortionShadow,
  startGhostRun, tickArrival,
} from './distortionGiratina'

/** 이미 돈 사건은 다시 안 돈다. 맵을 나가면 지운다 */
const ranEvents = new Set<string>()

export function applyEvents(wx: number, wy: number, wz: number): void {
  const floor = distortionFloor()
  const data = distortionData()
  if (floor === null || data === null) return
  const table = data.events.find((e) => e.map === floor?.map)
  if (table === undefined) return
  const ctx = {
    progress: distortionHooks.progress?.() ?? 0,
    state: state(),
    giratinaAnim: (n: number) => distortionHooks.giratinaAnim?.(n) ?? false,
    cyrusAppearance: distortionHooks.cyrusAppearance?.() ?? 0,
  }
  for (const [i, event] of table.events.entries()) {
    if (event.x !== wx || event.y !== wy || event.z !== wz) continue
    if (!flagHolds(event.flagCond, event.flagVal, ctx)) continue
    const key = `${String(floor.map)}:${String(i)}`
    if (ranEvents.has(key)) continue
    ranEvents.add(key)
    runEvent(event.cmds)
    return
  }
}

type EventCmd = { kind: number; params: Record<string, unknown> | null }

/**
 * 사건 프로그램 (`RunEventCommands`).
 *
 * ⚠️ **명령은 차례로, 프레임을 두고 돈다.** 원작의 명령 하나하나가 제 상태
 * 기계라(`sMovePlatformHandlers`) 한 걸음에 끝나지 않는다 — 발판이 떨고,
 * 미끄러지고, 주인공이 뛰어내리고, 빈 판이 돌아오기까지가 한 사건이다.
 * 예전엔 전부 같은 프레임에 실행했는데, 그러면 판은 가만히 있고 사람만
 * 여덟 칸 순간이동한다 (사용자가 「바닥이 이동하는 모션이 없다」고 한 것).
 *
 * 상태만 바꾸는 명령(진행도·바위 자리·스크립트 시작)은 그 자리에서 끝내고
 * 다음 명령으로 넘어간다
 */
function runEvent(cmds: readonly EventCmd[]): void {
  running = { cmds, at: 0, frame: 0, slide: null, hop: null, shadow: false, arrival: false }
  advanceEvent()
}

/** 지금 도는 사건. 도는 동안은 조작이 안 먹는다 */
interface EventRun {
  cmds: readonly EventCmd[]
  /** 다음에 실행할 명령 */
  at: number
  /** 지금 명령이 시작한 뒤 흐른 프레임 */
  frame: number
  slide: {
    /** 움직이는 발판의 자리 번호 (`movingPlatforms`의 `index`) */
    index: number
    /** 다 가면 얼마나 밀리는가 (타일) */
    final: [number, number, number]
    /** 이 명령이 시작할 때 그 발판이 이미 밀려 있던 만큼 */
    from: [number, number, number]
    total: number
    movePlayer: boolean
    /** 태우고 갈 때 주인공이 서 있던 자리 */
    rider: [number, number, number]
  } | null
  hop: { dir: number; from: [number, number, number] } | null
  /** 기라티나 그림자가 다 지나가기를 기다리는 중인가 */
  shadow: boolean
  /** 기라티나가 내려서기를 기다리는 중인가 */
  arrival: boolean
}

let running: EventRun | null = null

/**
 * 지금 밀려나 있는 발판. 자리 번호 → 타일 어긋남.
 *
 * 사건 하나가 판을 보냈다가 되돌리므로 끝나면 0으로 돌아온다. 그림을 그리는
 * 쪽(`DistortionProps`)이 프레임마다 이걸 본다
 */
const slid = new Map<number, [number, number, number]>()

/**
 * 돌던 사건과 밀려 있던 판을 버린다.
 *
 * ⚠️ **층을 들고 날 때 둘 다 지운다.** 판 자리 번호는 층마다 다시 세는 값이라
 * 앞 층 것을 들고 오면 다음 층의 엉뚱한 판이 그만큼 옆으로 나가 선다
 */
export function resetDistortionEvents(): void {
  running = null
  slid.clear()
}

/** 사건 연출이 도는 중인가 */
export function distortionEventRunning(): boolean {
  return running !== null
}

/** 그 발판이 지금 얼마나 밀려 있는가 (타일). 안 밀렸으면 null */
export function distortionSlideAt(index: number): readonly [number, number, number] | null {
  return slid.get(index) ?? null
}

/** 다음 명령으로 넘어간다. 연출이 걸리면 거기서 멈추고 프레임을 기다린다 */
function advanceEvent(): void {
  while (running !== null) {
    const cmd = running.cmds[running.at]
    if (cmd === undefined) { running = null; return }
    running.at += 1
    running.frame = 0
    const p = cmd.params ?? {}
    switch (cmd.kind) {
      case EVENT_CMD.startScript:
        distortionHooks.runScript?.(p.scriptID as number)
        break
      case EVENT_CMD.setProgress:
        distortionHooks.setProgress?.(p.progress as number)
        break
      case EVENT_CMD.setPuzzleFlag:
        setState({ puzzleFlags: state().puzzleFlags | (1 << (p.flagIndex as number)) })
        break
      case EVENT_CMD.clearPuzzleFlag:
        setState({ puzzleFlags: state().puzzleFlags & ~(1 << (p.flagIndex as number)) })
        break
      case EVENT_CMD.movePlatform:
        if (beginSlide(p)) return
        break
      case EVENT_CMD.setMapObjectAnimation:
        if (beginHop(p)) return
        break
      // 다 지나갈 때까지 **사건이 선다** (`EventCmdShowGiratinaShadow_Finish`) —
      // 그다음 명령이 진행도를 올리므로, 안 세우면 그림자가 뜨자마자 이야기가
      // 한 칸 앞서 나가고 화면에는 아무것도 안 지나간다
      case EVENT_CMD.showGiratinaShadow:
        startDistortionShadow(p as Record<string, number | number[] | null>)
        running.shadow = true
        return
      // 세우는 것까지가 이 명령이다 — 배치표만 믿으면 (15,13)이 빈 채로 남는다
      case EVENT_CMD.playGiratinaArrival:
        if (beginArrival()) { running.arrival = true; return }
        break
      // ⚠️ **이 둘을 「연출」로 넘기면 기라티나 방에서 길이 안 생긴다.**
      // 발판 무리 1~3을 한 무리씩 세우는 것이 이 명령이고, 그게 없으면
      // 숨은 소품 여섯이 영영 안 나타나서 그 방에서 못 나간다
      case EVENT_CMD.showGiratinaRoomPlatforms:
        startGhostRun(true)
        break
      case EVENT_CMD.hideGiratinaRoomPlatforms:
        startGhostRun(false)
        break
      default:
        // 남은 것은 전부 연출이다 (그림자·폭포·바위 안내·기라티나 도착)
        break
    }
  }
}

/** 발판이 움직이기 시작한다 (`EventCmdMovePlatform_BeginMovement`) */
function beginSlide(p: Record<string, unknown>): boolean {
  if (running === null) return false
  const index = (p.platformIndex as number | undefined) ?? -1
  const final: [number, number, number] = [
    (p.finalTileXOffset as number | undefined) ?? 0,
    (p.finalTileYOffset as number | undefined) ?? 0,
    (p.finalTileZOffset as number | undefined) ?? 0,
  ]
  const delta = (p.posDelta as [number, number, number] | undefined) ?? [0, 0, 0]
  const total = platformFrames(final, delta)
  if (index < 0 || total <= 0) return false
  const pos = worldState.player.position
  running.slide = {
    index,
    final,
    from: [...(slid.get(index) ?? [0, 0, 0])] as [number, number, number],
    total,
    movePlayer: p.movePlayer === 1,
    rider: [pos.x, pos.y, pos.z],
  }
  worldState.player.velocity.set(0, 0, 0)
  return true
}

/** 주인공이 판에서 뛰어내린다 (`EVENT_CMD_SET_MAP_OBJECT_ANIMATION`) */
function beginHop(p: Record<string, unknown>): boolean {
  if (running === null) return false
  // 자료에 있는 것은 주인공(`LOCALID_PLAYER` = 255)의 뛰기 넷뿐이다
  const dir = hopDirOf((p.movementAction as number | undefined) ?? -1)
  if (dir === null || (p.mapObjLocalID as number | undefined) !== 255) return false
  const pos = worldState.player.position
  running.hop = { dir, from: [pos.x, pos.y, pos.z] }
  worldState.player.facing = FACING_YAW[dir] ?? worldState.player.facing
  worldState.player.velocity.set(0, 0, 0)
  return true
}

/**
 * 한 프레임 (`CallLoadedEventHandler`).
 *
 * 떨림 열두 프레임 → 미끄러짐 → 뜀 스물네 프레임이 차례로 돈다
 */
export function distortionEventTick(dt: number): void {
  const run = running
  if (run === null) return
  run.frame += dt * 60
  if (run.shadow) {
    if (!distortionShadowDone()) return
    finishDistortionShadow()
    run.shadow = false
    advanceEvent()
  } else if (run.arrival) {
    if (!tickArrival(dt)) return
    run.arrival = false
    advanceEvent()
  } else if (run.slide !== null) tickSlide(run, run.slide)
  else if (run.hop !== null) tickHop(run, run.hop)
  else advanceEvent()
}

function place(x: number, y: number, z: number): void {
  const p = worldState.player.position
  p.set(x, y, z)
  worldState.player.prevPosition.copy(p)
  worldState.player.velocity.set(0, 0, 0)
}

function tickSlide(run: EventRun, s: NonNullable<EventRun['slide']>): void {
  const floor = distortionFloor()
  const shake = run.frame < VIBRATION.length
  if (shake) {
    const y = VIBRATION[Math.floor(run.frame)] ?? 0
    slid.set(s.index, [s.from[0], s.from[1] + y, s.from[2]])
    if (s.movePlayer) place(s.rider[0], s.rider[1] + y, s.rider[2])
    return
  }
  const k = Math.min(1, (run.frame - VIBRATION.length) / s.total)
  const at: [number, number, number] = [
    s.from[0] + s.final[0] * k, s.from[1] + s.final[1] * k, s.from[2] + s.final[2] * k,
  ]
  slid.set(s.index, at)
  if (s.movePlayer) {
    place(s.rider[0] + s.final[0] * k, s.rider[1] + s.final[1] * k, s.rider[2] + s.final[2] * k)
  }
  if (k < 1) return
  // 다 갔다 (`EventCmdMovePlatform_EndMovement`) — 닿은 칸에서 발밑의 판을
  // 다시 잡는다. 이걸 빼면 옮겨진 자리가 앞 판의 격자 밖이라 못 움직인다
  if (s.movePlayer && floor !== null) {
    const p = worldState.player.position
    const [wx, wy, wz] = toWorldTiles(p.x, p.y, p.z)
    bindPlatform(findPlatform(floor.platforms, wx, wy, wz))
  }
  run.slide = null
  advanceEvent()
}

function tickHop(run: EventRun, h: NonNullable<EventRun['hop']>): void {
  const floor = distortionFloor()
  const step = DIR_STEP[h.dir] ?? { x: 0, z: 0 }
  const f = Math.min(HOP_FRAMES, run.frame)
  const along = (f / HOP_FRAMES) * HOP_TILES
  place(h.from[0] + step.x * along, h.from[1] + hopLift(f), h.from[2] + step.z * along)
  if (run.frame < HOP_FRAMES) return
  place(h.from[0] + step.x * HOP_TILES, h.from[1], h.from[2] + step.z * HOP_TILES)
  if (floor !== null) {
    const p = worldState.player.position
    const [wx, wy, wz] = toWorldTiles(p.x, p.y, p.z)
    bindPlatform(findPlatform(floor.platforms, wx, wy, wz))
  }
  run.hop = null
  advanceEvent()
}

/** 시험용 — 층을 나가면 사건 기억을 지운다 */
export function distortionForgetEvents(): void {
  ranEvents.clear()
}
