// BDSP 배틀 무대 번들 → glb — 브라우저에서 (PLAN §4.3 · DATA.md §7.4)
//
// 개발 추출기 `tools/extract/bdspArena.py`를 옮긴 것이다.
//
// ⚠️ **인물 번들과 다르다.** `model.ts`는 `SkinnedMeshRenderer` + 뼈대를 다루고
// 여기는 `MeshFilter` + `Transform` 계층뿐이다. 뼈가 없으므로 **월드 행렬을 정점에
// 구워 넣고** 재질별로 합친다 — 메시 158개를 노드 158개로 두면 드로우콜이 그만큼
// 난다.
//
// ⚠️ **좌표계는 X 뒤집기다.** `model.ts`와 같은 이유다(그쪽 머리말). 손잡이가
// 뒤집히므로 삼각형 감기 순서도 함께 뒤집는다.
import { bakeAlbedo, plantKind } from './albedo'
import {
  ARRAY_BUFFER, ELEMENT_BUFFER, FLOAT, GlbBuffer, UINT, USHORT,
  verifyGlb, writeGlb, type Gltf,
} from './glb'
import { meshFrom, CHANNEL, type MeshData } from './mesh'
import { readTexture, resize, resource, type Texture } from './texture'
import type { Environment } from './environment'
import type { UnityValue } from './typetree'

class ArenaError extends Error {
  constructor(message: string) { super(message); this.name = 'ArenaError' }
}

type Props = Record<string, UnityValue>
const num = (v: UnityValue | undefined, fallback = 0): number => (typeof v === 'number' ? v : fallback)

/** `[이름, 값]` 짝 목록을 지도로 */
function pairs(entries: UnityValue): Map<string, UnityValue> {
  const out = new Map<string, UnityValue>()
  if (!Array.isArray(entries)) return out
  for (const e of entries as UnityValue[]) {
    if (!Array.isArray(e) || e.length !== 2) continue
    const key = e[0]
    if (typeof key === 'string') out.set(key, e[1] as UnityValue)
  }
  return out
}

// ── 월드 행렬 ────────────────────────────────────────────────────────────────

export type Mat4 = Float64Array

/** Transform 하나의 로컬 행렬 (Unity 좌표계 그대로, 행 우선 4×4) */
function localMatrix(t: Props): Mat4 {
  const p = (t.m_LocalPosition ?? {}) as Props
  const q = (t.m_LocalRotation ?? {}) as Props
  const s = (t.m_LocalScale ?? {}) as Props
  const x = num(q.x)
  const y = num(q.y)
  const z = num(q.z)
  const w = num(q.w, 1)
  const sx = num(s.x, 1)
  const sy = num(s.y, 1)
  const sz = num(s.z, 1)
  const m = new Float64Array(16)
  m[0] = (1 - 2 * (y * y + z * z)) * sx
  m[1] = 2 * (x * y - z * w) * sy
  m[2] = 2 * (x * z + y * w) * sz
  m[3] = num(p.x)
  m[4] = 2 * (x * y + z * w) * sx
  m[5] = (1 - 2 * (x * x + z * z)) * sy
  m[6] = 2 * (y * z - x * w) * sz
  m[7] = num(p.y)
  m[8] = 2 * (x * z - y * w) * sx
  m[9] = 2 * (y * z + x * w) * sy
  m[10] = (1 - 2 * (x * x + y * y)) * sz
  m[11] = num(p.z)
  m[15] = 1
  return m
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[r * 4 + k]! * b[k * 4 + c]!
      out[r * 4 + c] = sum
    }
  }
  return out
}

/** 부모를 타고 올라가 월드 행렬을 만든다. 뼈가 없으므로 이걸 정점에 굽는다 */
export function worldOf(env: Environment, pathId: number, cache: Map<number, Mat4>): Mat4 {
  const had = cache.get(pathId)
  if (had) return had
  const v = env.read(pathId) as Props | null
  if (!v) {
    const identity = new Float64Array(16)
    identity[0] = identity[5] = identity[10] = identity[15] = 1
    return identity
  }
  let m = localMatrix(v)
  const father = num((v.m_Father as Props | undefined)?.m_PathID)
  // ⚠️ 순환은 실제로 없지만, 먼저 자리를 잡아 두어야 무한 재귀가 안 난다
  cache.set(pathId, m)
  if (father !== 0 && father !== pathId) m = multiply(worldOf(env, father, cache), m)
  cache.set(pathId, m)
  return m
}

// ── 재질 ─────────────────────────────────────────────────────────────────────

/**
 * ⚠️ **투명 여부를 짐작하지 않는다. 번들이 적어 두었다.** 재질마다
 * `stringTagMap`에 유니티의 `RenderType`이 그대로 실려 있다:
 *
 *   Opaque(큐 2000)             벽·바닥·바위 — 안 비친다
 *   TransparentCutout(큐 2450)  잎·풀 — 오려 낸다
 *   Transparent(큐 3000)        창으로 드는 빛·물안개 — 비친다
 *
 * 여태 **전부 오려 내기**로 구웠다. 그래서 체육관 안 창빛이 흰 널빤지로 섰다
 */
function alphaOf(kind: string): Record<string, unknown> {
  if (kind === 'Transparent') return { alphaMode: 'BLEND' }
  // ⚠️ Opaque도 오려 낸다. BDSP 셰이더는 `RenderType`이 Opaque인 재질에도 알파
  // 있는 그림을 물리는 자리가 있고(무대 나무·풀), 불투명으로 두면 잎 사이가
  // 사각형으로 막힌다. 문턱은 유니티의 `_Cutoff` 기본값이다
  return { alphaMode: 'MASK', alphaCutoff: 0.5 }
}

/** 번들의 재질을 glTF 재질 · 그림으로 — 무대와 야외(`field.ts`)가 같이 쓴다 */
interface Looks {
  images: Record<string, unknown>[]
  textures: Record<string, unknown>[]
  materials: Record<string, unknown>[]
  samplers: { wrapS: number, wrapT: number }[]
  /** 재질 이름 → glTF 재질 번호 */
  slotOf: Map<string, number>
  /** 재질 이름 → 밑그림 UV 배율 · 오프셋 */
  uvOf: Map<string, [number, number, number, number]>
  /** Material pathID → 재질 이름 */
  materialName: Map<number, string>
  /** `KHR_texture_transform`을 쓴 재질이 있는가 — 있으면 glTF `extensionsUsed`에 적어야 로더가 읽는다 */
  transformed: boolean
  /** 나무열매 잎(`blend`) 재질 슬롯 → [`_Color`, `_LayerColor`] (선형) — 정점 색 `COLOR_0`이 이 둘을 정점 알파로 섞는다 */
  blend: Map<number, [number[], number[]]>
}

