// 메뉴 창 한 장.
//
// 화면마다 같은 머리·바닥을 베껴 쓰고 있었다. 베껴 쓰면 한 곳만 고쳐지고
// 나머지가 조용히 옛 모양으로 남는다 — 실제로 그렇게 어긋나 있었다.
//
// 여기가 창의 **틀**이다. 각 화면은 본문만 넣는다.
import type { ReactNode } from 'react'
import * as css from './menuChrome.css'

export function MenuScreen({
  title,
  tag,
  note,
  foot,
  framed,
  children,
}: {
  title: string
  /** 제목 옆에 붙는 표식 (시험용 화면의 "시험용"처럼) */
  tag?: ReactNode
  /** 오른쪽 위 — 소지금·마릿수처럼 이 화면의 한 줄 요약 */
  note?: ReactNode
  /** 바닥 조작 안내 */
  foot?: ReactNode
  /**
   * 3D가 주인공인 화면이라도 **창을 그린다.** 무대가 비어 뒤로 비칠 것이 없을 때다.
   *
   * ⚠️ 한때 명예의 전당이 기록이 없을 때도 투명 창이었다. 무대는 비워졌는데
   * (`HallOfFameStage`가 clear) 창 얼굴도 테두리도 없어서, 마트 진열대 위에
   * 머리·바닥 선 두 줄과 흐린 글자만 떠 있었다
   */
  framed?: boolean
  children: ReactNode
}) {
  // 3D 무대가 창 뒤를 채우는 화면 — 진화·부화·명예의 전당. 창 얼굴을 안 칠한다
  const cinematic = !framed && (title === '진화' || title === '알' || title === '명예의 전당')
  return (
    <div className={cinematic ? css.cinematicOverlay : css.overlay}>
      <div className={cinematic ? css.cinematicScreen : css.screen}>
        <div className={css.head}>
          <span className={css.crest}>
            <span className={css.crestText}>{title}</span>
            {tag}
          </span>
          {note !== undefined && <span className={css.headNote}>{note}</span>}
        </div>
        {children}
        {foot !== undefined && <div className={css.foot}>{foot}</div>}
      </div>
    </div>
  )
}
