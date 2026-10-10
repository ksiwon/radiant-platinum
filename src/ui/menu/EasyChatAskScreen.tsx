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
import { YesNo } from '../common/YesNo'
import { EasyChatFrame } from './EasyChatFrame'
import { MenuScreen } from './MenuScreen'
import * as own from './easyChatFrame.css'
import * as sheetCss from './mailSheet.css'
import { PaperSheet } from './PaperSheet'

/** 낱말 고르기 뱅크의 줄 */
const SAY = { choose: 0, done: 6, fill: 7, quit: 8, yes: 9, no: 10 } as const
/**
 * 아래 줄의 두 단추 — 메뉴 뱅크(361)의 「결정」 · 「그만둔다」. 원작 단추는 글자가 그려진 그림(`pmsi`)이라 글로 싣는
 * 자리가 없다 — 같은 뜻의 롬 줄을 쓴다
 */
const ROW = { done: 39, quit: 43 } as const
/** 묻는 종이의 폭 — 편지가 아니라 낱말 칸 한두 개짜리 작은 종이다 */
const SHEET_W_ASK = 360

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
  // 예/아니오 창이 옆에 앉을 단추 칸
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

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
      // 예/아니오 창(`YesNo`)이 키를 쥔다
    } : {
      confirm: () => { setPlace({ at: 'slots' }) },
      cancel: () => { setPlace({ at: 'slots' }) },
    },
    place.at !== 'ask',
  )

  if (ask === null) return null
  const line = place.at === 'ask' ? say[place.what === 'done' ? SAY.done : SAY.quit]
    : place.at === 'note' ? say[SAY.fill] : say[SAY.choose]
  const picking = place.at === 'groups' || place.at === 'words'
  // 종이에서 고른 칸 — 칸을 고르는 중과 낱말을 고르는 중에 보인다
  const marked = place.at === 'slots' || picking ? slot : -1
  const preview = place.at === 'words' ? list[at]?.text : undefined
  const nameOf = (i: number): string => {
    const g = groups[i]
    return g ? groupNames[g.index] ?? g.group.name : ''
  }
  const doTarget = place.at === 'ask' ? (place.what === 'done' ? 0 : 1) : -1

  return (
    <MenuScreen
      title={line ?? ''}
      note={picking ? nameOf(group) || undefined : undefined}
      foot={place.at === 'words' ? '↑↓ 단어 · Q/E 한 쪽씩 · Z 넣는다 · X 무리로'
        : place.at === 'groups' ? '↑↓ 무리 · Z 연다 · X 칸으로'
          : place.at === 'ask' ? '↑↓ · Z 결정'
            : '←→ 칸 · ↓ 결정/그만둔다 · Z 단어 · X 그만둔다'}
    >
      <EasyChatFrame
        sheetWidth={SHEET_W_ASK}
        sheet={(
          <PaperSheet rings={3} marginAt={52} ruleTop={20} className={own.sheet}>
            <div className={sheetCss.words}>
              {words.slice(0, count).map((w, i) => {
                const text = i === marked && preview !== undefined ? preview : wordText(w)
                return (
                  <span
                    key={i}
                    className={[sheetCss.slot, text === '' ? sheetCss.slotEmpty : '', i === marked ? sheetCss.slotOn : '']
                      .filter(Boolean).join(' ')}
                  >
                    {text === '' ? '…' : text}
                  </span>
                )
              })}
            </div>
          </PaperSheet>
        )}
        below={(
          <div className={own.doGrid}>
            {[entries[ROW.done] ?? '', entries[ROW.quit] ?? ''].map((label, i) => (
              <div
                key={i}
                ref={doTarget === i ? setAnchor : undefined}
                className={place.at === 'row' && place.button === i ? `${own.doCell} ${own.doCellOn}` : own.doCell}
              >
                {label}
              </div>
            ))}
          </div>
        )}
        groups={{
          labels: groups.map((_, i) => nameOf(i)),
          at: group,
          focus: place.at === 'groups' ? 'on' : place.at === 'words' ? 'kept' : 'none',
        }}
        words={{ texts: list.map((w) => w.text), at, focus: place.at === 'words' }}
        dim={!picking}
        popover={place.at === 'ask'
          ? (
            <YesNo
              // 결정 확인은 예가, 종료 확인은 아니오가 먼저다 (`Place`의 `yes`)
              key={place.what}
              labels={[say[SAY.yes] ?? '', say[SAY.no] ?? '']}
              initial={place.yes ? 0 : 1}
              anchor={anchor}
              onPick={(yes) => {
                if (!yes) { setPlace({ at: 'slots' }); return }
                if (place.what === 'done') finish({ ok: true, words })
                else finish({ ok: false, words: ask.words })
              }}
              onCancel={() => { setPlace({ at: 'slots' }) }}
            />
          )
          : undefined}
      />
    </MenuScreen>
  )
}
