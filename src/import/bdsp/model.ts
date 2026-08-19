// BDSP 인물·포켓몬 번들 → glTF (PLAN §4.3 · IMPORT.md §12)
//
// 개발 추출기 `tools/extract/bdspGlb.py`를 브라우저로 옮긴 것이다. 계약이 같아야
// 한다 — three가 읽는 파일이 개발판과 공개판에서 달라지면 한쪽에서만 나는 버그를
// 쫓게 된다.
//
// ⚠️ **좌표계를 X 뒤집기 하나로 옮긴다.** Unity는 왼손, glTF는 오른손이고, 그냥
// Z를 뒤집으면(교과서적인 변환) 모델이 glTF 정면인 −Z를 보게 된다. 우리 엔진은
// `facing = atan2(vx, vz)`라 **+Z가 정면**이어야 하고, 그래서 Z 뒤집기 + Y축
// 180° 회전을 합친 것과 같은 X 뒤집기를 쓴다. 손잡이가 뒤집히므로 삼각형 감기
// 순서도 함께 뒤집는다 — 안 뒤집으면 얼굴 안쪽이 보인다.
import { bakeAlbedo, type BakeOptions } from './albedo'
import {
  ARRAY_BUFFER, ELEMENT_BUFFER, FLOAT, GlbBuffer, UINT, USHORT,
  outwardRatio, verifyGlb, writeGlb, type Gltf,
} from './glb'
import { meshFrom, CHANNEL, type MeshData } from './mesh'
import { resource } from './texture'
import { Rig, retarget, roundTripError, type Quat, type RigBone } from './retarget'
import type { Entry, Environment } from './environment'
import type { UnityValue } from './typetree'

export class ModelError extends Error {
  constructor(message: string) { super(message); this.name = 'ModelError' }
}

type Props = Record<string, UnityValue>
const num = (v: UnityValue | undefined, fallback = 0): number => (typeof v === 'number' ? v : fallback)

// ── CRC32 ────────────────────────────────────────────────────────────────────
//
// 애니메이션 바인딩이 가리키는 뼈는 이름이 아니라 **경로의 CRC32**다. 계층을 훑어
// 경로를 만들고 같은 방식으로 해시하면 짝이 맞는다 (실측: 171 중 171)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c >>> 0
  }
  return t
})()

export function crc32(text: string): number {
  const bytes = new TextEncoder().encode(text)
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ── 뼈대 ─────────────────────────────────────────────────────────────────────

interface Bone {
  pathId: number
  name: string
  position: [number, number, number]
  rotation: [number, number, number, number]
  scale: [number, number, number]
  children: number[]
}

/** X 뒤집기를 회전에 옮긴다. 축의 X만 남고 Y·Z가 뒤집힌다 */
const flipQuat = (q: readonly number[]): [number, number, number, number] =>
  [q[0]!, -q[1]!, -q[2]!, q[3]!]

/**
 * 유니티 오일러 커브(도) → 사원수.
 *
 * ⚠️ 유니티는 **ZXY** 차례로 돌린다 (`Quaternion.Euler`가 그렇다) — 차례를 바꾸면
 * 같은 각도가 다른 자세가 된다
 */
export function eulerToQuat(deg: readonly number[]): [number, number, number, number] {
  const hx = (deg[0]! * Math.PI) / 360
  const hy = (deg[1]! * Math.PI) / 360
  const hz = (deg[2]! * Math.PI) / 360
  const sx = Math.sin(hx)
  const cx = Math.cos(hx)
  const sy = Math.sin(hy)
  const cy = Math.cos(hy)
  const sz = Math.sin(hz)
  const cz = Math.cos(hz)
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]
}

/** GameObject 이름. 못 읽으면 `bone` */
function boneName(env: Environment, transform: Props): string {
  const pid = num((transform.m_GameObject as Props | undefined)?.m_PathID)
  const v = env.read(pid) as Props | null
  return (v?.m_Name as string | undefined) ?? 'bone'
}

function readBones(env: Environment): Bone[] {
  const raw: { o: { pathId: number }, v: Props }[] = []
  for (const e of env.ofType('Transform')) {
    const v = env.readEntry(e) as Props | null
    if (v) raw.push({ o: e.object, v })
  }
  const index = new Map(raw.map(({ o }, i) => [o.pathId, i]))
  return raw.map(({ o, v }) => {
    const p = (v.m_LocalPosition ?? {}) as Props
    const r = (v.m_LocalRotation ?? {}) as Props
    const s = (v.m_LocalScale ?? {}) as Props
    const kids: number[] = []
    for (const c of (v.m_Children as Props[] | undefined) ?? []) {
      const at = index.get(num(c.m_PathID))
      if (at !== undefined) kids.push(at)
    }
    return {
      pathId: o.pathId,
      name: boneName(env, v),
      // X 뒤집기
      position: [-num(p.x), num(p.y), num(p.z)],
      rotation: flipQuat([num(r.x), num(r.y), num(r.z), num(r.w, 1)]),
      scale: [num(s.x, 1), num(s.y, 1), num(s.z, 1)],
      children: kids,
    }
  })
}

