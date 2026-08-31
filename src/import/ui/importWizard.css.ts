// 설치 화면 — **사람이 이 게임에서 제일 먼저 보는 화면이다.**
//
// ⚠️ 한때 이 화면이 SaaS 온보딩 페이지였다. 남색 세로 그러데이션, 모서리 16에
// `0 24px 64px` 그림자를 단 카드, ①②③④ 번호 단계 카드, `●/○` 상태 점,
// 알약 단추, 파랑→초록 그러데이션 진행 막대, 호박색 alert 카드. 「AI가 만든
// 화면」을 알아보는 표식 목록에 있는 것이 여덟 개나 한 화면에 있었다
// (DESIGN.md §0). 포켓몬은 배경 그림 한 장뿐이었다.
//
// 지금은 **창 한 벌을 쓴다** (DESIGN.md §3·§6). 지어내도 되는 것은 무엇을
// 담는가지 무엇으로 그리는가가 아니다.
import { style } from '@vanilla-extract/css'
import { vars } from '../../ui/theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../../ui/theme/scale'
import { BAR_FILL, BAR_TRACK, PICKED, RULE, WINDOW } from '../../ui/theme/window.css'

export const wrap = style({
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  overflowY: 'auto',
  padding: 'clamp(20px, 4vh, 48px) clamp(16px, 4vw, 56px)',
  color: vars.ink.normal,
  fontFamily: vars.font.ui,
})

/**
 * 타이틀 그림 — **이 화면이 곧 첫 화면이다.**
 *
 * 설치 전에는 `BootGate`가 `<App/>`을 아예 안 그리므로(그리면 타이틀 음악·UI
 * 글·맵 미리받기가 그 자리에서 요청으로 나간다) 사용자가 처음 만나는 것은
 * 타이틀이 아니라 여기다. 그러니 여기가 타이틀처럼 보여야 한다.
 *
 * ⚠️ **이 그림은 앱 셸이라 설치 전에도 있다** (`tools/distribution/appShell.mjs`).
 * `/data`·`/models`가 아니므로 「미설치에서 콘텐츠 요청 0건」(e2e ①)도 그대로다.
 *
 * ⚠️ **글을 위해 그림을 더 죽이지 않는다.** 읽히게 하는 일은 `sheet`의 창이
 * 맡는다. 여기서 더 어둡게 깔면 창 바깥까지 같이 어두워져 그림을 넣은 뜻이
 * 없어진다 — 창이 덮지 않는 가장자리에서만 보이면 된다
 */
export const sky = style({
  position: 'fixed',
  inset: 0,
  zIndex: -2,
  backgroundColor: vars.scrim.deep,
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
  backgroundImage: [
    `linear-gradient(180deg, ${vars.scrim.over} 0%, ${vars.scrim.deep} 100%)`,
    "url('/assets/radiant-platinum-intro.webp')",
  ].join(', '),
})

/** 화면에 보이는 제목. 비공식 고지가 바로 아래 붙는다 (COPYRIGHT.md §11) */
export const crest = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight,
})

