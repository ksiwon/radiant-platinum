// 나무열매 밭 118 (PARITY §4.6) — `berry_patches.c`
//
// 도로변에 흙이 파여 있고 그 자리마다 열매를 심는다. 열매는 **꺼 둔 동안에도
// 자란다** — 꿀 나무와 같이 마지막으로 본 분에서 지금까지의 차이로 한꺼번에
// 밀어 준다 (`world/daily`의 `minute`).
//
// ⚠️ **새 리포트에 이미 118곳이 열려 있다.** 빈 밭에서 시작하지 않는다
// (`berryInit`). 그래서 첫 도로에서부터 열매를 딸 수 있다.
//
// ⚠️ **본 적 없는 밭은 안 자란다.** `BerryPatches_Init`이 `isGrowing`을 한 번도
// 세우지 않고, 그걸 세우는 자리는 **화면에 밭이 들어왔을 때** 하나뿐이다
// (`BerryPatches_UpdateGrowthStates`). 한 번 서면 리포트에 남아 계속 자란다 —
// 즉 「가 본 밭만 자란다」가 원작의 규칙이다. 이걸 빼고 전부 자라게 하면
// 안 가 본 밭이 아홉 날 만에 통째로 비어 버린다.
//
// ⚠️ **아홉 날쯤 안 오면 밭이 비워진다.** 밭의 최대 수명(단계 길이 × 총 단계
// 수)을 넘겨 지나가면 심은 것이 통째로 사라진다 — 흙만 남는다.
import {
  BERRY_GROWTH, BERRY_PATCH_INIT, FIRST_BERRY_ITEM, FIRST_MULCH_ITEM,
} from './berryInit'

/** `MAX_BERRY_PATCHES`. 배치표가 쓰는 것은 118뿐이고 나머지 열은 늘 비어 있다 */
export const MAX_BERRY_PATCHES = 128

/** `BASE_HARVEST_STAGES` — 열린 채로 버티는 단계 수 */
export const BASE_HARVEST_STAGES = 4
/** `BASE_MAX_REPLANT_COUNT` — 저절로 다시 심기는 횟수 */
const BASE_MAX_REPLANT_COUNT = 10
/** `MAX_MOISTURE_RATING` */
export const MAX_MOISTURE_RATING = 100
/** `MAX_YIELD_RATING` */
export const MAX_YIELD_RATING = 5

/** `generated/berry_growth_stages.txt` */
export const BERRY_STAGE = {
  none: 0, planted: 1, sprouted: 2, growing: 3, blooming: 4, fruit: 5,
} as const

/** `enum MulchType` */
export const MULCH = { none: 0, growth: 1, damp: 2, stable: 3, gooey: 4 } as const

/** `enum SoilMoisture` */
export const SOIL = { veryDry: 0, dry: 1, moist: 2 } as const

/** 한 밭 (`BerryPatch`) */
export interface BerryPatch {
  /** 1부터 세는 열매 번호. **0이 빈 밭**이다 (`BERRY_TAG_NONE`) */
  berryID: number
  /** `BERRY_STAGE.*` */
  growthStage: number
  /** 다음 단계까지 남은 분 */
  stageMinutesRemaining: number
  /** 아직 한 시간이 안 된 나머지 분 0~59 */
  moistureMinutesRemaining: number
  /** 저절로 다시 심긴 횟수 */
  replantCount: number
  /** 지금 열려 있는 개수. 딸 때 이만큼 가방에 들어간다 */
  yield: number
  /** 물기 0~100 */
  moistureRating: number
  /** 수확 등급 0~5. 열매 개수를 곱하는 값이다 */
  yieldRating: number
  /** `MULCH.*` */
  mulchType: number
  /** 화면에 한 번이라도 들어왔는가. 이게 서야 자란다 */
  isGrowing: boolean
}

