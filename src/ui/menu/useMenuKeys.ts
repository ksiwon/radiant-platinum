// 메뉴 키 입력 — 화면들이 공유한다.
//
// 필드 입력(`engine/input/keyboard`)과 따로 두는 이유: 필드는 60Hz 고정 루프에서
// **눌려 있는가**를 보고, 메뉴는 **눌린 순간**과 길게 누를 때의 반복이 필요하다.
// 그래서 여기는 DOM 이벤트를 그대로 쓴다.
import { useEffect, useRef } from 'react'
import { menuBeep } from '../../engine/audio/lazy'
import { BINDINGS, typingInto } from '../../engine/input/keys'

/**
 * 키 하나의 일. **`false`를 돌려주면 아무것도 안 바뀐 것**이라 소리를 안 낸다.
 *
 * 원작은 커서가 실제로 움직였을 때만 운다 (`menu.c`의 `TryMovingCursorAndPlaySound`
 * · 필드 쪽 `engine/script/field`도 같다). 끝에 닿은 커서를 더
 * 밀 때 `clampCursor`가 같은 값을 돌려주면 그 자리에서 `false`를 낸다.
 * 아무것도 안 돌려주면 일어난 것으로 친다
 */
type Handler = () => void | boolean

interface MenuKeys {
  up?: Handler
  down?: Handler
  left?: Handler
  right?: Handler
  /** A. 고른다 */
  confirm?: Handler
  /** B. 물러난다 */
  cancel?: Handler
  /** 페이지 단위 이동 (Q/E). 목록이 길 때 쓴다 */
  pageUp?: Handler
  pageDown?: Handler
  /** 칸 옮기기 (Tab). 한 화면 안에 목록이 둘일 때 쓴다 */
  tab?: Handler
  /**
   * F. 원작 DS의 Y 버튼 자리 (PARITY §4.4). **지금 이 갈래를 거는 화면은 없다** —
   * 가방은 등록을 갈래 메뉴의 「등록」으로 하고(`BagScreen`의 `bagActions`), 등록한
   * 도구는 메뉴가 닫힌 필드에서 이 키로 쓴다(`MenuLayer`의 `runRegisteredItem`).
   * 화면이 이 갈래를 안 걸면 키는 그대로 지나간다
   */
  register?: Handler
  /**
   * 메뉴를 연 키(C). 원작 시작 메뉴는 연 X 버튼으로도 닫힌다
   * (`start_menu.c`의 `Menu_New(…, PAD_BUTTON_B | PAD_BUTTON_X)`). 시작 메뉴만 건다
   */
  menu?: Handler
}

const CODES: Record<string, keyof MenuKeys> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'confirm', KeyZ: 'confirm', Enter: 'confirm',
  KeyX: 'cancel', Backspace: 'cancel', Escape: 'cancel',
  KeyQ: 'pageUp', KeyE: 'pageDown',
  Tab: 'tab',
}

// ⚠️ **등록 키는 여기 안 적는다.** 필드에서 등록한 도구를 쓰는 키와 같아야
// 하는데(`ui/menu/MenuLayer`), 두 군데 적어 두면 한쪽만 옮겨진다 — 그 키는
// 원작의 `Y`에서 `F`로 옮겨 앉았다
for (const code of BINDINGS.register) CODES[code] = 'register'

// 여는 키 중 B 자리(X·Esc)는 이미 `cancel`이다 — 남는 것은 `C` 하나다. 덮어쓰면
// 다른 화면에서 X·Esc가 물러나기를 잃는다
for (const code of BINDINGS.menu) if (!(code in CODES)) CODES[code] = 'menu'

/**
 * 누르고 있어도 **한 번만** 먹는 일.
 *
 * ⚠️ 브라우저는 길게 누른 키를 초당 서른 번쯤 다시 보낸다(`repeat`). 원작은 A·B를
 * 새로 누른 것(`JOY_NEW` · `list_menu.c`)으로만 받는다 — 이것들까지 반복을 받으면
 * 상점에서 Z를 누르고 있는 동안 계속 사지고, X를 누르고 있으면 겹친 메뉴가 끝까지
 * 벗겨진다. 반복을 받는 것은 방향과 페이지 넘김뿐이다
 */
