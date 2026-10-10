// 「더보기」 — 타이틀 줄의 「더보기」 칸 위로 뜨는 창.
//
// 왜 한 겹을 더 두는가: 타이틀에 여덟 칸이 서 있었는데, **하러 온 일은 앞의 넷**
// (시작·이어하기·세이브 파일 둘)이고 나머지 넷은 그 자리에 있을 뿐 급한 것이
// 아니다. 여덟을 한 줄로 세우면 「무엇부터 하나」에 화면이 답을 안 해 준다.
//
// ⚠️ **커서가 도는 것과 보이는 것이 같아야 한다.** 이 화면이 이미 한 번 겪은
// 자리다 (`TitleScreen`의 「밖에 세우면 여섯이 보이는데 커서는 다섯만 돈다」).
// 그래서 여기도 ↑↓로 돌고 Z·Enter로 고르고 X·Esc로 닫는다. 「돌아가기」 단추는 없다 —
// X · Esc · 바깥 클릭 · 「더보기」 다시 누르기가 닫는다.
//
// ⚠️ **점을 위로 올린다.** 패치노트의 「안 본 판」 점이 이 창 안에만 있으면,
// 창을 열지 않는 사람에게는 새 소식이 영영 안 보인다 — 타이틀의 「더보기」가
// 그 점을 대신 지고 있어야 한다 (`TitleScreen`의 `newPatch`).
//
// 줄의 부연은 전부 사실이다: 설정은 타이틀에서도 열린다는 것, 패치노트는 지금 판과 날짜,
// 버그 제보는 어디로 가는지, 다른 게임은 무엇인지.
import { useRef, useState } from 'react'
import { KeyHints } from '../common/KeyHints'
import { bandAt } from '../common/pickBand'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import { pointerMoved } from '../pointerMoved'
import { caret, pickBand } from '../theme/window.css'
import { PopAbove } from './PopAbove'
import { NOTES } from './patchLog'
import * as css from './moreMenu.css'

interface Props {
  onOptions: () => void
  onPatchNotes: () => void
  onBugReport: () => void
  onOtherGames: () => void
  /** 안 본 판이 있나 — 「패치노트」 줄에 점을 띄운다 */
  newPatch: boolean
  /** 꼭지가 가리킬 「더보기」 칸 */
  anchor?: HTMLElement | null
  onClose: () => void
}

export function MoreMenu({
  onOptions, onPatchNotes, onBugReport, onOtherGames, newPatch, anchor = null, onClose,
}: Props) {
  const [cursor, setCursor] = useState(0)
  const items = useRef<(HTMLButtonElement | null)[]>([])

  const latest = NOTES[0]
  const entries = [
    { key: 'options', label: '설정', sub: '게임을 열기 전에도 바꿀 수 있습니다', go: onOptions },
    {
      key: 'patch', label: '패치노트', go: onPatchNotes, dot: newPatch,
      sub: latest === undefined ? '' : `${latest.v} · ${latest.date}`,
    },
    { key: 'bug', label: '버그 제보', sub: '만든 사람에게 곧장 갑니다', go: onBugReport },
    { key: 'more', label: '이런 게임은 어떠세요?', sub: '같은 사람이 만든 포켓몬 웹 게임', go: onOtherGames },
  ]

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, entries.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, entries.length)) },
    left: () => { setCursor((c) => clampCursor(c, -1, entries.length)) },
    right: () => { setCursor((c) => clampCursor(c, 1, entries.length)) },
    confirm: () => { items.current[cursor]?.click() },
    cancel: onClose,
  })

  return (
    <>
      {/* 창 바깥을 누르면 닫힌다 */}
      <div className={css.backdrop} onClick={onClose} />
      <PopAbove anchor={anchor} width={css.WIDTH}>
        <div className={css.list}>
          <span className={pickBand.y} aria-hidden style={bandAt('y', cursor, css.ROW)}>
            <span className={caret} />
          </span>
          {entries.map((entry, i) => (
            <button
              key={entry.key}
              ref={(node) => { items.current[i] = node }}
              type="button"
              aria-label={entry.label}
              className={i === cursor ? `${css.item} ${css.itemOn}` : css.item}
              onClick={entry.go}
              onPointerMove={(e) => { if (pointerMoved(e)) setCursor(i) }}
            >
              <span className={css.name} aria-hidden>
                {entry.label}
                {entry.dot === true && <span className={css.dot} />}
              </span>
              <span className={i === cursor ? `${css.sub} ${css.subOn}` : css.sub} aria-hidden>{entry.sub}</span>
            </button>
          ))}
        </div>
        <div className={css.foot}><KeyHints text="↑↓ 고르기 · Z 열기 · X 닫기" /></div>
      </PopAbove>
    </>
  )
}
