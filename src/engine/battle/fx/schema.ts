// BDSP 배틀 이펙트 프리팹의 구운 모양 (BATTLE_FX §4).
//
// 굽는 쪽은 `import/bdsp/fx.ts`다. 유니티 Shuriken 직렬화를 **거의 그대로**
// 옮긴 것이라 이름도 유니티 것이다 (`InitialModule` · `m_Bursts` …). 실행 쪽이
// 이름을 우리 말로 바꿔 들고 있지 않는다 — 원본과 대조할 때 한 번 더 옮기면
// 그만큼 틀릴 자리가 생긴다.
//
// ⚠️ **좌표는 유니티(왼손) 그대로다.** X를 뒤집는 것은 그리는 쪽 마지막 한 자리
// (`scene/battle/fx/writer`)다. 시뮬레이션은 끝까지 유니티 좌표에서 돈다.
//
// ⚠️ **각도는 라디안이다.** 유니티가 시작 회전·회전 속도를 라디안으로 적는다
// (실측: `startRotation` ±3.14159). 도(度)인 것은 트랜스폼 오일러와 모양 회전이다.
//
// 굽는 쪽과 같은 시각에 짜고 있으므로 받는 쪽은 **너그럽게** 읽는다 — 빠진 칸은
// 유니티 기본값이다.

export type V3 = readonly [number, number, number]
export type Rgba = readonly [number, number, number, number]

/** 유니티 `Keyframe` — [시각, 값, 들어오는 기울기, 나가는 기울기]. 무한 기울기는 `null`로 올 수 있다 */
export type Key = readonly [number, number, number | null, number | null]

/**
 * 유니티 `MinMaxCurve`. 상태 넷 중 하나만 온다.
 *
 * - `const` — 상수
 * - `curve` × `scalar` — 곡선 하나
 * - `curveMin`·`curveMax` × `scalar` — 두 곡선 사이 (입자마다 고정 난수)
 * - `randMin`·`randMax` — 두 상수 사이
 */
export interface MinMaxCurve {
  const?: number
  curve?: readonly Key[]
  scalar?: number
  curveMin?: readonly Key[]
  curveMax?: readonly Key[]
  randMin?: number
  randMax?: number
}

/** 유니티 `Gradient`. 색 키 [시각, r, g, b] · 알파 키 [시각, a]. 시각은 0~1 */
export interface Gradient {
  colorKeys: readonly (readonly [number, number, number, number])[]
  alphaKeys: readonly (readonly [number, number])[]
  mode?: 'blend' | 'fixed'
}

/** 유니티 `MinMaxGradient` */
export interface MinMaxGradient {
  const?: Rgba
  gradient?: Gradient
  randColorMin?: Rgba
  randColorMax?: Rgba
  randGradMin?: Gradient
  randGradMax?: Gradient
  randomFromGradient?: Gradient
}

/** 모양 모듈의 `arc`·`radius` 같은 「값 + 고르는 방식」 */
export interface ShapeValue {
  value: number
  /** 0 무작위 · 1 돌기 · 2 왕복 · 3 버스트에 고르게 */
  mode?: number
  spread?: number
  speed?: MinMaxCurve
}

export interface InitialModule {
  startLifetime?: MinMaxCurve
  startSpeed?: MinMaxCurve
  startColor?: MinMaxGradient
  startSize?: MinMaxCurve
  startSizeY?: MinMaxCurve
  startSizeZ?: MinMaxCurve
  startRotationX?: MinMaxCurve
  startRotationY?: MinMaxCurve
  startRotation?: MinMaxCurve
  randomizeRotationDirection?: number
  maxNumParticles?: number
  size3D?: boolean
  rotation3D?: boolean
  gravityModifier?: MinMaxCurve
}

export interface ShapeModule {
  type?: number
  typeName?: string
  angle?: number
  length?: number
  boxThickness?: V3
  radiusThickness?: number
  donutRadius?: number
  m_Position?: V3
  m_Rotation?: V3
  m_Scale?: V3
  placementMode?: number
  randomDirectionAmount?: number
  sphericalDirectionAmount?: number
  randomPositionAmount?: number
  alignToDirection?: boolean
  radius?: ShapeValue
  arc?: ShapeValue
  mesh?: FxMesh | null
}

interface Burst {
  time: number
  countCurve?: MinMaxCurve
  /** 0이면 끝없이 */
  cycleCount?: number
  repeatInterval?: number
  probability?: number
}

export interface EmissionModule {
  rateOverTime?: MinMaxCurve
  rateOverDistance?: MinMaxCurve
  m_Bursts?: readonly Burst[]
}

export interface SizeModule {
  curve?: MinMaxCurve
  y?: MinMaxCurve
  z?: MinMaxCurve
  separateAxes?: boolean
}

