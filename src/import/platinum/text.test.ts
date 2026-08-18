// 글·종족 그룹 ↔ 노드 산출물 parity (IMPORT.md §6 끝)
//
// ⚠️ **"브라우저에서도 돌아간다"로는 부족하다.** 개발판이 쓰던 것과 **바이트로**
// 같아야 두 경로가 하나의 게임이다. 다르면 개발판에서 초록인 시험이 공개판을
// 아무것도 보증하지 않는다.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds, narcEntry, type NdsFileSystem } from './nds'
import { charmap, CHAR_COUNT } from './charmap'
import { decodeBank, codesToString, BankError } from './message'
import { convertText, bankLocale, nameList } from './text'
import { convertSpecies, parsePersonal, parseEvo, parseLearnset, STAT_ORDER } from './species'
import { GROUPS } from './convert'
import { SUPPORTED } from './validate'
import { DATA, withRom, romPath, fileSource } from '../../data/romData.testkit'

const EN = SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!
const decoder = new TextDecoder()

describe('문자표', () => {
  it('2,876칸이 다 펴진다 — 구간으로 눌러 담아도 개수가 같다', () => {
    expect(charmap().chars.size).toBe(CHAR_COUNT)
  })

  it('⚠️ 함수 코드가 문자를 안 덮는다 — 0x600은 「됨」이지 STRVAR_6이 아니다', () => {
    const { chars, commands } = charmap()
    expect(chars.get(0x600)).toBe('됨')
    expect(commands.get(0x600)).toBe('STRVAR_6')
  })

  it('한글 구역이 디컴프 표와 한 칸 다르다 — 가디안이 「각디안」이 되면 안 된다', () => {
    // 실측으로 가른 자리다 (DATA.md §2.11). 디컴프 표는 0x400에서 「가」가 시작하고
    // 우리 표는 0x401이다. 한 칸 차이가 이름 전체를 밀어서 「가디안」이 「각디안」이 된다
    const { chars } = charmap()
    expect(chars.get(0x401)).toBe('가')
    expect(chars.has(0x400)).toBe(false)
  })

  it('줄바꿈 세 종류가 진짜 제어문자다 — 화면에 `\\n`이 글자로 뜨지 않는다', () => {
    const { chars } = charmap()
    const all = [...chars.values()].join('')
    expect(all).toContain('\n')
    expect(all).toContain('\r')
    expect(all).toContain('\f')
  })

  it('정본 charmap.txt와 한 줄도 안 다르다', () => {
    const file = resolve(__dirname, '../../../tools/spike/charmap.txt')
    if (!existsSync(file)) { expect.unreachable('tools/spike/charmap.txt가 없다'); return }
    const { chars, commands } = charmap()
    let inCmd = false
    let checked = 0
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const t = raw.replace(/\r$/, '')
      if (!t) continue
      if (t.startsWith('//')) { if (/function codes/i.test(t)) inCmd = true; continue }
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const code = Number.parseInt(t.slice(0, eq).trim(), 16)
      if (Number.isNaN(code)) continue
      let v = t.slice(eq + 1)
      if (v === '\\x0000') v = ''
      if (inCmd) {
        expect(commands.get(code), code.toString(16)).toBe(v.replace(/^\{|\}$/g, ''))
      } else {
        const want = v.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\f/g, '\f')
        expect(chars.get(code), code.toString(16)).toBe(want)
      }
      checked++
    }
    expect(checked).toBe(CHAR_COUNT + commands.size)
  })
})

describe('뱅크 디코더', () => {
  it('⚠️ 키가 틀리면 4GB를 할당하지 않고 던진다', () => {
    // 자리도 길이도 복호화해서 나오는 값이다. 안 보면 그 자리에서 탭이 죽는다
    const bank = new Uint8Array(16)
    const view = new DataView(bank.buffer)
    view.setUint16(0, 1, true)      // 메시지 1개
    view.setUint16(2, 0x1234, true) // 아무 키
    view.setUint32(4, 0xffffffff, true)
    view.setUint32(8, 0xffffffff, true)
    expect(() => decodeBank(bank)).toThrow(BankError)
  })

  it('머리가 4바이트도 안 되면 던진다', () => {
    expect(() => decodeBank(new Uint8Array(2))).toThrow(BankError)
  })

  it('STRVAR는 아래 바이트를 첫 인자로 먹고, SIZE는 안 먹는다', () => {
    const map = charmap()
    // 0xFFFE 0x0103 0x0002 3 0 → {STRVAR_1 3, 3, 0}
    const strvar = new Uint16Array([0xfffe, 0x0103, 2, 3, 0, 0xffff])
    expect(codesToString(strvar, map)).toBe('{STRVAR_1 3, 3, 0}')
    // 0xFF01(SIZE)에 같은 규칙을 쓰면 0xFF00(COLOR)으로 읽힌다
    const size = new Uint16Array([0xfffe, 0xff01, 1, 200, 0xffff])
    expect(codesToString(size, map)).toBe('{SIZE 200}')
  })

  it('종료 코드에서 멈춘다 — 뒤의 쓰레기를 안 읽는다', () => {
    expect(codesToString(new Uint16Array([0x401, 0xffff, 0x402]), charmap())).toBe('가')
  })
})

