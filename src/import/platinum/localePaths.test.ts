// 지역판마다 다른 자리 — 세 롬에 직접 대조한다
//
// ⚠️ **이 시험이 없어서 한국판이 뚫려 있었다.** `box.narc` · `poketch.narc` ·
// `fld_trade.narc` 셋이 미국판 자리로 박혀 있었고, 그 세 변환기에는 시험이
// 하나도 없었다. 그래서 여기서 두 가지를 잰다:
//
//   ① 표 서른두 줄이 세 롬에서 **전부 열리는가**
//   ② 수입기가 코드에 적어 둔 롬 자리가 세 판에서 **전부 열리는가**
//
// ②가 핵심이다. 앞으로 누가 옮겨진 파일을 하나 더 읽기 시작하면, 그 사람이
// 미국판만 보고 자리를 적어도 여기서 걸린다.
//
// ⚠️ **읽은 값을 밖으로 안 낸다.** 실패 문구에는 자리와 개수만 적는다
// (COPYRIGHT.md §6).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds, type NdsFileSystem } from './nds'
import { localePath, movedFiles } from './localePaths'
import { SUPPORTED, type Release } from './validate'
import { convertNpcTrades } from './npcTrades'
import { convertBoxWallpapers } from './boxWallpapers'
import { convertPoketchMap } from './poketchMap'
import { withRom, romPath, fileSource } from '../../data/romData.testkit'

const LOCALES = ['en', 'ko', 'ja'] as const
type Loc = typeof LOCALES[number]

const release = (locale: string): Release => {
  const got = SUPPORTED.releases.find((r) => r.locale === locale)
  if (!got) throw new Error(`${locale} 판이 supported.json에 없다`)
  return got
}

describe('지역판 자리표', () => {
  it('서른두 줄이고, 한국판은 전부 /resource/kor/ 밑이다', () => {
    const rows = movedFiles()
    expect(rows.length).toBe(32)
    expect(rows.filter((r) => !r.ko.startsWith('/resource/kor/'))).toEqual([])
    // 미국판이 옮긴 것은 일곱뿐이고 나머지는 일본판 자리 그대로다
    expect(rows.filter((r) => r.en !== r.ja).length).toBe(7)
  })

  it('어느 판의 자리를 물어도 같은 줄로 간다', () => {
    // ⚠️ 이것이 규약의 핵심이다 — 미국판 덤프를 보고 자리를 적은 사람도
    // 한국판에서 살아야 한다
    for (const row of movedFiles()) {
      for (const from of [row.ja, row.en, row.ko]) {
        expect(localePath(from, 'ja')).toBe(row.ja)
        expect(localePath(from, 'en')).toBe(row.en)
        expect(localePath(from, 'ko')).toBe(row.ko)
      }
    }
  })

  it('표에 없는 자리는 건드리지 않는다', () => {
    const same = '/poketool/personal/pl_personal.narc'
    for (const loc of LOCALES) expect(localePath(same, loc)).toBe(same)
  })

  it('셋은 실제로 갈린다', () => {
    expect(localePath('/graphic/box.narc', 'ko')).toBe('/resource/kor/box/box.narc')
    expect(localePath('/graphic/poketch.narc', 'ko')).toBe('/resource/kor/poketch/poketch.narc')
    expect(localePath('/fielddata/pokemon_trade/fld_trade.narc', 'ko'))
      .toBe('/resource/kor/pokemon_trade/fld_trade.narc')
  })
})

/**
 * 수입기가 코드에 적어 둔 롬 자리 전부.
 *
 * 소스에서 긁어 온다 — 목록을 손으로 또 적으면 그 목록만 최신이 된다
 */
function pathsInSource(): readonly string[] {
  const dir = __dirname
  const out = new Set<string>()
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
    // 자리표 자신은 뺀다 — 거기 적힌 것은 셋 다 맞는 자리다
    if (name === 'localePaths.ts') continue
    const src = readFileSync(resolve(dir, name), 'utf8')
    for (const m of src.matchAll(/'(\/[a-z0-9_/]+\.(?:narc|bin|dat|sdat))'/g)) out.add(m[1]!)
  }
  return [...out].sort()
}

withRom(...LOCALES)('세 롬에 대조한다', () => {
  const opened = new Map<Loc, NdsFileSystem>()
  const open = async (loc: Loc): Promise<NdsFileSystem> => {
    const had = opened.get(loc)
    if (had) return had
    const fs = await openNds(fileSource(romPath(loc)!))
    if (!fs) throw new Error(`${loc} 롬을 못 열었다`)
    opened.set(loc, fs)
    return fs
  }

  it('표 서른두 줄이 세 판에서 다 열린다', async () => {
    for (const loc of LOCALES) {
      const fs = await open(loc)
      const missing: string[] = []
      for (const row of movedFiles()) {
        const at = localePath(row.ja, loc)
        if (!fs.files.has(at)) missing.push(at)
      }
      expect(missing, `${loc}: ${String(missing.length)}자리가 없다`).toEqual([])
    }
  })

  it('⚠️ 수입기가 읽는 자리가 세 판에서 다 열린다', async () => {
    const paths = pathsInSource()
    // 긁기가 망가지면 0개가 되고, 그러면 이 시험이 조용히 아무것도 안 잰다
    expect(paths.length).toBeGreaterThan(30)
    for (const loc of LOCALES) {
      const fs = await open(loc)
      const missing = paths.filter((p) => !fs.files.has(localePath(p, loc)))
      expect(missing, `${loc}: ${missing.join(' · ')}`).toEqual([])
    }
  })

  // ⚠️ **자리만 맞는 것으로는 모자란다.** 한국판 narc이 칸 차례까지 같아야
  // 우리 파서가 통한다 — 실제로 변환을 돌려서 확인한다
  it('한국판에서 죽던 셋이 세 판에서 다 변환된다', async () => {
    for (const loc of LOCALES) {
      const ctx = { fs: await open(loc), locale: loc, release: release(loc) }

      const trades = await convertNpcTrades(ctx)
      const trade = JSON.parse(new TextDecoder().decode(trades.get('data/npcTrades.json')!)) as {
        trades: { species: number }[]
      }
      expect(trade.trades.length, `${loc}: 교환 수`).toBe(4)
      expect(trade.trades.filter((t) => t.species <= 0), `${loc}: 빈 교환`).toEqual([])

      const box = await convertBoxWallpapers(ctx)
      const boxMeta = JSON.parse(new TextDecoder().decode(box.get('data/boxWallpapers.json')!)) as {
        count: number
      }
      expect(boxMeta.count, `${loc}: 벽지 수`).toBe(32)
      expect(box.get('data/boxWallpapers.png')!.length, `${loc}: 벽지 그림`).toBeGreaterThan(1000)

      const poketch = await convertPoketchMap(ctx)
      const poketchMeta = JSON.parse(
        new TextDecoder().decode(poketch.get('data/poketchMap.json')!),
      ) as { shades: string[][] }
      expect(poketchMeta.shades.length, `${loc}: 액정 색 수`).toBe(8)
      expect(poketch.get('data/poketchMap.png')!.length, `${loc}: 지도 그림`).toBeGreaterThan(1000)
    }
  }, 120_000)
})
