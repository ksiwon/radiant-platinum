// 걷기·뛰기·서 있기를 BDSP 클립으로 돌린다 (PLAN §16.5)
//
// 절차형(`actor/gait`)은 관절 열둘을 사인파로 흔드는 것이라 **몸이 한 덩어리로
// 안 움직인다** — 골반이 안 비틀리고 어깨가 안 따라오고 손가락·옷이 굳어 있다.
// 원작 몸에는 사람이 짠 동작이 들어 있으므로 그것을 돌린다.
//
// ⚠️ **클립을 제 빠르기로 돌리지 않는다. 걸은 거리로 돌린다.** 클립은 한 가지
// 빠르기로 짜여 있는데 우리 사람은 속도가 이어져 있다 (걷기 4.5 · 달리기 8m/s,
// NPC는 원작 이동 표). 제 빠르기로 돌리면 발이 땅에서 미끄러진다. 그래서 몸마다
// **클립 한 바퀴에 발이 딛는 거리**를 재 두고(`measureCycle`), 움직인 거리만큼
// 위상을 민다 — 절차형이 보폭에서 위상을 유도하던 것과 같은 약속이다.
//
// ⚠️ **어느 몸이 무엇을 가졌나** (`.audit/probe/walkDonors.mjs` 실측):
//
//   등신 걷기·뛰기(`walk_b`·`run_b`)   주인공 두 벌(`pc0001`·`pc0002`)에만 있다
//   등신 서 있기(`wait_b`)             등신 124벌 전부
//   치비 걷기(`walk_f`)                치비 161벌 중 151
//
// 필드에 서는 트레이너는 등신이라 걷기가 없다. 그래서 **주인공의 걷기를 그 몸으로
// 옮긴다** (`retargetClip`). 치비는 안 옮긴다 — 제 걷기가 있고, 무엇보다 **뼈
// 비율이 딴판이라** 등신 걷기를 씌우면 다리를 접고 앉은 자세가 된다.
//
// 치비 걷기를 등신에 옮기는 길도 재 봤는데 좌우 보폭이 0.95·1.00으로 갈리고
// 골반이 안 오르내린다 — 등신끼리 옮기면 0.547·0.568로 고르다
// (`.audit/probe/walkStride.mjs`).
import {
  AnimationClip, AnimationMixer, LoopRepeat, Quaternion, QuaternionKeyframeTrack, Vector3,
  VectorKeyframeTrack, type AnimationAction, type KeyframeTrack, type Object3D,
} from 'three'
import { Rig as PoseRig, retarget, type Quat, type RigBone } from '../../import/bdsp/retarget'

/** 몸이 갖는 이동 클립 이름. 등신은 `_b`, 치비는 `_f`다 */
const NAMES = {
  wait: ['wait_b', 'wait_f'],
  walk: ['walk_b', 'walk_f'],
  run: ['run_b', 'run_f'],
} as const

export interface GaitClips {
  wait: AnimationClip | null
  walk: AnimationClip
  run: AnimationClip | null
}

function find(clips: readonly AnimationClip[], names: readonly string[]): AnimationClip | null {
  const hit = clips.find((c) => names.includes(c.name))
  return hit ? trimGaitClip(hit) : null
}

/** 클립 목록에서 이동 클립을 고른다. 걷기가 없으면 `null` */
export function pickGaitClips(clips: readonly AnimationClip[]): GaitClips | null {
  const walk = find(clips, NAMES.walk)
  if (walk === null) return null
  return { wait: find(clips, NAMES.wait), walk, run: find(clips, NAMES.run) }
}

/**
 * 서 있는 동작만 고른다. 걷기를 남에게 꿔 오는 몸이 쓴다 — **서 있기는 제 것이
 * 있다** (`wait_b`는 등신 124벌 전부에 들어 있다)
 */
export function pickIdleClip(clips: readonly AnimationClip[]): AnimationClip | null {
  return find(clips, NAMES.wait)
}

