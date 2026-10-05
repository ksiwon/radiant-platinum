// `FxSystem/Particle`을 TSL 노드 재질 하나로 (BATTLE_FX §4).
//
// 원본 셰이더는 키워드 조합마다 따로 컴파일된다. 여기서도 같다 — **키워드는 그래프를
// 짤 때 JS에서 고르고**(그래서 셰이더 안에 분기가 없다), 값(타일링 · 색 배율 ·
// 곱하는 색 · 알파 기준)은 유니폼으로 둔다. 같은 키워드 조합이면 생성되는 셰이더
// 문자열이 같아서 파이프라인을 나눠 쓴다.
//
// 색 셈 (이름은 원본 속성):
//   콤보 = 텍스처0 채널 ⊕ 텍스처1 채널 ⊕ 텍스처2 채널   (⊕ = Mul/Plus/Minus)
//   색   = _ColorTextureExpression(C0, C1, 콤보)  ⊕prim  정점색 채널
//   알파 = _AlphaExpression(콤보A, A0, A1)        ⊕prim  정점 알파 채널
//   × _ColorScale × _MulColor → 알파 시험 → 섞기(_SrcColor/_DestColor …)
// C0·C1은 입자 사용자 자료 색 둘(`CustomDataModule`)이다.
//
// ⚠️ **선형 작업 흐름으로 셈한다.** sRGB 그림은 샘플할 때 선형으로 풀리고(그림 표의
// `srgb`), 정점색 · C0 · C1 · 곱하는 색도 sRGB → 선형으로 옮긴 뒤 섞는다 — 유니티
// 선형 색 공간 프로젝트가 하는 그대로다. BDSP가 감마 프로젝트라면 덧셈 섞기가
// 조금 밝게 나온다(`LINEAR` 하나로 뒤집을 수 있다).
//
// 아직 안 옮긴 것(한 번씩 알린다): 부드러운 입자(깊이 페이드) · 화면 왜곡 ·
// 프레넬 · 스피어 맵 · 줄무늬 · 디졸브 외의 특수 컴바이너.
import {
  AddEquation, BackSide, CustomBlending, DoubleSide, DstAlphaFactor, DstColorFactor,
  FrontSide, LessEqualDepth, MaxEquation, MinEquation, OneFactor, OneMinusDstAlphaFactor,
  OneMinusDstColorFactor, OneMinusSrcAlphaFactor, OneMinusSrcColorFactor, ReverseSubtractEquation,
  SrcAlphaFactor, SrcAlphaSaturateFactor, SrcColorFactor, SubtractEquation, Vector2, Vector4,
  ZeroFactor, type BlendingDstFactor, type BlendingEquation, type BlendingSrcFactor, type Texture,
  LessDepth, EqualDepth, GreaterDepth, NotEqualDepth, GreaterEqualDepth, NeverDepth, AlwaysDepth,
  type DepthModes,
} from 'three'
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu'
import {
  attribute, cameraProjectionMatrix, clamp, cos, float, Fn, max, modelViewMatrix, pow,
  positionGeometry, sin, sRGBTransferEOTF, texture, uniform, uv, varying, vec2, vec3, vec4,
} from 'three/tsl'
import type { FxMaterialSpec } from '../../../engine/battle/fx/material'
import { ALWAYS_ASYNC } from '../../asyncPipelines'

/** 선형 작업 흐름인가 (머리말) */
const LINEAR = true

/** 유니티 `BlendMode` → three */
const FACTOR: readonly (BlendingSrcFactor & BlendingDstFactor)[] = [
  ZeroFactor, OneFactor, DstColorFactor, SrcColorFactor, OneMinusDstColorFactor,
  SrcAlphaFactor, OneMinusSrcColorFactor, DstAlphaFactor, OneMinusDstAlphaFactor,
  SrcAlphaSaturateFactor as BlendingSrcFactor & BlendingDstFactor, OneMinusSrcAlphaFactor,
]

/** 유니티 `BlendOp` → three. 0 더하기 · 1 빼기 · 2 거꾸로 빼기 · 3 작은 쪽 · 4 큰 쪽 */
function equation(op: number): BlendingEquation {
  switch (op) {
    case 1: return SubtractEquation
    case 2: return ReverseSubtractEquation
    case 3: return MinEquation
    case 4: return MaxEquation
    default: return AddEquation
  }
}