/** Transform PathID → 애니메이터 루트 기준 경로. CRC32의 재료다 */
function transformPaths(bones: readonly Bone[]): Map<number, string> {
  const at = new Map(bones.map((b, i) => [b.pathId, i]))
  const parent = new Map<number, number>()
  bones.forEach((b, i) => { for (const c of b.children) parent.set(c, i) })
  const out = new Map<number, string>()
  bones.forEach((b, i) => {
    const parts: string[] = []
    let cur: number | undefined = i
    while (cur !== undefined) {
      parts.push(bones[cur]!.name)
      cur = parent.get(cur)
    }
    // 맨 위(애니메이터가 붙은 루트)는 경로에 안 들어간다
    out.set(b.pathId, parts.length > 1 ? parts.slice(0, -1).reverse().join('/') : '')
  })
  void at
  return out
}

// ── 애니메이션 ───────────────────────────────────────────────────────────────
//
// 커브 번호는 **한 줄로 이어진다**: 스트림 → 조밀 → 상수 순서다. 바인딩 목록이
// 그 줄을 순서대로 나눠 갖는데, 자리 옮김이 3칸·회전이 4칸·크기가 3칸이다.

const TRANSLATION = 1
const ROTATION = 2
const SCALE = 3
const EULER = 4
/**
 * ⚠️ **오일러(4)를 빼먹으면 그 클립이 통째로 어긋난다.** 커브 번호는 바인딩을
 * 훑으며 폭만큼 더해 가는 자리 번호라, 폭 3짜리를 1로 세면 **그 뒤의 모든 채널이
 * 두 칸씩 밀린다.** 포켓몬 대기 동작에서 바인딩 97개 중 여섯이 오일러고, 그래서
 * 뼈가 100m 밖으로 날아갔다 — 화면에는 아무것도 안 보였다
 */
const CURVE_WIDTH: Readonly<Record<number, number>> = {
  [TRANSLATION]: 3, [ROTATION]: 4, [SCALE]: 3, [EULER]: 3,
}
const TRANSFORM_CLASS = 4

type Curve = { time: number, value: number }[]

const asFloat = (word: number): number => {
  const b = new ArrayBuffer(4)
  new DataView(b).setUint32(0, word >>> 0, true)
  return new DataView(b).getFloat32(0, true)
}

/**
 * 스트림 클립을 커브별 (시각, 값)으로 편다.
 *
 * 한 프레임이 `시각 · 키 개수 · (커브번호 + 계수 4)×n`이다. 계수 넷 중 **마지막이
 * 값**이고 셋째가 나가는 기울기다 — 값만 쓰고 glTF 쪽에서 선형으로 잇는다.
 *
 * ⚠️ **앞뒤 프레임은 버린다.** Unity가 경계 처리를 위해 앞에 둘, 뒤에 하나를 더
 * 넣어 두는데 시각이 음수이거나 클립 길이를 넘는다. 그대로 쓰면 애니메이션이
 * 시작 전부터 튄다
 */
export function readStreamed(words: readonly number[]): Map<number, Curve> {
  const frames: { time: number, keys: { index: number, value: number }[] }[] = []
  let i = 0
  const n = words.length
  while (i + 2 <= n) {
    const time = asFloat(words[i]!)
    i++
    const count = words[i]!
    i++
    if (count < 0 || i + count * 5 > n) break
    const keys: { index: number, value: number }[] = []
    for (let k = 0; k < count; k++) {
      const index = words[i]!
      i++
      keys.push({ index, value: asFloat(words[i + 3]!) })
      i += 4
    }
    frames.push({ time, keys })
  }
  const out = new Map<number, Curve>()
  const use = frames.length > 3 ? frames.slice(2, -1) : frames
  for (const f of use) {
    for (const k of f.keys) {
      let c = out.get(k.index)
      if (!c) { c = []; out.set(k.index, c) }
      c.push({ time: f.time, value: k.value })
    }
  }
  return out
}

