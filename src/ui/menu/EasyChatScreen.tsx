// 낱말 고르기 (PARITY §4.8) — `applications/easy_chat/`
//
// 키보드가 없던 시절의 입력이다. 미리 정해진 낱말 중에서 골라 문장을 만든다.
// 왼쪽이 무리 열둘, 오른쪽이 그 무리의 낱말이다.
//
// ⚠️ **원작에는 모드가 둘이다** — 「그룹 모드」와 「가나다 모드」(영어 롬은
// ABC). 우리는 그룹 모드만 만든다: 두 번째 모드의 표가 **영어 첫 글자로 묶은
// 스물여섯 칸**이라(`sWordsByAlphabet`) 한국어 화면에 올릴 수가 없다. 대신
// 무리 안의 낱말을 **그 로케일 이름으로 정렬**해 둔다 — 영어 알파벳 차례로
// 늘어놓으면 한국어에서는 아무 차례도 아니다.
//
// ⚠️ **안 열린 무리는 아예 안 보인다.** 원작이 개수를 0으로 만들어 빈 칸이
// 되는데, 빈 칸은 「고장」과 「아직 못 여는 것」이 화면에서 같아진다.
import { useEffect, useMemo, useState } from 'react'
import { loadUiText } from '../../data/uiText'
import { openGroups, EASY_CHAT_WORD_NONE } from '../../engine/world/easyChat'
import { dexHas } from '../../engine/pokemon/dex'
import { SYSTEM_FLAG } from '../../engine/script/commands'
import { fieldScripts } from '../../engine/script/field'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { loadWordLookup, type WordLookup } from './easyChatWords'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'

export function EasyChatScreen() {
  const back = useMenuStore((s) => s.back)
  const setWord = useMenuStore((s) => s.setMailWord)
  const pokedex = useSaveStore((s) => s.pokedex)
  const unlocks = useSaveStore((s) => s.easyChatUnlocks)
  const [say, setSay] = useState<readonly string[]>([])
  const [names, setNames] = useState<readonly string[]>([])
  const [lookup, setLookup] = useState<WordLookup | null>(null)
  const [group, setGroup] = useState(0)
  const [at, setAt] = useState(0)
  const [inWords, setInWords] = useState(false)

  useEffect(() => {
    let live = true
    const locale = gameLocale()
    void Promise.all([
      loadUiText('easyChat', locale),
      loadUiText('easyChatGroups', locale),
      loadWordLookup(locale),
    ]).then(([lines, groupNames, get]) => {
      if (!live) return
      setSay(lines)
      setNames(groupNames)
      // ⚠️ 함수를 상태에 넣을 때는 한 겹 감싼다 — 그냥 넣으면 React가 갱신
      // 함수로 알아듣고 즉시 불러 버린다
      setLookup(() => get)
    }).catch(() => { /* 글이 없어도 목록은 뜬다 */ })
    return () => { live = false }
  }, [])

  const groups = useMemo(() => openGroups({
    seen: (species) => dexHas(pokedex.seen, species),
    completed: fieldScripts.vars.checkFlag(SYSTEM_FLAG.gameCompleted),
    unlocks,
  }), [pokedex, unlocks])

  const here = groups[group]
  /** ⚠️ **그 로케일 이름으로 정렬한다** — 표 차례는 영어 알파벳이다 */
  const words = useMemo(() => {
    if (!here || !lookup) return []
    return [...here.words]
      .map((w) => ({ word: w, text: lookup(w) }))
      .sort((a, b) => a.text.localeCompare(b.text, gameLocale()))
  }, [here, lookup])

  useMenuKeys({
    up: () => {
      if (inWords) setAt((n) => clampCursor(n, -1, words.length))
      else setGroup((n) => clampCursor(n, -1, groups.length))
    },
    down: () => {
      if (inWords) setAt((n) => clampCursor(n, 1, words.length))
      else setGroup((n) => clampCursor(n, 1, groups.length))
    },
    pageUp: () => { if (inWords) setAt((n) => clampCursor(n, -8, words.length)) },
    pageDown: () => { if (inWords) setAt((n) => clampCursor(n, 8, words.length)) },
    confirm: () => {
      if (!inWords) { setAt(0); setInWords(true); return }
      const pick = words[at]
      if (!pick) return
      setWord(pick.word)
      back()
    },
    cancel: () => {
      if (inWords) { setInWords(false); return }
      // ⚠️ **무리에서 물러나면 낱말을 비운다** — 원작의 「그만둔다」가
      // 그 칸을 비우고 나가는 것이다
      setWord(EASY_CHAT_WORD_NONE)
      back()
    },
  })

  return (
    <MenuScreen
      title={say[0] ?? '단어를 선택하세요.'}
      foot={inWords
        ? '↑↓ 낱말 · Q E 한 쪽씩 · Z 넣는다 · X 무리로'
        : '↑↓ 무리 · Z 연다 · X 비우고 나간다'}
    >
      <div className={css.stage}>
        <ul className={css.list}>
          {groups.map((g, i) => (
            <li
              key={g.index}
              className={!inWords && i === group ? css.rowOn : css.row}
            >
              <span className={css.label}>{names[g.index] ?? g.group.name}</span>
              <span className={css.count}>{g.words.length}</span>
            </li>
          ))}
        </ul>
        <ul className={css.list}>
          {words.slice(Math.max(0, at - 7), Math.max(0, at - 7) + 15).map((w, i) => {
            const idx = Math.max(0, at - 7) + i
            return (
              <li key={w.word} className={inWords && idx === at ? css.rowOn : css.row}>
                {w.text}
              </li>
            )
          })}
        </ul>
      </div>
    </MenuScreen>
  )
}
