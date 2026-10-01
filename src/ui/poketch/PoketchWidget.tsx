// 포켓치 (PARITY §7.3) — 오른쪽 위에 걸린 시계 한 대.
//
// ⚠️ **배치는 BDSP를 따른다.** 플래티넘의 포켓치는 아래 화면을 통째로 쓰는 것이
// 전제고 우리는 원 스크린이다. 같은 게임을 원 스크린으로 옮긴 BDSP가
// **오른쪽 위 구석의 작은 시계**로 두고 R로 키우니, 그 배치를 그대로 옮긴다.
//
//   R 톡      작게 ↔ 크게
//   R 길게    감춘다 ↔ 되살린다
//   Q · E     앱을 앞뒤로 (원작 액정 양옆의 버튼 둘)
//
// ⚠️ **크게 펼치면 필드 입력이 멈춘다.** 원작은 손가락으로 아래 화면을 만지며
// 걸을 수 있었지만 우리는 키보드가 하나다. 작게 접힌 채로는 시계도 걸음도
// 파티 체력도 살아서 도니, 걸으면서 보는 쪽은 그대로 남는다.
import { useEffect, useRef, useState } from 'react'
import { assignInlineVars } from '@vanilla-extract/dynamic'
import { loadUiText } from '../../data/uiText'
import { BINDINGS, setUiCapture, typingInto } from '../../engine/input/keys'
import { fieldScripts } from '../../engine/script/field'
import { loadPoketchMap } from '../../data/gameData'
import { poketchShades, stepApp } from '../../engine/world/poketch'
import { useBattleStore } from '../../state/battleStore'
import { useMenuStore } from '../../state/menuStore'
import { clearPoketchMemory, usePoketchStore } from '../../state/poketchStore'
import { useSaveStore } from '../../state/saveStore'
import { POKETCH_APPS, type Nav } from './apps'
import * as css from './poketch.css'

/** R을 이만큼 붙들고 있으면 「길게」다 */
const HOLD_MS = 350

/**
 * 포켓치 말고 다른 것이 키를 쓰는 중인가 — 메뉴 · 배틀 · 대사(스크립트).
 *
 * ⚠️ **그동안 R · Q · E는 포켓치 것이 아니다.** 가방 위에서 R을 두 번 누르면
 * 포켓치가 접히며 붙잡기를 놓았고, 배틀에서 Q가 앱을 넘겼다. 이름 짓기도 메뉴라
 * 여기 걸린다. 크게 펼친 동안만은 예외다 — 접을 길까지 막으면 키가 갇힌다
 */
function othersBusy(): boolean {
  return useMenuStore.getState().stack.length > 0
    || useBattleStore.getState().phase !== 'off'
    || fieldScripts.ctx !== null
}

