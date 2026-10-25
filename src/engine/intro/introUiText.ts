// 오프닝 화면의 **조작 안내 줄과 접근성 이름** — 우리 UI 글 (롬에 대응 줄이 없다).
//
// 롬 줄이 있는 것은 여기 없다: 성별 칸 「남자/여자」는 사람 낱말 뱅크 440의 7·16번,
// 「결정」 버튼은 메일 뱅크 409의 0번을 그 언어로 읽는다. 여기 있는 것은 DS 롬이
// 말해 주지 않는 「무엇을 누를지」 한 줄뿐이다.
//
// 일본어는 롬처럼 히라가나·전각 공백(U+3000)이고 장음은 `－`다.

type IntroUiLocale = 'ko' | 'en' | 'ja'

interface IntroUiText {
  /** 이름 칸 안내 */
  nameHint: (max: number) => string
  ballHint: string
  yesNoHint: string
  choiceHint: string
  nextHint: string
  nameLabel: string
  ballLabel: string
  choiceLabel: string
}

const TEXT: Readonly<Record<IntroUiLocale, IntroUiText>> = {
  ko: {
    nameHint: (max) => `${String(max)}글자까지 · Enter 결정`,
    ballHint: '볼 가운데의 버튼을 누른다 — 클릭 · Z·Enter',
    yesNoHint: '←→ 고르기 · Z·Enter 결정 · X 아니오',
    choiceHint: '←→ 고르기 · Z·Enter 결정',
    nextHint: 'Z·Enter 넘기기',
    nameLabel: '이름',
    ballLabel: '몬스터볼',
    choiceLabel: '선택',
  },
  en: {
    nameHint: (max) => `Up to ${String(max)} letters · Enter to confirm`,
    ballHint: 'Press the button on the ball — click · Z·Enter',
    yesNoHint: '←→ choose · Z·Enter confirm · X no',
    choiceHint: '←→ choose · Z·Enter confirm',
    nextHint: 'Z·Enter to continue',
    nameLabel: 'Name',
    ballLabel: 'Poké Ball',
    choiceLabel: 'Choice',
  },
  ja: {
    nameHint: (max) => `${String(max)}もじまで　·　Enter　けってい`,
    ballHint: 'ボ－ルの　まんなかの　ボタンを　おす　－　クリック　·　Z·Enter',
    yesNoHint: '←→　えらぶ　·　Z·Enter　けってい　·　X　いいえ',
    choiceHint: '←→　えらぶ　·　Z·Enter　けってい',
    nextHint: 'Z·Enter　すすむ',
    nameLabel: 'なまえ',
    ballLabel: 'モンスタ－ボ－ル',
    choiceLabel: 'えらぶ',
  },
}

export function introUiText(locale: string): IntroUiText {
  return TEXT[locale === 'en' ? 'en' : locale === 'ja' ? 'ja' : 'ko']
}
