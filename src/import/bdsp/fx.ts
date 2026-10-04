// BDSP 배틀 이펙트 굽기 (docs/orders/BATTLE_FX_20261004.md §4)
//
// 포획 · 내보내기 · 기술 이펙트를 **원작 프리팹 그대로** 굽는다. 한 벌이 Unity 파티클 시스템(Shuriken) 여럿이고,
// 실행 쪽(`scene/battle/fx`)이 그것을 CPU로 돌린다. 여기서는 해석하지 않고 **읽히는 꼴로만** 옮긴다:
//
//   · `data/fx/prefab/<이름>.json` — 노드 나무 + 컴포넌트(파티클 · 렌더러 · 재질 · 힘장 · 애니메이터).
//     스크래치 `bdspfx/dumpprefab.py`(UnityPy)의 JSON과 같은 꼴이고 열쇠 이름만 다듬었다(`simulationSpace` 등).
//   · `data/fx/tex/<이름>.png` + `tex/index.json` — 그림은 **이름으로만** 가리킨다. 번들마다 같은 그림이 겹쳐 있어 이름으로 하나만 둔다
//   · `data/fx/seq/<이름>.json` — 30fps 명령 시간표 (`Dpr.SequenceEditor.SequenceFile`). 켜진 명령만
//   · `data/fx/index.json` — 볼 → 프리팹 · 기술 → 시퀀스
//
// ⚠️ **굽는 쪽은 이것 하나다.** 개발용 `public/data/fx/`도 노드에서 이 코드를 그대로 돌려 굽는다
// (`tools/extract/bdspFx.mjs`). 파이썬 쪽은 조사용 덤프일 뿐이라 둘이 갈릴 자리가 없다.
//
// ⚠️ **좌표는 유니티 그대로다** (왼손 · +Z 앞). 메시도 뒤집지 않는다 — 실행 쪽이 X를 뒤집는다(다른 BDSP 모델과 같은 손잡이).
//
// 노드 경로: 프리팹 뿌리 기준 `/` 이음이고 **뿌리 자신은 빈 문자열**이다(유니티 애니메이션 경로와 같은 약속).
// 힘장(`ExternalForcesModule.influenceList`) · 하위 방출기(`SubModule`) · 애니메이션 곡선의 대상이 이 경로로 적힌다.
import { encodePng } from '../platinum/png'
import {
  breathe, check, put, requireBdsp,
  type BdspSource, type ConvertContext, type Produced,
} from '../platinum/convertTypes'
import { openEnvironment, type Environment } from './environment'
import { meshFrom, CHANNEL, type MeshData } from './mesh'
import { readTexture, resize, resource } from './texture'
import { crc32, exportModel } from './model'
import { UNITY_BUILTIN_MESH, isBuiltinRef } from './unityBuiltin'
import type { UnityValue } from './typetree'

type Obj = Record<string, UnityValue>
type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

/** 뿌리 아래 자리 (실측 덤프 구조) */
const PREFABS = 'Effects/effect/prefab/battle'
const SEQUENCES = 'Battle/btlv/waza/sequence'
const MASTERDATAS = 'Battle/battle_masterdatas'
/** 프리팹 2,030벌이 셰이더를 · 1,932벌이 그림을 이 둘에서 끌어 온다 (스크래치 `census.pkl`의 바깥 참조 집계) */
const SHARED_BUNDLES = ['Effects/fxparticle', 'Effects/effect_common']
/**
 * 셰이더 **이름만** 읽으려고 같이 연다. 재질 여섯(배경판 `ef_b_bg_*` · 손가락 `ew118` · `ew266`)이 파티클 셰이더가 아닌
 * 필드 셰이더를 쓴다 — 없어도 굽기는 되고 그 재질의 `shader`만 `null`이다
 */
const NAME_ONLY_BUNDLES = ['Dpr/shaders']

/**
 * 그림 긴 변의 상한. 원본은 대개 64~256이고 512가 드물게 있다. 띠 그림(1024×64 같은 것)은 비율을 지킨다.
 * 기술 이펙트까지 다 구우면 상한을 낮출지 여기서 정한다 (머리말의 총량)
 */
const FX_TEXTURE = 256

/** 볼 번호 — 몬스터볼 1 ~ 프레셔스볼 16 (`BallEffectData.BallID`) */
const FIRST_BALL = 1
const LAST_BALL = 16
/** 신오 기술 번호 끝 (`BattleWazaData.WazaNo`) */
const LAST_MOVE = 467

/** 유니티 클래스 번호 — `unityfs.ts`의 이름표에 없는 것까지 */
const CLS = {
  GameObject: 1, Transform: 4, Material: 21, Texture2D: 28, Mesh: 43, Shader: 48,
  AnimationClip: 74, AnimatorController: 91, Animator: 95, MonoBehaviour: 114, MonoScript: 115,
  ParticleSystem: 198, ParticleSystemRenderer: 199, ParticleSystemForceField: 330,
} as const
const CLASS_LABEL: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(CLS).map(([k, v]) => [v, k]),
)

const BLEND = ['Zero', 'One', 'DstColor', 'SrcColor', 'OneMinusDstColor', 'SrcAlpha', 'OneMinusSrcColor', 'DstAlpha', 'OneMinusDstAlpha', 'SrcAlphaSaturate', 'OneMinusSrcAlpha']
const SHAPE = ['Sphere', 'SphereShell', 'Hemisphere', 'HemisphereShell', 'Cone', 'Box', 'Mesh', 'ConeShell', 'ConeVolume', 'ConeVolumeShell', 'Circle', 'CircleEdge', 'SingleSidedEdge', 'MeshRenderer', 'SkinnedMeshRenderer', 'BoxShell', 'BoxEdge', 'Donut', 'Rectangle', 'Sprite', 'SpriteRenderer']
const RENDER_MODE = ['Billboard', 'Stretch', 'HorizontalBillboard', 'VerticalBillboard', 'Mesh', 'None']
const STREAM = ['Position', 'Normal', 'Tangent', 'Color', 'UV', 'UV2', 'UV3', 'UV4', 'AnimBlend', 'AnimFrame', 'Center', 'VertexID', 'SizeX', 'SizeXY', 'SizeXYZ', 'Rotation', 'Rotation3D', 'RotationSpeed', 'RotationSpeed3D', 'Velocity', 'Speed', 'AgePercent', 'InvStartLifetime', 'StableRandomX', 'StableRandomXY', 'StableRandomXYZ', 'StableRandomXYZW', 'VariableRandomX', 'VariableRandomXY', 'VariableRandomXYZ', 'VariableRandomXYZW', 'Custom1X', 'Custom1XY', 'Custom1XYZ', 'Custom1XYZW', 'Custom2X', 'Custom2XY', 'Custom2XYZ', 'Custom2XYZW']
/** `TextureWrapMode` 0 Repeat · 1 Clamp · 2 Mirror · 3 MirrorOnce */
const WRAP = ['repeat', 'clamp', 'mirror', 'mirrorOnce']

const MODULES = ['InitialModule', 'ShapeModule', 'EmissionModule', 'SizeModule', 'RotationModule', 'ColorModule', 'UVModule', 'VelocityModule', 'InheritVelocityModule', 'ForceModule', 'ExternalForcesModule', 'ClampVelocityModule', 'NoiseModule', 'SizeBySpeedModule', 'RotationBySpeedModule', 'ColorBySpeedModule', 'CollisionModule', 'TriggerModule', 'SubModule', 'LightsModule', 'TrailModule', 'CustomDataModule']
const MAIN_KEYS = ['lengthInSec', 'simulationSpeed', 'stopAction', 'looping', 'prewarm', 'playOnAwake', 'startDelay', 'moveWithTransform', 'scalingMode', 'useUnscaledTime', 'cullingMode', 'autoRandomSeed', 'randomSeed']

// ── 값 다듬기 ────────────────────────────────────────────────────────────────

