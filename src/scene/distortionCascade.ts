// 깨어진 세계 — 폭포를 타고 층을 오르내린다 (PARITY §6.10)
//
// 규칙은 `engine/world/distortionCascade`가 들고, 여기서는 **언제 타고 언제
// 내리는가**만 정한다. 방아쇠는 `distortion`의 `distortionMoved`가 당긴다.
import { connectionOf, findPlatform, mapOf } from '../engine/world/distortion'
import { DIR, DIR_STEP } from '../engine/script/movement'
import { SFX } from '../engine/audio/sfx'
import { music } from '../engine/audio/music'
import {
  CASCADE_UNIT, cascadeAt, cascadeBob, cascadeBobFix, cascadeCamerasBetween, cascadeFrames,
  cascadeLoadFrame, cascadeOffset, cascadeRoll, type CascadeSite,
} from '../engine/world/distortionCascade'
import { world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import {
  FACING_YAW, beginFloorLoad, bindPlatform, distortionData, distortionFloor, markCarried,
  setHeightCalc, setState, state, toLocalTiles, toWorldTiles,
} from './distortionCore'
import { turnCamera } from './distortionCamera'

/**
 * `DIST_WORLD_PLATFORM_FLAG_B5F_1` — 폭포로 내려가면 서는 B5F의 승강 발판.
 *
 * 원작이 폭포 끝에서 이 플래그를 세우고 그 발판을 세운다
 * (`InitSpecificMovingPlatformPropForMap(..., B5F, 0)`) — 없으면 내려가 놓고
 * 다음 층으로 갈 발판이 안 보인다
 */
const CASCADE_B5F_FLAG = 7

interface Cascading {
  site: CascadeSite
  /** 지난 프레임 수 */
  frame: number
  total: number
  loadAt: number
  /** 뛰어들 때의 세계 칸 */
  from: [number, number, number]
  /** 층을 이미 불렀는가 */
  loaded: boolean
  /**
   * 다 타고 물살에서 걸어 나오는 중 (`EVENT_CMD_CASCADE_*_STATE_MOVE_AWAY`).
   *
   * `start`는 걷기 시작한 자리(맵 x), `frame`은 그 뒤 흐른 프레임이다. 원작은 이 걸음을 이동 동작으로
   * 걸어서 **그동안도 사건이 선다** — 조작이 안 먹는다
   */
  away: { start: number, frame: number } | null
}

let cascade: Cascading | null = null

/** 폭포를 타는 중인가. 그동안은 조작이 안 먹는다 */
export function distortionCascading(): boolean {
  return cascade !== null
}

/**
 * 폭포를 타는 동안의 **몸짓** — 화면이 읽는다.
 *
 * `roll`은 몸이 돌아 있는 각(도)이고 `bob`은 옆으로 밀린 양(칸)이다.
 * 흔들림은 물살의 삼각파와 카메라가 갈릴 때 옮겨지는 중심을 더한 것이다.
 * 폭포를 안 타면(걸어 나오는 동안도) null이라 부르는 쪽은 아무것도 안 한다
 */
export function distortionCascadePose(): { roll: number, bob: number } | null {
  if (cascade === null || cascade.away !== null) return null
  return {
    roll: cascadeRoll(cascade.site, cascade.frame),
    bob: cascadeBob(cascade.site, cascade.frame) + cascadeBobFix(cascade.site, cascade.frame),
  }
}

/**
 * 폭포에 뛰어든다 (`DistWorld_HandlePlayerMoved`의 `sMapEvent*_Waterfall`).
 *
 * 원작은 사건 명령 하나(`EVENT_CMD_CASCADE_DOWN`/`UP`)로 돌리는데, 그 명령은
 * **자료가 아니라 코드에 박힌 표**를 물고 있어 우리 사건 표에는 없다. 그래서
 * 방아쇠도 규칙도 `world/distortionCascade`가 든다
 */
export function applyCascade(wx: number, wy: number, wz: number, dir: number): boolean {
  const floor = distortionFloor()
  if (floor === null) return false
  const site = cascadeAt(floor.map, wx, wy, wz, dir)
  if (site === null) return false
  cascade = {
    site,
    frame: 0,
    total: cascadeFrames(site),
    loadAt: cascadeLoadFrame(site),
    from: [wx, wy, wz],
    loaded: false,
    away: null,
  }
  worldState.player.velocity.set(0, 0, 0)
  // 물소리가 타는 내내 난다 (`Sound_PlayEffect(SEQ_SE_PL_FW463)`)
  void music.playEffect(SFX.WATERFALL)
  // 원작이 몸을 돌려 물살을 등진다 (`MapObject_TryFace(FACE_LEFT)`)
  worldState.player.facing = FACING_YAW[DIR.west] ?? worldState.player.facing
  return true
}

/**
 * 한 프레임 (`CmdRunDataCascadeBase_Update`).
 *
 * ⚠️ **층을 부르는 자리가 도중이다.** 다 떨어지고 나서 부르면 사람이 앞 층의
 * 좌표계로 41.5칸을 내려가 허공에 선다 — 원작은 21칸째에 갈아 끼우고 나머지
 * 20.5칸을 **새 층에서** 마저 내려간다
 */
export function distortionCascadeTick(dt: number): void {
  const floor = distortionFloor()
  const run = cascade
  if (run === null || floor === null) return
  // 층을 받아 오는 동안은 멈춘다 (`IsFloorLoaderActive`)
  if (world.pending !== null) return
  if (run.away !== null) { tickAway(run, run.away, dt); return }
  const before = run.frame
  run.frame = Math.min(run.total, run.frame + dt * 60)

  const moved = cascadeOffset(run.site, run.frame) / CASCADE_UNIT
  const p = worldState.player.position
  const [, wy] = run.from
  const [, ly] = toLocalTiles(0, wy + moved, 0)
  p.y = ly
  worldState.player.prevPosition.copy(p)
  worldState.player.velocity.set(0, 0, 0)
  markCarried()

  // 카메라가 물살을 따라 돈다 (`UpdateCascadeDownCamera` · `UpdateCascadeUpCamera` → `DoCameraTransition`).
  // ⚠️ **프레임이 아니라 몇 칸 떨어졌는가로 갈린다** — 그리고 각을 **적기만 하면 안 돈다.** 층을 갈아
  // 실어도 도는 것은 이어 간다(`distortionEnter`의 층 갈이는 카메라를 안 건드린다)
  for (const cam of cascadeCamerasBetween(run.site, before, run.frame)) {
    turnCamera([cam.angleX, cam.angleY, cam.angleZ], cam.steps)
  }

  if (!run.loaded && run.frame >= run.loadAt) {
    run.loaded = true
    changeFloorTo(run.site.down)
    return
  }
  if (run.frame >= run.total) endCascade(run)
}

/**
 * 폭포가 끝났다 (`..._FinishCascading`).
 *
 * 닿은 칸에 세우고, 그 자리에서 발밑의 판을 **갈래 안 가리고** 잡고
 * (`FindAndPrepareNewCurrentFloatingPlatform(…, INVALID)`), 높이 계산을 켜고 끈다 —
 * 내려간 뒤(B5F 웅덩이, 판 밖)는 **켜고**, 올라간 뒤(B4F 천장)는 **끈다**
 * (`MapObject_SetHeightCalculationDisabled(…, FALSE / TRUE)`, `ov9_02249960.c:8411 · 8708`)
 */
function endCascade(run: Cascading): void {
  const floor = distortionFloor()
  if (floor === null) { cascade = null; return }
  const [wx, wy, wz] = run.from
  const [lx, ly, lz] = toLocalTiles(wx, wy + run.site.finishY, wz)
  const p = worldState.player.position
  p.set(lx + 0.5, ly, lz + 0.5)
  worldState.player.prevPosition.copy(p)
  worldState.player.velocity.set(0, 0, 0)
  markCarried()
  worldState.player.facing = FACING_YAW[DIR.west] ?? worldState.player.facing
  const [nwx, nwy, nwz] = toWorldTiles(p.x, p.y, p.z)
  bindPlatform(findPlatform(floor.platforms, nwx, nwy, nwz))
  setHeightCalc(run.site.down)
  // 다 내려선 자리에서 물소리를 끈다 (`Sound_StopEffect`)
  music.stopEffect(SFX.WATERFALL)
  // 내려간 쪽만 B5F의 승강 발판을 세운다 (`SetPersistedMovingPlatformFlag`)
  if (run.site.down) {
    setState({ platformFlags: state().platformFlags | (1 << CASCADE_B5F_FLAG) })
  }
  // 물살에서 서쪽으로 걸어 나온다 (`..._MoveAway`) — 원작도 폭포 칸 위에 서 있지
  // 않는다. ⚠️ **내려간 뒤는 두 걸음, 올라간 뒤는 세 걸음이다**
  run.away = { start: p.x, frame: 0 }
}

/**
 * 물살에서 걸어 나온다 (`EventCmdCascade*_MoveAway`).
 *
 * 걸음마다 프레임 수가 다르다(`moveAwayFrames`) — 한 걸음이 한 칸이고, 그 칸 안에서는 고르게 간다.
 * 원작이 이동 동작으로 옮기는 것이라 **걸은 칸이 아니다**(`markCarried`)
 */
function tickAway(run: Cascading, away: NonNullable<Cascading['away']>, dt: number): void {
  const frames = run.site.moveAwayFrames
  const total = frames.reduce((a, b) => a + b, 0)
  away.frame = Math.min(total, away.frame + dt * 60)
  let left = away.frame
  let tiles = 0
  for (const f of frames) {
    if (left >= f) { tiles += 1; left -= f; continue }
    tiles += left / f
    break
  }
  const step = DIR_STEP[DIR.west]
  const p = worldState.player.position
  if (step !== undefined) p.x = away.start + step.x * tiles
  worldState.player.prevPosition.copy(p)
  worldState.player.velocity.set(0, 0, 0)
  markCarried()
  if (away.frame < total) return
  if (step !== undefined) p.x = away.start + step.x * run.site.moveAway
  worldState.player.prevPosition.copy(p)
  cascade = null
}

/** 폭포가 층을 간다 (`LoadFloor(FLOOR_LOAD_NEXT | PREVIOUS)`) */
function changeFloorTo(down: boolean): void {
  const floor = distortionFloor()
  const data = distortionData()
  if (floor === null || data === null) return
  const conn = connectionOf(data, floor.map)
  const dest = down ? conn?.next : conn?.prev
  if (dest === undefined) return
  const target = mapOf(data, dest)
  if (target === null) return
  const p = worldState.player.position
  const [wx, wy, wz] = toWorldTiles(p.x, p.y, p.z)
  // 워프가 아니라 층 갈이다 — 세이브를 안 지우고, 판은 풀고, 카메라는 이어 돈다 (`distortionEnter`)
  beginFloorLoad()
  world.pending = {
    to: dest,
    matrix: world.maps?.[dest]?.matrix ?? 0,
    x: wx - target.offsetX,
    z: wz - target.offsetZ,
    y: wy - target.offsetY,
    viaDoor: false,
    silent: true,
  }
}