/**
 * **빛 재질** — 원작이 더해서 그리고 밤에만 켜는 것 (docs/orders/VISUAL_20260930.md §2).
 *
 * 포켓몬센터 · 프렌들리숍 · 체육관 입구마다 `PokeCenLight` 한 벌이 선다. 원작 값은 `_SrcBlend 5 · _DstBlend 1`(SrcAlpha, One —
 * **더한다**)에 `_ColorIntensity 0`이라 바탕색이 0이다 — **낮에는 아무것도 안 보인다.** 빛은 `_EmissionTex`(입구 앞 빛 웅덩이
 * 그림) × `_EmissionColor` × `_EmissionColorIntensity`(5.8)로만 나고 `_EmissionOnTime`(0.4)부터 켜진다. `RenderType`만 보면
 * Transparent라 흰 반투명 판(가로 3.6 · 높이 1.8 · 깊이 4칸)이 입구를 막고 섰다.
 *
 * glTF에는 더하기도 시각도 없으므로 `extras`에 싣고 실행 쪽이 편다 (`scene/bdspLights`):
 *
 *   add      더해서 그린다
 *   glow     발광 세기 (`emissiveFactor`는 0~1이라 5.8을 못 싣는다)
 *   emitOn   발광이 켜지는 어둠 (`_EmissionOnTime`)
 *
 * ⚠️ **야외만 켠다.** 무대 · 방은 노드 굽는 쪽(`bdspArena.py`)과 바이트가 같아야 한다 — 그쪽에 없는 것을 이쪽에서만 쓰면 둘이 갈린다
 */
const ADD_SRC = 5
const ADD_DST = 1

/**
 * 그림을 glb 밖 **공용 자리**에 두는 손잡이 — 픽셀을 받아 glTF `uri`(glb에서 본 상대 주소)를 돌려준다.
 *
 * 던전이 쓴다 (docs/orders/VISUAL_20260930.md §1). 던전 138곳이 같은 그림을 평균 4.8번 되풀이해서(쓰임 4,735 · 고유 983)
 * glb마다 실으면 464MB 중 약 ⅔가 사본이다. 같은 픽셀은 한 파일로 두고 glb들이 그 주소를 나눠 가진다
 */
export type ImageShare = (rgba: Uint8Array, width: number, height: number) => Promise<string>

interface LookOptions {
  /** 텍스처 긴 변 상한. null이면 원본 */
  maxSize?: number | null
  /** 알파를 곱해서 줄인다 (`BakeOptions.premultiplied`) */
  premultiplied?: boolean
  /** 빛 재질(더하기 · 발광)을 싣는가 — 위 머리말 */
  lights?: boolean
  /** 그림을 공용 자리에 둔다 (`ImageShare`). 없으면 glb 안에 싣는다 */
  share?: ImageShare
  /** 나무열매 나무 — 재질 색을 입힌다 (`plantKind`). 노드 쪽 `bdspArena.py`의 `groups`와 같다 */
  plant?: boolean
}

/** 감마 값 → 선형. 재질에 박힌 색은 감마다 (`albedo.ts`의 레이어 색과 같은 자리) */
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/**
 * 그림 있는 재질에 곱할 색.
 *
 * 층 그림을 밑그림으로 쓴 재질은 `_LayerColor`를 곱한다. **반투명 겹그림**(길 가장자리 그러데이션 `Grad_01` · 뿌리 그림자 ·
 * 입구 그림자 …)은 `_Color` × `_ColorIntensity`와 `_Color`의 알파를 곱한다 — `Grad_01`은 (0.11, 0.1, 0.1) · 0.7이라 어둡게 번지는
 * 띠인데, 안 곱하면 **하얀 띠**가 길을 두른다. 세기가 0인 겹그림은 더하는 빛이 아니면 안 보인다(바탕이 0이다 — 물웅덩이 `Puddle_01`).
 * 불투명한 것은 그대로 둔다 — 밑그림이 이미 색이다.
 *
 * ⚠️ **방 · 무대도 곱한다** (`tinted`). 뿌리 그림자 `M_C_001_RootShadow_01`은 그림이 순백(RGB 255 · 알파만 모양)이고 색은 `_Color`
 * (0.113, 0.102, 0.102) × 세기 0.5 · 알파 0.325에 있다 — 안 곱하면 가구 밑이 **흰 후광**으로 뜬다(방 97벌 · 도서관 · 센터 · 등대)
 */
function tintOf(
  look: { floats: Map<string, UnityValue>, colors: Map<string, UnityValue> } | undefined,
  layer: boolean, add: boolean, see: boolean,
): number[] | null {
  if (!look) return null
  const rgb = (key: string): [number, number, number, number] | null => {
    const c = look.colors.get(key) as Props | undefined
    return c ? [toLinear(num(c.r, 1)), toLinear(num(c.g, 1)), toLinear(num(c.b, 1)), num(c.a, 1)] : null
  }
  if (layer) {
    const c = rgb('_LayerColor')
    return c ? [c[0], c[1], c[2], 1] : null
  }
  if (!see && !add) return null
  const c = rgb('_Color')
  if (!c) return null
  const k = look.floats.has('_ColorIntensity') ? num(look.floats.get('_ColorIntensity')) : 1
  const clamp = (x: number): number => Math.min(1, Math.max(0, x))
  return [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k), k === 0 && !add ? 0 : clamp(c[3])]
}

