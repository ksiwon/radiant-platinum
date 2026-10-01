// 설치 화면의 오류 문장 (`installErrors.ts`)
//
// 재는 것은 둘이다: **이름으로 가르는가**(메시지는 브라우저마다 다르다), 그리고
// **원문을 버리지 않는가**(지원 문의에는 그쪽이 필요하다)
import { describe, it, expect } from 'vitest'
import { explainInstallError } from './installErrors'

describe('explainInstallError', () => {
  it('할당량이 차면 공간 이야기를 하고, 얼마가 더 필요한지 적는다', () => {
    const e = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    const got = explainInstallError(e, { space: { need: 2_000_000_000, free: 1_000_000_000 } })
    expect(got.text).toContain('저장 공간이 모자라')
    expect(got.text).toContain('더 필요합니다')
    expect(got.text).toContain('이어서')
    // 영어 원문은 화면 문장에 안 들어가고 「자세히」 쪽에 남는다
    expect(got.text).not.toContain('quota')
    expect(got.raw).toBe('QuotaExceededError: The quota has been exceeded.')
  })

  it('공간을 모르면 얼마인지는 안 지어낸다', () => {
    const got = explainInstallError(new DOMException('x', 'QuotaExceededError'))
    expect(got.text).not.toContain('더 필요합니다')
  })

  it.each(['NotAllowedError', 'SecurityError', 'NotReadableError', 'NotFoundError'])(
    '%s면 다시 고르라고 한다', (name) => {
      const got = explainInstallError(new DOMException('denied', name))
      expect(got.text).toContain('다시 골라')
      expect(got.raw).toBe(`${name}: denied`)
    })

  it('변환 스레드가 끊기면 새로 고치라고 한다', () => {
    const e = Object.assign(new Error('스레드를 끊었습니다.'), { name: 'Terminated' })
    expect(explainInstallError(e).text).toContain('새로 고친')
    expect(explainInstallError(e, { during: 'read' }).text).toContain('다시 골라')
  })

  it('모르는 예외는 한 문장으로 접고 원문은 그대로 둔다', () => {
    const got = explainInstallError(new Error('뭔가 터졌다'))
    expect(got.text).toContain('알 수 없는 문제')
    // `Error: `를 앞에 붙이지 않는다 — `String(e)`가 하던 그것이다
    expect(got.raw).toBe('뭔가 터졌다')
    expect(explainInstallError('문자열').raw).toBe('문자열')
  })

  it('화면 문장은 합니다체로 끝난다', () => {
    for (const e of [
      new DOMException('x', 'QuotaExceededError'),
      new DOMException('x', 'NotFoundError'),
      new Error('x'),
    ]) expect(explainInstallError(e).text).toMatch(/(니다|세요)\.$/)
  })
})
