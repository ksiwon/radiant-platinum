// 가방 · 상점 · 리포트 · 박스 화면의 **우리 UI 글** — 설정의 세 언어를 같은 자리에 둔다.
//
// 롬에 같은 뜻의 줄이 있는 말은 여기 없다. 가방 제목은 시작 메뉴 뱅크 367의 2번, 소지금 틀은 상점 뱅크 543의
// 19번을 읽고(`BagScreen`), 예·아니오는 메뉴 뱅크 361의 42·43번이다. 여기 있는 것은 DS 롬이 말해 주지 않는
// 「무슨 키를 누르는지」 한 줄과 우리 창 머리의 글이다.
//
// 한국어는 화면에 있던 그대로이고, 영어의 동사는 다른 화면이 이미 쓰는 말(`footWords`·`BATTLE_WORDS`의
// Select · Confirm · Close · Cancel)에 맞췄다. 일본어는 롬처럼 히라가나·전각 공백(U+3000)이다 — 롬 ja는 한자가
// 0자고 글꼴 서브셋도 한자를 뺐다(DESIGN §). 롬에 뜻이 같은 줄이 있는 낱말은 `menuUiText.test.ts`가 추출
// 자료와 맞댄다.
import type { DataLocale } from '../../data/gameData'
import { useGameLocale } from '../../state/optionsStore'

export type BagFootMode = 'normal' | 'pick' | 'give' | 'menu' | 'count' | 'move'

export interface BoxFootState {
  say: boolean
  menu: boolean
  compare: boolean
  items: boolean
  held: boolean
  heldItem: boolean
  /** 비교 쪽 이름 */
  comparePage: string
}

interface MenuUiText {
  bagFoot: (mode: BagFootMode, movable: boolean) => string
  /** 「…를 등록했다」 — 키 이름이 들어간다 (`object`는 조사가 붙은 이름) */
  bagRegistered: (name: string, object: string, key: string) => string
  bagUnregistered: (name: string) => string
  shopFootCount: string
  shopFootConfirm: string
  shopFootNext: string
  shopFootList: string
  shopFootListNoSell: string
  buy: string
  sell: string
  shopKinds: (n: number) => string
  saveAnswer: string
  saveRetry: string
  saveClose: string
  backupDone: string
  backupBlocked: string
  yes: string
  no: string
  backupButtons: readonly [string, string]
  boxFoot: (s: BoxFootState) => string
  partyFootMenu: string
  partyFootPick: string
  partyFootUse: (tm: boolean) => string
  partyFootHeld: string
  partyFootList: string
  boxNote: (here: number, size: number, total: number, capacity: number, party: number, partyMax: number) => string
  comparePages: readonly [string, string]
  /** 비교표의 능력 이름 여섯 — HP · 공격 · 방어 · 특공 · 특방 · 스피드 차례 */
  compareStats: readonly [string, string, string, string, string, string]
  compareEmpty: string
  compareOneMore: string
}

const n = String

