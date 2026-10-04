// `FxSystem/Particle` 재질을 읽어 셰이더가 쓸 명세로 편다 (BATTLE_FX §4).
//
// 셰이더는 스위치 전용 블롭이라 소스가 없다 — **속성 77개 · 키워드 118개가 명세**다
// (스크래치 `bdspfx/fxparticle_shader_*.json`). 키워드는 `KeywordEnum`이라 같은 이름의
// float 속성이 그 번호를 쥐고 있다. 키워드 문자열보다 float를 믿는다(편집기가
// 남긴 낡은 키워드가 섞인 재질이 있다 — `_MULTITEXTUREMODE_TEX1`처럼 접미사 없는 것).
//
// 열거 차례 (속성 `m_Attributes`에서 그대로):
//   _MultiTextureMode   Tex1_0 Tex1_1 Tex2_00 Tex2_01 Tex2_10 Tex2_11 Tex3_000 … Tex3_111
//   _Color/AlphaTexture*Channel  색: Rgb One OneMinusRgb Alpha OneMinusAlpha
//                                알파: Alpha R One OneMinusAlpha OneMinusR
//   *BlendType          Mul Plus Minus
//   _ColorTextureExpression  C0 · C0×콤보 · C0×콤보 + C1×(1−콤보) · C0×콤보 + C1
//   _AlphaExpression    콤보A×A0 · 콤보A×A0×A1 · (콤보A−(1−A0))×2 · (콤보A−A0)×A1 · 고정(콤보A−A0)×4×A1
//   _AlphaTest          Disabled Never Less Equal LessEqual Greater NotEqual GreaterEqual Always
//
// ⚠️ **알파 식 셋째~다섯째는 이름에서 읽은 것이다.** 이름을 왼쪽부터 차례로 셈한
// 것으로 읽었다(`ClampComboAMinusA0MulFourMulA1` = clamp(콤보A−A0)×4×A1).
// 연산자 우선순위로 읽으면 달라진다 — 화면으로 확인할 몫이다.
import type { FxMaterialData, MaterialControllerFields, Rgba } from './schema'

interface FxTextureSpec {
  name: string
  /** 재질 타일링(`_TextureN_ST`) */
  tiling: [number, number]
  offset: [number, number]
  /** `_UvScaleN` (+ 초당 변화) */
  uvScale: [number, number]
  uvScaleSpeed: [number, number]
  /** UV 흘리기 — 처음 자리와 초당 속도 */
  scroll: [number, number]
  scrollSpeed: [number, number]
  /** UV 회전 (라디안, 0.5 둘레) */
  rotation: number
  /** 그림 칸 UV를 안 쓰고 원래 UV를 쓰는가 (`_MULTITEXTUREMODE`의 그 자리 비트) */
  rawUv: boolean
  colorChannel: number
  alphaChannel: number
  /** 0번 텍스처는 늘 0 */
  colorBlend: number
  alphaBlend: number
  /** `_TexRgbPowRef`의 그 자리 */
  pow: number
}

export interface FxMaterialSpec {
  name: string
  textures: FxTextureSpec[]
  colorExpr: number
  alphaExpr: number
  primColorExpr: number
  primColorChannel: number
  primAlphaExpr: number
  primAlphaChannel: number
  alphaTest: number
  alphaRef: number
  colorScale: number
  mulColor: Rgba
  /** 유니티 `BlendMode` 번호 */
  src: number
  dst: number
  srcA: number
  dstA: number
  /** 유니티 `BlendOp` 번호 */
  op: number
  opA: number
  /** 0 끔 · 1 앞면 버림 · 2 뒷면 버림 */
  cull: number
  zwrite: boolean
  /** 유니티 `CompareFunction` (0 끔 · 4 LessEqual · 8 Always) */
  ztest: number
  queue: number
  /** 그리지 않는다 — 화면 왜곡(색 버퍼) 재질 */
  hidden: boolean
  /** 아직 안 옮긴 기능 (한 번씩 알린다) */
  todo: string[]
}

const TEX_COUNT_BITS: readonly (readonly boolean[])[] = [
  [false], [true],
  [false, false], [false, true], [true, false], [true, true],
  [false, false, false], [false, false, true], [false, true, false], [false, true, true],
  [true, false, false], [true, false, true], [true, true, false], [true, true, true],
]

/** 키워드 이름 끝(접미사) → 번호. float가 없을 때만 본다 */
function fromKeyword(keys: readonly string[], prefix: string, names: readonly string[]): number | undefined {
  const hit = keys.find((k) => k.startsWith(prefix))
  if (!hit) return undefined
  const i = names.indexOf(hit.slice(prefix.length))
  return i >= 0 ? i : undefined
}

