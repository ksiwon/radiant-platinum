// BDSP 맵이 **움직이게 한다** — 재질 흐름 · 바람 흔들림 · 풍차 회전 · 석탄 더미 (docs/orders/GAPS_20261011.md A)
//
// 굽는 쪽(`import/bdsp/motion.ts` · `field.ts`의 `Moving`)이 glb에 실은 값을 읽는다:
//
//   재질 `userData`  texVel · scroll · frames · swing  (→ `motionMaterial` — 셰이더 안에서 `time` 하나로 돈다)
//   노드 `userData`  spin { euler, add, secs }         (→ `liveMotion`의 회전 — 가까운 것만 민다)
//   `gltf.animations`                                  (→ 맵당 믹서 하나 — 가까운 것만 돈다)
//
// ⚠️ **움직임은 GPU에서 돈다** (성능 규칙). 재질 · 메시마다 CPU가 값을 밀지 않는다 — 흐름 · 그림 교체 · 흔들림은 전부 셰이더의
// `time`이 낸다. 재질마다 다른 값(속도 · 세기 · 방향)은 **균일값**이라 같은 모양의 재질은 셰이더 코드가 같고 파이프라인을 같이 쓴다.
// 맵당 CPU 몫은 풍차(DOTween) 몇 개의 회전과 믹서 하나뿐이고, 둘 다 카메라 가까이에 있을 때만 민다
//
// ⚠️ **바람 흔들림의 식은 우리 식이다.** 원작 `Delphis/Map/Standard`는 Switch 바이너리 셰이더라 식을 못 읽는다. 값의 뜻은 이름대로 둔다
// (`_SwingPower` 세기 · `_SwingSpeed` 빠르기 · `_SwingDistribution` 퍼짐 · `_SwingScale` 축마다 크기 · `_WindDirection` 바람 방향) —
// 위치마다 위상이 다른 물결(월드 xz를 바람 방향으로 눕힌 값 ÷ 퍼짐)에 세기 × 크기 × 정점 가중치(`_SWING` — 정점 색 R × A)를 곱해 로컬 좌표를
// 민다. 진폭 곱수 `WIND_GAIN`은 원작 값에서 못 구했다(추측) — 풀 한 포기가 눈에 띄게 한두 뼘 흔들리도록 잡은 값이다
import {
  AnimationMixer, Euler, LoopRepeat, Mesh, Quaternion, Vector2, Vector3,
  type AnimationClip, type Material, type Object3D, type Texture,
} from 'three'
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu'
import {
  attribute, floor, materialReference, modelWorldMatrix, positionLocal, sin, texture, time, uniform, uv, vec2, vec4,
} from 'three/tsl'
import { ALWAYS_ASYNC } from './asyncPipelines'

/** 재질 `userData`로 오는 움직임 값 — `import/bdsp/motion.ts`의 `motionExtras` */
export interface MotionValues {
  texVel?: readonly number[]
  scroll?: readonly number[]
  frames?: { h: number, v: number, start: number, every: number }
  swing?: { power: number, speed: number, dist: number, uv: number, scale: readonly number[], dir: readonly number[] }
}

/** 바람 진폭 곱수 (추측 — 머리말) */
export const WIND_GAIN = 2

/** 이 재질이 움직이는가 */
export function motionOf(m: Material): MotionValues | null {
  const u = m.userData as MotionValues
  return u.texVel || u.scroll || u.frames || u.swing ? u : null
}

/**
 * 그림 흐름의 셰이더 노드 — `uv() + 속도 × time` (glTF의 v는 아래로 자라 유니티 속도의 v 부호를 뒤집는다).
 * 칸 교체(`frames`)는 `h × v` 아틀라스를 `every`초마다 한 칸씩 넘긴다(칸 번호는 아래 줄부터 센다 — `flipbookCell`과 같다)
 */
function flowUv(m: MotionValues, map: Texture): Node<'vec2'> {
  let at: Node<'vec2'> = uv()
  // 굽는 쪽이 `KHR_texture_transform`으로 적은 첫 칸 · 배율을 이 셰이더가 대신 먹인다 — 명시한 uv에는 텍스처 행렬이 안 걸린다
  const [rx, ry, ox, oy] = [map.repeat.x, map.repeat.y, map.offset.x, map.offset.y]
  if (rx !== 1 || ry !== 1 || ox !== 0 || oy !== 0) at = at.mul(vec2(rx, ry)).add(vec2(ox, oy))
  if (m.frames) {
    const { h, v, start, every } = m.frames
    const cells = uniform(h * v)
    const frame = floor(time.div(uniform(every)).add(uniform(start))).mod(cells)
    const columns = uniform(h)
    const rows = uniform(v)
    const col = frame.mod(columns)
    const fromBottom = floor(frame.div(columns))
    at = vec2(at.x.add(col).div(columns), at.y.div(rows).add(rows.sub(1).sub(fromBottom).div(rows)))
  }
  const vel = m.texVel ?? m.scroll
  if (vel) at = at.add(uniform(new Vector2(vel[0] ?? 0, -(vel[1] ?? 0))).mul(time))
  return at
}