/** 나무열매 재질의 `_Color` · `_LayerColor` — 선형. 색은 감마로 적혀 있다 (`tintOf`와 같은 자리). 노드 쪽 `bdspArena.py`의 `plant_colors`와 같다. 없으면 흰색 */
function plantColors(look: { colors: Map<string, UnityValue> } | undefined): [number[], number[]] {
  const rgb = (key: string): number[] => {
    const c = look?.colors.get(key) as Props | undefined
    return [toLinear(num(c?.r, 1)), toLinear(num(c?.g, 1)), toLinear(num(c?.b, 1))].map(Math.fround)
  }
  return [rgb('_Color'), rgb('_LayerColor')]
}

/**
 * 빛 재질을 안 싣는 쪽(방 · 무대)에서 색을 곱하는 재질 — 층 그림이거나, 더하지 않는 반투명 겹그림.
 *
 * ⚠️ **더하는 재질은 손대지 않는다.** 방의 창빛 · 문빛 · 조명 줄기(`roomShell`의 `isLightShaft`)와 무대의 창빛(`battle/arenaLight`)은
 * 실행 쪽이 이름으로 골라 더하기로 편다. 바탕 `_Color`가 0 · 세기가 0인 것이 대부분이라(`EntranceLight` (0, 0, 0) · 0) 여기서
 * 곱하면 더할 빛이 0이 되어 통째로 사라진다
 */
function tinted(layer: boolean, add: boolean, see: boolean): boolean {
  return layer || (see && !add)
}

/**
 * 플립북 그림의 **첫 칸** — `KHR_texture_transform`의 배율 · 오프셋 (glTF UV, 위가 0).
 *
 * TV 화면 `M_C_001_Video_03`(방 12벌 — 주인공 집 `t01r0101` 1층 거실 등)은 2048×1024 한 장에 영상 칸 8×8을 담고 셰이더가
 * `_PatternH` · `_PatternV` · `_StartFrameIndex`(45)로 한 칸만 잘라 보인다. 자르지 않으면 **아틀라스가 통째로** 화면에 비친다.
 *
 * ⚠️ **칸 번호는 아래 줄부터 센다** (유니티 UV는 왼쪽 아래가 원점). 그림에 찬 칸은 위에서부터 42칸(5줄 + 2칸)이라, 위에서
 * 세면 45번은 **빈 검은 칸**이다 — 원작이 빈 칸을 첫 화면으로 골랐을 리가 없다. 아래에서 세면 위에서 셋째 줄 여섯째 칸이다.
 * 칸을 넘기는 것(`_SwitchingTime` · `_AutoSwitch`)은 아직 안 옮긴다 — 첫 칸에 머문다
 */
export function flipbookCell(columns: number, rows: number, start: number): { offset: [number, number], scale: [number, number] } | null {
  if (!(columns >= 1 && rows >= 1) || columns * rows <= 1) return null
  const cell = ((Math.trunc(start) % (columns * rows)) + columns * rows) % (columns * rows)
  const col = cell % columns
  const fromBottom = Math.floor(cell / columns)
  return { offset: [col / columns, (rows - 1 - fromBottom) / rows], scale: [1 / columns, 1 / rows] }
}

