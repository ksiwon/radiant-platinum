// 배틀팩토리가 무엇을 어디서 뽑는가 (PARITY §9.3)
//
// ⚠️ **네 표 전부 오버레이 104의 코드에 박혀 있다.** 아카이브에 없어서 추출기가
// 대신 세어 줄 수 없다 — 기술머신 표나 BP 값 표와 같은 자리다 (§12.3). 그래서
// 여기 손으로 옮기고, 옮긴 자리를 밝혀 둔다:
//
//   `Unk_ov104_022401FC`  트레이너를 뽑는 구간 (라운드 여덟 줄)
//   `Unk_ov104_0224028C`  레벨50 — 빌리는 것과 상대 것 **둘 다** 이 표다
//   `Unk_ov104_0224023C`  오픈레벨 — 빌리는 것
//   `Unk_ov104_022402DC`  오픈레벨 — 상대 것
//
// 값은 전부 원작의 16진수를 10진수로 옮긴 것이고, 차례도 안 바꿨다

/** 한 라운드가 일곱 판이다 (`(round * 7) + battle`) */
export const BATTLES_PER_ROUND = 7

/** 은색 인쇄가 붙는 판 — 스물한 판째에 시설장 소튼이 나온다 */
export const STREAK_SILVER = 21
/** 금색 인쇄가 붙는 판 — 마흔아홉 판째다 */
export const STREAK_GOLD = 49

/** `FRONTIER_TRAINER_FACTORY_HEAD_THORTON_SILVER` — 트레이너 표의 자리 번호다 */
export const TRAINER_THORTON_SILVER = 309
/** `FRONTIER_TRAINER_FACTORY_HEAD_THORTON_GOLD` */
export const TRAINER_THORTON_GOLD = 310

/** 연승도 교환 횟수도 이 값에서 멈춘다 (`< 9999`로 막는다) */
export const MAX_STREAK = 9999

/**
 * 라운드 여덟 줄. 뒤로 갈수록 센 트레이너가 나온다.
 *
 * ⚠️ **한 줄에 구간이 둘이다.** 보통 판은 `[normal, normalEnd)`에서, **라운드의
 * 마지막 판**(일곱 번째)은 `[last, lastEnd)`에서 뽑는다 — 끝판대장을 따로
 * 두려는 것이다. 마지막 줄은 둘이 같아서 라운드 8 이후로는 구별이 없어진다
 */
interface TrainerRange {
  readonly normal: number
  readonly normalEnd: number
  readonly last: number
  readonly lastEnd: number
}

export const TRAINER_RANGES: readonly TrainerRange[] = [
  { normal: 0, normalEnd: 99, last: 100, lastEnd: 119 },
  { normal: 80, normalEnd: 119, last: 120, lastEnd: 139 },
  { normal: 100, normalEnd: 139, last: 140, lastEnd: 159 },
  { normal: 120, normalEnd: 159, last: 160, lastEnd: 179 },
  { normal: 140, normalEnd: 179, last: 180, lastEnd: 199 },
  { normal: 160, normalEnd: 199, last: 200, lastEnd: 219 },
  { normal: 180, normalEnd: 219, last: 220, lastEnd: 239 },
  { normal: 200, normalEnd: 299, last: 200, lastEnd: 299 },
]

/**
 * 개체를 뽑는 층 하나.
 *
 * `upTo`는 두 가지로 읽힌다 — 빌릴 것을 뽑을 때는 **줄 번호**로 바로 집고
 * (`ov104_0223A8F4`), 상대 것을 뽑을 때는 **트레이너 번호의 문턱**이다
 * (`ov104_0223A8A8`가 `트레이너 < upTo`인 첫 줄을 고른다). 같은 표를 두
 * 방식으로 읽는 것이 원작이다
 */
export interface SetTier {
  readonly upTo: number
  /** 뽑는 구간 `[from, to]` — **양끝을 다 넣는다** (`to - rand(to - from + 1)`) */
  readonly from: number
  readonly to: number
  /** 여섯 능력에 똑같이 넣는 개체값. 0·4·8·12·16·20·24·31 여덟 단계다 */
  readonly ivs: number
  /**
   * 다음 줄로 올라갈 수 있는가.
   *
   * ⚠️ **교환을 많이 한 사람은 마지막 몇 자리를 한 층 위에서 뽑는다**
   * (`FACTORY_ELITE_STEPS`). 마지막 세 줄은 위가 없어서 0이다
   */
  readonly canStepUp: boolean
}

/**
 * 레벨50. **빌리는 것과 상대 것이 같은 표다** (`Unk_ov104_0224028C`).
 *
 * 뒤 세 줄은 트레이너 문턱으로 읽을 때만 걸린다 — 300·310·311은 시설장
 * (소튼 309·310)과 그 언저리를 위한 자리라 라운드 번호로는 안 닿는다
 */
