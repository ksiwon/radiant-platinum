// 편지지 한 장 (text-screens §6 `MailSheet`) — 낱말 칸 여섯 · 서명 · 새겨진 아이콘 셋. 읽기와 쓰기가 같이 쓴다.
//
// 종이 그림은 구워 둔 편지지 열둘(`mailArt`, 칸 번호 = 편지 종류)이고 정수 2배로 깐다. 그림이 안 구워졌거나 못 받으면
// (`loadMailArt` → `null`) 같은 크기의 `PaperSheet` 종이로 서고 글자는 그대로 읽힌다 — 설치본에 그림만 빠져도 편지는 열린다.
//
// 쓰는 쪽(`MailScreen` · 낱말 두 화면)이 고른 칸 번호(`at`)를 주면 그 칸이 금 테두리로 선다. `preview`는 그 칸에 **아직
// 확정 안 한** 낱말을 미리 보인다 (낱말 목록을 훑는 동안).
import { useEffect, useState } from 'react'
import { loadMailArt, loadPokeIcons } from '../../data/gameData'
import type { PokeIcons } from '../../data/schema'
import type { SpriteSheet } from '../../data/spriteSheet'
import { EASY_CHAT_WORD_NONE } from '../../engine/world/easyChat'
import { MAIL_ICONS, MAIL_LINES, MAIL_WORDS_PER_LINE } from '../../engine/world/mail'
import { pixelSprite } from '../common/pixelSprite'
import { PIXEL } from '../theme/scale'
import type { WordLookup } from './easyChatWords'
import { PaperSheet } from './PaperSheet'
import { monIconAt } from './pokeIcon'
import * as css from './mailSheet.css'

export interface MailSheetIcon { species: number, form: number, isEgg: boolean }

/** 쓰는 편지에 새겨질 아이콘 — **고른 자리부터 파티 끝까지** 최대 셋이다 (`Mail_SetTrainerAndIconData`) */
export function mailSheetIcons(party: readonly MailSheetIcon[], slot: number): MailSheetIcon[] {
  return party.slice(slot, slot + MAIL_ICONS).map((m) => ({ species: m.species, form: m.form, isEgg: m.isEgg }))
}

/** 칸의 글. 빈 칸은 빈 글이다 — 그리는 쪽이 「…」로 바꾼다 */
export function slotText(
  lines: readonly (readonly number[])[], line: number, word: number, lookup: WordLookup | null,
): string {
  const value = lines[line]?.[word] ?? EASY_CHAT_WORD_NONE
  return lookup && value !== EASY_CHAT_WORD_NONE ? lookup(value) : ''
}

export function MailSheet(
  { lines, lookup, type, icons = [], signer = '', at, preview }: {
    lines: readonly (readonly number[])[]
    lookup: WordLookup | null
    /** 편지 종류 (0~11) — 구운 그림의 칸 번호다 */
    type: number
    /** 새겨진 아이콘 (최대 셋) */
    icons?: readonly MailSheetIcon[]
    signer?: string
    /** 고른 칸 (`줄 × 2 + 낱말`). 없으면 커서가 없다 (읽기) */
    at?: number
    /** 고른 칸에 미리 보일 낱말 글 */
    preview?: string
  },
) {
  const [art, setArt] = useState<SpriteSheet | null>(null)
  const [pokeIcons, setPokeIcons] = useState<PokeIcons>()
  useEffect(() => {
    let alive = true
    void loadMailArt().then((sheet) => { if (alive) setArt(sheet) })
    void loadPokeIcons()
      .then((got) => { if (alive) setPokeIcons(got) })
      .catch(() => { /* 못 받으면 아이콘 칸만 빈다 */ })
    return () => { alive = false }
  }, [])

  const rows = (
    <>
      <div className={css.plate}>
        {Array.from({ length: MAIL_LINES }, (_, line) => (
          <div key={line} className={css.words}>
            {Array.from({ length: MAIL_WORDS_PER_LINE }, (_, word) => {
              const slot = line * MAIL_WORDS_PER_LINE + word
              const on = at === slot
              const text = on && preview !== undefined && preview !== '' ? preview : slotText(lines, line, word, lookup)
              return (
                <span
                  key={word}
                  className={[css.slot, text === '' ? css.slotEmpty : '', on ? css.slotOn : ''].filter(Boolean).join(' ')}
                >
                  {text === '' ? '…' : text}
                </span>
              )
            })}
          </div>
        ))}
      </div>
      {icons.length > 0 && (
        <div className={css.icons} aria-hidden="true">
          {icons.map((mon, i) => <div key={i} style={monIconAt(pokeIcons, mon, PIXEL.x1)} />)}
        </div>
      )}
      {signer !== '' && <div className={css.signer}>{signer}</div>}
    </>
  )

  if (art === null) {
    return (
      <PaperSheet lined={false} margin={false} fill className={`${css.sheet} ${css.plain}`}>
        {rows}
      </PaperSheet>
    )
  }
  return (
    <div className={css.sheet} style={pixelSprite(art, type, PIXEL.x2)}>
      {rows}
    </div>
  )
}
