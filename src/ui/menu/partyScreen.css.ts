// 포켓몬 화면 — 판 여섯이 화면을 채운다 (DESIGN.md §5).
//
// 원작 배치를 그대로 옮겼다. 판 하나가 16×6타일(128×48)이고 두 줄 세 칸인데,
// **오른쪽 줄이 한 타일 내려가 있다** (`sMemberPanelTemplates`: 왼쪽이
// y=0·6·12, 오른쪽이 y=1·7·13). 그 어긋남이 여섯을 한 덩어리가 아니라 여섯으로
// 보이게 하는 것이고, 판이 화면 아래까지 내려와서 빈자리가 안 남는다.
//
// ⚠️ **오른쪽에 상세 칸을 세우지 않는다.** 한때 여기가 「왼쪽 카드 / 오른쪽
// 능력·기술」이었다 — 원작에 없는 칸이고(능력은 요약 화면이 맡는다), 그
// 배치가 곧 설정 앱의 배치다. 갈래 메뉴는 원작처럼 **판 위에 창 하나**로 뜬다.
//
// ⚠️ 카드에서 제일 커야 할 것은 **그림**이다. 전에는 62픽셀짜리 그림 옆에
// 테두리·그림자·비스듬한 모서리가 붙어서, 정작 포켓몬은 작고 장식만 컸다.
//
// ⚠️ **색은 여기서 안 고른다** (DESIGN.md §2). HP 세 색은 원작 팔레트에서 오고
// (`party_menu/menu.pal`), 판 색도 같은 팔레트에서 왔다. 고른 판은 금 테두리다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { BAR_FILL, BAR_TRACK, PICKED, STATUS_TAG, WINDOW_SMALL } from '../theme/window.css'

/**
 * 판 여섯. 두 줄 세 칸으로 **본문을 꽉 채운다**.
 *
 * `1fr` 세 줄이라 창이 커지면 판이 커진다 — 여기서만은 그게 맞다. 원작도
 * 판이 화면 전체를 나눠 갖지, 위쪽에 몰려 있지 않다
 */
export const grid = style({
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
  gap: GAP.small,
})

/** 오른쪽 줄이 내려간 만큼. 원작이 한 타일(판 높이의 1/6)이다 */
const STAGGER = 22

/**
 * 판 하나.
 *
 * 면과 테두리가 원작 팔레트에서 온다 — 판이 색을 갖고 있어야 여섯이 판으로
 * 읽힌다. 얇은 선 하나로 두면 큰 빈 상자 여섯이 된다
 */
export const card = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.base,
  minHeight: 0,
  padding: `0 ${GAP.base}px`,
  borderRadius: RADIUS.cell,
  background: `linear-gradient(180deg, ${vars.window.faceTop} 0%, ${vars.panel.face} 100%)`,
  boxShadow: `inset 0 0 0 1px ${vars.panel.edge}`,
})

/** 오른쪽 줄. 원작처럼 한 칸 내려 세운다 */
export const cardRight = style({ marginTop: STAGGER })

/** 선두는 왼쪽 모서리를 크게 깎는다 — 원작 판도 첫 칸만 그 모양이다 */
export const cardLead = style({
  borderTopLeftRadius: RADIUS.window + 6,
  borderBottomLeftRadius: RADIUS.window + 6,
})

export const cardOn = style({
  ...PICKED,
  background: `linear-gradient(180deg, ${vars.window.faceTop} 0%, ${vars.panel.face} 100%)`,
})

/**
 * 빈 자리.
 *
 * 원작은 여섯 칸을 늘 그린다. 안 채워진 칸은 얇은 점선 자리로 남아서
 * 「여섯 중 몇」이 화면에 그대로 보인다
 */
export const cardEmpty = style([card, {
  background: 'none',
  boxShadow: 'none',
  border: `1px dashed ${vars.window.rule}`,
}])

/**
 * 쓰러진 판.
 *
 * 원작도 **색으로 말한다** — 기절한 칸만 팔레트가 주황으로 바뀐다
 * (`main.c:1426`의 `palette += 2`). 우리도 흐리게 죽이는 대신 그 색을 쓴다.
 * 그림만 회색으로 빼서 「이 마리가 못 싸운다」가 두 번 보이게 한다
 */
