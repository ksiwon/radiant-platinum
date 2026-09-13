// 크레딧 배치표의 **자리** (PARITY.md §8.12)
//
// ⚠️ **이 시험이 있는 이유가 상금표(`trainers.test.ts`)와 같다.** 자리를 미국판
// 하나로 박아 두면 다른 판에서 조용히 틀린다. 다만 갈래가 하나 더 나쁘다 —
// 상금표는 **같은 표가 옮겨 앉은 것**이라 알맹이를 맞대면 되는데, 크레딧은
// **줄 수부터 다른 딴 표**다 (미국 237 · 한국 209 · 일본 184).
//
// 그래서 두 갈래로 잰다:
//
//   **지어낸 오버레이** — 줄 번호가 안 오르거나 · y가 내려가거나 · 적힌 줄에서
//                         안 끊기는 자리를 실제로 만들어 보고, 파서가 잡는지
//   **진짜 롬 셋**       — 세 판을 열어 적어 둔 자리에서 적어 둔 줄이 나오는지,
//                         그리고 **미국판이 디컴프 표와 같은지**. 그 하나가
//                         나머지 둘의 잣대다
import { describe, expect, it } from 'vitest'
import { creditRows } from './credits'
import { creditsLocator, SUPPORTED } from './validate'
import { openNds } from './nds'
import { CREDIT_ROWS } from '../../engine/world/creditsTable'
import { fileSource, romPath, withRom } from '../../data/romData.testkit'

/** `{줄번호, y, 가운데}` 세 쌍을 그 자리에 놓은 오버레이 */
function fakeOverlay(at: number, rows: readonly (readonly [number, number, number])[]): Uint8Array {
  const ov = new Uint8Array(at + (rows.length + 2) * 6)
  const view = new DataView(ov.buffer)
  for (const [i, [line, y, c]] of rows.entries()) {
    view.setUint16(at + i * 6, line, true)
    view.setUint16(at + i * 6 + 2, y, true)
    view.setUint16(at + i * 6 + 4, c, true)
  }
  return ov
}

/** 줄 번호가 0부터 오르고 y가 21씩 느는 멀쩡한 표 */
const goodRows = (n: number): [number, number, number][] =>
  Array.from({ length: n }, (_, i) => [i, i * 21, i < 2 ? 1 : 0])

describe('배치표를 읽는 자', () => {
  const site = { overlay: 99, offset: 0x40, rows: 8 }

  it('멀쩡한 표를 그대로 읽는다', () => {
    // 끝나는 자리 뒤에 **이어지지 않는** 줄을 하나 둔다 (줄 번호가 8이 아니다)
    const ov = fakeOverlay(site.offset, [...goodRows(8), [99, 999, 0]])
    const got = creditRows(ov, site)
    expect(got).toHaveLength(8)
    expect(got[0]).toEqual({ at: 0, centered: true })
    expect(got[2]).toEqual({ at: 42, centered: false })
  })

  it('⚠️ 줄 번호가 차례가 아니면 선다 — 한 칸만 밀려도 뱅크의 딴 줄을 띄운다', () => {
    const rows = goodRows(8)
    rows[5] = [7, 105, 0]
    const ov = fakeOverlay(site.offset, [...rows, [99, 999, 0]])
    expect(() => creditRows(ov, site)).toThrow(/5번째 줄 번호가 7이다/)
  })

  it('⚠️ y가 뒤로 가면 선다 — 두루마리는 한 방향으로만 오른다', () => {
    const rows = goodRows(8)
    rows[4] = [4, 10, 0]
    const ov = fakeOverlay(site.offset, [...rows, [99, 999, 0]])
    expect(() => creditRows(ov, site)).toThrow(/앞보다 위다/)
  })

  it('⚠️ 정렬 칸이 0·1이 아니면 선다', () => {
    const rows = goodRows(8)
    rows[3] = [3, 63, 5]
    const ov = fakeOverlay(site.offset, [...rows, [99, 999, 0]])
    expect(() => creditRows(ov, site)).toThrow(/정렬 값이 5이다/)
  })

  // ⚠️ **끊기는 자리까지 봐야 줄 수가 확정된다.** 안 보면 「앞 n줄이 맞더라」만
  // 확인한 것이라, 우리 표의 줄 수가 틀려도 조용히 지나간다
  it('⚠️ 적힌 줄에서 안 끊기면 선다', () => {
    const ov = fakeOverlay(site.offset, goodRows(12))
    expect(() => creditRows(ov, site)).toThrow(/8줄에서 안 끝난다/)
  })

  it('오버레이 밖을 안 읽는다', () => {
    const ov = fakeOverlay(site.offset, goodRows(8)).slice(0, site.offset + 12)
    expect(() => creditRows(ov, site)).toThrow(/오버레이 밖이다/)
  })
})

