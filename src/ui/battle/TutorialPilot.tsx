// 포획 강좌의 손 (`StartCatchingTutorial` · `battle_subscreen.c`의 `GetCatchTutorialInput` · `battle_bag.c`)
//
// 원작은 아래 화면을 **대신 눌러 준다** — 손을 띄우고, 60프레임 튀게 한 뒤(`battle/indicator`) 떨어지는 순간 그 단추를
// 누른 것으로 친다. 차례: 첫 턴 「싸운다」 → 첫째 기술. 둘째 턴은 「좋아! 체력을 줄였으니…」를 찍고 61프레임 쉰 뒤
// 「가방」 → 볼 주머니 → 첫 볼. 사람의 누름은 그동안 **안 받는다.**
//
// 우리는 한 화면이라 그 단추들이 배틀 화면에 있다. 손은 그 단추(`data-pilot`) 위에 서고, 누름은 **만든 키 입력**으로
// 보낸다 — 화면이 사람 키와 똑같은 길로 받으므로 따로 고칠 자리가 없다(`useMenuKeys`는 강좌 동안 진짜 키만 버린다).
// ⚠️ **우리 가방에는 「쓴다」 판이 없다** — 볼을 고르면 곧바로 던진다. 원작의 셋째 손(`USE`)은 그래서 둘째에 겹친다.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { atlasUrl } from '../../data/providers/atlas'
import { loadPointerHand, POINTER_HAND_ATLAS } from '../../data/gameData'
import { INDICATOR_PRESS_FRAME, indicatorAt, LOW_HP_DELAY } from './tutorialIndicator'

/** 원작 한 프레임 */
const FRAME_MS = 1000 / 60
/** 손 그림 한 변(DS 32픽셀)을 화면에 몇 배로 세우나 */
const HAND = 64
const SCALE = HAND / 32

/** 손 한 번 — 어디를 가리키고, 떨어질 때 무슨 키를 보내나 */
interface Press {
  target: string
  /** 손을 띄울 때 먼저 보내는 키 — 커서를 그 단추로 옮긴다 */
  before?: readonly string[]
  /** 떨어질 때 보내는 키 */
  keys: readonly string[]
  /** 손을 띄우기 전의 뜸(프레임) */
  delay?: number
  /** 손을 띄우기 전에 글창에 올릴 줄 */
  line?: boolean
}

const PRESSES: readonly Press[] = [
  { target: 'fight', keys: ['KeyZ'] },
  { target: 'move-0', keys: ['KeyZ'] },
  { target: 'bag', line: true, delay: LOW_HP_DELAY, before: ['ArrowDown'], keys: ['KeyZ'] },
  { target: 'pocket-2', keys: ['ArrowRight', 'ArrowRight'] },
  { target: 'item-0', keys: ['KeyZ'] },
]

/**
 * 손이 떠 있는 동안 사람의 누름을 막는다 — 키(`useMenuKeys`의 `pilotOnly`)만 막고 마우스는 열어 두었더니, 첫 턴에 사람이
 * 기술 칸을 먼저 눌러 손이 한 걸음 뒤처졌다. 손은 둘째 턴에 없는 기술 칸(`move-0`)만 찾으며 **영영** 섰다(2026-10-07 journey).
 * 원작은 그동안 터치도 키도 안 읽는다(`battle_subscreen.c`의 강좌 갈래 · `GetCatchTutorialInput`). 글 넘기기만 산다 —
 * 원작도 A·B로 글을 빨리 넘긴다(`battle_main.c`의 `CanABSpeedUpPrint`). 그 칸은 `data-pilot-pass`를 단다.
 *
 * 창의 **캡처 단계**에서 끊는다 — React는 뿌리에서 듣고, 메뉴 줄의 커서는 `pointermove`로 따라오므로(`ui/pointerMoved`) 그것도 여기서 멎는다.
 * 포커스된 단추 위의 Space · Enter가 만드는 `click`도 사람 것(`isTrusted`)이라 같이 걸린다. 터치는 포인터 · `click`으로 걸린다 —
 * 창의 `touchstart`는 크롬이 수동(passive)으로 다뤄 `preventDefault`가 경고만 남긴다
 */
const HUMAN_POINTER = [
  'pointerdown', 'pointerup', 'pointerover', 'pointerout', 'pointermove', 'mousedown', 'mouseup', 'mouseover', 'mouseout', 'mousemove',
  'click', 'dblclick', 'auxclick', 'contextmenu',
] as const

