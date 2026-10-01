// 스크립트가 묻는 낱말 하나 · 둘 (`EasyChat_Main_OneWord` · `EasyChat_Main_TwoWords` · `applications/easy_chat/main.c`)
//
// 원작 차례: 칸 위에서 A → 무리 · 낱말을 골라 칸에 넣는다. 두 낱말이면 ←→로 칸을 옮긴다. ↓로 아래 줄
// (결정 · 그만둔다)로 간다. 결정은 **다 채웠을 때만** 「이 대답으로 하시겠습니까?」(예가 먼저)를 묻고, 빈 칸이 있으면
// 「단어를 넣어 주십시오!」를 띄운다. 아무것도 안 바꿨으면 결정도 그만두기와 같다. B와 그만둔다는 「아무 입력 없이
// 종료하겠습니까?」(아니오가 먼저)다 (`ov20_021D1C90` · `ov20_021D1DBC`). 글은 낱말 고르기 뱅크(437)의 것이다.
//
// 무리 · 낱말 목록은 우편 낱말 고르기(`EasyChatScreen`)와 같은 규칙이다 — 안 열린 무리는 안 보이고, 낱말은 그 로케일
// 이름으로 줄 선다.
import { useEffect, useMemo, useState } from 'react'
import { loadUiText } from '../../data/uiText'
import { EASY_CHAT_WORD_NONE, openGroups } from '../../engine/world/easyChat'
import { dexHas } from '../../engine/pokemon/dex'
import { SYSTEM_FLAG } from '../../engine/script/commands'
import { fieldScripts } from '../../engine/script/field'
import { useEasyChatAskStore } from '../../state/easyChatAskStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { loadWordLookup, type WordLookup } from './easyChatWords'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'

/** 낱말 고르기 뱅크의 줄 */
const SAY = { choose: 0, done: 6, fill: 7, quit: 8, yes: 9, no: 10 } as const
/**
 * 아래 줄의 두 단추 — 메뉴 뱅크(361)의 「결정」 · 「그만둔다」. 원작 단추는 글자가 그려진 그림(`pmsi`)이라 글로 싣는
 * 자리가 없다 — 같은 뜻의 롬 줄을 쓴다
 */
const ROW = { done: 39, quit: 43 } as const
const UL_RESET = { margin: 0, padding: 0, listStyle: 'none' } as const

/** 지금 어디에 서 있나 */
type Place =
  | { at: 'slots' }
  | { at: 'row', button: 0 | 1 }
  | { at: 'groups' }
  | { at: 'words' }
  | { at: 'ask', what: 'done' | 'quit', yes: boolean }
  | { at: 'note' }

