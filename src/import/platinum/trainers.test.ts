// 상금 배수표의 **자리** (DATA.md §2.9)
//
// ⚠️ **이 시험이 있는 이유가 하나다.** 자리를 미국판 하나로 박아 두었더니
// 한국판에서 32바이트 앞을 읽었고, 그때 있던 검사 둘이 **둘 다 통과했다** —
// 밀린 창의 앞이 0 패딩이라 「앞 두 칸이 0」이 참이고, 창 안에 포인터 한 워드가
// 들어와 「오버레이 안에서 유일」까지 참이 된다. 105칸 중 98칸이 조용히 틀렸다.
//
// 그래서 두 갈래로 잰다:
//
//   **지어낸 오버레이** — 밀린 자리를 실제로 만들어 보고, 새 검사가 그것을
//                         잡는지 본다. 롬이 없는 기계에서도 돈다
//   **진짜 롬 셋**       — 세 판의 표가 **바이트로 같은지**. 자리만 옮겨졌다는
//                         것이 이 시험의 주장이고, 여기서 굳는다
import { describe, expect, it } from 'vitest'
import { longestZeroRun, prizeTable } from './trainers'
import { prizeLocator, SUPPORTED } from './validate'
import { openNds } from './nds'
import { fileSource, romPath, withRom } from '../../data/romData.testkit'

const COUNT = SUPPORTED.prizeCount

/**
 * 참 표를 닮은 105바이트. 앞 두 칸이 0이고 **끝 여섯 칸이 0**이다 —
 * 진짜 표에서 0이 제일 길게 이어지는 자리가 거기다 (실측 6칸)
 */
function fakeTable(): Uint8Array {
  const t = new Uint8Array(COUNT)
  for (let i = 2; i < COUNT - 6; i++) t[i] = 4 + (i % 40)
  return t
}

/**
 * 표 앞에 **코드와 표 사이의 0 패딩**과 포인터 한 워드를 둔 오버레이.
 * 실제 한국판 오버레이 #16의 0x359e0~0x35a00이 이 모양이다
 */
function fakeOverlay(tableAt: number): Uint8Array {
  const ov = new Uint8Array(tableAt + COUNT + 16)
  ov.set([0xf5, 0xdf, 0x23, 0x02], tableAt - 0x1c)
  ov.set(fakeTable(), tableAt)
  return ov
}

describe('0이 이어지는 길이', () => {
  it('없으면 0, 끝까지면 길이 그대로다', () => {
    expect(longestZeroRun([1, 2, 3])).toBe(0)
    expect(longestZeroRun([0, 0, 0])).toBe(3)
    expect(longestZeroRun([0, 1, 0, 0, 1])).toBe(2)
    expect(longestZeroRun([])).toBe(0)
  })
})

describe('상금 배수표를 집는 자리', () => {
  const at = 0x40
  const site = { overlay: 16, offset: at, count: COUNT }

  it('제자리면 105칸을 그대로 준다', () => {
    expect(prizeTable(fakeOverlay(at), site)).toEqual([...fakeTable()])
  })

  it('⚠️ 32바이트 밀린 자리를 **앞 두 칸과 유일성 검사는 통과시킨다**', () => {
    // 이 시험은 새 검사를 자랑하려는 것이 아니라 **옛 검사가 왜 못 잡았는지**를
    // 남겨 두는 것이다. 여기가 초록이 아니면 위 머리말이 거짓말이 된다
    const ov = fakeOverlay(at)
    const shifted = ov.subarray(at - 0x20, at - 0x20 + COUNT)
    expect(shifted[0]).toBe(0)
    expect(shifted[1]).toBe(0)
    let hits = 0
    for (let i = 0; i + COUNT <= ov.length; i++) {
      let k = 0
      while (k < COUNT && ov[i + k] === shifted[k]) k++
      if (k === COUNT) hits++
    }
    expect(hits).toBe(1)
  })

  it('그런데도 0 이음 검사가 잡는다', () => {
    expect(() => prizeTable(fakeOverlay(at), { ...site, offset: at - 0x20 }))
      .toThrow(/0이 \d+칸 이어진다/)
  })

  it('오버레이 밖으로 나가면 던진다', () => {
    expect(() => prizeTable(fakeOverlay(at), { ...site, offset: at + 100 }))
      .toThrow(/오버레이 밖/)
  })

  it('앞 두 칸이 0이 아니면 던진다', () => {
    const ov = fakeOverlay(at)
    ov[at] = 7
    expect(() => prizeTable(ov, site)).toThrow(/앞 두 칸이 0이 아니다/)
  })
})

describe('지문 표', () => {
  it('지역판마다 상금표 자리와 쓰인 크기를 갖는다', () => {
    for (const r of SUPPORTED.releases) {
      const site = prizeLocator(r)
      expect(site.overlay, r.gameCode).toBe(SUPPORTED.prizeOverlay)
      expect(site.count, r.gameCode).toBe(COUNT)
      expect(site.offset, r.gameCode).toBeGreaterThan(0)
      // 자르지 않은 카트리지 이미지보다 클 수는 없다
      expect(r.usedBytes, r.gameCode).toBeGreaterThan(0)
      expect(r.usedBytes, r.gameCode).toBeLessThanOrEqual(SUPPORTED.sizeBytes)
    }
  })

  it('⚠️ 한국판 자리가 나머지 둘과 다르다 — 같아지면 이 결함이 되돌아온 것이다', () => {
    const of = (code: string): number =>
      prizeLocator(SUPPORTED.releases.find((r) => r.gameCode === code)!).offset
    expect(of('CPUE')).toBe(of('CPUJ'))
    expect(of('CPUK')).toBe(of('CPUE') + 0x20)
  })
})

withRom('en', 'ko', 'ja')('진짜 롬 — 세 판의 표가 바이트로 같다', () => {
  it('자리는 다르고 알맹이는 같다', async () => {
    const tables: Record<string, number[]> = {}
    for (const release of SUPPORTED.releases) {
      const fs = await openNds(fileSource(romPath(release.locale)!))
      expect(fs, `${release.locale} 롬을 못 열었다`).not.toBeNull()
      const site = prizeLocator(release)
      const overlay = await fs!.overlay(site.overlay)
      expect(overlay, `${release.locale} 오버레이 ${String(site.overlay)}`).not.toBeNull()
      tables[release.locale] = prizeTable(overlay!, site)
    }
    expect(tables.ko).toEqual(tables.en)
    expect(tables.ja).toEqual(tables.en)
    expect(tables.en).toHaveLength(COUNT)
  }, 60_000)
})
