// 이어하기가 **저장한 자리를 세우는 동안** 조작이 안 먹는다 (REPAIR §42)
//
// ⚠️ **재는 것은 「복원이 맞는가」가 아니다.** 그건 `pnpm journey`의 ⑭가
// 실제로 저장하고 다시 켜서 잰다. 여기서 재는 것은 그 사이의 **틈**이다 —
// 세계를 두 걸음에 세우는 동안(오버월드 먼저, 저장한 자리 나중) 방향키가
// 먹으면 사람은 저장한 곳이 아닌 데서 걷고, 갈아 끼우는 순간 끌려간다.
//
// 실측이 이 시험을 부른 자리: 세이브를 들여 필드에 섰는데 420초 동안 한 발도
// 안 움직인 판이 있었다. 문지기를 하나씩 읽어 보니 `isGameActive()`도 참이고
// `isUiCaptured()`도 거짓이고 메뉴도 없었다 — **막을 자리가 아예 없었다.**
import { beforeEach, describe, expect, it } from 'vitest'
import { inputSystem } from './keyboard'
import { attachKeyboard, setGameActive, setUiCapture } from './keys'
import { worldState } from '../../state/worldState'

// 시험은 노드에서 돈다 — DOM 생성자가 없다. `typingInto`가 «글 칸에 치는
// 중인가»를 그것으로 가르므로(`keys.ts`), 이름만 세워 준다. 여기서 재는 것과
// 무관한 자리고, 실제 판정은 그대로 «아니다»로 떨어진다
const g = globalThis as Record<string, unknown>
g.HTMLElement ??= class {}
g.HTMLInputElement ??= class {}
g.HTMLTextAreaElement ??= class {}

/** 진짜 창 대신 사건만 나르는 것. `attachKeyboard`가 받는 것은 이 셋뿐이다 */
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

/** 위쪽 방향키를 누른 채로 한 프레임 */
function holdUp(): void {
  win.fire('keydown', { code: 'ArrowUp', target: null, preventDefault: () => {} })
  inputSystem.fixedUpdate()
}

beforeEach(() => {
  win.fire('blur', {})
  setGameActive(true)
  setUiCapture(false)
  worldState.restoring = false
  worldState.input.move.set(0, 0)
})

describe('복원 중에는 발이 묶인다', () => {
  it('평소에는 방향키가 주인공까지 간다', () => {
    holdUp()
    expect(worldState.input.move.y).toBe(-1)
  })

  it('복원 중이면 같은 키가 안 먹는다', () => {
    worldState.restoring = true
    holdUp()
    expect(worldState.input.move.y).toBe(0)
    expect(worldState.input.move.x).toBe(0)
  })

  it('누른 것을 들고 있다가 **다 서면 그때 걷는다**', () => {
    worldState.restoring = true
    holdUp()
    expect(worldState.input.move.y).toBe(0)
    // 세계가 다 섰다 — 키를 다시 누르지 않아도 그다음 프레임부터 먹는다
    worldState.restoring = false
    inputSystem.fixedUpdate()
    expect(worldState.input.move.y).toBe(-1)
  })

  it('다른 잠금과 겹쳐도 각자 제 것만 푼다', () => {
    // ⚠️ **하나로 묶으면 안 된다.** 메뉴가 닫히면서 `setUiCapture(false)`를
    // 부르는데, 그때 복원까지 같이 풀리면 안 선 세계를 걷게 된다
    worldState.restoring = true
    setUiCapture(true)
    holdUp()
    expect(worldState.input.move.y).toBe(0)
    setUiCapture(false)
    inputSystem.fixedUpdate()
    expect(worldState.input.move.y).toBe(0)
    worldState.restoring = false
    inputSystem.fixedUpdate()
    expect(worldState.input.move.y).toBe(-1)
  })
})
