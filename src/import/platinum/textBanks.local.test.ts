// 계산한 뱅크 자리를 **진짜 롬 산출물**과 대조한다 — 로컬 전용
//
// ⚠️ 이 시험은 `PT_REQUIRE_DATA=1`이고 `raw/work/textBanks.json`이 있을 때만 돈다.
// 그 파일은 `pnpm extract:textbanks`가 롬 셋을 읽어 만드는 것이고 **리포에 안 들어간다**
// (COPYRIGHT.md §6). 공개 CI에는 없는 것이 정상이다.
//
// ⚠️ **읽은 값을 밖으로 안 낸다.** 실패 메시지에 키도 인덱스도 안 적는다 — 어긋난
// 뱅크의 **이름과 개수**까지만 말한다. 그러지 않으면 CI 로그가 곧 그 표가 된다.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { LOCALES, bankCount, bankIndex, bankLayout, type Locale } from './textBanks'

const PATH = 'raw/work/textBanks.json'
const enabled = process.env.PT_REQUIRE_DATA === '1' && existsSync(PATH)

interface Row { name: string, bank: Record<Locale, number | null> }

describe.skipIf(!enabled)('롬에서 나온 표와 대조한다 (로컬 전용)', () => {
  const rows = (): Row[] => JSON.parse(readFileSync(PATH, 'utf8')) as Row[]

  it('이름과 순서가 같다', () => {
    const table = rows()
    expect(table.length).toBe(bankCount('us'))
    const wrong = table.filter((r, i) => bankIndex(r.name, 'us') !== i).map((r) => r.name)
    expect(wrong).toEqual([])
  })

  it('세 로케일 자리가 전부 같다 — 계산이 표를 대신할 수 있다', () => {
    const table = rows()
    for (const locale of LOCALES) {
      const wrong = table.filter((r) => bankIndex(r.name, locale) !== r.bank[locale]).map((r) => r.name)
      // 이름만 적는다. 값을 적으면 로그가 곧 지운 그 표가 된다
      expect(wrong, `${locale}: ${wrong.length}개 어긋남`).toEqual([])
      expect(bankLayout(locale).size).toBe(table.filter((r) => r.bank[locale] !== null).length)
    }
  })
})