/** 유니티 `CompareFunction` → three 깊이 함수 (0 끔 · 8 늘 통과는 깊이 시험을 끈다) */
function depthFunc(z: number): DepthModes {
  return [AlwaysDepth, NeverDepth, LessDepth, EqualDepth, LessEqualDepth, GreaterDepth,
    NotEqualDepth, GreaterEqualDepth, AlwaysDepth][z] ?? LessEqualDepth
}

const todoSeen = new Set<string>()

/** 시험대가 고르는 진단 그림 (`FxLab`의 `&dbg=`). 평소에는 빈 문자열 */
let debugView = ''
export function setFxDebugView(v: string): void {
  debugView = v
}

/** 안 옮긴 기능을 기능마다 한 번만 알린다 */
function noteTodo(spec: FxMaterialSpec): void {
  for (const t of spec.todo) {
    if (todoSeen.has(t)) continue
    todoSeen.add(t)
    console.info(`[fx] 아직 안 옮긴 셰이더 기능: ${t} (처음 본 재질 ${spec.name}) — 기본 그림으로 그린다`)
  }
}

/**
 * 재질 하나를 짓는다.
 *
 * @param maps 텍스처 0~2. 없는 자리는 흰 그림을 넘긴다
 * @param billboard 판 종류인가 — 판은 늘 카메라를 보므로 컬링을 안 한다
 */
