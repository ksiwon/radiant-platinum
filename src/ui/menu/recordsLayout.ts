// 기록 · 의식 화면 넷(전당등록 · PC 전당 · 상장 · 크레딧)의 순수 규칙 — 화면 밖에서 시험할 수 있게 뗐다 (`recordsLayout.test.ts`).
//
// 글은 한 자도 안 바꾼다. 여기서 하는 일은 롬의 줄을 **묶음에 나눠 담는 것**, 눈금의 자리, 상장 그림 칸과 정수 배율,
// 크레딧의 진행 비율뿐이다.

// ─────────────────────────────────────────────────────────────────
// 전당등록 — 한 마리의 일곱 줄을 세 묶음으로
// ─────────────────────────────────────────────────────────────────

/** 묶음의 이름. 위계가 다르다 — 인사(머리글) · 주인공(별명이 이 순간의 주인공) · 출처(부글) */
type HofGroupKey = 'greeting' | 'hero' | 'source'

/**
 * 묶음이 뜨는 걸음 — 원작 `HallOfFame_PrintPokemonText`의 상태 0 · 1 · 2다 (`monText1` · `monText2` · `monText3`).
 * 인사가 첫 걸음, 별명과 종족 줄이 둘째, 어버이와 만난 곳이 셋째다 (같은 줄을 한 걸음에 한꺼번에 찍는다)
 */
export const HOF_GROUP_STEP: Readonly<Record<HofGroupKey, 1 | 2 | 3>> = { greeting: 1, hero: 2, source: 3 }

interface HofGroups {
  /** 「전당등록을 축하합니다!」 두 줄 — 빈 줄은 뺀다(한국판은 한 줄이 비어 있다) */
  greeting: string[]
  /** 별명 (없으면 종족 이름) */
  name: string
  /** 「종족 ♂ Lv.55」 */
  info: string
  /** 어버이 · 만난 곳 두 줄 — 빈 줄은 뺀다 */
  source: string[]
}

/**
 * `monLines`가 돌려주는 일곱 줄 — 인사 둘 · 별명 · 종족 · 어버이 · 만난 곳 둘 — 을 묶음으로 나눈다.
 * 빈 글만 뺀다. 한 줄도 안 지어내고 안 합친다
 */
export function hofGroups(lines: readonly string[]): HofGroups {
  const text = (i: number): string => lines[i] ?? ''
  const present = (...at: number[]): string[] => at.map(text).filter((l) => l !== '')
  return {
    greeting: present(0, 1),
    name: text(2),
    info: text(3),
    source: present(4, 5, 6),
  }
}

/** 그 걸음(`textAt` 1~3)에 이 묶음이 보이는가 — 한번 뜬 묶음은 그 마리가 나갈 때까지 남는다 */
export function hofGroupShown(group: HofGroupKey, textAt: number): boolean {
  return HOF_GROUP_STEP[group] <= textAt
}

// ─────────────────────────────────────────────────────────────────
// PC 전당 — 기록 눈금
// ─────────────────────────────────────────────────────────────────

/** 눈금에 그리는 막대의 최대 수 — 전당 기록은 서른 줄이 한도다 (`MAX_HALL_OF_FAME_ENTRIES`) */
export const PC_METER_MAX = 30

/**
 * 지금 보는 기록이 눈금의 몇 번째 막대인가 (왼쪽이 0).
 *
 * `entry`는 「최근에서 몇 번째 거슬러」라 0이 제일 새것이다. 눈금은 **왼쪽이 옛것 오른쪽이 새것**이라 뒤집힌다 —
 * 마지막 막대(`count - 1`)가 지금 열린 최근 기록이다
 */
export function pcMeterAt(count: number, entry: number): number {
  return Math.min(count, PC_METER_MAX) - 1 - entry
}

/** 눈금의 막대 수 (기록 수, 서른을 넘기지 않는다) */
export function pcMeterCount(count: number): number {
  return Math.max(0, Math.min(count, PC_METER_MAX))
}

// ─────────────────────────────────────────────────────────────────
// 상장 — 구운 그림의 칸과 정수 배율
// ─────────────────────────────────────────────────────────────────

/**
 * 상장 그림 칸 — 0이 신오, 1이 전국도감판이다 (`DIPLOMA_ART_SHEET`의 두 칸). 종이 색과 무늬가 그림에 실려 온다.
 * 판을 가르는 것은 도감을 얼마나 채웠는가(`diplomaNational`)다
 */
export function diplomaCell(national: boolean): 0 | 1 {
  return national ? 1 : 0
}

/** 상장 종이(원작 256×192) 안에서 글이 놓이는 자리 (px). 타일 × 8 — `diploma.c`의 `Diploma_LoadText` */
export const DIPLOMA_AT = {
  /** `PLAYER: {이름}` — 타일 (6, 4) */
  player: { x: 48, y: 32 },
  /** 신오 · 전국 네 줄 — 타일 (8, 8) */
  body: { x: 64, y: 64 },
  /** `GAME FREAK` — 타일 (17.25, 18) */
  maker: { x: 138, y: 144 },
} as const

/** 종이 한 장의 원본 크기 */
export const DIPLOMA_W = 256
export const DIPLOMA_H = 192
/** 종이 아래 안내 줄에 남기는 높이 */
const DIPLOMA_BELOW = 72

/**
 * 종이의 정수 배율 — 화면에 들어가는 가장 큰 정수(1~4)다. 도트라 소수 배율은 안 쓴다.
 * 960×640에서 2배(512×384)이고, 높이가 576+72를 넘는 화면에서야 3배다.
 * 2배도 안 들어가는 낮은 창에서는 1배로 내린다 — 종이가 창을 넘으면 아래쪽 글과 안내가 잘린다
 */
export function diplomaScale(width: number, height: number): 1 | 2 | 3 | 4 {
  const k = Math.floor(Math.min((width - 48) / DIPLOMA_W, (height - DIPLOMA_BELOW) / DIPLOMA_H))
  return Math.min(4, Math.max(1, k)) as 1 | 2 | 3 | 4
}

// ─────────────────────────────────────────────────────────────────
// 크레딧 — 진행 비율
// ─────────────────────────────────────────────────────────────────

/** 두루마리가 어디까지 흘렀나 (0~1). 전체 길이가 0이면 0이다 */
export function creditsProgress(frame: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, frame / total))
}