export async function bakeLooks(
  env: Environment,
  encodePng: (rgba: Uint8Array, width: number, height: number) => Promise<Uint8Array>,
  buf: GlbBuffer,
  options: LookOptions = {},
): Promise<Looks> {
  const maxSize = options.maxSize ?? null
  const lights = options.lights ?? false
  const plant = options.plant ?? false
  /** 그림 한 장을 glTF 그림으로 — 공용 자리가 있으면 거기 두고 주소만, 없으면 glb 안에 싣는다 */
  const image = async (px: Uint8Array, w: number, h: number, name: string): Promise<Record<string, unknown>> => {
    if (options.share) return { uri: await options.share(px, w, h), name }
    return { bufferView: buf.view(await encodePng(px, w, h)), mimeType: 'image/png', name }
  }
  const renderType = new Map<string, string>()
  const materialName = new Map<number, string>()
  for (const e of env.ofType('Material')) {
    const v = env.readEntry(e) as Props | null
    if (!v) continue
    const mat = (v.m_Name as string | undefined) ?? '?'
    materialName.set(e.object.pathId, mat)
    const tags = pairs(v.stringTagMap)
    renderType.set(mat, (tags.get('RenderType') as string | undefined) ?? 'Opaque')
  }
  /** 더해서 그리는 재질 (`ADD_SRC` · `ADD_DST`). 더하기 · 발광을 싣는 것은 빛 재질을 싣는 쪽만이다 */
  const additive = new Set<string>()
  /** 재질마다 색 · 수 · 물린 그림 칸 */
  const looks = new Map<string, { floats: Map<string, UnityValue>, colors: Map<string, UnityValue>, slots: Set<string> }>()
  /** 나무열매만 — 재질마다 색 입히는 길 */
  const plantOf = new Map<string, 'blend' | 'mask' | 'plain'>()
  for (const e of env.ofType('Material')) {
    const v = env.readEntry(e) as Props | null
    if (!v) continue
    const saved = (v.m_SavedProperties ?? {}) as Props
    const floats = pairs(saved.m_Floats)
    const mat = (v.m_Name as string | undefined) ?? '?'
    const slots = new Set<string>()
    for (const [k, raw] of pairs(saved.m_TexEnvs)) {
      if (num(((raw as Props).m_Texture as Props | undefined)?.m_PathID) !== 0) slots.add(k)
    }
    looks.set(mat, { floats, colors: pairs(saved.m_Colors), slots })
    if (plant) {
      const te = pairs(saved.m_TexEnvs)
      const pidOf = (k: string): number => num(((te.get(k) as Props | undefined)?.m_Texture as Props | undefined)?.m_PathID)
      plantOf.set(mat, plantKind(String(v.m_ShaderKeywords ?? ''), pidOf('_MainTex'), pidOf('_LayerTex')))
    }
    if (num(floats.get('_SrcBlend')) === ADD_SRC && num(floats.get('_DstBlend')) === ADD_DST) additive.add(mat)
  }
  /**
   * **밑그림이 층 그림에 있는 재질** — `_MainTex`가 없거나 `_ColorIntensity`가 0이라 바탕이 안 보이고 `_LayerTex` × `_LayerColor`가
   * 색을 낸다. 던전 땅 · 벽(`M_C_001_Ground_05_02` · `M_D_004_Floor_01_1F_01` …)이 그렇다 — 밑그림만 찾으면 그림 없는 재질로 떨어져
   * 흰(바탕 `_Color`) 또는 검은(× 세기 0) 판이 된다. 방에서는 굽도리 벽 `ComWall_0x`(검정 — 운하 체육관 `c05r1101` 기둥의 검은
   * 계단 띠)와 물가 체육관 `c08gym0101~0103`의 `…_02` 바닥 · 벽(흰 판)이 그랬다.
   *
   * ⚠️ **빛 재질을 안 싣는 쪽은 더하는 재질을 층 그림으로 안 돌린다** (`tinted`와 같은 까닭). 조명 줄기 `SpotLight_01`은 바탕 세기가
   * 0이지만 줄기 모양이 밑그림(`GradLightMask_02_M`)에 있고 층 그림은 알파가 꽉 찬 구름 무늬다 — 돌리면 실행 쪽이 네모난 구름
   * 판을 더해 그린다
   */
  const layered = new Set<string>()
  for (const [mat, l] of looks) {
    const k = l.floats.has('_ColorIntensity') ? num(l.floats.get('_ColorIntensity')) : 1
    if (!l.slots.has('_LayerTex') || (l.slots.has('_MainTex') && k !== 0)) continue
    if (lights || !additive.has(mat)) layered.add(mat)
  }
  const textureAt = new Map<number, { entry: ReturnType<Environment['ofType']>[number], read: Texture | null }>()
  for (const e of env.ofType('Texture2D')) textureAt.set(e.object.pathId, { entry: e, read: null })
  /** 발광 그림 — 그대로 읽어 줄이기만 한다. 레이어 색 · 마스크를 곱하는 `bakeAlbedo`의 틀이 아니다 */
  const emissionImage = async (pid: number): Promise<number | null> => {
    const at = textureAt.get(pid)
    if (!at) return null
    at.read ??= readTexture(env.read(pid) as Props, at.entry.bundle)
    const t = at.read
    let [w, h, px] = [t.width, t.height, t.pixels]
    if (maxSize !== null && Math.max(w, h) > maxSize) {
      const k = maxSize / Math.max(w, h)
      const tw = Math.max(1, Math.round(w * k)); const th = Math.max(1, Math.round(h * k))
      px = resize(px, w, h, tw, th); w = tw; h = th
    }
    images.push(await image(px, w, h, t.name))
    // 발광 그림은 되풀이하지 않는 한 장이다 — 원작 반복 방식(0 Repeat · 1 Clamp)을 그대로 둔다
    const wrap = t.wrapU === 1 ? 33071 : 10497
    let sampler = samplers.findIndex((s) => s.wrapS === wrap && s.wrapT === wrap)
    if (sampler < 0) { samplers.push({ wrapS: wrap, wrapT: wrap }); sampler = samplers.length - 1 }
    textures.push({ source: images.length - 1, sampler })
    return textures.length - 1
  }

  /**
   * **마스크로 두 색을 섞는 그림 없는 재질** — 바탕(`_MainTex`)도 층(`_LayerTex`)도 없이 `_BlendTex`만 물렸다.
   * 충호 방(g038) 바닥 `M_B_038_Floor_24`가 그렇다 — `_CASCADE_BLENDUV0`라 첫 UV로 `_BlendTex`를 읽어 R만큼
   * `_Color` × `_ColorIntensity`(0.75 × 1.7 — 가운데 빛)에서 `_LayerColor` × `_LayerColorIntensity`(남청)로 넘어간다.
   * `_Color`만 실으면 25 m 판이 통째로 하얗게 탄다. 섞은 색을 그림 한 장으로 굽는다 — `bdspArena.py`의 `cascade_mix`와 같다
   */
  const cascadeMix = async (v: Props, colors: Map<string, UnityValue>, floats: Map<string, UnityValue>):
    Promise<{ px: Uint8Array, w: number, h: number } | null> => {
    // 둘째 UV로 읽는 것(`_BlendUVIndex` 1 — g009 · g010 바다)과 거울 반사 물(`_ENVIRONMENTMAPENABLE_MIRRORMAP` — g011)은
    // 둘째 UV를 안 싣고 반사도 안 옮기니 손대지 않는다
    const words = String(v.m_ShaderKeywords ?? '')
    if (!words.includes('_CASCADE_BLENDUV0') || words.includes('MIRRORMAP') || num(floats.get('_BlendUVIndex')) !== 0) return null
    const te = pairs(((v.m_SavedProperties ?? {}) as Props).m_TexEnvs)
    const pidOf = (k: string): number => num(((te.get(k) as Props | undefined)?.m_Texture as Props | undefined)?.m_PathID)
    if (pidOf('_BlendTex') === 0 || pidOf('_MainTex') !== 0 || pidOf('_LayerTex') !== 0) return null
    const at = textureAt.get(pidOf('_BlendTex'))
    if (!at) return null
    at.read ??= readTexture(env.read(pidOf('_BlendTex')) as Props, at.entry.bundle)
    let [w, h, px] = [at.read.width, at.read.height, at.read.pixels]
    if (maxSize !== null && Math.max(w, h) > maxSize) {
      const k = maxSize / Math.max(w, h)
      const tw = Math.max(1, Math.round(w * k)); const th = Math.max(1, Math.round(h * k))
      px = resize(px, w, h, tw, th); w = tw; h = th
    }
    const lin = (key: string, gain: string): number[] => {
      const c = (colors.get(key) ?? {}) as Props
      const k = floats.has(gain) ? num(floats.get(gain)) : 1
      return [toLinear(num(c.r, 1)) * k, toLinear(num(c.g, 1)) * k, toLinear(num(c.b, 1)) * k]
    }
    const a = lin('_Color', '_ColorIntensity')
    const b = lin('_LayerColor', '_LayerColorIntensity')
    const toSrgb = (x: number): number => (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055)
    const out = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const r = px[i * 4]! / 255
      for (let c = 0; c < 3; c++) {
        const m = Math.min(1, Math.max(0, a[c]! * (1 - r) + b[c]! * r))
        out[i * 4 + c] = Math.round(toSrgb(m) * 255)
      }
      out[i * 4 + 3] = 255
    }
    return { px: out, w, h }
  }

  const images: Record<string, unknown>[] = []
  const textures: Record<string, unknown>[] = []
  const materials: Record<string, unknown>[] = []
  const samplers: { wrapS: number, wrapT: number }[] = []
  const slotOf = new Map<string, number>()
  const uvOf = new Map<string, [number, number, number, number]>()
  const blend = new Map<number, [number[], number[]]>()

  // 알베도는 번들 통째로 한 번만 굽는다 (albedo.ts 머리말).
  //
  // ⚠️ **이름순으로 세운다.** 재질 차례가 곧 프리미티브 차례이고, 번들 안
  // 오브젝트 차례는 덤프마다 달라질 수 있다. 개발 추출기도 이름순이라
  // (`sorted(albedo.glob(...))`) parity를 바로 잴 수 있다
  //
  // ⚠️ 더하는 물(`additiveWater`)은 빛 재질을 안 싣는 쪽만 보통 섞기로 옮겨 굽는다 — 싣는 쪽은 더하기를 그대로 싣는다
  const premultiplied = options.premultiplied ?? false
  const main = bakeAlbedo(env, { maxSize, premultiplied, additiveWater: !lights, plant }).filter((m) => !layered.has(m.name))
  const layer = layered.size === 0 ? [] : bakeAlbedo(env, { maxSize, premultiplied, mainProps: ['_LayerTex'] }).filter((m) => layered.has(m.name))
  const baked = [...main, ...layer]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  let transformed = false
  for (const m of baked) {
    images.push(await image(m.pixels, m.width, m.height, m.name))
    const want = { wrapS: m.look.wrap[0], wrapT: m.look.wrap[1] }
    let sampler = samplers.findIndex((s) => s.wrapS === want.wrapS && s.wrapT === want.wrapT)
    if (sampler < 0) { samplers.push(want); sampler = samplers.length - 1 }
    textures.push({ source: images.length - 1, sampler })
    const look = looks.get(m.name)
    const lay = layered.has(m.name)
    const add = additive.has(m.name)
    const see = renderType.get(m.name) === 'Transparent'
    let tint = lights
      ? tintOf(look, lay, add, see)
      : tinted(lay, add, see) ? tintOf(look, lay, false, see) : null
    // ⚠️ **나무열매는 재질 색이 곧 색이다.** 줄기 · 잎 · 꽃 그림은 회색 마스크라 안 곱하면 **하얗다**.
    //   plain  `_Color`를 `baseColorFactor`로 · mask  꽃은 그림에 구워 넣었다 · blend  잎은 정점 색 `COLOR_0`이 낸다
    // float32로 눌러 싣는다 — 노드 쪽과 JSON이 같게(`pow`가 끝자리에서 갈려도 float32에서 만난다)
    if (plant) {
      const kind = plantOf.get(m.name) ?? 'plain'
      const [c0, c1] = plantColors(look)
      tint = kind === 'plain' ? [Math.fround(c0[0]!), Math.fround(c0[1]!), Math.fround(c0[2]!), 1] : null
      if (kind === 'blend') blend.set(materials.length, [c0, c1])
    }
    // 플립북은 첫 칸만 (`flipbookCell`) — 층 그림 재질에는 칸이 없다
    const cell = lay || !look ? null
      : flipbookCell(num(look.floats.get('_PatternH'), 1), num(look.floats.get('_PatternV'), 1), num(look.floats.get('_StartFrameIndex')))
    if (cell) transformed = true
    materials.push({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorTexture: {
          index: textures.length - 1,
          ...(cell ? { extensions: { KHR_texture_transform: cell } } : {}),
        },
        ...(tint ? { baseColorFactor: tint } : {}),
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
      ...alphaOf(renderType.get(m.name) ?? 'Opaque'),
      doubleSided: true,
      ...(lights && add ? { alphaMode: 'BLEND', extras: { add: true } } : {}),
    })
    slotOf.set(m.name, materials.length - 1)
    // ⚠️ **재질이 적어 둔 UV 배율을 먹여야 한다.** 무대 바닥이 배율 (11, 11)로
    // 되풀이하는 그림이다 — 안 먹이면 타일 121장이 한 장으로 늘어난다
    uvOf.set(m.name, m.look.uv)
  }

  // ⚠️ **그림 없는 재질도 재질이다.** 무대에는 `_MainTex`가 아예 없는 재질이
  // 섞여 있다 — g010의 **바닷물**과 g006의 굴 안 **불빛**이 그렇다. 무늬가 없을
  // 뿐 색은 `_Color`에 들어 있다. 슬롯을 안 주면 glTF 규격상 **흰색 기본 재질**이
  // 붙는다 — 바다가 하얀 판으로 깔리고 굴 안에 흰 널이 선다
  for (const e of env.ofType('Material')) {
    const v = env.readEntry(e) as Props | null
    if (!v) continue
    const mat = (v.m_Name as string | undefined) ?? '?'
    if (slotOf.has(mat)) continue
    const saved = (v.m_SavedProperties ?? {}) as Props
    const colors = pairs(saved.m_Colors)
    const floats = pairs(saved.m_Floats)
    const base = (colors.get('_Color') ?? {}) as Props
    const plain: Record<string, unknown> = {
      name: mat,
      pbrMetallicRoughness: {
        baseColorFactor: [num(base.r, 1), num(base.g, 1), num(base.b, 1), num(base.a, 1)],
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
      ...alphaOf(renderType.get(mat) ?? 'Opaque'),
      doubleSided: true,
    }
    const mixed = await cascadeMix(v, colors, floats)
    if (mixed !== null) {
      images.push(await image(mixed.px, mixed.w, mixed.h, mat))
      let sampler = samplers.findIndex((s) => s.wrapS === 10497 && s.wrapT === 10497)
      if (sampler < 0) { samplers.push({ wrapS: 10497, wrapT: 10497 }); sampler = samplers.length - 1 }
      textures.push({ source: images.length - 1, sampler })
      const pbr = plain.pbrMetallicRoughness as Record<string, unknown>
      pbr.baseColorTexture = { index: textures.length - 1 }
      pbr.baseColorFactor = [1, 1, 1, 1]
    }
    // 스스로 빛나는 것. 세기까지는 안 옮긴다 — glTF의 `emissiveFactor`는 0~1이라
    // 4배를 실을 수 없다
    const glow = colors.get('_EmissionColor') as Props | undefined
    const strength = num(floats.get('_EmissionColorIntensity'))
    // ⚠️ **빛 재질을 싣는 쪽은 발광 그림이 있을 때만 빛낸다** (아래). 물(`Water_03` · `LakeWater_01` · `SeaWater_*`)은 발광 그림 없이
    // `_EmissionColor` 흰색 × 4.8을 들고 있는데, 물 셰이더가 반사에 쓰는 값이다 — 늘 켠 흰 발광으로 옮기면 호수와 바다가 하얗게 탄다
    if (glow && strength > 0 && !lights) {
      plain.emissiveFactor = [num(glow.r), num(glow.g), num(glow.b)]
    }
    if (lights) {
      // 바탕색에 `_ColorIntensity`를 곱한다 — 빛 재질은 0이라 낮에 안 보인다
      const k = floats.has('_ColorIntensity') ? num(floats.get('_ColorIntensity')) : 1
      const pbr = plain.pbrMetallicRoughness as { baseColorFactor: number[] }
      pbr.baseColorFactor = [num(base.r, 1) * k, num(base.g, 1) * k, num(base.b, 1) * k, num(base.a, 1)]
      const extras: Record<string, unknown> = {}
      if (additive.has(mat)) { plain.alphaMode = 'BLEND'; extras.add = true }
      const tex = pairs(saved.m_TexEnvs).get('_EmissionTex') as Props | undefined
      const pid = num((tex?.m_Texture as Props | undefined)?.m_PathID)
      if (glow && strength > 0 && pid !== 0) {
        const index = await emissionImage(pid)
        if (index !== null) {
          plain.emissiveTexture = { index }
          extras.glow = strength
          extras.emitOn = num(floats.get('_EmissionOnTime'))
        }
      }
      if (Object.keys(extras).length > 0) plain.extras = extras
    }
    materials.push(plain)
    slotOf.set(mat, materials.length - 1)
  }

  return { images, textures, materials, samplers, slotOf, uvOf, materialName, transformed, blend }
}