/**
 * **회전과 골반 자리만 남긴다.**
 *
 * ⚠️ **크기 트랙을 그냥 두면 치비의 머리가 도로 커진다.** 필드 몸을 등신 옆에
 * 세우려고 머리·손·다리의 **뼈 크기**를 우리가 줄여 놓는데(`model/chibi`의
 * `shapeChibi`), 원작 클립에는 그 뼈들의 크기 트랙이 들어 있어서 클립이 돌기
 * 시작하면 우리가 준 값이 매 프레임 덮인다.
 *
 * 자리 트랙도 골반 말고는 뺀다 — 뼈 길이는 몸마다 다르고, 그 자리는 우리가
 * 정규화로 맞춰 둔 것이다
 */
function trimGaitClip(clip: AnimationClip): AnimationClip {
  const keep = clip.tracks.filter((t) => {
    const { bone, prop } = splitTrack(t)
    return prop === 'quaternion' || (prop === 'position' && bone === PELVIS)
  })
  return keep.length === clip.tracks.length
    ? clip
    : new AnimationClip(clip.name, clip.duration, keep)
}

/** 골반 자리를 옮기는 뼈. 이것만 자리 옮김을 싣는다 */
const PELVIS = 'Waist'

/** 쉬는 자세 한 벌. **클립이나 절차형이 뼈를 건드리기 전에** 떠야 한다 */
export interface RestPose {
  bones: Map<string, RigBone>
  /** 이름 → 쉬는 자리. 골반 높이를 재는 데 쓴다 */
  position: Map<string, Vector3>
}

/**
 * 뼈대의 쉬는 자세를 뜬다.
 *
 * ⚠️ **이름으로 색인한다.** 등신 몸에서 이름이 겹치는 것은 스킨 노드뿐이고
 * (`pc0001_00_baseSkin` 등) 뼈는 하나씩이다 — `Origin` 아래를 훑으면 된다
 */
export function captureRest(root: Object3D): RestPose {
  const bones = new Map<string, RigBone>()
  const position = new Map<string, Vector3>()
  const origin = root.getObjectByName('Origin') ?? root
  origin.traverse((o) => {
    if (!o.name || bones.has(o.name)) return
    const q = o.quaternion
    const parent = o === origin || !o.parent ? null : o.parent.name
    bones.set(o.name, { parent, rest: [q.x, q.y, q.z, q.w] })
    position.set(o.name, o.position.clone())
  })
  return { bones, position }
}

/** 뼈를 떴던 자리로 되돌리려고 떠 두는 한 벌 */
export type PoseSnapshot = Map<Object3D, { q: Quaternion, p: Vector3 }>

/**
 * 지금 자세를 통째로 뜬다.
 *
 * ⚠️ **자리도 뜬다.** 이동 클립은 골반(`Waist`)의 **자리**를 흔드는데, 절차형은
 * 회전만 쓰고 자리는 안 되돌린다 — 안 뜨면 자전거에 올라탄 몸이 그 프레임의
 * 골반 높이에 얹힌 채 굳는다
 */
export function snapshotPose(root: Object3D): PoseSnapshot {
  const snap: PoseSnapshot = new Map()
  root.traverse((o) => { snap.set(o, { q: o.quaternion.clone(), p: o.position.clone() }) })
  return snap
}

/** 떠 둔 자세로 되돌린다. 클립에서 절차형으로 넘어갈 때 한 번 부른다 */
export function restorePose(snap: PoseSnapshot): void {
  for (const [node, { q, p }] of snap) { node.quaternion.copy(q); node.position.copy(p) }
}

/** 트랙 이름 `뼈.속성`을 가른다 */
function splitTrack(track: KeyframeTrack): { bone: string, prop: string } {
  const dot = track.name.lastIndexOf('.')
  return { bone: track.name.slice(0, dot), prop: track.name.slice(dot + 1) }
}

/** 옮긴 클립을 뜨는 간격(초). 원작 클립이 30프레임이다 */
const RETARGET_STEP = 1 / 30

