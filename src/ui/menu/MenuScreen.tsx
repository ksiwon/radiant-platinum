// 메뉴 창 한 장.
//
// 화면마다 같은 머리·바닥을 베껴 쓰고 있었다. 베껴 쓰면 한 곳만 고쳐지고
// 나머지가 조용히 옛 모양으로 남는다 — 실제로 그렇게 어긋나 있었다.
//
// 여기가 창의 **틀**이다. 각 화면은 본문만 넣는다.
//
// 층은 다섯이다 (SYSTEM §0 L1). 붙는 창(시작 메뉴)과 뜨는 창(갈래 · 예/아니오)은 이 틀이 아니고, 여기서 서는 것은
// 셋이다:
//
//   덮는 창   `variant: 'screen'`(기본) — 화면 하나. `SCREEN`을 넘지 않는다
//   가운데 창 `variant: 'center'`        — 덮는 창의 작은 꼴. 이름 짓기 · 메일 · 열매 태그. 크기는 내용에 맞춘다
//   연출      `cinematic`                — 창 얼굴과 테두리가 없다. 3D가 주인공이다 (진화 · 부화 · 교환 · 전당)
//
// ⚠️ **제목 글자로 가르지 않는다.** 한때 `title === '진화'` 따위로 연출을 골랐고, 제목이 바뀌면(번역 · 문구 다듬기)
// 그 화면의 3D가 조용히 불투명 창에 가려졌다. 가르는 것은 속성이다.
//
// ⚠️ **`message`는 DOM에서 맨 끝(foot 뒤)에 그린다.** 보이는 자리는 CSS `order`가 정한다 — 파티 하네스
// (`drive.mjs:3559`)가 그 순서를 읽는다 (`MessageDock`).
import type { CSSProperties, ReactNode } from 'react'
import { KeyHints } from '../common/KeyHints'
import { PageTabs, type PageTab } from '../common/PageTabs'
import * as css from './menuChrome.css'

/** 3D 구멍의 자리 — **창 기준** px (`MonViewport`). 창이 열리면서 6px 오르면 구멍도 같이 오른다 */
export interface HoleRect { x: number, y: number, w: number, h: number }

export function MenuScreen({
  title,
  icon,
  tabs,
  tag,
  note,
  foot,
  message,
  variant = 'screen',
  width,
  cinematic = false,
  bare = false,
  framed = false,
  hole,
  children,
}: {
  /** 화면 이름. `tabs`가 있으면 눈에는 안 보이고 읽어 주는 이름(`aria-label`)이 된다 */
  title: string
  /** 머리 왼쪽의 아이콘 32 — 시작 메뉴에서 열린 화면만 둔다 (`menuIcon`). 없는 아이콘을 지어내지 않는다 */
  icon?: ReactNode
  /** 있으면 탭이 제목 자리에 선다 */
  tabs?: { pages: readonly PageTab[], at: number, onPick?: (index: number) => void }
  /** 제목 옆에 붙는 표식 (시험용 화면의 "시험용"처럼) */
  tag?: ReactNode
  /** 오른쪽 위 — 소지금·마릿수처럼 이 화면의 한 줄 요약 */
  note?: ReactNode
  /** 바닥 조작 안내. 문자열이면 키만 키캡으로 감싼다 (`KeyHints`) */
  foot?: ReactNode
  /** 창 안 아래의 롬 글 띠 (`<MessageDock …/>`) */
  message?: ReactNode
  variant?: 'screen' | 'center'
  /** 가운데 창의 폭. 안 주면 내용에 맞춘다 */
  width?: number | string
  /** 연출 — 창 얼굴과 테두리가 없고 뒤의 3D를 안 가린다 */
  cinematic?: boolean
  /** 머리와 바닥이 없다 (기록 화면) */
  bare?: boolean
  /**
   * 3D가 주인공인 화면이라도 **창을 그린다.** 무대가 비어 뒤로 비칠 것이 없을 때다.
   *
   * ⚠️ 한때 명예의 전당이 기록이 없을 때도 투명 창이었다. 무대는 비워졌는데
   * (`HallOfFameStage`가 clear) 창 얼굴도 테두리도 없어서, 마트 진열대 위에
   * 머리·바닥 선 두 줄과 흐린 글자만 떠 있었다
   */
  framed?: boolean
  /** 3D 구멍 — 덮개와 창 얼굴에 직사각 구멍을 낸다. `true`면 클래스만 달고 자리는 `MonViewport`가 정한다 */
  hole?: HoleRect | true
  children: ReactNode
}) {
  const stage = cinematic && !framed
  const holed = hole !== undefined && !stage
  const windowClass = [
    stage ? css.cinematicScreen : variant === 'center' ? css.centerWindow : css.screen,
    holed ? css.screenHole : '',
  ].filter(Boolean).join(' ')
  const inline: CSSProperties = {
    ...(variant === 'center' && width !== undefined ? { width } : {}),
    ...(typeof hole === 'object'
      ? {
        ['--hole-x' as string]: `${String(hole.x)}px`,
        ['--hole-y' as string]: `${String(hole.y)}px`,
        ['--hole-w' as string]: `${String(hole.w)}px`,
        ['--hole-h' as string]: `${String(hole.h)}px`,
      }
      : {}),
  }
  return (
    <div className={stage ? css.cinematicOverlay : css.overlay}>
      <div className={windowClass} style={inline}>
        {!bare && (
          <div className={css.head}>
            <span className={css.crest} {...(tabs ? { role: 'group', 'aria-label': title } : {})}>
              {icon !== undefined && <span className={css.headIcon}>{icon}</span>}
              {tabs
                ? <PageTabs pages={tabs.pages} at={tabs.at} {...(tabs.onPick ? { onPick: tabs.onPick } : {})} />
                : <span className={css.crestText}>{title}</span>}
              {tag}
            </span>
            {note !== undefined && <span className={css.headNote}>{note}</span>}
          </div>
        )}
        {children}
        {!bare && foot !== undefined && (
          <div className={css.foot}>
            {typeof foot === 'string' ? <KeyHints text={foot} /> : foot}
          </div>
        )}
        {message}
      </div>
    </div>
  )
}
