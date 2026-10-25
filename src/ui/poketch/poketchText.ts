// 포켓치 액정 속 우리 글 — 설정의 세 언어를 같은 자리에 둔다.
//
// 앱 이름 스물다섯은 롬 뱅크 457, 기술효과체커의 줄은 456, 링크서처는 롬 줄을 읽는다(`apps.tsx`의 `useBank`).
// 여기 있는 것은 DS 롬이 액정 그림으로만 말하던 것 — 알람의 켜짐 · 꺼짐, 스톱워치의 키 안내처럼 우리가 문자로
// 적는 말이다. 액정이 좁아 한 칸이 짧아야 하므로 영어는 한두 낱말, 일본어는 히라가나·가타카나(전각 공백 U+3000,
// 장음 `－`)다. 롬 ja는 한자가 0자고 글꼴 서브셋도 한자를 뺐다.
import type { DataLocale } from '../../data/gameData'
import { useGameLocale } from '../../state/optionsStore'

interface PoketchUiText {
  alarmRinging: string
  alarmOn: string
  alarmOff: string
  /** 알람을 끈다 / 켠다 — 고른 칸의 글 */
  alarmTurnOff: string
  alarmTurnOn: string
  stopwatchStop: string
  stopwatchStart: string
  timerDone: string
  timerRunning: string
  timerSet: string
  reset: string
  steps: string
  heads: string
  tails: string
  coinToss: string
  noMon: string
  noDaycareMon: string
  egg: string
  eggHere: string
  eggNone: string
  moveTesterKeys: string
  markerKeys: (at: number) => string
  berryPlots: (n: number) => string
  noChain: string
  noRecords: string
  dowsingFound: (n: number) => string
  dowsingNone: string
  /** 달력 머리 — 롬 월 이름 뱅크 414가 없는 언어(일본)의 내림값 */
  month: (m: number) => string
  colorKeys: string
  linkUnusable: string
  widgetKeys: string
}

const n = String

const POKETCH_UI_TEXT: Readonly<Record<DataLocale, PoketchUiText>> = {
  ko: {
    alarmRinging: '알람!', alarmOn: '켜짐', alarmOff: '꺼짐', alarmTurnOff: '끈다', alarmTurnOn: '켠다',
    stopwatchStop: 'Z 멈춘다', stopwatchStart: 'Z 잰다',
    timerDone: '끝!', timerRunning: '재는 중', timerSet: '↑↓ 분 · Z 시작',
    reset: '0으로', steps: '걸음',
    heads: '앞', tails: '뒤', coinToss: 'Z 던진다',
    noMon: '포켓몬이 없다', noDaycareMon: '맡긴 포켓몬이 없다',
    egg: '알', eggHere: '있다!', eggNone: '없다',
    moveTesterKeys: '←→ 기술 · ↑↓ 상대',
    markerKeys: (at) => `←→ 표식 ${n(at)} · Z 여기에 꽂는다`,
    berryPlots: (count) => `열린 밭 ${n(count)}곳`,
    noChain: '지금 잇는 사슬 없음', noRecords: '기록 없음',
    dowsingFound: (count) => `반응 ${n(count)}`, dowsingNone: '반응 없음',
    month: (m) => `${n(m)}월`,
    colorKeys: '←→ 고르기 · Z 바꾼다',
    linkUnusable: '이곳에서는 검색할 수 없다',
    widgetKeys: 'Q E 앱 · R 접는다 · R 길게 감춘다',
  },
  en: {
    alarmRinging: 'ALARM!', alarmOn: 'ON', alarmOff: 'OFF', alarmTurnOff: 'Turn off', alarmTurnOn: 'Turn on',
    stopwatchStop: 'Z Stop', stopwatchStart: 'Z Start',
    timerDone: 'Done!', timerRunning: 'Counting', timerSet: '↑↓ Min · Z Start',
    reset: 'Reset', steps: 'Steps',
    heads: 'Heads', tails: 'Tails', coinToss: 'Z Toss',
    noMon: 'No Pokémon', noDaycareMon: 'No Pokémon in the Day Care',
    egg: 'Egg', eggHere: 'Yes!', eggNone: 'None',
    moveTesterKeys: '←→ Move · ↑↓ Foe',
    markerKeys: (at) => `←→ Marker ${n(at)} · Z Pin here`,
    berryPlots: (count) => `${n(count)} open plots`,
    noChain: 'No chain right now', noRecords: 'No records',
    dowsingFound: (count) => `Found ${n(count)}`, dowsingNone: 'Nothing',
    month: (m) => `Month ${n(m)}`,
    colorKeys: '←→ Select · Z Change',
    linkUnusable: 'You can’t search here',
    widgetKeys: 'Q E App · R Fold · Hold R to hide',
  },
  ja: {
    alarmRinging: 'アラ－ム！', alarmOn: 'オン', alarmOff: 'オフ', alarmTurnOff: 'とめる', alarmTurnOn: 'つける',
    stopwatchStop: 'Z\u3000とめる', stopwatchStart: 'Z\u3000はかる',
    timerDone: 'おわり！', timerRunning: 'はかり\u3000ちゅう', timerSet: '↑↓\u3000ふん\u3000·\u3000Z\u3000スタ－ト',
    reset: 'ゼロに', steps: 'ほすう',
    heads: 'おもて', tails: 'うら', coinToss: 'Z\u3000なげる',
    noMon: 'ポケモンが\u3000いない', noDaycareMon: 'あずけている\u3000ポケモンが\u3000いない',
    egg: 'タマゴ', eggHere: 'ある！', eggNone: 'ない',
    moveTesterKeys: '←→\u3000わざ\u3000·\u3000↑↓\u3000あいて',
    markerKeys: (at) => `←→\u3000マ－カ－\u3000${n(at)}\u3000·\u3000Z\u3000ここに\u3000さす`,
    berryPlots: (count) => `あいている\u3000はたけ\u3000${n(count)}かしょ`,
    noChain: 'つづけている\u3000チェ－ンは\u3000ない', noRecords: 'きろく\u3000なし',
    dowsingFound: (count) => `はんのう\u3000${n(count)}`, dowsingNone: 'はんのう\u3000なし',
    month: (m) => `${n(m)}がつ`,
    colorKeys: '←→\u3000えらぶ\u3000·\u3000Z\u3000かえる',
    linkUnusable: 'ここでは\u3000けんさく\u3000できない',
    widgetKeys: 'Q E\u3000アプリ\u3000·\u3000R\u3000たたむ\u3000·\u3000R\u3000ながおし\u3000かくす',
  },
}

export function poketchUiText(locale: DataLocale): PoketchUiText {
  return POKETCH_UI_TEXT[locale]
}

export function usePoketchUiText(): PoketchUiText {
  return POKETCH_UI_TEXT[useGameLocale()]
}