/** 바람 흔들림 — 로컬 위치에 더할 변위 (머리말 「우리 식」) */
function swingOffset(s: NonNullable<MotionValues['swing']>): Node<'vec3'> {
  const world = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz
  const dir = uniform(new Vector3(s.dir[0] ?? 1, s.dir[1] ?? 0, s.dir[2] ?? 0))
  const along = world.x.mul(dir.x).add(world.z.mul(dir.z)).div(uniform(Math.max(s.dist, 0.1) * 2))
  const phase = time.mul(uniform(s.speed * 2)).add(along)
  // 큰 물결에 작은 물결을 섞는다 — 한 가락으로만 흔들리면 기계처럼 읽힌다
  const gust = sin(phase).mul(0.7).add(sin(phase.mul(2.3).add(1.7)).mul(0.3))
  const weight = attribute('_swing', 'float') as unknown as Node<'float'>
  const amplitude = uniform(new Vector3(s.scale[0] ?? 0, s.scale[1] ?? 0, s.scale[2] ?? 0)).mul(uniform(s.power * WIND_GAIN))
  return amplitude.mul(gust).mul(weight)
}

/** 노드 재질로 옮긴다 — 이미 노드 재질이면 그대로 쓴다 (풀 · 꽃은 `liveFoliage`가 먼저 옮겼다) */
function nodeMaterial(was: Material): MeshStandardNodeMaterial {
  if (was instanceof MeshStandardNodeMaterial) return was
  const w = was as Material & {
    color?: { copy: (c: unknown) => void }, map?: Texture | null, emissive?: unknown, emissiveMap?: Texture | null,
    emissiveIntensity?: number, roughness?: number, metalness?: number,
  }
  const m = new MeshStandardNodeMaterial().copy(was as never) as MeshStandardNodeMaterial
  // `NodeMaterial.copy`는 `alphaTest`를 놓친다 — 안 옮기면 풀이 오려지지 않고 네모 판으로 선다 (`BdspField`의 `foliageMaterial`과 같다)
  m.alphaTest = was.alphaTest
  m.map = w.map ?? null
  if (w.color) m.color.copy(w.color as never)
  if (w.emissive) m.emissive.copy(w.emissive as never)
  m.emissiveMap = w.emissiveMap ?? null
  m.emissiveIntensity = w.emissiveIntensity ?? 1
  m.roughness = w.roughness ?? 0.9
  m.metalness = w.metalness ?? 0
  m.opacity = was.opacity
  m.transparent = was.transparent
  m.depthWrite = was.depthWrite
  m.side = was.side
  m.blending = was.blending
  m.name = was.name
  m.userData = was.userData
  return m
}

/** 움직이는 재질 하나 — 그림이 흐르고(`texVel` · `scroll` · `frames`) 정점이 흔들린다(`swing`). 움직일 것이 없으면 `null` */
export function motionMaterial(was: Material): MeshStandardNodeMaterial | null {
  const v = motionOf(was)
  if (!v) return null
  const map = (was as { map?: Texture | null }).map ?? null
  const flows = v.texVel !== undefined || v.scroll !== undefined || v.frames !== undefined
  if (!(flows && map) && !v.swing) return null
  const m = nodeMaterial(was)
  if (flows && map) {
    // 색 · 불투명도는 재질에서 바로 읽는다(`materialReference`) — 흐림(`fieldFade`)이 `opacity`를 매 프레임 바꾼다
    m.colorNode = texture(map, flowUv(v, map)).mul(vec4(
      materialReference('color', 'color') as unknown as Node<'vec3'>, materialReference('opacity', 'float') as unknown as Node<'float'>,
    ))
  }
  if (v.swing) m.positionNode = positionLocal.add(swingOffset(v.swing))
  m.userData[ALWAYS_ASYNC] = true
  return m
}

/**
 * `root` 아래 움직이는 재질을 갈아 끼운다. 같은 재질을 나눠 쓰는 메시는 새 재질도 나눠 쓴다. 갈아 끼운 수를 돌려준다.
 * ⚠️ 물 · 풀 갈아 끼우기(`liveWater` · `liveFoliage`) **뒤**에 부른다 — 물은 제 노드 재질이라 `userData`가 없어 안 걸리고, 풀은 이미 노드 재질이라 그대로 쓴다
 */
