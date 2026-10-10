import { describe, expect, it } from 'vitest'
import { MSG } from '../battle/romText'
import { askText, confirmText, introPages, pickText, resultPages } from './evolutionLearnPages'

/** 진화용 열 줄(1193~1202)만 채운 뱅크 — 줄 번호가 곧 글이라 어느 줄이 나왔는지 읽힌다 */
function bank(): string[] {
  const lines = Array.from({ length: 1210 }, () => '')
  for (let at = 1193; at <= 1202; at++) lines[at] = `줄${String(at)}`
  return lines
}

describe('진화 기술 배우기 — 대사 쪽의 차례', () => {
  it('진화용 줄 번호가 롬 자리와 같다 (1193~1202)', () => {
    expect([
      MSG.pokemonWantsToLearnTheMove, MSG.howeverPokemonAlreadyKnowsFourMoves, MSG.shouldAMoveBeDeleted,
      MSG.whichMoveShouldBeForgotten3, MSG.stopTryingToTeachMove, MSG.pokemonDidNotLearnTheMove,
      MSG.evolutionOneTwoAndPoof, MSG.pokemonForgotHowToUseMove, MSG.evolutionAndDotDotDot,
      MSG.evolvedPokemonLearnedMove,
    ]).toEqual([1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201, 1202])
  })

  it('칸이 가득이면 「배우고 싶다」 → 「4개 알고 있으므로」 두 쪽이 먼저다', () => {
    expect(introPages(bank(), '찌르호크', '인파이트').map((p) => p.text)).toEqual(['줄1193', '줄1194'])
  })

  it('물음 셋은 각자 제 줄이다', () => {
    expect(askText(bank())).toBe('줄1195')
    expect(pickText(bank())).toBe('줄1196')
    expect(confirmText(bank(), '인파이트')).toBe('줄1197')
  })

  it('잊으면 넷이다 — 1, 2, 짠(소리) → 잊었다 → 그리고 → 배웠다(팡파르)', () => {
    const pages = resultPages(bank(), { kind: 'forgot', who: '찌르호크', forgot: '쪼기', learned: '인파이트' })
    expect(pages.map((p) => p.text)).toEqual(['줄1199', '줄1200', '줄1201', '줄1202'])
    expect(pages.map((p) => p.sound)).toEqual(['poof', undefined, undefined, 'learned'])
  })

  it('포기하면 「결국 배우지 않았다」 한 쪽이고 소리가 없다', () => {
    const pages = resultPages(bank(), { kind: 'gaveUp', who: '찌르호크', declined: '인파이트' })
    expect(pages).toEqual([{ text: '줄1198' }])
  })

  it('뱅크가 안 왔으면 지어내지 않고 비운다', () => {
    expect(introPages([], '찌르호크', '인파이트')).toEqual([])
    expect(askText([])).toBe('')
    expect(resultPages([], { kind: 'forgot', who: 'a', forgot: 'b', learned: 'c' })).toEqual([])
  })

  it('칸 하나라도 비면 그 쪽만 빠진다 — 반쪽 문장을 놓지 않는다', () => {
    // 이름이 비면 「○○ 새로 □□」도 「그러나 ○○ 기술을…」도 못 채운다
    expect(introPages(bank(), '', '인파이트')).toEqual([])
    // 기술 이름이 비면 그것을 부르는 한 쪽(1200)만 빠진다
    const pages = resultPages(bank(), { kind: 'forgot', who: '찌르호크', forgot: '', learned: '인파이트' })
    expect(pages.map((p) => p.text)).toEqual(['줄1199', '줄1201', '줄1202'])
  })
})