export const cardFainted = style({
  background: `linear-gradient(180deg, ${vars.window.faceTop} 0%, ${vars.panel.faintedFace} 100%)`,
  boxShadow: `inset 0 0 0 1px ${vars.panel.faintedEdge}`,
})

/**
 * 그림 자리.
 *
 * 원작 배틀 그림(80×80)을 그대로 쓴다 — 파티용 아이콘을 따로 안 뽑았고,
 * 지어내는 것보다 있는 그림이 낫다. 못 받으면 빈 칸으로 남는다
 */
export const portrait = style({
  width: 96,
  height: 96,
  maxHeight: '86%',
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  objectFit: 'contain',
})

/** 쓰러진 마리의 그림만 회색으로. 판 색은 `cardFainted`가 따로 말한다 */
export const portraitDown = style([portrait, { filter: 'grayscale(0.85)', opacity: 0.6 }])

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: GAP.tight,
  minWidth: 0,
  flex: 1,
})

export const nameRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.tight + 2,
  minWidth: 0,
})

export const name = style({
  fontSize: TEXT.base,
  fontWeight: 700,
  color: vars.ink.strong,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const male = style({ color: vars.state.male, fontWeight: 700 })
export const female = style({ color: vars.state.female, fontWeight: 700 })

export const level = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontSize: TEXT.small,
  fontFamily: vars.font.mono,
  color: vars.ink.dim,
})

/** 상태 이상. 색이 무엇에 걸렸는지를 나른다 — 배틀 화면과 **같은 것**이다 */
export const status = style([STATUS_TAG, { flex: '0 0 auto' }])

export const barRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.tight + 2,
})

/** 원작 체력판의 `HP` 글자 */
export const hpTag = style({
  flex: '0 0 auto',
  fontSize: TEXT.tiny,
  fontWeight: 800,
  fontStyle: 'italic',
  color: vars.ink.dim,
})

/** 막대의 홈. 짙은 테두리 안에 흰 바탕 — 원작 구조다 (DESIGN.md §1.3) */
export const hpTrack = style({
  position: 'relative',
  display: 'block',
  flex: 1,
  height: 9,
  ...BAR_TRACK,
})

/**
 * ⚠️ `display: block`이 **꼭 있어야 한다.**
 *
 * `<span>`은 인라인이라 `width`도 `height`도 안 먹는다. 그래서 색을 제대로
 * 골라 넣고도 화면에는 게이지가 통째로 검게 떴다 — 홈이 보이고 채움이 없었다.
 * 스타일만 보면 멀쩡해서 눈으로는 원인이 안 보이는 자리다
 *
 * 결 넷은 원작 그대로다: 본색 1줄 · 밝은 쪽 2줄 · 본색 1줄
 */
export const hpFill = style({
  ...BAR_FILL,
  display: 'block',
  transition: 'width 220ms linear',
})

export const hpText = style({
  flex: '0 0 auto',
  minWidth: 58,
  textAlign: 'right',
  fontSize: TEXT.tiny,
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
  color: vars.ink.dim,
})

/** 자리를 바꾸려고 집어 든 카드 */
export const cardHeld = style({
  outline: `${EDGE.bar}px dashed ${vars.pick.edge}`,
  outlineOffset: -2,
})

/**
 * 갈래 메뉴 (`GetContextMenuEntriesForPartyMon`).
 *
 * 원작은 **오른쪽 아래 구석에 창 하나**로 뜬다. 판 위에 겹친다 — 판 여섯이
 * 화면을 다 쓰므로 겹치는 것 말고는 놓을 자리가 없고, 원작도 그렇게 한다.
 * 가리는 것은 오른쪽 아래 판 하나뿐이고 고르는 마리는 왼쪽에 남는다
 */
export const choices = style({
  ...WINDOW_SMALL,
  position: 'absolute',
  right: GAP.base,
  bottom: GAP.base,
  zIndex: 2,
  minWidth: 240,
  maxWidth: 360,
  padding: `${GAP.small}px ${GAP.base}px ${GAP.base}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
})

export const choiceAsk = style({
  fontSize: TEXT.base,
  fontWeight: 600,
  whiteSpace: 'pre-line',
  lineHeight: 1.5,
  marginBottom: GAP.small,
})

export const choice = style({
  padding: `5px ${GAP.small + 2}px`,
  borderRadius: RADIUS.cell,
  fontSize: TEXT.base,
})

export const choiceOn = style([choice, {
  ...PICKED,
  fontWeight: 600,
}])