const COLOR_CH = ['RGB', 'ONE', 'ONEMINUSRGB', 'ALPHA', 'ONEMINUSALPHA']
const ALPHA_CH = ['ALPHA', 'R', 'ONE', 'ONEMINUSALPHA', 'ONEMINUSR']
const BLEND_T = ['MUL', 'PLUS', 'MINUS']

function vec4At(list: readonly Rgba[] | undefined, i: number): Rgba | null {
  const v = list?.[i]
  return v && v.length >= 4 ? v : null
}

/**
 * 재질 하나를 명세로 편다.
 *
 * @param ctrl 같은 노드의 `MaterialController`. 텍스처마다 UV 흘리기·회전·크기를
 *   쥐고 있다 — 런타임에 재질 값을 덮어쓰는 스크립트로 읽는다:
 *   `_UvScroll0[i].xy` 처음 자리 · `_UvScroll1[i].xy` 초당 속도 · `_UvRotation[i].x` 회전 ·
 *   `_UvScale0[i].xy` 크기(0이면 안 씀) · `_UvScale1[i].xy` 초당 크기 변화.
 *   ⚠️ 뜻은 값의 모양에서 짐작한 것이다 (`eb001_capture` `ring_sub`: 처음 0.6 · 속도 −2.1 ·
 *   회전 π). 스크립트 소스가 없다
 */
