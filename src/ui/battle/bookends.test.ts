// 판의 첫 줄과 끝 줄 — 배틀팩토리도 트레이너전이다 (`BATTLE_TYPE_TRAINER`).
//
// 예전에는 첫 줄만 `kind === 'trainer'`를 봐서, 팩토리는 「승부를 걸어왔다!」 없이
// 시작하고 끝에서만 「이겼다!」를 트레이너 쪽 줄로 냈다.
import { describe, expect, it } from 'vitest'
import { askLine, closingLines, hasTrainer, openingLine } from './bookends'
import { MSG } from './romText'

/** 롬 줄 자리만 채운 뱅크. 글은 한국 롬의 그 줄 그대로다 */
const lines: string[] = []
lines[MSG.youAreChallengedByTr] = '{STRVAR_1 14, 0, 0} {STRVAR_1 3, 1, 3}\n승부를 걸어왔다!\r'
lines[MSG.youAreChallengedByLinkTr] = '{STRVAR_1 3, 0, 3}\n승부를 걸어왔다!\r'
lines[MSG.playerIsOutOfUsablePokemon] = '{STRVAR_1 3, 0, 0}에게는\n싸울 수 있는 포켓몬이 없다!\r'
lines[MSG.playerDroppedMoneyInPanic] = '{STRVAR_1 3, 0, 1} 당황해서\n{STRVAR_1 54, 1, 0}원을 잃어버렸다!\r'
lines[MSG.playerPaidOutMoneyToTheWinner] = '{STRVAR_1 3, 0, 1} 상금으로\n{STRVAR_1 54, 1, 0}원을 지불했다\r'
lines[MSG.blackedOutDotDotDot] = '... ... ... ...\r'
lines[MSG.playerBlackedOut] = '{STRVAR_1 3, 0, 1}\n눈앞이 캄캄해졌다!\r'

const base = {
  lines, outcome: null, foes: [], foeName: null, foeClass: null, foeTrainer: null,
  defeatLines: [], foeWinLines: [], prize: 0, penalty: 0, playerName: '나',
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

describe('진 판의 끝 줄 (`subscript_battle_lost.s`)', () => {
  it('야생에서 지면 「당황해서 잃어버렸다」가 「싸울 수 있는 포켓몬이 없다」 바로 뒤에 온다', () => {
    const tail = closingLines({ ...base, kind: 'wild', outcome: 'loss', penalty: 40 })
    expect(tail).toEqual([
      '나에게는\n싸울 수 있는 포켓몬이 없다!',
      '나는 당황해서\n40원을 잃어버렸다!',
      '... ... ... ...',
      '나는\n눈앞이 캄캄해졌다!',
    ])
  })

  it('트레이너에게 지면 「지불했다」다', () => {
    const tail = closingLines({ ...base, kind: 'trainer', outcome: 'loss', penalty: 1200 })
    expect(tail[1]).toBe('나는 상금으로\n1200원을 지불했다')
  })

  it('잃은 돈이 0이면 그 줄이 없다 — 원작도 `BTLVAR_MSG_TEMP`가 0이면 건너뛴다', () => {
    const tail = closingLines({ ...base, kind: 'trainer', outcome: 'loss', penalty: 0 })
    expect(tail).toHaveLength(3)
    expect(tail.some((t) => t.includes('지불했다'))).toBe(false)
  })
})

describe('명령을 묻는 줄 (`Task_PlayerSetCommandSelection`)', () => {
  const ask = [...lines]
  ask[MSG.whatWillPokemonDo] = '{STRVAR_1 1, 0, 1} 무엇을 할까?{SCREEN 0}'
  ask[MSG.whatWillPlayerThrow] = '{STRVAR_1 3, 0, 1} 무엇을 던질까?{SCREEN 0}'

  it('묻는 마리의 이름으로 롬 줄을 채운다 — 아래 화면을 여는 부호는 안 남는다', () => {
    expect(askLine({ lines: ask, kind: 'wild', who: '모부기', playerName: '나' })).toBe('모부기는 무엇을 할까?')
    expect(askLine({ lines: ask, kind: 'trainer', who: '찌르꼬', playerName: '나' })).toBe('찌르꼬는 무엇을 할까?')
  })

  it('사파리는 주인공에게 던질 것을 묻는다', () => {
    expect(askLine({ lines: ask, kind: 'safari', who: null, playerName: '나' })).toBe('나는 무엇을 던질까?')
  })

  it('물을 마리가 없으면 줄이 없다 — 지난 줄을 그대로 둔다', () => {
    expect(askLine({ lines: ask, kind: 'wild', who: null, playerName: '나' })).toBeNull()
  })

  it('뱅크가 안 왔으면 같은 말로 물러선다', () => {
    expect(askLine({ lines: [], kind: 'wild', who: '모부기', playerName: '나' })).toBe('모부기는 무엇을 할까?')
  })
})
