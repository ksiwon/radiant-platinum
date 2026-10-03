// 배틀 카메라 (PLAN §7.4)
//
// **카메라는 한 자리에 선다.** 무대 전체가 늘 보이고, 움직이는 것은 포켓몬과
// 기술 연출뿐이다 — 원작 DS가 그렇고, 플레이해 보면 그 이유가 분명하다:
// 기술 한 번에 어깨 너머로 컷했다 돌아오면 무엇을 봐야 할지가 매번 끊긴다.
//
// ⚠️ **자리와 렌즈는 BDSP가 적어 둔 것이다.** 우리가 눈으로 맞춘 값이 아니라
// `Battle/battle_masterdatas`의 `BattleDefaultPlacementData`에서 읽었다
// (PLAN §4.3.1):
//
//   포켓몬   (0, 0, ±2.0~2.5)   크기 1·2·3에 따라 2.0 / 2.2 / 2.5
//   트레이너 (±0.5, 0, ±5.8)   — 우리는 깊이(z)만 쓴다 (`battleBallMotion.trainerStandAt`)
//   카메라   (−2.7, 0.7, 5.0) · 회전 Y 150° · **화각 30** · near 0.3
//
// 그전에는 카메라가 9.95m 밖에 화각 55로 서 있었다. 그때는 무대에 서는 것이
// 3D 모델이 아니라 **도트 한 장**이라 그림이 그려진 각도를 지켜야 했고, 크기도
// 우리가 정하는 값(2.8m)이었다. 지금은 BDSP 모델이 **실측 크기**로 선다 —
// 모부기가 0.397m다. 그 몸을 예전 렌즈로 보면 화면 높이의 4%짜리 점이 된다.

export type Side = 'p1' | 'p2'

/** 좌표 셋. three를 안 쓰는 계층이라 배열로 주고받는다 */
export type Vec3 = readonly [number, number, number]

/**
 * 양쪽이 서는 자리 (`BattleDefaultPlacementData.PokePos`).
 *
 * **z축 대칭**이다 — 내 쪽이 카메라에 가까운 +z, 상대가 −z. 카메라가 옆으로
 * 비껴 서 있어서 화면에서는 원작 DS와 같은 문법이 된다: 내 것이 앞쪽 왼쪽에
 * 크게, 상대가 뒤쪽 오른쪽에 작게.
 *
 * 2.2는 **중간 크기**(`Size 2`)의 값이다. BDSP는 종의 덩치에 따라 2.0·2.2·2.5로
 * 벌리는데, 우리는 아직 한 값을 쓴다
 */
export const SLOT: Readonly<Record<Side, { x: number; z: number }>> = {
  p1: { x: 0, z: 2.2 },
  p2: { x: 0, z: -2.2 },
}

/**
 * 배틀 화각(세로 전각, 도).
 *
 * BDSP의 `MainCamFov` 그대로다. 필드는 55°인데 배틀만 30°로 좁힌다 — 망원으로
 * 당겨야 5.7m 밖에서 0.4m짜리 몸이 화면을 채운다. 파트너 고르는 장면(44°)과
 * 같은 방식으로 `EngineDriver`가 가져간다
 */
export const BATTLE_FOV = 30

/**
 * 카메라가 서는 자리와 보는 자리. **배틀 내내 이 한 벌이다.**
 *
 * ⚠️ **높이만 우리가 올렸다** (BDSP 0.7 → 1.5, 겨누는 곳 0.4). BDSP는 눈높이에서
 * 수평으로 보는데, 그러면 **뒤에 선 상대가 화면 한가운데(960×640에서 y 398)에
 * 떨어져 내 체력판에 가린다** — 우리 체력판은 원작 DS 배치(상대 왼쪽 위 · 나
 * 오른쪽 아래)라 BDSP의 배치와 다르기 때문이다. 조금 내려다보면 먼 쪽이 위로
 * 올라가서 원작 DS의 구도가 그대로 선다: **내 것 (158, 433) · 상대 (643, 293)**
 * 으로 둘 다 판을 안 물린다. 2.2까지 올려 보니 이번에는 하늘과 나무가 화면
 * 밖으로 밀려서 무대가 안 보였다
 */
export const CAMERA: { readonly position: Vec3; readonly look: Vec3 } = {
  position: [2.7, 1.5, 5.0],
  look: [0, 0.4, 0],
}

/**
 * 내 첫 볼이 열린 뒤 겨누는 높이(m) — `CAMERA.look`의 y를 이것으로 낮춘다 (`BattleStage.useBattleCamera`).
 *
 * ⚠️ **등장 장면과 명령 고르는 동안의 구도가 다르다** (I-p02-7 · I-p04-7). 0.4로 겨누면 실내 무대(거리 배율 `cameraFit` 0.88)에서
 * 내 것의 발이 화면 세로 93.4%에 서서 대사창(85.6%부터)이 몸 아래 절반을 덮었고, 풀밭(배율 1)도 85.8%로 대사창 끝에 걸렸다.
 * 0.1이면 0.88에서 81.7% · 1에서 76.2%다. 그런데 0.1로 내내 겨누면 등장 장면에 선 주인공(깊이 0.8 · 키 1.65m)의 머리가 화면
 * 위로 잘린다 — 둘은 한 화면에 같이 안 나오므로 볼이 열린 뒤에 내린다. 원작 값이 아니다(DS 카메라는 안 움직인다)
 */
export const FIGHT_LOOK_Y = 0.1

/**
 * 카메라가 무대 한가운데에서 떨어진 **수평** 거리(m).
 *
 * `battle/arena`의 `cameraFit`이 좁은 무대에서 얼마나 당길지를 이 값으로 잰다
 */
export const SHOT_REACH = Math.hypot(
  CAMERA.position[0] - CAMERA.look[0],
  CAMERA.position[2] - CAMERA.look[2],
)