export function PoketchWidget() {
  const poketch = useSaveStore((s) => s.poketch)
  const view = usePoketchStore((s) => s.view)
  const setView = usePoketchStore((s) => s.setView)
  const [names, setNames] = useState<readonly string[]>([])
  // 액정 팔레트는 롬에서 온다. 아직 안 붙었으면 우리 색으로 뜬다 (`poketchShades`)
  const [shades, setShades] = useState<readonly (readonly string[])[] | null>(null)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [press, setPress] = useState(0)

  useEffect(() => {
    let live = true
    void loadUiText('poketchApps')
      .then((list) => { if (live) setNames(list) })
      .catch(() => { /* 이름 없이도 액정은 뜬다 */ })
    void loadPoketchMap()
      .then((file) => { if (live) setShades(file.shades) })
      .catch(() => { /* 자료가 아직 없으면 우리 색으로 */ })
    return () => { live = false }
  }, [])

  const large = view === 'large'
  // 크게 펼친 동안은 포켓치가 키를 가져간다 (메뉴 화면과 같은 자리다)
  useEffect(() => {
    if (!large) return
    setUiCapture(true, 'poketch')
    return () => { setUiCapture(false, 'poketch') }
  }, [large])

  const held = useRef<number | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      // 글 칸으로 간 키는 포켓치 것이 아니다 — 두벌식의 ㄱ이 R 자리다
      if (typingInto(e.target)) return
      if (othersBusy() && usePoketchStore.getState().view !== 'large') return
      if (BINDINGS.poketch.includes(e.code)) {
        if (held.current !== null) return
        fired.current = false
        held.current = window.setTimeout(() => {
          fired.current = true
          usePoketchStore.getState().toggleHidden()
        }, HOLD_MS)
        return
      }
      if (usePoketchStore.getState().view === 'hidden') return
      const turn = BINDINGS.poketchNext.includes(e.code) ? 1
        : BINDINGS.poketchPrev.includes(e.code) ? -1 : 0
      if (turn !== 0) {
        e.preventDefault()
        const save = useSaveStore.getState()
        const next = stepApp(save.poketch, turn)
        if (next !== save.poketch) {
          // ⚠️ **앱을 넘기면 앞 앱이 쓰던 값이 사라진다** — 원작 `PoketchMemory`가
          // 버퍼 하나를 돌려 쓴다
          clearPoketchMemory()
          setCursor({ x: 0, y: 0 })
          useSaveStore.setState({ poketch: next })
        }
        return
      }
      if (usePoketchStore.getState().view !== 'large') return
      const move: Record<string, [number, number]> = {
        ArrowUp: [0, -1], KeyW: [0, -1],
        ArrowDown: [0, 1], KeyS: [0, 1],
        ArrowLeft: [-1, 0], KeyA: [-1, 0],
        ArrowRight: [1, 0], KeyD: [1, 0],
      }
      // ⚠️ **쓴 키는 여기서 끊는다.** 메뉴 키(`useMenuKeys`)도 같은 창의 같은 캡처
      // 단계에 붙어 있어서 `stopPropagation`으로는 안 끊긴다 — 같은 대상의 다른
      // 손은 그대로 불린다. 안 끊으면 ↓ 한 번에 가방 커서와 포켓치 커서가 같이 간다
      const step = move[e.code]
      if (step) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setCursor((c) => ({ x: c.x + step[0], y: c.y + step[1] }))
        return
      }
      if (e.code === 'KeyZ' || e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setPress((n) => n + 1)
      }
    }
    const up = (e: KeyboardEvent): void => {
      if (typingInto(e.target)) return
      if (!BINDINGS.poketch.includes(e.code)) return
      // 누름을 안 받았으면 뗌도 안 받는다 — 막힌 자리에서 누른 R(위 `down`)이
      // 떼는 순간 크기를 바꾸면 막은 뜻이 없다
      if (held.current === null) return
      clearTimeout(held.current)
      held.current = null
      // 길게 눌러 이미 감췄으면 톡 누른 것으로 또 치지 않는다
      if (!fired.current) usePoketchStore.getState().toggleSize()
    }
    // ⚠️ **창을 떠나면 누름을 잊는다.** R을 누른 채 창 밖으로 나가면 keyup이 안 와서
    // 타이머가 남고, 돌아와서 누른 첫 R이 「이미 누르고 있다」에 막혔다
    const blur = (): void => {
      if (held.current !== null) clearTimeout(held.current)
      held.current = null
      fired.current = true
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
      if (held.current !== null) clearTimeout(held.current)
    }
  }, [setView])

  // 포켓치를 아직 안 받았으면 아무것도 안 그린다 (`Poketch_IsEnabled`)
  if (!poketch.enabled || view === 'hidden') return null

  const App = POKETCH_APPS[poketch.appIndex] ?? POKETCH_APPS[0]
  const nav: Nav = { x: cursor.x, y: cursor.y, press, large }
  const palette = poketchShades(poketch.screenColor, shades)

  return (
    <div
      className={css.root}
      style={assignInlineVars({
        [css.ground]: palette.ground,
        [css.mid]: palette.mid,
        [css.ink]: palette.ink,
      })}
    >
      <div className={`${css.body} ${large ? css.size.large : css.size.small}`}>
        <div className={css.deck}>
          <div className={css.side}>
            <span className={css.button}>◀</span>
            <span className={css.button}>▶</span>
          </div>
          <div className={`${css.screen} ${large ? css.screenLarge : ''}`}>
            {App ? <App {...nav} /> : null}
          </div>
        </div>
        <div className={css.label}>{names[poketch.appIndex] ?? ''}</div>
        {large && <div className={css.hint}>Q E 앱 · R 접는다 · R 길게 감춘다</div>}
      </div>
    </div>
  )
}
