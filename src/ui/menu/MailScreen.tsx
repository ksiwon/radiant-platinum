// 편지 (PARITY §4.8) — `applications/mail.c` · `mail_viewer.c`
//
// 편지지 한 장에 낱말로 세 줄을 쓴다. 한 줄은 낱말 둘까지다.
//
// ⚠️ **쓰는 길과 읽는 길이 한 화면이다** — 원작도 `writeMode` 하나로 가른다.
// 읽는 쪽에서는 낱말 칸에 커서가 아예 안 간다.
//
// ⚠️ **편지에 아이콘 셋이 새겨진다** — 편지를 붙이는 자리부터 파티 끝까지 최대
// 셋이고, 나중에 파티가 바뀌어도 그림은 안 바뀐다 (`Mail_SetTrainerAndIconData`).
//
// ⚠️ **낱말을 하나도 안 넣으면 안 붙는다** — 원작이 「단어를 넣어 주십시오」로
// 되돌린다.
import { useEffect, useMemo, useState } from 'react'
import { loadUiText } from '../../data/uiText'
import { EASY_CHAT_WORD_NONE } from '../../engine/world/easyChat'
import {
  MAIL_LINES, MAIL_WORDS_PER_LINE, mailItemOfType, writeMail,
} from '../../engine/world/mail'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { loadWordLookup, type WordLookup } from './easyChatWords'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'

/** 커서가 갈 수 있는 자리 — 낱말 여섯 + 「결정」 */
const SLOTS = MAIL_LINES * MAIL_WORDS_PER_LINE

export function MailScreen() {
  const back = useMenuStore((s) => s.back)
  const closeAll = useMenuStore((s) => s.closeAll)
  const openEasyChat = useMenuStore((s) => s.openEasyChat)
  const mail = useMenuStore((s) => s.mail)
  const party = useSaveStore((s) => s.party)
  const trainer = useSaveStore((s) => s.trainer)
  const [say, setSay] = useState<readonly string[]>([])
  const [lookup, setLookup] = useState<WordLookup | null>(null)
  const [at, setAt] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const locale = gameLocale()
    void Promise.all([loadUiText('mail', locale), loadWordLookup(locale)])
      .then(([lines, get]) => {
        if (!live) return
        setSay(lines)
        // 함수를 상태에 넣을 때는 한 겹 감싼다 — 그냥 넣으면 갱신 함수로 알아듣는다
        setLookup(() => get)
      })
      .catch(() => { /* 글이 없어도 편지지는 뜬다 */ })
    return () => { live = false }
  }, [])

  const held = mail?.mode === 'read' ? party[mail.slot]?.mail ?? null : null
  const writing = mail?.mode === 'write'
  const type = mail?.mode === 'write' ? mail.type : held?.type ?? 0
  const lines = useMemo(
    () => (mail?.mode === 'write' ? mail.lines : held?.lines ?? []),
    [mail, held],
  )

  const filled = useMemo(
    () => lines.some((line) => line.some((w) => w !== EASY_CHAT_WORD_NONE)),
    [lines],
  )

  const attach = (): void => {
    if (mail?.mode !== 'write') return
    if (!filled) { setNotice(say[2] ?? '단어를 넣어 주십시오'); return }
    const target = party[mail.slot]
    if (!target) return
    const written = writeMail(mail.type, {
      trainerId: trainer.id,
      trainerName: trainer.name,
      // 원작은 0 남자 · 1 여자다 (`TrainerInfo_Gender`)
      trainerGender: trainer.gender === 'girl' ? 1 : 0,
      // ⚠️ **고른 자리부터 파티 끝까지**다. 0부터 세면 늘 선두 셋이 새겨진다
      party: party.slice(mail.slot).map((m) => ({
        species: m.species, form: m.form, isEgg: m.isEgg,
      })),
    }, mail.lines)
    const next = [...party]
    next[mail.slot] = { ...target, mail: written, heldItem: mailItemOfType(mail.type) }
    useSaveStore.setState({ party: next })
    // 편지지는 열쇠도구가 아니라 보통 도구 주머니(0)다
    useSaveStore.getState().removeItem(0, mail.item, 1)
    closeAll()
  }

  useMenuKeys({
    up: () => { if (writing) setAt((n) => clampCursor(n, -MAIL_WORDS_PER_LINE, SLOTS + 1)) },
    down: () => { if (writing) setAt((n) => clampCursor(n, MAIL_WORDS_PER_LINE, SLOTS + 1)) },
    left: () => { if (writing) setAt((n) => clampCursor(n, -1, SLOTS + 1)) },
    right: () => { if (writing) setAt((n) => clampCursor(n, 1, SLOTS + 1)) },
    confirm: () => {
      if (!writing) { back(); return }
      setNotice(null)
      if (at >= SLOTS) { attach(); return }
      openEasyChat({
        line: Math.floor(at / MAIL_WORDS_PER_LINE),
        word: at % MAIL_WORDS_PER_LINE,
      })
    },
    cancel: () => { back() },
  })

  if (!mail) return null

  return (
    <MenuScreen
      title={writing ? '편지' : held?.trainerName ?? '편지'}
      note={`편지지 ${String(type + 1)}`}
      foot={writing ? '방향키 자리 · Z 낱말 · 마지막 칸에서 Z 결정 · X 그만둔다' : 'X 닫는다'}
    >
      <div className={css.stageWide}>
        <ul className={css.list}>
          {Array.from({ length: MAIL_LINES }, (_, line) => (
            <li key={line} className={css.row}>
              {Array.from({ length: MAIL_WORDS_PER_LINE }, (_, word) => {
                const slot = line * MAIL_WORDS_PER_LINE + word
                const value = lines[line]?.[word] ?? EASY_CHAT_WORD_NONE
                const text = lookup ? lookup(value) : ''
                return (
                  <span
                    key={word}
                    className={css.label}
                    style={{
                      minWidth: 96,
                      outline: writing && slot === at ? '1px solid currentColor' : 'none',
                      opacity: text === '' ? 0.4 : 1,
                    }}
                  >
                    {text === '' ? '…' : text}
                  </span>
                )
              })}
            </li>
          ))}
          {writing && (
            <li className={at >= SLOTS ? css.rowOn : css.row}>
              <span className={css.label}>{say[0] ?? '결정'}</span>
            </li>
          )}
        </ul>
        {notice !== null && <div className={css.detailText}>{notice}</div>}
        {!writing && held !== null && (
          <div className={css.detailText}>
            {held.icons.length > 0 && `그림 ${String(held.icons.length)}`}
          </div>
        )}
      </div>
    </MenuScreen>
  )
}