export interface RotationModule {
  x?: MinMaxCurve
  y?: MinMaxCurve
  curve?: MinMaxCurve
  separateAxes?: boolean
}

export interface ColorModule {
  gradient?: MinMaxGradient
}

export interface UVModule {
  /** 0 격자 · 1 스프라이트 */
  mode?: number
  /** 0 수명 · 1 속력 · 2 fps */
  timeMode?: number
  fps?: number
  frameOverTime?: MinMaxCurve
  startFrame?: MinMaxCurve
  speedRange?: readonly [number, number]
  tilesX?: number
  tilesY?: number
  /** 0 시트 전체 · 1 한 줄 */
  animationType?: number
  rowIndex?: number
  cycles?: number
  /** 0 지정 · 1 무작위 · 2 메시 번호 */
  rowMode?: number
  flipU?: number
  flipV?: number
}

export interface VelocityModule {
  x?: MinMaxCurve
  y?: MinMaxCurve
  z?: MinMaxCurve
  orbitalX?: MinMaxCurve
  orbitalY?: MinMaxCurve
  orbitalZ?: MinMaxCurve
  orbitalOffsetX?: MinMaxCurve
  orbitalOffsetY?: MinMaxCurve
  orbitalOffsetZ?: MinMaxCurve
  radial?: MinMaxCurve
  speedModifier?: MinMaxCurve
  inWorldSpace?: boolean
}

export interface InheritVelocityModule {
  /** 0 처음 한 번 · 1 내내 */
  m_Mode?: number
  m_Curve?: MinMaxCurve
}

export interface ForceModule {
  x?: MinMaxCurve
  y?: MinMaxCurve
  z?: MinMaxCurve
  inWorldSpace?: boolean
  randomizePerFrame?: boolean
}

/** 힘장을 가리키는 자리. 굽는 쪽이 노드 경로(문자열)로 풀어 준다 */
export type NodeRef = string | number | { m_PathID?: number | string } | null

export interface ExternalForcesModule {
  multiplierCurve?: MinMaxCurve
  /** 0 레이어 마스크(전부) · 1 목록 · 2 둘 다 */
  influenceFilter?: number
  influenceList?: readonly NodeRef[]
}

export interface ClampVelocityModule {
  x?: MinMaxCurve
  y?: MinMaxCurve
  z?: MinMaxCurve
  magnitude?: MinMaxCurve
  separateAxis?: boolean
  inWorldSpace?: boolean
  dampen?: number
  drag?: MinMaxCurve
  multiplyDragByParticleSize?: boolean
  multiplyDragByParticleVelocity?: boolean
}

export interface NoiseModule {
  strength?: MinMaxCurve
  strengthY?: MinMaxCurve
  strengthZ?: MinMaxCurve
  separateAxes?: boolean
  frequency?: number
  damping?: boolean
  octaves?: number
  octaveMultiplier?: number
  octaveScale?: number
  scrollSpeed?: MinMaxCurve
  positionAmount?: MinMaxCurve
  rotationAmount?: MinMaxCurve
  sizeAmount?: MinMaxCurve
}

export interface SizeBySpeedModule {
  curve?: MinMaxCurve
  y?: MinMaxCurve
  z?: MinMaxCurve
  separateAxes?: boolean
  range?: readonly [number, number]
}

interface SubEmitter {
  /** 자식 시스템. 굽는 쪽이 노드 경로로 풀어 준다 */
  emitter: NodeRef
  /** 0 태어날 때 · 1 충돌 · 2 죽을 때 · 3 트리거 · 4 손으로 */
  type: number
  /** 물려받기 비트 — 1 색 · 2 크기 · 4 회전 · 8 수명 · 16 지속 */
  properties?: number
  emitProbability?: number
}

export interface SubModule {
  subEmitters?: readonly SubEmitter[]
}

export interface CustomDataModule {
  /** 0 끔 · 1 벡터 · 2 색 */
  mode0?: number
  mode1?: number
  color0?: MinMaxGradient
  color1?: MinMaxGradient
  vector0_0?: MinMaxCurve
  vector0_1?: MinMaxCurve
  vector0_2?: MinMaxCurve
  vector0_3?: MinMaxCurve
  vector1_0?: MinMaxCurve
  vector1_1?: MinMaxCurve
  vector1_2?: MinMaxCurve
  vector1_3?: MinMaxCurve
}

