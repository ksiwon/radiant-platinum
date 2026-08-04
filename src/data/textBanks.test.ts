// 뱅크 대응표 회귀 고정 (PLAN §4.2).
// 표의 값들은 3로케일 실제 텍스트를 눈으로 대조해 검증한 것이다 (예: us#412 "TURTWIG"
// ↔ ko#408 "모부기" ↔ ja#408 "ナエトル"). 자동 판별 휴리스틱을 바꿔서 이 값이 흔들리면
// 그건 개선이 아니라 회귀다.
import { describe, it, expect } from 'vitest'
import { TEXT_BANKS, LOCALES, bankIndex, getBank, type TextBankName } from './textBanks'

/** 내용 대조로 확정한 값 — 휴리스틱이 아니라 사실이다 */
const VERIFIED: Record<TextBankName, { us: number; ko: number; ja: number; entries: number }> = {
  species_names:  { us: 412, ko: 408, ja: 408, entries: 496 },
  move_names:     { us: 647, ko: 637, ja: 636, entries: 468 },
  ability_names:  { us: 610, ko: 605, ja: 604, entries: 124 },
  item_names:     { us: 392, ko: 390, ja: 390, entries: 468 },
  type_names:     { us: 624, ko: 617, ja: 616, entries: 18 },
  nature_names:   { us: 202, ko: 201, ja: 201, entries: 25 },
  location_names: { us: 433, ko: 428, ja: 427, entries: 126 },
  // 트레이너 이름은 내용으로 확인했다: ko#250 "동관"이 강석이고, 같은 번호의
  // trpoke가 자철석37/강철톤38/바리톱스41 — 원작 강석의 파티다 (DATA.md §2.9).
  // ⚠️ us 뱅크는 928칸 중 43칸만 차 있다. 복호화 실패가 아니라 데이터가 비어 있다
  trainer_names:   { us: 618, ko: 612, ja: 611, entries: 928 },
  trainer_classes: { us: 619, ko: 613, ja: 612, entries: 105 },
}

describe('텍스트 뱅크 대응표', () => {
  it('검증된 뱅크가 모두 들어 있다', () => {
    expect(TEXT_BANKS.map((b) => b.name).sort()).toEqual(Object.keys(VERIFIED).sort())
  })

  for (const [name, want] of Object.entries(VERIFIED) as [TextBankName, (typeof VERIFIED)[TextBankName]][]) {
    it(`${name}: 로케일별 인덱스가 검증값과 일치한다`, () => {
      expect(getBank(name).entries).toBe(want.entries)
      for (const loc of LOCALES) expect(bankIndex(name, loc)).toBe(want[loc])
    })
  }

  it('로케일 인덱스가 지역마다 실제로 다르다 — 인덱스 직접 참조가 위험한 이유', () => {
    const differing = TEXT_BANKS.filter((b) => b.us !== b.ko || b.us !== b.ja)
    expect(differing.length).toBe(TEXT_BANKS.length)
  })

  it('드리프트는 us 인덱스에 대해 단조 증가한다 — 뱅크 순서가 보존된다는 근거', () => {
    const sorted = [...TEXT_BANKS].sort((a, b) => a.us - b.us)
    const drifts = sorted.map((b) => b.us - b.ko)
    for (let i = 1; i < drifts.length; i++) {
      expect(drifts[i]!).toBeGreaterThanOrEqual(drifts[i - 1]!)
    }
  })

  it('알 수 없는 이름은 조용히 넘어가지 않고 던진다', () => {
    expect(() => bankIndex('nope' as never, 'ko')).toThrowError(/알 수 없는/)
  })
})
