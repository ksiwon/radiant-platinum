// 도감 검색의 이름 뭉치 이름표 · 정렬 이름표 · 줄 설명과 ←→ · 다시 열 때의 커서
// (`PokedexScreen.tsx`)
//
// 이름표는 롬 도감 뱅크(697) 54~62를 그대로 읽는다. 한국판은 ᄀᄂ … ᄑᄒ
// 일곱이고 여덟째·아홉째가 빈 줄이다. 그 이름표가 정말로 그 뭉치를 가리키는지는
// 구운 목록(`pokedexSort.ko.json`)의 종 이름 첫 음절 초성으로 잰다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SortOrder } from '../../engine/pokemon/dexSort'
import { useSessionStore } from '../../state/sessionStore'
import {
  nameGroupLabel, pokedexMemory, restoreCursor, searchHelp, sortLabel, stepNameFilter, stepPage,
} from './PokedexScreen'

const DATA = resolve(__dirname, '../../../public/data')
const read = <T>(path: string): T | null => {
  const file = resolve(DATA, path)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : null
}
const bank = read<string[]>('dialogue/ko/697.json')
const sort = read<{ lists: Record<string, number[]> }>('pokedexSort.ko.json')
const names = read<string[]>('names/species.ko.json')

const GROUPS = ['nameAbc', 'nameDef', 'nameGhi', 'nameJkl', 'nameMno',
  'namePqr', 'nameStu', 'nameVwx', 'nameYz']
/** 음절의 초성 열아홉 */
const INITIAL = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
/** 된소리는 예사소리 뭉치에 든다 — 「ㄲ」으로 시작하는 꼬마돌은 ㄱ 뭉치다 */
const PLAIN: Record<string, string> = { ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ' }

function initial(name: string): string {
  const code = name.charCodeAt(0) - 0xac00
  if (code < 0 || code >= 11172) return name[0] ?? ''
  const ch = INITIAL[Math.floor(code / 588)]!
  return PLAIN[ch] ?? ch
}

describe('이름표', () => {
  it('첫소리 자모를 홀로 쓰는 자모로 바꾸고 가운뎃점으로 가른다', () => {
    expect(nameGroupLabel('ᄀᄂ')).toBe('ㄱ·ㄴ')
    expect(nameGroupLabel('ᄑᄒ')).toBe('ㅍ·ㅎ')
  })

  it('다른 로케일 이름표는 그대로다', () => {
    expect(nameGroupLabel('ABC')).toBe('ABC')
    expect(nameGroupLabel('あいうえお')).toBe('あいうえお')
    expect(nameGroupLabel('')).toBe('')
  })
})

describe('한국 롬의 이름 뭉치', () => {
  it.runIf(bank)('이름표가 ㄱ·ㄴ … ㅍ·ㅎ 일곱이고 여덟째·아홉째는 비었다', () => {
    const labels = bank!.slice(54, 63).map(nameGroupLabel)
    expect(labels).toEqual(['ㄱ·ㄴ', 'ㄷ·ㄹ', 'ㅁ·ㅂ', 'ㅅ·ㅇ', 'ㅈ·ㅊ', 'ㅋ·ㅌ', 'ㅍ·ㅎ', '', ''])
  })

  it.runIf(bank && sort && names)('각 뭉치 종의 첫 음절 초성이 그 이름표의 글자다', () => {
    GROUPS.forEach((group, i) => {
      const label = nameGroupLabel(bank![54 + i]!)
      const want = label ? label.split('·') : []
      const got = [...new Set(sort!.lists[group]!.map((s) => initial(names![s]!)))].sort()
      expect({ group, got }).toEqual({ group, got: [...want].sort() })
    })
  })

  it.runIf(bank)('거르기를 돌리면 빈 이름표 자리를 건너뛴다 — 전부 → 일곱 → 전부', () => {
    const seen: number[] = []
    let at = 0
    for (let i = 0; i < 8; i++) { at = stepNameFilter(at, 1, bank!); seen.push(at) }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 0])
    expect(stepNameFilter(0, -1, bank!)).toBe(7)
  })
})

describe('이름 거르기 넘기기', () => {
  it('뱅크가 아직 안 왔으면 아홉 자리를 다 돈다', () => {
    expect(stepNameFilter(9, 1, [])).toBe(0)
    expect(stepNameFilter(0, -1, [])).toBe(9)
  })

  it('이름표가 다 차 있으면(미국판) 아홉 자리를 다 돈다', () => {
    const ui = new Array<string>(63).fill('x')
    expect(stepNameFilter(8, 1, ui)).toBe(9)
    expect(stepNameFilter(9, 1, ui)).toBe(0)
  })
})

