// 필드 기믹의 BDSP 모델 (docs/orders/BATTLE_FX_20261004.md §8 · DATA.md §2.17.9)
//
// BDSP는 바위깨기 바위 · 풀베기 나무 · 괴력 바위 · 꿀나무 · 눈덩이를 필드 glb에 굽지 않고 `Environments/gimmick`의 기믹 번들로
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
} as const

export type GimmickKind = keyof typeof GIMMICK_MODELS

/** 뼈 없는 기믹 — 무대 변환기로 굽는다 */
export const GIMMICK_STATIC: readonly string[] = [
  GIMMICK_MODELS.rockSmash, GIMMICK_MODELS.cutTree, GIMMICK_MODELS.snowball, GIMMICK_MODELS.strength,
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
export const HONEY_TREE_REST = 'Wait'

/** 원작 흔들림 단계(`shakeAnimation` — 0 · 1 · 2, 없으면 null) → 틀 클립 이름 */
export function honeyTreeClip(shake: number | null): string {
  if (shake === null) return HONEY_TREE_REST
  return HONEY_TREE_CLIPS[Math.max(0, Math.min(HONEY_TREE_CLIPS.length - 1, shake))]!
}