export function buildFxMaterial(spec: FxMaterialSpec, maps: readonly Texture[], billboard: boolean): MeshBasicNodeMaterial {
  noteTodo(spec)
  const material = new MeshBasicNodeMaterial()
  material.name = `fx ${spec.name}`

  // ─── 꼭짓점: 가운데 + 축 셋 ──────────────────────────
  // 인스턴스 값은 vec4 여덟 칸 한 버퍼다 (`BdspEffect`의 `LANES`)
  const l0 = attribute<'vec4'>('iL0', 'vec4')
  const center = l0.xyz
  const ax = attribute<'vec4'>('iL1', 'vec4').xyz
  const ay = attribute<'vec4'>('iL2', 'vec4').xyz
  const az = attribute<'vec4'>('iL3', 'vec4').xyz
  const p = positionGeometry
  const world = center.add(ax.mul(p.x)).add(ay.mul(p.y)).add(az.mul(p.z))
  material.vertexNode = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(world, 1)))

  const rect = varying(attribute<'vec4'>('iL7', 'vec4'))
  const fxTime = varying(l0.w)
  const vColor = varying(attribute<'vec4'>('iL4', 'vec4'))
  const vC0 = varying(attribute<'vec4'>('iL5', 'vec4'))
  const vC1 = varying(attribute<'vec4'>('iL6', 'vec4'))

  const lin = (c: Node<'vec3'>): Node<'vec3'> => (LINEAR ? sRGBTransferEOTF(c) : c) as Node<'vec3'>

  // 값 유니폼 — 재질마다 하나씩, 키워드가 같아도 값은 다르다
  const uniforms = spec.textures.map((t) => ({
    tiling: uniform(new Vector2(t.tiling[0], t.tiling[1])),
    offset: uniform(new Vector2(t.offset[0], t.offset[1])),
    uvScale: uniform(new Vector2(t.uvScale[0], t.uvScale[1])),
    uvScaleSpeed: uniform(new Vector2(t.uvScaleSpeed[0], t.uvScaleSpeed[1])),
    scroll: uniform(new Vector2(t.scroll[0], t.scroll[1])),
    scrollSpeed: uniform(new Vector2(t.scrollSpeed[0], t.scrollSpeed[1])),
    rotation: uniform(t.rotation),
    pow: uniform(t.pow),
  }))
  const colorScale = uniform(spec.colorScale)
  const mul = spec.mulColor
  const mulColor = uniform(new Vector4(mul[0], mul[1], mul[2], mul[3]))
  const alphaRef = uniform(spec.alphaRef)

  material.colorNode = Fn(() => {
    const raw = uv()
    const sheet = raw.mul(rect.zw).add(rect.xy)
    const time = fxTime

    let comboRgb: Node<'vec3'> = vec3(1, 1, 1)
    let comboA: Node<'float'> = float(1)
    spec.textures.forEach((t, i) => {
      const u = uniforms[i]!
      // 그림 칸 → 0.5 둘레 회전 → 타일링 × UV 크기 → 오프셋 + 흘리기
      const base = t.rawUv ? raw : sheet
      const d = base.sub(0.5)
      const c = cos(u.rotation)
      const s = sin(u.rotation)
      const rot = vec2(d.x.mul(c).sub(d.y.mul(s)), d.x.mul(s).add(d.y.mul(c))).add(0.5)
      const scale = u.uvScale.add(u.uvScaleSpeed.mul(time))
      const st = rot.mul(u.tiling).mul(scale).add(u.offset).add(u.scroll).add(u.scrollSpeed.mul(time))
      const tex = texture(maps[i]!, st)
      const rgb = pow(max(tex.rgb, vec3(0, 0, 0)), vec3(u.pow, u.pow, u.pow))
      const crgb = colorChannel(t.colorChannel, rgb, tex.a)
      const ca = alphaChannel(t.alphaChannel, tex.r, tex.a)
      if (i === 0) {
        comboRgb = crgb
        comboA = ca
      } else {
        comboRgb = combine(t.colorBlend, comboRgb, crgb)
        comboA = combine(t.alphaBlend, comboA, ca)
      }
    })

    const c0 = lin(vC0.rgb)
    const c1 = lin(vC1.rgb)
    const a0 = vC0.a
    const a1 = vC1.a
    let rgb: Node<'vec3'>
    switch (spec.colorExpr) {
      case 0: rgb = c0; break
      case 1: rgb = c0.mul(comboRgb); break
      case 3: rgb = c0.mul(comboRgb).add(c1); break
      default: rgb = c0.mul(comboRgb).add(c1.mul(vec3(1, 1, 1).sub(comboRgb))); break
    }
    let alpha: Node<'float'>
    switch (spec.alphaExpr) {
      case 1: alpha = comboA.mul(a0).mul(a1); break
      // 디졸브: A0가 1에서 내려가면 콤보A가 낮은 자리부터 사라진다
      case 2: alpha = comboA.sub(float(1).sub(a0)).mul(2); break
      case 3: alpha = comboA.sub(a0).mul(a1); break
      case 4: alpha = clamp(comboA.sub(a0), 0, 1).mul(4).mul(a1); break
      default: alpha = comboA.mul(a0); break
    }

    // 정점색 (시작 색 × 수명 색)
    const prim = lin(vColor.rgb)
    rgb = combine(spec.primColorExpr, rgb, colorChannel(spec.primColorChannel, prim, vColor.a))
    alpha = combine(spec.primAlphaExpr, alpha, alphaChannel(spec.primAlphaChannel, vColor.r, vColor.a))

    rgb = rgb.mul(colorScale).mul(lin(mulColor.xyz))
    alpha = clamp(alpha.mul(mulColor.w), 0, 1)
    rgb = max(rgb, vec3(0, 0, 0))

    alphaTest(spec.alphaTest, alpha, alphaRef)
    // 시험대 `&dbg=` — 한 칸만 불투명하게 내 본다
    switch (debugView) {
      case 'c0': return vec4(vC0.rgb, 1)
      case 'c1': return vec4(vC1.rgb, 1)
      case 'a0': return vec4(vec3(a0, a0, a0), 1)
      case 'combo': return vec4(comboRgb, 1)
      case 'comboa': return vec4(vec3(comboA, comboA, comboA), 1)
      case 'alpha': return vec4(vec3(alpha, alpha, alpha), 1)
      case 'prim': return vec4(vColor.rgb, 1)
      case 'uv': return vec4(sheet, 0, 1)
      default: return vec4(rgb, alpha)
    }
  })()

  // ─── 섞기 · 깊이 · 컬링 ─────────────────────────────
  const opaque = spec.src === 1 && spec.dst === 0 && spec.op === 0
  material.transparent = !opaque
  material.blending = CustomBlending
  material.blendSrc = FACTOR[spec.src] ?? SrcAlphaFactor
  material.blendDst = FACTOR[spec.dst] ?? OneMinusSrcAlphaFactor
  material.blendEquation = equation(spec.op)
  // ⚠️ **프레임버퍼 알파는 건드리지 않는다.** 유니티 값(`_SrcAlpha` One · `_DestAlpha`
  // Zero)을 그대로 쓰면 판의 투명한 귀퉁이가 알파 0을 적고, 마지막 출력 패스가 그 자리를
  // 어둡게 내서 **검은 네모**가 떴다(실측: `/fxlab` eb004_capture). 유니티에서는 화면
  // 알파가 안 보이는 값이라 버려도 그림이 같다 — 바탕 알파를 그대로 둔다
  void spec.srcA; void spec.dstA; void spec.opA
  material.blendSrcAlpha = ZeroFactor
  material.blendDstAlpha = OneFactor
  material.blendEquationAlpha = AddEquation
  material.premultipliedAlpha = false
  material.depthWrite = spec.zwrite
  material.depthTest = spec.ztest !== 0 && spec.ztest !== 8
  material.depthFunc = depthFunc(spec.ztest)
  material.side = billboard || spec.cull === 0 ? DoubleSide : spec.cull === 2 ? FrontSide : BackSide
  // ⚠️ **양면도 한 번에 그린다.** three는 반투명 양면 재질을 뒷면 · 앞면 두 번으로 나눠 그려서 재질 하나에 파이프라인이
  // 둘 선다 — 미리 굽기(`warmFxEffects`)는 한 벌만 구우니 기술마다 나머지가 그 자리에서 동기로 섰다. 유니티 `Cull Off`도
  // 한 번에 그린다(입자는 깊이를 안 쓰므로 면 차례가 그림을 안 바꾼다)
  material.forceSinglePass = true
  // 처음 그리는 프레임에 동기로 굽지 않는다 (`asyncPipelines`의 `ALWAYS_ASYNC`)
  material.userData[ALWAYS_ASYNC] = true
  material.fog = false
  material.toneMapped = false
  return material
}

