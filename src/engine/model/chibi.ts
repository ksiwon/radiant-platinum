// 필드 번들(`fc####`)을 등신 옆에 세울 수 있는 비율로 고친다 (DATA.md §2.16)
//
// BDSP는 필드에 세울 사람을 **머리 큰 치비**로 따로 만들어 두었다. 우리는
// 주인공과 트레이너를 배틀용 등신 모델로 세우므로 나란히 서면 계통이 어긋난다.
// 배틀 번들이 아예 없는 사람이 열넷이라(대부분 이야기 인물) 판때기로 되돌리면
// 오프닝 바로 다음 장면의 엄마가 종잇장이 된다.
//
// ⚠️ **여기는 `NpcModels`만 부른다.** 배틀·오프닝·전당은 `tr`·`pc`만 세운다 —
// 배틀 번들이 끊긴 셋(`tr1026`·`tr1078`·`tr1085`)은 굽힌 것이 아예 없어서
// `trainerModelBundle`이 그 자리에 아무것도 안 준다. 치비가 배틀에 서게 되면
// 여기를 그쪽에서도 불러야 한다.
//
// ⚠️ **뼈를 늘리는 리타깃이 아니다.** 축을 눌러서 얻은 비율이라 팔다리 길이는
// 그대로다. 아래 각 상수에 무엇이 남는지 적어 둔다.
import { Group, Matrix3, Matrix4, Quaternion, Vector3, type Object3D, type SkinnedMesh } from 'three'
import { normalizeModel } from './normalize'

/**
 * 머리뼈를 줄이는 배수.
 *
 * 머리는 목 관절을 원점으로 줄어드니 이음매가 안 벌어지고, 줄어든 만큼 아래
 * 정규화가 몸을 키운다. **키를 먼저 재고 줄여야 한다** — 순서를 바꾸면 줄어든
 * 머리만큼 그 사람이 통째로 작아진다(엄마가 1.47m에서 1.2m가 된다).
 *
 * 값의 근거 — 뼈로 잰 목 높이가 기준이다. 엄마 `fc2005_00`은 목이 키의 44%라
 * **머리가 키의 56%**고, 주인공은 25%다. 머리를 ×k로 줄이고 키를 도로 맞추면
 * 머리 비중은 `0.56k / (0.44 + 0.56k)`가 된다.
 *
 * 치비 열일곱 벌을 다 재니 머리가 키의 **52.2~60.7%**로 한 무리다. 그래서
 * 상수 하나로 족하다 — ×0.2면 전부 주인공(25%) 언저리로 온다:
 *
 *   fc2030 52.2% · fc2005 55.6% · fc2038 60.7%   ← 가장 작은·엄마·가장 큰
 *
 * ⚠️ **화면에 세워 놓고 다시 쟀다.** ×0.2는 머리가 **너무 작았다** — 스킨을
 * 먹인 정점으로 재면 머리 높이가 키의 17.1%인데 등신 셋은 16.0·20.7·21.4%로
 * 평균 19.4%다 (`.audit/probe/chibiFit.mjs`). 배수를 훑어 19.6%가 되는 **×0.24**로
 * 올린다 (`.audit/probe/chibiSweep.mjs`)
 */
export const CHIBI_HEAD = 0.24

