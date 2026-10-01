// 키 상태 (`input/keys`) — 붙잡기 · 톡 · 브라우저 기본 동작 · Esc.
//
// 재는 것 넷이다.
//   ① 키를 붙잡는 쪽이 둘(메뉴·포켓치)이어도 **한쪽이 놓을 때 남의 몫까지 놓지 않는가**
//   ② 스텝 사이에 눌렀다 뗀 톡이 **한 스텝만** 참이 되는가 — 안 보이면 대사가 씹히고,
//      두 스텝 참이면 스크립트의 「눌린 순간」이 두 번 선다
//   ③ 오른쪽 클릭 · 그림 끌기 · Tab이 브라우저로 안 새는가
//   ④ Esc가 **어디서도 타이틀로 안 보내는가** (필드의 시작 메뉴만 연다)
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { inputSystem } from './keyboard'
import {
  attachKeyboard, BINDINGS, clearTapped, consumeTapped, held, isUiCaptured, setGameActive,
  setUiCapture,
} from './keys'
import { worldState } from '../../state/worldState'

// 노드에는 DOM 생성자가 없다. `typingInto`·그림 판정이 이름만 보므로 세워 준다.
// 글 칸은 `HTMLElement`의 자식이어야 `typingInto`가 참을 낸다
const g = globalThis as Record<string, unknown>
g.HTMLElement ??= class {}
const Base = g.HTMLElement as new () => object
g.HTMLInputElement ??= class extends Base {}
g.HTMLTextAreaElement ??= class extends Base {}
g.HTMLImageElement ??= class extends Base {}
const Input = g.HTMLInputElement as new () => object
const Image = g.HTMLImageElement as new () => object

/** 진짜 창 대신 사건만 나르는 것 (`restoreGate.test`와 같다) */
function fakeWindow() {
  const listeners = new Map<string, ((e: unknown) => void)[]>()
  return {
    addEventListener(type: string, fn: (e: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn])
    },
    fire(type: string, e: unknown) {
      for (const fn of listeners.get(type) ?? []) fn(e)
    },
  }
}

const win = fakeWindow()
attachKeyboard(win as unknown as Window)

/** 막혔는가를 적는 사건 하나 */
function event(code: string, target: unknown = null, repeat = false) {
  const e = { code, target, repeat, prevented: false, preventDefault: () => { e.prevented = true } }
  return e
}
const down = (code: string, target: unknown = null, repeat = false) => {
  const e = event(code, target, repeat)
  win.fire('keydown', e)
  return e
}
const up = (code: string): void => { win.fire('keyup', event(code)) }

beforeEach(() => {
  win.fire('blur', {})
  setGameActive(true)
  setUiCapture(false, 'menu')
  setUiCapture(false, 'poketch')
  worldState.restoring = false
  inputSystem.fixedUpdate()
})

describe('키를 붙잡는 쪽이 둘이다', () => {
  it('메뉴가 놓아도 포켓치가 쥐고 있으면 붙잡힌 그대로다', () => {
    // 포켓치를 크게 편 채로 시작 메뉴를 열었다 닫는 차례다
    setUiCapture(true, 'poketch')
    setUiCapture(true, 'menu')
    setUiCapture(false, 'menu')
    expect(isUiCaptured()).toBe(true)
    // 그동안 WASD가 주인공까지 안 간다
    down('KeyD')
    inputSystem.fixedUpdate()
    expect(worldState.input.move.x).toBe(0)
    setUiCapture(false, 'poketch')
    expect(isUiCaptured()).toBe(false)
  })

  it('포켓치가 접혀도 메뉴가 떠 있으면 붙잡힌 그대로다', () => {
    setUiCapture(true, 'menu')
    setUiCapture(true, 'poketch')
    setUiCapture(false, 'poketch')
    expect(isUiCaptured()).toBe(true)
  })

  it('주인을 안 대면 메뉴다 — 메뉴 스토어가 쓰던 그 깃발이다', () => {
    setUiCapture(true)
    setUiCapture(false, 'poketch')
    expect(isUiCaptured()).toBe(true)
    setUiCapture(false)
    expect(isUiCaptured()).toBe(false)
  })
})

