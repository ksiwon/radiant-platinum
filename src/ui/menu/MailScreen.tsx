// 편지 (PARITY §4.8) — `applications/mail.c` · `mail_viewer.c`
//
// 편지지 한 장에 낱말로 세 줄을 쓴다. 한 줄은 낱말 둘까지다.
//
// ⚠️ **쓰는 길과 읽는 길이 한 화면이다** — 원작도 `writeMode` 하나로 가른다.
// 읽는 쪽에서는 낱말 칸에 커서가 아예 안 간다. 읽는 편지는 파티의 마리가 지닌 것이거나
// 메일박스의 한 칸이다 (`MAIL_CONTEXT_PARTY` · `MAIL_CONTEXT_MAILBOX`).
//
// ⚠️ **메일박스에서 지운 편지지에 쓰면 메일박스로 돌아간다** (`sub_02072878`) — 가방이나 파티에서
// 연 쓰기는 다 쓰면 메뉴 스택을 통째로 걷는다 (`closeAll`).
//
// ⚠️ **편지에 아이콘 셋이 새겨진다** — 편지를 붙이는 자리부터 파티 끝까지 최대
// 셋이고, 나중에 파티가 바뀌어도 그림은 안 바뀐다 (`Mail_SetTrainerAndIconData`).
//
// ⚠️ **낱말을 하나도 안 넣으면 안 붙는다** — 원작이 「단어를 넣어 주십시오」로
// 되돌린다.
import { useEffect, useMemo, useState } from 'react'
import { loadItemNames } from '../../data/gameData'
import type { Mail } from '../../engine/world/mail'
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
import { POCKET_MAIL } from './BagScreen'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'

/** 커서가 갈 수 있는 자리 — 낱말 여섯 + 「결정」 */
const SLOTS = MAIL_LINES * MAIL_WORDS_PER_LINE

/**
 * 편지지 이름 — 도구 이름표에서 메일 도구의 이름을 읽는다. 「편지지 N」으로
 * 지어 붙이지 않는다 (우편함과 같다)
 */
export function mailPaperName(type: number, itemNames: readonly string[]): string {
  return itemNames[mailItemOfType(type)] ?? ''
}

/** 바닥 안내. 롬이 「메일」·「단어」라고 부르니 안내도 그 말을 쓴다 */
export function mailFoot(writing: boolean): string {
  return writing ? '화살표 키 자리 · Z 단어 · 마지막 칸에서 Z 결정 · X 그만둔다' : 'X 닫기'
}

/**
 * 읽을 편지 — 파티 자리가 지닌 것이거나 메일박스의 한 칸 (`FieldSystem_LaunchMailApp_Read`). 없으면 null
 */
export function readingMail(
  at: { from: 'party' | 'mailbox'; slot: number },
  party: readonly { mail?: Mail | null }[],
  mailbox: readonly Mail[],
): Mail | null {
  return at.from === 'mailbox' ? mailbox[at.slot] ?? null : party[at.slot]?.mail ?? null
}

export function MailScreen() {
  const back = useMenuStore((s) => s.back)
  const closeAll = useMenuStore((s) => s.closeAll)
  const openEasyChat = useMenuStore((s) => s.openEasyChat)
  const mail = useMenuStore((s) => s.mail)
  const party = useSaveStore((s) => s.party)
  const mailbox = useSaveStore((s) => s.mailbox)
  const trainer = useSaveStore((s) => s.trainer)
  const setMailboxNotice = useMenuStore((s) => s.setMailboxNotice)
  const [say, setSay] = useState<readonly string[]>([])
  const [lookup, setLookup] = useState<WordLookup | null>(null)
  const [itemNames, setItemNames] = useState<readonly string[]>([])
  const [at, setAt] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const locale = gameLocale()
    void Promise.all([loadUiText('mail', locale), loadWordLookup(locale), loadItemNames(locale)])
      .then(([lines, get, items]) => {
        if (!live) return
        setSay(lines)
        setItemNames(items)
        // 함수를 상태에 넣을 때는 한 겹 감싼다 — 그냥 넣으면 갱신 함수로 알아듣는다
        setLookup(() => get)
      })
      .catch(() => { /* 글이 없어도 편지지는 뜬다 */ })
    return () => { live = false }
  }, [])

  const held = mail?.mode === 'read' ? readingMail(mail, party, mailbox) : null
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
    if (mail.from === 'mailbox') {
      // 메일박스의 편지지는 가방을 안 거쳤다 — 뺄 것이 없다 (`MailboxScreen`의 `writeFor`)
      setMailboxNotice({ kind: 'given', slot: mail.slot, item: mailItemOfType(mail.type) })
      back()
      return
    }
    // ⚠️ 편지지는 **메일 주머니**에 든다 (`POCKET_MAIL`). 도구 주머니(0)에서 빼면 아무것도 안 빠지고 한 장이 남는다
    useSaveStore.getState().removeItem(POCKET_MAIL, mail.item, 1)
    closeAll()
  }

  /**
   * 그만둔다. 메일박스에서 온 쓰기면 그때 편지지를 가방에 넣는다 — 꽉 찼으면 버린다 (`sub_020726B4` →
   * `sub_02073060`). 그 말은 돌아간 메일박스가 한다
   */
  const leave = (): void => {
    if (mail?.mode === 'write' && mail.from === 'mailbox') {
      const kept = useSaveStore.getState().addItem(POCKET_MAIL, mail.item, 1)
      setMailboxNotice({ kind: kept ? 'toBag' : 'bagFull' })
    }
    back()
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
    cancel: leave,
  })

  if (!mail) return null

  return (
    <MenuScreen
      title={writing ? '메일' : held?.trainerName ?? '메일'}
      note={mailPaperName(type, itemNames) || undefined}
      foot={mailFoot(writing)}
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