/**
 * 머리를 줄인 만큼 늘어나는 배율을 **굵기에는 얼마나 줄까** (0~1).
 *
 * ⚠️ **몸이 굵어지는 자리다.** 머리를 줄이면 그만큼 키가 줄고, 정규화가 키를
 * 도로 맞추려고 몸 전체를 키운다 — ×0.2면 배율이 1.02에서 1.75로 뛴다. 균등
 * 배율이라 굵기도 같이 1.75배가 되어, 주인공 옆에 서면 「몸이 너무 굵다」.
 *
 * 그래서 **늘리는 것은 키 쪽에만 준다.** 굵기(가로·앞뒤)는 BDSP가 만든 그대로
 * 두면(`1`) 몸만 길어져 날렵해진다. `0`이면 예전처럼 균등이다.
 *
 * 실측 — 몸 길이(발~목) 대비 굵기, 주인공과의 배수:
 *
 *              엄마 치비   주인공   배수
 *   허벅지 폭    30.0%     14.6%   2.05
 *   종아리 폭    32.9%     14.8%   2.22
 *
 * 즉 치비는 다리가 두 배 굵다.
 *
 * ⚠️ **여기를 더 조이면 목과 어깨까지 같이 조인다.** 굵은 것은 다리뿐인데
 * 이 값은 몸 전체에 걸린다 — 1.4로 올렸더니 허벅지는 맞았지만 목 둘레가 키의
 * 5.2%(등신 5.8~7.0%)가 되고 어깨 너비가 3.5%(등신 5.0%)로 좁아져서, 머리가
 * 가느다란 목 위에 얹힌 꼴이 됐다. 그래서 **몸통은 `1`로 두고 다리만 따로
 * 조인다** (`CHIBI_LEG`).
 *
 * ⚠️ **길이가 아니라 축을 눌러서 얻은 날렵함이다.** 가로·앞뒤를 누르므로
 * 가로로 뻗은 부위는 그만큼 짧아진다 — 걸을 때 앞뒤로 흔드는 보폭이 좁아 보인다
 */
const CHIBI_SLIM = 1

/**
 * **다리만 더 조이는 배수** — 굵은 것이 다리뿐이라서.
 *
 * BDSP 치비는 허벅지·종아리가 주인공의 두 배 굵다(위 표). 몸 전체를 조여서
 * 맞추면 목과 어깨까지 같이 좁아지므로(`CHIBI_SLIM`), 다리 사슬에만 따로 건다.
 *
 * ⚠️ **뼈의 로컬 단면축에 건다 — 월드 축이 아니다.** 그래야 다리가 앞뒤로
 * 흔들려도 조이는 방향이 다리를 따라 돈다. 다리뼈의 로컬 X가 길이축이고
 * (실측) 단면이 Y·Z다.
 *
 * ⚠️ **맨 위 뼈(`LThigh`)에만 건다.** 종아리·발·발가락은 자식이라 물려받는다 —
 * 마디마다 걸면 사슬을 따라 제곱으로 조인다.
 *
 * 값의 근거 — 허벅지 폭을 등신 셋(8.2·9.3·11.3%)의 한가운데로 가져오는 값이다
 * (`.audit/probe/chibiFit.mjs`가 선 자세로 잰다)
 */
export const CHIBI_LEG = 0.7

/**
 * **위팔의 단면**을 조이는 배수 — 팔이 굵었다 (docs/orders/VISUAL_20260929.md §3).
 *
 * 몸 굵기를 그대로 두는 값(`CHIBI_SLIM`)이 팔에도 가서 치비 위팔이 굵었다. **팔 방향에 수직인 단면**으로 재면
 * (`.audit/probe/npcView.mjs`의 `armFB` · `armLR` — 선 자세 · 위팔에 가장 무겁게 매달린 정점) 키 대비:
 *
 *                   앞뒤    좌우
 *   광휘            0.044   0.046
 *   신사 (외투)     0.076   0.071
 *   리오            0.062   0.055
 *   치비 여섯       0.074~0.113 · 0.073~0.113   ← 조이기 전 (×0.85로 잰 값을 되돌린 것)
 *
 * ×0.68이면 치비가 0.050~0.077로 등신 어른 둘 사이에 온다.
 *
 * ⚠️ **월드 z 폭으로 재면 안 된다** — 선 자세에서 팔이 앞으로 기운 만큼 길이가 섞여 거의 안 줄어 보인다.
 * ⚠️ **앞뒤 축을 월드 방향으로 고르면 안 된다.** 바인드 자세의 팔 비틀림이 몸마다 달라 어떤 몸은 앞뒤 대신 가로가 줄었다.
 * 그래서 **길이축(아래팔뼈 쪽)만 빼고** 단면 둘을 같이 조인다 — 다리와 같은 식이다(`CHIBI_LEG`). 길이는 손대지 않는다
 * (아래 ⛔ 팔 절)
 */
