// 화면 구석의 조작 쪽지.
//
// 원작은 **아래 화면에 쓸 수 있는 버튼이 늘 떠 있다** — 그래서 조작을 외울
// 필요가 없었다(`rowan_intro` 4번이 그것을 설명한다). 우리에게는 그 화면이
// 없으니 그 자리를 이 쪽지가 맡는다.
//
// ⚠️ **판을 늘어놓지 않는다.** 접혀 있을 때는 알약 하나고, 펴야 목록이 뜬다.
// 키는 `BINDINGS`에서 온다 (`engine/input/controlLegend`) — 손으로 적으면 키를
// 바꾼 날부터 거짓말이 된다.
import { useEffect, useMemo, useState } from 'react'
import { devToolsOn } from '../../app/devTools'
import { controlRows, LEGEND_TOGGLE } from '../../engine/input/controlLegend'
import { typingInto } from '../../engine/input/keys'
import { useBattleStore } from '../../state/battleStore'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import * as css from './controlHint.css'

/** 접힌 알약에 적는 말 */
const TITLE: Readonly<Record<string, string>> = {
  ko: '조작', en: 'Controls', ja: 'そうさ',
}

export function ControlHint() {
  const [open, setOpen] = useState(false)
  const locale = useGameLocale()
  const rows = useMemo(() => controlRows(locale), [locale])
  // 메뉴·배틀은 저마다 제 안내를 들고 있고 화면도 빽빽하다 — 그때는 비켜 준다
  const busy = useMenuStore((s) => s.stack.length > 0)
  const battling = useBattleStore((s) => s.phase !== 'off')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (typingInto(e.target) || !LEGEND_TOGGLE.includes(e.code)) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [])

  if (busy || battling) return null
  return (
    <div className={css.wrap} style={devToolsOn() ? { top: css.DEV_TOP } : undefined}>
      <button
        type="button"
        className={open ? css.chipOpen : css.chip}
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v) }}
      >
        {`${TITLE[locale] ?? TITLE.ko} ?`}
      </button>
      {open && (
        <div className={css.panel} role="table" aria-label={TITLE[locale] ?? TITLE.ko}>
          {rows.map((row) => (
            <div key={row.what} style={{ display: 'contents' }} role="row">
              <span className={css.keys} role="cell">{row.keys}</span>
              <span className={css.what} role="cell">{row.what}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
