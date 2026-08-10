// BDSP 캐릭터 알베도 굽기 — 브라우저에서 (PLAN §4.3 · DATA.md §2.17)
//
// BDSP 셰이더는 색을 텍스처가 아니라 **재질 파라미터**에 둔다:
//
//     albedo = 밑그림(음영) × 레이어색[_MaskTex 채널]
//
// `_MaskTex`는 순수 R/G/B/검정으로 칠해진 선택자다. R·G·B가 각각 색 프로퍼티
// 하나를 고르고, 검정은 틴트 없음이다. 런타임에서 이 셰이더를 다시 만들지 않고
// 여기서 미리 곱해 평범한 그림 한 장으로 굽는다.
//
// ⚠️ **개발 추출기(`tools/extract/bdsp_bake_albedo.py`)와 같은 식이어야 한다.**
// 여기가 갈리면 개발판과 공개판의 사람 색이 달라지고, 그 차이는 "왠지 칙칙하다"
// 로만 보여서 아무도 버그로 신고하지 않는다.
import { readTexture, resize, type Texture } from './texture'
import type { Environment } from './environment'
import type { UnityValue } from './typetree'

export class AlbedoError extends Error {
  constructor(message: string) { super(message); this.name = 'AlbedoError' }
}

/**
 * ⚠️ 두 매핑은 **별개다.** 하나로 묶으면 의상을 맞추는 순간 머리·눈·얼굴이 깨진다.
 *
 * ① `_MaskTex`의 RGB 채널 → 셰이더 색 프로퍼티. 실제 화면과 대조해 확정했다
 */
const MASK_CHANNEL_PROPS = ['_SkinColor', '_PrimaryColor', '_SecondaryColor'] as const

/** ② `ColorVariation` 컴포넌트의 channel 번호 → 색 프로퍼티. 선언 순서를 따른다 */
const VARIATION_CHANNEL_PROPS = ['_PrimaryColor', '_SecondaryColor', '_SkinColor'] as const

/** Unity 반복 방식 → glTF 샘플러 상수. `MirrorOnce`(3)는 glTF에 없어 거울로 본다 */
const GLTF_WRAP: Readonly<Record<number, number>> = { 0: 10497, 1: 33071, 2: 33648, 3: 33648 }

/**
 * `_BlendMode` → glTF `alphaMode`.
 *
 * ⚠️ **이것을 안 읽고 전부 `MASK`로 굽던 자리다.** 그러면 알파가 낮은 자리가
 * 통째로 뚫린다 — 493종 중 143종이 그랬고 제일 눈에 띈 것이 **눈**이었다.
 * 가산(2)은 glTF에 없어서 반투명으로 얹는다 — 불빛이 원작보다 덜 밝다
 */
const GLTF_ALPHA: Readonly<Record<number, string>> = { 0: 'OPAQUE', 1: 'BLEND', 2: 'BLEND' }

/**
 * ⚠️ **개발 추출기는 이 계산을 float32로 한다** (numpy `dtype=np.float32`).
 * 우리가 float64로 하면 같은 식이어도 마지막 자리가 갈리고, 그 차이가 256으로
 * 줄이는 자리에서 **최대 3/255까지 벌어졌다**. 곱셈·덧셈마다 32비트로 되접어
 * 같은 값을 낸다 — 느려지는 것은 없다(`Math.fround`는 한 명령이다)
 */
const f32 = Math.fround

/**
 * numpy `ndarray.round()`는 **짝수로 반올림한다** (round-half-to-even).
 * `Math.round`는 늘 위로 올린다 — 0.5로 떨어지는 자리마다 한 칸씩 갈린다
 */
function roundHalfEven(v: number): number {
  const down = Math.floor(v)
  const rest = v - down
  if (rest > 0.5) return down + 1
  if (rest < 0.5) return down
  return down % 2 === 0 ? down : down + 1
}

const srgbToLinear = (x: number): number =>
  (x <= 0.04045 ? f32(x / 12.92) : f32(f32(f32(x + 0.055) / 1.055) ** 2.4))
const linearToSrgb = (x: number): number =>
  (x <= 0.0031308 ? f32(x * 12.92) : f32(f32(1.055 * f32(Math.max(0, x) ** (1 / 2.4))) - 0.055))

/** 0..255 → 선형. 256칸이라 표로 두면 곱셈마다 pow를 안 부른다 */
const TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => srgbToLinear(f32(i / 255)))

export interface MaterialLook {
  /** 밑그림 UV 배율·오프셋 (sx, sy, ox, oy) */
  uv: [number, number, number, number]
  /** glTF 샘플러 상수 둘 */
  wrap: [number, number]
  alpha: string
  double: boolean
}

