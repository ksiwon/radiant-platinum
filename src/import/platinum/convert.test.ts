// 브라우저 변환 ↔ 노드 산출물 parity (IMPORT.md §6 끝 · §9 · PLAN §4.1)
//
// ⚠️ **이 시험이 전환의 정의다.** "브라우저에서도 돌아간다"로는 부족하다 —
// 브라우저가 만든 것이 개발판이 쓰던 것과 **같아야** 두 경로가 하나의 게임이다.
// 다르면 개발판에서 초록인 시험 1,400개가 공개판을 아무것도 보증하지 않는다.
//
// 그래서 같은 롬에서 두 경로를 돌려 바이트로 맞춘다:
//
//   ① 노드   `raw` → `tools/extract/moves.js` → `public/data/moves.json`
//   ② 브라우저 같은 롬 → `src/import/platinum/convert.ts` → 바이트
import { describe, it, expect } from 'vitest'
import { readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds, type ByteSource } from './nds'
import { Cancelled, GROUPS, groupsBlocked, groupsReady, parseMove } from './convert'
import { martLocator, SUPPORTED } from './validate'
import { REQUIRED_PLATINUM_GROUPS } from '../install/required'
import { MartError, readMarts } from './marts'
import { DATA, withRom, romPath } from '../../data/romData.testkit'

/** 변환기가 요구하는 지역판. 시험은 실측된 롬 하나로 돈다 */
const EN = SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!

function fileSource(path: string): ByteSource {
  const size = statSync(path).size
  return {
    size,
    slice(start, end) {
      const want = Math.max(0, Math.min(end, size) - start)
      const out = Buffer.alloc(want)
      const fd = openSync(path, 'r')
      try { readSync(fd, out, 0, want, start) } finally { closeSync(fd) }
      return Promise.resolve(new Uint8Array(out.buffer, out.byteOffset, out.byteLength))
    },
  }
}