// ── 내보내기 ─────────────────────────────────────────────────────────────────

interface ArenaOptions {
  /** 무대 한가운데에서 이보다 먼 메시는 버린다 (m). null이면 전부 */
  far?: number | null
  /**
   * 텍스처 긴 변 상한.
   *
   * ⚠️ **무대는 줄이지 않는다.** 인물·포켓몬은 화면에 드는 크기가 정해져 있어
   * 256이면 텍셀이 남지만, 무대 바닥은 배율 (11, 11)로 되풀이하는 그림이라
   * 줄이면 발밑 전체가 뭉갠다. 개발 추출기도 여기는 원본 그대로 굽는다
   */
  maxSize?: number | null
  /** glTF 노드·메시에 적을 이름. 개발 추출기는 번들 이름을 적는다 */
  name?: string
  /**
   * 뿌리 바로 아래 자식마다 노드를 따로 둔다 — 나무열매 `kinoNNN`의 `Miki`(줄기) · `Hana`(꽃) · `Mi`(열매).
   * 노드 쪽 `bdspArena.py`의 `groups`와 같다. 노드는 이름순이다
   */
  groups?: boolean
  /** 알파를 곱해서 줄인다 — 나무열매가 쓴다 (`BakeOptions.premultiplied`) */
  premultiplied?: boolean
  /** 나무열매 나무 — 재질 색을 입힌다 (`bakeLooks`의 `plant`). 잎은 정점 색 `COLOR_0`을 싣는다 */
  plant?: boolean
}

