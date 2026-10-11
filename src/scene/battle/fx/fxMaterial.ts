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
// 옮긴 것: 깊이 페이드 · 프레넬 · 스피어맵 · 줄무늬 · 그림 왜곡 · 색 버퍼 왜곡 (아래 각 절).
// ⚠️ **원본 셰이더는 스위치 블롭이라 식을 못 읽는다.** 속성 값의 꼴(`_SoftParticleFadeParams` = (근 · 1/(원−근)) 같은 것)로
// 읽은 우리 해석이다 — 각 절에 어디까지가 실측이고 어디부터가 해석인지 적었다.
// 아직 안 옮긴 것(한 번씩 알린다): 조명색 · 디졸브 외의 특수 컴바이너 · 컴바이너 애니 · 왜곡 세기의 수명 곡선(`_DistortionAnim0~3`).
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
  abs, attribute, cameraFar, cameraNear, cameraProjectionMatrix, clamp, cos, dot, float, Fn, max, mix, modelViewMatrix,
  normalGeometry, normalize, perspectiveDepthToViewZ, positionGeometry, pow, saturate, screenUV, sin, sRGBTransferEOTF,
  texture, uniform, uv, varying, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture,
} from 'three/tsl'
import type { FxMaterialSpec } from '../../../engine/battle/fx/material'
import { ALWAYS_ASYNC } from '../../asyncPipelines'

/** 선형 작업 흐름인가 (머리말) */
const LINEAR = true

/**
 * **화면을 읽는 기능**(깊이 페이드 · 색 버퍼 왜곡)을 켜는가. 깊이 · 프레임버퍼를 복사해 읽으므로(`viewportDepthTexture` ·
 * `viewportSharedTexture`) 이 기능이 있는 재질이 그려지는 프레임마다 복사가 든다.
 * ⚠️ **GPU 확인 전에는 끈다.** 작업트리에서 브라우저가 막힌 채 쓴 코드다 — 켜고 `fxshot`으로 컴파일 · 그림 · 프레임 시간을 잰 뒤 켠다.
 * 꺼져 있으면 깊이 페이드는 안 하고(입자가 그대로 선다) 색 버퍼 왜곡 재질은 안 그린다(전과 같다)
 */
export const FX_SCREEN = false

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

  // 눈 공간 위치 · 법선 — 깊이 페이드 · 프레넬 · 스피어맵이 쓴다. 법선은 입자 축으로 돌려 눈 공간에 옮긴다(축 크기는 무시한다)
  const viewPos = modelViewMatrix.mul(vec4(world, 1))
  const vView = varying(viewPos.xyz)
  const nObj = ax.mul(normalGeometry.x).add(ay.mul(normalGeometry.y)).add(az.mul(normalGeometry.z))
  const vNormal = varying(normalize(modelViewMatrix.mul(vec4(nObj, 0)).xyz))

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
  const softNear = uniform(spec.soft?.near ?? 0)
  const softScale = uniform(spec.soft?.scale ?? 1)
  const fresnelX = uniform(spec.fresnel?.x ?? 1)
  const fresnelY = uniform(spec.fresnel?.y ?? 0)
  const stripe0 = uniform(new Vector4(...(spec.stripe?.c0 ?? [1, 1, 1, 1])))
  const stripe1 = uniform(new Vector4(...(spec.stripe?.c1 ?? [1, 1, 1, 1])))
  const distort = uniform(new Vector2(spec.distortion.x, spec.distortion.y))
  // 눈 쪽으로 향한 정도 — 면이 마주 보면 1, 모서리면 0 (프레넬 · 판 종류는 법선이 없어 쓰지 않는다)
  const facing = (): Node<'float'> => abs(dot(vNormal, normalize(vView.negate()))) as Node<'float'>

  material.colorNode = Fn(() => {
    const raw = uv()
    const sheet = raw.mul(rect.zw).add(rect.xy)
    const time = fxTime

    let comboRgb: Node<'vec3'> = vec3(1, 1, 1)
    let comboA: Node<'float'> = float(1)
    // 그림 왜곡(`_DISTORTION_TEXTURE`) — 첫 그림의 RG(0.5 중심)가 뒷그림들의 UV를 민다. 첫 그림 자체는 평소대로 그린다
    let warp: Node<'vec2'> = vec2(0, 0)
    spec.textures.forEach((t, i) => {
      const u = uniforms[i]!
      // 그림 칸 → 0.5 둘레 회전 → 타일링 × UV 크기 → 오프셋 + 흘리기
      // 스피어맵 — 법선의 눈 공간 xy를 0~1로 옮긴 것이 UV다 (판은 법선이 없어 평소 UV를 쓴다)
      const sphere = spec.sphere[i] === true && !billboard
      const base = sphere ? vNormal.xy.mul(0.5).add(0.5) : t.rawUv ? raw : sheet
      const d = base.sub(0.5)
      const c = cos(u.rotation)
      const s = sin(u.rotation)
      const rot = vec2(d.x.mul(c).sub(d.y.mul(s)), d.x.mul(s).add(d.y.mul(c))).add(0.5)
      const scale = u.uvScale.add(u.uvScaleSpeed.mul(time))
      const st0 = rot.mul(u.tiling).mul(scale).add(u.offset).add(u.scroll).add(u.scrollSpeed.mul(time))
      const st = spec.distortion.mode === 2 && i > 0 ? st0.add(warp) : st0
      const tex = texture(maps[i]!, st)
      if (spec.distortion.mode === 2 && i === 0) warp = tex.rg.sub(0.5).mul(2).mul(distort)
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

    // 줄무늬 — 두 색을 UV 세로로 섞어 곱한다 (우리 해석: 속성은 색 둘뿐이다)
    if (spec.stripe) rgb = rgb.mul(lin(mix(stripe0.xyz, stripe1.xyz, raw.y)))
    // 프레넬 알파 — 법선이 있는 메시에만 (우리 해석, `FxMaterialSpec.fresnel`)
    if (spec.fresnel && !billboard) alpha = alpha.mul(saturate(fresnelX.add(fresnelY.mul(float(1).sub(facing())))))
    // 깊이 페이드 — 장면 깊이가 입자 깊이보다 `near` 넘게 뒤에 있어야 온전히 선다
    if (FX_SCREEN && spec.soft) {
      const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture().r, cameraNear, cameraFar)
      alpha = alpha.mul(saturate(vView.z.sub(sceneZ).sub(softNear).mul(softScale)))
    }
    // 색 버퍼 왜곡 — 그림의 RG(0.5 중심)만큼 화면 UV를 밀어 지금까지 그려진 화면을 다시 읽는다. 섞기는 평소 알파 섞기다
    if (FX_SCREEN && spec.distortion.mode === 1) {
      const flow = comboRgb.xy.sub(0.5).mul(2).mul(distort)
      rgb = viewportSharedTexture(screenUV.add(flow.mul(alpha))).rgb as Node<'vec3'>
    }

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