/** `t`가 든 칸과 그 안에서의 비율. 트랙의 시각은 오름차순이다 */
function keyAt(track: KeyframeTrack, t: number): { i: number, j: number, u: number } {
  const times = track.times
  let i = 0
  while (i < times.length - 1 && times[i + 1]! <= t) i++
  const j = Math.min(i + 1, times.length - 1)
  const span = times[j]! - times[i]!
  const u = span > 1e-9 ? Math.min(1, Math.max(0, (t - times[i]!) / span)) : 0
  return { i, j, u }
}

const sampled = new Quaternion()
const other = new Quaternion()

/**
 * 회전 트랙을 `t`에서 뜬다.
 *
 * ⚠️ **선형이 아니라 구면 보간이다.** 사원수를 성분마다 섞으면 도는 속도가
 * 중간에서 처지고, 부호가 뒤집힌 짝(같은 회전인데 −q)을 만나면 반대로 한 바퀴
 * 돈다 — `Quaternion.slerp`이 그 둘을 다 맡는다
 */
function sampleQuat(track: KeyframeTrack, t: number): Quat {
  const { i, j, u } = keyAt(track, t)
  const v = track.values
  sampled.set(v[i * 4]!, v[i * 4 + 1]!, v[i * 4 + 2]!, v[i * 4 + 3]!)
  other.set(v[j * 4]!, v[j * 4 + 1]!, v[j * 4 + 2]!, v[j * 4 + 3]!)
  sampled.slerp(other, u)
  return [sampled.x, sampled.y, sampled.z, sampled.w]
}

/** 자리 트랙을 `t`에서 뜬다 */
function sampleVec(track: KeyframeTrack, t: number): [number, number, number] {
  const { i, j, u } = keyAt(track, t)
  const v = track.values
  return [0, 1, 2].map((c) => {
    const a = v[i * 3 + c]!
    return a + (v[j * 3 + c]! - a) * u
  }) as [number, number, number]
}

/**
 * 한 몸의 클립을 다른 몸으로 옮긴다.
 *
 * 회전은 **쉬는 자세에서 얼마나 돌았는가**만 옮긴다 (`import/bdsp/retarget` —
 * 굽는 쪽이 치비 동작을 옮기는 것과 같은 수식이다). 자리 옮김은 골반 하나만
 * 싣고, **골반 높이의 비로 줄인다** — 키가 작은 몸이 같은 높이로 튀면 발이 뜬다.
 * 두 몸 모두 골반의 부모(`Origin`)가 회전 없이 서 있어서 비율 하나로 된다.
 *
 * 짝이 없는 뼈는 트랙을 안 만든다 — 그 뼈는 제 쉬는 자세로 남는다
 */
export function retargetClip(clip: AnimationClip, from: RestPose, to: RestPose): AnimationClip {
  const source = new PoseRig(from.bones)
  const target = new PoseRig(to.bones)
  const pairs = new Map<string, string>()
  for (const name of to.bones.keys()) if (from.bones.has(name)) pairs.set(name, name)

  const rotations = new Map<string, KeyframeTrack>()
  let pelvis: KeyframeTrack | null = null
  for (const track of clip.tracks) {
    const { bone, prop } = splitTrack(track)
    if (prop === 'quaternion') rotations.set(bone, track)
    else if (prop === 'position' && bone === PELVIS) pelvis = track
  }

  const count = Math.max(2, Math.round(clip.duration / RETARGET_STEP) + 1)
  const times = new Float32Array(count)
  const frames: Map<string, Quat>[] = []
  for (let i = 0; i < count; i++) {
    const t = (clip.duration * i) / (count - 1)
    times[i] = t
    const local = new Map<string, Quat>()
    for (const [bone, track] of rotations) local.set(bone, sampleQuat(track, t))
    frames.push(local)
  }

  const { moved, shared } = retarget(source, target, pairs, frames)
  const tracks: KeyframeTrack[] = []
  for (const bone of shared) {
    if (!rotations.has(bone)) continue
    const values = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      const q = moved[i]!.get(bone)!
      values.set(q, i * 4)
    }
    tracks.push(new QuaternionKeyframeTrack(`${bone}.quaternion`, times, values))
  }

  const fromPelvis = from.position.get(PELVIS)
  const toPelvis = to.position.get(PELVIS)
  if (pelvis && fromPelvis && toPelvis && fromPelvis.y > 1e-6) {
    const k = toPelvis.y / fromPelvis.y
    const values = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const v = sampleVec(pelvis, times[i]!)
      values[i * 3] = toPelvis.x + (v[0] - fromPelvis.x) * k
      values[i * 3 + 1] = toPelvis.y + (v[1] - fromPelvis.y) * k
      values[i * 3 + 2] = toPelvis.z + (v[2] - fromPelvis.z) * k
    }
    tracks.push(new VectorKeyframeTrack(`${PELVIS}.position`, times, values))
  }
  return new AnimationClip(clip.name, clip.duration, tracks)
}