/** 클립 하나의 모든 커브. 상수 커브는 시각 0에 값 하나만 둔다 */
function clipCurves(clip: Props): { curves: Map<number, Curve>, stop: number } {
  const muscle = (clip.m_MuscleClip ?? {}) as Props
  const data = ((muscle.m_Clip as Props | undefined)?.data ?? {}) as Props
  const streamed = (data.m_StreamedClip ?? {}) as Props
  const dense = (data.m_DenseClip ?? {}) as Props
  const constant = ((data.m_ConstantClip as Props | undefined)?.data ?? []) as number[]

  const curves = readStreamed((streamed.data as number[] | undefined) ?? [])
  const base = num(streamed.curveCount)
  const frames = num(dense.m_FrameCount)
  const wide = num(dense.m_CurveCount)
  const rate = num(dense.m_SampleRate) || 60
  const begin = num(dense.m_BeginTime)
  const samples = (dense.m_SampleArray as number[] | undefined) ?? []
  for (let c = 0; c < wide; c++) {
    const curve: Curve = []
    for (let f = 0; f < frames; f++) curve.push({ time: begin + f / rate, value: samples[f * wide + c] ?? 0 })
    curves.set(base + c, curve)
  }
  constant.forEach((value, c) => { curves.set(base + wide + c, [{ time: 0, value }]) })
  return { curves, stop: num(muscle.m_StopTime) }
}

/** (경로해시, 속성, 첫 커브 번호). Transform이 아닌 바인딩은 뺀다 */
function bindingsByCurve(clip: Props): { hash: number, attr: number, first: number }[] {
  let at = 0
  const out: { hash: number, attr: number, first: number }[] = []
  const constant = (clip.m_ClipBindingConstant ?? {}) as Props
  for (const b of (constant.genericBindings as Props[] | undefined) ?? []) {
    const attr = num(b.attribute)
    if (num(b.typeID) === TRANSFORM_CLASS && attr in CURVE_WIDTH) {
      out.push({ hash: num(b.path), attr, first: at })
      at += CURVE_WIDTH[attr]!
    } else {
      at += 1
    }
  }
  return out
}

/** 커브 하나를 시각 `t`에서. 사이는 선형, 밖은 끝값으로 잡는다 */
function sampleCurve(points: Curve, t: number): number {
  if (points.length === 0) return 0
  if (t <= points[0]!.time) return points[0]!.value
  const last = points[points.length - 1]!
  if (t >= last.time) return last.value
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid]!.time <= t) lo = mid
    else hi = mid
  }
  const a = points[lo]!
  const b = points[hi]!
  const k = b.time === a.time ? 0 : (t - a.time) / (b.time - a.time)
  return a.value + (b.value - a.value) * k
}

export interface AnimStat {
  clips: number
  channels: number
  unresolved: number
  keys: number
  skipped: number
}

function buildAnimations(
  env: Environment, buf: GlbBuffer, nodeOfHash: Map<number, number>, keep: RegExp | null,
): { animations: Record<string, unknown>[], stat: AnimStat } {
  const animations: Record<string, unknown>[] = []
  const stat: AnimStat = { clips: 0, channels: 0, unresolved: 0, keys: 0, skipped: 0 }
  for (const e of env.ofType('AnimationClip')) {
    const clip = env.readEntry(e) as Props | null
    if (!clip) continue
    const name = (clip.m_Name as string | undefined) ?? ''
    if (keep && !keep.test(name)) { stat.skipped++; continue }
    const { curves } = clipCurves(clip)
    const samplers: Record<string, unknown>[] = []
    const channels: Record<string, unknown>[] = []
    for (const { hash, attr, first } of bindingsByCurve(clip)) {
      const node = nodeOfHash.get(hash)
      if (node === undefined) { stat.unresolved++; continue }
      let wide = CURVE_WIDTH[attr]!
      const parts: Curve[] = []
      for (let c = 0; c < wide; c++) parts.push(curves.get(first + c) ?? [])
      const set = new Set<number>()
      for (const p of parts) for (const k of p) set.add(k.time)
      let times = [...set].sort((a, b) => a - b)
      if (times.length === 0) continue
      // 상수뿐인 채널은 키 하나면 된다 — 붙박이인데 프레임을 다 적을 이유가 없다
      if (times.length === 1) times = [0]
      let values = times.map((t) => parts.map((p) => sampleCurve(p, t)))
      if (attr === TRANSLATION) values = values.map((v) => [-v[0]!, v[1]!, v[2]!])
      else if (attr === ROTATION) values = values.map((v) => [...flipQuat(v)])
      else if (attr === EULER) { values = values.map((v) => [...flipQuat(eulerToQuat(v))]); wide = 4 }

      const aTime = buf.add(Float32Array.from(times), 'SCALAR', FLOAT)
      const aVal = buf.add(Float32Array.from(values.flat()), wide === 3 ? 'VEC3' : 'VEC4', FLOAT)
      samplers.push({ input: aTime, output: aVal, interpolation: 'LINEAR' })
      channels.push({
        sampler: samplers.length - 1,
        target: {
          node,
          path: attr === TRANSLATION ? 'translation' : attr === SCALE ? 'scale' : 'rotation',
        },
      })
      stat.keys += times.length
    }
    if (channels.length === 0) continue
    animations.push({ name, samplers, channels })
    stat.clips++
    stat.channels += channels.length
  }
  return { animations, stat }
}

