// DS 입자 공간을 우리 무대에 얹는다 (PARITY §7.3).
//
// 입자 자료의 값은 전부 **원작 배틀의 3D 공간**에서 잰 것이다. 그 공간이
// 무엇인지는 디컴프에 다 적혀 있다 (`src/particle_system.c`):
//
//     카메라  (0, 0, 4)에서 원점을 본다 · 위가 +Y · 원근 화각 45
//
// 그래서 축은 **+X 오른쪽 · +Y 위 · +Z 화면 앞**이고, 배틀러 자리는
// `battle_anim_util.c`가 못 박아 두었다 (원근·평상시):
//
//     내 쪽   (−2.3477, −1.334,  0.0156)     화면 왼쪽 아래, 가까이
//     상대    ( 2.6992,  1.0742, −1.2812)    화면 오른쪽 위, 멀리
//
// ⚠️ **한 배율로는 안 된다 — 원작과 우리의 몸 크기 비율이 다르다.** 원작에서
// 두 배틀러 사이는 5.05단위이고 몸이 3단위쯤이라 **사이가 몸의 1.7배**다.
// 우리 무대는 실측 크기라 사이 4.4m에 몸 중앙값 1.17m — **사이가 몸의 3.8배**다.
// 그래서 「사이」로 배율을 맞추면 입자가 몸보다 두 배 커지고, 「몸」으로 맞추면
// 날아가는 입자가 상대까지 못 간다.
//
// **몸을 고른다** (「읽히는 쪽이 이긴다」). 연출은 포켓몬에 맞춰 그려진 것이고
// 우리 카메라는 기술이 나갈 때 상대를 클로즈업한다 — 경기장 배율로 잡으면
// 불꽃 하나가 화면을 덮는다. 날아가는 거리는 대신 **이미터 앵커**가 나른다:
// 대본이 프레임마다 붙이는 자리(때린 쪽·맞은 쪽·가운데)를 우리 3D 자리에서
// 뽑으므로, 「쓴 쪽에서 터지고 맞은 쪽에서 터진다」는 그대로 읽힌다.
//
// 몸이 3단위라는 것은 이렇게 잰 값이다. 같은 배틀러의 자리가 **픽셀 표와 DS 표
// 양쪽에** 있어서 투영을 풀 수 있다 — 내 쪽 (64,112)·상대 (192,48)이고
// (`battle_anim.h`), 두 식을 같이 풀면 1단위가 깊이로 나눠 117px이다. 배틀러
// 깊이(3.98·5.28)에서 22~29px이고 4세대 배틀 스프라이트 칸이 96px이니 **칸이
// 3.3~4.3단위**다. 같은 배틀러의 다른 앵커들(입 `BEAM1`·눈 `HYPNOSIS`·몸통
// `NORMAL`)이 세로로 0.98·가로로 2.8단위에 흩어져 있는 것도 같은 자를 가리킨다.

/** 세 값짜리 자리·방향 */
export type Vec3 = readonly [number, number, number]

/** 입자를 어디에 붙이는가 (`EMITTER_CB_*`, `moveAnimTable`의 `at`) */
export type SplAnchor = 'attacker' | 'defender' | 'center' | 'generic'

/** 원작 배틀러 자리 (원근·평상시). 배율의 근거로만 쓰고 자리는 우리 것을 쓴다 */
export const DS_BATTLER = {
  mine: [-2.3477, -1.334, 0.0156],
  foe: [2.6992, 1.0742, -1.2812],
} as const

/** 포켓몬 몸이 DS 단위로 몇인가. 위 주석의 실측 */
export const MON_DS = 3

/**
 * 몸 높이(m) → DS 한 단위가 몇 미터인가.
 *
 * ⚠️ **위아래로 묶는다.** 화면에 서는 키가 0.2m(디그다)부터 7.3m(왕구리)까지라
 * 그대로 쓰면 같은 기술이 종에 따라 서른 배씩 벌어져서 같은 기술로 안 보인다 —
 * `moveAnchor`의 `shapeSpan`이 도형에 거는 것과 같은 이유, 같은 폭이다
 */
export function splMetre(meanTall: number): number {
  return Math.min(2.4, Math.max(0.6, meanTall)) / MON_DS
}

const norm = (v: Vec3): Vec3 => {
  const n = Math.hypot(v[0], v[1], v[2])
  return n === 0 ? [0, 0, 1] : [v[0] / n, v[1] / n, v[2] / n]
}

const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** DS 축 셋을 우리 월드 축 셋으로 */
export interface SplBasis {
  /** DS +X — 쓴 쪽에서 맞는 쪽으로 (원작에서 내 쪽 → 상대 쪽이 +X다) */
  ex: Vec3
  /** DS +Y — 위 */
  ey: Vec3
  /** DS +Z — 오른손 좌표계라 `ex × ey`다 (원작도 그렇다) */
  ez: Vec3
}

/**
 * 두 자리에서 축을 세운다.
 *
 * ⚠️ **가로만 본다.** 두 몸의 키가 달라도 +X는 땅과 나란해야 한다 — 안 그러면
 * 큰 놈이 작은 놈을 칠 때 연출이 통째로 기운다
 */
export function splBasis(by: Vec3, at: Vec3): SplBasis {
  const flat: Vec3 = [at[0] - by[0], 0, at[2] - by[2]]
  const ex = Math.hypot(flat[0], flat[2]) === 0 ? ([0, 0, -1] as Vec3) : norm(flat)
  const ey: Vec3 = [0, 1, 0]
  return { ex, ey, ez: cross3(ex, ey) }
}

/**
 * 이미터를 붙일 자리.
 *
 * ⚠️ **`generic`은 때린 쪽이다.** 대본의 `EMITTER_CB_GENERIC`(556벌)이 기본으로
 * 「때린 쪽에서 맞는 쪽으로」를 쓰고(`generic_emitter_callback.c`), 우리 표는
 * 그것과 `EMITTER_CB_NONE`(38벌)을 한 낱말에 담았다 — 뒤엣것은 원작에서 화면
 * 한가운데에 서므로 그만큼은 어긋난다
 */
export function splAnchorAt(at: SplAnchor, by: Vec3, foe: Vec3): Vec3 {
  switch (at) {
    case 'defender': return foe
    case 'center': return [(by[0] + foe[0]) / 2, (by[1] + foe[1]) / 2, (by[2] + foe[2]) / 2]
    default: return by
  }
}

/** DS 벡터를 우리 월드로 (미터). 자리에는 앵커를 더하고 방향에는 안 더한다 */
export function splToWorld(b: SplBasis, v: Vec3, metre: number): Vec3 {
  return [
    (b.ex[0] * v[0] + b.ey[0] * v[1] + b.ez[0] * v[2]) * metre,
    (b.ex[1] * v[0] + b.ey[1] * v[1] + b.ez[1] * v[2]) * metre,
    (b.ex[2] * v[0] + b.ey[2] * v[1] + b.ez[2] * v[2]) * metre,
  ]
}