/** 한 바퀴를 재는 표본 수 */
const CYCLE_SAMPLES = 48

/** 클립 한 바퀴를 잰 값. 거리는 **틀(`frame`) 좌표**다 */
interface Cycle {
  /** 한 바퀴(두 걸음)에 몸이 나아가는 거리 */
  distance: number
  /** 왼발이 제일 앞에 나온 위상 (0~1). 걷기와 뛰기의 발을 맞추는 데 쓴다 */
  leftForward: number
}

const at = new Vector3()

/**
 * 클립 한 바퀴에 몸이 나아가는 거리를 잰다.
 *
 * 제자리 클립이라 몸은 안 나아가고 **발이 골반 밑에서 쓸린다.** 디딘 발이 뒤로
 * 가는 그 거리가 곧 몸이 나아간 거리다 (`stanceSlide`).
 *
 * ⚠️ **재는 방법을 세 가지 재 보고 골랐다.** 잣대는 「한 번 디디는 동안 그 발이
 * 땅에서 얼마나 밀렸나」다 (`.audit/probe/gait/view.mjs`가 화면에서 잰다):
 *
 *                              걷기 4.5m/s   뛰기 8m/s
 *   발이 쓸린 폭                0.6~6.8cm     28cm
 *   디딘 발 빠르기의 75% 분위     5~15cm        4~7cm
 *   **디딘 구간만** ← 이것       0~4cm         1.8~5.6cm
 *   (견줌) 절차형 `locomotion`   26~30cm       31~38cm
 *
 * ⚠️ **틀 안에서 잰다.** 정규화 배율과 몸이 돌아선 각이 다 들어간 자리라야
 * 걸은 거리(미터)와 바로 나눌 수 있다. 앞은 틀의 +Z다.
 *
 * 재고 나면 뼈를 떴던 자리로 돌려놓는다.
 */
export function measureCycle(root: Object3D, frame: Object3D, clip: AnimationClip): Cycle | null {
  const left = root.getObjectByName('LToe') ?? root.getObjectByName('LFoot')
  const right = root.getObjectByName('RToe') ?? root.getObjectByName('RFoot')
  if (!left || !right) return null
  const saved = new Map<Object3D, [Quaternion, Vector3, Vector3]>()
  root.traverse((o) => { saved.set(o, [o.quaternion.clone(), o.position.clone(), o.scale.clone()]) })

  const mixer = new AnimationMixer(root)
  const action = mixer.clipAction(clip)
  action.play()
  const feet: { l: Vector3, r: Vector3 }[] = []
  let best = -Infinity, leftForward = 0
  for (let i = 0; i < CYCLE_SAMPLES; i++) {
    const u = i / CYCLE_SAMPLES
    action.time = u * clip.duration
    mixer.update(0)
    root.updateMatrixWorld(true)
    const l = frame.worldToLocal(left.getWorldPosition(at)).clone()
    const r = frame.worldToLocal(right.getWorldPosition(at)).clone()
    feet.push({ l, r })
    if (l.z - r.z > best) { best = l.z - r.z; leftForward = u }
  }
  action.stop()
  mixer.uncacheRoot(root)
  for (const [o, [q, p, s]] of saved) { o.quaternion.copy(q); o.position.copy(p); o.scale.copy(s) }
  root.updateMatrixWorld(true)

  const slides = [stanceSlide(feet.map((f) => f.l)), stanceSlide(feet.map((f) => f.r))]
    .filter((v): v is number => v !== null)
  if (slides.length === 0) return null
  const distance = slides.reduce((a, b) => a + b, 0) / slides.length
  return distance > 1e-4 ? { distance, leftForward } : null
}

