// 필드 기믹의 BDSP 모델 (docs/orders/BATTLE_FX_20261004.md §8 · DATA.md §2.17.9)
//
// BDSP는 바위깨기 바위 · 풀베기 나무 · 괴력 바위 · 꿀나무 · 눈덩이 · 서류가방 · 말뚝을 필드 glb에 굽지 않고 `Environments/gimmick`의 기믹 번들로
// 따로 둔다 — 실행 때 자리에 세우는 물체라서다. 우리도 번들을 그대로 굽고(`models/gimmick/<번들>.glb`) 원작 배치 자리에 세운다.
// 번들 이름 ↔ 쓰임은 번들 안 프리팹 이름(`P_C_001_RockCrush_01` …)과 `GimmickGraphics` 목록으로 맞췄다.
//
// ⚠️ **굽는 쪽이 둘이다** — 노드 쪽 `tools/extract/bdspArena.py --gimmicks`의 `GIMMICK_STATIC` · `GIMMICK_ANIMATED`와 같아야 한다

/** 쓰임 → 번들 이름 */
export const GIMMICK_MODELS = {
  /** 바위깨기 바위 (`OBJ_EVENT_GFX_ROCK_SMASH` 85) — `P_C_001_RockCrush_01` · 0.93×0.81×0.95칸 */
  rockSmash: 'obj0001_00',
  /** 풀베기 나무 (`OBJ_EVENT_GFX_CUT_TREE` 86) — `P_C_001_SlashTree_01` · 1.30×1.29×0.88칸 */
  cutTree: 'obj0002_00',
  /** 꿀나무 — `P_C_001_SweetTree_01`. 뼈 넷(`Root/Tree01/Tree02/Tree03`)에 클립 넷(`HONEY_TREE_CLIPS`) */
  honeyTree: 'obj0003_00',
  /** 눈덩이 (`OBJ_EVENT_GFX_SNOWBALL` 118) — `P_C_001_Snowball_01` · 0.98칸 공 */
  snowball: 'obj0004_00',
  /** 괴력 바위 (`OBJ_EVENT_GFX_STRENGTH_BOULDER` 84) — `P_C_001_RockMove_01` · 1.01×0.76×0.96칸 */
  strength: 'obj0006_00',
  /**
   * 서류가방 (`OBJ_EVENT_GFX_BRIEFCASE` 174 — 201번도로 마박사의 가방) — `P_C_001_Bag_01` · 0.90×0.69×0.30칸. 선 채로 칸 북쪽 끝
   * (z −0.50~−0.20)에 구워져 있다 — 세우는 쪽이 칸 한가운데로 옮긴다(`NpcSprites`의 `GIMMICK_CENTRE`). 짝 `obj0008_01`
   * (`P_C_001_Bag_01b`)은 연 가방에 볼 셋(`BagBall`)이라 원작 그림(닫힌 가방)과 다르다
   */
  briefcase: 'obj0008_00',
  /**
   * 말뚝 (`OBJ_EVENT_GFX_BOLLARD` 192) — `P_D_006_BlockPale_01` · 0.90×0.75×0.90칸, 밑동이 원점이다. BDSP 지역에 구워진
   * `M_C_001_BlockPale_01`(연고 · 만월섬 · 신월섬 열 곳)과 같은 크기의 흰 돌기둥이다 — 짝 없는 여섯 곳에 이것을 세운다
   */
  bollard: 'obj0010_01',
} as const

export type GimmickKind = keyof typeof GIMMICK_MODELS

/**
 * **오려 내지 않고 꽉 채워 세울** 기믹. 무대 변환기는 `Opaque` 재질도 오려 내게(`MASK` · 문턱 0.5) 굽는데(`import/bdsp/arena`의 `alphaOf` —
 * 무대 나무 · 풀이 Opaque에 알파 그림을 문다), 서류가방(`M_C_001_Bag_01`)은 그림 알파가 **512×512 전부 0**이라 통째로 잘려 안 보였다.
 * 그 재질은 `RenderType` Opaque에 `_AlphaClip` 0 — 유니티에서도 알파를 안 본다. 실행 쪽이 문턱을 끈다(`scene/gimmickModels`의 `gimmickPieces`).
 * 나머지 다섯 정적 기믹 · 말뚝은 그림 알파가 다 255라 상관없다(실측)
 */
export const GIMMICK_OPAQUE: ReadonlySet<string> = new Set([GIMMICK_MODELS.briefcase])

/** 뼈 없는 기믹 — 무대 변환기로 굽는다 */
export const GIMMICK_STATIC: readonly string[] = [
  GIMMICK_MODELS.rockSmash, GIMMICK_MODELS.cutTree, GIMMICK_MODELS.snowball, GIMMICK_MODELS.strength,
  GIMMICK_MODELS.briefcase, GIMMICK_MODELS.bollard,
]
/** 뼈와 클립이 있는 기믹 — 인물 변환기로 굽는다 */
export const GIMMICK_ANIMATED: readonly string[] = [GIMMICK_MODELS.honeyTree]

/** 굽는 것 전부 — 이름순 (목차 `index.json`의 차례) */
export function gimmickNames(): string[] {
  return [...GIMMICK_STATIC, ...GIMMICK_ANIMATED].sort()
}

/**
 * 꿀나무 클립 — `FieldEventEntity`의 이름표. 클립 길이 1초 · 24fps 반복이다.
 *
 * 흔들림 폭(`Tree02`의 z축 회전 사원수 성분, 실측): `Move01` ±0.002 · `Move02` −0.009~+0.011 · `Move03` ±0.014(`Tree03`도 0.69~0.72로
 * 크게 흔든다). 원작(DS) 흔들림 세 단계(`shakeAnimation` 0 · 1 · 2 — 작게 · 중간 · 크게)와 같은 차례라 그대로 잇는다.
 * `Wait`은 한 프레임짜리 쉼 자세다
 */
export const HONEY_TREE_CLIPS = ['Move01', 'Move02', 'Move03'] as const
const HONEY_TREE_REST = 'Wait'

/** 원작 흔들림 단계(`shakeAnimation` — 0 · 1 · 2, 없으면 null) → 틀 클립 이름 */
export function honeyTreeClip(shake: number | null): string {
  if (shake === null) return HONEY_TREE_REST
  return HONEY_TREE_CLIPS[Math.max(0, Math.min(HONEY_TREE_CLIPS.length - 1, shake))]!
}