/**
 * 소수 다섯째 자리로. 파이썬 덤프의 `round(x, 5)`와 같다 — float32를 그대로 적으면 `0.019999999552965164`처럼 길어져
 * 파일이 두 배가 된다. ⚠️ **정수는 안 건드린다** — 64비트 PathID · 비트 마스크(`4294967295`)가 곱셈에서 깨진다.
 * 무한대는 JSON에 없어 `null`로 나간다 — 곡선 기울기에서 `null`은 **계단(무한 기울기)**이다
 */
function r5(x: number): number | null {
  if (!Number.isFinite(x)) return null
  if (Number.isInteger(x)) return x
  const v = Math.round(x * 1e5) / 1e5
  return v === 0 ? 0 : v
}

const isObj = (v: UnityValue | null | undefined): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array)

const num = (v: UnityValue | undefined): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : 0)
const str = (v: UnityValue | undefined): string => (typeof v === 'string' ? v : '')
const arr = (v: UnityValue | undefined): UnityValue[] => (Array.isArray(v) ? v : v instanceof Uint8Array ? Array.from(v) : [])

const isPPtr = (v: Obj): boolean => {
  const k = Object.keys(v)
  return k.length === 2 && 'm_FileID' in v && 'm_PathID' in v
}
const pidOf = (v: UnityValue | undefined): number => (isObj(v) ? num(v.m_PathID) : 0)

/** 곡선 열쇠 → `[시각, 값, 들어오는 기울기, 나가는 기울기]` */
function curve(c: Obj): Json {
  return arr(c.m_Curve).map((k) => {
    const o = k as Obj
    return [r5(num(o.time)), r5(num(o.value)), r5(num(o.inSlope)), r5(num(o.outSlope))]
  })
}

/** `MinMaxCurve` — 상수 · 곡선 · 두 곡선 사이 · 두 상수 사이 */
function minMax(d: Obj): Json {
  const s = num(d.minMaxState)
  if (s === 0) return { const: r5(num(d.scalar)) }
  if (s === 1) return { curve: curve(d.maxCurve as Obj), scalar: r5(num(d.scalar)) }
  if (s === 2) return { curveMin: curve(d.minCurve as Obj), curveMax: curve(d.maxCurve as Obj), scalar: r5(num(d.scalar)) }
  if (s === 3) {
    const a = num(d.minScalar)
    const b = num(d.scalar)
    return { randMin: r5(Math.min(a, b)), randMax: r5(Math.max(a, b)) }
  }
  return { state: s }
}

const color = (c: UnityValue | undefined): Json => {
  const o = (c ?? {}) as Obj
  return [r5(num(o.r)), r5(num(o.g)), r5(num(o.b)), r5(num(o.a))]
}

/** `Gradient` — 색 열쇠는 `[시각, r, g, b]`, 알파 열쇠는 `[시각, a]`. 시각은 0~65535를 0~1로 */
function gradient(g: Obj): Json {
  const colorKeys: Json[] = []
  const alphaKeys: Json[] = []
  for (let i = 0; i < num(g.m_NumColorKeys); i++) {
    const c = color(g[`key${String(i)}`]) as number[]
    colorKeys.push([Math.round((num(g[`ctime${String(i)}`]) / 65535) * 1e4) / 1e4, c[0]!, c[1]!, c[2]!])
  }
  for (let i = 0; i < num(g.m_NumAlphaKeys); i++) {
    const c = color(g[`key${String(i)}`]) as number[]
    alphaKeys.push([Math.round((num(g[`atime${String(i)}`]) / 65535) * 1e4) / 1e4, c[3]!])
  }
  return { colorKeys, alphaKeys, mode: num(g.m_Mode) ? 'fixed' : 'blend' }
}

/** `MinMaxGradient` */
function minMaxGradient(d: Obj): Json {
  const s = num(d.minMaxState)
  if (s === 0) return { const: color(d.maxColor) }
  if (s === 1) return { gradient: gradient(d.maxGradient as Obj) }
  if (s === 2) return { randColorMin: color(d.minColor), randColorMax: color(d.maxColor) }
  if (s === 3) return { randGradMin: gradient(d.minGradient as Obj), randGradMax: gradient(d.maxGradient as Obj) }
  return { randomFromGradient: gradient(d.maxGradient as Obj) }
}

const XYZ = new Set(['x', 'y', 'z'])

/**
 * 타입 트리 값 → JSON. 파이썬 `simp`와 같은 규칙이다:
 * `MinMaxCurve` · `MinMaxGradient`를 접고, `{x,y,z(,w)}`는 배열로, 곡선은 열쇠 배열로.
 * PPtr은 `ref`가 이 프리팹 안의 노드면 **노드 경로**로, 아니면 `null`이다
 */
function simp(v: UnityValue, ref: (p: Obj) => Json): Json {
  if (v instanceof Uint8Array) return Array.from(v)
  if (Array.isArray(v)) return v.map((x) => simp(x, ref))
  if (isObj(v)) {
    const keys = Object.keys(v)
    if (keys.length === 0) return {}
    if ('minMaxState' in v) return 'maxColor' in v ? minMaxGradient(v) : minMax(v)
    if (keys.every((k) => XYZ.has(k)) || (keys.length === 4 && keys.every((k) => XYZ.has(k) || k === 'w'))) {
      return ['x', 'y', 'z', 'w'].filter((k) => k in v).map((k) => r5(num(v[k])))
    }
    if (isPPtr(v)) return num(v.m_PathID) === 0 ? null : ref(v)
    if (Array.isArray(v.m_Curve)) return curve(v)
    const out: Record<string, Json> = {}
    for (const k of keys) out[k] = simp(v[k]!, ref)
    return out
  }
  if (typeof v === 'number') return r5(v)
  return v as Json
}

// ── 굽는 판 ──────────────────────────────────────────────────────────────────

/** 그림 한 장의 기록 (`tex/index.json`) */
interface FxTextureInfo {
  /** 구운 크기 */
  size: [number, number]
  /** 원본 크기 */
  source: [number, number]
  wrap: [string, string]
  /** `m_ColorSpace` 1 = sRGB. 0이면 선형 자료(마스크 · 왜곡)다 */
  srgb: boolean
  /** Unity `TextureFormat` 번호 */
  format: number
}

/** 노드 하나 (프리팹 JSON의 `roots[]`) */
interface FxNode {
  name: string
  active: boolean
  layer: number
  localPosition: Json
  localRotation: Json
  localScale: Json
  components: Json[]
  children: FxNode[]
}

export interface FxPrefab {
  prefab: string
  roots: FxNode[]
}

/** 그림을 이름으로 모은다. 같은 이름은 **처음 것 하나**만 굽는다 */
export class FxTextures {
  readonly info = new Map<string, FxTextureInfo>()
  /** 이름이 같은데 크기가 다른 것 — 고르지 못한 것이 아니라 덮인 것이라 세어 둔다 */
  readonly clashes: string[] = []
  private readonly emit: (path: string, data: Uint8Array) => void
  private readonly maxSize: number
  // ⚠️ 매개변수 속성(`private readonly emit` 꼴)을 안 쓴다 — 노드의 타입 지우기(`bdspFx.mjs`)가 못 읽는다
  constructor(emit: (path: string, data: Uint8Array) => void, maxSize: number) {
    this.emit = emit
    this.maxSize = maxSize
  }

  async add(value: Obj, env: Environment, pid: number): Promise<string> {
    const name = str(value.m_Name)
    const had = this.info.get(name)
    const w = num(value.m_Width)
    const h = num(value.m_Height)
    if (had) {
      if (had.source[0] !== w || had.source[1] !== h) this.clashes.push(name)
      return name
    }
    const bundle = env.bundleOf(pid)
    if (!bundle) throw new Error(`그림 ${name}의 번들을 모른다`)
    const tex = readTexture(value, bundle)
    const scale = Math.min(1, this.maxSize / Math.max(tex.width, tex.height))
    const tw = Math.max(1, Math.round(tex.width * scale))
    const th = Math.max(1, Math.round(tex.height * scale))
    const pixels = scale < 1 ? resize(tex.pixels, tex.width, tex.height, tw, th) : tex.pixels
    this.emit(`tex/${name}.png`, await encodePng(pixels, tw, th))
    this.info.set(name, {
      size: [tw, th],
      source: [tex.width, tex.height],
      wrap: [WRAP[tex.wrapU] ?? 'repeat', WRAP[tex.wrapV] ?? 'repeat'],
      srgb: num(value.m_ColorSpace) === 1,
      format: num(value.m_TextureFormat),
    })
    return name
  }
}