export const CHIBI_ARM = 0.68

/**
 * **발(신발)의 높이 · 폭**을 조이는 배수 — 발이 비정상적으로 컸다.
 *
 * 몸을 세로로 두 배 넘게 세우는 늘림(`CHIBI_GROW`)이 신발까지 늘여서, 치비 발은 높이가 키의 0.119~0.137로 등신 셋
 * (0.064~0.078)의 1.8배 · 폭이 0.096~0.109(등신 0.070~0.106)다. 길이는 0.132~0.150으로 등신(0.140~0.172) 안이라 둔다.
 * 높이 0.128 × 0.55 ≈ 0.070 · 폭 0.101 × 0.85 ≈ 0.086
 */
const CHIBI_FOOT = { up: 0.55, side: 0.85 } as const

/** 뼈의 **길이축** — 자식 뼈가 놓인 로컬 축 (0 · 1 · 2). 자식이 없으면 X */
function lengthAxis(bone: Object3D): number {
  const child = bone.children.find((c) => c.type === 'Bone')
  if (!child) return 0
  const p = child.position
  const a = [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)]
  return a.indexOf(Math.max(...a))
}

/** 위팔 · 발 */
const UPPER_ARM = ['LArm', 'RArm'] as const
const FOOT = ['LFoot', 'RFoot'] as const

/**
 * 뼈의 로컬 축 중 **그 월드 방향에 가장 가까운 것**에 배수를 건다. 바인드 자세에서 정한다 — 뼈마다 로컬 축이 달라서
 * (다리 · 팔은 X가 길이축이지만 발은 다르다) 이름으로 못 박지 않는다. 축은 뼈를 따라 도므로 자세가 바뀌어도 그 부위를 조인다
 */
function squashAlong(bone: Object3D, frame: Object3D, world: Vector3, k: number): void {
  const q = new Quaternion()
  bone.getWorldQuaternion(q)
  const back = new Quaternion()
  frame.getWorldQuaternion(back)
  q.premultiply(back.invert())
  let best = 0, dot = -1
  for (let i = 0; i < 3; i++) {
    const axis = new Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(q)
    const d = Math.abs(axis.dot(world))
    if (d > dot) { dot = d; best = i }
  }
  bone.scale.setComponent(best, bone.scale.getComponent(best) * k)
}

/** 다리 사슬의 맨 위 */
const LEG_ROOT = ['LThigh', 'RThigh'] as const