describe('지문 표', () => {
  it('지역판마다 배치표 자리와 줄 수를 갖는다', () => {
    for (const r of SUPPORTED.releases) {
      const site = creditsLocator(r)
      expect(site.overlay, r.gameCode).toBe(SUPPORTED.creditsOverlay)
      expect(site.offset, r.gameCode).toBeGreaterThan(0)
      expect(site.rows, r.gameCode).toBeGreaterThan(0)
    }
  })

  // ⚠️ **줄 수가 같아지면 「미국 것을 잘라 쓰면 된다」로 되돌아간 것이다**
  it('⚠️ 줄 수가 판마다 다르다 — 237 · 209 · 184', () => {
    const of = (code: string): number =>
      creditsLocator(SUPPORTED.releases.find((r) => r.gameCode === code)!).rows
    expect({ en: of('CPUE'), ko: of('CPUK'), ja: of('CPUJ') })
      .toEqual({ en: 237, ko: 209, ja: 184 })
    expect(of('CPUE')).toBe(CREDIT_ROWS.length)
  })
})

withRom('en', 'ko', 'ja')('진짜 롬 — 세 판의 표를 읽는다', () => {
  it('적어 둔 자리에서 적어 둔 줄이 나오고, 미국판이 디컴프 표와 같다', async () => {
    const got: Record<string, { at: number, centered: boolean }[]> = {}
    for (const release of SUPPORTED.releases) {
      const fs = await openNds(fileSource(romPath(release.locale)!))
      expect(fs, `${release.locale} 롬을 못 열었다`).not.toBeNull()
      const site = creditsLocator(release)
      const overlay = await fs!.overlay(site.overlay)
      expect(overlay, `${release.locale} 오버레이 ${String(site.overlay)}`).not.toBeNull()
      got[release.locale] = creditRows(overlay!, site)
    }

    /**
     * ⚠️ **여기가 이 표 전체의 잣대다.** 미국 롬에서 읽은 237줄이 디컴프의
     * `Unk_ov99_021D4CE4`를 구운 `CREDIT_ROWS`와 **줄마다 같다** — 자리도
     * 구조도 맞다는 뜻이고, 나머지 두 판은 같은 자를 그대로 댄 것이 된다
     */
    expect(got.en).toEqual([...CREDIT_ROWS])

    // 판마다 다른 표라는 것을 수로 못 박는다
    expect(got.ko).toHaveLength(209)
    expect(got.ja).toHaveLength(184)
    expect(got.ko!.at(-1)!.at).toBe(7530)
    expect(got.ja!.at(-1)!.at).toBe(7544)
    // ⚠️ **가운데 정렬만 셋이 같다** — 「정렬은 맞더라」가 「그러니 잘라 써도
    // 된다」가 되지 않게 그 사실을 여기 적어 둔다
    for (const [locale, rows] of Object.entries(got)) {
      expect(rows.flatMap((r, i) => (r.centered ? [i] : [])), locale).toEqual([0, 1])
    }
    // 그런데 자리는 두 번째 줄부터 갈린다
    expect(got.ko![2]!.at).not.toBe(CREDIT_ROWS[2]!.at)
    expect(got.ja![2]!.at).not.toBe(CREDIT_ROWS[2]!.at)
  }, 60_000)
})
