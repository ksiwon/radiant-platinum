// 타이틀의 껍데기 — 무대 전의 브라우저 기본 동작 · 지연 화면의 청크 경계 · 포커스 링.
//
// 재는 것 넷이다.
//   ① 무대(`attachKeyboard`)가 서기 전에도 Tab · 오른쪽 클릭 · 그림 끌기가 브라우저로 안 새는가
//   ② 타이틀·부팅이 지연으로 받는 화면이 **하나하나** 청크 경계 안에 있는가 — 안 그러면
//      하나를 못 받아도 맨 바깥 경계가 앱을 통째로 내린다
//   ③ 타이틀 위의 창(「더보기」·「이런 게임은 어떠세요?」)이 브라우저 포커스 링을 안 돌리는가
//   ④ 세이브 확인 도구(`tools/saves/check.mjs`)가 찾는 글이 화면에 정말 있는가
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

/**
 * 스타일 규칙을 이름으로 다시 찾는다. 시험용 대역(`tools/test/vanillaExtractStub.ts`)은
 * 규칙을 버리고 매번 다른 이름만 주므로, 그 이름에 규칙을 붙여 둔다
 */
const rules = vi.hoisted(() => new Map<string, unknown>())
vi.mock('@vanilla-extract/css', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vanilla-extract/css')>()
  return {
    ...actual,
    style: (rule?: unknown, debugId?: string): string => {
      const name = (actual.style as (r?: unknown, d?: string) => string)(rule, debugId)
      rules.set(name, rule)
      return name
    },
  }
})

// 테마는 이름 하나만 있으면 된다. 진짜 모듈은 글꼴 선언(`globalFontFace`)을 끌고
// 오는데 대역에 그 함수가 없다 (`chunkBoundary.test`와 같다 — 경계가 테마를 잡는다)
vi.mock('../theme/day.css', () => ({ dayTheme: 'dayTheme' }))

const { guardTitleShell } = await import('./TitleScreen')
const moreMenu = await import('./moreMenu.css')
const otherGames = await import('./otherGames.css')

// 노드에는 DOM 생성자가 없다. `typingInto`·그림 판정이 이름만 보므로 세워 준다
// (`engine/input/keys.test`와 같다)
const g = globalThis as Record<string, unknown>
g.HTMLElement ??= class {}
const Base = g.HTMLElement as new () => object
g.HTMLInputElement ??= class extends Base {}
g.HTMLTextAreaElement ??= class extends Base {}
g.HTMLImageElement ??= class extends Base {}
const Input = g.HTMLInputElement as new () => object
const Image = g.HTMLImageElement as new () => object

/** 진짜 창 대신 사건만 나르는 것. 뗀 것은 다시 안 부른다 */
function fakeWindow() {
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  return {
    addEventListener(type: string, fn: (e: unknown) => void) {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(fn))
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      listeners.get(type)?.delete(fn)
    },
    /** 사건 하나를 쏘고 막혔는지를 돌려준다 */
    fire(type: string, code = '', target: unknown = null): boolean {
      const e = { code, target, prevented: false, preventDefault: () => { e.prevented = true } }
      for (const fn of listeners.get(type) ?? []) fn(e)
      return e.prevented
    },
    count(): number {
      let n = 0
      for (const set of listeners.values()) n += set.size
      return n
    },
  }
}