/** 찾은 오브젝트 — 어느 환경에서 왔는지까지 (메시 · 그림 스트림을 그 번들에서 찾는다) */
interface Found { env: Environment, pid: number, classId: number, value: Obj }

/**
 * 프리팹 하나를 굽는다.
 *
 * `shared`는 `fxparticle`(셰이더) + `effect_common`(공용 그림 · 메시)을 한 번 연 것이다. PPtr의 `m_FileID`는 안 본다 —
 * 이 번들 → 공용 순서로 PathID를 찾는다(`environment.ts`와 같은 판단: 64비트 난수라 안 겹친다). 거기에도 없는 것
 * (`unity default resources` 10벌 · `Dpr/shaders` 6벌)은 `null`로 남고 `problems`에 적힌다
 */
export async function bakeFxPrefab(
  name: string, bytes: Uint8Array, shared: Environment, textures: FxTextures,
): Promise<{ prefab: FxPrefab, problems: string[] }> {
  const local = openEnvironment([bytes])
  const problems: string[] = []

  const find = (p: UnityValue | undefined): Found | null => {
    const pid = pidOf(p)
    if (pid === 0) return null
    for (const env of [local, shared]) {
      const e = env.entryOf(pid)
      if (!e) continue
      const value = env.read(pid)
      if (!isObj(value)) return null
      return { env, pid, classId: e.object.classId, value }
    }
    return null
  }

  // 노드 나무
  const goOfTransform = new Map<number, number>()
  const transforms = new Map<number, Obj>()
  for (const e of local.entries) {
    if (e.object.classId !== CLS.Transform) continue
    const t = local.readEntry(e) as Obj
    transforms.set(e.object.pathId, t)
    goOfTransform.set(e.object.pathId, pidOf(t.m_GameObject))
  }
  /** GameObject PathID → 노드 경로 */
  const pathOfGo = new Map<number, string>()
  const roots = [...transforms.entries()].filter(([, t]) => pidOf(t.m_Father) === 0).map(([pid]) => pid)
  const walk = (tid: number, path: string): void => {
    pathOfGo.set(goOfTransform.get(tid)!, path)
    for (const c of arr(transforms.get(tid)?.m_Children)) {
      const cid = pidOf(c)
      const go = local.read(goOfTransform.get(cid) ?? 0) as Obj | null
      walk(cid, path === '' ? str(go?.m_Name) : `${path}/${str(go?.m_Name)}`)
    }
  }
  for (const r of roots) walk(r, '')
  /** 컴포넌트 · GameObject PathID → 노드 경로 */
  const pathOf = new Map<number, string>(pathOfGo)
  for (const e of local.entries) {
    if (e.object.classId === CLS.GameObject || e.object.classId === CLS.Transform) continue
    const v = local.readEntry(e)
    if (!isObj(v) || !isObj(v.m_GameObject)) continue
    const p = pathOfGo.get(pidOf(v.m_GameObject))
    if (p !== undefined) pathOf.set(e.object.pathId, p)
  }

  const ref = (p: Obj): Json => {
    const at = pathOf.get(num(p.m_PathID))
    if (at !== undefined) return at
    // 그림 · 메시 · 재질은 자리마다 따로 다룬다. 여기 오는 것은 노드가 아닌데 안 다룬 참조다
    return null
  }
  const s = (v: UnityValue | undefined): Json => (v === undefined ? null : simp(v, ref))

  const scripts = new Map<number, string>()
  for (const e of local.entries) {
    if (e.object.classId === CLS.MonoScript) scripts.set(e.object.pathId, str((local.readEntry(e) as Obj).m_ClassName))
  }

  const meshCache = new Map<number, Json>()
  const mesh = (p: UnityValue | undefined): Json => {
    const pid = pidOf(p)
    if (pid === 0) return null
    if (meshCache.has(pid)) return meshCache.get(pid)!
    const f = find(p)
    let out: Json = null
    if (!f) {
      // 이펙트 넷(`ew209_kemuri` · `ew291_at_out_sea` · `ew329_*`)이 기본 상자(10202)를 쓴다 — 실행 쪽이 같은 모양을 만들도록 이름만 적는다
      const builtin = isObj(p) && isBuiltinRef(num(p.m_FileID), pid) ? UNITY_BUILTIN_MESH[Math.abs(pid)] : undefined
      if (builtin) out = { name: builtin, builtin }
      else problems.push(`메시 ${String(pid)}를 못 찾았다`)
    } else {
      const holder = f.env.bundleOf(pid)
      out = meshJson(meshFrom(f.value, (path) => (holder ? resource(holder, path) : null)))
    }
    meshCache.set(pid, out)
    return out
  }

  const shaderName = (p: UnityValue | undefined): string | null => {
    const f = find(p)
    if (!f) return null
    const form = f.value.m_ParsedForm
    return isObj(form) ? str(form.m_Name) : null
  }

  const material = async (p: UnityValue): Promise<Json> => {
    const f = find(p)
    if (!f) {
      if (pidOf(p) !== 0) problems.push(`재질 ${String(pidOf(p))}를 못 찾았다`)
      return null
    }
    const d = f.value
    const sp = d.m_SavedProperties as Obj
    const pairs = (v: UnityValue | undefined): [string, UnityValue][] =>
      arr(v).map((x) => {
        const [k, val] = x as [UnityValue, UnityValue]
        return [isObj(k) ? str(k.name) : str(k), val]
      })
    const floats = new Map(pairs(sp.m_Floats).map(([k, v]) => [k, num(v)]))
    const fl = (k: string, def: number): number => floats.get(k) ?? def
    const shader = shaderName(d.m_Shader)
    if (shader === null && pidOf(d.m_Shader) !== 0) problems.push(`재질 ${str(d.m_Name)}의 셰이더를 못 찾았다`)
    const tex: Record<string, Json> = {}
    for (const [k, te] of pairs(sp.m_TexEnvs)) {
      const t = te as Obj
      const tf = find(t.m_Texture)
      if (!tf) {
        if (pidOf(t.m_Texture) !== 0) problems.push(`그림 ${k} (${str(d.m_Name)})을 못 찾았다`)
        continue
      }
      if (tf.classId !== CLS.Texture2D) {
        problems.push(`${k} (${str(d.m_Name)})가 Texture2D가 아니다 (${String(tf.classId)})`)
        continue
      }
      const texName = await textures.add(tf.value, tf.env, tf.pid)
      const sc = t.m_Scale as Obj
      const of = t.m_Offset as Obj
      tex[k] = {
        name: texName,
        size: [num(tf.value.m_Width), num(tf.value.m_Height)],
        scale: [r5(num(sc.x)), r5(num(sc.y))],
        offset: [r5(num(of.x)), r5(num(of.y))],
      }
    }
    return {
      name: str(d.m_Name),
      shader,
      renderQueue: num(d.m_CustomRenderQueue),
      keywords: str(d.m_ShaderKeywords).split(/\s+/).filter(Boolean),
      blend: {
        color: [BLEND[fl('_SrcColor', 1)] ?? '?', BLEND[fl('_DestColor', 0)] ?? '?'],
        alpha: [BLEND[fl('_SrcAlpha', 1)] ?? '?', BLEND[fl('_DestAlpha', 0)] ?? '?'],
        opColor: floats.get('_BlendOpColor') ?? null,
        opAlpha: floats.get('_BlendOpAlpha') ?? null,
      },
      cull: floats.get('_Cull') ?? null,
      zwrite: floats.get('_ZWrite') ?? null,
      ztest: floats.get('_ZTest') ?? null,
      floats: Object.fromEntries([...floats].map(([k, v]) => [k, r5(v)])),
      colors: Object.fromEntries(pairs(sp.m_Colors).map(([k, v]) => [k, color(v)])),
      textures: tex,
    }
  }

  const particleSystem = (d: Obj): Json => {
    const r: Record<string, Json> = { type: 'ParticleSystem' }
    for (const k of MAIN_KEYS) {
      if (!(k in d)) continue
      // 유니티 이름은 `moveWithTransform`이지만 뜻은 시뮬레이션 공간이다 (0 월드 · 1 로컬 · 2 지정 노드)
      if (k === 'moveWithTransform') r.simulationSpace = s(d[k])
      else r[k] = s(d[k])
    }
    if (num(d.moveWithTransform) === 2) r.customSimulationSpace = s(d.moveWithCustomTransform)
    for (const m of MODULES) {
      const mod = d[m]
      if (!isObj(mod) || !mod.enabled) continue
      const rest: Obj = {}
      for (const [k, v] of Object.entries(mod)) if (k !== 'enabled') rest[k] = v
      const x = s(rest) as Record<string, Json>
      if (m === 'ShapeModule') {
        x.typeName = SHAPE[num(mod.type)] ?? null
        x.mesh = mesh(mod.m_Mesh)
      }
      if (m === 'EmissionModule') x.m_Bursts = arr(x.m_Bursts as UnityValue).slice(0, num(mod.m_BurstCount)) as Json
      if (m === 'CustomDataModule') {
        for (const k of Object.keys(x)) {
          if (k.startsWith('vector') && JSON.stringify(x[k]) === '{"const":0}') delete x[k]
        }
      }
      r[m] = x
    }
    return r
  }

  const renderer = async (d: Obj): Promise<Json> => {
    const mats: Json[] = []
    for (const m of arr(d.m_Materials)) mats.push(await material(m))
    return {
      type: 'ParticleSystemRenderer',
      enabled: Boolean(num(d.m_Enabled)),
      renderMode: RENDER_MODE[num(d.m_RenderMode)] ?? null,
      // 0 없음 · 1 거리 · 2 오래된 것 먼저 · 3 젊은 것 먼저
      sortMode: num(d.m_SortMode),
      sortingFudge: r5(num(d.m_SortingFudge)),
      sortingOrder: num(d.m_SortingOrder),
      // 0 화면 · 1 월드 · 2 로컬 · 3 카메라를 향해 · 4 속도
      alignment: num(d.m_RenderAlignment),
      velocityScale: r5(num(d.m_VelocityScale)),
      lengthScale: r5(num(d.m_LengthScale)),
      cameraVelocityScale: r5(num(d.m_CameraVelocityScale)),
      minParticleSize: r5(num(d.m_MinParticleSize)),
      maxParticleSize: r5(num(d.m_MaxParticleSize)),
      pivot: s(d.m_Pivot),
      flip: s(d.m_Flip),
      allowRoll: s(d.m_AllowRoll),
      vertexStreams: d.m_UseCustomVertexStreams
        ? arr(d.m_VertexStreams).map((x) => STREAM[num(x)] ?? num(x))
        : 'default',
      mesh: mesh(d.m_Mesh),
      materials: mats,
    }
  }

  let candidates: Map<number, string> | null = null
  const attributeNames = (): Map<number, string> => {
    candidates ??= attributeCandidates(local)
    return candidates
  }

  const animator = (d: Obj, goPath: string): Json => {
    const out: Record<string, Json> = { type: 'Animator', enabled: Boolean(num(d.m_Enabled)), controller: null, clip: null }
    const cf = find(d.m_Controller)
    if (!cf) return out
    out.controller = str(cf.value.m_Name)
    const picked = defaultClip(cf.value)
    // 상태 기계가 없는 빈 컨트롤러(`ew275_smoke`)는 아무것도 안 튼다 — 원작도 그렇다
    if (!picked) {
      if (arr((cf.value.m_Controller as Obj | undefined)?.m_StateMachineArray).length === 0) return out
      problems.push(`애니메이터 ${goPath}: 기본 상태의 클립을 못 찾았다`)
      return out
    }
    const clip = find(picked.clip)
    if (!clip) {
      problems.push(`애니메이터 ${goPath}: 클립을 못 찾았다`)
      return out
    }
    // 곡선 경로는 애니메이터 노드 기준이다 → 프리팹 경로로 바꿔 적는다
    const below = new Map<number, string>()
    for (const p of new Set(pathOfGo.values())) {
      if (goPath === '' || p === goPath || p.startsWith(`${goPath}/`)) {
        const rel = goPath === '' ? p : p === goPath ? '' : p.slice(goPath.length + 1)
        below.set(crc32(rel), p)
      }
    }
    const baked = bakeClip(clip.value, below, attributeNames(), problems)
    out.clip = { state: picked.state, speed: r5(picked.speed), ...baked }
    return out
  }

  const component = async (classId: number, d: Obj, goPath: string): Promise<Json> => {
    switch (classId) {
      case CLS.Transform: return null
      case CLS.ParticleSystem: return particleSystem(d)
      case CLS.ParticleSystemRenderer: return renderer(d)
      case CLS.Animator: return animator(d, goPath)
      case CLS.MonoBehaviour: {
        const fields: Obj = {}
        for (const [k, v] of Object.entries(d)) {
          if (!['m_GameObject', 'm_Script', 'm_Name', 'm_Enabled'].includes(k)) fields[k] = v
        }
        return { type: 'MonoBehaviour', script: scripts.get(pidOf(d.m_Script)) ?? null, enabled: Boolean(num(d.m_Enabled)), fields: s(fields) }
      }
      default: {
        const fields: Obj = {}
        for (const [k, v] of Object.entries(d)) if (k !== 'm_GameObject') fields[k] = v
        return { type: CLASS_LABEL[classId] ?? `#${String(classId)}`, fields: s(fields) }
      }
    }
  }

  const node = async (tid: number): Promise<FxNode> => {
    const t = transforms.get(tid)!
    const goPid = goOfTransform.get(tid)!
    const g = local.read(goPid) as Obj
    const goPath = pathOfGo.get(goPid) ?? ''
    const comps: Json[] = []
    for (const c of arr(g.m_Component)) {
      const cp = isObj(c) && 'component' in c ? c.component : c
      const pid = pidOf(cp)
      const e = local.entryOf(pid)
      if (!e) continue
      const d = local.read(pid)
      if (!isObj(d)) continue
      const j = await component(e.object.classId, d, goPath)
      if (j !== null) comps.push(j)
    }
    const children: FxNode[] = []
    for (const c of arr(t.m_Children)) children.push(await node(pidOf(c)))
    return {
      name: str(g.m_Name),
      active: Boolean(num(g.m_IsActive)),
      layer: num(g.m_Layer),
      localPosition: s(t.m_LocalPosition),
      localRotation: s(t.m_LocalRotation),
      localScale: s(t.m_LocalScale),
      components: comps,
      children,
    }
  }

  const out: FxNode[] = []
  for (const r of roots) out.push(await node(r))
  return { prefab: { prefab: name, roots: out }, problems: [...new Set(problems)] }
}

