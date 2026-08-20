// 트레이너의 「모습」 (`appearance.c`)
//
// 무쇠시티 포켓몬센터의 사람이 「당신은 어떻게 보이고 싶습니까」를 묻는 자리다.
// 통신 대전에서 남에게 보이는 겉모습이고, 리포트에 번호 하나로 남는다.
//
// 후보는 늘 넷인데 **트레이너 번호가 어느 넷인지를 정한다** — 아무나 아무
// 모습이나 고를 수 있는 것이 아니다. 그래서 표 둘이 필요하다: 성별마다 여덟
// 모습(`sTrainerAppearances`)과, 번호를 여덟 벌의 후보 조합으로 흩는 표
// (`sAppearanceShuffleTable`).

/** 성별 하나가 가진 모습 수 (`APPEARANCES_COUNT`) */
const APPEARANCES = 8
/** 한 사람에게 보여 주는 후보 수 (`VARIANTS_COUNT`) */
const VARIANTS = 4

/**
 * 모습 하나 — 그림 번호와 트레이너 분류.
 *
 * ⚠️ **두 수가 다르다.** `index`는 트레이너 카드가 쓰는 그림 자리고 `trainerClass`는
 * 이름표를 찾는 분류 번호다. 리포트에 남는 것은 `index` 쪽이다
 */
interface Appearance {
  index: number
  trainerClass: number
}

/** `sTrainerAppearances` — 남자 여덟 다음 여자 여덟 */
const APPEARANCE: readonly Appearance[] = [
  // 남자: 학교아이 · 벌레잡이 · 엘리트트레이너♂ · 불량배 · 유적매니아 · 검은띠 · 도련님 · 초능력자♂
  { index: 3, trainerClass: 60 },
  { index: 5, trainerClass: 6 },
  { index: 11, trainerClass: 24 },
  { index: 31, trainerClass: 57 },
  { index: 50, trainerClass: 48 },
  { index: 51, trainerClass: 14 },
  { index: 62, trainerClass: 32 },
  { index: 70, trainerClass: 49 },
  // 여자: 미니스커트 · 배틀걸 · 미녀 · 엘리트트레이너♀ · 아이돌 · 사모님 · 카우걸 · 귀부인
  { index: 6, trainerClass: 3 },
  { index: 7, trainerClass: 10 },
  { index: 13, trainerClass: 36 },
  { index: 14, trainerClass: 25 },
  { index: 35, trainerClass: 85 },
  { index: 37, trainerClass: 35 },
  { index: 42, trainerClass: 18 },
  { index: 63, trainerClass: 33 },
]

/** `sAppearanceShuffleTable` — 트레이너 번호 % 8 줄의 네 후보 */
const SHUFFLE: readonly (readonly number[])[] = [
  [0, 1, 2, 3],
  [1, 6, 7, 0],
  [2, 3, 4, 5],
  [3, 0, 5, 6],
  [4, 1, 2, 7],
  [5, 2, 7, 0],
  [6, 3, 4, 1],
  [7, 4, 5, 6],
]

/** 그 트레이너의 `variant`번째 후보의 모습 번호 (`Appearance_CalculateFromTrainerInfo`) */
export function appearanceOf(trainerId: number, gender: number, variant: number): number {
  const row = SHUFFLE[trainerId % APPEARANCES] ?? SHUFFLE[0]!
  const at = (row[variant] ?? 0) + APPEARANCES * gender
  return APPEARANCE[at]?.index ?? 0
}

/** 후보 넷의 트레이너 분류 (`Appearance_LoadVariants` — 칸 0~3을 채운다) */
export function appearanceVariants(trainerId: number, gender: number): number[] {
  return Array.from({ length: VARIANTS }, (_, v) => {
    const row = SHUFFLE[trainerId % APPEARANCES] ?? SHUFFLE[0]!
    const at = (row[v] ?? 0) + APPEARANCES * gender
    return APPEARANCE[at]?.trainerClass ?? 0
  })
}

/**
 * 모습 번호 → 트레이너 분류 (`Appearance_GetData`).
 *
 * ⚠️ **못 찾으면 0번이다.** 원작 `GetAppearanceIndex`가 표를 훑다 실패하면
 * 그냥 0을 돌려준다 — 리포트가 아직 비어 있는 사람이 학교아이로 보이는 이유다
 */
export function appearanceClass(gender: number, appearance: number): number {
  const base = APPEARANCES * gender
  for (let i = 0; i < APPEARANCES; i++) {
    if (APPEARANCE[base + i]?.index === appearance) return APPEARANCE[base + i]!.trainerClass
  }
  return APPEARANCE[0]!.trainerClass
}
