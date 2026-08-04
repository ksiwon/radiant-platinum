// 로케일별 텍스트 뱅크 대응표 (PLAN §4.2)
//
// pl_msg.narc의 뱅크 순서는 지역마다 다르다 (us 724 / ko 714 / ja 709개).
// 인덱스로 텍스트를 참조하면 로케일을 바꾸는 순간 엉뚱한 데이터가 나온다.
// 게임 코드는 반드시 의미 이름으로 참조하고, 이 표가 로케일별 인덱스로 옮긴다.
//
// 표는 tools/spike/bank-map.js가 생성한다. 손으로 고치지 말 것 —
// 롬을 다시 추출하면 `node tools/spike/bank-map.js`로 재생성한다.
import raw from './textBanks.json'

export type Locale = 'us' | 'ko' | 'ja'

export const LOCALES: readonly Locale[] = ['us', 'ko', 'ja']

export interface TextBank {
  name: string
  /** 뱅크의 엔트리 수. 3로케일이 동일해야 한다 — 판별의 1차 조건이다 */
  entries: number
  us: number
  ko: number
  ja: number
  /** 영어만 존재하는 대문자 변형 뱅크. CJK는 대소문자가 없어 하나뿐이다 */
  usVariants?: number[]
  koDrift?: number
  jaDrift?: number
  koConfidence?: 'high' | 'low'
  jaConfidence?: 'high' | 'low'
}

/**
 * 게임 코드가 참조하는 뱅크 이름. JSON 임포트는 리터럴을 string으로 넓혀버려서
 * 여기에 따로 적는다 — 대신 아래에서 JSON과 일치하는지 런타임에 검사한다.
 */
export const TEXT_BANK_NAMES = [
  'species_names',
  'move_names',
  'ability_names',
  'item_names',
  'type_names',
  'nature_names',
  'location_names',
  'trainer_names',
  'trainer_classes',
] as const

export type TextBankName = (typeof TEXT_BANK_NAMES)[number]

// JSON 쪽 confidence는 string으로 넓혀지므로 여기서 한 번 좁힌다
export const TEXT_BANKS: readonly TextBank[] = raw as TextBank[]

const byName = new Map<string, TextBank>(TEXT_BANKS.map((b) => [b.name, b]))

// 표를 재생성했는데 이름이 어긋나면 조용히 넘어가지 않고 즉시 터뜨린다
for (const name of TEXT_BANK_NAMES) {
  if (!byName.has(name)) {
    throw new Error(`textBanks.json에 "${name}" 뱅크가 없다 — bank-map.js를 다시 돌려야 한다`)
  }
}

/** 의미 이름 + 로케일 → pl_msg.narc 뱅크 인덱스 */
export function bankIndex(name: TextBankName, locale: Locale): number {
  const bank = byName.get(name)
  if (!bank) throw new Error(`알 수 없는 텍스트 뱅크: ${name}`)
  return bank[locale]
}

export function getBank(name: TextBankName): TextBank {
  const bank = byName.get(name)
  if (!bank) throw new Error(`알 수 없는 텍스트 뱅크: ${name}`)
  return bank
}