/**
 * 발이 땅에 닿았다고 보는 높이 — 그 발이 오르내린 폭의 이만큼 안.
 *
 * 0.10과 0.25를 화면에서 재 봤는데 밀린 거리가 걷기 4.8 대 4.0cm ·
 * 뛰기 3.2 대 5.6cm로 엎치락뒤치락이라 둘 다 쓸 만하다. 넓은 쪽을 쓴다 —
 * 표본이 더 많이 들어와서 한 몸이 어긋나도 덜 흔들린다
 */
const CONTACT_BAND = 0.25

/**
 * 발 하나가 **디딘 동안 뒤로 간 거리로 잰 한 바퀴 거리.** 못 재면 `null`.
 *
 * ⚠️ **이것이 옳은 잣대인 까닭.** 안 미끄러진다는 것은 「디딘 발이 땅에 대해
 * 안 움직인다」이지 「한 바퀴에 발이 쓸린 폭이 걸은 거리와 같다」가 아니다.
 * 걷기는 늘 한 발이 땅에 있어서 둘이 거의 같지만, **뛰기는 두 발이 다 뜨는
 * 구간이 있다** — 그동안에도 몸은 나아가므로 발이 쓸린 폭으로 재면 한 바퀴
 * 거리가 길게 잡히고 클립이 느리게 돌아 디딘 발이 앞으로 끌린다. 실측으로
 * 8m/s에서 한 번 디딜 때 28cm였다 (`.audit/probe/gait/view.mjs`).
 *
 * 그래서 **디딘 구간만** 보고, 그 구간이 한 바퀴에서 차지하는 몫으로 나눠
 * 한 바퀴 거리로 편다.
 */
function stanceSlide(track: readonly Vector3[]): number | null {
  const n = track.length
  const ys = track.map((p) => p.y)
  const lo = Math.min(...ys), hi = Math.max(...ys)
  if (hi - lo < 1e-5) return null
  const on = ys.map((y) => y <= lo + (hi - lo) * CONTACT_BAND)
  // 제일 긴 디딤 구간. 한 바퀴는 고리라 끝에서 처음으로 이어진다
  let best: { at: number, len: number } | null = null
  for (let i = 0; i < n; i++) {
    if (!on[i] || on[(i - 1 + n) % n]) continue
    let len = 1
    while (len < n && on[(i + len) % n]) len++
    if (!best || len > best.len) best = { at: i, len }
  }
  if (!best || best.len < 3) return null
  const from = track[best.at]!, to = track[(best.at + best.len - 1) % n]!
  const slide = from.z - to.z
  return slide > 1e-5 ? (slide * n) / (best.len - 1) : null
}

