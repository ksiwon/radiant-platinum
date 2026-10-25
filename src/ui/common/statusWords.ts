// 상태 이상 딱지의 낱말 — 세 언어 한 벌.
//
// 다섯(잠듦 · 독 · 화상 · 얼음 · 마비)은 롬 메뉴 항목 뱅크 361의 0~4번 그대로다(`UI_BANK.menuEntries`).
// 요약·배틀 화면 모두 이 낱말을 쓰므로 화면마다 뱅크를 받지 않고 여기 적어 두고, 값이 롬과 같은지는
// `statusWords.test.ts`가 추출 자료와 맞대어 지킨다.
// 롬에 단독 낱말이 없는 셋은 롬의 말에서 가져왔다:
//   맹독 — 배틀 뱅크 368:79 「몸에 맹독이 퍼졌다」 / 「badly poisoned」(646:305) / 「もうどく」(368:79)
//   기절 — 368:30 「fainted!」 · 373:3 「기절해 버린」 · 373:3 「ひんしの」
//   포켓러스 — 213:10 「포켓러스」 · 「Pokérus」 · 「ポケルス」
import type { DataLocale } from '../../data/gameData'

type StatusWords = Readonly<Record<string, string>>

export const STATUS_WORDS: Readonly<Record<DataLocale, StatusWords>> = {
  ko: {
    slp: '잠듦', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비',
    // 원작 요약 화면이 HP 0이면 붙이는 딱지다 (`fnt`). 배틀 뷰는 `ko`로도 부른다
    fnt: '기절', ko: '기절',
    pkrs: '포켓러스',
  },
  en: {
    slp: 'ASLEEP', psn: 'POISONED', tox: 'BADLY POISONED', brn: 'BURNED', frz: 'FROZEN', par: 'PARALYZED',
    fnt: 'FAINTED', ko: 'FAINTED',
    pkrs: 'Pokérus',
  },
  ja: {
    slp: 'ねむり', psn: 'どく', tox: 'もうどく', brn: 'やけど', frz: 'こおり', par: 'まひ',
    fnt: 'ひんし', ko: 'ひんし',
    pkrs: 'ポケルス',
  },
}

/** 롬 뱅크 361에서 온 다섯 — 키와 줄 번호 */
export const STATUS_ROM_AT: Readonly<Record<string, number>> = { psn: 0, par: 1, slp: 2, brn: 3, frz: 4 }

export function statusWord(key: string, locale: DataLocale): string {
  return STATUS_WORDS[locale][key] ?? key
}
