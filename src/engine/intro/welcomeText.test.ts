// 인트로 첫머리의 우리 인사 (`welcomeText`)
//
// 이 글이 지는 짐이 둘이다: **이 세계의 이름**과 **누가 만들었고 무엇인가**.
// 셋 중 하나라도 빠지면 게임 안에서 그 말을 하는 자리가 없어진다 —
// 설치 화면·타이틀·크레딧은 다 게임 밖이다 (COPYRIGHT §11).
import { describe, expect, it } from 'vitest'
import { introWelcome } from './welcomeText'
import { INTRO } from './beats'

const LOCALES = ['ko', 'en', 'ja'] as const

describe('인트로 인사', () => {
  it('맨 앞 박자다 — 원작 첫 줄보다 먼저 나온다', () => {
    expect(INTRO[0]?.kind).toBe('ours')
    expect(INTRO.filter((s) => s.kind === 'ours')).toHaveLength(1)
  })

  it('세 언어가 다 있고 서로 다르다', () => {
    const seen = LOCALES.map((l) => introWelcome(l))
    expect(new Set(seen).size).toBe(3)
    for (const text of seen) expect(text.length).toBeGreaterThan(40)
  })

  it('모르는 언어는 한국어로 떨어진다', () => {
    expect(introWelcome('de')).toBe(introWelcome('ko'))
    expect(introWelcome('')).toBe(introWelcome('ko'))
  })

  it('세계의 이름과 만든 사람이 세 언어에 다 있다', () => {
    for (const l of LOCALES) {
      const text = introWelcome(l)
      expect(text).toContain('Siwon J. Park')
      // 이름은 언어마다 표기가 다르다 — 로마자와 각 나라 표기를 다 받는다
      expect(text).toMatch(/Radiant Platinum|레디언트 플래티넘|ラディアント プラチナ/)
    }
  })

  it('만든 사람의 자리를 알려 준다', () => {
    // 인트로에서 마박사의 소개를 걷어냈으므로(`beats.ts`), 게임 안에서 이 말을
    // 하는 자리가 여기 하나뿐이다
    for (const l of LOCALES) expect(introWelcome(l)).toContain('siwon.it.kr')
  })

  it('명예의 전당 뒤에 열리는 배포를 알려 준다', () => {
    // 만든 사람이 축복시티 콘도미니엄 2층에서 일곱을 건넨다 (`world/siwonText`).
    // 그 말을 아무 데서도 안 하면, 원작에 없는 이 이벤트는 아무도 못 찾는다
    expect(introWelcome('ko')).toMatch(/명예의 전당/)
    expect(introWelcome('en')).toMatch(/Hall of Fame/i)
    expect(introWelcome('ja')).toMatch(/でんどういり/)
  })

  it('비공식·비영리라는 말이 세 언어에 다 있다', () => {
    expect(introWelcome('ko')).toMatch(/비공식/)
    expect(introWelcome('ko')).toMatch(/비영리/)
    expect(introWelcome('en')).toMatch(/unofficial/i)
    expect(introWelcome('en')).toMatch(/non-commercial/i)
    expect(introWelcome('ja')).toMatch(/ひこうしき/)
    expect(introWelcome('ja')).toMatch(/ひえいり/)
  })

  it('⚠️ 「안전」·「합법」이라고 적지 않는다 (DEPLOY §6)', () => {
    for (const l of LOCALES) {
      expect(introWelcome(l)).not.toMatch(/안전|합법|safe|legal|あんぜん|ごうほう/i)
    }
  })

  it('대사창 규칙을 지킨다 — 창마다 두 줄을 안 넘는다', () => {
    for (const l of LOCALES) {
      const windows = introWelcome(l).split('\r')
      for (const w of windows) {
        expect(w.split('\n').length).toBeLessThanOrEqual(2)
        // 마지막 창 뒤에 빈 창이 뜨지 않게, 끝에 표지를 안 남긴다
        expect(w).not.toMatch(/[\r\f]/)
      }
      expect(introWelcome(l)).not.toMatch(/[\r\f]$/)
    }
  })
})
