import { describe, expect, it } from 'vitest'
import { statusOf } from './events'

describe('statusOf — 시뮬레이터 상태 글자를 세이브 상태로 접는다', () => {
  it('아는 상태는 그대로다', () => {
    for (const s of ['slp', 'psn', 'tox', 'brn', 'frz', 'par'] as const) expect(statusOf(s)).toBe(s)
  })
  it('쓰러진 마리의 fnt는 상태이상이 아니다 — ok로 접는다', () => {
    expect(statusOf('fnt')).toBe('ok')
  })
  it('빈 글자 · 없음도 ok다', () => {
    expect(statusOf('')).toBe('ok')
    expect(statusOf(null)).toBe('ok')
    expect(statusOf(undefined)).toBe('ok')
  })
})
