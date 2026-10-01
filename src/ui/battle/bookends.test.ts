// 판의 첫 줄과 끝 줄 — 배틀팩토리도 트레이너전이다 (`BATTLE_TYPE_TRAINER`).
//
// 예전에는 첫 줄만 `kind === 'trainer'`를 봐서, 팩토리는 「승부를 걸어왔다!」 없이
// 시작하고 끝에서만 「이겼다!」를 트레이너 쪽 줄로 냈다.
import { describe, expect, it } from 'vitest'
import { closingLines, hasTrainer, openingLine } from './bookends'
import { MSG } from './romText'

/** 롬 줄 자리만 채운 뱅크. 글은 한국 롬의 그 줄 그대로다 */
const lines: string[] = []
lines[MSG.youAreChallengedByTr] = '{STRVAR_1 14, 0, 0} {STRVAR_1 3, 1, 3}\n승부를 걸어왔다!\r'
lines[MSG.youAreChallengedByLinkTr] = '{STRVAR_1 3, 0, 3}\n승부를 걸어왔다!\r'

const base = {
  lines, outcome: null, foes: [], foeName: null, foeClass: null, foeTrainer: null,
  defeatLines: [], foeWinLines: [], prize: 0, playerName: '나',
} as const

describe('트레이너가 서 있는 판', () => {
  it('트레이너전과 팩토리다. 야생과 사파리는 아니다', () => {
    expect(hasTrainer('trainer')).toBe(true)
    expect(hasTrainer('factory')).toBe(true)
    expect(hasTrainer('wild')).toBe(false)
    expect(hasTrainer('safari')).toBe(false)
  })

  it('팩토리 상대는 분류가 없어 이름 한 칸짜리 줄로 걸어온다', () => {
    const line = openingLine({ ...base, kind: 'factory', foeName: '팩토리헤드' })
    expect(line).not.toBeNull()
    expect(line).toContain('팩토리헤드')
    expect(line).toContain('승부를 걸어왔다!')
  })

  it('분류가 있으면 두 칸짜리 줄이다', () => {
    const line = openingLine({ ...base, kind: 'factory', foeClass: '엘리트트레이너', foeTrainer: '민수' })
    expect(line).toContain('엘리트트레이너 민수')
  })

  it('야생은 첫 줄이 없다', () => {
    expect(openingLine({ ...base, kind: 'wild', foeName: '꼬마돌' })).toBeNull()
  })

  it('이긴 팩토리는 끝 줄도 트레이너 쪽이다 — 야생의 「배틀에서 이겼다!」가 아니다', () => {
    const tail = closingLines({ ...base, kind: 'factory', outcome: 'win', foeName: '팩토리헤드' })
    expect(tail).not.toContain('배틀에서 이겼다!')
  })
})