// ── 메시 ─────────────────────────────────────────────────────────────────────

/** 메시를 JSON에 바로 싣는다. 이펙트 메시는 수백 정점이라 따로 파일을 둘 까닭이 없다. **유니티 좌표 그대로** */
function meshJson(m: MeshData): Json {
  const round = (a: Float32Array | undefined, dim: number, want: number): Json => {
    if (!a) return null
    const out: number[] = []
    for (let v = 0; v < m.vertexCount; v++) {
      for (let k = 0; k < want; k++) out.push(r5(k < dim ? a[v * dim + k]! : 0) ?? 0)
    }
    return out
  }
  const dimOf = (ch: number): number => m.dimensions.get(ch) ?? 0
  const indices: number[] = []
  // 이펙트 메시는 서브메시가 거의 하나다. 여럿이면 차례로 이어 붙인다 (`baseVertex`를 더해서).
  // 서브메시 자리(`firstByte`)는 바이트라 색인 폭으로 나눈다 — 폭은 버퍼 전체 길이와 색인 수에서 되짚는다
  const total = m.subMeshes.reduce((n, sm) => n + sm.indexCount, 0)
  const width = total === m.indices.length || m.subMeshes.length <= 1 ? 0 : 2
  let at = 0
  for (const sm of m.subMeshes) {
    const from = width ? sm.firstByte / width : at
    for (let i = 0; i < sm.indexCount; i++) indices.push((m.indices[from + i] ?? 0) + sm.baseVertex)
    at += sm.indexCount
  }
  const uv2 = m.attributes.get(CHANNEL.uv1)
  return {
    name: m.name,
    positions: round(m.attributes.get(CHANNEL.position), dimOf(CHANNEL.position), 3),
    normals: round(m.attributes.get(CHANNEL.normal), dimOf(CHANNEL.normal), 3),
    uvs: round(m.attributes.get(CHANNEL.uv0), dimOf(CHANNEL.uv0), 2),
    ...(uv2 ? { uvs2: round(uv2, dimOf(CHANNEL.uv1), 2) } : {}),
    ...(m.attributes.has(CHANNEL.color) ? { colors: round(m.attributes.get(CHANNEL.color), dimOf(CHANNEL.color), 4) } : {}),
    indices,
  }
}

