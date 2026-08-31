// 포켓몬 화면.
//
// 카드 여섯 장이다. 글줄 여섯 개로는 무엇을 데리고 다니는지가 안 읽힌다 —
// 원작 파티 화면이 카드인 이유가 그거다.
//
// ⚠️ 카드에서 제일 커야 할 것은 **그림**이다. 전에는 62픽셀짜리 그림 옆에
// 테두리·그림자·비스듬한 모서리가 붙어서, 정작 포켓몬은 작고 장식만 컸다.
// 카드 높이를 줄이고 그림을 그 높이에 꽉 채운다.
//
// ⚠️ **색은 여기서 안 고른다** (DESIGN.md §2). HP 세 색은 원작 팔레트에서 오고
// (`party_menu/menu.pal`), 고른 카드는 금 테두리다.
import { style } from '@vanilla-extract/css'
import { vars } from '../theme/contract.css'
import { EDGE, GAP, RADIUS, TEXT } from '../theme/scale'
import { BAR_FILL, BAR_TRACK, PICKED } from '../theme/window.css'

/** 카드 여섯 장. 두 줄로 세우고 선두만 위로 뺀다 */
export const grid = style({
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: GAP.small,
  alignContent: 'start',
  paddingRight: GAP.tight + 2,
  scrollbarWidth: 'thin',
})

/**
 * 카드 하나.
 *
 * 안 고른 카드는 얇은 선 하나뿐이다. 목록의 줄과 같은 규칙이다 —
 * 눈에 띄어야 하는 것은 고른 하나지 여섯 개의 테두리가 아니다
 */
export const card = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small,
  height: 64,
  padding: `0 ${GAP.small + 2}px 0 ${GAP.tight + 2}px`,
  borderRadius: RADIUS.cell,
  boxShadow: `inset 0 0 0 1px ${vars.window.rule}`,
})

/** 선두는 한 줄을 통째로 쓴다. 원작도 첫 칸만 따로 띄운다 */
export const cardLead = style([card, {
  gridColumn: '1 / -1',
  height: 84,
}])

export const cardOn = style({
  ...PICKED,
})

/**
 * 빈 자리.
 *
 * 원작은 여섯 칸을 늘 그린다. 안 채워진 칸은 얇은 점선 자리로 남아서
 * 「여섯 중 몇」이 화면에 그대로 보인다
 */
export const cardEmpty = style([card, {
  boxShadow: 'none',
  border: `1px dashed ${vars.window.rule}`,
}])

/** 쓰러진 카드는 눈에 띄게 죽인다 — 회복해야 할 것이 한눈에 보여야 한다 */
export const cardFainted = style({
  filter: 'grayscale(0.8)',
  opacity: 0.55,
})

/**
 * 그림 자리.
 *
 * 원작 배틀 그림(80×80)을 그대로 쓴다 — 파티용 아이콘을 따로 안 뽑았고,
 * 지어내는 것보다 있는 그림이 낫다. 못 받으면 빈 칸으로 남는다
 */
export const portrait = style({
  width: 58,
  height: 58,
  flex: '0 0 auto',
  imageRendering: 'pixelated',
  objectFit: 'contain',
})

export const portraitLead = style([portrait, { width: 78, height: 78 }])

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

/** 상태 이상. 색이 무엇에 걸렸는지를 나른다 */
export const status = style({
  flex: '0 0 auto',
  padding: '1px 7px',
  border: `1px solid ${vars.bar.edge}`,
  borderRadius: RADIUS.bar,
  fontSize: TEXT.tiny,
  fontWeight: 700,
  color: vars.status.text,
})

/** 배틀 화면과 같은 색표다 — 두 화면에서 같은 상태가 같은 색이어야 한다 */
export const statusColor: Record<string, string> = {
  psn: vars.status.psn, tox: vars.status.tox, brn: vars.status.brn,
  par: vars.status.par, slp: vars.status.slp, frz: vars.status.frz,
  ko: vars.hp.empty,
}

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

/**
 * 능력 여섯.
 *
 * ⚠️ **막대를 걷어냈다.** 400을 꽉 찬 길이로 잡아 놨는데 5레벨 포켓몬의
 * 능력은 10~20이라, 여섯 줄이 전부 빈 막대로 떴다. 원작 요약 화면도 막대가
 * 아니라 숫자만 적고, 성격이 올리는 쪽을 빨강 내리는 쪽을 파랑으로 물들인다
 */
export const stats = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  columnGap: GAP.loose - 4,
  rowGap: 2,
})

export const statRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: GAP.small,
  fontSize: TEXT.small,
  padding: '2px 0',
  borderBottom: `1px solid ${vars.window.rule}`,
})

/** 성격 보정. 원작과 같은 색이다 — 올리는 쪽 빨강, 내리는 쪽 파랑 */
export const statName = style({
  color: vars.ink.dim,
  selectors: {
    '&[data-nature="up"]': { color: vars.state.bad },
    '&[data-nature="down"]': { color: vars.state.male },
  },
})

export const statValue = style({
  marginLeft: 'auto',
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 700,
  color: vars.ink.strong,
})

export const moveRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: GAP.small + 2,
  padding: `5px ${GAP.small + 2}px`,
  marginBottom: 3,
  borderRadius: RADIUS.bar,
  boxShadow: `inset 0 0 0 1px ${vars.window.rule}`,
  fontSize: TEXT.small,
})

/** 커서가 올라간 기술. 설명이 아래에 뜬다 */
export const moveRowOn = style([moveRow, {
  ...PICKED,
}])

/** 비전머신처럼 **밖에서 쓰는** 기술. 이름 옆에 그 표시가 붙는다 */
export const fieldTag = style({
  flex: '0 0 auto',
  fontSize: TEXT.tiny,
  fontWeight: 800,
  padding: '1px 7px',
  border: `1px solid ${vars.state.good}`,
  borderRadius: RADIUS.bar,
  color: vars.state.good,
})

/**
 * 기술 설명. 롬의 글이 줄 바꿈까지 들고 있어서 그대로 살린다 —
 * `\n`을 지우면 원작이 나눠 놓은 자리가 사라진다
 */
// ⚠️ **테두리를 안 두른다.** 고른 기술이 없을 때 빈 상자 하나가 그대로 남는다 —
// 판을 늘어놓지 않는다는 규칙이 여기서도 같다 (DESIGN.md §5)
export const moveText = style({
  marginTop: GAP.small,
  padding: `${GAP.small}px 2px`,
  minHeight: 76,
  fontSize: TEXT.small,
  lineHeight: 1.5,
  whiteSpace: 'pre-line',
})

/** 자리를 바꾸려고 집어 든 카드 */
export const cardHeld = style({
  outline: `${EDGE.bar}px dashed ${vars.pick.edge}`,
  outlineOffset: -2,
})

export const movePp = style({
  marginLeft: 'auto',
  flex: '0 0 auto',
  fontFamily: vars.font.mono,
  fontVariantNumeric: 'tabular-nums',
  fontSize: TEXT.tiny,
  color: vars.ink.dim,
})

/**
 * 갈래 메뉴 (`GetContextMenuEntriesForPartyMon`).
 *
 * 원작은 오른쪽 아래 구석에 창 하나로 뜬다. 우리는 오른쪽 칸을 통째로 쓰므로
 * 그 자리에 물음과 갈래만 세운다 — 카드 위에 겹쳐 띄우면 무엇을 고르는
 * 중인지 가려진다
 */
export const choices = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  paddingTop: 2,
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
