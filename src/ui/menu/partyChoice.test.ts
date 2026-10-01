// 파티 화면이 요약에서 돌아올 때의 커서 (`partyChoice.ts`의 돌아올 자리)
//
// 요약을 쌓으면 파티 화면이 내려갔다 다시 서서, 여섯째 마리의 요약을 보고 오면 커서가
// 첫째에 있었다. 원작은 요약이 닫힌 자리로 파티 화면을 다시 연다 (`StartMenu_ExitSummary`).
import { afterEach, describe, expect, it } from 'vitest'
import {
  followPartyReturn, partyReturnSlot, partyStartCursor, setPartyReturnSlot,
} from './partyChoice'

const plain = { choosingMon: false, chooseStart: 0 }

afterEach(() => { setPartyReturnSlot(null) })

describe('첫 커서', () => {
  it('아무것도 안 세웠으면 맨 앞이다', () => {
    expect(partyStartCursor(plain)).toBe(0)
  })

  it('파티 화면이 연 요약에서 돌아오면 그 자리다', () => {
    setPartyReturnSlot(5)
    expect(partyStartCursor(plain)).toBe(5)
  })

  it('스크립트가 고르라고 열었으면 스크립트가 준 자리가 이긴다 (키우미집)', () => {
    setPartyReturnSlot(5)
    expect(partyStartCursor({ choosingMon: true, chooseStart: 2 })).toBe(2)
  })

  it('비우면 다음에 따로 연 파티 화면은 맨 앞이다', () => {
    setPartyReturnSlot(3)
    setPartyReturnSlot(null)
    expect(partyStartCursor(plain)).toBe(0)
  })
})

describe('요약 안에서 다른 마리로 넘어가기', () => {
  it('파티 화면이 연 요약이면 닫힌 자리를 따라간다', () => {
    setPartyReturnSlot(1)
    followPartyReturn(4)
    expect(partyReturnSlot()).toBe(4)
    expect(partyStartCursor(plain)).toBe(4)
  })

  it('다른 데서 연 요약(키우미집 스크립트)은 돌아올 자리를 안 세운다', () => {
    followPartyReturn(4)
    expect(partyReturnSlot()).toBeNull()
    expect(partyStartCursor(plain)).toBe(0)
  })
})