describe('무대 전의 타이틀도 웹 페이지 티를 안 낸다', () => {
  it('Tab · 오른쪽 클릭 · 그림 끌기를 막는다', () => {
    const win = fakeWindow()
    const off = guardTitleShell(win as unknown as Window, false)
    expect(win.fire('keydown', 'Tab')).toBe(true)
    expect(win.fire('contextmenu')).toBe(true)
    expect(win.fire('dragstart', '', new Image())).toBe(true)
    off()
  })

  it('글 칸은 비켜 준다 — 칸 사이를 옮기는 Tab과 붙여넣기 메뉴가 있어야 한다', () => {
    const win = fakeWindow()
    const off = guardTitleShell(win as unknown as Window, false)
    expect(win.fire('keydown', 'Tab', new Input())).toBe(false)
    expect(win.fire('contextmenu', '', new Input())).toBe(false)
    off()
  })

  it('다른 키와 그림 아닌 것은 건드리지 않는다 — 고르는 키는 메뉴 키(`useMenuKeys`)가 받는다', () => {
    const win = fakeWindow()
    const off = guardTitleShell(win as unknown as Window, false)
    for (const code of ['Enter', 'Space', 'ArrowLeft', 'KeyZ', 'Escape']) {
      expect(win.fire('keydown', code), code).toBe(false)
    }
    expect(win.fire('dragstart', '', new Base())).toBe(false)
    off()
  })

  it('⚠️ 설치 화면이 떠 있으면 Tab을 돌려준다 — 그 화면은 포커스로만 다룬다', () => {
    const win = fakeWindow()
    const off = guardTitleShell(win as unknown as Window, true)
    expect(win.fire('keydown', 'Tab')).toBe(false)
    // 오른쪽 클릭은 그대로 막는다
    expect(win.fire('contextmenu')).toBe(true)
    off()
  })

  it('떼면 셋 다 떨어진다 — 설치 화면을 여닫을 때마다 다시 붙는다', () => {
    const win = fakeWindow()
    const off = guardTitleShell(win as unknown as Window, false)
    expect(win.count()).toBe(3)
    off()
    expect(win.count()).toBe(0)
    expect(win.fire('keydown', 'Tab')).toBe(false)
    expect(win.fire('contextmenu')).toBe(false)
  })
})

/**
 * 이 파일에서 `lazy(...)`로 받는 화면의 이름들
 *
 * ⚠️ 0개면 정규식이 죽은 것이다 — 아래 시험이 공짜로 통과한다
 */
function lazyNames(source: string): string[] {
  return [...source.matchAll(/^const (\w+) = lazy\(/gm)].map((m) => m[1]!)
}

/** `<Name`이 쓰인 자리마다, 그 앞에서 열린 채 안 닫힌 `<ChunkBoundary`가 있는가 */
function wrapped(source: string, name: string): boolean[] {
  const out: boolean[] = []
  for (const m of source.matchAll(new RegExp(`<${name}[\\s/>]`, 'g'))) {
    const before = source.slice(0, m.index)
    out.push(before.lastIndexOf('<ChunkBoundary') > before.lastIndexOf('</ChunkBoundary>'))
  }
  return out
}

describe('지연 화면마다 청크 경계가 따로 있다', () => {
  it.each([
    ['src/ui/screens/TitleScreen.tsx', 6],
    ['src/app/BootGate.tsx', 1],
  ])('%s', (file, expected) => {
    const source = readFileSync(resolve(file), 'utf8')
    const names = lazyNames(source)
    expect(names).toHaveLength(expected)
    for (const name of names) {
      const seen = wrapped(source, name)
      expect(seen.length, `${name}을(를) 그리는 자리`).toBeGreaterThan(0)
      expect(seen.every(Boolean), `${name}이(가) 경계 밖에 있다`).toBe(true)
    }
  })
})

/** 그 규칙의 `:focus-visible` 칸 */
function focusRule(name: string): Record<string, unknown> | undefined {
  const rule = rules.get(name) as { selectors?: Record<string, Record<string, unknown>> } | undefined
  return rule?.selectors?.['&:focus-visible']
}

describe('타이틀 위의 창도 포커스 링을 안 돌린다', () => {
  it.each([
    ['더보기 · 고를 것', moreMenu.item],
    ['더보기 · 돌아가기', moreMenu.close],
    ['이런 게임은 어떠세요? · 고를 것', otherGames.card],
    ['이런 게임은 어떠세요? · 돌아가기', otherGames.close],
  ])('%s', (_where, name) => {
    expect(focusRule(name)).toMatchObject({ outline: 'none' })
  })
})

describe('세이브 확인 도구가 찾는 글', () => {
  it('리포트 불러오기의 계약 경고를 화면의 말 그대로 찾는다', () => {
    const tool = readFileSync(resolve('tools/saves/check.mjs'), 'utf8')
    const title = readFileSync(resolve('src/ui/screens/TitleScreen.tsx'), 'utf8')
    const sought = [...tool.matchAll(/getByText\('([^']+)'\)/g)].map((m) => m[1]!)
    expect(sought.length).toBeGreaterThanOrEqual(2)
    for (const said of sought) expect(title, said).toContain(said)
  })
})
