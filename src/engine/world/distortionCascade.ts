// 폭포 — B4F와 B5F를 잇는 **층 이동** (PARITY §6.10).
//
// ⚠️ **연출이 아니다.** 원작 `EventCmdCascadeDown_FinishCascading`이 주인공 자리를
// 옮기고 높이 계산을 되켜고 B5F의 승강 발판 플래그를 세운다. 연결표가 B4F의 다음을
// B5F로 적어 두었고 B4F의 승강 발판 셋은 다 그 층 안에서만 도니, **이것이 그 층에서
// 내려가는 유일한 길**이다.
//
// ⚠️ **자료가 아니라 코드에 박힌 표다** (`sMapEventB4F_Waterfall` ·
// `sMapEventB5F_Waterfall`). 그래서 `tw_arc`를 훑는 추출기에 안 잡혔고, 명령 번호만
// 있고 처리하는 데가 없어 오래 「연출」로 흘려보내고 있었다.
//
// ── 단위 ────────────────────────────────────────────────────────────────────
// ⚠️ **두 필드가 서로 다른 단위다.** 원작이 이렇게 읽는다:
//
//   finalPosOffset   = FX32_ONE * 값          → 값이 **1/16칸**
//   mapLoadPosOffset = (값 << 4) * FX32_ONE   → 값이 **칸**
//   posDelta         = FX32_ONE * 값          → 값이 **1/16칸/프레임**
//
// 승강 경로(`elevatorPaths`)는 셋 다 `<< 4`라 전부 칸이다 — 폭포만 다르다.
//
// 그리고 **판 좌표의 y는 `MapObject_GetY() / 2`다** (`GetPlayerPos`). 마무리 보정이
// `finishingPosFixTileY * 2`인 것이 그 때문이고, 칸으로 되돌리면 ∓42칸이다.
// 그래서 내려가면 170 → 128, 올라가면 128 → 170 — **두 자리가 서로의 목적지**다.
import { MAP } from './distortion'
import { DIR } from '../script/movement'

/** 1칸이 몇 조각인가 (`FX32_ONE` 대 `MAP_OBJECT_TILE_SIZE`) */
export const CASCADE_UNIT = 16

/** 한 폭포의 규칙 */
export interface CascadeSite {
  /** 어느 층에서 */
  map: number
  /** 그 칸 (세계 좌표). z만 범위다 */
  x: number
  y: number
  z0: number
  z1: number
  /** 보고 있어야 하는 쪽 — 원작은 둘 다 `FACE_RIGHT`다 */
  dir: number
  /** 아래로 가는가 (`CASCADE_MOVEMENT_DIR_DOWN`) */
  down: boolean
  /** 프레임마다 옮기는 양 (1/16칸) */
  delta: number
  /** 다 가면 옮겨져 있는 양 (1/16칸) */
  final: number
  /** 여기에 닿으면 다음 층을 부른다 (1/16칸) */
  mapLoad: number
  /** 처음 이만큼은 **절반 속도**다 (`posDelta >>= 1`) */
  slowFrames: number
  /** 끝나고 세계 y에 더하는 값 (칸) */
  finishY: number
  /**
   * 끝나고 물살에서 **서쪽으로** 걸어 나오는 칸 수 (`..._MoveAway`).
   *
   * ⚠️ **내려간 뒤와 올라간 뒤가 다르다** — 내려가면 둘
   * (`WALK_SLOW_WEST` · `WALK_SLOWER_WEST`), 올라가면 셋(151 · 147 · 115)이다.
   * 셋 다 −x고 프레임마다 8 → 4 → 2로 느려진다
   */
  moveAway: number
  /**
   * 몸이 도는 차례 (`RotateMapObject`).
   *
   * ⚠️ **한 번이 아니다.** 내려갈 때 넷이고, **더해 간다** — 원작
   * `ApplyRotationToTarget`이 목표에 각을 더한다. 90 → 58 → 90 → 180이다
   */
  rotations: readonly CascadeRotation[]
  /** 흔들림이 오가는 폭 (1/16칸). 아래는 1, 위는 이 값 */
  bobMax: number
  /** 프레임마다 흔들리는 양 (1/16칸). `CASCADE_*_BOBBING_DELTA / FX32_ONE` */
  bobDelta: number
  /** 카메라가 갈리는 자리. 떨어진 칸 수 순서다 */
  cameras: readonly CascadeCamera[]
}

/**
 * 폭포를 타는 동안 카메라가 갈리는 자리 (`UpdateCascadeDownCamera` ·
 * `UpdateCascadeUpCamera`).
 *
 * ⚠️ **프레임이 아니라 「몇 칸 떨어졌는가」로 갈린다** — 원작이
 * `(currPosOffset.y >> 4) / FX32_ONE`, 곧 옮겨진 양을 칸으로 내린 값을 본다.
 * 내려갈 때는 절반 속도 구간이 있어서 프레임으로 세면 자리가 어긋난다
 */