export interface BakedMaterial {
  name: string
  look: MaterialLook
  width: number
  height: number
  /** RGBA8 */
  pixels: Uint8Array
}

type Props = Record<string, UnityValue>

/** `[이름, 값]` 짝 목록을 지도로. 타입 트리는 pair를 배열 둘로 준다 */
function pairs(entries: UnityValue): Map<string, UnityValue> {
  const out = new Map<string, UnityValue>()
  if (!Array.isArray(entries)) return out
  for (const e of entries as UnityValue[]) {
    if (!Array.isArray(e) || e.length !== 2) continue
    const key = e[0]
    if (typeof key !== 'string') continue
    out.set(key, e[1] as UnityValue)
  }
  return out
}

const num = (v: UnityValue | undefined, fallback = 0): number =>
  (typeof v === 'number' ? v : fallback)

/** Unity 반복 방식대로 [0,1] 안으로 접는다 */
function wrapUv(x: number, mode: number): number {
  if (mode === 1) return x < 0 ? 0 : x > 1 ? 1 : x
  if (mode === 2 || mode === 3) {
    const y = Math.abs(x) % 2
    return y > 1 ? 2 - y : y
  }
  const r = x % 1
  return r < 0 ? r + 1 : r
}

/** 겹선형 표본. `img`는 RGBA8, 위가 0행 */
function bilinear(
  img: Uint8Array, w: number, h: number, u: number, v: number, out: Float32Array,
): void {
  const fx = u * w - 0.5
  const fy = v * h - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const dx = fx - x0
  const dy = fy - y0
  const at = (x: number, y: number): number =>
    ((y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)) * 4
  const p00 = at(x0, y0)
  const p10 = at(x0 + 1, y0)
  const p01 = at(x0, y0 + 1)
  const p11 = at(x0 + 1, y0 + 1)
  for (let c = 0; c < 4; c++) {
    const a = c < 3 ? TO_LINEAR : null
    const v00 = a ? a[img[p00 + c]!]! : img[p00 + c]! / 255
    const v10 = a ? a[img[p10 + c]!]! : img[p10 + c]! / 255
    const v01 = a ? a[img[p01 + c]!]! : img[p01 + c]! / 255
    const v11 = a ? a[img[p11 + c]!]! : img[p11 + c]! / 255
    out[c] = v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy
  }
}

/**
 * 2층 그림을 **1층 좌표계로** 옮겨 온다 (선형 RGB).
 *
 * 두 층은 UV 배율이 서로 다르다 — 눈은 1층이 (2,1)이고 2층(홍채)이 (4,4)다.
 * 그냥 겹치면 홍채가 엉뚱한 자리에 앉는다. 메시 UV를 한 번 거슬러 올라갔다가
 * 2층 배율로 다시 내려온다
 */
function layerUnder(
  mainSt: readonly number[], layer: Texture, layerSt: readonly number[],
  width: number, height: number,
): Float32Array {
  const [sxRaw, syRaw, ox, oy] = mainSt as [number, number, number, number]
  const [lx, ly, lox, loy] = layerSt as [number, number, number, number]
  const sx = sxRaw || 1
  const sy = syRaw || 1
  const out = new Float32Array(width * height * 4)
  const px = new Float32Array(4)
  for (let y = 0; y < height; y++) {
    const v0 = 1 - (y + 0.5) / height
    const v1 = (v0 - oy) / sy * ly + loy
    const vv = wrapUv(1 - v1, layer.wrapV)
    for (let x = 0; x < width; x++) {
      const u0 = (x + 0.5) / width
      const u1 = (u0 - ox) / sx * lx + lox
      bilinear(layer.pixels, layer.width, layer.height, wrapUv(u1, layer.wrapU), vv, px)
      out.set(px, (y * width + x) * 4)
    }
  }
  return out
}

/**
 * `ColorVariation` 컴포넌트가 지정하는 재질별 채널 색.
 *
 * 재질에 박힌 `_PrimaryColor` 등은 **기본값일 뿐이다**. BDSP는 이 컴포넌트로
 * 렌더러·재질·채널 단위 색을 런타임에 덮어쓴다
 */
