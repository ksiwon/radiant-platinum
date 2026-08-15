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
import { isUiCaptured, setUiCapture } from '../../engine/input/keys'
import { loadPoketchMap } from '../../data/gameData'
import { poketchShades, stepApp } from '../../engine/world/poketch'
import { clearPoketchMemory, usePoketchStore } from '../../state/poketchStore'
import { useSaveStore } from '../../state/saveStore'
import { POKETCH_APPS, type Nav } from './apps'
import * as css from './poketch.css'

/** R을 이만큼 붙들고 있으면 「길게」다 */
const HOLD_MS = 350

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
    setUiCapture(true)
    return () => { setUiCapture(false) }
  }, [large])

  const held = useRef<number | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'KeyR') {
        if (held.current !== null) return
        fired.current = false
        held.current = window.setTimeout(() => {
          fired.current = true
          usePoketchStore.getState().toggleHidden()
        }, HOLD_MS)
        return
      }
      if (usePoketchStore.getState().view === 'hidden') return
      // ⚠️ **메뉴가 떠 있으면 손대지 않는다.** 가방에서 Q를 누르는 것이
      // 포켓치의 앱을 넘기면 안 된다. 크게 펼쳤을 때는 우리가 그 붙잡은
      // 쪽이므로 예외다
      if (isUiCaptured() && usePoketchStore.getState().view !== 'large') return
      if (e.code === 'KeyQ' || e.code === 'KeyE') {
        e.preventDefault()
        const save = useSaveStore.getState()
        const next = stepApp(save.poketch, e.code === 'KeyE' ? 1 : -1)
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
      const step = move[e.code]
      if (step) {
        e.preventDefault()
        setCursor((c) => ({ x: c.x + step[0], y: c.y + step[1] }))
        return
      }
      if (e.code === 'KeyZ' || e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        setPress((n) => n + 1)
      }
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyR') return
      if (held.current !== null) { clearTimeout(held.current); held.current = null }
      // 길게 눌러 이미 감췄으면 톡 누른 것으로 또 치지 않는다
      if (!fired.current) usePoketchStore.getState().toggleSize()
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
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