export const MENU_UI_TEXT: Readonly<Record<DataLocale, MenuUiText>> = {
  ko: {
    bagFoot: (mode, movable) => {
      switch (mode) {
        case 'normal': return `←→ 주머니 · ↑↓ 고르기 · Z 메뉴${movable ? ' · Shift 옮기기' : ''} · X 닫기`
        case 'move': return '↑↓ 옮기기 · Z 놓기 · X 그만둔다'
        case 'give': return '←→ 주머니 · ↑↓ 고르기 · Z 결정 · X 그만둔다'
        case 'pick': return '↑↓ 고르기 · Z 결정 · X 그만둔다'
        case 'menu': return '↑↓ 고르기 · Z 결정 · X 그만둔다'
        case 'count': return '↑↓ 하나씩 · ←→ 열씩 · Z 결정 · X 그만둔다'
      }
    },
    bagRegistered: (_name, object, key) => `${object} ${key}에 등록했다!`,
    bagUnregistered: (name) => `${name}의 등록을 해제했다.`,
    shopFootCount: '↑↓ 개수 · ←→ ±10 · Z 결정 · X 그만둔다',
    shopFootConfirm: '↑↓ 고르기 · Z 결정 · X 그만둔다',
    shopFootNext: 'Z 다음',
    shopFootList: '←→ 산다/판다 · ↑↓ 고르기 · Z 결정 · X 닫기',
    shopFootListNoSell: '↑↓ 고르기 · Z 결정 · X 닫기',
    buy: '산다',
    sell: '판다',
    shopKinds: (count) => `${n(count)}종`,
    saveAnswer: '←→ 고르기 · Z 결정 · X 그만둔다',
    saveRetry: '←→ 고르기 · Z 결정',
    saveClose: 'Z 닫기',
    backupDone: '백업 파일도 받았다',
    backupBlocked: '브라우저가 백업 파일 다운로드를 막았다. 리포트는 남아 있다',
    yes: '예',
    no: '아니오',
    backupButtons: ['백업 파일 받기', '닫기'],
    boxFoot: (s) => {
      if (s.say) return 'Z 다음'
      if (s.menu) return '↑↓ 고르기 · Z 결정 · X 그만둔다'
      if (s.compare) return `↑↓←→ 고르기 · Z 올린다/내린다 · Tab ${s.comparePage} · X 닫기`
      if (s.items) {
        return s.heldItem
          ? '↑↓←→ 옮기기 · Z 놓기 · Q/E 박스 · X 도구 돌려놓기'
          : '↑↓←→ 고르기 · Z 도구 집기 · Tab 파티/박스 · Q/E 박스 · X 닫기'
      }
      return s.held
        ? '↑↓←→ 옮기기 · Z 놓기 · Q/E 박스 · X 되돌리기'
        : '↑↓←→ 고르기 · Z 메뉴 · Tab 파티/박스 · Q/E 박스 · X 닫기'
    },
    partyFootMenu: '↑↓ 고르기 · Z 결정 · X 되돌리기',
    partyFootPick: '↑↓←→ 고르기 · Z 결정 · X 그만둔다',
    partyFootUse: (tm) => `↑↓←→ 누구에게 · Z ${tm ? '가르친다' : '쓴다'} · X 그만둔다`,
    partyFootHeld: '↑↓←→ 옮기기 · Z 놓기 · X 되돌리기',
    partyFootList: '↑↓←→ 고르기 · Z 메뉴 · X 닫기',
    boxNote: (here, size, total, capacity, party, partyMax) =>
      `박스 ${n(here)}/${n(size)} · 전체 ${n(total)}/${n(capacity)} · 파티 ${n(party)}/${n(partyMax)}`,
    comparePages: ['능력치', '기술'],
    // 좁은 칸이라 줄여 쓴다 — 롬 요약 화면은 「특수공격」 · 「특수방어」다 (455:113·114)
    compareStats: ['HP', '공격', '방어', '특공', '특방', '스피드'],
    compareEmpty: 'Z로 두 마리를 올린다 · Tab으로 쪽을 넘긴다',
    compareOneMore: '한 마리를 더 올린다',
  },
  en: {
    bagFoot: (mode, movable) => {
      switch (mode) {
        case 'normal': return `←→ Pocket · ↑↓ Select · Z Menu${movable ? ' · Shift Move' : ''} · X Close`
        case 'move': return '↑↓ Move · Z Place · X Cancel'
        case 'give': return '←→ Pocket · ↑↓ Select · Z Confirm · X Cancel'
        case 'pick': return '↑↓ Select · Z Confirm · X Cancel'
        case 'menu': return '↑↓ Select · Z Confirm · X Cancel'
        case 'count': return '↑↓ By 1 · ←→ By 10 · Z Confirm · X Cancel'
      }
    },
    bagRegistered: (_name, object, key) => `Registered ${object} to ${key}!`,
    bagUnregistered: (name) => `${name} is no longer registered.`,
    shopFootCount: '↑↓ Quantity · ←→ ±10 · Z Confirm · X Cancel',
    shopFootConfirm: '↑↓ Select · Z Confirm · X Cancel',
    shopFootNext: 'Z Next',
    shopFootList: '←→ Buy/Sell · ↑↓ Select · Z Confirm · X Close',
    shopFootListNoSell: '↑↓ Select · Z Confirm · X Close',
    buy: 'Buy',
    sell: 'Sell',
    shopKinds: (count) => `${n(count)} kinds`,
    saveAnswer: '←→ Select · Z Confirm · X Cancel',
    saveRetry: '←→ Select · Z Confirm',
    saveClose: 'Z Close',
    backupDone: 'Backup file saved too',
    backupBlocked: 'The browser blocked the backup download. Your report is still saved',
    yes: 'YES',
    no: 'NO',
    backupButtons: ['Get backup file', 'Close'],
    boxFoot: (s) => {
      if (s.say) return 'Z Next'
      if (s.menu) return '↑↓ Select · Z Confirm · X Cancel'
      if (s.compare) return `↑↓←→ Select · Z Add/Remove · Tab ${s.comparePage} · X Close`
      if (s.items) {
        return s.heldItem
          ? '↑↓←→ Move · Z Place · Q/E Box · X Return item'
          : '↑↓←→ Select · Z Pick up item · Tab Party/Box · Q/E Box · X Close'
      }
      return s.held
        ? '↑↓←→ Move · Z Place · Q/E Box · X Undo'
        : '↑↓←→ Select · Z Menu · Tab Party/Box · Q/E Box · X Close'
    },
    partyFootMenu: '↑↓ Select · Z Confirm · X Undo',
    partyFootPick: '↑↓←→ Select · Z Confirm · X Cancel',
    partyFootUse: (tm) => `↑↓←→ Target · Z ${tm ? 'Teach' : 'Use'} · X Cancel`,
    partyFootHeld: '↑↓←→ Move · Z Place · X Undo',
    partyFootList: '↑↓←→ Select · Z Menu · X Close',
    boxNote: (here, size, total, capacity, party, partyMax) =>
      `Box ${n(here)}/${n(size)} · Total ${n(total)}/${n(capacity)} · Party ${n(party)}/${n(partyMax)}`,
    comparePages: ['Stats', 'Moves'],
    // 롬 요약 화면 이름표(455:110~115) 그대로다
    compareStats: ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'],
    compareEmpty: 'Z to put two Pokémon up · Tab to switch pages',
    compareOneMore: 'Put one more Pokémon up',
  },
  ja: {
    bagFoot: (mode, movable) => {
      switch (mode) {
        case 'normal':
          return `←→\u3000ポケット\u3000·\u3000↑↓\u3000えらぶ\u3000·\u3000Z\u3000メニュ－${movable ? '\u3000·\u3000Shift\u3000うごかす' : ''}\u3000·\u3000X\u3000とじる`
        case 'move': return '↑↓\u3000うごかす\u3000·\u3000Z\u3000おく\u3000·\u3000X\u3000やめる'
        case 'give': return '←→\u3000ポケット\u3000·\u3000↑↓\u3000えらぶ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000やめる'
        case 'pick': return '↑↓\u3000えらぶ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000やめる'
        case 'menu': return '↑↓\u3000えらぶ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000やめる'
        case 'count': return '↑↓\u30001つずつ\u3000·\u3000←→\u300010ずつ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000やめる'
      }
    },
    bagRegistered: (_name, object, key) => `${object}を\u3000${key}に\u3000とうろくした！`,
    bagUnregistered: (name) => `${name}の\u3000とうろくを\u3000はずした。`,
    shopFootCount: '↑↓\u3000かず\u3000·\u3000←→\u3000±10\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000やめる',
    shopFootConfirm: '↑↓\u3000えらぶ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000やめる',
    shopFootNext: 'Z\u3000つぎへ',
    shopFootList: '←→\u3000かう\u3000うる\u3000·\u3000↑↓\u3000えらぶ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000とじる',
    shopFootListNoSell: '↑↓\u3000えらぶ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000とじる',
    buy: 'かう',
    sell: 'うる',
    shopKinds: (count) => `${n(count)}しゅるい`,
    saveAnswer: '←→\u3000えらぶ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000やめる',
    saveRetry: '←→\u3000えらぶ\u3000·\u3000Z\u3000けってい',
    saveClose: 'Z\u3000とじる',
    backupDone: 'バックアップの\u3000ファイルも\u3000うけとった',
    backupBlocked: 'ブラウザが\u3000バックアップの\u3000ダウンロ－ドを\u3000とめた。\u3000レポ－トは\u3000のこっている',
    yes: 'はい',
    no: 'いいえ',
    backupButtons: ['バックアップを\u3000うけとる', 'とじる'],
    boxFoot: (s) => {
      if (s.say) return 'Z\u3000つぎへ'
      if (s.menu) return '↑↓\u3000えらぶ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000やめる'
      if (s.compare) return `↑↓←→\u3000えらぶ\u3000·\u3000Z\u3000のせる\u3000おろす\u3000·\u3000Tab\u3000${s.comparePage}\u3000·\u3000X\u3000とじる`
      if (s.items) {
        return s.heldItem
          ? '↑↓←→\u3000うごかす\u3000·\u3000Z\u3000おく\u3000·\u3000Q/E\u3000ボックス\u3000·\u3000X\u3000どうぐを\u3000もどす'
          : '↑↓←→\u3000えらぶ\u3000·\u3000Z\u3000どうぐを\u3000もつ\u3000·\u3000Tab\u3000てもち\u3000ボックス\u3000·\u3000Q/E\u3000ボックス\u3000·\u3000X\u3000とじる'
      }
      return s.held
        ? '↑↓←→\u3000うごかす\u3000·\u3000Z\u3000おく\u3000·\u3000Q/E\u3000ボックス\u3000·\u3000X\u3000もどす'
        : '↑↓←→\u3000えらぶ\u3000·\u3000Z\u3000メニュ－\u3000·\u3000Tab\u3000てもち\u3000ボックス\u3000·\u3000Q/E\u3000ボックス\u3000·\u3000X\u3000とじる'
    },
    partyFootMenu: '↑↓\u3000えらぶ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000もどす',
    partyFootPick: '↑↓←→\u3000えらぶ\u3000·\u3000Z\u3000けってい\u3000·\u3000X\u3000やめる',
    partyFootUse: (tm) => `↑↓←→\u3000だれに\u3000·\u3000Z\u3000${tm ? 'おぼえさせる' : 'つかう'}\u3000·\u3000X\u3000やめる`,
    partyFootHeld: '↑↓←→\u3000うごかす\u3000·\u3000Z\u3000おく\u3000·\u3000X\u3000もどす',
    partyFootList: '↑↓←→\u3000えらぶ\u3000·\u3000Z\u3000メニュ－\u3000·\u3000X\u3000とじる',
    boxNote: (here, size, total, capacity, party, partyMax) =>
      `ボックス\u3000${n(here)}/${n(size)}\u3000·\u3000ぜんぶ\u3000${n(total)}/${n(capacity)}\u3000·\u3000てもち\u3000${n(party)}/${n(partyMax)}`,
    comparePages: ['のうりょく', 'わざ'],
    // 롬 요약 화면 이름표(455:110~115) 그대로다
    compareStats: ['ＨＰ', 'こうげき', 'ぼうぎょ', 'とくこう', 'とくぼう', 'すばやさ'],
    compareEmpty: 'Zで\u30002ひき\u3000のせる\u3000·\u3000Tabで\u3000ペ－ジを\u3000かえる',
    compareOneMore: 'もう\u30001ぴき\u3000のせる',
  },
}

export function menuUiText(locale: DataLocale): MenuUiText {
  return MENU_UI_TEXT[locale]
}

export function useMenuUiText(): MenuUiText {
  return MENU_UI_TEXT[useGameLocale()]
}
