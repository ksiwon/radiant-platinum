// 시작 메뉴 — X를 누르면 뜬다.
//
// 항목이 상황에 따라 나타났다 사라진다. 도감은 마박사에게 받기 전에는 없고,
// 포켓몬은 파티가 비어 있으면 없다. 원작이 그렇게 만들어서, 초반에 메뉴를 열면
// 실제로 두 줄뿐이다 — 우리가 항목을 흐리게 두면 그 느낌이 사라진다.
import { useEffect, useState } from 'react'
import { fillMenuText, loadUiText, START_MENU } from '../../data/uiText'
import { fieldScripts } from '../../engine/script/field'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import * as own from './startMenu.css'

/** `generated/vars_flags.txt` — 도감을 받았는가 */
const FLAG_HAS_POKEDEX = 144

interface Entry {
  key: string
  label: string
  go: () => void
}

export function StartMenu() {
  const [texts, setTexts] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const push = useMenuStore((s) => s.push)
  const closeAll = useMenuStore((s) => s.closeAll)
  const party = useSaveStore((s) => s.party)
  const trainer = useSaveStore((s) => s.trainer)

  useEffect(() => {
    let alive = true
    void loadUiText('startMenu').then((bank) => { if (alive) setTexts(bank) }).catch(() => { /* 빈 메뉴 */ })
    return () => { alive = false }
  }, [])

  /**
   * 항목 글. **인쇄기를 태워서 낸다.**
   *
   * 3번 자리가 `{STRVAR_1 3, 0, 0}`이라 그냥 그리면 제어 부호가 글자 그대로
   * 화면에 뜬다 — 실제로 그렇게 떴다. 0번 칸에 주인공 이름을 넣는 것은
   * 원본도 화면을 열 때 하는 일이다
   */
  const label = (at: number): string => fillMenuText(texts[at] ?? '', [trainer.name])
  const hasDex = fieldScripts.vars.checkFlag(FLAG_HAS_POKEDEX)

  const entries: Entry[] = []
  if (hasDex) entries.push({ key: 'pokedex', label: label(START_MENU.pokedex), go: () => { push('pokedex') } })
  if (party.length > 0) entries.push({ key: 'party', label: label(START_MENU.party), go: () => { push('party') } })
  entries.push({ key: 'bag', label: label(START_MENU.bag), go: () => { push('bag') } })
  entries.push({ key: 'trainerCard', label: label(START_MENU.trainerCard), go: () => { push('trainerCard') } })
  entries.push({ key: 'save', label: label(START_MENU.save), go: () => { push('save') } })
  entries.push({ key: 'options', label: label(START_MENU.options), go: () => { push('options') } })
  entries.push({ key: 'exit', label: label(START_MENU.exit), go: closeAll })

  const at = Math.min(cursor, entries.length - 1)

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, entries.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, entries.length)) },
    confirm: () => entries[at]?.go(),
    cancel: closeAll,
  })

  return (
    <div className={own.frame}>
      <div className={own.card}>
        {entries.map((entry, i) => (
          <div key={entry.key} className={i === at ? own.rowOn : own.row}>
            {/* 원작도 고른 줄 왼쪽에 손가락 커서가 선다 */}
            <span className={own.cursor} aria-hidden>{i === at ? '▶' : ''}</span>
            <span>{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