// ── 애니메이터 ───────────────────────────────────────────────────────────────

/**
 * 컨트롤러의 **기본 상태**가 트는 클립. 이펙트 애니메이터는 층 하나 · 상태 하나가 거의 다다
 * (`ee002_lvup`: 상태 `ee002_lvup-line_flash` · 속도 1)
 */
function defaultClip(ctrl: Obj): { clip: UnityValue, state: string, speed: number } | null {
  const c = ctrl.m_Controller as Obj | undefined
  const sm = (arr(c?.m_StateMachineArray)[0] as Obj | undefined)?.data as Obj | undefined
  if (!sm) return null
  const states = arr(sm.m_StateConstantArray)
  const st = (states[num(sm.m_DefaultState)] as Obj | undefined)?.data as Obj | undefined
  if (!st) return null
  const tree = (arr(st.m_BlendTreeConstantArray)[0] as Obj | undefined)?.data as Obj | undefined
  const nodeData = (arr(tree?.m_NodeArray)[0] as Obj | undefined)?.data as Obj | undefined
  if (!nodeData) return null
  const clip = arr(ctrl.m_AnimationClips)[num(nodeData.m_ClipID)]
  if (clip === undefined) return null
  const tos = new Map(arr(ctrl.m_TOS).map((p) => [num((p as UnityValue[])[0]), str((p as UnityValue[])[1])]))
  return { clip, state: tos.get(num(st.m_NameID)) ?? '', speed: num(st.m_Speed) }
}

/**
 * 애니메이션 속성 이름의 CRC32 → 이름. 유니티는 속성을 `ShapeModule.m_Scale.x` 같은 점 경로의 CRC32로만 싣는다.
 * 이 번들의 컴포넌트 값에서 **숫자 잎의 점 경로**를 다 모아 해시를 맞춘다 — 실측(이펙트 클립 231개의 결합 전부)에서
 * 파티클 `ShapeModule.m_Scale` · `m_Position` · `m_Rotation` · `radius.value`, 노드 `m_IsActive`가 모두 이렇게 풀렸다
 */
function attributeCandidates(env: Environment): Map<number, string> {
  const out = new Map<number, string>()
  const seen = new Set<number>()
  const leaves = (v: UnityValue, pre: string): void => {
    if (isObj(v)) {
      for (const [k, x] of Object.entries(v)) leaves(x, pre ? `${pre}.${k}` : k)
      return
    }
    if (typeof v === 'number' || typeof v === 'boolean') out.set(crc32(pre), pre)
  }
  for (const e of env.entries) {
    const c = e.object.classId
    if (c !== CLS.ParticleSystem && c !== CLS.GameObject && c !== CLS.ParticleSystemRenderer && c !== CLS.ParticleSystemForceField) continue
    // 클래스마다 한 벌이면 이름이 다 나온다 (타입 트리가 같다)
    if (seen.has(c)) continue
    seen.add(c)
    const v = env.readEntry(e)
    if (v) leaves(v, '')
  }
  return out
}

const TRANSFORM_ATTR: Readonly<Record<number, [string, string[]]>> = {
  1: ['localPosition', ['x', 'y', 'z']],
  2: ['localRotation', ['x', 'y', 'z', 'w']],
  3: ['localScale', ['x', 'y', 'z']],
  4: ['localEulerAngles', ['x', 'y', 'z']],
}

/** 한 곡선의 열쇠 `[t, v, in, out]` — 기울기가 `null`이면 계단이다 */
type Key = [number, number, number, number]

interface StreamedKey { index: number, coeff: [number, number, number, number] }
interface StreamedFrame { time: number, keys: StreamedKey[] }

/** `StreamedClip.data`(u32 배열)를 프레임으로. 프레임마다 `시각 · 열쇠 수 · (곡선 번호 · 3차 계수 넷)×n` */
function streamedFrames(words: UnityValue[]): StreamedFrame[] {
  const buf = new DataView(Uint32Array.from(words.map(num)).buffer)
  const frames: StreamedFrame[] = []
  let at = 0
  while (at + 8 <= buf.byteLength) {
    const time = buf.getFloat32(at, true)
    const n = buf.getInt32(at + 4, true)
    at += 8
    const keys: StreamedKey[] = []
    for (let i = 0; i < n; i++) {
      keys.push({
        index: buf.getInt32(at, true),
        coeff: [buf.getFloat32(at + 4, true), buf.getFloat32(at + 8, true), buf.getFloat32(at + 12, true), buf.getFloat32(at + 16, true)],
      })
      at += 20
    }
    frames.push({ time, keys })
  }
  return frames
}

/**
 * 앞 열쇠의 3차식에서 다음 열쇠로 **들어오는 기울기**를 되짚는다 (UnityPy `StreamedCurveKey.CalculateNextInSlope`와 같은 식).
 * 계수 셋이 다 0이면 계단이다 — 무한대(JSON `null`)
 */
function nextInSlope(prev: StreamedKey, dx: number, value: number): number {
  const [a, b, c, d] = prev.coeff
  if (a === 0 && b === 0 && c === 0) return Infinity
  const x = Math.max(dx, 0.0001)
  const dy = value - d
  const len = 1 / (x * x)
  const d1 = c * x
  const d2 = dy * 3 - d1 * 2 - b / len
  return d2 / x
}

/**
 * 클립 하나를 곡선 목록으로. 값 배열 차례는 **스트림 → 촘촘한 표 → 상수**이고, 결합(`genericBindings`)이 그 차례대로
 * 차원 수만큼씩 자리를 먹는다(위치 · 크기 · 오일러 3, 쿼터니언 4, 나머지 1)
 */
