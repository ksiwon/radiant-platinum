// 진화 중의 기술 배우기 — 대사 쪽의 차례 (`evolution.c`의 `EVOLUTION_STATE_*` · 롬 배틀 뱅크 1193~1202).
//
// 원작은 줄마다 **대사 한 쪽 + 필요하면 예/아니오**다. 이 파일은 그 쪽들을 만든다 — 그림(기술 창)과 키는
// `EvolutionLearn.tsx`, 단의 차례(ask → pick → wellThen → confirmGiveUp)는 `common/learnFlow`의 `useLearnFlow`가 쥔다.
//
//   칸이 가득   「새로 □□ 배우고 싶다...!」(1193) → 「그러나 … 4개 알고 있으므로…」(1194)    ← 이 앞 두 쪽이 `intro`
//               → 「다른 기술을 잊게 하겠습니까?」(1195) [예/아니오]                        ← `ask`
//        예     → 기술 창 + 「어느 기술을 잊게 하겠습니까?」(1196)                          ← `pick`
//                 고른 줄 → 「1, 2, ...... 짠!」(1199) → 「깨끗이 잊었다!」(1200) → 「그리고!」(1201) → 「새로 □□ 배웠다!」(1202)
//        아니오 → 「그럼... □□ 배우는 것을 포기하겠습니까?」(1197) [예/아니오]               ← `confirm`
//                 예 → 「결국 배우지 않았다!」(1198) → 다음 기술
//                 아니오 → 「새로 □□ 배우고 싶다...!」(1193)부터 다시
//
// ⚠️ **글은 전부 롬 줄이다.** 칸을 못 채우면(뱅크가 안 왔거나 이름이 비면) 그 쪽은 빠진다 — 반쪽 문장을 놓느니 비운다
// (`battle/messages`의 `learnResultLines`와 같은 규칙). 배틀 쪽 1178~1192와 글자는 같고 번호만 다르다.
import { romLine } from '../battle/romLine'
import { MSG } from '../battle/romText'

/** 쪽이 찍힐 때 나는 소리 — 원작 `{CALLBACK 4}`(KON)와 `{CALLBACK 5}`(팡파르) */
type LearnSound = 'poof' | 'learned'

export interface LearnPage {
  text: string
  sound?: LearnSound
}

/** 배우기 전에 지나가는 두 쪽 — 「배우고 싶다…!」와 「그러나 4개 알고 있으므로…」 */
export function introPages(bank: readonly string[], who: string, move: string): LearnPage[] {
  const pages: LearnPage[] = []
  const wants = romLine(bank, MSG.pokemonWantsToLearnTheMove, who, move)
  if (wants !== null) pages.push({ text: wants })
  const full = romLine(bank, MSG.howeverPokemonAlreadyKnowsFourMoves, who)
  if (full !== null) pages.push({ text: full })
  return pages
}

/** 「다른 기술을 잊게 하겠습니까?」 */
export function askText(bank: readonly string[]): string {
  return romLine(bank, MSG.shouldAMoveBeDeleted) ?? ''
}

/** 「어느 기술을 잊게 하겠습니까?」 */
export function pickText(bank: readonly string[]): string {
  return romLine(bank, MSG.whichMoveShouldBeForgotten3) ?? ''
}

/** 「그럼... □□ 배우는 것을 포기하겠습니까?」 */
export function confirmText(bank: readonly string[], move: string): string {
  return romLine(bank, MSG.stopTryingToTeachMove, move) ?? ''
}

export type LearnResult =
  | { kind: 'forgot', who: string, forgot: string, learned: string }
  | { kind: 'gaveUp', who: string, declined: string }

/**
 * 답을 받은 **뒤의** 쪽들. 잊으면 넷(1, 2, 짠 → 잊었다 → 그리고 → 배웠다), 포기하면 한 쪽이다.
 * 「짠」은 `KON`, 「배웠다」는 팡파르를 건다
 */
export function resultPages(bank: readonly string[], result: LearnResult): LearnPage[] {
  if (result.kind === 'gaveUp') {
    const line = romLine(bank, MSG.pokemonDidNotLearnTheMove, result.who, result.declined)
    return line === null ? [] : [{ text: line }]
  }
  const out: (LearnPage | null)[] = [
    pageOf(romLine(bank, MSG.evolutionOneTwoAndPoof), 'poof'),
    pageOf(romLine(bank, MSG.pokemonForgotHowToUseMove, result.who, result.forgot)),
    pageOf(romLine(bank, MSG.evolutionAndDotDotDot)),
    pageOf(romLine(bank, MSG.evolvedPokemonLearnedMove, result.who, result.learned), 'learned'),
  ]
  return out.filter((page): page is LearnPage => page !== null)
}

function pageOf(text: string | null, sound?: LearnSound): LearnPage | null {
  if (text === null) return null
  return sound === undefined ? { text } : { text, sound }
}