export const crestName = style({
  margin: 0,
  fontSize: TEXT.big,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const crestNote = style({
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
})

/**
 * 준비물 둘.
 *
 * ⚠️ **맨 앞에 둔다.** 이 화면에서 사람이 제일 먼저 알아야 하는 것은 단계
 * 목록이 아니라 **무엇을 미리 갖고 와야 하는가**다. 그것이 없으면 아래를
 * 아무리 읽어도 할 수 있는 것이 없다
 */
export const lead = style({
  padding: `${GAP.base + 2}px ${GAP.wide}px`,
  borderRadius: RADIUS.cell,
  boxShadow: `inset 0 0 0 ${EDGE.bar}px ${vars.window.edge}`,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small,
})

export const leadHead = style({
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const needs = style({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight + 2,
  fontSize: TEXT.small,
  lineHeight: 1.7,
})

/** 준비됐는가. 초록이면 그 하나는 끝난 것이다 */
export const needMark = style({
  marginRight: GAP.small,
  fontSize: TEXT.tiny,
})

/**
 * 비공식 고지 — 설치 전 사용자는 타이틀을 못 보므로 **여기가 유일한 자리다**.
 *
 * ⚠️ 제목 바로 아래다. 아래쪽 끝에 두었더니 세 화면쯤 스크롤해야 나왔다 —
 * 문서에 있는 것과 눈에 띄는 것은 다르다 (COPYRIGHT.md §11)
 */
export const disclaimer = style({
  margin: 0,
  fontSize: TEXT.tiny,
  lineHeight: 1.7,
  // 흐리게 두지 않는다 — 이건 **보여야 하는** 고지다 (COPYRIGHT.md §11)
  color: vars.ink.normal,
})

/**
 * 글이 얹히는 창.
 *
 * ⚠️ **창이 없으면 못 읽는다.** 한동안 배경 그림 위에 글을 그대로 올렸는데,
 * 상자를 두른 것(준비물·배너)만 읽히고 상자 없는 긴 문단과 맨 위 고지가
 * 워드마크의 밝은 금속 부분과 겹쳐 사라졌다 — 실제 배포에서 눈으로 확인했다.
 * 그림을 더 어둡게 덮는 길도 있지만 그러면 그림이 없는 것과 같아진다.
 * **글에는 창을 주고 그림은 창 바깥에서 보이게** 한다
 */
export const sheet = style({
  ...WINDOW,
  position: 'relative',
  maxWidth: 760,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.wide + 2,
  padding: 'clamp(18px, 3vh, 30px) clamp(16px, 3vw, 30px)',
})

export const title = style({
  margin: 0,
  fontSize: TEXT.big - 4,
  color: vars.ink.strong,
})

/** 지금 판이 어디까지인지. **첫 화면에서 감추지 않는다** */
export const banner = style({
  padding: `${GAP.base}px ${GAP.base + 2}px`,
  borderRadius: RADIUS.cell,
  fontSize: TEXT.small,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
  ...PICKED,
})

/**
 * 한 단계.
 *
 * ⚠️ **판 안에 판을 쌓지 않는다.** 창 안에서 갈래를 나누는 것은 선 하나면
 * 된다 — 단계마다 카드를 깔면 그 순간 「번호 매긴 단계 카드」가 된다.
 */
export const step = style({
  paddingTop: GAP.base + 2,
  borderTop: RULE,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.small + 2,
})

export const stepHead = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.small + 2,
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.strong,
})

export const stepNote = style({
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
  fontWeight: 400,
})

export const body = style({
  fontSize: TEXT.small,
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
})

export const ok = style({ color: vars.state.good })
export const bad = style({ color: vars.state.bad })

export const row = style({
  display: 'flex',
  gap: GAP.small + 2,
  flexWrap: 'wrap',
  alignItems: 'center',
})

/**
 * 단추.
 *
 * ⚠️ **알약이 아니다** (DESIGN.md §2 금지 목록). 창 한 벌의 모서리를 쓴다.
 */
export const button = style({
  appearance: 'none',
  padding: `${GAP.small}px ${GAP.base + 2}px`,
  fontFamily: vars.font.ui,
  fontSize: TEXT.small,
  fontWeight: 700,
  color: vars.pick.text,
  background: vars.pick.face,
  border: `${EDGE.bar}px solid ${vars.pick.edge}`,
  borderRadius: RADIUS.cell,
  cursor: 'pointer',
  selectors: {
    '&:disabled': { opacity: 0.4, cursor: 'default' },
    '&:hover:not(:disabled)': { borderColor: vars.bar.edge },
  },
})

export const groups = style({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  gap: `${GAP.tight}px ${GAP.base}px`,
  fontSize: TEXT.small,
  alignItems: 'baseline',
})

/** 진행 막대. 원작 막대와 같은 구조다 — 짙은 테두리 안에 흰 바탕 */
export const bar = style({
  height: 9,
  ...BAR_TRACK,
})

export const barFill = style({
  ...BAR_FILL,
  vars: { '--lit': vars.bar.expLit, '--body': vars.bar.exp },
  transition: 'width 120ms linear',
})

export const list = style({
  margin: 0,
  paddingLeft: GAP.wide + 2,
  fontSize: TEXT.small,
  lineHeight: 1.8,
  color: vars.ink.normal,
})