/** 카메라가 보는 방향에서 뽑은 무대 좌표계. 깊이가 클수록 카메라 쪽(앞)이다 */
const VIEW = (() => {
  const x = CAMERA.position[0] - CAMERA.look[0]
  const z = CAMERA.position[2] - CAMERA.look[2]
  const n = Math.hypot(x, z)
  return { x: x / n, z: z / n }
})()
/** 시선의 오른쪽 */
const LAT = { x: -VIEW.z, z: VIEW.x }

/**
 * 더블에서 두 마리가 벌어지는 방향 (PARITY §2.2).
 *
 * ⚠️ **x축이 아니라 시선의 좌우다.** 카메라가 옆으로 비껴 서 있어서(−2.7, 5.0)
 * x로만 벌리면 한쪽은 앞으로 오고 한쪽은 뒤로 물러난다 — 실제로 찍어 보니
 * 상대 둘이 화면 가운데와 오른쪽 끝으로 갈라졌다. 시선의 좌우로 벌리면 둘이
 * 같은 깊이에 나란히 선다
 */
export const PAIR_DIR: Vec3 = [LAT.x, 0, LAT.z]

/**
 * 짝이 깊이로도 어긋나는 방향 (카메라 쪽이 +).
 *
 * 좌우로만 벌리면 넷이 한 줄로 서서 화면 좌우 끝까지 찬다 — 그 자리에
 * 체력판이 있다. 앞뒤로도 엇갈려야 원작 DS의 **대각선 배치**가 된다
 */
export const PAIR_DEPTH: Vec3 = [VIEW.x, 0, VIEW.z]

/**
 * 짝이 벌어지는 폭과, 짝 둘을 통째로 화면 **왼쪽**으로 미는 양 (PARITY §2.2).
 *
 * ⚠️ **네 값 다 찍어 보고 고른 것이지 원작 값이 아니다.** 원작 DS의 더블 자리는
 * `gBattlerEncounterX`(`battle_anim/ov12_022380BC.c` 25)의 화면 픽셀이고, 우리 싱글 자리는
 * BDSP의 미터 값이라 둘을 한 척도로 잇는 상수가 없다 — 카메라를 거쳐서만 견줄 수 있다.
 *
 * ⚠️ **쪽마다 다르다.** 내 자리는 카메라에서 3.9m, 상대는 7.7m다 — 같은
 * 거리를 밀면 가까운 쪽이 화면에서 **두 배로** 움직여서 한 마리가 밖으로
 * 나간다. 그래서 내 쪽은 대략 절반이다.
 *
 * ⚠️ **왼쪽으로 미는 이유가 체력판이다.** 오른쪽 절반을 판 둘과 명령 창이
 * 쓰므로, 가운데를 기준으로 벌리면 바깥쪽 하나가 늘 판 뒤로 들어간다
 */
const PAIR: Readonly<Record<Side, { spread: number; bias: number }>> = {
  p1: { spread: 0.45, bias: 0.02 },
  p2: { spread: 0.85, bias: 1.35 },
}

/** 더블의 그 자리 발판이 쪽의 가운데에서 `PAIR_DIR`로 벌어지는 양(m). `a`가 오른쪽이다 */
export function pairOffset(slot: `${Side}${'a' | 'b'}`): number {
  const side: Side = slot.startsWith('p1') ? 'p1' : 'p2'
  const sign = slot.endsWith('a') ? -1 : 1
  return PAIR[side].spread * sign + PAIR[side].bias
}

/** 그 점이 카메라 앞으로 얼마나 떨어졌는가(m, 수평). 같은 화면 x로 옮길 때의 척도다 */
export function viewDepth(point: Vec3): number {
  return (CAMERA.position[0] - point[0]) * VIEW.x + (CAMERA.position[2] - point[2]) * VIEW.z
}

/**
 * 그 점이 배틀 카메라의 화면 어디에 서는가 (NDC — 가운데 0, 가장자리 ±1, 위가 +).
 *
 * `fit`은 `BattleStage.useBattleCamera`가 거는 거리 배율이다 — 카메라가 보는 점(`CAMERA.look`)
 * 쪽으로 그만큼 다가가거나 물러난다(실내 무대 0.88 · 더블 ×1.35). `aspect`는 화면의 가로÷세로.
 * 카메라 뒤에 있으면 깊이가 0 이하라 둘 다 무한대로 준다 — 「화면 안」이 아니다. `ly`는 겨누는 높이다(볼이 열린 뒤 `FIGHT_LOOK_Y`)
 */
export function battleNdc(point: Vec3, aspect: number, fit = 1, ly = CAMERA.look[1]): [number, number] {
  const [lx, , lz] = CAMERA.look
  const eye: Vec3 = [
    lx + (CAMERA.position[0] - lx) * fit,
    ly + (CAMERA.position[1] - ly) * fit,
    lz + (CAMERA.position[2] - lz) * fit,
  ]
  const fx = lx - eye[0]
  const fy = ly - eye[1]
  const fz = lz - eye[2]
  const fn = Math.hypot(fx, fy, fz)
  const f = [fx / fn, fy / fn, fz / fn] as const
  // 오른쪽 = 시선 × 위(0,1,0). 카메라가 안 기우니 땅과 나란하다
  const rn = Math.hypot(f[2], f[0])
  const r = [-f[2] / rn, 0, f[0] / rn] as const
  // 위 = 오른쪽 × 시선
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]] as const
  const d = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]] as const
  const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]
  if (!(depth > 0)) return [Infinity, Infinity]
  const half = Math.tan((BATTLE_FOV / 2) * (Math.PI / 180)) * depth
  return [
    (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (half * aspect),
    (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / half,
  ]
}