describe('스텝 사이의 톡', () => {
  it('눌렀다 뗀 것을 한 번만 돌려준다', () => {
    down('Space'); up('Space')
    expect(held(BINDINGS.interact)).toBe(false)
    expect(consumeTapped(BINDINGS.interact)).toBe(true)
    expect(consumeTapped(BINDINGS.interact)).toBe(false)
  })

  it('자동 반복은 새 톡이 아니다', () => {
    down('KeyZ')
    expect(consumeTapped(BINDINGS.interact)).toBe(true)
    down('KeyZ', null, true)
    down('KeyZ', null, true)
    expect(consumeTapped(BINDINGS.interact)).toBe(false)
    up('KeyZ')
  })

  it('글 칸에 친 키는 톡이 아니다', () => {
    down('Space', new Input()); up('Space')
    expect(consumeTapped(BINDINGS.interact)).toBe(false)
  })

  it('창을 떠나거나 붙잡기가 바뀌거나 게임이 켜지면 남은 톡을 버린다', () => {
    for (const drop of [
      () => { win.fire('blur', {}) },
      () => { setUiCapture(true, 'menu'); setUiCapture(false, 'menu') },
      () => { setGameActive(true) },
      () => { clearTapped() },
    ]) {
      down('KeyX'); up('KeyX')
      drop()
      expect(consumeTapped(BINDINGS.cancel)).toBe(false)
    }
  })

  it('스텝 사이에 지나간 Space가 그 다음 한 스텝만 결정이다', () => {
    // 30fps에서 33ms보다 짧은 톡 — keydown과 keyup이 한 스텝 안에 다 지나간다
    down('Space'); up('Space')
    inputSystem.fixedUpdate()
    expect(worldState.input.interact).toBe(true)
    inputSystem.fixedUpdate()
    expect(worldState.input.interact).toBe(false)
  })

  it('누르고 있다 떼면 뗀 다음 스텝은 거짓이다 — 톡이 한 스텝 더 끌지 않는다', () => {
    down('KeyX')
    const seen: boolean[] = []
    for (let i = 0; i < 3; i++) { inputSystem.fixedUpdate(); seen.push(worldState.input.cancel) }
    up('KeyX')
    inputSystem.fixedUpdate(); seen.push(worldState.input.cancel)
    expect(seen).toEqual([true, true, true, false])
  })

  it('막힌 동안 친 톡은 풀린 뒤에 안 나온다', () => {
    // 복원 중으로 막는다 — 붙잡기(`setUiCapture`)는 그 자체로 톡을 비우므로,
    // 막힌 갈래(`keyboard.ts`)가 버리는지는 그것 없이 재야 한다
    worldState.restoring = true
    down('KeyZ'); up('KeyZ')
    inputSystem.fixedUpdate()
    expect(worldState.input.interact).toBe(false)
    worldState.restoring = false
    inputSystem.fixedUpdate()
    expect(worldState.input.interact).toBe(false)
  })

  it('Enter도 필드의 결정이다 — 메뉴·타이틀과 같은 규칙이다', () => {
    expect(BINDINGS.interact).toContain('Enter')
    down('Enter'); up('Enter')
    inputSystem.fixedUpdate()
    expect(worldState.input.interact).toBe(true)
  })
})

describe('브라우저 기본 동작', () => {
  it('오른쪽 클릭 메뉴를 막는다 — 글 칸만 빼고', () => {
    const plain = event('')
    win.fire('contextmenu', plain)
    expect(plain.prevented).toBe(true)
    const field = event('', new Input())
    win.fire('contextmenu', field)
    expect(field.prevented).toBe(false)
  })

  it('그림을 끌지 못한다', () => {
    const img = event('', new Image())
    win.fire('dragstart', img)
    expect(img.prevented).toBe(true)
    const other = event('', null)
    win.fire('dragstart', other)
    expect(other.prevented).toBe(false)
  })

  it('Tab은 게임이 꺼진 겹창에서도 포커스를 안 옮긴다 — 글 칸만 빼고', () => {
    setGameActive(false)
    expect(down('Tab').prevented).toBe(true)
    expect(down('Tab', new Input()).prevented).toBe(false)
    // 게임 키가 아닌 것은 그대로 둔다
    expect(down('KeyZ').prevented).toBe(false)
  })
})

/** 시험 파일을 뺀 `src`의 모든 소스 */
function sources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const at = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sources(at))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(at)
  }
  return out
}

describe('Esc는 타이틀로 안 보낸다', () => {
  // 필드가 한가할 때 Esc는 시작 메뉴가 받는다(`ui/menu/MenuLayer`, `BINDINGS.menu`).
  // 그 손은 스크립트(`fieldScripts.ctx`)·배틀(phase ≠ off)·필드 태스크(`fieldTaskRunning`)·
  // 복원 중에는 비켜 준다 — **그 아래에 Esc를 받아 라우트를 바꾸는 손이 있으면** 바로
  // 그 바쁜 때 리포트 뒤의 진행이 날아간다. 한때 `app/PlayRoute`가 그 손이었다.
  // 원작은 L+R+START+SELECT를 한꺼번에 눌러야만 리셋한다 (`main.c`의 `RESET_COMBO`)
  const root = resolve('src')

  it('PlayRoute에 Esc 손이 없다', () => {
    const play = readFileSync(join(root, 'app/PlayRoute.tsx'), 'utf8')
    expect(play).not.toMatch(/'Escape'/)
    expect(play).not.toMatch(/useNavigate|navigate\(/)
  })

  it('Esc를 보는 소스 중 타이틀로 나가는 것은 크레딧뿐이다', () => {
    // 크레딧은 끝난 뒤 한 번 더 누르면 타이틀로 간다 — 원작 `OS_ResetSystem`이다 (PARITY §8.12)
    const allowed = new Set(['ui/menu/CreditsScreen.tsx'])
    const leaving = /navigate\(\s*'\/'\s*\)|location\.(assign|replace)\(\s*APP_ROOT\s*\)/
    const found: string[] = []
    for (const file of sources(root)) {
      const text = readFileSync(file, 'utf8')
      if (!/'Escape'/.test(text) || !leaving.test(text)) continue
      found.push(relative(root, file).replace(/\\/g, '/'))
    }
    expect(found.filter((f) => !allowed.has(f))).toEqual([])
  })

  it('Esc는 메뉴 여는 키에만 덤으로 묶인다', () => {
    const bound = Object.entries(BINDINGS).filter(([, codes]) => codes.includes('Escape'))
    expect(bound.map(([action]) => action)).toEqual(['menu'])
    expect(BINDINGS.menu[0]).not.toBe('Escape')
  })
})
