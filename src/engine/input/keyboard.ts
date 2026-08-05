// 입력 — 액션 매핑 레이어 (PLAN §6.4). event.code(물리 키) 기준
import { worldState } from '../../state/worldState'

const pressed = new Set<string>()

// 게임 활성 시에만 기본 동작을 막는다 (PLAN §11.3)
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace',
])

const BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  // 원작의 A와 B. 대사창은 둘 다로 넘어가고 예/아니오는 B가 "아니오"로 간다
  interact: ['Space', 'KeyZ'],
  cancel: ['KeyX', 'Backspace'],
}

let gameActive = false
export function setGameActive(active: boolean) {
  gameActive = active
  if (!active) pressed.clear()
}

/**
 * 메뉴 화면이 키를 가져갔는가.
 *
 * 가방·도감처럼 전체 화면을 덮는 것이 떠 있는 동안 주인공이 걸어 다니면 안 된다.
 * 게임 자체를 끄지(`setGameActive(false)`) 않는 이유는 뒤에서 3D가 계속 돌아야
 * 하기 때문이다 — 입력만 끊는다
 */
let uiCapture = false
export function setUiCapture(captured: boolean) {
  uiCapture = captured
  // 붙잡을 때 눌린 키를 지운다. 안 그러면 메뉴를 닫는 순간 그 키가 필드로 샌다
  if (captured) pressed.clear()
}

export function isUiCaptured(): boolean {
  return uiCapture
}

export function attachKeyboard(target: Window = window) {
  target.addEventListener('keydown', (e) => {
    if (gameActive && GAME_KEYS.has(e.code)) e.preventDefault()
    pressed.add(e.code)
  })
  target.addEventListener('keyup', (e) => pressed.delete(e.code))
  target.addEventListener('blur', () => pressed.clear())
}

const some = (codes: string[]) => codes.some((c) => pressed.has(c))

/** 매 fixedUpdate 직전에 호출 — 키 상태를 InputState로 합성 */
export const inputSystem = {
  fixedUpdate() {
    if (!gameActive || uiCapture) {
      worldState.input.move.set(0, 0)
      worldState.input.run = false
      worldState.input.interact = false
      worldState.input.cancel = false
      return
    }
    const x = (some(BINDINGS.right) ? 1 : 0) - (some(BINDINGS.left) ? 1 : 0)
    const y = (some(BINDINGS.down) ? 1 : 0) - (some(BINDINGS.up) ? 1 : 0)
    worldState.input.move.set(x, y)
    if (worldState.input.move.lengthSq() > 1) worldState.input.move.normalize()
    worldState.input.run = some(BINDINGS.run)
    worldState.input.interact = some(BINDINGS.interact)
    worldState.input.cancel = some(BINDINGS.cancel)
  },
}