/**
 * 손뼈를 줄이는 배수.
 *
 * ⚠️ **날렵하게 만들면 손이 커진다.** 위의 세로 늘림(×1.745)이 **아래로 뻗은
 * 것을 다 늘인다** — 팔을 내리고 선 자세에서 손은 길이축이 아래를 향하므로
 * 그대로 1.7배 길어진다. 게다가 치비 손은 원래 벙어리장갑이라 손목보다 넓다.
 * 둘이 겹쳐 「손이 진짜 크다」는 보고를 받았다.
 *
 * 값의 근거 — **스킨을 먹인 정점**(손뼈와 손가락뼈에 매달린 1,580개)을 훑어
 * 화면에 선 채로 왼손 상자를 재고, 같은 방법으로 잰 주인공(`pc0001_00`)의
 * 왼손 `0.116 × 0.144 × 0.113`과 견줬다. 팔을 내린 자세라 **세로가 손 길이**다.
 * 몸(발~목) 길이가 1.09와 1.13으로 거의 같아 그대로 견줄 수 있다:
 *
 *   손뼈    가로 × 세로 × 앞뒤        주인공 대비 (세로·가로·앞뒤)
 *   ×1      0.148 0.347 0.213        2.40  1.28  1.88
 *   ×0.6    0.089 0.208 0.129        1.44  0.77  1.14
 *   **×0.5**  0.074 0.173 0.109      1.20  0.64  0.96
 *   ×0.4    0.059 0.138 0.088        0.96  0.51  0.78
 *
 * 세 축을 곱해 세제곱근을 내면 ×0.557이 주인공 손과 같은 크기다. 어른이라
 * 그보다 조금 크게 잡을 수도 있는데(×0.6이면 1.08배), **눈에 걸리는 것은
 * 길이**라 ×0.5로 둔다 — 길이가 1.20배, 크기 전체로는 0.90배다.
 *
 * 손 상자는 열일곱 벌 중 열다섯이 몸 대비 `32.5 · 18.8~21.2 · 35.8`로 같은
 * 무리다. 나머지 둘은 손에 **물건을 들고 있어서** 크게 나온다(아래 `HELD`).
 *
 * ⚠️ **한 손씩 재야 한다.** 두 손을 한 상자에 넣으면 가로가 손 폭이 아니라
 * 두 손 사이 거리가 되어 주인공 손이 2.76타일로 나온다.
 *
 * ⚠️ **균등 배율이라 자세가 바뀌어도 안 틀어진다.** 머리처럼 축을 갈라
 * 보정하면 팔을 든 자세에서 반대로 눌린다 — 손뼈의 로컬 축은 팔을 따라 돈다.
 *
 * ⚠️ **손목이 원뿔로 좁아진다.** 손은 제 원점(손목)을 중심으로 줄어드는데
 * 팔뚝은 그대로다. 다만 스킨 가중치가 넓게 번져 있어서(손뼈 가중치가 손목
 * 앞뒤 0.08 구간에 걸쳐 0→0.76으로 오른다, 몸 길이의 12%) 단차가 아니라
 * 완만한 테이퍼로 나온다
 */
export const CHIBI_HAND = 0.5

/**
 * 머리를 줄이고 난 키를 **몇 배로 세울까.**
 *
 * ⚠️ **여태 키를 머리카락이 정하고 있었다.** 목표 키가 `상자 높이 ×
 * BDSP_TO_WORLD`였는데 치비의 상자는 머리와 머리카락이 반을 넘게 차지한다 —
 * 그래서 쪽찐 할머니(`fc2016_00`)가 1.525로 제일 크고 어른들은 1.36~1.44로
 * 주인공(1.564)보다도 작았다. 사람의 키를 그 사람의 머리 모양이 정한 것이다.
 *
 * **머리를 줄인 뒤에 재면 그 흔들림이 사라진다.** 실측하면 그 키가
 * 핸섬 0.835 · 엄마 0.854 · 마박사 0.852 · 아이 0.842 · 할머니 0.874로 한
 * 무리다 (`.audit/probe/chibiGrow.mjs`). BDSP 필드 치비는 **몸을 한 벌만 만들어
 * 돌려 쓰고 머리만 갈아 끼우기 때문**이다 — 목 높이가 0.6383·0.6387·0.6409로
 * 소수점 셋째 자리까지 같다. 그래서 그 키에 **상수 하나**를 곱하면 된다.
 *
 * 값의 근거 — 등신 어른 둘(리오 1.749 · 신사 1.788)과 주인공(1.564)의 평균
 * 1.769에 맞춘다: `1.769 / 0.847(어른 셋 평균) = 2.09`. 그러면 어깨선도
 * 등신 어른의 1.368 언저리로 온다.
 *
 * ⚠️ **아기만 몸이 따로다** (목 높이 0.441 · 다리 0.236). 상수를 곱하는 것이라
 * 아기는 어른의 0.75배로 남는다 — 절대 키를 맞추면 아기가 어른이 된다.
 *
 * ⚠️ **아이는 어른과 같은 키로 선다.** BDSP가 아이에게 따로 몸을 안 만들었다 —
 * 아이 치비의 목 높이·다리 길이가 어른과 **같은 값**이고 머리만 크다. 원본에
 * 없는 정보라 여기서는 못 만든다. 아이를 낮추려면 그림마다 키를 적은 표가
 * 따로 있어야 한다 (3D_GAP_AUDIT §3.1)
 */