/** 밭의 성장 자료. `berries.json`에서 온다 (`BerryGrowthData`) */
export interface BerryGrowth {
  /** 한 단계에 걸리는 **시간** (`BERRYATTR_STAGE_DURATION`) */
  stageDuration: number
  /** 한 시간에 마르는 물기 (`BERRYATTR_MOISTURE_DRAIN_RATE`) */
  moistureDrain: number
  /** 수확 등급 1당 열리는 개수 (`BERRYATTR_BASE_YIELD`) */
  baseYield: number
}

/**
 * 그 열매의 성장 값 (`BerryGrowthData_Init`). 빈 밭(0)이면 null이다.
 *
 * ⚠️ **자료 파일을 안 기다린다.** 원작은 롬의 열매 자료를 그 자리에서 읽는데
 * 우리 자료는 비동기라, 리포트를 만드는 순간에는 아직 안 와 있다. 그래서 이
 * 세 값만 소스에 구워 둔다 (`berryInit`의 `BERRY_GROWTH`)
 */
export function berryGrowth(berryID: number): BerryGrowth | null {
  const row = BERRY_GROWTH[berryID - 1]
  if (!row) return null
  return { stageDuration: row[0], moistureDrain: row[1], baseYield: row[2] }
}

/** 열매 번호(1부터) → 도구 번호 (`BerryPatches_ConvertTagNumberToItemID`) */
export function berryItemOf(berryID: number): number {
  return berryID === 0 ? 0 : berryID + FIRST_BERRY_ITEM - 1
}

/** 도구 번호 → 열매 번호(1부터) (`BerryPatches_ConvertItemIDToTagNumber`) */
export function berryTagOf(itemID: number): number {
  return itemID === 0 ? 0 : itemID - FIRST_BERRY_ITEM + 1
}

/** 비료 종류 → 도구 번호 (`BerryPatches_ConvertMulchTypeToItemID`) */
export function mulchItemOf(mulchType: number): number {
  return mulchType === MULCH.none ? 0 : mulchType + FIRST_MULCH_ITEM - 1
}

/** 도구 번호 → 비료 종류 (`BerryPatches_ConvertItemIDToMulchType`) */
export function mulchTypeOf(itemID: number): number {
  return itemID === 0 ? MULCH.none : itemID - FIRST_MULCH_ITEM + 1
}

/** 빈 밭 (`ZeroBerryPatch`) */
export function emptyPatch(): BerryPatch {
  return {
    berryID: 0,
    growthStage: BERRY_STAGE.none,
    stageMinutesRemaining: 0,
    moistureMinutesRemaining: 0,
    replantCount: 0,
    yield: 0,
    moistureRating: 0,
    yieldRating: 0,
    mulchType: MULCH.none,
    isGrowing: false,
  }
}

/**
 * 한 단계에 걸리는 분 (`CalcMinutesRemainingInStage`).
 *
 * 성장비료가 4분의 3으로 줄이고 촉촉비료가 1.5배로 늘인다 — 촉촉비료는
 * **느리게 만드는 대신** 물이 반만 마른다
 */
export function stageMinutes(growth: BerryGrowth, mulchType: number): number {
  const base = growth.stageDuration * 60
  if (mulchType === MULCH.growth) return Math.floor((base * 3) / 4)
  if (mulchType === MULCH.damp) return base + Math.floor(base / 2)
  return base
}

/**
 * 한 시간에 마르는 물기 (`CalcMoistureDrainRate`).
 *
 * 촉촉비료는 절반, 성장비료는 1.5배다 — 빨리 자라는 값을 물로 치른다
 */
export function moistureDrain(growth: BerryGrowth, mulchType: number): number {
  const rate = growth.moistureDrain
  if (mulchType === MULCH.damp) return Math.floor(rate / 2)
  if (mulchType === MULCH.growth) return rate + Math.floor(rate / 2)
  return rate
}