function bakeClip(
  clip: Obj, paths: Map<number, string>, names: Map<number, string>, problems: string[],
): Record<string, Json> {
  const muscle = clip.m_MuscleClip as Obj
  const data = ((muscle.m_Clip as Obj).data as Obj)
  const streamed = data.m_StreamedClip as Obj
  const dense = data.m_DenseClip as Obj
  const constant = data.m_ConstantClip as Obj
  const start = num(muscle.m_StartTime)
  const stop = num(muscle.m_StopTime)

  const curves = new Map<number, Key[]>()
  const push = (i: number, k: Key): void => {
    let list = curves.get(i)
    if (!list) curves.set(i, list = [])
    list.push(k)
  }

  // 스트림 — 첫 프레임은 기울기 계산용 · 끝 프레임은 +∞ 표지라 실제 열쇠가 아니다 (UnityPy `ProcessStreams`)
  const frames = streamedFrames(arr(streamed.data))
  for (let f = 1; f < frames.length - 1; f++) {
    const frame = frames[f]!
    for (const key of frame.keys) {
      let inSlope = 0
      search: for (let p = f - 1; p >= 0; p--) {
        for (const k of frames[p]!.keys) {
          if (k.index !== key.index) continue
          inSlope = nextInSlope(k, frame.time - frames[p]!.time, key.coeff[3])
          break search
        }
      }
      push(key.index, [frame.time, key.coeff[3], inSlope, key.coeff[2]])
    }
  }
  const streamCount = num(streamed.curveCount)

  // 촘촘한 표 — 표본 사이를 곧게 잇도록 기울기를 앞뒤 차분으로 준다
  const denseCount = num(dense.m_CurveCount)
  const frameCount = num(dense.m_FrameCount)
  const samples = arr(dense.m_SampleArray).map(num)
  const rate = num(dense.m_SampleRate) || 30
  const begin = num(dense.m_BeginTime)
  for (let c = 0; c < denseCount; c++) {
    for (let f = 0; f < frameCount; f++) {
      const v = samples[f * denseCount + c]!
      const prev = f > 0 ? samples[(f - 1) * denseCount + c]! : v
      const next = f < frameCount - 1 ? samples[(f + 1) * denseCount + c]! : v
      push(streamCount + c, [begin + f / rate, v, (v - prev) * rate, (next - v) * rate])
    }
  }

  // 상수 — 처음과 끝 두 열쇠
  const consts = arr(constant.data).map(num)
  consts.forEach((v, c) => {
    push(streamCount + denseCount + c, [start, v, 0, 0])
    push(streamCount + denseCount + c, [stop, v, 0, 0])
  })

  // 결합 → (경로 · 컴포넌트 · 속성)
  const bindings = arr((clip.m_ClipBindingConstant as Obj).genericBindings) as Obj[]
  const out: Json[] = []
  let index = 0
  for (const b of bindings) {
    const typeId = num(b.typeID)
    const attr = num(b.attribute)
    const tr = typeId === CLS.Transform ? TRANSFORM_ATTR[attr] : undefined
    const comps = tr ? tr[1] : [null]
    const path = paths.get(num(b.path) >>> 0)
    // 이름이 바뀌었거나 지워진 노드를 가리키는 결합이 남아 있다(`ew396_bullet_charge` 셋). 유니티도 대상이 없으면 안 튼다 —
    // 곡선은 버리되 적어 둔다
    if (path === undefined) problems.push(`클립 ${str(clip.m_Name)}: 대상 노드가 없는 곡선 (경로 해시 ${String(num(b.path) >>> 0)}) — 유니티도 안 튼다`)
    let base: string
    if (tr) base = tr[0]
    else {
      const n = names.get(attr >>> 0)
      if (n === undefined) problems.push(`클립 ${str(clip.m_Name)}: 속성 해시 ${String(attr >>> 0)}를 못 풀었다`)
      base = n ?? `#${String(attr >>> 0)}`
    }
    for (const c of comps) {
      const keys = curves.get(index) ?? []
      index++
      if (num(b.isPPtrCurve) || path === undefined) continue
      out.push({
        path,
        component: CLASS_LABEL[typeId] ?? `#${String(typeId)}`,
        attribute: c ? `${base}.${c}` : base,
        keys: keys.map((k) => k.map(r5)),
      })
    }
  }
  return {
    name: str(clip.m_Name),
    start: r5(start),
    stop: r5(stop),
    loop: Boolean(num(muscle.m_LoopTime)),
    sampleRate: r5(num(clip.m_SampleRate)),
    curves: out,
  }
}

// ── 시퀀스 ───────────────────────────────────────────────────────────────────

interface FxSequence {
  name: string
  groups: {
    name: string
    /** `GrpNo` — 같은 번호의 묶음이 같은 대상(모델 · 파티클 칸)을 쓴다 */
    no: number
    /** 0이 아닌 `GroupOption`만 `[옵션, 값]` — 조건부 묶음(성별 · 더블 같은 것)이다 */
    options: [number, number][]
    commands: { start: number, end: number, name: string, values: Record<string, string[]> }[]
  }[]
}

/** 시퀀스 MonoBehaviour 값 → 켜진 명령만 */
export function bakeSequence(value: Obj): FxSequence {
  const groups: FxSequence['groups'] = []
  for (const g of arr(value._groupData) as Obj[]) {
    const commands: FxSequence['groups'][number]['commands'] = []
    for (const c of arr(g.Commands) as Obj[]) {
      if (!num(c.IsActive)) continue
      const m = c.Macro as Obj
      const values: Record<string, string[]> = {}
      for (const v of arr(m.Values) as Obj[]) values[str(v.Name)] = arr(v.Values).map(str)
      commands.push({ start: num(c.StartFrame), end: num(c.EndFrame), name: str(m.Name), values })
    }
    if (commands.length === 0) continue
    const options = (arr(g.GroupOption) as Obj[])
      .filter((o) => num(o.Value) !== 0)
      .map((o): [number, number] => [num(o.Option), num(o.Value)])
    groups.push({ name: str(g.Name), no: num(g.GrpNo), options, commands })
  }
  return { name: str(value.m_Name), groups }
}

/** `ParticleCreate`의 `file=ee100/ee101_01_ball_fol01.ptcl` → 프리팹 이름 `ee101_01_ball_fol01` */
export function prefabOfFile(file: string): string | null {
  const m = /([^/]+)\.ptcl$/i.exec(file)
  return m ? m[1]! : null
}

export function prefabsOf(seq: FxSequence): string[] {
  const out = new Set<string>()
  for (const g of seq.groups) {
    for (const c of g.commands) {
      for (const [k, vs] of Object.entries(c.values)) {
        if (k !== 'file') continue
        for (const v of vs) {
          const p = prefabOfFile(v)
          if (p) out.add(p)
        }
      }
    }
  }
  return [...out]
}

// ── 그룹 ─────────────────────────────────────────────────────────────────────

/** 대소문자를 안 따지고 자리를 찾는다 (`convert.ts`의 `index`와 같은 것 — 순환 import를 피해 따로 둔다) */
async function indexOf(src: BdspSource): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const p of await src.list()) out.set(p.toLowerCase(), p)
  return out
}

const textOf = (o: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(o))

/** 배틀 표(`BattleDataTable`)에서 쓰는 칸만 */
interface Tables {
  balls: Map<number, { capture: string | null, ballout: string | null }>
  moves: Map<number, Record<string, string>>
  /** 내보내기 도입 시퀀스 (`SetupIntroPlaySequenceData`) */
  intro: Map<number, string>
}

function readTables(env: Environment): Tables {
  let table: Obj | null = null
  for (const e of env.entries) {
    if (e.object.classId !== CLS.MonoBehaviour) continue
    const v = env.readEntry(e)
    if (isObj(v) && v.m_Name === 'BattleDataTable') table = v
  }
  if (!table) throw new Error('BDSP battle_masterdatas에 BattleDataTable이 없다')
  const balls = new Map<number, { capture: string | null, ballout: string | null }>()
  for (const b of arr(table.BallEffectData) as Obj[]) {
    balls.set(num(b.BallID), {
      capture: prefabOfFile(str(b.CaptureEffectAssetbundleName)),
      ballout: prefabOfFile(str(b.IntroEffectAssetbundleName)),
    })
  }
  const moves = new Map<number, Record<string, string>>()
  for (const w of arr(table.BattleWazaData) as Obj[]) {
    const row: Record<string, string> = {}
    for (const [k, v] of Object.entries(w)) if (typeof v === 'string' && v !== '') row[k] = v
    moves.set(num(w.WazaNo), row)
  }
  const intro = new Map<number, string>()
  for (const s of arr(table.SetupIntroPlaySequenceData) as Obj[]) intro.set(num(s.Key), str(s.SeqName))
  return { balls, moves, intro }
}

/** `BattleWazaData`의 시퀀스 칸 → 우리 이름. `CmdSeqName`이 본편, `…Legend`가 전설 연출(`_fog_on`) */
const MOVE_FIELDS: Readonly<Record<string, string>> = {
  CmdSeqName: 'seq',
  CmdSeqNameLegend: 'legend',
  NotShortenTurnType0: 'notShortenTurn0',
  NotShortenTurnType1: 'notShortenTurn1',
  TurnType1: 'turn1',
  TurnType2: 'turn2',
  TurnType3: 'turn3',
  TurnType4: 'turn4',
}