interface ArenaStat {
  meshes: number
  dropped: number
  vertices: number
  triangles: number
  materials: number
  draws: number
  width: number
  height: number
  depth: number
  bytes: number
  problems: string[]
}

interface Part {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  /** 정점 색 `COLOR_0` (RGBA · 선형) — 나무열매 잎만 */
  colors?: Float32Array
}

/** 정점당 `want`개 값으로 편다. 없거나 개수가 안 맞으면 `fallback`으로 채운다 */
export function lanes(
  raw: Float32Array | undefined, dim: number | undefined,
  n: number, want: number, fallback: readonly number[],
): Float32Array {
  const out = new Float32Array(n * want)
  if (!raw || dim === undefined || dim < want || raw.length < n * dim) {
    for (let i = 0; i < n; i++) for (let k = 0; k < want; k++) out[i * want + k] = fallback[k]!
    return out
  }
  // ⚠️ **성분 개수가 3이라고 가정하면 안 된다.** BDSP 무대 메시의 법선 스트림이
  // 정점당 4성분으로 들어 있는 것이 있다 (`g001`에서 10,444 = 2,611 × 4)
  for (let i = 0; i < n; i++) for (let k = 0; k < want; k++) out[i * want + k] = raw[i * dim + k]!
  return out
}

/** 뿌리 바로 아래 자식의 이름 — 노드 쪽 `top_group`과 같다. 뿌리 자신이면 뿌리 이름 */
function topGroup(env: Environment, transformPid: number): string {
  const chain: string[] = []
  let pid = transformPid
  const seen = new Set<number>()
  while (pid !== 0 && !seen.has(pid)) {
    seen.add(pid)
    const t = env.read(pid) as Props | null
    if (!t) break
    const go = env.read(num((t.m_GameObject as Props | undefined)?.m_PathID)) as Props | null
    chain.push(typeof go?.m_Name === 'string' ? go.m_Name : '')
    pid = num((t.m_Father as Props | undefined)?.m_PathID)
  }
  return chain.length >= 2 ? chain[chain.length - 2]! : (chain[0] ?? '')
}

