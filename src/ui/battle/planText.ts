// 배틀 가방의 우리 글 — 도구가 무엇을 하는지 미리 보이는 한 줄 · 빈 목록 · 쪽 번호. 세 언어 한 벌.
//
// ⚠️ **롬에 없는 줄이다.** 원작에는 「무슨 일이 일어날까」를 미리 보여 주는 자리가 없다(고르게 두고 아무 일이
// 없으면 그제야 「써도 효과가 없다!」를 띄운다). 그래서 낱말만 롬에서 가져온다 — 상태 이름은 메뉴 뱅크 361,
// 능력 이름은 `pokemon_stat_names`(551)이고, 여기 있는 것은 그 낱말을 잇는 동사다. 일본어는 히라가나·가타카나
// (전각 공백 U+3000, 장음 `－`)다 — 롬 ja는 한자가 0자고 글꼴 서브셋도 한자를 뺐다.
import type { DataLocale } from '../../data/gameData'
import { useGameLocale } from '../../state/optionsStore'
import { withSubject } from '../korean'

export interface PlanText {
  revive: string
  heal: (n: number) => string
  /** 상태 이상마다 다른 동사 — 키는 `slp` · `frz` · `psn` · `tox` · `brn` · `par` */
  cure: Readonly<Record<string, string>>
  cureOther: (status: string) => string
  clearConfusion: string
  clearInfatuation: string
  mist: string
  /** 능력 이름(롬)에 「올라간다」를 잇는다 */
  boost: (stat: string) => string
  focus: string
  pp: (n: number) => string
  /** 도망 도구를 막을 때 한 줄 — 롬의 그 줄은 박사의 긴 타이름이라 못 쓴다 */
  notNow: string
  empty: string
  page: (page: number, pages: number) => string
}

const n = String

export const PLAN_TEXT: Readonly<Record<DataLocale, PlanText>> = {
  ko: {
    revive: '되살아난다',
    heal: (hp) => `체력 ${n(hp)} 회복`,
    cure: {
      slp: '잠에서 깬다', frz: '얼음이 녹는다', psn: '독이 낫는다', tox: '독이 낫는다',
      brn: '화상이 낫는다', par: '마비가 풀린다',
    },
    cureOther: (status) => `${status} 상태가 낫는다`,
    clearConfusion: '혼란이 풀린다',
    clearInfatuation: '헤롱헤롱이 풀린다',
    mist: '능력이 안 떨어진다',
    boost: (stat) => `${withSubject(stat)} 올라간다`,
    focus: '급소에 잘 맞는다',
    pp: (pp) => `PP ${n(pp)} 회복`,
    notNow: '지금은 그럴 때가 아니다',
    empty: '아무것도 없다',
    page: (page, pages) => `${n(page)} / ${n(pages)}쪽`,
  },
  en: {
    revive: 'Revives',
    heal: (hp) => `Restores ${n(hp)} HP`,
    cure: {
      slp: 'Wakes up', frz: 'Thaws out', psn: 'Cures poison', tox: 'Cures poison',
      brn: 'Heals burn', par: 'Cures paralysis',
    },
    cureOther: (status) => `Cures ${status}`,
    clearConfusion: 'Cures confusion',
    clearInfatuation: 'Ends infatuation',
    mist: 'Stops stat drops',
    boost: (stat) => `Raises ${stat}`,
    focus: 'Better critical hit odds',
    pp: (pp) => `Restores ${n(pp)} PP`,
    notNow: 'This isn’t the time for that',
    empty: 'Nothing here',
    page: (page, pages) => `Page ${n(page)} / ${n(pages)}`,
  },
  ja: {
    revive: 'ひんしから\u3000かいふくする',
    heal: (hp) => `ＨＰが\u3000${n(hp)}\u3000かいふくする`,
    cure: {
      slp: 'ねむりから\u3000さめる', frz: 'こおりが\u3000とける', psn: 'どくが\u3000なおる', tox: 'どくが\u3000なおる',
      brn: 'やけどが\u3000なおる', par: 'まひが\u3000なおる',
    },
    cureOther: (status) => `${status}が\u3000なおる`,
    clearConfusion: 'こんらんが\u3000とける',
    clearInfatuation: 'メロメロが\u3000とける',
    mist: 'のうりょくが\u3000さがらなくなる',
    boost: (stat) => `${stat}が\u3000あがる`,
    focus: 'きゅうしょに\u3000あたりやすくなる',
    pp: (pp) => `ＰＰが\u3000${n(pp)}\u3000かいふくする`,
    notNow: 'いまは\u3000そんな\u3000ばあいじゃ\u3000ない',
    empty: 'なにも\u3000ない',
    page: (page, pages) => `${n(page)} / ${n(pages)}ペ－ジ`,
  },
}

export function planText(locale: DataLocale): PlanText {
  return PLAN_TEXT[locale]
}

export function usePlanText(): PlanText {
  return PLAN_TEXT[useGameLocale()]
}