/**
 * 포획 흐름 시퀀스 — `ee101`(던지기 · 빨아들이기) · `ee102~104`(흔들기) · `ee105`(성공) · `ee106~109`(튀어나옴) ·
 * `ee110~113`. `ee000`은 빈 공용 · `ee300`은 야생 도입이고, 내보내기는 `ee4xx`(`SetupIntroPlaySequenceData`)가
 * `isBallEffect=1`로 볼마다 `eb###_ballout`을 갈아 끼운다
 */
const CAPTURE_SEQ = /^ee1\d\d$/
const SENDOUT_SEQ = /^ee4\d\d(?:_seal)?$/
/**
 * 거두기 · 기절 시퀀스 — `ee610`(서 있던 마리를 볼로 거둔다) · `ee620`(트레이너의 포켓몬이 쓰러져 볼로 돌아간다) ·
 * `ee621`(야생이 쓰러진다). 무리 이름이 「ダウン引っ込みカメラ」(쓰러짐 · 거둠 카메라)이고 `PokemonMotion motion=17`(쓰러짐 `ba41`)을 튼다
 */
const RETURN_SEQ = /^ee6\d\d$/

/** 볼 모델 번들 — 볼 번호 n이 `ob02nn_00`이다 (`convert.ts`의 `POKEBALL` 머리말: 윗반구 색으로 1 마스터 · 3 슈퍼 · 4 몬스터를 쟀다) */
const BALL_BUNDLE = (id: number): string => `Characters/objects/ob02${String(id).padStart(2, '0')}_00`
/** 포켓몬 표(`PokemonInfo.Catalog`)가 든 번들 — 내보내기의 착지 갈래(`MoveType`)를 읽는다 */
const DPR_MASTERDATAS = 'Dpr/masterdatas'

/**
 * 볼 모델 한 벌의 표 — **번호로 부르는 것들의 이름**이다 (`ObjectEntity`).
 *
 * 시퀀스는 볼의 클립 · 로케이터 · 붙은 이펙트를 번호로 부른다(`DprModelAnimationPlayIndex index=6` ·
 * `DprParticleMoveRelativeModel nodeIndex=3` · `DprModelParticlePlay particleIndex=0`). 그 번호는 프리팹의
 * `ObjectEntity._animationPlayer._clips` · `_locators` · `_modelParticleEntities` 차례다 — 열여섯 볼이 다 같다(실측)
 */
export interface BallModelTable {
  /** 클립 번호 → 이름. 빈 칸은 `null` */
  clips: (string | null)[]
  /** 클립 번호 → 길이(초, `m_MuscleClip`의 `m_StopTime − m_StartTime`). 시퀀스 길이를 잴 때 쓴다 */
  seconds: (number | null)[]
  /** 로케이터 번호 → 노드 이름 (0이 뿌리 — 빈 문자열) */
  locators: string[]
  /** 붙은 이펙트 번호 → 프리팹 이름 (= 그 노드 이름) */
  particles: string[]
}

/** 볼 번들의 `ObjectEntity`에서 번호표를 읽는다 */
export function ballModelTable(env: Environment): BallModelTable | null {
  const nameOfGo = (pid: number): string | null => {
    const v = env.read(pid) as Obj | null
    return v && typeof v.m_Name === 'string' ? v.m_Name : null
  }
  const nameOfTransform = (pid: number): string | null => {
    const t = env.read(pid) as Obj | null
    // 뿌리는 번들마다 이름이 다르다(`ob0201_00` · `ob0204_00`) — 빈 문자열로 적는다(프리팹 경로와 같은 약속)
    if (t && num((t.m_Father as Obj | undefined)?.m_PathID) === 0) return ''
    const go = t?.m_GameObject as Obj | undefined
    return go ? nameOfGo(num(go.m_PathID)) : null
  }
  const nameOfBehaviour = (pid: number): string | null => {
    const b = env.read(pid) as Obj | null
    const go = b?.m_GameObject as Obj | undefined
    return go ? nameOfGo(num(go.m_PathID)) : null
  }
  for (const e of env.entries) {
    if (e.object.classId !== CLS.MonoBehaviour) continue
    const v = env.readEntry(e)
    if (!isObj(v) || !isObj(v._animationPlayer) || !Array.isArray(v._locators)) continue
    const read = (arr((v._animationPlayer as Obj)._clips) as Obj[]).map((c) => {
      const pid = num(c.m_PathID)
      return pid === 0 ? null : env.read(pid) as Obj | null
    })
    while (read.length > 0 && read[read.length - 1] === null) read.pop()
    const clips = read.map((clip) => (clip && typeof clip.m_Name === 'string' ? clip.m_Name : null))
    const seconds = read.map((clip) => {
      const m = clip?.m_MuscleClip as Obj | undefined
      return m ? Math.round((num(m.m_StopTime) - num(m.m_StartTime)) * 1e4) / 1e4 : null
    })
    const locators = (arr(v._locators) as Obj[]).map((t) => nameOfTransform(num(t.m_PathID)) ?? '')
    const particles = (arr(v._modelParticleEntities) as Obj[]).map((b) => nameOfBehaviour(num(b.m_PathID)) ?? '')
    return { clips, seconds, locators, particles }
  }
  return null
}

/**
 * 종마다 내보내기 착지 갈래 — `PokemonInfo.Catalog.MoveType`. 0이 아닌 것만 적는다(수컷 · 보통색 · 폼 0).
 *
 * 내보내기 시퀀스(`ee400` 등)는 `GroupOption 14`가 120 · 121 · 122인 묶음으로 갈린다 — 120은 1.6m 위에서 떨어져
 * 착지 동작(`PokemonIntroMotion height=160`), 121은 볼이 몸 한가운데로 가고 떨어지지 않는다, 122는 볼이 낮게 와서
 * 떨어지지 않는다. 세어 보면 `MoveType` 0이 298종(땅에 서는 것) · 1이 113종(주뱃 · 고오스 · 잉어킹 — 뜨거나 헤엄친다) ·
 * 2가 12종(리자몽 · 팬텀 · 망나뇽 · 핫삼 — 큰 날개)이라 **120 + MoveType**으로 읽는다(롬에 그 이음이 적힌 표는 없다 — 우리 짐작).
 * `ba01` 착지 클립도 0만 갖고 1 · 2는 없다(실측: 41 · 92 · 6에 `ba01`이 0개)
 */
function moveTypes(env: Environment): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of env.entries) {
    if (e.object.classId !== CLS.MonoBehaviour) continue
    const v = env.readEntry(e)
    if (!isObj(v) || v.m_Name !== 'PokemonInfo') continue
    for (const r of arr(v.Catalog) as Obj[]) {
      if (num(r.Sex) !== 0 || num(r.Rare) !== 0 || num(r.FormNo) !== 0) continue
      const t = num(r.MoveType)
      if (t !== 0) out[String(num(r.MonsNo))] = t
    }
    break
  }
  return out
}

