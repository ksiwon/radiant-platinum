// 크기 대회 (`overlay005/size_contest.c`)
//
// 나룻배시티의 아저씨가 「그 포켓몬의 키를 재 준다」고 하는 자리다. 화면에
// 뜨는 수는 **인치의 1/10**이고, 종족의 키에 개체마다 다른 배수를 곱해 낸다.
//
// 배수를 만드는 방법이 이 파일의 전부다. 원작은 개체값과 성격값에서 균등한
// 16비트 수 하나를 짜낸 다음, **역오차함수를 열여섯 토막으로 근사한 표**를
// 통과시켜 290~1725 사이의 정규분포 비슷한 값으로 바꾼다. 대부분이 1000
// 언저리(= 도감의 키 그대로)에 몰리고 양 끝이 드물게 나오는 것이 그래서다.
//
// ⚠️ **표를 곱셈 하나로 줄이면 안 된다.** 토막마다 나누는 수가 다르다
// (1·2·4·20·50·100·150…). 그 계단이 곧 「굉장히 큰 개체」가 얼마나 드문지라,
// 매끈한 곡선으로 바꾸면 대회의 답이 달라진다.

/** 토막 하나 — 시작 값 · 밑값 · 나누는 수 (`NormalApproxIntervalParams`) */
interface Interval {
  base: number
  divisor: number
  start: number
}

/** `sUniformToNormalIntervals` 열여섯 토막 그대로 */
const INTERVALS: readonly Interval[] = [
  { base: 290, divisor: 1, start: 0 },
  { base: 300, divisor: 1, start: 10 },
  { base: 400, divisor: 2, start: 110 },
  { base: 500, divisor: 4, start: 310 },
  { base: 600, divisor: 20, start: 710 },
  { base: 700, divisor: 50, start: 2710 },
  { base: 800, divisor: 100, start: 7710 },
  { base: 900, divisor: 150, start: 17710 },
  { base: 1000, divisor: 150, start: 32710 },
  { base: 1100, divisor: 100, start: 47710 },
  { base: 1200, divisor: 50, start: 57710 },
  { base: 1300, divisor: 20, start: 62710 },
  { base: 1400, divisor: 5, start: 64710 },
  { base: 1500, divisor: 2, start: 65210 },
  { base: 1600, divisor: 1, start: 65410 },
  { base: 1700, divisor: 1, start: 65510 },
]

/**
 * 개체값 여섯과 성격값에서 균등한 16비트 수를 짠다 (`CalcSizeFactor`).
 *
 * ⚠️ **개체값을 4비트로 자른다** (`& 0xf`). 원작이 그렇게 하므로 16 이상인
 * 개체값의 윗비트는 크기에 안 쓰인다 — 31짜리와 15짜리가 같은 크기를 낸다
 */
export function sizeFactor(mon: {
  pid: number
  ivs: { hp: number, atk: number, def: number, spa: number, spd: number, spe: number }
}): number {
  const low16 = mon.pid & 0xffff
  const hp = mon.ivs.hp & 0xf
  const atk = mon.ivs.atk & 0xf
  const def = mon.ivs.def & 0xf
  const spe = mon.ivs.spe & 0xf
  const spa = mon.ivs.spa & 0xf
  const spd = mon.ivs.spd & 0xf
  const high = (((atk ^ def) * hp) ^ (low16 & 0xff)) & 0xffff
  const lower = (((spa ^ spd) * spe) ^ (low16 >> 8)) & 0xffff
  // 원작은 `high * 256 + low`를 그대로 돌려주고 받는 쪽이 u16으로 자른다
  return (high * 256 + lower) & 0xffff
}

/** 어느 토막인가 (`GetApproxIntervalIdx`) */
function intervalOf(factor: number): number {
  let i = 1
  for (; i < INTERVALS.length - 1; i++) {
    if (factor < INTERVALS[i]!.start) return i - 1
  }
  return i
}

/** 역오차함수 근사 — 290~1725 (`CalcMultFromSizeFactor`) */
export function sizeMultiplier(factor: number): number {
  const piece = INTERVALS[intervalOf(factor)]!
  return piece.base + Math.floor((factor - piece.start) / piece.divisor)
}

/**
 * 밀리미터 키 (`CalcMillimeterSize`).
 *
 * `heightDm`은 도감이 쓰는 데시미터다 — 1000배수(평균)에서 `4 * 1000 / 10`이
 * 400mm, 곧 0.4m가 된다
 */
export function sizeMillimeters(heightDm: number, factor: number): number {
  return Math.floor((heightDm * sizeMultiplier(factor)) / 10)
}

/**
 * 밀리미터 → 인치의 1/10 (`MM_TO_TENTH_OF_INCH`).
 *
 * ⚠️ **미터법 판에서도 인치로 잰다.** 원작이 언어와 상관없이 이 식 하나만
 * 쓰고 대사도 인치를 전제로 적혀 있다 — 센티미터로 바꾸면 자릿수가 안 맞는다
 */
export function tenthInches(mm: number): number {
  return Math.floor((Math.floor((mm * 1000) / 254) + 5) / 10)
}

/** 대회의 답 (`SizeContest_CalcResultForPartyMon`) */
export const SIZE_RESULT = { same: 0, larger: 1, smaller: 2 } as const

/**
 * 기록과 견준다.
 *
 * ⚠️ **밀리미터가 아니라 인치의 1/10로 견준다.** 반올림 뒤가 같으면 「같은
 * 크기」다 — 밀리미터로 견주면 거의 언제나 크거나 작다고 나온다
 */
export function compareSize(heightDm: number, factor: number, record: number): number {
  const mine = tenthInches(sizeMillimeters(heightDm, factor))
  const best = tenthInches(sizeMillimeters(heightDm, record))
  if (mine === best) return SIZE_RESULT.same
  return mine > best ? SIZE_RESULT.larger : SIZE_RESULT.smaller
}

/** `InitSizeContestRecord`가 넣는 첫 기록 */
export const SIZE_RECORD_INITIAL = 33280

/** 글 칸 둘 — 정수부와 소수 한 자리 (`SetStrTemplateMonSizeParams`) */
export function sizeParts(heightDm: number, factor: number): { whole: number, tenth: number } {
  const size = tenthInches(sizeMillimeters(heightDm, factor))
  return { whole: Math.floor(size / 10), tenth: size % 10 }
}
