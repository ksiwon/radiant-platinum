// 메뉴 키 입력 — 화면들이 공유한다.
//
// 필드 입력(`engine/input/keyboard`)과 따로 두는 이유: 필드는 60Hz 고정 루프에서
// **눌려 있는가**를 보고, 메뉴는 **눌린 순간**과 길게 누를 때의 반복이 필요하다.
// 그래서 여기는 DOM 이벤트를 그대로 쓴다.
import { useEffect, useRef } from 'react'
import { music } from '../../engine/audio/music'
import { SFX } from '../../engine/audio/sfx'

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
      void music.playEffect(SFX.MENU)
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

/** 주머니 전환처럼 **도는** 커서. 좌우로 넘기는 것은 원작도 돈다 */
export function wrapCursor(cursor: number, delta: number, length: number): number {
  if (length === 0) return 0
  return (cursor + delta + length) % length
}