export async function convertBattleFx(ctx: ConvertContext): Promise<Produced> {
  const src = requireBdsp(ctx)
  const at = await indexOf(src)
  const out: Produced = new Map()
  const emit = (path: string, data: Uint8Array): void => put(ctx, out, `data/fx/${path}`, data)
  const read = async (path: string): Promise<Uint8Array | null> => {
    const real = at.get(path.toLowerCase())
    return real ? src.read(real) : null
  }

  const mdBytes = await read(MASTERDATAS)
  if (!mdBytes) throw new Error(`BDSP ${MASTERDATAS}이 없습니다`)
  const tables = readTables(openEnvironment([mdBytes]))

  // 시퀀스 고르기
  const seqDir = `${SEQUENCES.toLowerCase()}/`
  const seqNames = new Map<string, string>()
  for (const [lower, real] of at) {
    if (lower.startsWith(seqDir) && lower.indexOf('/', seqDir.length) < 0) seqNames.set(lower.slice(seqDir.length), real)
  }
  const wantSeq = new Set<string>()
  for (const n of seqNames.keys()) {
    if (CAPTURE_SEQ.test(n) || SENDOUT_SEQ.test(n) || RETURN_SEQ.test(n) || n === 'ee000' || n === 'ee300') wantSeq.add(n)
  }
  for (const s of tables.intro.values()) if (s) wantSeq.add(s.toLowerCase())
  const moves: Record<string, Record<string, string>> = {}
  for (let id = 1; id <= LAST_MOVE; id++) {
    const row = tables.moves.get(id)
    if (!row) continue
    const m: Record<string, string> = {}
    for (const [field, key] of Object.entries(MOVE_FIELDS)) {
      const v = row[field]
      if (!v) continue
      m[key] = v
      wantSeq.add(v.toLowerCase())
    }
    if (Object.keys(m).length > 0) moves[String(id)] = m
  }

  const wantPrefab = new Set<string>()
  const balls: Record<string, { capture: string | null, ballout: string | null }> = {}
  for (let id = FIRST_BALL; id <= LAST_BALL; id++) {
    const b = tables.balls.get(id)
    if (!b) continue
    balls[String(id)] = b
    if (b.capture) wantPrefab.add(b.capture)
    if (b.ballout) wantPrefab.add(b.ballout)
  }

  // 볼 모델 열여섯 — 클립째 굽는다. 시퀀스가 번호로 부르는 클립 · 로케이터 · 붙은 이펙트의 이름표를 같이 적는다
  // (`BallModelTable`). 붙은 이펙트(`ee102_01_check_light` 흔들림 불빛 · `ee105_03_succeeded_light` 성공 불빛)는
  // 시퀀스의 `ParticleCreate`에 안 나오고 `DprModelParticlePlay`로만 불리므로 여기서 프리팹 목록에 넣는다
  let ballTable: BallModelTable | null = null
  const ballFiles: Record<string, string> = {}
  const missingBalls: string[] = []
  for (let id = FIRST_BALL; id <= LAST_BALL; id++) {
    check(ctx)
    const bytes = await read(BALL_BUNDLE(id))
    if (!bytes) { missingBalls.push(BALL_BUNDLE(id)); continue }
    const env = openEnvironment([bytes])
    const table = ballModelTable(env)
    if (!table) throw new Error(`볼 ${BALL_BUNDLE(id)}에 ObjectEntity가 없다`)
    // 번호표는 열여섯이 같아야 한 장으로 적을 수 있다 — 다르면 선다
    if (ballTable && JSON.stringify(ballTable) !== JSON.stringify(table)) {
      throw new Error(`볼 ${BALL_BUNDLE(id)}의 클립 · 로케이터 표가 몬스터볼과 다르다`)
    }
    ballTable ??= table
    const { glb } = await exportModel(env, encodePng, { maxSize: FX_TEXTURE, keepClips: true })
    put(ctx, out, `data/fx/ball/${String(id)}.glb`, glb)
    ballFiles[String(id)] = `ball/${String(id)}.glb`
    await breathe(ctx)
  }
  if (missingBalls.length > 0) throw new Error(`BDSP 볼 모델이 없습니다 (${missingBalls.join(' · ')})`)
  for (const p of ballTable?.particles ?? []) if (p) wantPrefab.add(p)

  // 내보내기 착지 갈래 (`moveTypes`). 표가 없으면 다 땅에 서는 것(0)으로 간다
  const dprBytes = await read(DPR_MASTERDATAS)
  const moveType = dprBytes ? moveTypes(openEnvironment([dprBytes])) : {}

  const missingSequences: string[] = []
  const bakedSequences: string[] = []
  for (const name of [...wantSeq].sort()) {
    check(ctx)
    const real = seqNames.get(name)
    const bytes = real ? await src.read(real) : null
    if (!bytes) { missingSequences.push(name); continue }
    const env = openEnvironment([bytes])
    const mono = env.entries.find((e) => e.object.classId === CLS.MonoBehaviour)
    const value = mono ? env.readEntry(mono) : null
    if (!isObj(value) || !Array.isArray(value._groupData)) throw new Error(`시퀀스 ${name}을 못 읽었다`)
    const seq = bakeSequence(value)
    for (const p of prefabsOf(seq)) wantPrefab.add(p)
    emit(`seq/${seq.name}.json`, textOf(seq))
    bakedSequences.push(seq.name)
  }

  // 공용 이펙트(착지 연기 등)
  const prefabDir = `${PREFABS.toLowerCase()}/`
  const prefabPath = new Map<string, string>()
  for (const [lower, real] of at) {
    if (lower.startsWith(prefabDir) && lower.indexOf('/', prefabDir.length) < 0) prefabPath.set(lower.slice(prefabDir.length), real)
  }
  for (const [lower, real] of prefabPath) if (lower.startsWith('cmn_')) wantPrefab.add(real.slice(prefabDir.length))
  if (prefabPath.size === 0) throw new Error('BDSP 배틀 이펙트를 하나도 못 찾았습니다 — 폴더에 없습니다')

  const shared: Uint8Array[] = []
  for (const p of SHARED_BUNDLES) {
    const b = await read(p)
    if (!b) throw new Error(`BDSP ${p}이 없습니다`)
    shared.push(b)
  }
  for (const p of NAME_ONLY_BUNDLES) {
    const b = await read(p)
    if (b) shared.push(b)
  }
  const sharedEnv = openEnvironment(shared)
  const textures = new FxTextures(emit, FX_TEXTURE)

  // 볼 · 공용을 먼저 — 그림을 이름으로 하나만 두므로 먼저 구운 쪽 크기가 남는다
  const order = [...wantPrefab].sort((a, b) => {
    const rank = (n: string): number => (/^(eb|ee|cmn)/i.test(n) ? 0 : 1)
    return rank(a) - rank(b) || a.localeCompare(b)
  })
  const absent: string[] = []
  const failed: string[] = []
  const baked: string[] = []
  const problems: Record<string, string[]> = {}
  let done = 0
  for (const want of order) {
    check(ctx)
    const real = prefabPath.get(want.toLowerCase())
    const bytes = real ? await src.read(real) : null
    if (!real || !bytes) absent.push(want)
    else {
      const name = real.slice(prefabDir.length)
      try {
        const got = await bakeFxPrefab(name, bytes, sharedEnv, textures)
        emit(`prefab/${name}.json`, textOf(got.prefab))
        if (got.problems.length) problems[name] = got.problems
        baked.push(name)
      } catch (e) {
        failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    done++
    ctx.onProgress?.(done, order.length)
    await breathe(ctx)
  }
  // ⚠️ **덤프에 있는 번들을 못 구우면 선다** (`convert.ts`의 `requireAll`과 같은 뜻). 시퀀스가 가리키는데 덤프에 **없는**
  // 프리팹(`ew003_hit` 등 32벌 — 원작 롬에도 없다)은 실패가 아니라 원래 없는 것이라 목차에 적기만 한다
  if (failed.length > 0) {
    throw new Error(`BDSP 배틀 이펙트 ${String(order.length - absent.length)}벌 중 ${String(failed.length)}벌을 못 구웠습니다 (${failed.slice(0, 3).join(' · ')})`)
  }

  emit('tex/index.json', textOf(Object.fromEntries([...textures.info].sort(([a], [b]) => a.localeCompare(b)))))
  emit('index.json', textOf({
    balls,
    moves,
    intro: Object.fromEntries(tables.intro),
    capture: bakedSequences.filter((n) => CAPTURE_SEQ.test(n)),
    ballModel: { ...ballTable, files: ballFiles },
    moveType,
    sequences: bakedSequences,
    prefabs: baked.sort(),
    missingPrefabs: absent.sort(),
    missingSequences,
    textureClashes: [...new Set(textures.clashes)].sort(),
    // 굽기는 됐지만 원본에서 못 이은 것 — 프리팹 이름 → 사연
    notes: problems,
  }))
  return out
}