interface CascadeCamera {
  /** 떨어진(오른) 칸 수가 이 값이 되면 켜진다 */
  atTiles: number
  /** 그때의 각 (`DistWorldCameraAngleTemplate`) */
  angleX: number
  angleY: number
  angleZ: number
  /** 몇 프레임에 걸쳐 옮겨 가는가 (`transitionSteps`) */
  steps: number
  /**
   * 이 전환 동안 흔들림의 **중심**이 옆으로 밀리는 양 (1/16칸).
   *
   * `CASCADE_*_CASCADE_BOBBING_FIX`를 `transitionSteps - 2`로 나눠 프레임마다
   * 더한다 — 물살이 사람을 옆으로 밀었다 되돌리는 것이다
   */
  bobFix: number
}

/** 몸이 한 번 도는 것 (`RotateMapObject(system, playerMapObj, angle, steps)`) */
interface CascadeRotation {
  /**
   * 언제 켜지는가 — `'start'`는 뛰어들 때, 숫자는 **떨어진 칸 수**,
   * `'finish'`는 마지막 한 칸이 남았을 때(`CASCADE_FINISHING_THRESHOLD`)다
   */
  at: number | 'start' | 'finish'
  /** 목표에 **더하는** 각 (도) */
  angle: number
  /** 몇 프레임에 걸쳐 */
  steps: number
}

/**
 * 폭포 둘.
 *
 * 값은 `sMapEventCmdParamsB4F_Waterfall` · `sMapEventCmdParamsB5F_Waterfall`
 * 그대로다. `WATERFALL_B4F_*` · `WATERFALL_B5F_*`가 자리를 준다
 */
export const CASCADES: readonly CascadeSite[] = [
  {
    map: MAP.b4f, x: 104, y: 170, z0: 76, z1: 79, dir: DIR.east, down: true,
    delta: -1, final: -0x298, mapLoad: -0x15 * CASCADE_UNIT,
    slowFrames: 32, finishY: -0x2a, moveAway: 2,
    bobMax: 4, bobDelta: 0.25,
    rotations: [
      { at: 'start', angle: 90, steps: 32 },
      { at: -20, angle: -32, steps: 72 },
      { at: -36, angle: 32, steps: 31 },
      { at: 'finish', angle: 90, steps: 16 },
    ],
    cameras: [
      { atTiles: -20, angleX: 245, angleY: 239, angleZ: 0, steps: 72, bobFix: -4 },
      { atTiles: -36, angleX: 0, angleY: 0, angleZ: 0, steps: 32, bobFix: 4 },
    ],
  },
  {
    map: MAP.b5f, x: 104, y: 128, z0: 76, z1: 79, dir: DIR.east, down: false,
    delta: 8, final: 0x298, mapLoad: 0x14 * CASCADE_UNIT,
    slowFrames: 4, finishY: 0x2a, moveAway: 3,
    bobMax: 4, bobDelta: 0.25,
    rotations: [
      { at: 'start', angle: -90, steps: 4 },
      { at: 'finish', angle: -90, steps: 2 },
    ],
    cameras: [{ atTiles: 20, angleX: 55, angleY: 240, angleZ: 0, steps: 16, bobFix: 0 }],
  },
]

/** 그 칸에서 그쪽을 보고 있으면 폭포다 (`DistWorld_HandlePlayerMoved`) */
export function cascadeAt(
  map: number, x: number, y: number, z: number, dir: number,
): CascadeSite | null {
  for (const c of CASCADES) {
    if (c.map !== map || c.dir !== dir) continue
    if (x === c.x && y === c.y && z >= c.z0 && z <= c.z1) return c
  }
  return null
}

/**
 * `frame`프레임 뒤에 옮겨져 있는 양 (1/16칸).
 *
 * ⚠️ **처음 `slowFrames`는 절반이다.** 원작이 그동안 몸을 90도 돌리면서
 * `posDelta`를 오른쪽으로 한 번 밀어 두고, 끝나면 되돌린다. 홀수 조각이
 * 생기지 않도록 내려가는 쪽(`delta` −1)도 정수로 떨어지게 **반올림 없이** 센다
 */
export function cascadeOffset(site: CascadeSite, frame: number): number {
  const slow = Math.min(frame, site.slowFrames)
  const fast = Math.max(0, frame - site.slowFrames)
  const moved = Math.trunc((slow * site.delta) / 2) + fast * site.delta
  return site.down ? Math.max(moved, site.final) : Math.min(moved, site.final)
}

/** 다 가는 데 걸리는 프레임 */
export function cascadeFrames(site: CascadeSite): number {
  let frame = 0
  while (cascadeOffset(site, frame) !== site.final && frame < 100_000) frame += 1
  return frame
}

