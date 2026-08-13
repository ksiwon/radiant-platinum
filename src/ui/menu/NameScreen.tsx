// 이름 짓기 (`OpenPokemonNamingScreen`, DATA.md §2.10)
//
// 잔모래마을 연구소에서 마박사가 "별명을 지어 주겠나?"라고 묻는 그 자리다.
// 스크립트가 열고, 답이 나올 때까지 스크립트가 선다.
//
// **자판을 원작처럼 안 그린다.** 원작은 NDS 터치 자판이라 한글 자모를 조합하는
// 판이 따로 있는데, 우리는 키보드가 있는 기계에서 돌고 인트로의 이름 입력도
// 이미 `<input>` 하나다 (`ui/intro`). 두 자리가 다른 방식이면 그게 더 이상하다.
//
// ⚠️ **길이는 원작 값이다.** `constants/string.h`의 `MON_NAME_LEN`이 10이다 —
// 우리가 정한 상한이 아니다.
import { useEffect, useState } from 'react'
import { loadUiText, NAMING_TEXT } from '../../data/uiText'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { formatMessage, MessageSlots } from '../../engine/script/text'
import * as css from './dialog.css'
import { naming } from './namingAnswer'
import * as own from './nameScreen.css'

/** 이름 짓기 화면의 글 뱅크 (`TEXT_BANK_NAMING_SCREEN`) */
const NAMING_BANK = 'naming'

export function NameScreen() {
  const what = useMenuStore((s) => s.naming)
  const closeAll = useMenuStore((s) => s.closeAll)
  const locale = useGameLocale()
  const [prompt, setPrompt] = useState('')
  const [draft, setDraft] = useState(what?.initial ?? '')

  useEffect(() => {
    let alive = true
    void loadUiText(NAMING_BANK, locale)
      .then((bank) => {
        if (!alive) return
        // `{STRVAR_1 1, 0, 0}의 이름은?` — 0번 칸에 지금 이름이 들어간다.
        // `{SCREEN 0}`은 예/아니오를 부르는 부호라 글로는 안 나온다
        const slots = new MessageSlots()
        slots.set(0, what?.initial ?? '')
        // 무엇의 이름인가에 따라 물음이 다르다 — 별명은 1번, 석판은 6번이다
        const line = what?.kind === 'tablet' ? NAMING_TEXT.tablet : NAMING_TEXT.pokemon
        setPrompt(formatMessage(bank[line] ?? '', slots).trim())
      })
      .catch(() => { setPrompt('') })
    return () => { alive = false }
  }, [locale, what])

  /**
   * 결정한다. **빈 이름은 안 바꾼 것으로 친다** — 원작도 이름을 비우면 종족
   * 이름으로 되돌린다(`Pokemon_SetValue`가 기본 이름을 다시 넣는다)
   */
  const done = (name: string): void => {
    if (!what) return
    naming.answer = { name: name.trim(), slot: what.slot, kind: what.kind }
    closeAll()
  }

  /**
   * Esc로 그냥 지나간다 — 원작의 B다.
   *
   * ⚠️ **`useMenuKeys`를 못 쓴다.** 그쪽은 X와 Backspace도 "물러난다"로 잡고
   * `preventDefault`까지 하는데, 여기는 글자를 치는 자리라 그러면 이름에 x를
   * 못 넣고 지우지도 못한다. 그래서 Esc 하나만 따로 듣는다.
   *
   * 마우스 없이도 이 화면을 빠져나갈 수 있어야 한다 — Enter로 결정, Esc로 통과
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape' || what === null) return
      e.preventDefault()
      done('')
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  })

  if (!what) return null

  return (
    <div className={css.center}>
      <div className={own.card}>
        <p className={own.prompt}>{prompt || '별명을 지어 주세요'}</p>
        <form
          className={own.row}
          onSubmit={(e) => { e.preventDefault(); done(draft) }}
        >
          <input
            className={own.input}
            value={draft}
            maxLength={what.max}
            autoFocus
            onChange={(e) => { setDraft(e.target.value) }}
            aria-label="별명"
          />
          <button className={own.ok} type="submit">결정</button>
        </form>
        {/*
          안 짓고 넘어갈 수 있어야 한다. 원작도 여기서 B를 누르면 별명 없이
          지나가고, 스크립트가 그 답(1)으로 갈라진다
        */}
        <button className={own.skip} type="button" onClick={() => { done('') }}>
          그대로 두기
        </button>
      </div>
    </div>
  )
}