export const CHIBI_GROW = 2.09

/**
 * 줄인 머리를 **목 위 어디에 얹을까** — 키 대비, 목뼈 관절에서 머리 한가운데까지 (앞 · 위).
 *
 * ⚠️ **목 관절을 원점으로 줄이면 머리가 뒤로 밀리고 목이 길어진다** (docs/orders/VISUAL_20260929.md §3). 치비의 목
 * 관절은 커다란 머리의 **뒤통수 아래**에 있어서, 거기를 중심으로 ×0.24로 줄이면 작은 머리가 어깨선 뒤에 얹히고 목이
 * 길게 드러난다 — 옆에서 보면 턱이 뒤로 빠진 채 목이 가늘게 선다. 배포판에서 「목의 모양 · 자세가 어색하다」로 짚였다.
 *
 * 값의 근거 — 선 자세에서 머리뼈 아래 정점(스킨을 먹인 자리)의 한가운데를 잰 값 (`.audit/probe/npcView.mjs`):
 *
 *              앞      위
 *   광휘      0.036   0.092
 *   신사      0.038   0.088
 *   리오      0.028   0.092     ← 등신 셋. 평균 (0.034, 0.091)
 *   치비 여덟  0.020~0.024 · 0.144~0.151   (옮기기 전 · 목뼈에서 잰 값)
 */
const CHIBI_HEAD_SEAT = { forward: 0.034, up: 0.091 } as const

/** 재는 틀 — 래퍼의 부모(무대에 선 자리)다. 부모가 없으면 월드 */
const WORLD = new Group()
function frameOf(inner: Object3D): Object3D {
  return inner.parent ?? WORLD
}

/** 스킨을 먹인 정점을 `frame` 좌표계로 하나씩. 둘째 인자는 그 정점이 가장 무겁게 매달린 뼈다 */
function eachSkinned(body: Object3D, frame: Object3D, visit: (v: Vector3, bone: Object3D | null) => void): void {
  const toFrame = new Matrix4().copy(frame.matrixWorld).invert()
  const v = new Vector3()
  body.traverse((o) => {
    const mesh = o as SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    const pos = mesh.geometry.getAttribute('position')
    const idx = mesh.geometry.getAttribute('skinIndex')
    const wt = mesh.geometry.getAttribute('skinWeight')
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      mesh.applyBoneTransform(i, v)
      let best = -1, heavy = -1
      for (let k = 0; k < 4; k++) {
        const w = wt.getComponent(i, k)
        if (w > heavy) { heavy = w; best = idx.getComponent(i, k) }
      }
      visit(v.applyMatrix4(mesh.matrixWorld).applyMatrix4(toFrame), mesh.skeleton.bones[best] ?? null)
    }
  })
}

/**
 * 머리의 한가운데 — **머리뼈와 그 아래 뼈(머리카락 · 모자)에 가장 무겁게 매달린 정점**의 평균, `frame` 좌표계로.
 *
 * ⚠️ 「목 관절보다 위」로 고르면 안 된다 — 머리를 내려 앉히면 정점 일부가 문턱 아래로 빠져 한가운데가 도로 위로 뜬다
 */
function headCentroid(body: Object3D, frame: Object3D, head: Object3D): Vector3 | null {
  const under = new Set<Object3D>()
  head.traverse((o) => { under.add(o) })
  const sum = new Vector3()
  let n = 0
  eachSkinned(body, frame, (v, bone) => { if (bone && under.has(bone)) { sum.add(v); n++ } })
  return n > 0 ? sum.divideScalar(n) : null
}

/** 발바닥과 정수리의 높이 — `frame` 좌표계로 */
function standingSpan(body: Object3D, frame: Object3D): { lo: number, hi: number } {
  let lo = Infinity, hi = -Infinity
  eachSkinned(body, frame, (v) => { lo = Math.min(lo, v.y); hi = Math.max(hi, v.y) })
  return hi > lo ? { lo, hi } : { lo: 0, hi: 0 }
}

