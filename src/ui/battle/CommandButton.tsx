// 배틀 화면의 명령 한 칸 — **여덟 자리가 같은 것을 그린다** (REPAIR §9)
//
// 싸운다/가방/포켓몬/도망 · 사파리 넷 · 시합규칙 「교체」의 예·아니오 ·
// 「누구에게?」 · 기술 넷 · 기술을 배우는 화면의 셋. 전부 같은 열한 줄이었다 —
// 커서 삼각형, 왼쪽 점, 이름과 밑줄 한 쌍, 그리고 오른쪽에 붙는 것.
//
// ⚠️ **모양이 갈리면 눈으로만 잡힌다.** 재질 두 벌이 로토무 방 벽을 흰색으로
// 세웠던 것과 같은 갈래다 — 칸 하나에 점을 하나 더 달면 나머지 일곱은 안 따라온다.
import type { ReactNode } from 'react'
import * as css from './battleScreen.css'

export function CommandButton({
  on, label, sub, right, tint, disabled, onClick,
}: {
  /** 커서가 이 칸에 있는가. 삼각형과 밝기가 여기서 갈린다 */
  on: boolean
  label: ReactNode
  /**
   * 이름 아래 작은 줄. **글이면 여기서 감싼다** — 여덟 중 다섯이 글 한 줄이라
   * 부르는 쪽마다 `subLine`을 다시 적게 하지 않는다. 타입·상성처럼 여러 조각이
   * 한 줄에 서는 자리는 만들어서 넘긴다
   */
  sub?: ReactNode
  /** 오른쪽에 붙는 것. 기술 칸의 PP가 여기다 */
  right?: ReactNode
  /** 칸 색 (`--tint`). 안 주면 css의 기본값이다 */
  tint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`${css.button} ${on ? css.buttonOn : ''}`}
      style={tint === undefined ? undefined : { ['--tint' as string]: tint }}
      onClick={onClick}
      disabled={disabled}
    >
      {on && <span className={css.caret} aria-hidden />}
      <span className={css.face}>
        <span className={css.dot} aria-hidden />
        <span className={css.labelCol}>
          <span className={css.label}>{label}</span>
          {typeof sub === 'string' ? <span className={css.subLine}>{sub}</span> : sub}
        </span>
        {right}
      </span>
    </button>
  )
}