/** 한 몸이 쓸 이동 클립과 잰 값 */
export interface GaitSet {
  clips: GaitClips
  walk: Cycle
  run: Cycle | null
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * 이동 비중이 따라가는 빠르기(1/초).
 *
 * 속도는 한 프레임에 0에서 걷기로 뛴다(칸 이동). 비중을 그대로 따라 보내면
 * 서 있는 자세에서 걷는 자세로 한 프레임에 튄다. 0.1초쯤이면 섞이는 것이 눈에
 * 안 걸리고 걸음이 늦어 보이지도 않는다
 */
const BLEND_RATE = 10

interface GaitState {
  /** 걷기 위상 (0~1) */
  phase: number
  /** 걷는 비중 (0~1) */
  moving: number
  /** 뛰는 비중 (0~1). 걷는 비중 안에서 나눈다 */
  run: number
}

export const GAIT_REST: GaitState = { phase: 0, moving: 0, run: 0 }

/**
 * 한 프레임을 민다. 렌더러 없이 시험이 재는 자리다.
 *
 * - 서고 걷는 비중은 절차형과 같은 문턱을 쓴다 — 걷기 빠르기의 55% 밑에서는
 *   발이 제자리에서 떠는 것처럼 보인다 (`actor/locomotion`).
 * - 위상은 **걸은 거리 ÷ 한 바퀴 거리**만큼 민다. 한 바퀴 거리는 걷기와 뛰기를
 *   섞은 비중대로 섞는다 — 두 클립이 같은 위상을 공유하므로 섞는 중에도 발이
 *   땅에 붙는다.
 */
export function stepGait(
  s: GaitState, set: Pick<GaitSet, 'walk' | 'run'>, dt: number,
  speed: number, walkSpeed: number, runSpeed: number,
): GaitState {
  const wantMove = clamp01(speed / (walkSpeed * 0.55))
  const wantRun = set.run === null
    ? 0
    : clamp01((speed - walkSpeed) / Math.max(1e-3, runSpeed - walkSpeed))
  const k = 1 - Math.exp(-BLEND_RATE * dt)
  const moving = s.moving + (wantMove - s.moving) * k
  const run = s.run + (wantRun - s.run) * k
  const cycle = set.walk.distance + ((set.run?.distance ?? set.walk.distance) - set.walk.distance) * run
  const phase = (s.phase + (speed * dt) / Math.max(1e-4, cycle)) % 1
  return { phase, moving, run }
}

/**
 * 한 몸에 붙는 이동 클립 재생기.
 *
 * 세 동작을 늘 함께 걸어 두고 비중만 바꾼다. 걷기·뛰기는 **시간을 직접 쓴다**
 * (`timeScale` 0) — 믹서가 시간을 밀면 제 빠르기로 돌아 발이 미끄러진다.
 * 서 있기만 제 빠르기로 돈다.
 */
export class GaitPlayer {
  readonly set: GaitSet
  private readonly mixer: AnimationMixer
  private readonly wait: AnimationAction | null
  private readonly walk: AnimationAction
  private readonly run: AnimationAction | null
  state: GaitState = GAIT_REST

  constructor(root: Object3D, set: GaitSet) {
    this.set = set
    this.mixer = new AnimationMixer(root)
    const start = (clip: AnimationClip | null, scale: number): AnimationAction | null => {
      if (!clip) return null
      const a = this.mixer.clipAction(clip)
      a.setLoop(LoopRepeat, Infinity)
      a.timeScale = scale
      a.play()
      return a
    }
    this.wait = start(set.clips.wait, 1)
    this.walk = start(set.clips.walk, 0)!
    this.run = start(set.clips.run, 0)
  }

  update(dt: number, speed: number, walkSpeed: number, runSpeed: number): void {
    this.state = stepGait(this.state, this.set, dt, speed, walkSpeed, runSpeed)
    const { phase, moving, run } = this.state
    // 서 있기 클립이 없는 몸은 걷기 첫 자세에 비중을 다 준다 — 비중 합이 1에
    // 못 미치면 믹서가 뼈를 원래 값과 섞어서 반쯤 T자로 선다
    const still = this.wait ? 1 - moving : 0
    this.wait?.setEffectiveWeight(still)
    this.walk.setEffectiveWeight(this.run ? moving * (1 - run) : 1 - still)
    this.run?.setEffectiveWeight(moving * run)
    this.walk.time = phase * this.set.clips.walk.duration
    if (this.run && this.set.run) {
      // 뛰기의 왼발이 걷기의 왼발과 같은 때 앞에 오게 위상을 맞춘다
      const u = (phase - this.set.walk.leftForward + this.set.run.leftForward + 1) % 1
      this.run.time = u * this.set.clips.run!.duration
    }
    this.mixer.update(dt)
  }

  dispose(root: Object3D): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(root)
  }
}
