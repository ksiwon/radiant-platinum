// 메뉴 키가 무엇을 언제 부르는가 (`useMenuKeys`)
//
// 시험 환경이 노드라 React 렌더러도 `window`도 없다. jsdom을 들이는 대신 훅이 쓰는
// 두 가지(`useRef` · `useEffect`)를 그 자리에서 돌리고, `window`는 keydown 리스너만
// 받아 두는 대역으로 바꾼다 — 훅 안의 판단은 진짜 코드 그대로 돈다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const beep = vi.hoisted(() => vi.fn())
vi.mock('../../engine/audio/lazy', () => ({ menuBeep: beep }))
vi.mock('react', () => ({
  useRef: <T>(current: T) => ({ current }),
  useEffect: (run: () => void) => { run() },
}))

type Listener = (e: KeyboardEvent) => void
const listeners = new Set<Listener>()
vi.stubGlobal('window', {
  addEventListener: (type: string, fn: Listener) => { if (type === 'keydown') listeners.add(fn) },
  removeEventListener: (type: string, fn: Listener) => { if (type === 'keydown') listeners.delete(fn) },
})
// `typingInto`가 `instanceof HTMLElement`로 본다. 대역 이벤트의 `target`은 그것이 아니다
vi.stubGlobal('HTMLElement', class {})

const { clampCursor, useMenuKeys, wrapCursor } = await import('./useMenuKeys')

/** 키 하나를 보낸다. 브라우저가 길게 누른 키를 다시 보낼 때는 `repeat`이 참이다 */
function press(code: string, repeat = false): { prevented: boolean } {
  const seen = { prevented: false }
  const e = {
    code, repeat, target: null, isTrusted: true,
    preventDefault: () => { seen.prevented = true },
    stopPropagation: () => { /* 대역 */ },
  }
  for (const fn of listeners) fn(e as unknown as KeyboardEvent)
  return seen
}

beforeEach(() => {
  listeners.clear()
  beep.mockClear()
})

describe('useMenuKeys — 누르고 있는 키', () => {
  it('결정·취소·칸 옮기기·등록·여는 키는 자동 반복을 안 받는다 (원작 `JOY_NEW`)', () => {
    const calls: string[] = []
    useMenuKeys({
      confirm: () => { calls.push('confirm') },
      cancel: () => { calls.push('cancel') },
      tab: () => { calls.push('tab') },
      register: () => { calls.push('register') },
      menu: () => { calls.push('menu') },
    })
    for (const code of ['Space', 'KeyZ', 'Enter', 'KeyX', 'Escape', 'Tab', 'KeyF', 'KeyC']) {
      // 반복은 삼키되 기본 동작은 그대로 막는다 — 스페이스가 버튼을 누르면 안 된다
      expect(press(code, true).prevented).toBe(true)
    }
    expect(calls).toEqual([])
    expect(beep).not.toHaveBeenCalled()

    press('Space')
    press('KeyX')
    expect(calls).toEqual(['confirm', 'cancel'])
  })

  it('방향과 페이지 넘김은 반복을 받는다', () => {
    let moved = 0
    const step = (): void => { moved++ }
    useMenuKeys({ up: step, down: step, left: step, right: step, pageUp: step, pageDown: step })
    for (const code of ['ArrowDown', 'KeyS', 'ArrowUp', 'KeyA', 'ArrowRight', 'KeyQ', 'KeyE']) press(code, true)
    expect(moved).toBe(7)
  })
})

describe('useMenuKeys — 소리', () => {
  it('일이 일어나면 한 번 운다', () => {
    useMenuKeys({ down: () => { /* 움직였다 */ } })
    press('ArrowDown')
    expect(beep).toHaveBeenCalledTimes(1)
  })

  it('핸들러가 `false`를 돌려주면 조용하다 — 끝에 닿은 커서', () => {
    let cursor = 2
    const down = (): boolean => {
      const next = clampCursor(cursor, 1, 3)
      if (next === cursor) return false
      cursor = next
      return true
    }
    useMenuKeys({ down })
    press('ArrowDown')
    press('ArrowDown', true)
    expect(cursor).toBe(2)
    expect(beep).not.toHaveBeenCalled()
  })

  it('화면이 안 받는 키는 소리도 없고 기본 동작도 안 막는다', () => {
    useMenuKeys({ confirm: () => { /* 고른다 */ } })
    expect(press('ArrowDown').prevented).toBe(false)
    expect(beep).not.toHaveBeenCalled()
  })
})

describe('useMenuKeys — 여는 키(C)', () => {
  it('C는 `menu`로 간다. X·Esc는 그대로 물러나기다', () => {
    const calls: string[] = []
    useMenuKeys({ cancel: () => { calls.push('cancel') }, menu: () => { calls.push('menu') } })
    press('KeyC')
    press('KeyX')
    press('Escape')
    expect(calls).toEqual(['menu', 'cancel', 'cancel'])
  })

  it('`menu`를 안 건 화면은 C를 안 가져간다', () => {
    const calls: string[] = []
    useMenuKeys({ cancel: () => { calls.push('cancel') } })
    expect(press('KeyC').prevented).toBe(false)
    expect(calls).toEqual([])
  })

  it('등록 키는 F다 (`BINDINGS.register`)', () => {
    const calls: string[] = []
    useMenuKeys({ register: () => { calls.push('register') } })
    press('KeyF')
    press('KeyY')
    expect(calls).toEqual(['register'])
  })
})

describe('커서 이동', () => {
  it('clampCursor는 끝에서 선다', () => {
    expect(clampCursor(0, -1, 3)).toBe(0)
    expect(clampCursor(2, 1, 3)).toBe(2)
    expect(clampCursor(1, 1, 3)).toBe(2)
    expect(clampCursor(5, 1, 0)).toBe(0)
  })

  it('wrapCursor는 끝에서 돈다', () => {
    expect(wrapCursor(0, -1, 4)).toBe(3)
    expect(wrapCursor(3, 1, 4)).toBe(0)
    expect(wrapCursor(1, 1, 4)).toBe(2)
    expect(wrapCursor(5, 1, 0)).toBe(0)
  })
})