/** 열린 채로 버티는 단계 수 (`GetHarvestTimeWithMulch`). 안정비료면 6이다 */
export function harvestStages(patch: BerryPatch): number {
  return patch.mulchType === MULCH.stable
    ? BASE_HARVEST_STAGES + Math.floor(BASE_HARVEST_STAGES / 2)
    : BASE_HARVEST_STAGES
}

/** 다시 심기는 횟수 (`GetTotalReplantCountWithMulch`). 끈적비료면 15다 */
export function replantLimit(patch: BerryPatch): number {
  return patch.mulchType === MULCH.gooey
    ? BASE_MAX_REPLANT_COUNT + Math.floor(BASE_MAX_REPLANT_COUNT / 2)
    : BASE_MAX_REPLANT_COUNT
}

/** 다시 심기는 횟수의 최대 — 끈적비료를 뿌린 밭이다. 리포트 검사가 이 값을 쓴다 */
export const MAX_REPLANT_COUNT = BASE_MAX_REPLANT_COUNT + Math.floor(BASE_MAX_REPLANT_COUNT / 2)

/**
 * 남은 분이 가질 수 있는 가장 큰 값.
 *
 * 제일 느린 열매(24시간)에 **촉촉비료**를 뿌리면 한 단계가 1.5배가 되고, 열린
 * 단계는 다시 네 배다 → 24 × 60 × 1.5 × 4. 안정비료 쪽(×1 × 6)도 같은 값이라
 * 비료를 무엇으로 하든 이 위로는 못 간다
 */
export const MAX_STAGE_MINUTES = (() => {
  let most = 0
  for (const [duration] of BERRY_GROWTH) {
    for (const mulch of Object.values(MULCH)) {
      const one = stageMinutes({ stageDuration: duration, moistureDrain: 0, baseYield: 0 }, mulch)
      const fruit = one * (mulch === MULCH.stable ? 6 : BASE_HARVEST_STAGES)
      if (fruit > most) most = fruit
    }
  }
  return most
})()

/** 한 밭에 열릴 수 있는 가장 많은 개수 — 기본 개수의 최대 × 등급 5 */
export const MAX_BERRY_YIELD = Math.max(
  2, ...BERRY_GROWTH.map(([, , baseYield]) => baseYield * MAX_YIELD_RATING),
)

/** 밭이 사라지기까지의 총 단계 수 (`CalcTotalStageCount`) */
export function totalStageCount(patch: BerryPatch): number {
  return 1 + (3 + harvestStages(patch)) * replantLimit(patch)
}

/** 흙이 얼마나 말랐는가 (`BerryPatches_GetPatchMoisture`) */
export function soilMoisture(patch: BerryPatch): number {
  if (patch.moistureRating === 0) return SOIL.veryDry
  if (patch.moistureRating <= 50) return SOIL.dry
  return SOIL.moist
}

/** 열리는 개수 (`CalcBerryYield`) */
function berryYield(patch: BerryPatch, growth: BerryGrowth): number {
  return growth.baseYield * patch.yieldRating
}

/**
 * 심는다 (`BerryPatches_PlantInPatch`).
 *
 * ⚠️ **비료는 안 지운다.** 뿌려 둔 비료가 그대로 남아 새로 심은 열매에 붙는다 —
 * 그래서 비료는 한 번 뿌리면 그 밭에 계속 듣는다
 */
export function plantBerry(patch: BerryPatch, growth: BerryGrowth, berryID: number): BerryPatch {
  return {
    ...patch,
    berryID,
    growthStage: BERRY_STAGE.planted,
    stageMinutesRemaining: stageMinutes(growth, patch.mulchType),
    moistureMinutesRemaining: 0,
    replantCount: 0,
    yield: 0,
    moistureRating: MAX_MOISTURE_RATING,
    yieldRating: MAX_YIELD_RATING,
    isGrowing: true,
  }
}

/** 물을 준다 (`BerryPatches_ResetPatchMoisture`). 물기만 채우고 등급은 안 되돌린다 */
export function waterPatch(patch: BerryPatch): BerryPatch {
  return { ...patch, moistureRating: MAX_MOISTURE_RATING }
}