describe('←→ — 쪽과 모습', () => {
  it('모습이 하나면 쪽만 넘긴다', () => {
    expect(stepPage(0, 0, 1, 1)).toEqual({ page: 1, form: 0 })
    expect(stepPage(2, 0, 1, 1)).toEqual({ page: 0, form: 0 })
    expect(stepPage(0, 0, 1, -1)).toEqual({ page: 2, form: 0 })
  })

  it('폼 쪽에서는 모습을 넘기고, 끝에서 한 번 더 밀면 쪽을 넘긴다', () => {
    // 안농 28
    expect(stepPage(2, 0, 28, 1)).toEqual({ page: 2, form: 1 })
    expect(stepPage(2, 27, 28, 1)).toEqual({ page: 0, form: 0 })
    expect(stepPage(2, 5, 28, -1)).toEqual({ page: 2, form: 4 })
    expect(stepPage(2, 0, 28, -1)).toEqual({ page: 1, form: 0 })
  })

  it('오른쪽으로 들어오면 첫 모습, 왼쪽으로 들어오면 끝 모습이다', () => {
    expect(stepPage(1, 0, 28, 1)).toEqual({ page: 2, form: 0 })
    expect(stepPage(0, 0, 28, -1)).toEqual({ page: 2, form: 27 })
  })
})

describe('다시 열 때의 커서', () => {
  const order = [{ species: 387 }, { species: 388 }, { species: 389 }]

  it('마지막으로 본 종의 줄에 선다', () => {
    expect(restoreCursor(order, 389)).toBe(2)
  })

  it('목록에 없거나 처음이면 맨 위다', () => {
    expect(restoreCursor(order, 25)).toBe(0)
    expect(restoreCursor(order, 0)).toBe(0)
    expect(restoreCursor([], 389)).toBe(0)
  })
})

describe('정렬 이름표 — 롬 81~86', () => {
  it.runIf(bank)('SortOrder 차례 그대로 번호 · 가나다순 · 무겁다 · 가볍다 · 크다 · 작다다', () => {
    const order = [SortOrder.NUMERICAL, SortOrder.ALPHABETICAL, SortOrder.HEAVIEST,
      SortOrder.LIGHTEST, SortOrder.TALLEST, SortOrder.SMALLEST]
    expect(order.map((o) => sortLabel(o, bank!)))
      .toEqual(['번호', '가나다순', '무겁다', '가볍다', '크다', '작다'])
  })

  it('뱅크가 아직 안 왔으면 빈 글이다 — 우리 이름을 지어 붙이지 않는다', () => {
    expect(sortLabel(SortOrder.HEAVIEST, [])).toBe('')
  })
})

describe('검색 창 줄 설명 — 롬 87~90 (`DescriptionMessage`)', () => {
  it.runIf(bank)('정렬은 차례 설명, 이름 · 타입 둘 · 모양은 제 설명이다', () => {
    expect(searchHelp(1, bank!)).toBe('도감의 순서를 지정합니다.')
    expect(searchHelp(2, bank!)).toBe('이름의 첫 글자를\n지정합니다.')
    expect(searchHelp(3, bank!)).toBe('타입을 지정합니다.')
    expect(searchHelp(4, bank!)).toBe('타입을 지정합니다.')
    expect(searchHelp(5, bank!)).toBe('몸의 형태를 지정합니다.')
  })

  it('원작 검색에 없는 「도감」 줄은 설명이 없다', () => {
    expect(searchHelp(0, new Array<string>(100).fill('x'))).toBe('')
  })

  it('뱅크가 아직 안 왔으면 빈 글이다', () => {
    expect(searchHelp(2, [])).toBe('')
  })
})

describe('마지막으로 본 종을 비우는 때', () => {
  it('타이틀로 나가면 비운다 — 필드가 새로 설 때(`PokedexMemory_New`)', () => {
    useSessionStore.getState().setPhase('overworld')
    pokedexMemory.species = 389
    // 필드에 있는 동안은 남는다 — 도감을 닫았다 열어도 그 종이다
    useSessionStore.getState().setPhase('overworld')
    expect(pokedexMemory.species).toBe(389)
    useSessionStore.getState().setPhase('title')
    expect(pokedexMemory.species).toBe(0)
  })
})
