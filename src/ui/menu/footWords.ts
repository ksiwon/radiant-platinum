// 시설 · 진화 · 기록 화면의 바닥 안내 조각 — 롬에 없는 키 안내를 세 언어로.
//
// 한 줄 안에서 「고르기 · 결정 · 닫기」 동사는 화면마다 같은 말이어야 한다(L6). 영어와 일본어는 다른 화면이 이미 쓰는 말을
// 그대로 가져왔다 — `X Close` · `Z Confirm` · `Z Continue` · `Z Skip`은 배틀 안내(`BATTLE_WORDS`), `X Cancel` · `X やめる`는
// 롬 배틀 파티 뱅크 59(CANCEL · やめる), `Z Teach`는 기술 되살리기 안내다.
import type { DataLocale } from '../../data/gameData'
import { useGameLocale } from '../../state/optionsStore'

export interface FootWords {
  /** ↑↓ 고르기 · Z 결정 */
  pick: string
  close: string
  /** 교환을 중지하는 X */
  stop: string
  /** 마지막으로 고른 한 마리를 무르는 X */
  undoOne: string
  /** 일을 버리는 X — 「닫기」와 뜻이 다르다 */
  cancel: string
  /** Z · X 닫기 (둘 다 닫는다) */
  anyClose: string
  next: string
  skip: string
  toTitle: string
}

export const FOOT_WORDS: Record<DataLocale, FootWords> = {
  ko: {
    pick: '↑↓ 고르기 · Z 결정', close: 'X 닫기', stop: 'X 중지', undoOne: 'X 한 마리 되돌리기',
    cancel: 'X 그만둔다', anyClose: 'Z · X 닫기', next: 'Z 계속', skip: 'Z 넘기기', toTitle: 'Z 타이틀로',
  },
  en: {
    pick: '↑↓ Select · Z Confirm', close: 'X Close', stop: 'X Stop', undoOne: 'X Undo last pick',
    cancel: 'X Cancel', anyClose: 'Z · X Close', next: 'Z Continue', skip: 'Z Skip', toTitle: 'Z Title screen',
  },
  ja: {
    pick: '↑↓ 選ぶ · Z 決定', close: 'X 閉じる', stop: 'X 中止', undoOne: 'X 一匹戻す',
    cancel: 'X やめる', anyClose: 'Z · X 閉じる', next: 'Z 続ける', skip: 'Z 送る', toTitle: 'Z タイトルへ',
  },
}

export function footWords(locale: DataLocale): FootWords {
  return FOOT_WORDS[locale]
}

export function useFootWords(): FootWords {
  return FOOT_WORDS[useGameLocale()]
}
