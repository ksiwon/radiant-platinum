// 메뉴 키 입력 — 화면들이 공유한다.
//
// 필드 입력(`engine/input/keyboard`)과 따로 두는 이유: 필드는 60Hz 고정 루프에서
// **눌려 있는가**를 보고, 메뉴는 **눌린 순간**과 길게 누를 때의 반복이 필요하다.
// 그래서 여기는 DOM 이벤트를 그대로 쓴다.
import { useEffect, useRef } from 'react'
import { menuBeep } from '../../engine/audio/lazy'
import { typingInto } from '../../engine/input/keys'

export interface MenuKeys {
  up?: () => void
  down?: () => void
  left?: () => void
  right?: () => void
  /** A. 고른다 */
  confirm?: () => void
  /** B. 물러난다 */
  cancel?: () => void
  /** 페이지 단위 이동 (Q/E). 목록이 길 때 쓴다 */
  pageUp?: () => void
  pageDown?: () => void
  /** 칸 옮기기 (Tab). 한 화면 안에 목록이 둘일 때 쓴다 */
  tab?: () => void
  /** Y. 원작 DS의 Y 버튼 — 가방에서 도구를 등록한다 (PARITY §4.4) */
  register?: () => void
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
  KeyY: 'register',
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
      const action = CODES[e.code]
      if (action === undefined) return
      const fn = ref.current[action]
      if (fn === undefined) return
      // 방향키가 화면을 스크롤하거나 Space가 버튼을 누르면 안 된다
      e.preventDefault()
      e.stopPropagation()
      // 원작은 A·B·상하좌우에 **같은 소리 하나**를 쓴다 (`menu.c`의
      // `Menu_ProcessInput`). 화면이 그 키를 안 받으면 위에서 이미 빠져나갔으므로
      // 여기 온 것은 실제로 무언가가 일어난 경우다
      menuBeep()
      fn()
    }
    // 캡처 단계에서 받는다 — 필드의 Escape 처리보다 먼저 가로채야 한다
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  }, [enabled])
}

/** 끝에서 돌지 않는 커서 이동. 원작도 목록 끝에서 안 돈다 */
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