function colorOverrides(
  env: Environment, colorIndex: number | null,
): Map<number, Map<number, Record<string, number>>> {
  const rendererMats = new Map<number, number[]>()
  for (const e of [...env.ofType('SkinnedMeshRenderer'), ...env.ofType('MeshRenderer')]) {
    const v = env.readEntry(e) as Props | null
    if (!v) continue
    const mats = (v.m_Materials as Props[] | undefined) ?? []
    rendererMats.set(e.object.pathId, mats.map((m) => num(m.m_PathID)))
  }

  const out = new Map<number, Map<number, Record<string, number>>>()
  for (const e of env.ofType('MonoBehaviour')) {
    let v: Props | null
    try { v = env.readEntry(e) as Props | null } catch { continue }
    if (!v || !('ColorIndex' in v) || !('Property00' in v)) continue
    const idx = colorIndex ?? num(v.ColorIndex)
    const key = `Property${String(idx).padStart(2, '0')}`
    const entries = (v[key] ?? v.Property00) as Props[] | undefined
    for (const group of entries ?? []) {
      const rid = num((group.renderer as Props | undefined)?.m_PathID)
      const mats = rendererMats.get(rid) ?? []
      for (const c of (group.colors as Props[] | undefined) ?? []) {
        const mi = num(c.materialIndex, -1)
        if (mi < 0 || mi >= mats.length) continue
        let per = out.get(mats[mi]!)
        if (!per) { per = new Map(); out.set(mats[mi]!, per) }
        per.set(num(c.channel), c.color as Record<string, number>)
      }
    }
  }
  return out
}

export interface BakeOptions {
  /** 주인공 외형 프리셋 번호. null이면 컴포넌트가 적어 둔 기본값 */
  colorIndex?: number | null
  /** 긴 변 상한. 오버월드 NPC를 줄이는 자리다 */
  maxSize?: number | null
  /** 밑그림을 찾을 프로퍼티. 인물·무대는 `_MainTex`, 포켓몬은 `_Col0Tex` */
  mainProps?: readonly string[]
}

/**
 * 번들 하나의 재질을 전부 굽는다.
 *
 * 돌려주는 것은 **재질 이름 → 그림과 그 그림을 어떻게 읽어야 하는가**다.
 * 그림만 굽고 `look`을 버리면 UV가 어디에 앉는지, 무엇이 뚫리는지가 달라진다
 */