describe('종족 한 줄', () => {
  const personal = (over: Partial<Record<number, number>> = {}): Uint8Array => {
    const b = new Uint8Array(44)
    for (const [at, v] of Object.entries(over)) b[Number(at)] = v!
    return b
  }

  it('스탯 순서가 HP/공/방/스피드/특공/특방이다 — 표시 순서가 아니다', () => {
    const p = parsePersonal(personal({ 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 }))
    expect(STAT_ORDER.map((k) => p.stats[k])).toEqual([1, 2, 3, 4, 5, 6])
    expect(p.stats.spe).toBe(4)
  })

  it('크기가 44가 아니면 세운다', () => {
    expect(() => parsePersonal(new Uint8Array(40))).toThrow(/personal 크기/)
  })

  it('evo 꼬리 2B가 0이 아니면 세운다 — 8슬롯 가설이 깨진 것이다', () => {
    const b = new Uint8Array(44)
    new DataView(b.buffer).setUint16(42, 1, true)
    expect(() => parseEvo(b)).toThrow(/꼬리/)
  })

  it('레벨업 기술은 하위 9비트가 기술, 다음 7비트가 레벨이다', () => {
    const b = new Uint8Array(4)
    const view = new DataView(b.buffer)
    view.setUint16(0, (7 << 9) | 33, true)  // 레벨 7에 몸통박치기(33)
    view.setUint16(2, 0xffff, true)
    expect(parseLearnset(b)).toEqual([{ level: 7, move: 33 }])
  })
})

