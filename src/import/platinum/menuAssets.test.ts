// 메뉴 개편이 쓰는 새 그림 · 표의 두 굽는 쪽 맞대기 (`tools/extract/*.js` ↔ `src/import/platinum/*.ts`)
//
// ⚠️ **개발 서버는 노드 쪽 산출물을 읽고 설치본은 브라우저 쪽을 읽는다.** 한쪽에만 있는 그룹은 설치본에서 통째로 없다.
// 같은 롬으로 둘을 돌려 그림은 픽셀로, 표는 바이트로 맞댄다. 그리고 칸 번호 · 차례는 **디컴프 원본**과 대조한다
// (`raw/decomp` — 이 기계에 없으면 그 시험만 빠진다).
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { openNds } from './nds'
import { GROUPS } from './convert'
import { CLASSES, TYPES } from './typeIcons'
import { SUPPORTED } from './validate'
import { DATA, decodePngBytes, fileSource, romPath, withLocal, withRom } from '../../data/romData.testkit'

const CODE: Record<string, string> = { en: 'CPUE', ko: 'CPUK', ja: 'CPUJ' }
const sources = createRequire(import.meta.url)('../../../tools/raw/sources.cjs') as {
  sourceDir(key: string): string | null
}
const DECOMP = sources.sourceDir('references.decomp')

/** 그룹 하나를 그 지역판 롬으로 돌린다 */
async function run(group: string, locale: string): Promise<Map<string, Uint8Array>> {
  const fs = await openNds(fileSource(romPath(locale)!))
  if (!fs) throw new Error('롬을 못 열었다')
  const spec = GROUPS.find((g) => g.name === group)
  if (!spec?.convert) throw new Error(`${group} 그룹이 없다`)
  const release = SUPPORTED.releases.find((r) => r.gameCode === CODE[locale])!
  return spec.convert({ fs, locale, release })
}