function blockHumanPointer(): () => void {
  const stop = (e: Event): void => {
    if (!e.isTrusted) return
    if (e.target instanceof Element && e.target.closest('[data-pilot-pass]') !== null) return
    e.stopPropagation()
    if (e.cancelable) e.preventDefault()
  }
  for (const type of HUMAN_POINTER) window.addEventListener(type, stop, true)
  return () => { for (const type of HUMAN_POINTER) window.removeEventListener(type, stop, true) }
}

function send(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }))
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }))
}

/**
 * @param line 둘째 턴에 올릴 줄 (`battle_strings` 1226 · 1227 — 동료의 성별로 갈린다)
 * @param onLine 글창에 그 줄을 올린다 · null이면 내린다
 */
export function TutorialPilot({ line, onLine }: { line: string | null, onLine: (text: string | null) => void }) {
  const [hand, setHand] = useState<{ x: number, y: number, dy: number } | null>(null)
  const [ready, setReady] = useState(false)
  const at = useRef(0)

  useEffect(() => {
    // 새 강좌면 센 것을 처음부터 — 판이 닫힌 뒤에도 마지막 값은 남겨 둔다(하네스가 읽는다)
    document.documentElement.dataset.pilotStep = '0'
    let alive = true
    void loadPointerHand().then(() => { if (alive) setReady(true) }).catch(() => { if (alive) setReady(true) })
    const unblock = blockHumanPointer()
    return () => { alive = false; unblock() }
  }, [])

  useEffect(() => {
    if (!ready) return
    let raf = 0
    /** 지금 손의 걸음 — 'wait'면 표적을 찾는 중 · 'delay'면 뜸 · 'show'면 떠 있다 */
    let phase: 'wait' | 'delay' | 'show' = 'wait'
    let since = 0
    const tick = (): void => {
      const press = PRESSES[at.current]
      if (press === undefined) { setHand(null); return }
      if (phase === 'wait') setHand(null)
      const el = document.querySelector<HTMLElement>(`[data-pilot="${press.target}"]`)
      const now = performance.now()
      // ⚠️ **표적이 사라지면 처음부터 다시 기다린다.** 기술을 고른 직후 명령 메뉴가 한 프레임 비친다 — 그때 뜸을 시작하면
      // 턴이 도는 동안 시계가 다 가서, 메뉴가 다시 뜨자마자 커서를 옮기기도 전에 눌러 버린다
      if (el === null && phase !== 'wait') {
        phase = 'wait'
        if (press.line === true) onLine(null)
      }
      if (phase === 'wait') {
        if (el !== null) {
          if (press.line === true && line !== null) onLine(line)
          phase = press.delay !== undefined ? 'delay' : 'show'
          since = now
          if (phase === 'show') for (const k of press.before ?? []) send(k)
        }
      } else if (phase === 'delay') {
        if ((now - since) / FRAME_MS >= press.delay!) {
          phase = 'show'
          since = now
          for (const k of press.before ?? []) send(k)
        }
      } else if (el !== null) {
        const frame = Math.floor((now - since) / FRAME_MS)
        const f = indicatorAt(Math.max(1, frame))
        const box = el.getBoundingClientRect()
        setHand(f.visible ? { x: box.left + box.width / 2, y: box.top + box.height * 0.55, dy: f.dy } : null)
        if (frame >= INDICATOR_PRESS_FRAME) {
          if (press.line === true) onLine(null)
          for (const k of press.keys) send(k)
          at.current += 1
          // 몇 번째 손까지 눌렀는가 — 하네스가 읽는다
          document.documentElement.dataset.pilotStep = String(at.current)
          setHand(null)
          phase = 'wait'
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf) }
  }, [ready, line, onLine])

  if (hand === null) return null
  // 원작 손은 단추 가운데보다 24픽셀 위에 서서 손끝(아래 8픽셀)이 단추에 닿는다(`Indicator_Show(…, 128, 84 - 24, …)`).
  // 우리 단추는 원작보다 크므로 손끝이 **단추 안쪽**(위에서 55%)에 오게 선다
  return createPortal(
    <span
      aria-hidden
      data-pilot-hand
      style={{
        position: 'fixed',
        left: hand.x - HAND / 2,
        top: hand.y - HAND + hand.dy * SCALE,
        width: HAND,
        height: HAND,
        zIndex: 1000,
        pointerEvents: 'none',
        backgroundImage: `url("${atlasUrl(POINTER_HAND_ATLAS)}")`,
        backgroundSize: '100% 100%',
        imageRendering: 'pixelated',
      }}
    />,
    document.body,
  )
}
