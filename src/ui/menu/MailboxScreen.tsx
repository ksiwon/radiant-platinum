// 우편함 (PARITY §4.8) — `applications/mail_viewer.c`
//
// 포켓몬에게서 뗀 편지가 스무 칸에 쌓인다. 여기서 읽고, 지우고, 다시 지니게 한다.
//
// ⚠️ **내용을 지우면 편지지로 되돌아온다** — 원작이 그 자리에서 가방에 도구를
// 넣고, 가방이 꽉 찼으면 **버린다**(「가방이 가득 차 있습니다... 메일을
// 버렸습니다」). 조용히 사라지는 것이 아니라 그렇게 말한다.
//
// ⚠️ **다시 지니게 하는 것은 지닌 도구가 빈 마리에게만** — 편지지도 지닌
// 도구라 자리가 하나뿐이다.
import { useEffect, useMemo, useState } from 'react'
import { loadUiText } from '../../data/uiText'
import { EASY_CHAT_WORD_NONE } from '../../engine/world/easyChat'
import { clearMailAt, fromMailbox, hasMail, mailItemOfType } from '../../engine/world/mail'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { loadWordLookup, type WordLookup } from './easyChatWords'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'

export function MailboxScreen() {
  const back = useMenuStore((s) => s.back)
  const mailbox = useSaveStore((s) => s.mailbox)
  const party = useSaveStore((s) => s.party)
  const [say, setSay] = useState<readonly string[]>([])
  const [lookup, setLookup] = useState<WordLookup | null>(null)
  const [at, setAt] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const locale = gameLocale()
    void Promise.all([loadUiText('mailbox', locale), loadWordLookup(locale)])
      .then(([lines, get]) => {
        if (!live) return
        setSay(lines)
        setLookup(() => get)
      })
      .catch(() => { /* 글이 없어도 목록은 뜬다 */ })
    return () => { live = false }
  }, [])

  /** 들어 있는 칸만. 원작도 빈 칸을 목록에 안 올린다 */
  const filled = useMemo(
    () => mailbox.map((m, slot) => ({ mail: m, slot })).filter((e) => hasMail(e.mail)),
    [mailbox],
  )
  const here = filled[at]

  const preview = (words: readonly number[][]): string => {
    if (!lookup) return ''
    return words.flat().filter((w) => w !== EASY_CHAT_WORD_NONE).map((w) => lookup(w)).join(' ')
  }

  const erase = (): void => {
    if (!here) return
    const got = clearMailAt(mailbox, here.slot)
    if (!got) return
    useSaveStore.setState({ mailbox: got.box })
    // ⚠️ **가방이 꽉 차면 버린다** — 원작이 그 자리에서 그렇게 말한다
    const kept = useSaveStore.getState().addItem(0, got.item, 1)
    setNotice(kept ? say[9] ?? '내용을 지운 메일을 가방에 집어넣었습니다' : say[10]
      ?? '가방이 가득 차 있습니다... 메일을 버렸습니다')
    setAt((n) => Math.max(0, Math.min(n, filled.length - 2)))
  }

  const giveToLead = (): void => {
    if (!here) return
    // 지닌 도구가 빈 첫 마리에게 준다. 원작은 파티 화면을 여는데 우리는 여기서
    // 고른 뒤 되돌아오는 길이 아직 없어, **아무도 안 비었으면 그 이유를 말한다**
    const slot = party.findIndex((m) => m.heldItem === 0 && !m.isEgg)
    if (slot < 0) { setNotice(say[11] ?? '메일을 지니게 하지 않았습니다'); return }
    const got = fromMailbox(mailbox, here.slot)
    if (!got) return
    const next = [...party]
    const target = next[slot]
    if (!target) return
    next[slot] = { ...target, mail: got.mail, heldItem: mailItemOfType(got.mail.type) }
    useSaveStore.setState({ mailbox: got.box, party: next })
    setNotice(null)
    setAt((n) => Math.max(0, Math.min(n, filled.length - 2)))
  }

  useMenuKeys({
    up: () => { setAt((n) => clampCursor(n, -1, filled.length)) },
    down: () => { setAt((n) => clampCursor(n, 1, filled.length)) },
    confirm: () => { giveToLead() },
    register: () => { erase() },
    cancel: () => { back() },
  })

  return (
    <MenuScreen
      title={say[0] ?? '메일박스'}
      note={`${String(filled.length)} / ${String(mailbox.length)}`}
      foot="↑↓ 고르기 · Z 지니게 한다 · Y 내용을 지운다 · X 닫는다"
    >
      <div className={css.stage}>
        <ul className={css.list}>
          {filled.map((e, i) => (
            <li key={e.slot} className={i === at ? css.rowOn : css.row}>
              <span className={css.label}>{e.mail.trainerName}</span>
              <span className={css.count}>편지지 {e.mail.type + 1}</span>
            </li>
          ))}
          {filled.length === 0 && <li className={css.rowDim}>편지가 없다</li>}
        </ul>
        <div className={css.detail}>
          {here && <div className={css.detailText}>{preview(here.mail.lines)}</div>}
          {notice !== null && <div className={css.detailText}>{notice}</div>}
        </div>
      </div>
    </MenuScreen>
  )
}
