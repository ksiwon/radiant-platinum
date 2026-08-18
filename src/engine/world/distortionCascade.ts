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
    slowFrames: 32, finishY: -0x2a,
  },
  {
    map: MAP.b5f, x: 104, y: 128, z0: 76, z1: 79, dir: DIR.east, down: false,
    delta: 8, final: 0x298, mapLoad: 0x14 * CASCADE_UNIT,
    slowFrames: 4, finishY: 0x2a,
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
