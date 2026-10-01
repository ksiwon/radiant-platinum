// 우편함 (PARITY §4.8) — `unk_020722AC.c` · `applications/mail_viewer.c`
//
// 포켓몬에게서 뗀 편지가 스무 칸에 쌓인다. 여기서 읽고, 지우고, 다시 지니게 한다.
//
// ⚠️ **Z는 갈래 메뉴를 연다** — 메일을 읽는다 · 메일을 지운다 · 지니게 한다 ·
// 그만둔다 (롬 `mailbox` 뱅크 1~4). 한때 Z가 묻지도 않고 첫 빈손 마리에게
// 주었고, 등록 키 한 번에 확인 없이 내용이 지워졌다.
//
// ⚠️ **지우기는 두 번 묻는다** (`sub_020725D0`). 「내용은 지워져 버립니다
// 괜찮겠습니까?」 다음에 「포켓몬에게 지니게 하겠습니까?」 — 예면 빈 편지지를
// 지닐 마리를 골라 새 글을 쓰고, 아니오면 편지지가 가방으로 간다. 가방이 꽉
// 찼으면 **버린다**(「가방이 가득 차 있습니다... 메일을 버렸습니다」).
//
// ⚠️ **다시 지니게 하는 것은 지닌 도구가 빈 마리에게만** — 편지지도 지닌
// 도구라 자리가 하나뿐이다. 알은 못 고른다 (`PARTY_MENU_MODE_MAILBOX`).
//
// ⚠️ **「메일을 읽는다」는 메일 앱의 읽기 화면을 연다** (`FieldSystem_LaunchMailApp_Read`의
// `MAIL_CONTEXT_MAILBOX`) — 파티의 마리가 지닌 편지를 읽는 것과 같은 화면이다. 닫으면 이 목록으로 돌아온다.
import { useEffect, useMemo, useState } from 'react'
import { loadItemNames, loadSpeciesNames } from '../../data/gameData'
import { fillMenuText, loadUiText, MAILBOX_TEXT, PARTY_GIVE, YES_NO } from '../../data/uiText'
import { EASY_CHAT_WORD_NONE } from '../../engine/world/easyChat'
import {
  clearMailAt, fromMailbox, hasMail, MAIL_LINES, MAIL_WORDS_PER_LINE, mailItemOfType,
} from '../../engine/world/mail'
import type { PokemonInstance } from '../../engine/pokemon/instance'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { loadWordLookup, type WordLookup } from './easyChatWords'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { POCKET_MAIL } from './BagScreen'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as bagCss from './bagScreen.css'
// 갈래 창은 파티 화면 것을 그대로 쓴다 — 오른쪽 아래 구석의 창 하나다
import * as menu from './partyScreen.css'

/** 갈래 넷 — 원작 목록의 반환값 차례다 (0 읽는다 · 1 지운다 · 2 지니게 한다 · 3 그만둔다) */
export const MAILBOX_ACTIONS = ['read', 'erase', 'give', 'cancel'] as const
type MailboxAction = typeof MAILBOX_ACTIONS[number]

/** 갈래 → 롬 줄 */
const ACTION_LINE: Readonly<Record<MailboxAction, number>> = {
  read: MAILBOX_TEXT.read, erase: MAILBOX_TEXT.erase, give: MAILBOX_TEXT.give, cancel: MAILBOX_TEXT.cancel,
}

/** 메일을 지닐 마리를 골랐을 때 (`PartyMenu_GiveMail`) */
type MailGiveVerdict = 'egg' | 'held' | 'ok'

/**
 * 그 마리가 우편함의 메일을 받을 수 있는가.
 *
 * 알은 아예 못 고른다(파티 화면이 소리만 내고 넘어간다). 무엇을 들었으면
 * 「이미 도구를 지니고 있으므로…」로 물러난다 — 맞바꾸지 않는다
 */
export function mailGiveVerdict(mon: Pick<PokemonInstance, 'isEgg' | 'heldItem'>): MailGiveVerdict {
  if (mon.isEgg) return 'egg'
  if (mon.heldItem !== 0) return 'held'
  return 'ok'
}

/** 메뉴가 떠 있는 동안의 단계 */
type Open =
  | { kind: 'menu' }
  /** 「내용은 지워져 버립니다 괜찮겠습니까?」 */
  | { kind: 'eraseAsk' }
  /** 「내용을 지웠습니다 포켓몬에게 지니게 하겠습니까?」 */
  | { kind: 'erasedGive' }
  /** 지닐 마리를 고른다. `write`는 지운 편지지에 새 글을 쓰러 가는 길이다 */
  | { kind: 'pick'; purpose: 'give' | 'write' }