export async function exportArena(
  env: Environment,
  encodePng: (rgba: Uint8Array, width: number, height: number) => Promise<Uint8Array>,
  options: ArenaOptions = {},
): Promise<{ glb: Uint8Array, stat: ArenaStat }> {
  const far = options.far ?? null
  const name = options.name ?? 'arena'
  const filters = env.ofType('MeshFilter')
  if (filters.length === 0) throw new ArenaError('MeshFilter가 없다')

  // 재질 이름 → RenderType. 짐작하지 않고 번들이 적어 둔 것을 읽는다
  const buf = new GlbBuffer()
  const { images, textures, materials, samplers, slotOf, uvOf, materialName, transformed, blend } =
    await bakeLooks(env, encodePng, buf, { maxSize: options.maxSize ?? null, premultiplied: options.premultiplied ?? false, plant: options.plant ?? false })

  const cache = new Map<number, Mat4>()
  /** 묶음 이름 → (재질 슬롯 → 그 재질로 그리는 조각들). `groups`가 아니면 묶음은 `name` 하나다 */
  const parts = new Map<string, Map<number, Part[]>>()
  let kept = 0
  let dropped = 0
  let lowX = Infinity; let highX = -Infinity
  let lowY = Infinity; let highY = -Infinity
  let lowZ = Infinity; let highZ = -Infinity

  for (const filter of filters) {
    const mf = env.readEntry(filter) as Props | null
    if (!mf) continue
    const meshPid = num((mf.m_Mesh as Props | undefined)?.m_PathID)
    const meshValue = env.read(meshPid) as Props | null
    if (!meshValue) continue
    let mesh: MeshData
    // ⚠️ 정점 자료가 `.resS`에 나가 있는 메시가 절반이 넘는다 (`meshFrom`)
    const holder = env.bundleOf(meshPid)
    try {
      mesh = meshFrom(meshValue, (p) => (holder ? resource(holder, p) : null))
    } catch { continue }
    if (mesh.vertexCount === 0) continue

    const goPid = num((mf.m_GameObject as Props | undefined)?.m_PathID)
    const go = env.read(goPid) as Props | null
    if (!go) continue
    let transformPid = 0
    let slots: number[] = []
    for (const c of (go.m_Component as UnityValue[] | undefined) ?? []) {
      // ⚠️ **`m_Component`은 `pair<int, PPtr>`의 벡터다.** 타입 트리 판에 따라
      // `[first, second]` 배열로도, `{ component: PPtr }`로도, PPtr 자체로도 온다.
      // 배열 갈래를 빠뜨렸더니 GameObject마다 Transform도 MeshRenderer도 못 찾아
      // **메시를 전부 버렸다** — g001이 6.9MB에서 1.3MB로 줄었고, 그 차이는
      // "무대가 좀 휑하다"로만 보였다
      const holder = (Array.isArray(c) ? c[1] : c) as Props
      const ptr = (holder.component ?? holder) as Props
      const pid = num(ptr.m_PathID)
      const type = env.entryOf(pid)?.type
      if (type === 'Transform' || type === 'RectTransform') transformPid = pid
      if (type === 'MeshRenderer') {
        const mr = env.read(pid) as Props | null
        slots = ((mr?.m_Materials as Props[] | undefined) ?? []).map((p) => num(p.m_PathID))
      }
    }
    // MeshRenderer가 없으면 그리지 않는 메시다 (충돌 전용). 건너뛴다
    if (slots.length === 0 || transformPid === 0) continue

    const world = worldOf(env, transformPid, cache)
    const group = options.groups ? topGroup(env, transformPid) : name
    const n = mesh.vertexCount
    const rawPos = mesh.attributes.get(CHANNEL.position)
    if (!rawPos) continue
    const posDim = mesh.dimensions.get(CHANNEL.position)
    const src = lanes(rawPos, posDim, n, 3, [0, 0, 0])
    const verts = new Float32Array(n * 3)
    let nearest = Infinity
    for (let i = 0; i < n; i++) {
      const x = src[i * 3]!; const y = src[i * 3 + 1]!; const z = src[i * 3 + 2]!
      const wx = world[0]! * x + world[1]! * y + world[2]! * z + world[3]!
      const wy = world[4]! * x + world[5]! * y + world[6]! * z + world[7]!
      const wz = world[8]! * x + world[9]! * y + world[10]! * z + world[11]!
      // X 뒤집기 (머리말)
      verts[i * 3] = -wx
      verts[i * 3 + 1] = wy
      verts[i * 3 + 2] = wz
      const d = Math.hypot(wx, wz)
      if (d < nearest) nearest = d
    }
    if (far !== null && nearest > far) { dropped++; continue }
    kept++

    const normals = new Float32Array(n * 3)
    const rawNrm = lanes(mesh.attributes.get(CHANNEL.normal), mesh.dimensions.get(CHANNEL.normal),
      n, 3, [0, 1, 0])
    for (let i = 0; i < n; i++) {
      const x = rawNrm[i * 3]!; const y = rawNrm[i * 3 + 1]!; const z = rawNrm[i * 3 + 2]!
      const wx = world[0]! * x + world[1]! * y + world[2]! * z
      const wy = world[4]! * x + world[5]! * y + world[6]! * z
      const wz = world[8]! * x + world[9]! * y + world[10]! * z
      const len = Math.hypot(wx, wy, wz)
      if (len > 1e-9) {
        normals[i * 3] = -wx / len
        normals[i * 3 + 1] = wy / len
        normals[i * 3 + 2] = wz / len
      } else {
        normals[i * 3 + 1] = 1
      }
    }
    const rawUv = lanes(mesh.attributes.get(CHANNEL.uv0), mesh.dimensions.get(CHANNEL.uv0),
      n, 2, [0, 0])
    // 정점 색의 알파 — 잎(`blend`)이 `_Color` ↔ `_LayerColor`를 이 값으로 섞는다. 8비트라 0..1로 읽힌다. 없으면 흰 정점 색(알파 1)이다
    const rawColor = lanes(mesh.attributes.get(CHANNEL.color), mesh.dimensions.get(CHANNEL.color), n, 4, [1, 1, 1, 1])

    const wide = num(meshValue.m_IndexFormat) === 1
    for (let s = 0; s < mesh.subMeshes.length; s++) {
      const sub = mesh.subMeshes[s]!
      const first = Math.floor(sub.firstByte / (wide ? 4 : 2))
      const tri = mesh.indices.subarray(first, first + sub.indexCount)
      if (tri.length < 3) continue
      // 슬롯이 서브메시보다 적으면 그 서브메시는 재질이 없다. **마지막 것을 돌려
      // 쓰지 않는다** — 엉뚱한 그림이 붙는다
      const pid = s < slots.length ? slots[s]! : 0
      const name = materialName.get(pid)
      const slot = name === undefined ? -1 : (slotOf.get(name) ?? -1)
      const [sx, sy, ox, oy] = (name === undefined ? undefined : uvOf.get(name)) ?? [1, 1, 0, 0]
      const uvs = new Float32Array(n * 2)
      for (let i = 0; i < n; i++) {
        uvs[i * 2] = rawUv[i * 2]! * sx + ox
        // Unity는 UV 원점이 왼쪽 아래, glTF는 왼쪽 위다
        uvs[i * 2 + 1] = 1 - (rawUv[i * 2 + 1]! * sy + oy)
      }
      // X를 뒤집었으므로 감기 순서를 되돌린다
      const indices = new Uint32Array(tri.length - (tri.length % 3))
      for (let i = 0; i + 2 < tri.length; i += 3) {
        indices[i] = tri[i + 2]!
        indices[i + 1] = tri[i + 1]!
        indices[i + 2] = tri[i]!
      }
      let bySlot = parts.get(group)
      if (!bySlot) parts.set(group, bySlot = new Map())
      const list = bySlot.get(slot)
      // 잎 — `COLOR_0` = lerp(_Color, _LayerColor, 정점 알파) (선형 · 알파 1). ⚠️ 알파 높은 곳(줄기 쪽)이 더 어두운 `_LayerColor`다
      // (잎 181장에서 알파는 잎자루에서 멀수록 낮다 — 78%) · float32로 한 단계씩 — 노드 쪽 `bdspArena.py`와 바이트가 같게
      const pair = blend.get(slot)
      let colors: Float32Array | undefined
      if (pair) {
        const [base, top] = pair
        colors = new Float32Array(n * 4)
        for (let i = 0; i < n; i++) {
          const a = rawColor[i * 4 + 3]!
          const k = Math.fround(1 - a)
          for (let c = 0; c < 3; c++) colors[i * 4 + c] = Math.fround(Math.fround(base[c]! * k) + Math.fround(top[c]! * a))
          colors[i * 4 + 3] = 1
        }
      }
      const part: Part = { positions: verts, normals, uvs, indices, ...(colors ? { colors } : {}) }
      if (list) list.push(part)
      else bySlot.set(slot, [part])
    }

    for (let i = 0; i < n; i++) {
      const x = verts[i * 3]!; const y = verts[i * 3 + 1]!; const z = verts[i * 3 + 2]!
      if (x < lowX) lowX = x
      if (x > highX) highX = x
      if (y < lowY) lowY = y
      if (y > highY) highY = y
      if (z < lowZ) lowZ = z
      if (z > highZ) highZ = z
    }
  }

  if (parts.size === 0) throw new ArenaError('그릴 메시가 하나도 없다')

  const meshes: { name: string, primitives: Record<string, unknown>[] }[] = []
  let draws = 0
  let totalV = 0
  let totalT = 0
  for (const group of [...parts.keys()].sort()) {
    const primitives: Record<string, unknown>[] = []
    meshes.push({ name: group, primitives })
    const bySlot = parts.get(group)!
    for (const slot of [...bySlot.keys()].sort((a, b) => a - b)) {
      const chunks = bySlot.get(slot)!
      const count = chunks.reduce((a, c) => a + c.positions.length / 3, 0)
      const idxCount = chunks.reduce((a, c) => a + c.indices.length, 0)
      const pos = new Float32Array(count * 3)
      const nrm = new Float32Array(count * 3)
      const tex = new Float32Array(count * 2)
      const idx = new Uint32Array(idxCount)
      const col = chunks.every((c) => c.colors) ? new Float32Array(count * 4) : null
      let base = 0
      let atI = 0
      for (const c of chunks) {
        if (col && c.colors) col.set(c.colors, base * 4)
        pos.set(c.positions, base * 3)
        nrm.set(c.normals, base * 3)
        tex.set(c.uvs, base * 2)
        for (let i = 0; i < c.indices.length; i++) idx[atI + i] = c.indices[i]! + base
        atI += c.indices.length
        base += c.positions.length / 3
      }
      totalV += count
      totalT += idxCount / 3
      const prim: Record<string, unknown> = {
        attributes: {
          POSITION: buf.add(pos, 'VEC3', FLOAT, ARRAY_BUFFER, true),
          NORMAL: buf.add(nrm, 'VEC3', FLOAT, ARRAY_BUFFER),
          TEXCOORD_0: buf.add(tex, 'VEC2', FLOAT, ARRAY_BUFFER),
        },
        // 색인은 정점이 65,536개 안쪽이면 16비트로 넣는다 — 무대 하나에서 0.8MB가
        // 빠진다. glTF는 둘 다 허용한다
        indices: count <= 65536
          ? buf.add(Uint16Array.from(idx), 'SCALAR', USHORT, ELEMENT_BUFFER)
          : buf.add(idx, 'SCALAR', UINT, ELEMENT_BUFFER),
        mode: 4,
      }
      if (col) (prim.attributes as Record<string, number>).COLOR_0 = buf.add(col, 'VEC4', FLOAT, ARRAY_BUFFER)
      if (slot >= 0) prim.material = slot
      primitives.push(prim)
      draws++
    }
  }

  const gltf: Gltf & { extensionsUsed?: string[] } = {
    asset: { version: '2.0', generator: 'radiant-platinum bdsp arena' },
    scene: 0,
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((m, i) => ({ name: m.name, mesh: i })),
    meshes,
    materials,
    textures,
    images,
    accessors: buf.accessors,
    bufferViews: buf.views,
    buffers: [{ byteLength: buf.byteLength }],
  }
  // 빈 배열은 glTF가 안 받는다
  if (samplers.length > 0) gltf.samplers = samplers
  // TV 화면의 첫 칸 (`flipbookCell`)
  if (transformed) gltf.extensionsUsed = ['KHR_texture_transform']

  const glb = writeGlb(gltf, buf.bytes())
  return {
    glb,
    stat: {
      meshes: kept,
      dropped,
      vertices: totalV,
      triangles: totalT,
      materials: materials.length,
      draws,
      width: Number((highX - lowX).toFixed(2)),
      height: Number((highY - lowY).toFixed(2)),
      depth: Number((highZ - lowZ).toFixed(2)),
      bytes: glb.byteLength,
      problems: verifyGlb(glb),
    },
  }
}
