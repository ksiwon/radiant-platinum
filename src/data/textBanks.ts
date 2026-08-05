// 로케일별 텍스트 뱅크 대응표 (DATA.md §2.11)
//
// pl_msg.narc의 뱅크 순서는 지역마다 다르다 (us 724 / ko 714 / ja 709개).
// 인덱스로 텍스트를 참조하면 로케일을 바꾸는 순간 엉뚱한 데이터가 나온다.
// 게임 코드는 반드시 의미 이름으로 참조하고, 이 표가 로케일별 인덱스로 옮긴다.
//
// 표는 tools/extract/textbanks.js가 생성한다. 손으로 고치지 말 것 —
// 롬을 다시 추출하면 `pnpm extract:textbanks`로 재생성한다.
import raw from './textBanks.json'

export type Locale = 'us' | 'ko' | 'ja'

export const LOCALES: readonly Locale[] = ['us', 'ko', 'ja']

export interface TextBank {
  /** 디컴프 res/text의 파일 이름 */
  name: string
  /** generated/text_banks.txt의 상수 이름 */
  constant: string
  /** 뱅크 헤더 +2의 암호화 키. 이름을 확정하는 근거다 */
  key: number
  /** 로케일별 pl_msg.narc 인덱스. null이면 그 롬에 없는 뱅크다 */
  bank: { us: number, ko: number | null, ja: number | null }
  entries: { us: number, ko: number | null, ja: number | null }
}

export const TEXT_BANKS: readonly TextBank[] = raw as TextBank[]

const byName = new Map<string, TextBank>(TEXT_BANKS.map((b) => [b.name, b]))

/**
 * 게임 코드가 실제로 참조하는 뱅크. 표에는 724개가 다 들어 있지만, 이름을 오타로
 * 적어도 런타임까지 안 터지면 곤란하므로 쓰는 것만 여기에 못 박는다.
 */
export const TEXT_BANK_NAMES = [
  'species_name',
  'species_category',
  'species_pokedex_entry_diamond',
  'species_height',
  'species_weight',
  'move_names',
  'move_descriptions',
  'ability_names',
  'ability_descriptions',
  'item_names',
  'item_descriptions',
  'pokemon_type_names',
  'nature_names',
  'location_names',
  'npc_trainer_names',
  'npc_trainer_messages',
  'trainer_class_names',
  'generic_names',
  'start_menu',
  'menu_entries',
  'bag',
  'bag_pocket_names',
  'party_menu',
  'pokedex',
] as const

export type TextBankName = (typeof TEXT_BANK_NAMES)[number]

// 표를 재생성했는데 이름이 사라졌으면 조용히 넘어가지 않고 즉시 터뜨린다
for (const name of TEXT_BANK_NAMES) {
  if (!byName.has(name)) {
    throw new Error(`textBanks.json에 "${name}" 뱅크가 없다 — textbanks.js를 다시 돌려야 한다`)
  }
}

export function getBank(name: TextBankName): TextBank {
  const bank = byName.get(name)
  if (!bank) throw new Error(`알 수 없는 텍스트 뱅크: ${name}`)
  return bank
}

/** 의미 이름 + 로케일 → pl_msg.narc 뱅크 인덱스. 그 롬에 없으면 null */
export function bankIndex(name: TextBankName, locale: Locale): number | null {
  return getBank(name).bank[locale]
}