export function liveMotionMaterials(root: Object3D): number {
  const swapped = new Map<Material, MeshStandardNodeMaterial | null>()
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const list = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    if (!list.some((x) => motionOf(x) !== null)) return
    const next = list.map((x) => {
      if (motionOf(x) === null) return x
      let n = swapped.get(x)
      if (n === undefined) { n = motionMaterial(x); swapped.set(x, n) }
      return n ?? x
    })
    o.material = Array.isArray(o.material) ? next : next[0]!
  })
  let count = 0
  for (const [old, made] of swapped) {
    if (made && made !== old) { old.dispose(); count++ }
    else if (made) count++
  }
  return count
}

// ── 회전 · 마디 클립 ─────────────────────────────────────────────────────────────────────────────────────

/** DOTween 회전 값 — 노드 `userData.spin` */
export interface Spin { euler: readonly number[], add: readonly number[], secs: number }

const RAD = Math.PI / 180
const tmpEuler = new Euler()
/**
 * `t`초의 회전 — 시작 오일러에 `add × (t / secs의 소수부)`를 더한 오일러(유니티 ZXY = three `YXZ`). 맵이 x를 뒤집었으므로(`field.ts`)
 * y · z 오일러의 부호가 뒤집힌다(사원수 `(x, −y, −z, w)`). DOTween 상대 회전이 오일러 덧셈이라 시작 자세가 축에서 벗어나도 유니티와 같다
 */
export function spinQuaternion(s: Spin, t: number, out: Quaternion): Quaternion {
  const k = ((t / s.secs) % 1 + 1) % 1
  const e = (i: number): number => ((s.euler[i] ?? 0) + (s.add[i] ?? 0) * k) * RAD
  tmpEuler.set(e(0), -e(1), -e(2), 'YXZ')
  return out.setFromEuler(tmpEuler)
}

/** 이 거리(칸) 안의 것만 민다 — 안개 끝 밖이다 */
export const MOTION_REACH = 120
/** 가까움을 다시 보는 간격(초) */
const NEAR_EVERY = 0.5

export interface BdspMotion {
  /** 매 프레임 — `eye`는 카메라 월드 위치 */
  update(dt: number, eye: Vector3): void
  /** 믹서를 놓는다 (재질 · 지오메트리는 `disposeTree`의 몫) */
  dispose(): void
}

/**
 * `root`의 회전 노드(`userData.spin`)와 클립(`animations`)을 돌린다. 클립은 **맵당 믹서 하나**에 다 담고, 가까운 것만 민다.
 * ⚠️ 석탄 클립(`Take 001`)은 한 번 재생하는 클립(`m_LoopTime` 거짓)인데 컨베이어라 **되풀이한다** — 끝에서 처음으로 튀는 것은 추측이다
 * (원작이 컨트롤러에서 되풀이하는지 번들에서 못 읽었다)
 */
export function liveMotion(root: Object3D, animations: readonly AnimationClip[] = []): BdspMotion {
  root.updateMatrixWorld(true)
  const spinners: { node: Object3D, spin: Spin, at: Vector3, near: boolean }[] = []
  root.traverse((o) => {
    const spin = o.userData.spin as Spin | undefined
    if (spin && spin.secs > 0) spinners.push({ node: o, spin, at: o.getWorldPosition(new Vector3()), near: true })
  })
  const mixer = animations.length > 0 ? new AnimationMixer(root) : null
  const actions = mixer ? animations.map((clip) => {
    const a = mixer.clipAction(clip)
    a.setLoop(LoopRepeat, Infinity)
    a.play()
    return { action: a, at: clipCenter(root, clip) }
  }) : []
  let clock = 0
  let sinceNear = NEAR_EVERY
  const q = new Quaternion()
  return {
    update(dt, eye) {
      clock += dt
      sinceNear += dt
      if (sinceNear >= NEAR_EVERY) {
        sinceNear = 0
        for (const s of spinners) s.near = s.at.distanceTo(eye) <= MOTION_REACH
        for (const a of actions) a.action.paused = a.at !== null && a.at.distanceTo(eye) > MOTION_REACH
      }
      for (const s of spinners) {
        if (!s.near) continue
        s.node.quaternion.copy(spinQuaternion(s.spin, clock, q))
      }
      if (mixer && actions.some((a) => !a.action.paused)) mixer.update(dt)
    },
    dispose() {
      mixer?.stopAllAction()
      for (const a of actions) mixer?.uncacheClip(a.action.getClip())
    },
  }
}

/** 클립이 모는 노드의 월드 위치 — 가까운지 가를 자리. 못 찾으면 `null`(늘 민다) */
function clipCenter(root: Object3D, clip: AnimationClip): Vector3 | null {
  // 트랙 이름은 `노드이름.position` — 노드 이름은 로더가 다듬은 이름이다 (`PropertyBinding.sanitizeNodeName`)
  const node = clip.tracks[0]?.name.split('.')[0]
  const at = node ? root.getObjectByName(node) : undefined
  return at ? at.getWorldPosition(new Vector3()) : null
}
