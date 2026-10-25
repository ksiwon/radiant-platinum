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

// ─────────────────────────────────────────────────────────────────
// 타이틀 한 창 · 줄 2 · 뜨는 창 (app-screens)
// ─────────────────────────────────────────────────────────────────

const titleSource = readFileSync(resolve('src/ui/screens/TitleScreen.tsx'), 'utf8')

describe('타이틀 접근 이름 — 하네스가 이름으로 찾는다', () => {
  it('「시작」 · 「이어하기」는 글 그대로가 이름이다 (aria-label로 덮지 않는다)', () => {
    // `getByRole('button', { name: '시작', exact: true })` — 요약 · 점 · 커서 글이 이름에 섞이면 깨진다
    expect(titleSource).toMatch(/label: '시작',\r?\n\s+group: 'main',/)
    expect(titleSource).toMatch(/label: '이어하기',\r?\n\s+group: 'main',/)
    expect(titleSource).not.toMatch(/label: '(시작|이어하기)',[^}]*name:/)
  })

  it('세이브 파일 둘은 눈에는 짧고 접근 이름은 옛 이름 그대로다', () => {
    expect(titleSource).toContain("shown: '내보내기', name: '세이브 파일 내보내기'")
    expect(titleSource).toContain("shown: '불러오기', name: '세이브 파일 불러오기'")
    // 묶음 이름표는 읽지 않는다
    expect(titleSource).toMatch(/<span className=\{css\.groupLabel\} aria-hidden>세이브 파일<\/span>/)
  })

  it('줄 묶음은 toolbar이고 radiogroup이 아니다 — 첫 radiogroup은 시작 메뉴다', () => {
    expect(titleSource).toContain('role="toolbar"')
    expect(titleSource).not.toMatch(/role=["{]['"]?radiogroup/)
  })

  it('커서 글자 ▶가 칸 이름에 안 섞인다', () => {
    expect(titleSource).not.toMatch(/>▶</)
    expect(titleSource).not.toMatch(/\{'▶'\}/)
  })

  it('확인 창 단추 이름 셋이 그대로 있다', () => {
    for (const label of ['이 리포트로 이어하기', '처음부터 시작하기', '그만두기']) {
      expect(titleSource).toContain(`label: '${label}'`)
    }
  })

  it('고지 문단은 화면 안(고지 창)에 있고 5가지를 담는다', () => {
    expect(titleSource).toContain('비공식·비제휴 팬 프로젝트입니다.')
    expect(titleSource).toContain('<p className={css.disclaimer}>')
  })
})

describe('줄 2 요약', () => {
  it('도감 수는 본 수이고, 도감을 받기 전에는 쌍이 없다', async () => {
    const { countDex, countBadges, hasPokedex } = await import('./TitleScreen')
    const seen = new Uint8Array(62)
    seen[0] = 0b101 // 1번 · 3번
    expect(countDex(seen)).toBe(2)
    expect(countBadges(0b1010_0001)).toBe(3)
    const flags = new Uint8Array(512)
    expect(hasPokedex(flags)).toBe(false)
    flags[144 >> 3] = 1 << (144 & 7)
    expect(hasPokedex(flags)).toBe(true)
  })

  it('요약은 본 수를 읽는다 — 잡은 수가 아니다', () => {
    expect(titleSource).toContain('countDex(report.pokedex.seen)')
    expect(titleSource).not.toContain('countDex(report.pokedex.caught)')
  })

  it('요약 이름표는 롬 뱅크 550이고 지어낸 이름은 폴백뿐이다', () => {
    for (const key of ['player', 'playtime', 'dex', 'badges']) expect(titleSource).toContain(`MAIN_MENU.${key}`)
  })
})

describe('뜨는 창 자리', () => {
  it('원인 칸의 가운데에 앉고 화면 가장자리를 안 넘는다', async () => {
    const { placeAbove } = await import('./PopAbove')
    const mid = placeAbove({ left: 400, width: 100 }, 300, 1000)
    expect(mid.left).toBe(300)
    expect(mid.nibAt).toBeCloseTo(150)
    // 왼쪽 끝 칸 — 창이 화면 안으로 당겨지고 꼭지는 그래도 칸을 가리킨다
    const edge = placeAbove({ left: 20, width: 60 }, 470, 960)
    expect(edge.left).toBe(16)
    expect(edge.nibAt).toBe(34)
    // 오른쪽 끝
    const right = placeAbove({ left: 880, width: 60 }, 470, 960)
    expect(right.left).toBe(960 - 16 - 470)
    expect(right.nibAt).toBeGreaterThan(400)
  })
})

describe('리포트를 읽기 전의 「시작」', () => {
  it('하던 것이 있는지 모르는 동안에는 지우는 갈래로 안 간다 — 뜨자마자 누른 Enter가 리포트를 지웠다', () => {
    // `report === undefined`면 아무 일도 안 하고, 읽은 뒤에야 확인 창(`askNew`) 또는 새 모험(`go(true)`)
    expect(titleSource).toContain("go: () => { if (report === undefined) return; if (hasSave || unreadable !== null) askNew(); else go(true) },")
  })

  it('못 읽는 리포트가 있어도 확인 없이 지우지 않는다 · 큰 파일은 읽기 전에 거절한다', () => {
    expect(titleSource).toContain('hasSave || unreadable !== null')
    expect(titleSource).toContain('file.size > MAX_PORTABLE_BYTES')
    expect(titleSource.indexOf('file.size > MAX_PORTABLE_BYTES')).toBeLessThan(titleSource.indexOf('file.text()'))
  })
})
