// 조사 선택 검증. 실제로 게임에 나오는 이름으로 고정한다 —
// "찌르꼬이(가) 나타났다"가 화면에 뜬 걸 보고 만든 모듈이다.
import { describe, it, expect } from 'vitest'
import { hasFinalConsonant, subject, object, topic, withSubject } from './korean'

describe('받침 판정', () => {
  it('받침이 없는 글자', () => {
    // 갸라도'스' · 왕콘'치' · 귀뚤뚜'기'는 받침이 없다.
    // 셋 다 처음에 있다고 적었다가 테스트에 걸렸다 — 눈으로 세는 건 못 믿는다
    for (const w of ['찌르꼬', '비버니', '모부기', '두두', '갸라도스', '왕콘치', '귀뚤뚜기']) {
      expect(hasFinalConsonant(w), w).toBe(false)
    }
  })
  it('받침이 있는 글자', () => {
    for (const w of ['팬텀', '고라파덕', '골덕', '잉어킹', '이상해꽃', '괴력몬']) {
      expect(hasFinalConsonant(w), w).toBe(true)
    }
  })
  it('한글이 아니면 null', () => {
    expect(hasFinalConsonant('Turtwig')).toBeNull()
    expect(hasFinalConsonant('ナエトル')).toBeNull()
    expect(hasFinalConsonant('')).toBeNull()
  })
})

describe('조사 선택', () => {
  it('주격', () => {
    expect(withSubject('찌르꼬')).toBe('찌르꼬가')
    expect(withSubject('고라파덕')).toBe('고라파덕이')
    expect(withSubject('비버니')).toBe('비버니가')
  })
  it('목적격·보조사', () => {
    expect(object('저주')).toBe('를')
    expect(object('몸통박치기')).toBe('를')
    expect(object('흡수')).toBe('를')
    expect(object('전광석화')).toBe('를')
    expect(topic('팬텀')).toBe('은')
    expect(topic('모부기')).toBe('는')
  })
  it('한글이 아니면 병기형으로 물러난다 — 틀린 조사보다 낫다', () => {
    expect(subject('Turtwig')).toBe('이(가)')
    expect(object('Turtwig')).toBe('을(를)')
    expect(withSubject('Starly')).toBe('Starly이(가)')
  })
})