/**
 * 줄인 머리를 목 위 제자리에 앉힌다 (`CHIBI_HEAD_SEAT`). 머리뼈의 **자리**만 옮긴다 — 클립은 머리뼈 자리 트랙을 안 싣으므로
 * (`engine/actor/clipGait`의 `trimGaitClip`) 걷고 서는 동안에도 그대로다
 */
function seatHead(inner: Object3D, body: Object3D, height: number): void {
  const frame = frameOf(inner)
  frame.updateMatrixWorld(true)
  const toFrame = new Matrix4().copy(frame.matrixWorld).invert()
  for (const head of bonesNamed(body, 'Head')) {
    const neck = head.parent
    if (!neck) continue
    // 두 번 불러도 쌓이지 않게 **원래 자리에서** 옮긴다
    const from = (head.userData.seatFrom as Vector3 | undefined) ?? head.position.clone()
    head.userData.seatFrom = from
    head.position.copy(from)
    frame.updateMatrixWorld(true)
    // 기준은 **목뼈** 관절이다 — 치비는 목뼈 → 머리뼈 사이(목)가 길어서, 머리뼈 관절에서 재면 목이 긴 채로 남는다
    const at = new Vector3().setFromMatrixPosition(neck.matrixWorld).applyMatrix4(toFrame)
    const centre = headCentroid(body, frame, head)
    if (!centre) continue
    // 모델은 +z를 본다(앞). 바라는 자리와 지금 자리의 차를 목뼈 좌표로 옮겨 머리뼈 자리에 더한다
    const want = new Vector3(at.x, at.y + CHIBI_HEAD_SEAT.up * height, at.z + CHIBI_HEAD_SEAT.forward * height)
    const delta = want.sub(centre)
    const frameToNeck = new Matrix3().setFromMatrix4(
      new Matrix4().copy(neck.matrixWorld).invert().multiply(frame.matrixWorld),
    )
    head.position.add(delta.applyMatrix3(frameToNeck))
    frame.updateMatrixWorld(true)
  }
}

/** 이 번들이 치비인가 — 필드용(`fc`)만 그렇다 */
export const isChibi = (tag: string): boolean => /^fc\d/.test(tag)

/** 손가락뼈. 이것만 손과 함께 줄어들면 된다 */
const FINGER = /^[LR]Finger/

/**
 * 손에 매달린 것 중 **같이 줄이면 안 되는 것**을 되돌리는 배수.
 *
 * ⚠️ **손뼈의 자식이 손가락만은 아니다.** 웨이트리스(`fc1026_00`)는 `LHand`
 * 아래에 `Tray`와 그 위의 `BallA`·`BallB`를 달고 있고, 아이돌(`fc1085_00`)은
 * `Mike`를 든다 — 손을 반으로 줄이면 **쟁반과 마이크도 반이 된다.** 열일곱 벌을
 * 훑어 나온 것이 이 둘뿐이고, 나머지는 빈 부착점(`LItem1`·`RItem1`, `fc2040_00`만
 * `LItem`·`RItem`)이라 되돌려도 눈에 보이는 것이 없다.
 *
 * 그래서 손가락이 아닌 자식은 `1 / CHIBI_HAND`로 되돌려 제 크기를 지킨다.
 * 부착점도 함께 되돌리므로, 나중에 그 자리에 무엇을 걸어도 안 쪼그라든다.
 *
 * ⚠️ **자리는 조금 당겨진다.** 자식의 로컬 위치도 부모 배율을 먹으므로 물건이
 * 손목 쪽으로 절반만큼 다가온다. 손이 작아진 만큼 손바닥이 손목에 가까워진
 * 것이라 그대로 둔다
 */
const HELD = 1 / CHIBI_HAND