export interface FxParticleSystemData {
  type: 'ParticleSystem'
  lengthInSec?: number
  simulationSpeed?: number
  stopAction?: number
  looping?: boolean
  prewarm?: boolean
  playOnAwake?: boolean
  startDelay?: MinMaxCurve
  /** 0 계층 · 1 자기 · 2 모양 */
  scalingMode?: number
  /** 0 월드 · 1 로컬 · 2 지정 */
  simulationSpace?: number
  InitialModule?: InitialModule
  ShapeModule?: ShapeModule
  EmissionModule?: EmissionModule
  SizeModule?: SizeModule
  RotationModule?: RotationModule
  ColorModule?: ColorModule
  UVModule?: UVModule
  VelocityModule?: VelocityModule
  InheritVelocityModule?: InheritVelocityModule
  ForceModule?: ForceModule
  ExternalForcesModule?: ExternalForcesModule
  ClampVelocityModule?: ClampVelocityModule
  NoiseModule?: NoiseModule
  SizeBySpeedModule?: SizeBySpeedModule
  SubModule?: SubModule
  CustomDataModule?: CustomDataModule
  /** 나머지 모듈(충돌·트레일·빛…)은 실행 쪽이 안 쓴다 */
  [other: string]: unknown
}

/** 메시. 유니티 좌표 그대로 · 삼각형 차례도 유니티 그대로다 */
export interface FxMesh {
  name: string
  positions: readonly number[]
  normals?: readonly number[]
  uvs?: readonly number[]
  indices: readonly number[]
}

interface FxTextureSlot {
  name: string
  scale?: readonly [number, number]
  offset?: readonly [number, number]
  size?: readonly [number, number]
}

export interface FxMaterialData {
  name: string
  shader?: string | null
  renderQueue?: number
  keywords?: readonly string[]
  /** `_Cull` (0 끔 · 1 앞 · 2 뒤) */
  cull?: number
  zwrite?: number
  /** `_ZTest` (유니티 `CompareFunction`) */
  ztest?: number
  floats?: Readonly<Record<string, number>>
  colors?: Readonly<Record<string, Rgba>>
  textures?: Readonly<Record<string, FxTextureSlot>>
}

export interface FxRendererData {
  type: 'ParticleSystemRenderer'
  enabled?: boolean
  renderMode?: string
  /** 0 없음 · 1 거리 · 2 오래된 것부터 · 3 어린 것부터 */
  sortMode?: number
  sortingFudge?: number
  sortingOrder?: number
  /** 0 화면 · 1 월드 · 2 로컬 · 3 카메라 쪽 · 4 속도 */
  alignment?: number
  velocityScale?: number
  lengthScale?: number
  cameraVelocityScale?: number
  minParticleSize?: number
  maxParticleSize?: number
  pivot?: V3
  flip?: V3
  allowRoll?: boolean
  mesh?: FxMesh | null
  materials?: readonly (FxMaterialData | null)[]
}

/** `MaterialController` — 텍스처 셋마다 vec4 하나씩 */
export interface MaterialControllerFields {
  _UvScroll0?: readonly Rgba[]
  _UvScroll1?: readonly Rgba[]
  _UvRotation?: readonly Rgba[]
  _UvScale0?: readonly Rgba[]
  _UvScale1?: readonly Rgba[]
  _MulColor?: { r: number; g: number; b: number; a: number } | Rgba
}

interface FxMonoBehaviour {
  type: 'MonoBehaviour'
  script?: string | null
  enabled?: number | boolean
  fields?: unknown
}

export interface ForceFieldParameters {
  /** 0 구 · 1 반구 · 2 원통 · 3 상자 */
  m_Shape?: number
  m_StartRange?: number
  m_EndRange?: number
  m_Length?: number
  m_GravityFocus?: number
  m_DirectionCurveX?: MinMaxCurve
  m_DirectionCurveY?: MinMaxCurve
  m_DirectionCurveZ?: MinMaxCurve
  m_GravityCurve?: MinMaxCurve
  m_DragCurve?: MinMaxCurve
  m_MultiplyDragByParticleSize?: boolean
  m_MultiplyDragByParticleVelocity?: boolean
}

interface FxForceFieldData {
  type: 'ParticleSystemForceField'
  fields?: { m_Enabled?: number; m_Parameters?: ForceFieldParameters }
}

type FxComponent =
  | FxParticleSystemData
  | FxRendererData
  | FxMonoBehaviour
  | FxForceFieldData
  | { type: string; [k: string]: unknown }

export interface FxNode {
  name: string
  active?: boolean
  localPosition?: V3
  /** xyzw */
  localRotation?: readonly [number, number, number, number]
  localScale?: V3
  components?: readonly FxComponent[]
  children?: readonly FxNode[]
}

export interface FxPrefab {
  prefab: string
  roots: readonly FxNode[]
}

export function isParticleSystem(c: FxComponent): c is FxParticleSystemData {
  return c.type === 'ParticleSystem'
}

export function isRenderer(c: FxComponent): c is FxRendererData {
  return c.type === 'ParticleSystemRenderer'
}

export function isForceField(c: FxComponent): c is FxForceFieldData {
  return c.type === 'ParticleSystemForceField'
}

export function isMono(c: FxComponent): c is FxMonoBehaviour {
  return c.type === 'MonoBehaviour'
}
