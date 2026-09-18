// 1인칭 표현 정책의 타입 (FIRST_PERSON §4.2)
//
// 런타임 부작용이 없다. 값은 `sourceParts`·`resolve`·`recipes`가 만든다.

/** 원재료가 어디서 왔나 */
export type SourceKind = 'chunk' | 'prop' | 'fldeff' | 'npc-gfx'

/** 조각이 무엇인가. 검수 전에는 확정하지 않는다 */
type Semantic =
  | 'tree' | 'rock' | 'planter' | 'shrub' | 'fence' | 'bollard' | 'rail' | 'sign'
  | 'building' | 'wall' | 'ground' | 'grass' | 'flower' | 'water' | 'decal' | 'other'

/**
 * 원본을 어떻게 다루나.
 *
 * - `keep`    제거 0 · 추가 0
 * - `augment` 원본은 그대로, 모자란 부분만 더한다
 * - `replace` 대체물이 준비된 **그 커밋에서** 원본을 지운다
 */
export type Outcome = 'keep' | 'augment' | 'replace'

/** 원재료 하나의 신원. 이름만으로 정하지 않는다 — 픽셀 지문까지 본다 (§3-3·6) */
export interface SourceKey {
  kind: SourceKind
  assetId: number
  texSet: number | null
  tex: string | null
  pal: string | null
  rep: number
  /** 그 그림 칸 픽셀의 지문. 그림이 없으면 `'-'` */
  sourceHash: string
}

/** `rep` 비트 (`chunkMesh.sliceTexture`와 같은 뜻) */
export const REP = { repeatU: 1, repeatV: 2, mirrorU: 4, mirrorV: 8 } as const

/**
 * 원본의 **이어진 평면 조각** 하나.
 *
 * ⚠️ `triangleOffsets`는 **원본 index 배열의 시작 자리**다(3의 배수). 걸러 낸 뒤의
 * 번호가 아니다. `group`은 `ChunkMesh.groups`의 차례(서브메시 번호)이고 롬의 재질
 * 번호가 아니다 — 청크 666개 중 647개에서 둘이 어긋난다 (`plates.Split`)
 */
export interface SourcePart {
  source: SourceKey
  group: number
  componentId: string
  triangleOffsets: readonly number[]
  /** 원본 UV 그대로의 상자 [u0, v0, u1, v1] — 0~1 밖일 수 있다 */
  uvBounds: readonly [number, number, number, number]
  /** 평면 법선 (단위) */
  normal: readonly [number, number, number]
  /** 로컬 좌표 상자 [x0, y0, z0, x1, y1, z1] */
  bounds: readonly [number, number, number, number, number, number]
}

/** UV가 그림 칸의 어디를 쓰는가 (§3-4) */
export interface UvFootprint {
  /** 그림 칸 안의 텍셀 사각형들 [x0, y0, x1, y1) — 반복 경계에서 여럿으로 갈린다 */
  rects: readonly (readonly [number, number, number, number])[]
  /** 원본 UV를 텍셀로 옮긴 것. 반복이면 칸 밖 값이 그대로 남는다 */
  raw: readonly [number, number, number, number]
  wrapsU: boolean
  wrapsV: boolean
  /** 텍셀 경계에 안 맞는 좌표가 있다 */
  fractional: boolean
}

/** 원본 조각을 고르는 조건. **전부** 맞아야 한다 */
export interface SourceSelector {
  kind?: SourceKind
  tex: string
  pal?: string
  /**
   * 검수한 그 픽셀 — `within` 사각형의 지문(`regionDigest`). 여럿이면 그중 하나.
   * 다르면 적용하지 않는다
   */
  regionHashes: readonly string[]
  /** 그림 칸 안 텍셀 사각형. 조각의 칸이 **이 안에 다 들어야** 맞는다 */
  within: readonly [number, number, number, number]
  /** 판이 누운 각 (도). 없으면 안 본다 */
  leanDeg?: readonly [number, number]
}

type GeometryKind =
  | 'original' | 'fence' | 'bollard-chain' | 'bollard-grass' | 'rail' | 'planter' | 'shrub' | 'rock'
  | 'tree' | 'building-patch' | 'room-patch'
  /** 원본 카드를 90° 돌려 한 벌 더 (소품의 십자 빌보드 · FP-07) */
  | 'cross-cards'
  /**
   * 소품의 **눕힌 카드를 세운다** — 고정 카메라에서 서 보이라고 원작이 뒤로 눕힌
   * 그림이다(묘비·체육관 석상·조각상). 청크는 `plates.standCutouts`가 45°·63.4°를
   * 세우지만 소품에는 그 길이 없었다 (FP-07 `tilted` 꼬리)
   */
  | 'stand-card'

type MaterialProfile = 'rom-lit' | 'cutout-lit' | 'decal-unlit' | 'water'

export interface VisualRecipe {
  id: string
  version: number
  semantic: Semantic
  outcome: Outcome
  geometry: GeometryKind
  materialProfile: MaterialProfile
  anchor: 'ground-contact' | 'source-local'
  review: 'draft' | 'verified'
  selectors: readonly SourceSelector[]
  /** 무엇을 근거로 정했나. 원작 복원값이 아닌 것은 여기서 밝힌다 (§1.1) */
  provenance: string
}

/**
 * 조각 하나의 결정.
 *
 * - `pending`      교체하기로 했고 대체물을 기다린다 — **아직 안 지운다**
 * - `ready`        대체물이 섰다 — 이 커밋에서 지운다
 * - `fallback`     교체하지 않는다(초안·지문 불일치·충돌·실패) — 현행 표현
 * - `unclassified` 맞는 레시피가 없다 — 현행 표현
 * - `failed`       대체물을 만들다 실패했다 — 현행 표현
 */
type DecisionStatus = 'pending' | 'ready' | 'fallback' | 'unclassified' | 'failed'

export interface PartDecision {
  componentId: string
  group: number
  outcome: Outcome
  recipeId: string | null
  /** 원본에서 지울 삼각형. `ready`인 `replace`만 채워진다 */
  removeOffsets: readonly number[]
  /** 레시피가 맡은 삼각형 — 기존 변환(세우기·덩이·잎)이 손대지 않게 막는다 */
  claimOffsets: readonly number[]
  /**
   * **맡았지만 원래대로 세운다.**
   *
   * `geometry: 'original'` · `outcome: 'keep'`인 레시피가 그렇다 — 새 모델을
   * 안 만들고 원본도 안 지우되, **덩이로 부풀리는 것만** 막는다. 자전거 거치대·
   * 금빛 기둥처럼 원작이 그림 한 장을 통째로 세워 둔 물건이 여기 든다
   */
  keepStanding: boolean
  status: DecisionStatus
  reason: string | null
}

/** `ChunkModels`로 넘기는 한 청크의 결정 묶음 (§4.5) */
export interface ResolvedVisualPlan {
  /** 캐시 열쇠에 넣는 값 — 결정이 바뀌면 바뀐다 */
  key: string
  /** 새 레시피가 맡은 삼각형 전부. 기존 변환이 손대지 않는다 */
  suppressLegacyOffsets: ReadonlySet<number>
  /** 준비된 교체의 삼각형만. 원본에서 지운다 */
  removeOffsets: ReadonlySet<number>
  /** 맡았지만 **원래대로 세울** 삼각형. 덩이에서만 빠지고 세우기는 그대로다 */
  standOffsets: ReadonlySet<number>
  decisions: readonly PartDecision[]
}