export function bakeAlbedo(env: Environment, options: BakeOptions = {}): BakedMaterial[] {
  const mainProps = options.mainProps ?? ['_MainTex']
  const maxSize = options.maxSize ?? null
  const overrides = colorOverrides(env, options.colorIndex ?? null)

  const textureAt = new Map<number, () => Texture>()
  for (const e of env.ofType('Texture2D')) {
    const pid = e.object.pathId
    let cached: Texture | null = null
    textureAt.set(pid, () => {
      cached ??= readTexture(env.read(pid) as Props, e.bundle)
      return cached
    })
  }

  const out: BakedMaterial[] = []
  for (const e of env.ofType('Material')) {
    const v = env.readEntry(e) as Props | null
    if (!v) continue
    const o = e.object
    const name = (v.m_Name as string | undefined) ?? '?'
    const saved = (v.m_SavedProperties ?? {}) as Props

    const colors = pairs(saved.m_Colors)
    for (const [ch, col] of overrides.get(o.pathId) ?? []) {
      if (ch >= 0 && ch < VARIATION_CHANNEL_PROPS.length) {
        colors.set(VARIATION_CHANNEL_PROPS[ch]!, col as unknown as UnityValue)
      }
    }
    const floats = pairs(saved.m_Floats)
    const slots = new Map<string, number>()
    const uvs = new Map<string, [number, number, number, number]>()
    for (const [k, raw] of pairs(saved.m_TexEnvs)) {
      const env = raw as Props
      const pid = num((env.m_Texture as Props | undefined)?.m_PathID)
      if (!textureAt.has(pid)) continue
      slots.set(k, pid)
      const scale = (env.m_Scale ?? {}) as Props
      const offset = (env.m_Offset ?? {}) as Props
      uvs.set(k, [num(scale.x, 1), num(scale.y, 1), num(offset.x), num(offset.y)])
    }

    const found = mainProps.find((p) => slots.has(p))
    // 그림이 없는 재질이 있다 (`FireMask*` 같은 것). 지어내지 않고 건너뛴다
    if (found === undefined) continue

    const main = textureAt.get(slots.get(found)!)!()
    const width = main.width
    const height = main.height
    const st = uvs.get(found)!

    // 재질이 어떻게 그려지는지는 **재질이 적어 둔다.** 짐작하면 안 된다.
    // ⚠️ **안 적어 둔 재질도 있다** — 사람과 소품의 셰이더에는 `_BlendMode`도
    // `_CullMode`도 없다. 그런 것은 오려 낸다(`MASK`). 없는 값을 0으로 읽어
    // 불투명으로 돌리면 머리카락·속눈썹이 사각형으로 막힌다
    const blend = floats.has('_BlendMode') ? num(floats.get('_BlendMode')) : null
    const opaque = blend === 0
    const look: MaterialLook = {
      uv: st,
      wrap: [GLTF_WRAP[main.wrapU] ?? 10497, GLTF_WRAP[main.wrapV] ?? 10497],
      alpha: blend === null ? 'MASK' : (GLTF_ALPHA[blend] ?? 'OPAQUE'),
      double: num(floats.get('_CullMode'), 2) === 0,
    }

    const src = main.pixels
    const n = width * height
    const lin = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      lin[i * 3] = TO_LINEAR[src[i * 4]!]!
      lin[i * 3 + 1] = TO_LINEAR[src[i * 4 + 1]!]!
      lin[i * 3 + 2] = TO_LINEAR[src[i * 4 + 2]!]!
    }

    // 2층. ⚠️ **불투명한 재질의 알파는 불투명도가 아니라 여기를 꺼내는 마스크다** —
    // 눈이 그렇다. 1층 알파가 0인 자리에 홍채가 들어간다. 반투명 재질에서는
    // 알파가 진짜 불투명도라 같은 값이 마스크를 겸할 수 없으므로 안 얹는다
    const lerp = num(floats.get('_Layer1OverLerpValue'), 1)
    if (opaque && num(floats.get('_Layer1Enable')) !== 0 && slots.has('_L1Col0Tex') && lerp > 0) {
      const under = layerUnder(
        st, textureAt.get(slots.get('_L1Col0Tex')!)!(), uvs.get('_L1Col0Tex')!, width, height,
      )
      for (let i = 0; i < n; i++) {
        const k = (1 - src[i * 4 + 3]! / 255) * lerp
        for (let c = 0; c < 3; c++) {
          lin[i * 3 + c] = lin[i * 3 + c]! * (1 - k) + under[i * 4 + c]! * k
        }
      }
    }

    // 마스크는 보통 절반 해상도다. 영역 경계가 번지지 않게 **최근접**으로 늘린다
    let mask: Uint8Array | null = null
    let maskW = 0
    let maskH = 0
    if (slots.has('_MaskTex')) {
      const m = textureAt.get(slots.get('_MaskTex')!)!()
      mask = m.pixels
      maskW = m.width
      maskH = m.height
    }

    const layerColor = (prop: string): [number, number, number] => {
      const c = colors.get(prop) as Record<string, number> | undefined
      if (!c) return [1, 1, 1]
      return [c.r ?? 1, c.g ?? 1, c.b ?? 1]
    }
    const layers = MASK_CHANNEL_PROPS.map(layerColor)

    const outPixels = new Uint8Array(n * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        let tr = 0
        let tg = 0
        let tb = 0
        let coverage = 0
        if (mask) {
          const mx = Math.min(maskW - 1, Math.floor((x * maskW) / width))
          const my = Math.min(maskH - 1, Math.floor((y * maskH) / height))
          const at = (my * maskW + mx) * 4
          for (let c = 0; c < 3; c++) {
            const w = f32(mask[at + c]! / 255)
            tr = f32(tr + f32(w * layers[c]![0]))
            tg = f32(tg + f32(w * layers[c]![1]))
            tb = f32(tb + f32(w * layers[c]![2]))
            coverage = f32(coverage + w)
          }
        }
        // 어느 채널에도 안 속한(검정) 자리는 틴트 없이 밑그림 그대로 둔다
        const rest = f32(1 - Math.min(1, coverage))
        tr = f32(tr + rest); tg = f32(tg + rest); tb = f32(tb + rest)
        const sr = linearToSrgb(f32(lin[i * 3]! * tr))
        const sg = linearToSrgb(f32(lin[i * 3 + 1]! * tg))
        const sb = linearToSrgb(f32(lin[i * 3 + 2]! * tb))
        outPixels[i * 4] = roundHalfEven(f32(Math.min(1, Math.max(0, sr)) * 255))
        outPixels[i * 4 + 1] = roundHalfEven(f32(Math.min(1, Math.max(0, sg)) * 255))
        outPixels[i * 4 + 2] = roundHalfEven(f32(Math.min(1, Math.max(0, sb)) * 255))
        // 불투명하다고 적힌 재질은 알파를 채운다. 남겨 두면 다른 데서 또 오려 낸다
        outPixels[i * 4 + 3] = opaque ? 255 : src[i * 4 + 3]!
      }
    }

    let finalW = width
    let finalH = height
    let pixels = outPixels
    if (maxSize !== null && Math.max(width, height) > maxSize) {
      const k = maxSize / Math.max(width, height)
      finalW = Math.max(1, Math.round(width * k))
      finalH = Math.max(1, Math.round(height * k))
      pixels = resize(outPixels, width, height, finalW, finalH)
    }
    out.push({ name, look, width: finalW, height: finalH, pixels })
  }
  return out
}
