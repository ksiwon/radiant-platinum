// 뱅크 대응표 회귀 고정 (DATA.md §2.11)
//
// 표는 뱅크 헤더의 암호화 키로 이름을 확정한다. 아래 값들은 그와 무관한 두 근거로
// 따로 확인한 것이다 — 3로케일 실제 텍스트 대조(us#412 "TURTWIG" ↔ ko#408 "모부기"
// ↔ ja#408 "ナエトル")와 LCS 드리프트 추정. 생성기를 바꿔서 이 값이 흔들리면
// 그건 개선이 아니라 회귀다.
import { describe, it, expect } from 'vitest'
import { TEXT_BANKS, TEXT_BANK_NAMES, LOCALES, bankIndex, getBank, type TextBankName } from './textBanks'

/** 내용 대조로 확정한 값 — 휴리스틱이 아니라 사실이다 */
const VERIFIED: Record<string, { us: number, ko: number, ja: number, entries: number }> = {
  species_name:   { us: 412, ko: 408, ja: 408, entries: 496 },
  move_names:     { us: 647, ko: 637, ja: 636, entries: 468 },
  ability_names:  { us: 610, ko: 605, ja: 604, entries: 124 },
  item_names:     { us: 392, ko: 390, ja: 390, entries: 468 },
  pokemon_type_names: { us: 624, ko: 617, ja: 616, entries: 18 },
  nature_names:   { us: 202, ko: 201, ja: 201, entries: 25 },
  location_names: { us: 433, ko: 428, ja: 427, entries: 126 },
  // 트레이너 이름은 내용으로 확인했다: ko#250 "동관"이 강석이고, 같은 번호의
  // trpoke가 자철석37/강철톤38/바리톱스41 — 원작 강석의 파티다 (DATA.md §2.9).
  // ⚠️ us 뱅크는 928칸 중 43칸만 차 있다. 복호화 실패가 아니라 데이터가 비어 있다
  npc_trainer_names:   { us: 618, ko: 612, ja: 611, entries: 928 },
  trainer_class_names: { us: 619, ko: 613, ja: 612, entries: 105 },
}

describe('텍스트 뱅크 대응표', () => {
  it('us 뱅크 724개가 전부 이름을 갖는다', () => {
    expect(TEXT_BANKS).toHaveLength(724)
    // us 인덱스는 generated/text_banks.txt의 줄 번호 그대로다 — 빠짐도 겹침도 없다
    expect(TEXT_BANKS.map((b) => b.bank.us)).toEqual(TEXT_BANKS.map((_, i) => i))
    expect(new Set(TEXT_BANKS.map((b) => b.name)).size).toBe(724)
  })

  it('키가 이름을 확정한다 — (키, 엔트리 수) 쌍이 겹치지 않는다', () => {
    // 겹치면 ko/ja를 짚을 근거가 무너진다. 키만으로는 실제로 겹치는 뱅크가 있다
    const pairs = TEXT_BANKS.map((b) => `${b.key}/${b.entries.us}`)
    expect(new Set(pairs).size).toBe(724)
    expect(new Set(TEXT_BANKS.map((b) => b.key)).size).toBeLessThan(724)
  })

  for (const [name, want] of Object.entries(VERIFIED)) {
    it(`${name}: 로케일별 인덱스가 검증값과 일치한다`, () => {
      expect(getBank(name as TextBankName).entries.us).toBe(want.entries)
      for (const loc of LOCALES) expect(bankIndex(name as TextBankName, loc)).toBe(want[loc])
    })
  }

  it('영어 문법용 뱅크는 CJK 롬에 아예 없다', () => {
    // _with_articles·_plural·_uppercase — 관사도 복수형도 대소문자도 없는 언어다.
    // null을 인덱스 0으로 뭉개면 조용히 엉뚱한 뱅크를 읽는다
    const absent = TEXT_BANKS.filter((b) => b.bank.ko === null)
    expect(absent.map((b) => b.name).sort()).toEqual([
      'ability_names_uppercase',
      'ball_seal_names_plural',
      'contest_accessory_names_with_articles',
      'item_names_plural',
      'item_names_with_articles',
      'move_names_uppercase',
      'species_name_with_articles',
      'trainer_class_names_with_articles',
      'underground_goods_with_articles',
      'underground_item_names_with_articles',
      'underground_trap_names_with_articles',
    ])
  })

  it('로케일 인덱스가 지역마다 실제로 다르다 — 인덱스 직접 참조가 위험한 이유', () => {
    const differing = TEXT_BANKS.filter((b) => b.bank.us !== b.bank.ko)
    expect(differing.length).toBeGreaterThan(600)
  })

  it('드리프트가 내려가는 곳은 한국어판이 뱅크를 끼워 넣은 자리 하나뿐이다', () => {
    // ko에 없는 뱅크가 빠지면서 뒤가 한 칸씩 당겨진다 — 드리프트는 보통 늘기만 한다.
    // 딱 한 번 줄어드는데, 인사말이 en·fr·de·it·jp 다음에 한국어용으로 하나 더
    // 끼어들기 때문이다 (ko#657, 3엔트리, us에 대응이 없다). 순서가 뒤집힌 게 아니다.
    const drops: string[] = []
    let prev = -Infinity
    for (const b of TEXT_BANKS) {
      if (b.bank.ko === null) continue
      const drift = b.bank.us - b.bank.ko
      if (drift < prev) drops.push(b.name)
      prev = drift
    }
    expect(drops).toEqual(['greetings_es'])

    // 그 한 칸이 어느 us 이름에도 안 짚혀야 앞뒤가 맞는다
    const claimed = new Set(TEXT_BANKS.map((b) => b.bank.ko))
    const orphans = Array.from({ length: 714 }, (_, i) => i).filter((i) => !claimed.has(i))
    expect(orphans).toEqual([657])
  })

  it('코드가 쓰는 이름이 전부 표에 있다', () => {
    for (const name of TEXT_BANK_NAMES) expect(getBank(name).bank.us).toBeGreaterThanOrEqual(0)
  })

  it('알 수 없는 이름은 조용히 넘어가지 않고 던진다', () => {
    expect(() => bankIndex('nope' as never, 'ko')).toThrowError(/알 수 없는/)
  })
})
