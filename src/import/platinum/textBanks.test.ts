// 뱅크 자리 계산 (COPYRIGHT.md §6)
//
// ⚠️ **이 파일에는 진짜 롬 값이 하나도 없다.** 인공 NARC를 지어서 계산을 검사한다 —
// 키도 엔트리 수도 여기서 만든 숫자다. 진짜 롬과의 대조는 아래 `PT_REQUIRE_DATA=1`
// 통합시험 한 자리에서만 하고, 거기서 읽은 값도 화면에도 파일에도 안 남긴다.
import { describe, it, expect } from 'vitest'
import {
  BANK_ORDER, LOCALES, TEXT_BANK_NAMES, bankCount, bankHead, bankIndex, bankLayout,
  duplicatePairs, readBankLayout, usBankIndex, BankLayoutError, MSG_NARC,
  type BankHead, type Locale,
} from './textBanks'
import { narcCount, narcEntry } from './nds'

/** 인공 NARC 하나. 실제 파서를 그대로 통과하는 진짜 구조다 */
function fakeNarc(files: readonly Uint8Array[]): Uint8Array {
  const btaf = 12 + files.length * 8
  const total = files.reduce((n, f) => n + f.byteLength, 0)
  const gmif = 8 + total
  const out = new Uint8Array(16 + btaf + gmif)
  const view = new DataView(out.buffer)
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i) }

  ascii(0, 'NARC')
  view.setUint16(6, 0x0100, true)
  view.setUint32(8, out.byteLength, true)
  view.setUint16(12, 16, true)     // 첫 조각의 자리
  view.setUint16(14, 2, true)      // 조각 수

  ascii(16, 'BTAF')
  view.setUint32(20, btaf, true)
  view.setUint32(24, files.length, true)
  let at = 0
  files.forEach((f, i) => {
    view.setUint32(28 + i * 8, at, true)
    view.setUint32(32 + i * 8, at + f.byteLength, true)
    at += f.byteLength
  })

  const g = 16 + btaf
  ascii(g, 'GMIF')
  view.setUint32(g + 4, gmif, true)
  let p = g + 8
  for (const f of files) { out.set(f, p); p += f.byteLength }
  return out
}

/** 머리만 있는 인공 뱅크. 키는 여기서 지어낸 것이다 */
function fakeBank(entries: number, key: number): Uint8Array {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setUint16(0, entries, true)
  new DataView(b.buffer).setUint16(2, key, true)
  return b
}

/** 그 로케일 롬처럼 생긴 인공 msg narc. 겹치지 않는 (키, 엔트리) 쌍을 준다 */
function fakeRom(locale: Locale, tweak?: (i: number) => Uint8Array | null): Uint8Array {
  const n = bankCount(locale)
  const files: Uint8Array[] = []
  for (let i = 0; i < n; i++) files.push(tweak?.(i) ?? fakeBank(i % 97, 1000 + i))
  return fakeNarc(files)
}

const reader = { count: narcCount, entry: narcEntry }
const readerFor = (bytes: Uint8Array | null) => async (path: string) => (path === MSG_NARC ? bytes : null)