export function readMaterial(m: FxMaterialData, ctrl: MaterialControllerFields | null): FxMaterialSpec {
  const f = m.floats ?? {}
  const c = m.colors ?? {}
  const kw = m.keywords ?? []
  const pick = (prop: string, prefix: string, names: readonly string[], dflt: number): number =>
    f[prop] ?? fromKeyword(kw, prefix, names) ?? dflt

  const mode = Math.max(0, Math.min(13, Math.round(f._MultiTextureMode ?? 0)))
  const bits = TEX_COUNT_BITS[mode]!
  const pow = c._TexRgbPowRef ?? [1, 1, 1, 0]
  const textures: FxTextureSpec[] = []
  for (let i = 0; i < bits.length; i++) {
    const slot = m.textures?.[`_Texture${i}`]
    const s0 = vec4At(ctrl?._UvScroll0, i)
    const s1 = vec4At(ctrl?._UvScroll1, i)
    const rot = vec4At(ctrl?._UvRotation, i)
    const sc0 = vec4At(ctrl?._UvScale0, i)
    const sc1 = vec4At(ctrl?._UvScale1, i)
    const matScale = c[`_UvScale${i}`]
    const matScroll = c[`_UvScroll${i}`]
    const matRot = c[`_UvRotation${i}`]
    const hasScale = !!sc0 && (sc0[0] !== 0 || sc0[1] !== 0)
    textures.push({
      name: slot?.name ?? '',
      tiling: [slot?.scale?.[0] ?? 1, slot?.scale?.[1] ?? 1],
      offset: [slot?.offset?.[0] ?? 0, slot?.offset?.[1] ?? 0],
      uvScale: hasScale ? [sc0[0], sc0[1]] : [matScale?.[0] ?? 1, matScale?.[1] ?? 1],
      uvScaleSpeed: sc1 ? [sc1[0], sc1[1]] : [0, 0],
      scroll: s0 ? [s0[0], s0[1]] : [0, 0],
      scrollSpeed: s1 ? [s1[0], s1[1]] : [matScroll?.[0] ?? 0, matScroll?.[1] ?? 0],
      rotation: rot ? rot[0] : matRot?.[0] ?? 0,
      rawUv: bits[i]!,
      colorChannel: pick(`_ColorTexture${i}Channel`, `_COLORTEXTURE${i}CHANNEL_`, COLOR_CH, 0),
      alphaChannel: pick(`_AlphaTexture${i}Channel`, `_ALPHATEXTURE${i}CHANNEL_`, ALPHA_CH, 0),
      colorBlend: i === 0 ? 0 : pick(`_ColorTexture${i}BlendType`, `_COLORTEXTURE${i}BLENDTYPE_`, BLEND_T, 0),
      alphaBlend: i === 0 ? 0 : pick(`_AlphaTexture${i}BlendType`, `_ALPHATEXTURE${i}BLENDTYPE_`, BLEND_T, 0),
      pow: pow[i] ?? 1,
    })
  }

  const todo: string[] = []
  if ((f._SoftParticlesEnabled ?? 0) > 0) todo.push('soft')
  if ((f._Distortion ?? 0) > 0) todo.push('distortion')
  if ((f._FresnelAlphaType ?? 0) > 0) todo.push('fresnel')
  if ((f._StripeEnabled ?? 0) > 0) todo.push('stripe')
  if ((f._SphereMapEnabled_Tex0 ?? 0) + (f._SphereMapEnabled_Tex1 ?? 0) + (f._SphereMapEnabled_Tex2 ?? 0) > 0) todo.push('spheremap')
  if ((f._LightColorEnabled ?? 0) > 0) todo.push('lightcolor')
  if (kw.some((k) => k.startsWith('_COMBINER_') && !k.startsWith('_COMBINER_DISSOLVE'))) todo.push('combiner')
  if (kw.includes('_COMBINERANIM0')) todo.push('combineranim')

  const ctrlMul = ctrl?._MulColor
  const mulFromCtrl: Rgba | null = !ctrlMul ? null
    : Array.isArray(ctrlMul) ? (ctrlMul as Rgba)
    : [(ctrlMul as { r: number }).r, (ctrlMul as { g: number }).g, (ctrlMul as { b: number }).b, (ctrlMul as { a: number }).a]
  const mulOn = (f._MulColorEnabled ?? 0) > 0
  const mul: Rgba = mulOn ? mulFromCtrl ?? c._MulColor ?? [1, 1, 1, 1] : [1, 1, 1, 1]

  return {
    name: m.name,
    textures,
    colorExpr: pick('_ColorTextureExpression', '_COLORTEXTUREEXPRESSION_', ['C0', 'C0MULCOMBORGB', 'C0MULCOMBORGBPLUSC1MULONEMINUSCOMBORGB', 'C0MULCOMBORGBPLUSC1'], 2),
    alphaExpr: pick('_AlphaExpression', '_ALPHAEXPRESSION_', ['COMBOAMULA0', 'COMBOAMULA0MULA1', 'COMBOAMINUSONEMINUSA0MULTWO', 'COMBOAMINUSA0MULA1', 'CLAMPCOMBOAMINUSA0MULFOURMULA1'], 0),
    primColorExpr: pick('_ColorPrimitiveExpression', '_COLORPRIMITIVEEXPRESSION_', BLEND_T, 0),
    primColorChannel: pick('_ColorPrimitiveChannel', '_COLORPRIMITIVECHANNEL_', COLOR_CH, 0),
    primAlphaExpr: pick('_AlphaPrimitiveExpression', '_ALPHAPRIMITIVEEXPRESSION_', BLEND_T, 0),
    primAlphaChannel: pick('_AlphaPrimitiveChannel', '_ALPHAPRIMITIVECHANNEL_', ALPHA_CH, 0),
    alphaTest: Math.round(f._AlphaTest ?? 0),
    alphaRef: f._AlphaRef ?? 0,
    colorScale: f._ColorScale ?? 1,
    mulColor: mul,
    src: Math.round(f._SrcColor ?? 5),
    dst: Math.round(f._DestColor ?? 10),
    srcA: Math.round(f._SrcAlpha ?? 1),
    dstA: Math.round(f._DestAlpha ?? 0),
    op: Math.round(f._BlendOpColor ?? 0),
    opA: Math.round(f._BlendOpAlpha ?? 0),
    cull: Math.round(m.cull ?? f._Cull ?? 0),
    zwrite: (m.zwrite ?? f._ZWrite ?? 0) > 0,
    ztest: Math.round(m.ztest ?? f._ZTest ?? 4),
    queue: m.renderQueue !== undefined && m.renderQueue >= 0 ? m.renderQueue : 3000,
    // 색 버퍼 왜곡은 화면을 굴절시키는 판이라, 그림으로 그리면 흰 판이 뜬다
    hidden: Math.round(f._Distortion ?? 0) === 1,
    todo,
  }
}

/**
 * 셰이더를 가르는 열쇠 — **컴파일 때 정해지는 것만** 넣는다. 같은 열쇠면 같은 노드
 * 그래프다(값은 유니폼으로 따로 간다)
 */
export function materialKey(s: FxMaterialSpec): string {
  const t = s.textures.map((x) => `${x.rawUv ? 1 : 0}${x.colorChannel}${x.alphaChannel}${x.colorBlend}${x.alphaBlend}`).join('.')
  return [t, s.colorExpr, s.alphaExpr, s.primColorExpr, s.primColorChannel, s.primAlphaExpr, s.primAlphaChannel,
    s.alphaTest, s.src, s.dst, s.srcA, s.dstA, s.op, s.opA, s.cull, s.zwrite ? 1 : 0, s.ztest].join('|')
}
