// 시작 메뉴 — 줄의 차례와 숨김, 아이콘 칸 표, 엿보기가 하네스 계약을 안 깨는가 (`start_menu.c`와 맞댄다)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { menuIconRow } from './menuIcon'
import {
  iconKeyOf, peekKindOf, SAFARI_RETIRE_SCRIPT, startMenuKeys, type StartKey, type StartMenuState,
} from './startMenuEntries'

const base: StartMenuState = { hasDex: true, hasPartner: true, inSafari: false, inAmity: false, canFly: false }
const keys = (patch: Partial<StartMenuState>): StartKey[] => startMenuKeys({ ...base, ...patch })

describe('줄의 차례와 숨김', () => {
  it('일반: 도감 → 포켓몬 → 가방 → 카드 → 리포트 → 설정 → 닫는다', () => {
    expect(keys({})).toEqual(['pokedex', 'party', 'bag', 'trainerCard', 'save', 'options', 'exit'])
  })
  it('공중날기는 포켓몬 다음, 가방 앞이다', () => {
    expect(keys({ canFly: true })).toEqual(
      ['pokedex', 'party', 'fly', 'bag', 'trainerCard', 'save', 'options', 'exit'],
    )
  })
  it('도감은 받기 전에 없고, 포켓몬은 첫 파트너 전에 없다', () => {
    expect(keys({ hasDex: false })).not.toContain('pokedex')
    expect(keys({ hasPartner: false })).not.toContain('party')
  })
  it('교감광장에서는 포켓몬과 가방이 빠진다', () => {
    const got = keys({ inAmity: true })
    expect(got).not.toContain('party')
    expect(got).not.toContain('bag')
    expect(got).toContain('trainerCard')
  })
  it('사파리: 포기한다가 맨 위, 리포트가 빠진다', () => {
    const got = keys({ inSafari: true })
    expect(got[0]).toBe('retire')
    expect(got).not.toContain('save')
  })
  it('끝 다섯 줄은 늘 가방 · 카드 · 리포트 · 설정 · 닫는다 (하네스가 뒤에서 센다)', () => {
    for (const patch of [{}, { canFly: true }, { hasDex: false }, { hasPartner: false }]) {
      expect(keys(patch).slice(-5)).toEqual(['bag', 'trainerCard', 'save', 'options', 'exit'])
    }
  })
  it('포기한다는 SAFARI_GAME 21번 스크립트다', () => {
    expect(SAFARI_RETIRE_SCRIPT).toBe(8821)
  })
})

describe('아이콘 칸 표', () => {
  it('여자 가방이 9번 칸, 남자는 2번 칸이다', () => {
    expect(menuIconRow('bag', 'girl')).toBe(9)
    expect(menuIconRow('bag', 'boy')).toBe(2)
  })
  it('다른 항목은 성별로 안 갈린다 (도감0 포켓몬1 카드3 리포트4 설정5 닫기6 채팅7 포기8)', () => {
    const want: Record<string, number> = {
      pokedex: 0, party: 1, trainerCard: 3, save: 4, options: 5, exit: 6, chat: 7, retire: 8,
    }
    for (const [key, row] of Object.entries(want)) {
      for (const g of ['boy', 'girl'] as const) {
        expect(menuIconRow(key as Parameters<typeof menuIconRow>[0], g)).toBe(row)
      }
    }
  })
  it('공중날기만 원작 아이콘이 없다', () => {
    expect(iconKeyOf('fly')).toBeNull()
    for (const k of keys({ canFly: true, inSafari: false })) {
      if (k !== 'fly') expect(iconKeyOf(k)).not.toBeNull()
    }
  })
})

describe('엿보기', () => {
  it('설정 · 닫는다 · 포기한다는 엿보기가 없다', () => {
    expect(peekKindOf('options')).toBeNull()
    expect(peekKindOf('exit')).toBeNull()
    expect(peekKindOf('retire')).toBeNull()
  })
  it('나머지 여섯은 있다', () => {
    for (const k of ['pokedex', 'party', 'fly', 'bag', 'trainerCard', 'save'] as const) {
      expect(peekKindOf(k)).not.toBeNull()
    }
  })
  it('엿보기 뿌리는 aria-hidden이고 role이 없다 (첫 radiogroup · 마지막 dl 계약)', () => {
    const src = readFileSync(resolve(import.meta.dirname, 'StartPeek.tsx'), 'utf8')
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    const root = /className=\{own\.peek\}[\s\S]*?>/.exec(code)?.[0] ?? ''
    expect(root).toContain('aria-hidden')
    expect(code).not.toMatch(/role=/)
    expect(code).not.toMatch(/<dl[\s>]/)
  })
  it('시작 메뉴 줄 글에 ▶를 안 넣는다', () => {
    const src = readFileSync(resolve(import.meta.dirname, 'StartMenu.tsx'), 'utf8')
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
    expect(code).not.toContain('▶')
  })
})
