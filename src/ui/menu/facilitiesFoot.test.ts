import { describe, expect, it } from 'vitest'
import { ChallengeType } from '../../engine/frontier/factory'
import {
  factoryFoot, factoryNote, slotFoot, slotScale, type FactoryAsk,
} from './facilitiesText'

/** 프런티어 기록 뱅크(16)의 앞쪽 — 자리만 맞춘 가짜 */
function bank(): string[] {
  const lines = Array.from({ length: 44 }, () => '')
  lines[1] = '싱글'; lines[2] = '더블'; lines[3] = '멀티'
  lines[34] = '레벨 50'; lines[35] = '오픈 레벨'
  lines[38] = '{STRVAR_1 53, 0, 0}연승'
  return lines
}

describe('팩토리 바닥 안내', () => {
  it('빌리기 목록은 X를 말하지 않는다 — 셋을 골라야 나간다', () => {
    expect(factoryFoot('rental', 'list')).toBe('↑↓ 고르기 · Z 결정')
  })

  it('바꾸기 목록의 X는 중지다', () => {
    expect(factoryFoot('trade', 'list')).toBe('↑↓ 고르기 · Z 결정 · X 중지')
    expect(factoryFoot('trade', 'receive')).toBe('↑↓ 고르기 · Z 결정 · X 중지')
  })

  it('갈래와 받기 확인의 X는 「닫기」 한 동사다', () => {
    expect(factoryFoot('rental', 'options')).toBe('↑↓ 고르기 · Z 결정 · X 닫기')
    expect(factoryFoot('trade', 'accept')).toBe('↑↓ 고르기 · Z 결정 · X 닫기')
  })

  it('빌리기 확인의 X는 한 마리 되돌리기다', () => {
    expect(factoryFoot('rental', 'confirm')).toBe('↑↓ 고르기 · Z 결정 · X 한 마리 되돌리기')
  })

  it('X가 아무 일도 안 하는 「중지하겠습니까?」에는 X를 안 쓴다', () => {
    expect(factoryFoot('trade', 'cancelTrade')).not.toContain('X')
  })

  it('「뒤로」 · 「닫는다」가 어느 단에도 없다', () => {
    const asks: FactoryAsk[] = ['list', 'options', 'confirm', 'receive', 'accept', 'cancelTrade', 'done']
    for (const ask of asks) {
      for (const phase of ['rental', 'trade'] as const) {
        expect(factoryFoot(phase, ask)).not.toMatch(/뒤로|닫는다/)
      }
    }
  })
})

describe('팩토리 머리 note', () => {
  it('「싱글 · 레벨 50 · 0연승」 — 뱅크 16과 실제 값이다', () => {
    expect(factoryNote({ challenge: ChallengeType.SINGLE, openLevel: false, streak: 0 }, bank()))
      .toBe('싱글 · 레벨 50 · 0연승')
  })

  it('더블 · 오픈 레벨 · 연승 수가 그대로 들어간다', () => {
    expect(factoryNote({ challenge: ChallengeType.DOUBLE, openLevel: true, streak: 13 }, bank()))
      .toBe('더블 · 오픈 레벨 · 13연승')
  })

  it('뱅크가 안 왔으면 지어내지 않고 비운다', () => {
    expect(factoryNote({ challenge: ChallengeType.SINGLE, openLevel: false, streak: 3 }, [])).toBe('')
    expect(factoryNote(null, bank())).toBe('')
  })
})

describe('슬롯 확대 식', () => {
  it('960×640 본문(약 954×568)에서 2배다', () => {
    expect(slotScale(954, 568)).toBe(2)
  })

  it('1040×648 상한(본문 1034×576)에서도 2배다 — 3배는 576px라 본문에 안 든다', () => {
    expect(slotScale(1034, 576)).toBe(2)
  })

  it('늘 정수이고 1~4다', () => {
    for (const [w, h] of [[400, 300], [800, 500], [1280, 800], [1920, 1080], [3000, 3000]] as const) {
      const k = slotScale(w, h)
      expect(Number.isInteger(k)).toBe(true)
      expect(k).toBeGreaterThanOrEqual(1)
      expect(k).toBeLessThanOrEqual(4)
    }
  })

  it('작은 창에서도 1배 아래로 안 내려간다', () => {
    expect(slotScale(200, 100)).toBe(1)
  })

  it('큰 화면은 3배까지 간다', () => {
    expect(slotScale(1280, 800)).toBe(3)
  })
})

describe('슬롯 바닥 안내', () => {
  it('조작 다음에 닫기다', () => {
    expect(slotFoot().indexOf('C 동전')).toBeLessThan(slotFoot().indexOf('Esc'))
  })

  it('en · ja에는 한글이 없고 키가 그대로 있다', () => {
    for (const lang of ['en', 'ja'] as const) {
      expect(slotFoot(lang), lang).not.toMatch(/[가-힣]/)
      expect(slotFoot(lang), lang).toContain('Esc')
    }
  })
})

describe('시설 바닥 안내의 세 언어', () => {
  const asks: FactoryAsk[] = ['list', 'options', 'confirm', 'receive', 'accept', 'cancelTrade', 'done']
  it('en · ja에는 한글이 없다', () => {
    for (const lang of ['en', 'ja'] as const) {
      for (const phase of ['rental', 'trade'] as const) {
        for (const ask of asks) expect(factoryFoot(phase, ask, lang), `${lang} ${phase} ${ask}`).not.toMatch(/[가-힣]/)
      }
    }
  })

  it('아무 일도 안 하는 X는 어느 언어에서도 안 약속한다', () => {
    for (const lang of ['ko', 'en', 'ja'] as const) expect(factoryFoot('trade', 'cancelTrade', lang)).not.toContain('X')
  })
})