export const TIERS_LV50: readonly SetTier[] = [
  { upTo: 100, from: 1, to: 150, ivs: 0, canStepUp: true },
  { upTo: 120, from: 151, to: 250, ivs: 4, canStepUp: true },
  { upTo: 140, from: 251, to: 350, ivs: 8, canStepUp: true },
  { upTo: 160, from: 351, to: 486, ivs: 12, canStepUp: true },
  { upTo: 180, from: 487, to: 622, ivs: 16, canStepUp: true },
  { upTo: 200, from: 623, to: 758, ivs: 20, canStepUp: true },
  { upTo: 220, from: 759, to: 894, ivs: 24, canStepUp: true },
  { upTo: 300, from: 351, to: 950, ivs: 31, canStepUp: false },
  { upTo: 310, from: 351, to: 486, ivs: 12, canStepUp: false },
  { upTo: 311, from: 351, to: 486, ivs: 31, canStepUp: false },
]

/** 오픈레벨에서 **빌리는** 것 (`Unk_ov104_0224023C`) */
export const TIERS_OPEN_RENTAL: readonly SetTier[] = [
  { upTo: 100, from: 351, to: 486, ivs: 0, canStepUp: true },
  { upTo: 120, from: 487, to: 622, ivs: 4, canStepUp: true },
  { upTo: 140, from: 623, to: 758, ivs: 8, canStepUp: true },
  { upTo: 160, from: 759, to: 894, ivs: 12, canStepUp: true },
  { upTo: 180, from: 623, to: 950, ivs: 16, canStepUp: true },
  { upTo: 200, from: 623, to: 950, ivs: 20, canStepUp: true },
  { upTo: 220, from: 623, to: 950, ivs: 24, canStepUp: true },
  { upTo: 300, from: 351, to: 950, ivs: 31, canStepUp: false },
  { upTo: 310, from: 759, to: 950, ivs: 12, canStepUp: false },
  { upTo: 311, from: 759, to: 950, ivs: 31, canStepUp: false },
]

/** 오픈레벨에서 **상대가** 데리고 나오는 것 (`Unk_ov104_022402DC`) */
export const TIERS_OPEN_OPPONENT: readonly SetTier[] = [
  { upTo: 100, from: 351, to: 486, ivs: 0, canStepUp: true },
  { upTo: 120, from: 487, to: 622, ivs: 4, canStepUp: true },
  { upTo: 140, from: 623, to: 758, ivs: 8, canStepUp: true },
  { upTo: 160, from: 759, to: 894, ivs: 12, canStepUp: true },
  { upTo: 180, from: 351, to: 950, ivs: 16, canStepUp: true },
  { upTo: 200, from: 351, to: 950, ivs: 20, canStepUp: true },
  { upTo: 220, from: 351, to: 950, ivs: 24, canStepUp: true },
  { upTo: 300, from: 351, to: 950, ivs: 31, canStepUp: false },
  { upTo: 310, from: 759, to: 950, ivs: 12, canStepUp: false },
  { upTo: 311, from: 759, to: 950, ivs: 31, canStepUp: false },
]

/**
 * 교환을 몇 번 했으면 자리를 몇 개 올려 주는가 (`Unk_ov104_022401E8`).
 *
 * ⚠️ **문턱 「이하」면 그 자리 번호만큼이다.** 6 이하면 **하나도 안 올리고**,
 * 13 이하면 한 자리, 20 이하면 두 자리… 34를 넘어야 다섯 자리다 — 원작이
 * `param7 <= steps[i]`인 첫 `i`를 그대로 개수로 쓴다. 한 칸 밀려 읽기 쉬운 자리다.
 *
 * ⚠️ **많이 바꾼 사람에게 좋은 것이 온다는 뜻이 아니다** — 위 층은 상대에게도
 * 같은 규칙으로 적용되므로 판이 통째로 세진다
 */
export const FACTORY_ELITE_STEPS: readonly number[] = [6, 13, 20, 27, 34]

/**
 * 라운드를 끝내면 받는 BP (`ov104_022347F8`).
 *
 * 여덟 라운드까지 오르고 그 뒤로는 그대로다. 싱글·더블이 한 줄이고
 * 멀티가 다른 줄인데 **멀티는 §9라 지금 안 쓴다** — 값만 남겨 둔다
 */
export const BP_BY_ROUND_SOLO: readonly number[] = [0, 5, 5, 5, 5, 7, 7, 8, 9]
export const BP_BY_ROUND_MULTI: readonly number[] = [0, 10, 11, 12, 13, 16, 17, 19, 21]

/** 인쇄가 붙는 라운드(21·49판째)는 값이 통째로 바뀐다 */
export const BP_PRINT_ROUND = 20

/**
 * `FRONTIER_SCENE_FACTORY_CORRIDOR` — 시설 다섯 중 팩토리의 복도.
 *
 * ⚠️ **장면 번호가 시설을 가른다.** 로비 스크립트가 이 번호 하나로
 * `LaunchBattleFrontierScene`을 부르므로, 다른 넷(§9)은 여기 안 걸려서
 * 그대로 지나간다
 */
export const FRONTIER_SCENE_FACTORY_CORRIDOR = 3
