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
// 특수 컴바이너(`_COMBINER_*` 218재질 · 128프리팹)와 값 여덟 칸(`_CombinerAnim0_0~7`) · 왜곡 세기 수명 곡선(`_DistortionAnim0~3`)도 옮겼다 —
// 수명 진행(0~1)은 인스턴스 칸 `iL1.w`다. 컴바이너 식은 키워드 이름과 값의 꼴에서 읽은 **우리 해석**이다(아래 `combine` 절).
// 아직 안 옮긴 것(한 번씩 알린다): 조명색(`_LightColorEnabled`, 켠 재질 0) · 이름을 못 읽은 컴바이너.
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
  abs, attribute, cameraFar, cameraNear, cameraProjectionMatrix, clamp, cos, dot, float, Fn, length, max, mix, modelViewMatrix,
  normalGeometry, normalize, perspectiveDepthToViewZ, positionGeometry, pow, saturate, screenUV, sin, sRGBTransferEOTF,
  texture, uniform, uv, varying, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture,
} from 'three/tsl'
import { combinerConstant, distortionFlat, type FxMaterialSpec } from '../../../engine/battle/fx/material'
import { ALWAYS_ASYNC } from '../../asyncPipelines'

/** 선형 작업 흐름인가 (머리말) */
const LINEAR = true

/**
 * **화면을 읽는 기능**(깊이 페이드 · 색 버퍼 왜곡)을 켜는가. 깊이 · 프레임버퍼를 복사해 읽으므로(`viewportDepthTexture` ·
 * `viewportSharedTexture`) 이 기능이 있는 재질이 그려지는 프레임마다 복사가 든다.
 * 실측(2026-10-12, WebGPU · 챔피언전, 소프트 입자 7 · 색 버퍼 왜곡 5인 `공간절단` 460 등 네 기술): 켜고 끈 프레임 시간이 소음 안이다
 * (평균 16.7~24.6ms 대 16.7~20.7ms, 최악 한두 번의 튐은 두 번째 돌림에서 안 나왔다). 셰이더 컴파일 오류 · 흰 판 · 검은 판 없음.
 * 끄면 깊이 페이드는 안 하고(입자가 그대로 선다) 색 버퍼 왜곡 재질은 안 그린다(전과 같다)
 */