export function EasyChatAskScreen() {
  const ask = useEasyChatAskStore((s) => s.ask)
  const finish = useEasyChatAskStore((s) => s.finish)
  const pokedex = useSaveStore((s) => s.pokedex)
  const unlocks = useSaveStore((s) => s.easyChatUnlocks)
  const [say, setSay] = useState<readonly string[]>([])
  const [groupNames, setGroupNames] = useState<readonly string[]>([])
  const [entries, setEntries] = useState<readonly string[]>([])
  const [lookup, setLookup] = useState<WordLookup | null>(null)
  const [words, setWords] = useState<number[]>(() => [...(ask?.words ?? [])])
  const [slot, setSlot] = useState(0)
  const [place, setPlace] = useState<Place>({ at: 'slots' })
  const [group, setGroup] = useState(0)
  const [at, setAt] = useState(0)

  useEffect(() => {
    let live = true
    const locale = gameLocale()
    void Promise.all([
      loadUiText('easyChat', locale), loadUiText('easyChatGroups', locale), loadWordLookup(locale),
      loadUiText('menuEntries', locale),
    ])
      .then(([lines, names, get, menu]) => {
        if (!live) return
        setSay(lines); setGroupNames(names); setLookup(() => get); setEntries(menu)
      })
      .catch(() => { /* 글이 없어도 칸은 선다 */ })
    return () => { live = false }
  }, [])

  const groups = useMemo(() => openGroups({
    seen: (species) => dexHas(pokedex.seen, species),
    completed: fieldScripts.vars.checkFlag(SYSTEM_FLAG.gameCompleted),
    unlocks,
  }), [pokedex, unlocks])
  const here = groups[group]
  const list = useMemo(() => {
    if (!here || !lookup) return []
    return [...here.words].map((w) => ({ word: w, text: lookup(w) }))
      .sort((a, b) => a.text.localeCompare(b.text, gameLocale()))
  }, [here, lookup])

  const count = ask?.count ?? 1
  const changed = ask !== null && words.some((w, i) => w !== ask.words[i])
  const complete = words.slice(0, count).every((w) => w !== EASY_CHAT_WORD_NONE)
  const wordText = (w: number): string => (w === EASY_CHAT_WORD_NONE ? '' : lookup?.(w) ?? '')

  const tryDone = (): void => {
    if (!changed) { setPlace({ at: 'ask', what: 'quit', yes: false }); return }
    if (!complete) { setPlace({ at: 'note' }); return }
    setPlace({ at: 'ask', what: 'done', yes: true })
  }

  useMenuKeys(
    place.at === 'slots' ? {
      left: () => { if (count === 2) setSlot(0) },
      right: () => { if (count === 2) setSlot(1) },
      down: () => { setPlace({ at: 'row', button: 0 }) },
      confirm: () => { setGroup(0); setPlace({ at: 'groups' }) },
      cancel: () => { setPlace({ at: 'ask', what: 'quit', yes: false }) },
    } : place.at === 'row' ? {
      left: () => { setPlace({ at: 'row', button: place.button === 0 ? 1 : 0 }) },
      right: () => { setPlace({ at: 'row', button: place.button === 0 ? 1 : 0 }) },
      up: () => { setPlace({ at: 'slots' }) },
      confirm: () => { if (place.button === 0) tryDone(); else setPlace({ at: 'ask', what: 'quit', yes: false }) },
      cancel: () => { setPlace({ at: 'ask', what: 'quit', yes: false }) },
    } : place.at === 'groups' ? {
      up: () => { setGroup((n) => clampCursor(n, -1, groups.length)) },
      down: () => { setGroup((n) => clampCursor(n, 1, groups.length)) },
      confirm: () => { setAt(0); setPlace({ at: 'words' }) },
      cancel: () => { setPlace({ at: 'slots' }) },
    } : place.at === 'words' ? {
      up: () => { setAt((n) => clampCursor(n, -1, list.length)) },
      down: () => { setAt((n) => clampCursor(n, 1, list.length)) },
      pageUp: () => { setAt((n) => clampCursor(n, -8, list.length)) },
      pageDown: () => { setAt((n) => clampCursor(n, 8, list.length)) },
      confirm: () => {
        const pick = list[at]
        if (!pick) return
        setWords((ws) => ws.map((w, i) => (i === slot ? pick.word : w)))
        setPlace({ at: 'slots' })
      },
      cancel: () => { setPlace({ at: 'groups' }) },
    } : place.at === 'ask' ? {
      up: () => { setPlace({ ...place, yes: true }) },
      down: () => { setPlace({ ...place, yes: false }) },
      confirm: () => {
        if (!place.yes) { setPlace({ at: 'slots' }); return }
        if (place.what === 'done') finish({ ok: true, words })
        else finish({ ok: false, words: ask?.words ?? words })
      },
      cancel: () => { setPlace({ at: 'slots' }) },
    } : {
      confirm: () => { setPlace({ at: 'slots' }) },
      cancel: () => { setPlace({ at: 'slots' }) },
    },
  )

  if (ask === null) return null
  const line = place.at === 'ask' ? say[place.what === 'done' ? SAY.done : SAY.quit]
    : place.at === 'note' ? say[SAY.fill] : say[SAY.choose]
  return (
    <MenuScreen
      title={line ?? ''}
      foot={place.at === 'words' ? '↑↓ 단어 · Q/E 한 쪽씩 · Z 넣는다 · X 무리로'
        : place.at === 'groups' ? '↑↓ 무리 · Z 연다 · X 칸으로'
          : place.at === 'ask' ? '↑↓ · Z 결정'
            : '←→ 칸 · ↓ 결정/그만둔다 · Z 단어 · X 그만둔다'}
    >
      <div className={css.stage}>
        <ul className={css.list} style={UL_RESET}>
          {words.slice(0, count).map((w, i) => (
            <li key={i} className={place.at === 'slots' && i === slot ? css.rowOn : css.row}>
              <span className={css.label}>{wordText(w) || '　'}</span>
            </li>
          ))}
          <li className={place.at === 'row' && place.button === 0 ? css.rowOn : css.row}>
            <span className={css.label}>{entries[ROW.done] ?? ''}</span>
          </li>
          <li className={place.at === 'row' && place.button === 1 ? css.rowOn : css.row}>
            <span className={css.label}>{entries[ROW.quit] ?? ''}</span>
          </li>
          {place.at === 'ask' && (
            <>
              <li className={place.yes ? css.rowOn : css.row}><span className={css.label}>{say[SAY.yes] ?? ''}</span></li>
              <li className={!place.yes ? css.rowOn : css.row}><span className={css.label}>{say[SAY.no] ?? ''}</span></li>
            </>
          )}
        </ul>
        {(place.at === 'groups' || place.at === 'words') && (
          <ul className={css.list} style={UL_RESET}>
            {place.at === 'groups'
              ? groups.map((g, i) => (
                <li key={g.index} className={i === group ? css.rowOn : css.row}>
                  <span className={css.label}>{groupNames[g.index] ?? g.group.name}</span>
                </li>
              ))
              : list.slice(Math.max(0, at - 7), Math.max(0, at - 7) + 15).map((w, i) => (
                <li key={w.word} className={Math.max(0, at - 7) + i === at ? css.rowOn : css.row}>{w.text}</li>
              ))}
          </ul>
        )}
      </div>
    </MenuScreen>
  )
}