/** 바닥 안내. 메뉴가 떠 있으면 그 단계의 키만 적는다 */
export function mailboxFoot(open: Open['kind'] | null): string {
  if (open === null) return '↑↓ 고르기 · Z 결정 · X 닫기'
  return '↑↓ 고르기 · Z 결정 · X 그만둔다'
}

/** 롬 줄의 `\r`(다음 쪽)은 창 하나에 한꺼번에 올리므로 줄바꿈으로 편다 */
function flat(text: string): string {
  return text.replace(/[\r\f]/g, '\n')
}

export function MailboxScreen() {
  const back = useMenuStore((s) => s.back)
  const openMail = useMenuStore((s) => s.openMail)
  const mailbox = useSaveStore((s) => s.mailbox)
  const party = useSaveStore((s) => s.party)
  const [say, setSay] = useState<readonly string[]>([])
  const [partyText, setPartyText] = useState<readonly string[]>([])
  const [menuText, setMenuText] = useState<readonly string[]>([])
  const [itemNames, setItemNames] = useState<readonly string[]>([])
  const [speciesNames, setSpeciesNames] = useState<readonly string[]>([])
  const [lookup, setLookup] = useState<WordLookup | null>(null)
  const [at, setAt] = useState(0)
  const [open, setOpen] = useState<Open | null>(null)
  const [menuAt, setMenuAt] = useState(0)
  /** 한 줄 알림. 원작이 이어 띄우는 말이 둘일 때가 있어 줄 목록이다 */
  const [notice, setNotice] = useState<readonly string[]>([])
  /**
   * 메일 화면에서 돌아오며 받은 말 (`mailboxNotice`). 글을 받기 전에 비울 수 있게 화면이 붙들고, 가게는 바로
   * 비운다 — 남겨 두면 다음에 연 메일박스에서 또 뜬다
   */
  const [returned, setReturned] = useState(() => useMenuStore.getState().mailboxNotice)
  const setMailboxNotice = useMenuStore((s) => s.setMailboxNotice)
  useEffect(() => { setMailboxNotice(null) }, [setMailboxNotice])

  useEffect(() => {
    let live = true
    const locale = gameLocale()
    void Promise.all([
      loadUiText('mailbox', locale), loadWordLookup(locale), loadUiText('partyMenu', locale),
      loadUiText('menuEntries', locale), loadItemNames(locale), loadSpeciesNames(locale),
    ])
      .then(([lines, get, partyLines, menuLines, items, species]) => {
        if (!live) return
        setSay(lines)
        setLookup(() => get)
        setPartyText(partyLines)
        setMenuText(menuLines)
        setItemNames(items)
        setSpeciesNames(species)
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
  const monName = (mon: PokemonInstance): string => mon.nickname ?? speciesNames[mon.species] ?? ''
  /** 편지지 이름 — 도구 이름표에서 읽는다. 「편지지 N」으로 지어 붙이지 않는다 */
  const paperName = (type: number): string => itemNames[mailItemOfType(type)] ?? ''

  const wordsOf = (words: readonly number[]): string =>
    lookup ? words.filter((w) => w !== EASY_CHAT_WORD_NONE).map((w) => lookup(w)).join(' ') : ''

  const preview = (lines: readonly number[][]): string => wordsOf(lines.flat())

  /** 목록이 하나 줄었다 — 커서를 끝 칸으로 당긴다 */
  const shrink = (): void => { setAt((n) => Math.max(0, Math.min(n, filled.length - 2))) }

  /**
   * 내용을 지우고 편지지를 가방에 넣는다 (`sub_02073060`).
   *
   * ⚠️ **가방이 꽉 차면 버린다** — 원작이 그 자리에서 그렇게 말한다
   */
  const eraseToBag = (): void => {
    setOpen(null)
    if (!here) return
    const got = clearMailAt(mailbox, here.slot)
    if (!got) return
    useSaveStore.setState({ mailbox: got.box })
    // 편지지는 메일 주머니로 간다 (`POCKET_MAIL`) — 도구 주머니에 넣으면 메일 주머니에서 안 보인다
    const kept = useSaveStore.getState().addItem(POCKET_MAIL, got.item, 1)
    setNotice([flat(say[kept ? MAILBOX_TEXT.toBag : MAILBOX_TEXT.bagFull] ?? '')])
    shrink()
  }

  /**
   * 우편함의 메일을 그 마리에게 지니게 한다 (`Mail_TransferFromMailboxToMon`).
   *
   * 무엇을 든 마리면 「이미 도구를 지니고 있으므로…」 다음에 「메일을 지니게 하지
   * 않았습니다」로 물러난다 — 원작이 그 두 말을 잇는다 (`PartyMenu_GiveMail` →
   * `sub_020727F8`)
   */
  const giveTo = (slot: number): void => {
    const mon = party[slot]
    if (!here || !mon) return
    const verdict = mailGiveVerdict(mon)
    if (verdict === 'egg') return
    setOpen(null)
    if (verdict === 'held') {
      setNotice([flat(partyText[PARTY_GIVE.mailHeld] ?? ''), flat(say[MAILBOX_TEXT.notGiven] ?? '')])
      return
    }
    const got = fromMailbox(mailbox, here.slot)
    if (!got) return
    const next = [...party]
    next[slot] = { ...mon, mail: got.mail, heldItem: mailItemOfType(got.mail.type) }
    useSaveStore.setState({ mailbox: got.box, party: next })
    setNotice([flat(partyText[PARTY_GIVE.mailMoved] ?? '')])
    shrink()
  }

  /**
   * 지운 편지지를 그 마리에게 지니게 하며 새 글을 쓴다 (`sub_02072878`).
   *
   * ⚠️ **편지지는 가방을 안 거친다.** 원작은 그 칸에 새 글을 써 넣고 그대로 마리에게 옮긴다
   * (`MailApp_CopyWrittenMailToMailboxSlot` → `Mail_TransferFromMailboxToMon`) — 가방이 꽉 차 있어도 쓸 수 있다.
   * 쓰다 그만두면 그때 편지지를 가방에 넣고(`sub_020726B4` → `sub_02073060`) 꽉 찼으면 버린다 — 그 말은
   * 메일 화면이 맡기고(`mailboxNotice`) 이 목록이 돌아와 띄운다
   */
  const writeFor = (slot: number): void => {
    const mon = party[slot]
    if (!here || !mon) return
    const verdict = mailGiveVerdict(mon)
    if (verdict === 'egg') return
    if (verdict === 'held') { setNotice([flat(partyText[PARTY_GIVE.mailHeld] ?? '')]); return }
    const type = here.mail.type
    const got = clearMailAt(mailbox, here.slot)
    if (!got) return
    useSaveStore.setState({ mailbox: got.box })
    setOpen(null)
    shrink()
    setNotice([])
    // 다 쓰면 이 목록으로 돌아온다 (`sub_02072878`이 끝에 `sub_02072370`으로 간다)
    openMail({
      mode: 'write', type, item: got.item, slot, from: 'mailbox',
      lines: Array.from({ length: MAIL_LINES }, () =>
        Array.from({ length: MAIL_WORDS_PER_LINE }, () => EASY_CHAT_WORD_NONE)),
    })
  }

  const runAction = (action: MailboxAction): void => {
    setMenuAt(0)
    switch (action) {
      case 'read':
        setOpen(null)
        if (here) openMail({ mode: 'read', from: 'mailbox', slot: here.slot })
        return
      // 예·아니오의 커서는 **예**에서 시작한다 (`Menu_MakeYesNoChoice`)
      case 'erase': setOpen({ kind: 'eraseAsk' }); return
      case 'give': setOpen({ kind: 'pick', purpose: 'give' }); return
      case 'cancel': setOpen(null)
    }
  }

  /** 지금 창에 깔린 줄 */
  const choices: string[] = open === null ? []
    : open.kind === 'menu' ? MAILBOX_ACTIONS.map((a) => say[ACTION_LINE[a]] ?? '')
      : open.kind === 'pick' ? party.map((m) => monName(m))
        : [menuText[YES_NO.yes] ?? '', menuText[YES_NO.no] ?? '']

  const confirm = (pick: number = menuAt): void => {
    if (open === null) {
      if (!here) return
      setNotice([])
      setOpen({ kind: 'menu' })
      setMenuAt(0)
      return
    }
    const i = Math.min(pick, Math.max(0, choices.length - 1))
    switch (open.kind) {
      case 'menu': { const a = MAILBOX_ACTIONS[i]; if (a) runAction(a); return }
      case 'eraseAsk':
        if (i === 0) { setOpen({ kind: 'erasedGive' }); setMenuAt(0) } else setOpen(null)
        return
      case 'erasedGive':
        if (i === 0) { setOpen({ kind: 'pick', purpose: 'write' }); setMenuAt(0) } else eraseToBag()
        return
      case 'pick':
        if (open.purpose === 'give') giveTo(i)
        else writeFor(i)
    }
  }

  const cancel = (): void => {
    if (open === null) { back(); return }
    // 지니게 할 마리를 안 고르고 물러났다 — 지니게 하는 길이면 그렇게 말하고,
    // 지운 편지지를 들고 온 길이면 그것을 가방에 넣는다 (`sub_02072754` · `sub_02072878`)
    if (open.kind === 'pick') {
      if (open.purpose === 'give') { setOpen(null); setNotice([flat(say[MAILBOX_TEXT.notGiven] ?? '')]); return }
      eraseToBag()
      return
    }
    // 「포켓몬에게 지니게 하겠습니까?」에서 B는 아니오다 — 편지지가 가방으로 간다
    if (open.kind === 'erasedGive') { eraseToBag(); return }
    setOpen(null)
  }

  const move = (d: number): boolean => {
    if (open === null) {
      const next = clampCursor(at, d, filled.length)
      if (next === at) return false
      setAt(next)
      setNotice([])
      return true
    }
    if (choices.length === 0) return false
    const next = clampCursor(Math.min(menuAt, choices.length - 1), d, choices.length)
    if (next === menuAt) return false
    setMenuAt(next)
    return true
  }

  /** 돌아오며 받은 말은 다음 키에서 걷는다 */
  const settle = (): void => { if (returned !== null) setReturned(null) }

  useMenuKeys({
    up: () => { settle(); return move(-1) },
    down: () => { settle(); return move(1) },
    confirm: () => { settle(); confirm() },
    cancel: () => { settle(); cancel() },
  })

  /** 메일 화면에서 돌아오며 받은 말을 글로 채운다 */
  const returnedLines = (): string[] => {
    if (returned === null) return []
    if (returned.kind !== 'given') {
      return [flat(say[returned.kind === 'toBag' ? MAILBOX_TEXT.toBag : MAILBOX_TEXT.bagFull] ?? '')]
    }
    const mon = party[returned.slot]
    return [flat(fillMenuText(partyText[PARTY_GIVE.given] ?? '', [mon ? monName(mon) : '', itemNames[returned.item] ?? '']))]
  }
  const shownNotice = notice.length > 0 ? notice : returnedLines()

  /** 창 위의 물음 */
  const ask = (): string => {
    if (open === null || !here) return ''
    switch (open.kind) {
      case 'menu': return flat(fillMenuText(say[MAILBOX_TEXT.ask] ?? '', [here.mail.trainerName]))
      case 'eraseAsk': return flat(say[MAILBOX_TEXT.eraseAsk] ?? '')
      case 'erasedGive': return flat(say[MAILBOX_TEXT.erasedGive] ?? '')
      case 'pick': return flat(partyText[PARTY_GIVE.which] ?? '')
    }
  }

  return (
    <MenuScreen
      title={say[MAILBOX_TEXT.title] ?? '메일박스'}
      note={`${String(filled.length)} / ${String(mailbox.length)}`}
      foot={mailboxFoot(open?.kind ?? null)}
    >
      {/* 갈래 창이 이 칸의 오른쪽 아래 구석에 붙는다 */}
      <div className={bagCss.anchorStage}>
        <ul className={css.list}>
          {filled.map((e, i) => (
            <li key={e.slot} className={i === at ? css.rowOn : css.row}>
              <span className={css.label}>{e.mail.trainerName}</span>
              <span className={css.count}>{paperName(e.mail.type)}</span>
            </li>
          ))}
          {filled.length === 0 && <li className={css.rowDim}>메일이 없다</li>}
        </ul>
        <div className={css.detail}>
          {here && <div className={css.detailText}>{preview(here.mail.lines)}</div>}
          {shownNotice.map((text, i) => <div key={i} className={css.detailText}>{text}</div>)}
        </div>

        {open !== null && (
          <div className={menu.choices}>
            <div className={menu.choiceAsk}>{ask()}</div>
            {choices.map((label, i) => (
              <div
                key={`${label}-${String(i)}`}
                className={i === Math.min(menuAt, choices.length - 1) ? menu.choiceOn : menu.choice}
                // 알은 못 고른다 — 흐리게 둔다
                style={open.kind === 'pick' && party[i]?.isEgg === true ? { opacity: 0.45 } : undefined}
                onPointerEnter={() => { setMenuAt(i) }}
                onClick={() => { setMenuAt(i); confirm(i) }}
              >
                {label}
              </div>
            ))}
          </div>
        )}
      </div>
    </MenuScreen>
  )
}