export const FX_SCREEN = true

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
  const viewPos = modelViewMatrix.mul(vec4(world, 1))
  // 깊이 밀기(`_COMBINER_ZOFFSET_*`) — 눈 쪽으로 5cm. 값은 우리 해석이다(`FxMaterialSpec.combiner`): 연기 · 물 판이 바닥에 파묻히지 않게 하는 이름이다
  const zBias = spec.combiner.kind === 'zSmoke' || spec.combiner.kind === 'zWater' ? 0.05 : 0
  material.vertexNode = cameraProjectionMatrix.mul(zBias === 0 ? viewPos : vec4(viewPos.x, viewPos.y, viewPos.z.add(zBias), 1))

  // 눈 공간 위치 · 법선 — 깊이 페이드 · 프레넬 · 스피어맵이 쓴다. 법선은 입자 축으로 돌려 눈 공간에 옮긴다(축 크기는 무시한다)
  const vView = varying(viewPos.xyz)
  const nObj = ax.mul(normalGeometry.x).add(ay.mul(normalGeometry.y)).add(az.mul(normalGeometry.z))
  // ⚠️ **법선은 조각 셰이더에서 정규화한다.** 법선이 없는 메시(코인 `koban` 등)는 0벡터라 정점에서 `normalize`하면 NaN이고 그 재질이 통째로
  // 검게 나왔다(실측 `기술 6` 코인). 0이면 0 그대로 둬 가장자리 · 조명 항이 0으로 떨어지게 한다
  const vNormalRaw = varying(modelViewMatrix.mul(vec4(nObj, 0)).xyz)
  const vNormal = vNormalRaw.div(max(length(vNormalRaw), float(1e-4)))

  const vLife = varying(attribute<'vec4'>('iL1', 'vec4').w)
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
  const distortBase = uniform(new Vector2(spec.distortion.x, spec.distortion.y))
  const distortKeys = spec.distortion.curve.map(([x, y]) => uniform(new Vector2(x, y)))
  // 왜곡 세기 × 수명 곡선 — 꺾은선 네 점 `(수명, 배율)`. 구간마다 `mix`를 이어 간다(구간 안에서만 변하므로 앞 구간 값이 그대로 남는다)
  const distort: Node<'vec2'> = distortionFlat(spec)
    ? distortBase
    : distortBase.mul((() => {
      let v: Node<'float'> = distortKeys[0]!.y
      for (let i = 0; i < 3; i++) {
        const a = distortKeys[i]!
        const b = distortKeys[i + 1]!
        v = mix(v, b.y, saturate(vLife.sub(a.x).div(max(b.x.sub(a.x), float(1e-4))))) as Node<'float'>
      }
      return v
    })())
  // 특수 컴바이너 값(`_CombinerAnim0_0~7`) — 수명에 걸쳐 고르게 놓인 여덟 열쇠. 여덟이 같으면 상수다
  const combKeys = spec.combiner.keys.map((k) => uniform(new Vector4(k[0], k[1], k[2], k[3])))
  const combP: Node<'vec4'> = combinerConstant(spec)
    ? combKeys[0]!
    : (() => {
      let v: Node<'vec4'> = combKeys[0]!
      for (let k = 1; k < 8; k++) v = mix(v, combKeys[k]!, saturate(vLife.mul(7).sub(k - 1))) as Node<'vec4'>
      return v
    })()
  const lit = spec.combiner.kind === 'light' || spec.combiner.kind === 'lightNormal'
  // 조명 방향 — 눈 공간에서 위 · 앞쪽 (`LIGHTPARAM01`; 우리 값)
  const lightDir = vec3(0.25, 0.8, 0.55).normalize()
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
    // `LIGHTPARAM01_MULVERTEXCOL_NORML`: 첫째 그림이 법선 맵이다 — 색이 아니라 명암의 법선에 넣는다 (아래 `ramp`)
    let lightN: Node<'vec3'> = vNormal
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
      // `LIGHTPARAM01`: 둘째 그림은 **빛 띠**(`fxpt_cmn_lt001/002_m` 256×8 — 61재질 중 59가 `lt` 그림, `lt002`는 0.55에서 켜지는 툰 계단)다.
      // 읽는 자리는 메시 UV가 아니라 명암 `x + y × (법선 · 빛)` — 값 (x, y)가 (바탕, 받는 빛)이라는 해석이다(코인 `koban`: (0.4, 0.5) → (0.9, 0.6)이라
      // 0.4면 툰 계단 아래 = 그림자, 0.9면 켜짐). 안 이으면 둘째 그림이 메시 UV로 읽혀 코인이 새까맣게 나왔다(실측 기술 6)
      const ramp = lit && i === 1
      const rampUv = vec2(saturate(combP.x.add(combP.y.mul(saturate(dot(lightN, lightDir))))), 0.5)
      const st = ramp ? rampUv : spec.distortion.mode === 2 && i > 0 ? st0.add(warp) : st0
      const tex = texture(maps[i]!, st)
      if (spec.distortion.mode === 2 && i === 0) warp = tex.rg.sub(0.5).mul(2).mul(distort)
      const rgb = pow(max(tex.rgb, vec3(0, 0, 0)), vec3(u.pow, u.pow, u.pow))
      // 법선 맵 갈래의 첫째 그림: 접선 공간 법선(rgb × 2 − 1)을 메시 법선 둘레의 접선 · 종접선에 얹어 명암 법선으로 쓰고, 색 몫은 흰색(1)으로 둔다 —
      // 색은 정점색 · 재질색(`C0` · `_MulColor`)이 준다. 메시 법선이 0이면(법선 없는 메시) 맵 법선을 눈 공간 그대로 쓴다
      const asNormal = spec.combiner.kind === 'lightNormal' && i === 0
      if (asNormal) {
        const nm = tex.rgb.mul(2).sub(1)
        const tan = normalize(vec3(0, 1, 0).cross(vNormal).add(vec3(1e-4, 0, 0)))
        const bit = vNormal.cross(tan)
        const mixed = tan.mul(nm.x).add(bit.mul(nm.y)).add(vNormal.mul(nm.z))
        lightN = normalize(length(vNormal).greaterThan(0.5).select(mixed, nm)) as Node<'vec3'>
      }
      const crgb = asNormal ? vec3(1, 1, 1) : colorChannel(t.colorChannel, rgb, tex.a)
      const ca = alphaChannel(t.alphaChannel, tex.r, tex.a)
      if (i === 0) {
        comboRgb = crgb
        comboA = ca
      } else {
        // `LIGHTPARAM01`의 셋째 그림(`..._hlm_..._lta` — 검은 바탕에 흰 윤곽 · 줄)은 하이라이트라 곱하지 않고 더한다(곱하면 코인 속이 새까맣다 — 실측 기술 6)
        comboRgb = combine(lit && i === 2 ? 1 : t.colorBlend, comboRgb, crgb)
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
    // (`FIRE_TWOCOLOR`는 세로 대신 그림의 밝기로 두 색을 섞는다 — 불꽃 그라데이션으로 읽은 우리 해석)
    if (spec.stripe) rgb = rgb.mul(lin(mix(stripe0.xyz, stripe1.xyz, spec.combiner.kind === 'fire' ? comboA : raw.y)))
    // 프레넬 알파 — 법선이 있는 메시에만 (우리 해석, `FxMaterialSpec.fresnel`)
    if (spec.fresnel && !billboard) alpha = alpha.mul(saturate(fresnelX.add(fresnelY.mul(float(1).sub(facing())))))
    // 특수 컴바이너 — 키워드 이름과 값의 꼴로 읽은 우리 해석 (`FxMaterialSpec.combiner`). 법선이 필요한 갈래는 메시만
    switch (spec.combiner.kind) {
      case 'ice':
      case 'fresnelOne':
        // `ICE01` · `FRESNEL_ONECOLOR`: 값 (x, y) = (가장자리 지수, 세기) — 얼음 (2, 1) · 불기둥 고리 (1, 2.5). 가장자리일수록 밝다
        if (!billboard) rgb = rgb.mul(float(1).add(combP.y.mul(pow(max(float(1).sub(facing()), float(1e-3)), max(combP.x, float(0.05))))))
        break
      case 'alphaMul':
        // `ALPHABLEND_MUL_TEX0`: 알파에 그림 알파를 한 번 더 곱한다 (가장자리를 또렷하게)
        alpha = alpha.mul(comboA)
        break
      default:
        break
    }
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
      case 'comb': return vec4(combP.xyz, 1)
      case 'life': return vec4(vec3(vLife, vLife, vLife), 1)
      case 'nrm': return vec4(vNormal.mul(0.5).add(0.5), 1)
      case 'rgb': return vec4(rgb, 1)
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