/**
 * 딴다 (`BerryPatches_HarvestPatch`). 밭이 통째로 비고, 뿌려 둔 비료도 함께 없어진다.
 *
 * @returns 가방에 넣을 개수와 비워진 밭
 */
export function harvestPatch(patch: BerryPatch): { yield: number; patch: BerryPatch } {
  return { yield: patch.yield, patch: emptyPatch() }
}

/**
 * 다음 단계로 (`AdvancePatchGrowth`).
 *
 * ⚠️ **열려 있는 채로 두면 열매가 없어진다.** 열린 단계가 끝나면 개수가 0이 되고
 * 싹으로 되돌아가 다시 심긴다 — 안 따고 놔두면 잃는 것이다.
 *
 * ⚠️ **다시 심길 때 수확 등급이 5로 되돌아간다.** 말라서 깎였던 등급이 회복되므로
 * 물을 안 줘도 밭이 영영 나빠지지는 않는다
 */
export function advanceGrowth(patch: BerryPatch, growth: BerryGrowth): BerryPatch {
  switch (patch.growthStage) {
    case BERRY_STAGE.planted:
    case BERRY_STAGE.sprouted:
    case BERRY_STAGE.growing:
      return { ...patch, growthStage: patch.growthStage + 1 }

    case BERRY_STAGE.blooming: {
      // 등급이 0까지 깎여도 **둘은 열린다** — 원작이 밑을 받쳐 둔다
      const count = Math.max(2, berryYield(patch, growth))
      return { ...patch, yield: count, growthStage: BERRY_STAGE.fruit }
    }

    case BERRY_STAGE.fruit: {
      const next: BerryPatch = {
        ...patch,
        yield: 0,
        growthStage: BERRY_STAGE.sprouted,
        yieldRating: MAX_YIELD_RATING,
        replantCount: patch.replantCount + 1,
      }
      return next.replantCount === replantLimit(next) ? emptyPatch() : next
    }

    default:
      // `BERRY_GROWTH_STAGE_NONE`은 여기 못 온다 (`GF_ASSERT(FALSE)`)
      return patch
  }
}

/**
 * 물기를 깎는다 (`DrainPatchMoisture`).
 *
 * ⚠️ **열려 있는 동안은 안 마른다.** 열린 밭은 이 함수가 첫 줄에서 돌아간다 —
 * 따갈 때까지 기다리는 동안 등급이 더 깎이지 않는다.
 *
 * ⚠️ **물기가 0이 된 **뒤부터** 수확 등급이 시간당 1씩 깎인다.** 마르는 것과
 * 깎이는 것이 같은 시간에 겹치지 않게, 물기가 0에 닿기까지 걸린 시간을 먼저 빼고
 * 남은 시간만 등급에서 뺀다
 */
export function drainMoisture(
  patch: BerryPatch, growth: BerryGrowth, minutesPassed: number,
): BerryPatch {
  if (patch.growthStage === BERRY_STAGE.fruit) return patch

  const rate = moistureDrain(growth, patch.mulchType)
  const total = minutesPassed + patch.moistureMinutesRemaining
  let hours = Math.floor(total / 60)
  const next: BerryPatch = { ...patch, moistureMinutesRemaining: total % 60 }
  if (hours === 0) return next

  if (next.moistureRating >= rate * hours) {
    next.moistureRating -= rate * hours
    return next
  }

  if (next.moistureRating > 0) {
    // 올림 나눗셈이다 — 물기가 조금이라도 남아 있던 그 한 시간은 깎이지 않는다
    hours -= Math.floor((next.moistureRating + (rate - 1)) / rate)
    next.moistureRating = 0
  }

  next.yieldRating = next.yieldRating > hours ? next.yieldRating - hours : 0
  return next
}