withRom('en')('parity — 노드 산출물과 바이트로 같다', () => {
  const open = async (): Promise<NdsFileSystem> => {
    const fs = await openNds(fileSource(romPath('en')!))
    if (!fs) throw new Error('롬을 못 열었다')
    return fs
  }
  const run = async (name: string): Promise<Map<string, Uint8Array>> => {
    const group = GROUPS.find((g) => g.name === name)!
    return group.convert!({ fs: await open(), locale: 'en', release: EN })
  }
  /** `public/data`에 있는 것만 대조한다 — 노드 쪽이 안 만든 뱅크는 비교 대상이 없다 */
  const compare = (out: Map<string, Uint8Array>): { same: number, diff: string[] } => {
    const diff: string[] = []
    let same = 0
    for (const [path, bytes] of out) {
      // 목차는 **일부러 다르다**. 노드 쪽은 뱅크 450개를 골라 실었고 우리는 724개를
      // 다 만든다 — 목차가 같으면 오히려 하나를 빠뜨린 것이다. 알맹이로만 잰다
      if (path === 'data/dialogue/index.json') continue
      const file = resolve(DATA, path.replace(/^data\//, ''))
      if (!existsSync(file)) continue
      const expected = readFileSync(file, 'utf8')
      if (decoder.decode(bytes) === expected) same++
      else diff.push(path)
    }
    return { same, diff }
  }

  it('⚠️ 대사 뱅크가 노드 산출물과 같다', async () => {
    const out = await run('text')
    const { same, diff } = compare(out)
    // 노드 쪽은 450개만 골라 실었다. 우리는 724개를 다 만드는데, 겹치는 것은 다 같아야 한다
    expect(diff, `어긋난 파일: ${diff.slice(0, 5).join(', ')}`).toEqual([])
    expect(same).toBeGreaterThan(450)
  }, 120_000)

  it('us 뱅크 724개를 다 만든다 — 골라 싣지 않는다', async () => {
    const out = await run('text')
    const banks = [...out.keys()].filter((p) => /^data\/dialogue\/en\/\d+\.json$/.test(p))
    expect(banks).toHaveLength(724)
  }, 120_000)

  it('index.json이 스키마대로다', async () => {
    const out = await run('text')
    const index = JSON.parse(decoder.decode(out.get('data/dialogue/index.json')!)) as {
      banks: { index: number, name: string, entries: number }[]
      locales: string[]
    }
    expect(index.locales).toEqual(['en'])
    expect(index.banks).toHaveLength(724)
    for (const b of index.banks) expect(b.name).toMatch(/^TEXT_BANK_/)
  }, 120_000)

  it('⚠️ 종족 508칸과 이름표가 노드 산출물과 같다', async () => {
    const out = await run('species')
    const { same, diff } = compare(out)
    expect(diff).toEqual([])
    expect(same).toBe(2)
  }, 120_000)

  it('⚠️ 기술 이름표가 노드 산출물과 같다', async () => {
    const out = await run('moves')
    const { same, diff } = compare(out)
    expect(diff).toEqual([])
    expect(same).toBe(2)
  }, 120_000)

  it('신오도감 양방향 표가 서로의 역이다 — 아니면 위에서 던졌다', async () => {
    const out = await run('species')
    const json = JSON.parse(decoder.decode(out.get('data/species.json')!)) as {
      sinnohDex: number[], sinnohOf: number[]
    }
    expect(json.sinnohDex).toHaveLength(211)
    expect(json.sinnohOf.filter((n) => n !== 0)).toHaveLength(210)
  }, 120_000)

  it('로케일 이름이 두 축에서 같은 것을 가리킨다 (en ↔ us)', () => {
    expect(bankLocale('en')).toBe('us')
    expect(bankLocale('ko')).toBe('ko')
  })

  it('이름표는 표 길이에 맞춰 자른다 — 뱅크가 길어도 빈칸을 채운다', () => {
    expect(nameList(['가', '나'], 4)).toEqual(['가', '나', '', ''])
  })
})

withRom('ko')('ko 롬 — 밀린 뱅크 자리를 계산으로 찾는다', () => {
  it('한국어 롬에서도 대사가 나온다', async () => {
    const fs = await openNds(fileSource(romPath('ko')!))
    const KO = SUPPORTED.releases.find((r) => r.gameCode === 'CPUK')!
    const out = await convertText({ fs: fs!, locale: 'ko', release: KO })
    const banks = [...out.keys()].filter((p) => /^data\/dialogue\/ko\/\d+\.json$/.test(p))
    // ko 롬의 뱅크는 714개인데 파일은 713개다. 하나는 **ko 롬에만 있는 뱅크**라
    // us 번호가 없어서 이름을 붙일 자리가 없다 (`INSERTED_BEFORE`). 런타임이 뱅크를
    // us 번호로 부르므로 그 뱅크는 어차피 아무도 못 가리킨다
    expect(banks).toHaveLength(713)
    // 종족 이름이 한글로 나온다 — 문자표 한글 구역이 안 밀렸다는 뜻이다
    const species = await convertSpecies({ fs: fs!, locale: 'ko', release: KO })
    const names = JSON.parse(
      decoder.decode(species.get('data/names/species.ko.json')!),
    ) as string[]
    expect(names[387]).toBe('모부기')
    expect(names[282]).toBe('가디안')
  }, 180_000)
})

/**
 * ⚠️ **로케일별 대사가 노드 산출물과 바이트로 같다.**
 *
 * 미국판만 견주던 동안, 한국판·일본판에서만 어긋나는 것은 게임 안에서만 보였다.
 * 파일 이름은 세 판 모두 **us 번호**이고 알맹이는 그 롬의 뱅크다 — 여기가 밀리면
 * 맵마다 이웃 뱅크의 글이 나온다
 */
withRom('ko', 'ja')('parity — 한국판·일본판 대사도 노드 산출물과 같다', () => {
  it.each(['ko', 'ja'] as const)('%s 뱅크가 한 자도 안 다르다', async (loc) => {
    const fs = await openNds(fileSource(romPath(loc)!))
    const release = SUPPORTED.releases.find((r) => r.locale === loc)!
    const out = await convertText({ fs: fs!, locale: loc, release })
    let same = 0
    const diff: string[] = []
    for (const [path, bytes] of out) {
      // 목차는 일부러 다르다 — 노드 쪽은 골라 싣는다
      if (path === 'data/dialogue/index.json') continue
      const file = resolve(DATA, path.replace(/^data\//, ''))
      if (!existsSync(file)) continue
      if (decoder.decode(bytes) === readFileSync(file, 'utf8')) same++
      else diff.push(path)
    }
    expect(diff, `어긋난 파일: ${diff.slice(0, 5).join(', ')}`).toEqual([])
    expect(same).toBeGreaterThan(450)
    // 일본판 뱅크 709개에 이름이 다 붙는다. 한국판은 자기만 가진 인사말 하나가
    // us 번호를 못 받아 713개다
    const re = new RegExp(String.raw`^data/dialogue/${loc}/\d+\.json$`)
    const banks = [...out.keys()].filter((p) => re.test(p))
    expect(banks).toHaveLength(loc === 'ko' ? 713 : 709)
  }, 180_000)
})

describe('NARC 엔트리', () => {
  it('범위 밖 인덱스는 null이다', () => {
    // NARC가 아닌 바이트에서도 조용히 null이어야 한다 — 사용자가 아무 파일이나 고른다
    expect(narcEntry(new Uint8Array(64), 0)).toBeNull()
  })
})