/**
 * ⛔ **팔은 손대지 않는다.** 한 번 늘였다가 되돌린 자리라 근거를 남긴다.
 *
 * 바인드 포즈(T자세)로 재면 팔이 짧아 보인다 — 어깨~손이 키의 20.0%인데 등신은
 * 30.0·33.1%다. 가로로 누운 팔이 굵기 누름만 받기 때문이다. 그래서 마디를
 * 늘이고 단면을 눌렀는데, **화면에서 사람은 T자세로 안 선다.**
 * `updateLocomotion`이 팔을 내리고(`scene/NpcModels`), 그러면 팔의 길이축이
 * 세로가 되어 받는 배율이 통째로 뒤바뀐다:
 *
 *   자세      팔 길이축   길이가 받는 배율   단면이 받는 배율
 *   T자세     가로        굵기 0.99          세로 2.09 · 앞뒤 0.99
 *   **선 자세**   **세로**    **키 2.09**        **가로·앞뒤 0.99**
 *
 * 선 자세에서는 팔이 다리와 같은 대접을 받는다 — 길이는 키 늘림, 단면은 굵기.
 * 그것이 맞는 대접이고, 실측으로 위팔관절~손이 **24.2%**로 등신
 * 24.7~26.1% 안에 든다. 손대면 오히려 어긋난다 — 마디를 2.1배 늘였더니
 * **47.4~49.1%**가 됐다 (`.audit/probe/armSpan.mjs`가 두 자세를 다 잰다).
 *
 * ⚠️ **비율을 잴 때는 반드시 `updateLocomotion`을 돌리고 재라.** 바인드 포즈로
 * 재면 가로로 뻗은 것이 전부 짧고 굵게 보인다
 */

/** 이 이름을 가진 뼈들. 같은 이름의 메시가 있을 수 있어 뼈만 고른다 */
function bonesNamed(body: Object3D, ...names: readonly string[]): Object3D[] {
  const out: Object3D[] = []
  body.traverse((o) => { if (o.type === 'Bone' && names.includes(o.name)) out.push(o) })
  return out
}

/**
 * 치비 하나를 등신 옆에 설 비율로 세운다. `inner`의 배율과 뼈 배율을 바꾼다.
 *
 * ⚠️ **세울 키를 여기서 정한다.** 부르는 쪽이 잰 상자 높이는 머리카락이 절반을
 * 넘게 차지해서 키로 못 쓴다 (`CHIBI_GROW`). 돌려주는 값이 실제로 선 키다.
 *
 * @param inner        모델을 감싼 래퍼. 정규화가 여기 배율을 건다
 * @param body         복제된 모델 루트
 * @param nativeHeight 손대기 **전에** 잰 원본 키. 굵기를 되돌릴 때만 쓴다
 * @returns            실제로 선 키 (게임 단위)
 */