/**
 * 지나간 분만큼 밭 전부를 민다 (`BerryPatches_ElapseMinutes`).
 *
 * ⚠️ **한 걸음씩 미는 것이 아니라 남은 분을 넘길 때마다 단계를 올린다.** 아홉 날
 * 뒤에 와도 그 사이의 물 마름과 다시 심김이 순서대로 다 계산된다.
 *
 * ⚠️ **최대 수명을 넘겼으면 계산하지 않고 그냥 비운다.** 이게 없으면 몇 달치를
 * 한 걸음씩 돌게 된다
 */
export function elapseBerryPatches(
  patches: readonly BerryPatch[], minutesPassed: number,
  growthOf: (berryID: number) => BerryGrowth | null = berryGrowth,
): BerryPatch[] {
  const out = patches.slice()
  for (let i = 0; i < out.length; i++) {
    const start = out[i]
    if (!start) continue
    if (start.berryID === 0 || start.growthStage === BERRY_STAGE.none || !start.isGrowing) continue
    const growth = growthOf(start.berryID)
    if (!growth) continue

    if (minutesPassed >= stageMinutes(growth, start.mulchType) * totalStageCount(start)) {
      out[i] = emptyPatch()
      continue
    }

    let patch = start
    let left = minutesPassed
    while (patch.growthStage !== BERRY_STAGE.none && left !== 0) {
      if (patch.stageMinutesRemaining > left) {
        patch = drainMoisture(patch, growth, left)
        patch = { ...patch, stageMinutesRemaining: patch.stageMinutesRemaining - left }
        break
      }
      const spent = patch.stageMinutesRemaining
      patch = drainMoisture(patch, growth, spent)
      patch = advanceGrowth(patch, growth)
      left -= spent
      let next = stageMinutes(growth, patch.mulchType)
      // 열린 단계만 길다 — 딸 시간을 주는 자리다
      if (patch.growthStage === BERRY_STAGE.fruit) next *= harvestStages(patch)
      patch = { ...patch, stageMinutesRemaining: next }
    }
    out[i] = patch
  }
  return out
}

/**
 * 새 리포트의 밭 128칸 (`BerryPatches_Init`).
 *
 * ⚠️ **열린 채로 시작한다.** 단계가 곧바로 「열림」이고 남은 분이 한 단계의 네 배다
 * — 열린 단계의 길이와 같은 값이라, 첫 마을을 나오면 바로 딸 수 있다.
 *
 * ⚠️ **`isGrowing`은 아무 밭도 안 서 있다.** 원작이 여기서 세우지 않는다 — 밭을
 * 눈으로 봐야 비로소 시간이 흐르기 시작한다.
 *
 * ⚠️ **수확 등급이 3이다** (심을 때의 5가 아니다). 그래서 처음 열려 있는 열매는
 * 표에 적힌 개수 그대로고, 직접 심은 것보다 적다
 */
export function newBerryPatches(
  growthOf: (berryID: number) => BerryGrowth | null = berryGrowth,
): BerryPatch[] {
  const out: BerryPatch[] = []
  for (let i = 0; i < MAX_BERRY_PATCHES; i++) {
    const init = BERRY_PATCH_INIT[i]
    if (!init) {
      // 배치표가 안 쓰는 열이다. 원작은 여기서 표 밖을 읽지만 그 열은 `isGrowing`이
      // 서지 않아 영영 안 자라고, 밭 객체도 없어 손이 닿지 않는다
      out.push(emptyPatch())
      continue
    }
    const [berryID, count] = init
    const growth = growthOf(berryID)
    out.push({
      ...emptyPatch(),
      berryID,
      growthStage: BERRY_STAGE.fruit,
      stageMinutesRemaining: growth ? stageMinutes(growth, MULCH.none) * BASE_HARVEST_STAGES : 0,
      yield: count,
      moistureRating: MAX_MOISTURE_RATING,
      yieldRating: 3,
    })
  }
  return out
}