// ── 빌려 온 클립 ─────────────────────────────────────────────────────────────

export interface BorrowStat {
  /** 옮겨 온 클립 수 */
  borrowed: number
  /** 그 클립들이 모는 채널을 다 더한 것 */
  channels: number
  /** 한 클립이 몬 뼈의 최대 수 */
  bones: number
  /** 왕복 오차. 0에서 멀어지면 수식이 틀린 것이다 */
  roundTrip: number
  /** 이름이 겹쳐서 어느 뼈인지 모를 자리. **짐작하지 않고 빼고 센다** */
  ambiguous: number
}

/** 경로의 마지막 칸. 짝을 짓는 이름이다 */
const leafOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** 경로의 첫 칸. 클립이 어느 갈래를 모는지 가른다 */
const topOf = (path: string): string => {
  const cut = path.indexOf('/')
  return cut === -1 ? path : path.slice(0, cut)
}

/** 뼈들을 경로로 색인한 리그로. 회전은 **X 뒤집기 전**으로 되돌린다 */
function rigOf(bones: readonly Bone[]): { rig: Rig, pathOf: Map<number, string> } {
  const pathOf = transformPaths(bones)
  const parentOf = new Map<number, number>()
  bones.forEach((b, i) => { for (const c of b.children) parentOf.set(c, i) })
  const map = new Map<string, RigBone>()
  bones.forEach((b, i) => {
    const path = pathOf.get(b.pathId)
    if (path === undefined) return
    const up = parentOf.get(i)
    const parent = up !== undefined ? pathOf.get(bones[up]!.pathId) ?? null : null
    // ⚠️ `flipQuat`는 제 자신이 역이다 — `readBones`가 이미 뒤집어 둔 것을 한 번
    // 더 걸어 유니티 원래 값으로 돌려놓는다. 클립 커브가 원시 값이라 둘을 같은
    // 자리에서 섞어야 하고, 뒤집기는 **마지막에 한 번만** 건다
    map.set(path, { parent, rest: flipQuat(b.rotation) })
  })
  return { rig: new Rig(map), pathOf }
}

/**
 * 다른 몸의 클립을 이 몸으로 옮겨 온다 (`retarget.ts` 머리말).
 *
 * 이름이 같은 뼈만 옮기고 나머지는 타깃의 쉬는 자세로 둔다 — **지어내지 않는다.**
 *
 * ⚠️ **짝을 지을 때 클립이 실제로 모는 갈래로 좁힌다.** 치비 번들은 자전거·
 * 낚싯대·탈것이 제 안에 사람 뼈대를 한 벌씩 더 들고 있어서, 이름만 보면
 * `RItem1`처럼 쉬는 자세까지 다른 뼈를 집는다 (실측: 겹치는 117쌍 중 116쌍은
 * 자세가 같고 한 쌍이 1.0000 다르다). 클립 56개의 바인딩 16,305건이 전부
 * `Origin` 갈래 하나에 떨어지고 그 안에서는 이름이 126종에 126개라, 그 갈래로
 * 좁히면 짝짓기가 확정된다
 */