describe('뱅크 자리 계산', () => {
  it('us 자리는 목록 순서 그대로다', () => {
    const us = bankLayout('us')
    expect(us.size).toBe(724)
    expect(BANK_ORDER.every((name, i) => us.get(name) === i)).toBe(true)
  })

  it('세 로케일의 뱅크 수가 실제 롬과 같다', () => {
    // 724 / 714 / 709 — 이 셋은 롬을 열면 그대로 나온다. 계산이 여기서 어긋나면
    // `readBankLayout`이 사용자의 롬 앞에서 던진다
    expect([bankCount('us'), bankCount('ko'), bankCount('ja')]).toEqual([724, 714, 709])
  })

  it('CJK 자리는 빠진 것을 건너뛰고 끼워 넣은 것을 비켜 센다', () => {
    for (const locale of ['ko', 'ja'] as const) {
      const layout = bankLayout(locale)
      const seen = [...layout.values()]
      // 자리는 오름차순이고 겹치지 않는다 — 순서는 보존된다는 것이 전제다
      expect(seen).toEqual([...seen].sort((a, b) => a - b))
      expect(new Set(seen).size).toBe(seen.length)
      expect(Math.max(...seen)).toBe(bankCount(locale) - 1)
      // 이름 없는 자리 — 한국어판은 인사말 하나, 일본어판은 없다
      const empty = Array.from({ length: bankCount(locale) }, (_, i) => i).filter((i) => !seen.includes(i))
      expect(empty).toHaveLength(locale === 'ko' ? 1 : 0)
    }
  })

  /**
   * ⚠️ 이 줄이 배포된 게임의 대사를 통째로 어긋나게 했던 자리다. 맵 헤더의
   * `msg`는 **그 롬의 번호**인데 대사 파일 이름은 us 번호다
   */
  it('로케일 번호를 us 번호로 되돌린다', () => {
    for (const locale of ['ko', 'ja'] as const) {
      for (const [name, at] of bankLayout(locale)) {
        expect(usBankIndex(at, locale), name).toBe(bankLayout('us').get(name))
      }
    }
    // 한국어판이 끼워 넣은 뱅크는 us에 짝이 없다 — 0으로 뭉개지 않는다
    const koTaken = new Set(bankLayout('ko').values())
    const inserted = Array.from({ length: bankCount('ko') }, (_, i) => i).find((i) => !koTaken.has(i))!
    expect(usBankIndex(inserted, 'ko')).toBeNull()
    expect(usBankIndex(0, 'us')).toBe(0)
  })

  it('CJK에 없는 뱅크는 null이고 0으로 뭉개지 않는다', () => {
    expect(bankIndex('move_names_uppercase', 'us')).toBeGreaterThan(0)
    expect(bankIndex('move_names_uppercase', 'ko')).toBeNull()
    expect(bankIndex('game_corner', 'ko')).not.toBeNull()
    // ⚠️ 일본어판에도 게임코너는 **있다.** 미국판과 문장 수가 달라서 (키, 엔트리
    // 수)로 짝짓는 표가 못 알아봤을 뿐이다 — 없다고 적었더니 트바리 게임코너의
    // 대사가 통째로 사라졌다
    expect(bankIndex('game_corner', 'ja')).not.toBeNull()
  })

  it('로케일마다 자리가 실제로 달라진다 — 인덱스 직접 참조가 위험한 이유', () => {
    const differing = BANK_ORDER.filter((n) => bankIndex(n, 'ko') !== null && bankIndex(n, 'ko') !== bankIndex(n, 'us'))
    expect(differing.length).toBeGreaterThan(600)
  })

  /**
   * 미국 롬에만 있는 표. 조사가 붙은 판과 복수형이라 한국어·일본어에는
   * 그런 말이 아예 없고, 롬도 표를 안 들고 있다 — 우리 실수가 아니다
   */
  const EN_ONLY = new Set([
    'item_names_with_articles', 'item_names_plural',
    'species_name_with_articles', 'trainer_class_names_with_articles',
  ])

  it('코드가 쓰는 이름이 세 로케일에 있다 — 달 이름과 조사 판만 빼고', () => {
    for (const name of TEXT_BANK_NAMES) {
      for (const locale of LOCALES) {
        // ⚠️ **일본 롬에는 달 이름 표가 없다.** 일본어가 달을 이름으로 안
        // 부르고 문장 틀이 숫자 뒤에 단위를 직접 쓴다 — 우리 실수가 아니다
        if (name === 'month_names' && locale === 'ja') {
          expect(bankIndex(name, locale)).toBeNull()
          continue
        }
        if (EN_ONLY.has(name) && locale !== 'us') {
          expect(bankIndex(name, locale), `${name}/${locale}`).toBeNull()
          continue
        }
        expect(bankIndex(name, locale), `${name}/${locale}`).not.toBeNull()
      }
    }
  })

  it('모르는 이름은 조용히 넘어가지 않고 던진다', () => {
    expect(() => bankIndex('nope', 'ko')).toThrowError(/알 수 없는/)
  })
})

describe('사용자의 롬으로 검산한다', () => {
  it('뱅크 수가 맞으면 자리를 준다', async () => {
    const layout = await readBankLayout(readerFor(fakeRom('ko')), 'ko', reader)
    expect(layout.get('species_name')).toBe(bankIndex('species_name', 'ko'))
  })

  it('뱅크 수가 다르면 던진다 — 아는 판이 아니다', async () => {
    // ja 롬을 ko라고 우기는 상황. 계산만 믿었으면 709번째 자리에서 조용히 틀렸다
    await expect(readBankLayout(readerFor(fakeRom('ja')), 'ko', reader))
      .rejects.toThrow(/뱅크가 709개다/)
  })

  it('narc이 없으면 던진다', async () => {
    await expect(readBankLayout(readerFor(null), 'us', reader)).rejects.toBeInstanceOf(BankLayoutError)
  })

  it('머리가 잘린 뱅크가 있으면 던진다', async () => {
    const rom = fakeRom('us', (i) => (i === 300 ? new Uint8Array(2) : null))
    await expect(readBankLayout(readerFor(rom), 'us', reader)).rejects.toThrow(/머리를 못 읽는다/)
  })

  it('(키, 엔트리) 쌍이 겹치면 던진다 — 이름을 확정할 근거가 없다', async () => {
    const rom = fakeRom('us', (i) => (i === 5 || i === 6 ? fakeBank(3, 7) : null))
    await expect(readBankLayout(readerFor(rom), 'us', reader)).rejects.toThrow(/겹친다/)
  })

  it('머리를 읽는다', () => {
    expect(bankHead(fakeBank(496, 31415))).toEqual({ entries: 496, key: 31415 })
    expect(bankHead(new Uint8Array(3))).toBeNull()
  })

  it('겹치는 쌍을 센다', () => {
    const banks: BankHead[] = [{ key: 1, entries: 1 }, { key: 1, entries: 2 }, { key: 1, entries: 1 }]
    expect(duplicatePairs(banks)).toEqual(['1/1'])
    expect(duplicatePairs([{ key: 1, entries: 1 }])).toEqual([])
  })
})