/** 개발 산출물과 맞댄다 — PNG는 픽셀로, 나머지는 바이트로 */
function expectSame(path: string, bytes: Uint8Array): void {
  const dev = new Uint8Array(readFileSync(resolve(DATA, path.replace(/^data\//, ''))))
  if (path.endsWith('.png')) {
    const a = decodePngBytes(dev), b = decodePngBytes(bytes)
    expect([b.width, b.height], path).toEqual([a.width, a.height])
    expect(Buffer.from(b.pixels).equals(Buffer.from(a.pixels)), `${path} 픽셀`).toBe(true)
  } else {
    expect(new TextDecoder().decode(bytes), path).toBe(new TextDecoder().decode(dev))
  }
}

describe('그룹 표', () => {
  it('새 그룹 넷이 변환기와 함께 붙어 있다', () => {
    for (const name of ['typeIcons', 'startMenuIcons', 'dexShapes', 'dexHeightWeight']) {
      expect(GROUPS.find((g) => g.name === name)?.convert, name).toBeTypeOf('function')
    }
  })
})

withRom('en', 'ko', 'ja')('타입 · 분류 그림', () => {
  it('지역판마다 한 장 · 분류는 한 장이고 개발 산출물과 픽셀까지 같다', async () => {
    for (const locale of ['en', 'ko', 'ja']) {
      const out = await run('typeIcons', locale)
      expect([...out.keys()].sort(), locale).toEqual(['data/moveClass.png', `data/typeIcons.${locale}.png`])
      for (const [path, bytes] of out) expectSame(path, bytes)
    }
  }, 120_000)

  it('타입 18칸 · 분류 3칸 — 32×16을 가로로 잇는다', async () => {
    const out = await run('typeIcons', 'ko')
    const types = decodePngBytes(out.get('data/typeIcons.ko.png')!)
    expect([types.width, types.height]).toEqual([32 * 18, 16])
    const cls = decodePngBytes(out.get('data/moveClass.png')!)
    expect([cls.width, cls.height]).toEqual([32 * 3, 16])
    // 칸마다 칠한 픽셀이 있다
    for (let i = 0; i < 18; i++) {
      let solid = 0
      for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) if (types.pixels[(y * types.width + i * 32 + x) * 4 + 3] !== 0) solid++
      expect(solid, `타입 칸 ${String(i)}`).toBeGreaterThan(200)
    }
  }, 60_000)

  it('한국판 글자 그림은 미국판과 다르고 분류 그림은 같다', async () => {
    const [en, ko] = await Promise.all([run('typeIcons', 'en'), run('typeIcons', 'ko')])
    expect(Buffer.from(ko.get('data/typeIcons.ko.png')!).equals(Buffer.from(en.get('data/typeIcons.en.png')!))).toBe(false)
    const a = decodePngBytes(en.get('data/moveClass.png')!), b = decodePngBytes(ko.get('data/moveClass.png')!)
    expect(Buffer.from(a.pixels).equals(Buffer.from(b.pixels))).toBe(true)
  }, 60_000)
})

withLocal(
  '타입 칸 차례 — 디컴프', DECOMP && resolve(DECOMP, 'src/type_icon.c'), DECOMP && resolve(DECOMP, 'res/graphics/battle/sprites.order'),
  DECOMP && resolve(DECOMP, 'generated/pokemon_types.txt'), DECOMP && resolve(DECOMP, 'generated/move_classes.txt'),
)('타입 · 분류 칸 표는 디컴프와 같다', () => {
  const read = (p: string): string => readFileSync(resolve(DECOMP!, p), 'utf8')
  const order = read('res/graphics/battle/sprites.order').split(/\r?\n/)
  const member = (name: string): number => order.indexOf(name)
  const c = read('src/type_icon.c')

  /** `[TYPE_NORMAL] = x,` 줄들을 번호 차례로 */
  const table = (name: string, body: string): Map<string, string> => {
    const start = c.indexOf(`${name}[] = {`)
    const end = c.indexOf('};', start)
    const out = new Map<string, string>()
    for (const m of c.slice(start, end).matchAll(/\[([A-Z_+ ]+)\]\s*=\s*([\w]+)/g)) out.set(m[1]!.trim(), m[2]!)
    expect(out.size, body).toBeGreaterThan(0)
    return out
  }

  it('타입 번호 차례 · 글자 그림 칸 · 팔레트 줄', () => {
    const types = read('generated/pokemon_types.txt').split(/\r?\n/).filter((l) => l.startsWith('TYPE_'))
    expect(types).toHaveLength(TYPES.length)
    const icon = table('sMoveTypeIconIndex', '타입 그림')
    const row = table('sMoveTypeIconPaletteIndex', '팔레트 줄')
    types.forEach((t, i) => {
      const [name, at, pal] = TYPES[i]!
      expect(icon.get(t), t).toBe(`type_icons_${name}_NCGR_lz`)
      expect(member(`type_icons/${name}.NCGR.lz`), t).toBe(at)
      expect(Number(row.get(t)), t).toBe(pal)
    })
    expect(member('type_icons/shared.NCLR')).toBe(74)
    expect(member('type_icons/cell.NCER.lz')).toBe(242)
  })

  it('분류 번호 차례 · 그림 칸 · 팔레트 줄', () => {
    const classes = read('generated/move_classes.txt').split(/\r?\n/).filter((l) => l.startsWith('CLASS_'))
    expect(classes).toHaveLength(CLASSES.length)
    const icon = table('sMoveCategoryIconIndex', '분류 그림')
    const row = table('sMoveCategoryIconPaletteIndex', '분류 팔레트 줄')
    classes.forEach((k, i) => {
      const [name, at, pal] = CLASSES[i]!
      expect(icon.get(k), k).toBe(`type_icons_${name}_NCGR_lz`)
      expect(member(`type_icons/${name}.NCGR.lz`), k).toBe(at)
      expect(Number(row.get(k)), k).toBe(pal)
    })
  })
})

withRom('en', 'ko', 'ja')('시작 메뉴 아이콘', () => {
  it('지역판마다 한 장 · 움직임 표는 한 벌이고 개발 산출물과 같다', async () => {
    for (const locale of ['en', 'ko', 'ja']) {
      const out = await run('startMenuIcons', locale)
      expect([...out.keys()].sort(), locale).toEqual([`data/startMenuIcons.${locale}.png`, 'data/startMenuIcons.json'].sort())
      for (const [path, bytes] of out) expectSame(path, bytes)
    }
  }, 120_000)

  it('64×329 — 왼쪽 컬러 오른쪽 회색, 칸 간격 33 · 열 칸 · 회색은 채도가 없다', async () => {
    const out = await run('startMenuIcons', 'en')
    const png = decodePngBytes(out.get('data/startMenuIcons.en.png')!)
    expect([png.width, png.height]).toEqual([64, 329])
    let colored = 0
    for (let i = 0; i < 10; i++) {
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const at = ((i * 33 + y) * 64 + x) * 4, g = ((i * 33 + y) * 64 + 32 + x) * 4
          // 컬러 쪽과 회색 쪽은 같은 모양이다 (알파가 같다)
          expect(png.pixels[at + 3], `칸 ${String(i)}`).toBe(png.pixels[g + 3])
          if (png.pixels[g + 3] !== 0) {
            // 회색 팔레트는 R=G=B에 가깝다 (롬 0행 — 마지막 두 색이 푸른 기가 조금 돈다)
            expect(Math.abs(png.pixels[g]! - png.pixels[g + 2]!), `칸 ${String(i)}`).toBeLessThanOrEqual(30)
            if (Math.abs(png.pixels[at]! - png.pixels[at + 2]!) > 60) colored++
          }
        }
      }
      // 칸 사이 한 줄은 비어 있다
      if (i < 9) for (let x = 0; x < 64; x++) expect(png.pixels[((i * 33 + 32) * 64 + x) * 4 + 3]).toBe(0)
    }
    expect(colored).toBeGreaterThan(500)
  }, 60_000)

  it('움직임 — 부풀기 11프레임 한 번 · 흔들기 24프레임 되풀이', async () => {
    const out = await run('startMenuIcons', 'en')
    const meta = JSON.parse(new TextDecoder().decode(out.get('data/startMenuIcons.json')!)) as {
      order: string[]
      swell: { once: boolean, frames: number[][] }
      wiggle: { loop: boolean, frames: number[][] }
    }
    expect(meta.order).toHaveLength(10)
    expect(meta.order[9]).toBe('bagFemale')
    expect(meta.swell.once).toBe(true)
    expect(meta.swell.frames.reduce((n, f) => n + f[0]!, 0)).toBe(11)
    expect(meta.wiggle.loop).toBe(true)
    expect(meta.wiggle.frames.reduce((n, f) => n + f[0]!, 0)).toBe(24)
    expect(Math.max(...meta.swell.frames.map((f) => f[1]!))).toBe(1.3)
  }, 60_000)
})

withRom('en', 'ko', 'ja')('도감 몸 모양 · 키와 몸무게', () => {
  it('몸 모양 14칸이 세 롬에서 같고 개발 산출물과 같다', async () => {
    const ref = await run('dexShapes', 'en')
    for (const locale of ['en', 'ko', 'ja']) {
      const out = await run('dexShapes', locale)
      for (const [path, bytes] of out) expectSame(path, bytes)
      const a = decodePngBytes(ref.get('data/dexShapes.png')!), b = decodePngBytes(out.get('data/dexShapes.png')!)
      expect(Buffer.from(a.pixels).equals(Buffer.from(b.pixels)), locale).toBe(true)
    }
    const png = decodePngBytes(ref.get('data/dexShapes.png')!)
    expect([png.width, png.height]).toEqual([32 * 14, 32])
  }, 120_000)

  it('키 · 몸무게 표가 세 롬에서 같고 개발 산출물과 바이트까지 같다', async () => {
    for (const locale of ['en', 'ko', 'ja']) {
      const out = await run('dexHeightWeight', locale)
      for (const [path, bytes] of out) expectSame(path, bytes)
    }
  }, 120_000)

  it('이상해씨 0.7m · 6.9kg, 기라티나는 오리진이 기본 표고 어나더는 따로다', async () => {
    const out = await run('dexHeightWeight', 'en')
    const t = JSON.parse(new TextDecoder().decode(out.get('data/dexHeightWeight.json')!)) as {
      count: number, height: number[], weight: number[]
      male: { trainerScale: number[], pokemonScale: number[], trainerPos: number[], pokemonPos: number[] }
      giratinaAltered: { height: number, weight: number }
    }
    expect(t.count).toBe(494)
    expect([t.height[1], t.weight[1]]).toEqual([7, 69])
    expect([t.height[487], t.weight[487]]).toEqual([69, 6500])
    expect(t.giratinaAltered).toMatchObject({ height: 45, weight: 7500 })
    // 배율 256이 1배다 — 이상해씨 포켓몬 337 (그림이 작게 그려진다)
    expect(t.male.pokemonScale[1]).toBe(337)
  }, 60_000)
})

withRom('en', 'ko', 'ja')('대사 뱅크 645 (기술 되살리기)', () => {
  it('브라우저 변환기가 645를 싣고 개발 산출물과 같다', async () => {
    for (const locale of ['en', 'ko', 'ja']) {
      const out = await run('text', locale)
      const bytes = out.get(`data/dialogue/${locale}/645.json`)
      expect(bytes, locale).toBeDefined()
      const dev = resolve(DATA, `dialogue/${locale}/645.json`)
      if (!existsSync(dev)) expect.unreachable(`개발 산출물이 없다: ${dev} — pnpm extract:dialogue`)
      expect(new TextDecoder().decode(bytes!), locale).toBe(readFileSync(dev, 'utf8'))
      const strings = JSON.parse(new TextDecoder().decode(bytes!)) as string[]
      expect(strings.length, locale).toBeGreaterThan(10)
    }
  }, 300_000)
})