function borrowedClips(
  donor: Environment, buf: GlbBuffer, bones: readonly Bone[],
  boneAt: ReadonlyMap<number, number>, only: ReadonlySet<string>,
): { animations: Record<string, unknown>[], stat: BorrowStat } {
  const source = rigOf(readBones(donor))
  const target = rigOf(bones)
  const hashOf = new Map<number, string>()
  for (const path of source.pathOf.values()) hashOf.set(crc32(path), path)

  /** 타깃 이름 → 그 뼈의 경로와 glTF 노드 번호 */
  const targetByName = new Map<string, { path: string, node: number }>()
  for (const b of bones) {
    const path = target.pathOf.get(b.pathId)
    const node = boneAt.get(b.pathId)
    if (path === undefined || path === '' || node === undefined) continue
    const leaf = leafOf(path)
    if (!targetByName.has(leaf)) targetByName.set(leaf, { path, node })
  }

  const animations: Record<string, unknown>[] = []
  const stat: BorrowStat = { borrowed: 0, channels: 0, bones: 0, roundTrip: 0, ambiguous: 0 }
  for (const e of donor.ofType('AnimationClip')) {
    const clip = donor.readEntry(e) as Props | null
    if (!clip) continue
    const name = (clip.m_Name as string | undefined) ?? ''
    if (only.size > 0 && !only.has(name)) continue
    const { curves } = clipCurves(clip)

    /** 소스 경로 → 회전 커브 넷 */
    const rots = new Map<string, Curve[]>()
    /** 이 클립이 실제로 모는 갈래 */
    const branches = new Set<string>()
    for (const { hash, attr, first } of bindingsByCurve(clip)) {
      const path = hashOf.get(hash)
      if (path === undefined) continue
      branches.add(topOf(path))
      if (attr !== ROTATION) continue
      const parts: Curve[] = []
      for (let c = 0; c < 4; c++) parts.push(curves.get(first + c) ?? [])
      rots.set(path, parts)
    }
    const stamps = new Set<number>()
    for (const parts of rots.values()) for (const p of parts) for (const k of p) stamps.add(k.time)
    const times = [...stamps].sort((a, b) => a - b)
    if (times.length < 2) continue

    // 그 갈래 안에서만 이름을 짝짓는다. 같은 이름이 둘이면 **버린다**
    const byName = new Map<string, string | null>()
    for (const path of source.rig.bones.keys()) {
      if (path === '' || !branches.has(topOf(path))) continue
      const leaf = leafOf(path)
      byName.set(leaf, byName.has(leaf) ? null : path)
    }
    /** 타깃 경로 → 소스 경로 */
    const pairs = new Map<string, string>()
    for (const [leaf, from] of byName) {
      if (from === null) { stat.ambiguous++; continue }
      const to = targetByName.get(leaf)
      if (to) pairs.set(to.path, from)
    }
    if (pairs.size === 0) continue

    const frames = times.map((t) => {
      const frame = new Map<string, Quat>()
      for (const [path, parts] of rots) {
        frame.set(path, [
          sampleCurve(parts[0]!, t), sampleCurve(parts[1]!, t),
          sampleCurve(parts[2]!, t), sampleCurve(parts[3]!, t),
        ])
      }
      return frame
    })
    const { moved, shared } = retarget(source.rig, target.rig, pairs, frames)
    // 첫 네 프레임이면 넉넉하다 — 수식이 틀리면 한 프레임에서 바로 벌어진다
    stat.roundTrip = Math.max(
      stat.roundTrip, roundTripError(source.rig, target.rig, pairs, frames.slice(0, 4)),
    )

    const samplers: Record<string, unknown>[] = []
    const channels: Record<string, unknown>[] = []
    const aTime = buf.add(Float32Array.from(times), 'SCALAR', FLOAT)
    for (const path of shared) {
      const node = targetByName.get(leafOf(path))?.node
      if (node === undefined) continue
      const values: number[] = []
      for (const frame of moved) values.push(...flipQuat(frame.get(path) ?? [0, 0, 0, 1]))
      const aVal = buf.add(Float32Array.from(values), 'VEC4', FLOAT)
      samplers.push({ input: aTime, output: aVal, interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node, path: 'rotation' } })
    }
    if (channels.length === 0) continue
    animations.push({ name, samplers, channels })
    stat.borrowed++
    stat.channels += channels.length
    stat.bones = Math.max(stat.bones, channels.length)
  }
  return { animations, stat }
}

// ── 내보내기 ─────────────────────────────────────────────────────────────────

export interface ExportOptions extends BakeOptions {
  /** 애니메이션을 실을 것인가. 오버월드 NPC는 안 싣는다 (걷기는 엔진이 만든다) */
  keepClips?: boolean
  /** 이름이 맞는 클립만. 포켓몬은 배틀용(`^ba`)만 쓴다 */
  clipFilter?: RegExp | null
  /**
   * 이 번들의 클립을 뼈 이름으로 옮겨 온다 (치비 → 등신).
   *
   * 주인공의 필드 동작이 등신 몸에 없어서 쓴다 — 수식은 `retarget.ts`에 있다
   */
  clipsFrom?: Environment | null
  /** 옮겨 올 클립 이름들. 비우면 전부 */
  borrowOnly?: ReadonlySet<string> | null
}

export interface ExportStat {
  meshes: number
  dropped: number
  vertices: number
  triangles: number
  bones: number
  materials: number
  bytes: number
  outward: number
  height: number
  anim: AnimStat
  /** 다른 몸에서 옮겨 온 클립. 안 옮겼으면 없다 */
  borrow?: BorrowStat
  problems: string[]
}

export interface ExportResult {
  glb: Uint8Array
  stat: ExportStat
}

/**
 * 번들 하나(또는 여럿을 합친 파일 하나)를 glb로.
 *
 * ⚠️ **뼈대를 껍데기의 본 목록에서 만들면 안 된다.** 애니메이션은 스킨에 안
 * 들어간 Transform(`Origin` 같은 중간 마디)도 움직인다 — 그것들이 노드에 없으면
 * 채널이 갈 곳을 잃는다. 그래서 번들의 Transform 전부로 세운다
 */