/** 다음 층을 부르는 프레임 — 여기서 층이 갈린다 */
export function cascadeLoadFrame(site: CascadeSite): number {
  const reached = (f: number): boolean =>
    (site.down ? cascadeOffset(site, f) <= site.mapLoad : cascadeOffset(site, f) >= site.mapLoad)
  let frame = 0
  while (!reached(frame) && frame < 100_000) frame += 1
  return frame
}

/** 마지막 한 칸이 남는 프레임 (`CASCADE_FINISHING_THRESHOLD`) */
export function cascadeFinishFrame(site: CascadeSite): number {
  let frame = 0
  while (frame < 100_000) {
    if (Math.abs(site.final - cascadeOffset(site, frame)) <= CASCADE_UNIT) return frame
    frame += 1
  }
  return frame
}

/** 그 칸에 처음 드는 프레임 — 카메라와 회전이 여기서 켜진다 */
function tileFrame(site: CascadeSite, atTiles: number): number {
  let frame = 0
  while (frame < 100_000) {
    if (Math.floor(cascadeOffset(site, frame) / CASCADE_UNIT) === atTiles) return frame
    frame += 1
  }
  return frame
}

/** 그 회전이 켜지는 프레임 */
export function cascadeRotationFrame(site: CascadeSite, at: CascadeRotation['at']): number {
  if (at === 'start') return 0
  if (at === 'finish') return cascadeFinishFrame(site)
  return tileFrame(site, at)
}

/**
 * 몸이 얼마나 돌아 있는가 (**도**).
 *
 * ⚠️ **한 번에 90도를 돌고 마는 것이 아니다.** 원작이 `RotateMapObject`를 넷
 * 부르고 목표에 각을 **더한다** — 내려갈 때 0 → 90 → 58 → 90 → 180이다.
 * 부호는 원작 그대로고, 도는 축은 우리 몸의 앞뒤축이다
 */
export function cascadeRoll(site: CascadeSite, frame: number): number {
  let angle = 0
  for (const r of site.rotations) {
    const from = cascadeRotationFrame(site, r.at)
    if (frame <= from) break
    angle += r.angle * (Math.min(frame - from, r.steps) / r.steps)
  }
  return angle
}

/**
 * 물살에 흔들리는 폭 (칸).
 *
 * ⚠️ **몸이 다 누운 뒤에 시작한다** — `InitBobbing`이 `..._RotatePlayer`가
 * 끝나는 자리에 있다. 1에서 `bobMax`까지 갔다가 되돌아오기를 되풀이하는
 * 삼각파다 — 원작이 값이 끝에 닿으면 `delta`의 부호를 뒤집는다
 */
export function cascadeBob(site: CascadeSite, frame: number): number {
  const after = frame - (site.rotations[0]?.steps ?? 0)
  if (after <= 0) return 0
  const span = site.bobMax - 1
  if (span <= 0) return 1 / CASCADE_UNIT
  // 한 왕복이 `span / bobDelta` 프레임의 두 배다
  const half = span / site.bobDelta
  const phase = after % (half * 2)
  const at = phase <= half ? phase : half * 2 - phase
  return (1 + at * site.bobDelta) / CASCADE_UNIT
}

/**
 * 흔들림의 **중심**이 옆으로 밀린 양 (칸).
 *
 * 카메라가 갈릴 때마다 `bobFix`만큼을 `steps - 2`프레임에 나눠 더한다
 * (`bobbingFix += bobbingFixDelta`). 내려갈 때 −4/16칸으로 밀렸다 +4/16칸으로
 * 되돌아오니, 다 지나면 처음 자리다
 */
export function cascadeBobFix(site: CascadeSite, frame: number): number {
  let fix = 0
  for (const c of site.cameras) {
    if (c.bobFix === 0) continue
    const from = tileFrame(site, c.atTiles)
    if (frame <= from) break
    const steps = Math.max(1, c.steps - 2)
    fix += c.bobFix * (Math.min(frame - from, steps) / steps)
  }
  return fix / CASCADE_UNIT
}

/**
 * 그 프레임에 **새로** 켜지는 카메라 (없으면 null).
 *
 * 원작이 `(currPosOffset.y >> 4) / FX32_ONE == atTiles`를 보고 한 번만 켠다
 * (`cameraAngleState++`). 오른쪽으로 미는 것은 내림이라 −305/16도 −20이다 —
 * 그래서 「딱 −320이 되는 프레임」이 아니라 **그 칸에 처음 든 프레임**에 켜진다
 */
export function cascadeCameraAt(site: CascadeSite, frame: number): CascadeCamera | null {
  for (const c of site.cameras) {
    if (tileFrame(site, c.atTiles) === frame) return c
  }
  return null
}