/** 색 채널: Rgb · One · OneMinusRgb · Alpha · OneMinusAlpha */
function colorChannel(ch: number, rgb: Node<'vec3'>, a: Node<'float'>): Node<'vec3'> {
  switch (ch) {
    case 1: return vec3(1, 1, 1)
    case 2: return vec3(1, 1, 1).sub(rgb)
    case 3: return vec3(a, a, a)
    case 4: return vec3(float(1).sub(a), float(1).sub(a), float(1).sub(a))
    default: return rgb
  }
}

/** 알파 채널: Alpha · R · One · OneMinusAlpha · OneMinusR */
function alphaChannel(ch: number, r: Node<'float'>, a: Node<'float'>): Node<'float'> {
  switch (ch) {
    case 1: return r
    case 2: return float(1)
    case 3: return float(1).sub(a)
    case 4: return float(1).sub(r)
    default: return a
  }
}

/** 섞는 방식: Mul · Plus · Minus */
function combine<T extends Node<'vec3'> | Node<'float'>>(op: number, a: T, b: T): T {
  const x = a as Node<'vec3'>
  const y = b as Node<'vec3'>
  if (op === 1) return x.add(y) as unknown as T
  if (op === 2) return x.sub(y) as unknown as T
  return x.mul(y) as unknown as T
}

/** `_AlphaTest`: Disabled Never Less Equal LessEqual Greater NotEqual GreaterEqual Always — 실패하면 버린다 */
function alphaTest(mode: number, a: Node<'float'>, ref: Node<'float'>): void {
  switch (mode) {
    case 1: a.greaterThan(-1).discard(); break
    case 2: a.greaterThanEqual(ref).discard(); break
    case 3: a.notEqual(ref).discard(); break
    case 4: a.greaterThan(ref).discard(); break
    case 5: a.lessThanEqual(ref).discard(); break
    case 6: a.equal(ref).discard(); break
    case 7: a.lessThan(ref).discard(); break
    default: break
  }
}