export async function exportModel(
  env: Environment,
  encodePng: (rgba: Uint8Array, width: number, height: number) => Promise<Uint8Array>,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const smrs: { e: Entry, v: Props }[] = []
  for (const e of env.ofType('SkinnedMeshRenderer')) {
    const v = env.readEntry(e) as Props | null
    if (v) smrs.push({ e, v })
  }
  if (smrs.length === 0) throw new ModelError('SkinnedMeshRenderer가 없다')

  const buf = new GlbBuffer()
  const bones = readBones(env)
  const boneAt = new Map(bones.map((b, i) => [b.pathId, i]))
  const nodes: Record<string, unknown>[] = bones.map((b) => ({
    name: b.name,
    translation: b.position,
    rotation: b.rotation,
    scale: b.scale,
    ...(b.children.length ? { children: b.children } : {}),
  }))
  const child = new Set(bones.flatMap((b) => b.children))
  const roots = bones.map((_, i) => i).filter((i) => !child.has(i))
  const nodeOfHash = new Map<number, number>()
  for (const [pid, path] of transformPaths(bones)) {
    const at = boneAt.get(pid)
    if (at !== undefined) nodeOfHash.set(crc32(path), at)
  }

  // 알베도는 번들 통째로 한 번만 굽는다
  const baked = bakeAlbedo(env, options)
  const images: Record<string, unknown>[] = []
  const textures: Record<string, unknown>[] = []
  const materials: Record<string, unknown>[] = []
  const samplers: Record<string, unknown>[] = []
  const materialOf = new Map<string, number>()
  for (const m of baked) {
    const png = await encodePng(m.pixels, m.width, m.height)
    images.push({ bufferView: buf.view(png), mimeType: 'image/png', name: m.name })
    const want = { wrapS: m.look.wrap[0], wrapT: m.look.wrap[1] }
    let sampler = samplers.findIndex((s) => s.wrapS === want.wrapS && s.wrapT === want.wrapT)
    if (sampler < 0) { samplers.push(want); sampler = samplers.length - 1 }
    textures.push({ source: images.length - 1, sampler })
    materials.push({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorTexture: { index: textures.length - 1 },
        metallicFactor: 0,
        roughnessFactor: 0.85,
      },
      alphaMode: m.look.alpha,
      ...(m.look.alpha === 'MASK' ? { alphaCutoff: 0.5 } : {}),
      doubleSided: m.look.double,
    })
    materialOf.set(m.name, materials.length - 1)
  }
  const lookOf = new Map(baked.map((m) => [m.name, m.look]))

  const meshes: Record<string, unknown>[] = []
  const skins: Record<string, unknown>[] = []
  const seenMesh = new Set<number>()
  let dropped = 0
  let vertexTotal = 0
  let triangleTotal = 0
  let outwardSum = 0
  let outwardCount = 0
  let lowest = Infinity
  let highest = -Infinity

  for (const { v } of smrs) {
    // ⚠️ **껍데기가 겹쳐 들어오는 종이 있다.** 독침붕은 SMR이 다섯인데 날개 두
    // 벌이 같은 메시를 두 번 가리킨다 — 두 번 쓰면 정점이 두 배가 된다
    const meshPid = num((v.m_Mesh as Props | undefined)?.m_PathID)
    if (meshPid && seenMesh.has(meshPid)) { dropped++; continue }
    const meshEntry = env.entryOf(meshPid)
    if (!meshEntry || meshEntry.type !== 'Mesh') { dropped++; continue }
    const meshValue = env.read(meshPid) as Props | null
    if (!meshValue) { dropped++; continue }
    if (meshPid) seenMesh.add(meshPid)
    let mesh: MeshData
    // ⚠️ 큰 메시는 정점 자료가 `.resS`에 나가 있다 (`meshFrom`)
    const holder = env.bundleOf(meshPid)
    try {
      mesh = meshFrom(meshValue, (p) => (holder ? resource(holder, p) : null))
    } catch { dropped++; continue }

    const count = mesh.vertexCount
    const pos = mesh.attributes.get(CHANNEL.position)
    const nrm = mesh.attributes.get(CHANNEL.normal)
    const uv = mesh.attributes.get(CHANNEL.uv0)
    if (!pos || !uv) { dropped++; continue }

    const verts = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      verts[i * 3] = -pos[i * 3]!
      verts[i * 3 + 1] = pos[i * 3 + 1]!
      verts[i * 3 + 2] = pos[i * 3 + 2]!
      if (verts[i * 3 + 1]! < lowest) lowest = verts[i * 3 + 1]!
      if (verts[i * 3 + 1]! > highest) highest = verts[i * 3 + 1]!
    }
    const normals = new Float32Array(count * 3)
    if (nrm) {
      for (let i = 0; i < count; i++) {
        normals[i * 3] = -nrm[i * 3]!
        normals[i * 3 + 1] = nrm[i * 3 + 1]!
        normals[i * 3 + 2] = nrm[i * 3 + 2]!
      }
    }

    // ⚠️ **정점 하나에 뼈가 넷이라고 두면 안 된다.** 메시마다 다르다 — 주인공의
    // 손목시계는 둘이다. 넷으로 접으면 JOINTS_0이 정점 수의 절반이 되고, three가
    // 없는 번호의 뼈를 집어 **매 프레임 터진다**
    const joints = new Uint16Array(count * 4)
    const weights = new Float32Array(count * 4)
    const bw = mesh.attributes.get(CHANNEL.blendWeight)
    const bi = mesh.intAttributes.get(CHANNEL.blendIndices)
    const wide = Math.min(4, mesh.dimensions.get(CHANNEL.blendWeight) ?? 0)
    if (!bw || !bi || wide === 0) {
      // 스킨 정보가 없는 껍데기가 섞여 있다. 0번 뼈에 100%로 묶어 통째로 움직인다
      for (let i = 0; i < count; i++) weights[i * 4] = 1
    } else {
      const iw = mesh.dimensions.get(CHANNEL.blendIndices) ?? wide
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < wide; k++) {
          weights[i * 4 + k] = bw[i * wide + k]!
          joints[i * 4 + k] = bi[i * iw + k]!
        }
      }
    }
    // glTF는 가중치 합이 1이어야 한다. 안 맞으면 그 정점만 쪼그라든다
    for (let i = 0; i < count; i++) {
      const sum = weights[i * 4]! + weights[i * 4 + 1]! + weights[i * 4 + 2]! + weights[i * 4 + 3]!
      if (sum > 0) for (let k = 0; k < 4; k++) weights[i * 4 + k] = weights[i * 4 + k]! / sum
      else weights[i * 4] = 1
    }

    // ⚠️ **JOINTS_0을 노드 번호로 바꾸면 안 된다.** glTF에서 이 값은 노드가 아니라
    // **그 스킨의 `joints` 배열 안 자리**다. 옮겨야 하는 것은 `joints` 쪽이다
    const remap: number[] = []
    for (const b of (v.m_Bones as Props[] | undefined) ?? []) {
      remap.push(boneAt.get(num(b.m_PathID)) ?? 0)
    }
    if (remap.length === 0) remap.push(roots[0] ?? 0)
    const maxJoint = remap.length - 1
    for (let i = 0; i < joints.length; i++) if (joints[i]! > maxJoint) joints[i] = maxJoint

    const aPos = buf.add(verts, 'VEC3', FLOAT, ARRAY_BUFFER, true)
    const aNrm = buf.add(normals, 'VEC3', FLOAT, ARRAY_BUFFER)
    const aJoint = buf.add(joints, 'VEC4', USHORT, ARRAY_BUFFER)
    const aWeight = buf.add(weights, 'VEC4', FLOAT, ARRAY_BUFFER)

    // ⚠️ **UV는 재질이 적어 둔 배율·오프셋을 먹여야 한다.** 포켓몬 셰이더는
    // `_Col0Tex_ST`에 배율 (2, 1)을 적어 두고 U를 거울로 반복하게 해 둔다 — 몸의
    // 왼쪽이 u ∈ [0, 0.5], 오른쪽이 그 거울인 1 − u다. 배율을 안 먹이면 좌우가
    // 그림의 서로 다른 자리를 읽어 **몸이 한가운데를 세로로 갈라 조각보가 된다**
    const uvOf = new Map<string, number>()
    const uvAccessor = (st: readonly number[]): number => {
      const key = st.join(',')
      let got = uvOf.get(key)
      if (got !== undefined) return got
      const out = new Float32Array(count * 2)
      for (let i = 0; i < count; i++) {
        out[i * 2] = uv[i * 2]! * st[0]! + st[2]!
        // Unity는 UV 원점이 왼쪽 아래, glTF는 왼쪽 위다
        out[i * 2 + 1] = 1 - (uv[i * 2 + 1]! * st[1]! + st[3]!)
      }
      got = buf.add(out, 'VEC2', FLOAT, ARRAY_BUFFER)
      uvOf.set(key, got)
      return got
    }

    const matNames: string[] = []
    for (const m of (v.m_Materials as Props[] | undefined) ?? []) {
      const mv = env.read(num(m.m_PathID)) as Props | null
      matNames.push((mv?.m_Name as string | undefined) ?? '')
    }

    const wideIndex = false
    void wideIndex
    const primitives: Record<string, unknown>[] = []
    mesh.subMeshes.forEach((sub, i) => {
      // 시작 위치가 **인덱스 번호가 아니라 바이트 오프셋**이다
      const stride = num(meshValue.m_IndexFormat) === 1 ? 4 : 2
      const first = Math.floor(sub.firstByte / stride)
      const tri = new Uint32Array(sub.indexCount)
      // X를 뒤집었으므로 감기 순서를 되돌린다. 안 하면 안팎이 뒤집힌다
      for (let t = 0; t + 3 <= sub.indexCount; t += 3) {
        tri[t] = mesh.indices[first + t + 2]!
        tri[t + 1] = mesh.indices[first + t + 1]!
        tri[t + 2] = mesh.indices[first + t]!
      }
      triangleTotal += Math.floor(sub.indexCount / 3)
      outwardSum += outwardRatio(verts, tri)
      outwardCount++
      const name = matNames[i] ?? ''
      const st = lookOf.get(name)?.uv ?? [1, 1, 0, 0]
      const prim: Record<string, unknown> = {
        attributes: {
          POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: uvAccessor(st),
          JOINTS_0: aJoint, WEIGHTS_0: aWeight,
        },
        indices: buf.add(tri, 'SCALAR', UINT, ELEMENT_BUFFER),
        mode: 4,
      }
      const mat = materialOf.get(name)
      if (mat !== undefined) prim.material = mat
      primitives.push(prim)
    })

    // X 뒤집기를 역바인드 행렬에도 옮긴다: S·M·S (S = diag(-1,1,1,1))
    const boneCount = mesh.bindPose.length / 16
    const ibm = new Float32Array(boneCount * 16)
    for (let b = 0; b < boneCount; b++) {
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          // ⚠️ 유니티는 `e{행}{열}`을 **행 우선**으로 늘어놓고 glTF MAT4는
          // **열 우선**이다. 여기를 뒤집어 놓으면 역바인드가 전치돼서, 쉬는
          // 자세는 멀쩡한데 뼈를 돌리는 순간 팔다리가 몸통을 뚫고 나간다
          const src = mesh.bindPose[b * 16 + r * 4 + c]!
          const sign = ((r === 0 ? -1 : 1) * (c === 0 ? -1 : 1))
          ibm[b * 16 + c * 4 + r] = src * sign
        }
      }
    }

    meshes.push({ name: (meshValue.m_Name as string | undefined) ?? '', primitives })
    skins.push({
      inverseBindMatrices: buf.add(ibm, 'MAT4', FLOAT),
      joints: remap,
      skeleton: roots[0] ?? 0,
    })
    vertexTotal += count
  }

  if (meshes.length === 0) throw new ModelError('쓸 만한 메시가 하나도 없다')

  const meshNodes = meshes.map((_, i) => nodes.length + i)
  meshes.forEach((m, i) => { nodes.push({ name: m.name, mesh: i, skin: i }) })

  const { animations, stat: anim } = options.keepClips === false
    ? { animations: [], stat: { clips: 0, channels: 0, unresolved: 0, keys: 0, skipped: 0 } }
    : buildAnimations(env, buf, nodeOfHash, options.clipFilter ?? null)
  // 빌려 온 것은 제 클립 **뒤에** 붙는다 — 이름이 안 겹치므로 차례가 뜻을 안 바꾼다
  const borrow = options.clipsFrom
    ? borrowedClips(options.clipsFrom, buf, bones, boneAt, options.borrowOnly ?? new Set())
    : null
  if (borrow) animations.push(...borrow.animations)

  const gltf: Gltf = {
    asset: { version: '2.0', generator: 'radiant-platinum bdsp' },
    scene: 0,
    scenes: [{ nodes: [...roots, ...meshNodes] }],
    nodes,
    meshes,
    skins,
    materials,
    textures,
    images,
    accessors: buf.accessors,
    bufferViews: buf.views,
    buffers: [{ byteLength: buf.byteLength }],
  }
  // 빈 배열은 glTF가 안 받는다 — 그림이 하나도 없는 번들이 있다
  if (samplers.length) gltf.samplers = samplers
  if (animations.length) gltf.animations = animations

  const glb = writeGlb(gltf, buf.bytes())
  return {
    glb,
    stat: {
      meshes: meshes.length,
      dropped,
      vertices: vertexTotal,
      triangles: triangleTotal,
      bones: bones.length,
      materials: materials.length,
      bytes: glb.byteLength,
      outward: outwardCount ? outwardSum / outwardCount : 0,
      height: highest > lowest ? highest - lowest : 0,
      anim,
      ...(borrow ? { borrow: borrow.stat } : {}),
      problems: verifyGlb(glb),
    },
  }
}
