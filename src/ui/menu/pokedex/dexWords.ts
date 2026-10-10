// 도감 화면의 우리 글 — 롬 도감 뱅크(697)에 없는 이름표 · 키 안내 · 제목을 세 언어로.
//
// 롬에 있는 말(코러스 · 팬 · 검색 줄 이름 · 발견한 수 …)은 `dexText`의 줄 번호로 읽는다. 이 표는 그 밖의 글이다.
// 영어 제목과 일본어 제목은 롬 졸업장 글(`National Pokédex` · `ぜんこく　ポケモンずかん`)의 말을 따랐다.
import type { DataLocale } from '../../../data/gameData'
import { useGameLocale } from '../../../state/optionsStore'

export interface DexWords {
  title: string
  titleNational: string
  /** 검색 창 첫 줄의 이름표와 그 값 둘 */
  dexRow: string
  sinnoh: string
  national: string
  /** 무게 · 키 순은 잡은 것만 나온다 */
  caughtOnly: string
  /** 바닥 안내 */
  searchFoot: string
  tuneFoot: (chorus: string, pan: string) => string
  areaFoot: string
  cryFoot: string
  listFoot: (page: string) => string
  /** 목록 바닥의 「쪽」 / 「모습·쪽」 */
  page: string
  formsPage: string
}

export const DEX_WORDS: Record<DataLocale, DexWords> = {
  ko: {
    title: '도감', titleNational: '전국도감', dexRow: '도감', sinnoh: '신오', national: '전국',
    caughtOnly: '잡아 본 것만 나온다',
    searchFoot: '↑↓ 줄 · ←→ 값 · Z 닫기 · X 물음을 지운다',
    tuneFoot: (chorus, pan) => `←→ 볼 · ↑↓ 높낮이 · Q/E ${chorus}·${pan} · Z 재생 · Shift X 나가기`,
    areaFoot: '↑↓ 고르기 · ←→ 쪽 · Shift 시간대 · Tab 검색 · Z 울음소리 · X 닫기',
    cryFoot: '↑↓ 고르기 · ←→ 쪽 · Z 재생 · Shift 조절 · Tab 검색 · X 닫기',
    listFoot: (page) => `↑↓ 고르기 · Q/E 한 쪽씩 · ←→ ${page} · Tab 검색 · Z 울음소리 · X 닫기`,
    page: '쪽', formsPage: '모습·쪽',
  },
  en: {
    title: 'Pokédex', titleNational: 'National Pokédex', dexRow: 'Pokédex', sinnoh: 'Sinnoh', national: 'National',
    caughtOnly: 'Only caught Pokémon are listed',
    searchFoot: '↑↓ Row · ←→ Value · Z Close · X Clear query',
    tuneFoot: (chorus, pan) => `←→ Ball · ↑↓ Pitch · Q/E ${chorus}·${pan} · Z Play · Shift X Leave`,
    areaFoot: '↑↓ Select · ←→ Page · Shift Time · Tab Search · Z Cry · X Close',
    cryFoot: '↑↓ Select · ←→ Page · Z Play · Shift Tune · Tab Search · X Close',
    listFoot: (page) => `↑↓ Select · Q/E Page · ←→ ${page} · Tab Search · Z Cry · X Close`,
    page: 'Page', formsPage: 'Form·Page',
  },
  ja: {
    title: 'ずかん', titleNational: 'ぜんこくずかん', dexRow: 'ずかん', sinnoh: 'シンオウ', national: 'ぜんこく',
    caughtOnly: '捕まえたものだけ出る',
    searchFoot: '↑↓ 行 · ←→ 値 · Z 閉じる · X 条件を消す',
    tuneFoot: (chorus, pan) => `←→ ボール · ↑↓ 高さ · Q/E ${chorus}·${pan} · Z 再生 · Shift X 出る`,
    areaFoot: '↑↓ 選ぶ · ←→ ページ · Shift 時間帯 · Tab 検索 · Z 鳴き声 · X 閉じる',
    cryFoot: '↑↓ 選ぶ · ←→ ページ · Z 再生 · Shift 調整 · Tab 検索 · X 閉じる',
    listFoot: (page) => `↑↓ 選ぶ · Q/E ページ送り · ←→ ${page} · Tab 検索 · Z 鳴き声 · X 閉じる`,
    page: 'ページ', formsPage: 'すがた·ページ',
  },
}

export function useDexWords(): DexWords {
  return DEX_WORDS[useGameLocale()]
}