export function shapeChibi(
  inner: Object3D, body: Object3D, nativeHeight: number,
): number {
  const heads = bonesNamed(body, 'Head')
  for (const bone of heads) {
    bone.scale.setScalar(CHIBI_HEAD)
    // 앞서 앉혀 둔 자리가 있으면 원래 자리로 — 그래야 키를 원본으로 잰다 (`seatHead`)
    const from = bone.userData.seatFrom as Vector3 | undefined
    if (from) bone.position.copy(from)
  }
  // 위팔 단면 · 발 높이와 폭 (`CHIBI_ARM` · `CHIBI_FOOT`). 바인드 자세에서 축을 고르므로 **배율을 먼저 1로** 돌린다 —
  // 두 번 불러도 쌓이지 않는다
  const frame0 = frameOf(inner)
  body.updateMatrixWorld(true)
  for (const arm of bonesNamed(body, ...UPPER_ARM)) {
    arm.scale.setScalar(CHIBI_ARM)
    arm.scale.setComponent(lengthAxis(arm), 1)
  }
  for (const foot of bonesNamed(body, ...FOOT)) {
    foot.scale.setScalar(1)
    squashAlong(foot, frame0, new Vector3(0, 1, 0), CHIBI_FOOT.up)
    squashAlong(foot, frame0, new Vector3(1, 0, 0), CHIBI_FOOT.side)
  }
  for (const hand of bonesNamed(body, 'LHand', 'RHand')) {
    hand.scale.setScalar(CHIBI_HAND)
    // 손가락은 같이 줄어들어야 하고, 든 물건은 제 크기를 지켜야 한다
    for (const child of hand.children) {
      if (child.type === 'Bone' && !FINGER.test(child.name)) child.scale.setScalar(HELD)
    }
  }
  // 머리를 줄인 **뒤에** 키를 잰다 — 그래야 머리카락이 키를 안 정한다
  const shrunk = normalizeModel(inner, body, 1).nativeHeight
  const height = shrunk * CHIBI_GROW
  const fit = normalizeModel(inner, body, height)
  // 머리를 줄인 만큼 몸이 짧아졌고, 정규화가 그만큼 통째로 키웠다. 그 늘림을
  // 굵기에서 도로 뺀다 (`CHIBI_SLIM`)
  const left = fit.nativeHeight / nativeHeight
  const girth = fit.scale * (1 - CHIBI_SLIM * (1 - left))
  inner.scale.x = girth
  inner.scale.z = girth
  // 눌린 만큼 머리는 도로 둥글게 편다.
  // ⚠️ **머리뼈의 로컬 축은 X가 위, Y가 좌우, Z가 앞이다** — 실측했다
  // (바인드에서 X축이 월드 +Y를 가리킨다). 그래서 가로 보정이 y·z로 간다
  const round = (CHIBI_HEAD * fit.scale) / girth
  for (const bone of heads) bone.scale.set(CHIBI_HEAD, round, round)
  // 다리만 따로 조인다. 길이축(로컬 X)은 그대로 두고 단면만 줄인다
  for (const thigh of bonesNamed(body, ...LEG_ROOT)) {
    thigh.scale.set(1, CHIBI_LEG, CHIBI_LEG)
  }
  // 부르는 쪽이 뼈 자리를 월드에서 재므로 바뀐 배율을 먼저 반영한다
  inner.updateMatrixWorld(true)
  seatHead(inner, body, height)
  // 머리를 내려 앉힌 만큼(목이 짧아진 만큼) 키가 준다 — 세로만 도로 맞춘다. 발밑은 래퍼 원점에 그대로 둔다
  // (`normalizeModel`을 다시 부르면 균등 배율로 돌아가 굵기 보정이 지워진다)
  // 세로가 바뀌면 머리를 둥글게 펴는 값도 따라가고, 그러면 키가 또 조금 바뀐다 — 몇 번 되풀이해 맞춘다
  for (let pass = 0; pass < 8; pass++) {
    inner.updateMatrixWorld(true)
    const { lo, hi } = standingSpan(body, frameOf(inner))
    if (hi - lo <= 1e-6) break
    const k = height / (hi - lo)
    inner.scale.y *= k
    // 발바닥을 틀 원점에 다시 붙인다 — 발을 조이면 신발 바닥이 발목 쪽으로 올라가 사람이 뜬다
    inner.position.y *= k
    inner.updateMatrixWorld(true)
    const ground = standingSpan(body, frameOf(inner)).lo
    inner.position.y -= ground
    const again = (CHIBI_HEAD * inner.scale.y) / girth
    for (const bone of heads) bone.scale.set(CHIBI_HEAD, again, again)
    if (Math.abs(k - 1) < 1e-9 && Math.abs(ground) < 1e-9) break
  }
  // 든 물건은 위팔을 조인 배율(`CHIBI_ARM`)까지 물려받는다 — 월드에서 몸통과 같은 배율로 되돌린다
  inner.updateMatrixWorld(true)
  const worldScale = new Vector3()
  for (const hand of bonesNamed(body, 'LHand', 'RHand')) {
    for (const child of hand.children) {
      if (child.type !== 'Bone' || FINGER.test(child.name)) continue
      child.getWorldScale(worldScale)
      child.scale.set(
        child.scale.x * inner.scale.x / worldScale.x,
        child.scale.y * inner.scale.y / worldScale.y,
        child.scale.z * inner.scale.z / worldScale.z,
      )
    }
  }
  inner.updateMatrixWorld(true)
  return height
}