describe('그룹 표', () => {
  it('옮긴 것과 안 옮긴 것이 표에 다 있다', () => {
    // ⚠️ 안 옮긴 것을 표에서 빼면 "다 됐다"로 보인다. 이유까지 적혀 있어야 한다
    for (const g of groupsBlocked()) {
      expect(g.blockedBy, g.name).toBeTruthy()
      expect(g.blockedBy!.length, g.name).toBeGreaterThan(20)
    }
    expect(groupsReady().length).toBeGreaterThan(0)
    expect(groupsReady().length + groupsBlocked().length).toBe(GROUPS.length)
    // Platinum 쪽 필수 그룹 아홉이 전부 변환기를 갖고 있다. **이 목록이 줄면 선다**
    const ready = new Set(groupsReady().map((g) => g.name))
    for (const name of REQUIRED_PLATINUM_GROUPS) expect(ready.has(name), name).toBe(true)
  })

  it('그룹마다 무엇을 만드는지 적혀 있다 — 저널이 그걸로 재개를 판단한다', () => {
    for (const g of GROUPS) expect(g.outputs.length, g.name).toBeGreaterThan(0)
  })

  it('이름이 겹치지 않는다', () => {
    const names = GROUPS.map((g) => g.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('기술 한 줄', () => {
  const bytes = (over: Partial<Record<number, number>> = {}) => {
    const b = new Uint8Array(16)
    for (const [at, v] of Object.entries(over)) b[Number(at)] = v!
    return b
  }

  it('꼬리 2B가 0이 아니면 세운다 — 배치 가정이 깨진 것이다', () => {
    expect(() => parseMove(bytes({ 14: 1 }), 0)).toThrow(/꼬리/)
  })

  it('분류가 범위를 벗어나면 세운다', () => {
    expect(() => parseMove(bytes({ 2: 3 }), 0)).toThrow(/분류/)
  })

  it('명중 0은 필중이다 — 471개 중 127개가 그렇다', () => {
    expect(parseMove(bytes({ 5: 0 }), 0).alwaysHits).toBe(true)
    expect(parseMove(bytes({ 5: 100 }), 0).alwaysHits).toBe(false)
  })

  it('우선도는 부호가 있다 — 울부짖기가 −6이다', () => {
    expect(parseMove(bytes({ 10: 0xfa }), 0).priority).toBe(-6)
  })
})

withRom('en')('브라우저 변환 — 진짜 롬', () => {
  const open = async () => {
    const fs = await openNds(fileSource(romPath('en')!))
    if (!fs) throw new Error('롬을 못 열었다')
    return fs
  }

  it('기술 471개를 만든다', async () => {
    const group = GROUPS.find((g) => g.name === 'moves')!
    const seen: number[] = []
    const out = await group.convert!({
      fs: await open(),
      locale: 'en',
      release: EN,
      onProgress: (done) => seen.push(done),
    })

    const json = JSON.parse(new TextDecoder().decode(out.get('data/moves.json')!)) as {
      count: number
      moves: { id: number; power: number; priority: number }[]
    }
    expect(json.count).toBe(471)
    expect(json.moves).toHaveLength(471)
    // 진행이 실제로 여러 번 보고된다 — 한 번이면 화면이 멈춘 것처럼 보인다
    expect(seen.length).toBeGreaterThan(5)
  })

  it('⚠️ 취소하면 그 자리에서 멈춘다', async () => {
    const group = GROUPS.find((g) => g.name === 'moves')!
    const signal = { aborted: false }
    await expect(group.convert!({
      fs: await open(),
      locale: 'en',
      release: EN,
      signal,
      // 첫 보고에서 끊는다. 취소를 늦게 보면 몇 초를 더 돈다
      onProgress: () => { signal.aborted = true },
    })).rejects.toBeInstanceOf(Cancelled)
  })

  it('알려진 기술 몇 개가 원작 값이다', async () => {
    const group = GROUPS.find((g) => g.name === 'moves')!
    const out = await group.convert!({ fs: await open(), locale: 'en', release: EN })
    const json = JSON.parse(new TextDecoder().decode(out.get('data/moves.json')!)) as {
      moves: { id: number; power: number; priority: number; pp: number; contact: boolean }[]
    }
    // 우선도 핀 (DATA.md §2.5) — 전광석화 +1 · 방어 +3 · 울부짖기 −6.
    // ⚠️ 45는 「울음소리」(0)고 「울부짖기」는 46이다. 처음에 45로 적었다가
    // 0이 나왔다 — 표가 아니라 내가 틀린 것이었다
    expect(json.moves[98]!.priority).toBe(1)
    expect(json.moves[182]!.priority).toBe(3)
    expect(json.moves[46]!.priority).toBe(-6)
    // 몸통박치기: 위력 35 · PP 35 · 접촉
    expect(json.moves[33]!.power).toBe(35)
    expect(json.moves[33]!.pp).toBe(35)
    expect(json.moves[33]!.contact).toBe(true)
  })
})

withRom('en')('parity — 노드 산출물과 바이트로 같다', () => {
  const nodeFile = resolve(DATA, 'moves.json')

  it('⚠️ 같은 롬에서 두 경로가 같은 바이트를 낸다', async () => {
    let expected: string
    try {
      expected = readFileSync(nodeFile, 'utf8')
    } catch {
      // 노드 산출물이 없으면 대조할 것이 없다. `pnpm extract:moves`가 만든다
      expect.unreachable('public/data/moves.json이 없다 — pnpm extract:moves')
      return
    }

    const fs = await openNds(fileSource(romPath('en')!))
    const group = GROUPS.find((g) => g.name === 'moves')!
    const out = await group.convert!({ fs: fs!, locale: 'en', release: EN })
    const actual = new TextDecoder().decode(out.get('data/moves.json')!)

    // 바이트로 같다. 키 순서와 들여쓰기까지 — 직렬화가 갈리면 두 경로가 만든
    // 파일의 해시가 달라지고, 설치 저널이 그걸 "바뀐 것"으로 읽는다
    expect(actual.length).toBe(expected.length)
    expect(actual).toBe(expected)
  })
})

// ── marts ────────────────────────────────────────────────────────────────────
//
// ⚠️ **"상점 재고는 롬에 없다"가 틀렸다는 것을 재는 시험이다.** 노드 추출기가
// 디컴프 헤더(`include/data/mart_items.h`)를 읽고 있어서 롬에 없는 줄 알았는데,
// 표는 ARM9 안에 그대로 있다. 여기서 지역판 셋을 다 열어 `public/data/marts.json`과
// 맞춘다 — 하나라도 어긋나면 `supported.json`의 자리가 틀린 것이다.

withRom('en', 'ko', 'ja')('marts — ARM9에서 읽는다', () => {
  const nodeFile = resolve(DATA, 'marts.json')

  const openAt = async (locale: 'en' | 'ko' | 'ja') => {
    const fs = await openNds(fileSource(romPath(locale)!))
    if (!fs) throw new Error(`${locale} 롬을 못 열었다`)
    return fs
  }

  it('헤더에서 ARM9 자리를 읽는다 — 0x4000을 박아 두지 않는다', async () => {
    for (const locale of ['en', 'ko', 'ja'] as const) {
      const fs = await openAt(locale)
      // 실측: 셋 다 0x4000 / 0x02000000이지만 값이 아니라 **읽는다는 것**이 요점이다
      expect(fs.header.arm9RomOffset, locale).toBe(0x4000)
      expect(fs.header.arm9RamAddress, locale).toBe(0x02000000)
      expect(fs.header.arm9Size, locale).toBeGreaterThan(0x100000)
    }
  })

  it('⚠️ ARM9 범위 밖은 null이다 — 잘린 롬에서 쓰레기를 표로 읽지 않는다', async () => {
    const fs = await openAt('en')
    expect(await fs.arm9(fs.header.arm9Size, 4)).toBeNull()
    expect(await fs.arm9(-4, 4)).toBeNull()
    expect(fs.arm9At(0x01000000)).toBeNull()   // ARM9 아래
    expect(fs.arm9At(0x03000000)).toBeNull()   // ARM9 위
    expect(fs.arm9At(0x02000000)).toBe(0)      // 딱 시작
  })

  it('⚠️ 지역판 셋 다 노드 산출물과 같다', async () => {
    let expected: string
    try {
      expected = readFileSync(nodeFile, 'utf8')
    } catch {
      expect.unreachable('public/data/marts.json이 없다 — pnpm extract:marts')
      return
    }
    const group = GROUPS.find((g) => g.name === 'marts')!
    for (const locale of ['en', 'ko', 'ja'] as const) {
      const release = SUPPORTED.releases.find((r) => r.locale === locale)!
      const out = await group.convert!({ fs: await openAt(locale), locale, release })
      const actual = new TextDecoder().decode(out.get('data/marts.json')!)
      // 세 롬이 **같은 재고**를 낸다. 상점은 지역판에 안 따라간다
      expect(actual, locale).toBe(expected)
    }
  })

  it('⚠️ 표의 두 오프셋 차가 롬의 arm9RomOffset과 맞는다', async () => {
    // 처음 받은 여섯 값은 파일 절대 오프셋인데 "ARM9 상대"로 적혀 왔었다.
    // 이름 하나로 0x4000이 갈리는 자리라 **두 값을 다 적고 차를 대조한다**
    for (const locale of ['en', 'ko', 'ja'] as const) {
      const fs = await openAt(locale)
      const release = SUPPORTED.releases.find((r) => r.locale === locale)!
      const at = martLocator(release, fs.header.arm9RomOffset)
      expect(at.common, locale).toBe(Number(release.marts.common.arm9RelativeOffset))
      expect(Number(release.marts.common.romOffset) - at.common, locale)
        .toBe(fs.header.arm9RomOffset)
      // 대조에 이빨이 있는가 — 한 바이트만 틀린 헤더를 주면 던져야 한다
      expect(() => martLocator(release, fs.header.arm9RomOffset + 1)).toThrow(/arm9RomOffset/)
    }
  })

  it('자리를 한 바이트만 밀어도 걸린다 — 검사에 이빨이 있다', async () => {
    const fs = await openAt('en')
    const at = martLocator(SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!)
    // 4바이트 밀면 첫 줄이 사라지고 마지막 줄에 쓰레기가 붙는다
    await expect(readMarts(fs, { ...at, common: at.common + 4 })).rejects.toThrow(MartError)
  })

  it('포인터 표를 밀면 ARM9 밖을 가리킨다', async () => {
    const fs = await openAt('en')
    const at = martLocator(SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!)
    await expect(readMarts(fs, { ...at, specialty: at.specialty + 8 })).rejects.toThrow(MartError)
  })

  it('아이템 표 크기를 주면 범위 밖 번호를 잡는다', async () => {
    const fs = await openAt('en')
    const at = martLocator(SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!)
    // 실측 446개. 100으로 주면 백화점 재고(410번 등)가 걸려야 한다
    await expect(readMarts(fs, at, 100)).rejects.toThrow(/아이템 표/)
    // 제대로 주면 통과한다
    await expect(readMarts(fs, at, 446)).resolves.toBeTruthy()
  })
})