const ONCE: ReadonlySet<keyof MenuKeys> = new Set<keyof MenuKeys>(['confirm', 'cancel', 'tab', 'register', 'menu'])

/**
 * 사람 키를 잠근다 — 잡는 법 강습 동안 화면은 손이 보내는 **만든 키**(`isTrusted` 거짓)만 받는다
 * (`ui/battle/TutorialPilot`). 원작도 그동안 입력을 안 본다(`GetCatchTutorialInput`)
 */
let pilotOnly = false
export function lockMenuKeysToPilot(on: boolean): void {
  pilotOnly = on
}

/**
 * 화면이 떠 있는 동안만 듣는다.
 *
 * 핸들러를 ref에 담아 두는 이유: 커서 자리가 바뀔 때마다 새 함수가 오는데,
 * 그때마다 리스너를 떼고 다시 붙이면 길게 누르기가 끊긴다
 */
export function useMenuKeys(handlers: MenuKeys, enabled = true): void {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      // ⚠️ **글자 칸으로 간 키는 안 가져간다.** 여기는 X와 Backspace도 "물러난다"로
      // 잡고 `preventDefault`까지 하는데, 그러면 이름에 x를 못 넣고 지우지도
      // 못한다. 화면마다 `enabled`로 끄고 있었지만 하나라도 빠뜨리면 그 칸이
      // 죽는다 — 칸이 임자인 키는 여기서 통째로 비켜 준다
      if (typingInto(e.target)) return
      if (pilotOnly && e.isTrusted) { e.preventDefault(); e.stopPropagation(); return }
      const action = CODES[e.code]
      if (action === undefined) return
      const fn = ref.current[action]
      if (fn === undefined) return
      // 방향키가 화면을 스크롤하거나 Space가 버튼을 누르면 안 된다
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat && ONCE.has(action)) return
      // 원작은 A·B·상하좌우에 **같은 소리 하나**를 쓴다 (`menu.c`의
      // `Menu_ProcessInput`). 화면이 그 키를 안 받으면 위에서 이미 빠져나갔고,
      // 받았어도 아무것도 안 바뀌었다고 하면(`false`) 조용하다
      if (fn() !== false) menuBeep()
    }
    // 캡처 단계에서 받는다 — 필드의 Escape 처리보다 먼저 가로채야 한다
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  }, [enabled])
}

/**
 * 끝에서 돌지 않는 커서 이동. 원작 목록은 대개 끝에서 안 돈다 — 시작 메뉴처럼
 * 네 줄 이상이면 도는 것도 있다(`start_menu.c`의 `optionCount >= 4`)
 */
export function clampCursor(cursor: number, delta: number, length: number): number {
  if (length === 0) return 0
  return Math.max(0, Math.min(length - 1, cursor + delta))
}

/**
 * 고른 줄을 화면 안으로 끌어온다. 커서가 놓인 `<div>`에 `ref`로 건다.
 *
 * ⚠️ **목록이 길면 이게 없을 때 커서가 사라진다.** 우리 목록은 CSS로만
 * 굴러가는데(`overflow-y: auto`) 키로 옮긴 줄은 포커스를 안 받아서 브라우저가
 * 안 따라온다 — 열일곱 줄이 넘는 목록(가방 78 · 교환 코너 30)에서 바로 보인다.
 * 원작은 화면이 딱 여섯 줄이고 스스로 굴린다
 */
export function scrollIntoView(node: HTMLElement | null): void {
  node?.scrollIntoView({ block: 'nearest' })
}

/** 주머니 전환처럼 **도는** 커서. 좌우로 넘기는 것은 원작도 돈다 */
export function wrapCursor(cursor: number, delta: number, length: number): number {
  if (length === 0) return 0
  return (cursor + delta + length) % length
}
