// 키 상태 (PLAN §6.4) — `event.code`(물리 키) 기준.
//
// ⚠️ **이 모듈은 `worldState`를 import 하지 않는다.** 메뉴 스토어가 `setUiCapture`를
// 부르려고 여기를 잡는데, `worldState`가 딸려 오면 그것이 three를 값으로 가져오고
// three 427KB가 통째로 **타이틀 초기 청크**에 실린다 — §10.4의 150KB 예산이
// 3.6배로 깨진다. 키 상태와, 그것을 `worldState`에 합성하는 일(`keyboard.ts`)을
// 나눈 이유는 그것 하나다. `initialChunk.test.ts`가 이 경계를 지킨다.
const pressed = new Set<string>()

// 게임 활성 시에만 기본 동작을 막는다 (PLAN §11.3)
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace',
])

export const BINDINGS = {
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

export function isGameActive(): boolean {
  return gameActive
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

/**
 * 지금 **글자를 치고 있는가.**
 *
 * ⚠️ **백스페이스가 안 먹었다.** 게임이 켜져 있으면 위 `GAME_KEYS`의 기본
 * 동작을 막는데, 그 안에 `Backspace`가 있다(뒤로 가기를 막으려고 넣었다).
 * 그런데 이름 칸도 같은 창에 있어서 **이름을 지우는 것까지 막혔다** — 실제로
 * 오프닝에서 이름을 못 지운다는 보고를 받았다. 별명 짓는 칸도 같은 자리다.
 *
 * 글자 칸으로 간 키는 게임 키가 아니다. 눌린 것으로 세지도 않는다 — 안 그러면
 * 이름에 스페이스를 넣을 때 대사가 넘어가고, 화살표로 주인공이 걷는다
 */
export function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

export function attachKeyboard(target: Window = window) {
  target.addEventListener('keydown', (e) => {
    if (typingInto(e.target)) return
    if (gameActive && GAME_KEYS.has(e.code)) e.preventDefault()
    pressed.add(e.code)
  })
  target.addEventListener('keyup', (e) => pressed.delete(e.code))
  target.addEventListener('blur', () => pressed.clear())
}

/** 이 동작에 묶인 키 중 하나라도 눌려 있는가 */
export function held(codes: string[]): boolean {
  return codes.some((c) => pressed.has(c))
}
